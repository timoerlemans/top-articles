#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";

import {
  assertPreferredAuthorTagPlanFresh,
  buildPreferredAuthorTagPlan,
  validatePreferredAuthorTagPlan,
  type PreferredAuthorTagPlan,
} from "./lib/preferred-author-plan.js";
import { createMaintenanceRoute, MAINTENANCE_STAGE_ORDER } from "./lib/readwise-maintenance.js";
import type {
  MaintenanceConfirmations,
  MaintenanceStageAdapter,
  MaintenanceStageName,
  MaintenanceStagePlan,
  MaintenanceReport,
} from "./lib/readwise-maintenance.js";
import { createReadwiseRequester } from "./lib/readwise-request.js";
import { fetchReadwiseDocuments } from "./lib/readwise-documents.js";
import { completeReaderTagSet } from "./lib/reader-tag-set.js";
import { buildDocumentTagUpdates } from "./lib/priority-batch.js";
import type { DocumentTagUpdate } from "./lib/priority-batch.js";
import { applyPriorityDocumentUpdates } from "./lib/priority-apply.js";
import type { DocumentBatchResult, PriorityJournal } from "./lib/priority-apply.js";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLAN = ".tmp/readwise/maintenance-plan.json";
const DEFAULT_REPORT = ".tmp/readwise/maintenance-report.json";
const AUTHOR_PLAN = ".tmp/readwise/preferred-author-plan.json";
const AUTHOR_JOURNAL = ".tmp/readwise/preferred-author-journal.json";
const PRIORITY_PLAN = ".tmp/readwise/priority-plan.json";
const PRIORITY_JOURNAL = ".tmp/readwise/priority-apply-journal.json";
const ARCHIVE_PLAN = ".tmp/readwise/archive-plan.json";
const ARCHIVE_JOURNAL = ".tmp/readwise/archive-journal.json";
const CLEANUP_PLAN = ".tmp/readwise/archive-cleanup-plan.json";
const CLEANUP_JOURNAL = ".tmp/readwise/archive-cleanup-journal.json";

const bulkResultSchema = z.looseObject({
  results: z.array(z.looseObject({
    id: z.string(),
    success: z.boolean(),
    error: z.unknown().optional(),
  })),
});

const runReadwise = createReadwiseRequester({
  exec: (args) => execFileAsync("readwise", args, { maxBuffer: 64 * 1024 * 1024 }),
});
const runReadwiseMutation = createReadwiseRequester({
  exec: (args) => execFileAsync("readwise", args, { maxBuffer: 64 * 1024 * 1024 }),
  retries: 0,
});

function option(name: string, fallback: string | null = null): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function options(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) { values.push(process.argv[index + 1] as string); }
  }
  return values;
}

export function parseMaintenanceConfirmations(values: readonly string[]): MaintenanceConfirmations {
  const confirmations: MaintenanceConfirmations = {};
  for (const value of values.flatMap((entry) => entry.split(","))) {
    const separator = value.indexOf("=");
    if (separator <= 0 || separator === value.length - 1) {
      throw new Error("Gebruik --confirm <stap>=<planhash>; meerdere bevestigingen mogen met komma's");
    }
    const stage = value.slice(0, separator) as MaintenanceStageName;
    if (!MAINTENANCE_STAGE_ORDER.includes(stage)) { throw new Error(`Onbekende onderhoudsstap: ${stage}`); }
    confirmations[stage] = value.slice(separator + 1);
  }
  return confirmations;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

async function writeJson(path: string, value: unknown): Promise<string> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

async function readJsonIfExists(path: string): Promise<unknown> {
  try { return await readJson(path); }
  catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") { return null; }
    throw error;
  }
}

async function readTagJournal(path: string): Promise<PriorityJournal> {
  const value = await readJsonIfExists(path);
  if (value === null) { return { completed: [], failures: [] }; }
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray((value as { completed?: unknown }).completed)) {
    throw new Error(`Ongeldig tagjournal: ${path}`);
  }
  return value as PriorityJournal;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function bulkEditTags(batch: readonly DocumentTagUpdate[]): Promise<DocumentBatchResult[]> {
  if (batch.some((update) => update.tags === null)) { throw new Error("Bulk tagvervanging vereist volledige actuele tagkennis"); }
  const payload = batch.map((update) => ({ document_id: update.documentId, tags: update.tags }));
  const { stdout } = await runReadwiseMutation(["reader-bulk-edit-document-metadata", "--documents", JSON.stringify(payload), "--json"]);
  const response = bulkResultSchema.parse(JSON.parse(stdout));
  return response.results.map((result) => ({
    documentId: result.id,
    success: result.success,
    message: typeof result.error === "string" ? result.error : result.error === undefined ? undefined : JSON.stringify(result.error),
  }));
}

async function executeTagUpdate(update: DocumentTagUpdate): Promise<void> {
  if (update.remove.length > 0) {
    await runReadwiseMutation(["reader-remove-tags-from-document", "--document-id", update.documentId, "--tag-names", update.remove.join(",")]);
  }
  if (update.add.length > 0) {
    await runReadwiseMutation(["reader-add-tags-to-document", "--document-id", update.documentId, "--tag-names", update.add.join(",")]);
  }
}

function stageFromJson(
  stage: Exclude<MaintenanceStageName, "authors" | "build">,
  value: unknown,
  path: string,
  mutations: number,
): MaintenanceStagePlan {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as { planHash?: unknown }).planHash !== "string") {
    throw new Error(`Ongeldig ${stage}-plan in ${path}`);
  }
  const plan = value as Record<string, unknown>;
  return {
    stage,
    planHash: plan.planHash as string,
    mutations: mutations > 0,
    summary: typeof plan.summary === "object" && plan.summary !== null && !Array.isArray(plan.summary) ? plan.summary as Record<string, number> : { operations: mutations },
    details: plan,
  };
}

async function runScript(script: string, args: readonly string[]): Promise<{ stdout: string }> {
  return execFileAsync(process.execPath, [resolve(SCRIPT_DIR, script), ...args], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

function commandStage(
  stage: Exclude<MaintenanceStageName, "authors" | "build">,
  planPath: string,
  planArgs: readonly string[],
  applyArgs: (planHash: string) => readonly string[],
  verifyArgs: readonly string[],
  mutationsFrom: (plan: Record<string, unknown>) => number,
): MaintenanceStageAdapter {
  return {
    plan: async () => {
      await runScript(stage === "priority" ? "priority-cli.js" : stage === "archive" ? "archive-cli.js" : "archive-cleanup-cli.js", planArgs);
      const value = await readJson(planPath);
      if (!value || typeof value !== "object" || Array.isArray(value)) { throw new Error(`Ongeldig ${stage}-plan`); }
      return stageFromJson(stage, value, planPath, mutationsFrom(value as Record<string, unknown>));
    },
    apply: async (plan) => {
      await runScript(stage === "priority" ? "priority-cli.js" : stage === "archive" ? "archive-cli.js" : "archive-cleanup-cli.js", applyArgs(plan.planHash));
      return { ok: true, summary: plan.summary };
    },
    verify: async (plan) => {
      await runScript(stage === "priority" ? "priority-cli.js" : stage === "archive" ? "archive-cli.js" : "archive-cleanup-cli.js", verifyArgs);
      return { ok: true, summary: { verified: 1, operations: plan.summary.operations ?? 0 } };
    },
  };
}

function authorStage(): MaintenanceStageAdapter {
  async function plan(): Promise<{ plan: PreferredAuthorTagPlan; stage: MaintenanceStagePlan }> {
    const documents = await fetchReadwiseDocuments(runReadwise, { profile: "maintenance", location: "later" });
    const authorPlan = buildPreferredAuthorTagPlan(documents);
    await writeJson(AUTHOR_PLAN, authorPlan);
    return {
      plan: authorPlan,
      stage: {
        stage: "authors",
        planHash: authorPlan.planHash,
        mutations: authorPlan.operations.length > 0,
        summary: authorPlan.summary,
        details: authorPlan,
      },
    };
  }
  return {
    plan: async () => (await plan()).stage,
    apply: async (stage) => {
      const value = stage.details;
      if (!validatePreferredAuthorTagPlan(value)) { throw new Error("Ongeldig auteurstagplan in maintenance-manifest"); }
      const documents = await fetchReadwiseDocuments(runReadwise, { profile: "maintenance", location: "later" });
      assertPreferredAuthorTagPlanFresh(value, documents);
      const currentTags = new Map(documents.flatMap((doc) => {
        const tags = completeReaderTagSet(doc.tags);
        return tags === null ? [] : [[doc.id, tags] as const];
      }));
      const updates = buildDocumentTagUpdates(value.operations, currentTags);
      const journalPath = AUTHOR_JOURNAL;
      const journal = await readTagJournal(journalPath);
      const result = await applyPriorityDocumentUpdates({
        updates,
        journal,
        executeBatch: bulkEditTags,
        executeDocument: executeTagUpdate,
        writeJournal: (next) => writeJson(journalPath, next).then(() => undefined),
      });
      return { ok: true, summary: { operations: result.completed.length, additions: value.operations.length } };
    },
    verify: async (stage) => {
      if (!validatePreferredAuthorTagPlan(stage.details)) { return { ok: false, summary: stage.summary, message: "Ongeldig auteurstagplan" }; }
      const documents = await fetchReadwiseDocuments(runReadwise, { profile: "maintenance", location: "later" });
      const current = buildPreferredAuthorTagPlan(documents, { generatedAt: stage.details.generatedAt });
      const ok = current.operations.length === 0 && current.summary.incomplete === 0;
      return { ok, summary: current.summary, ...(ok ? {} : { message: "Niet alle betrouwbare voorkeursauteurs hebben want-to-read" }) };
    },
  };
}

function buildStage(): MaintenanceStageAdapter {
  const planHash = createHash("sha256").update("top-articles-build-data-v1").digest("hex");
  return {
    plan: () => Promise.resolve({ stage: "build", planHash, mutations: false, run: true, confirmationRequired: false, summary: { builds: 1 } }),
    apply: async () => {
      await runScript("build-data.js", []);
      return { ok: true, summary: { builds: 1 } };
    },
    verify: async () => {
      const [data, score] = await Promise.all([readFile(resolve(ROOT, "data/data.js"), "utf8"), readFile(resolve(ROOT, "data/score.js"), "utf8")]);
      const generated = (value: string): string | null => /"generatedAt"\s*:\s*"([^"]+)"/.exec(value)?.[1] ?? null;
      const dataAt = generated(data);
      const scoreAt = generated(score);
      return { ok: dataAt !== null && dataAt === scoreAt, summary: { files: 2 }, ...(dataAt === scoreAt && dataAt !== null ? {} : { message: "data/data.js en data/score.js hebben geen gelijke generatedAt" }) };
    },
  };
}

function createStages(): Record<MaintenanceStageName, MaintenanceStageAdapter> {
  return {
    authors: authorStage(),
    priority: commandStage("priority", PRIORITY_PLAN, ["plan", "--output", PRIORITY_PLAN], (hash) => ["apply", "--plan", PRIORITY_PLAN, "--confirm", hash, "--journal", PRIORITY_JOURNAL], ["verify"], (plan) => Number((plan.summary as { operations?: unknown } | undefined)?.operations ?? 0)),
    archive: commandStage("archive", ARCHIVE_PLAN, ["plan", "--output", ARCHIVE_PLAN], (hash) => ["apply", "--plan", ARCHIVE_PLAN, "--confirm", hash, "--journal", ARCHIVE_JOURNAL], ["verify", "--plan", ARCHIVE_PLAN], (plan) => Number((plan.summary as { candidates?: unknown } | undefined)?.candidates ?? 0)),
    cleanup: commandStage("cleanup", CLEANUP_PLAN, ["plan", "--output", CLEANUP_PLAN], (hash) => ["apply", "--plan", CLEANUP_PLAN, "--confirm", hash, "--journal", CLEANUP_JOURNAL], ["verify"], (plan) => Number((plan.summary as { operations?: unknown } | undefined)?.operations ?? 0)),
    build: buildStage(),
  };
}

function routeReport(value: MaintenanceReport): string {
  const lines = [`Status: ${value.status}`];
  for (const stage of value.stages) {
    lines.push(`${stage.stage}: ${stage.status} (${stage.planHash}) ${JSON.stringify(stage.summary)}`);
    if (stage.message) { lines.push(`  ${stage.message}`); }
  }
  if (value.next) { lines.push(`Volgende bevestiging: ${value.next.stage}=${value.next.planHash}`); }
  return lines.join("\n");
}

async function planCommand(): Promise<void> {
  const output = option("--output", DEFAULT_PLAN);
  if (!output) { throw new Error("Uitvoerpad ontbreekt"); }
  const plan = await createMaintenanceRoute(createStages()).plan();
  await writeJson(output, { version: 1, stages: plan.stages });
  console.log("Lokale Readwise-maintenance is read-only voorbereid:");
  for (const stage of plan.stages) { console.log(`- ${stage.stage}: ${stage.planHash} — ${JSON.stringify(stage.summary)}`); }
  console.log(`Plan: ${resolve(output)}`);
}

async function applyCommand(): Promise<void> {
  const manifest = option("--plan", DEFAULT_PLAN);
  if (!manifest) { throw new Error("Planpad ontbreekt"); }
  const manifestValue = await readJson(manifest);
  if (!manifestValue || typeof manifestValue !== "object" || Array.isArray(manifestValue) || !Array.isArray((manifestValue as { stages?: unknown }).stages)) {
    throw new Error("Ongeldig maintenance-plan");
  }
  const confirmations = parseMaintenanceConfirmations(options("--confirm"));
  const report = await createMaintenanceRoute(createStages()).apply(confirmations, { stages: (manifestValue as { stages: MaintenanceStagePlan[] }).stages });
  const reportPath = option("--report", DEFAULT_REPORT);
  if (!reportPath) { throw new Error("Rapportpad ontbreekt"); }
  await writeJson(reportPath, report);
  console.log(routeReport(report));
  if (report.status === "failed") { throw new Error("Lokale maintenance-keten gestopt; downstreamstappen zijn niet uitgevoerd"); }
  if (report.status === "awaiting-confirmation") {
    const refreshed = await createMaintenanceRoute(createStages()).plan();
    await writeJson(manifest, { version: 1, stages: refreshed.stages });
  }
}

async function verifyCommand(): Promise<void> {
  const manifest = option("--plan", DEFAULT_PLAN);
  if (!manifest) { throw new Error("Planpad ontbreekt"); }
  await readJson(manifest);
  const report = await createMaintenanceRoute(createStages()).verify();
  const reportPath = option("--report", DEFAULT_REPORT);
  if (!reportPath) { throw new Error("Rapportpad ontbreekt"); }
  await writeJson(reportPath, report);
  console.log(routeReport(report));
  if (report.status !== "verified") { throw new Error("Lokale maintenance-verificatie is niet geslaagd"); }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "plan" || command === "inspect") { return planCommand(); }
  if (command === "apply") { return applyCommand(); }
  if (command === "verify") { return verifyCommand(); }
  throw new Error("Gebruik: readwise-priority-sync.js <plan|apply|verify>");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`Lokale Readwise-maintenance mislukt: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
