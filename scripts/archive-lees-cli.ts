#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  applyArchivePlan,
  type ArchiveJournal,
  type ArchiveMoveResult,
} from "./lib/archive-apply.js";
import {
  assertLeesArchivePlanFresh,
  buildLeesArchivePlan,
  validateLeesArchivePlan,
  verifyLeesArchivePostcondition,
  type LeesArchivePlan,
} from "./lib/archive-lees-plan.js";
import { createReadwiseRequester } from "./lib/readwise-request.js";
import { parseReadwiseDocumentPage } from "./lib/external-schemas.js";
import type { ReadwiseDocument } from "./lib/external-schemas.js";
import type { PriorityJudgmentsConfig, PriorityOverridesConfig } from "./lib/readwise-priority-v8.js";
import { validatePriorityJudgments } from "./lib/priority-judgments.js";
import { validateCoreInterestPriorityConfig } from "./lib/core-interest-priority.js";
import type { CoreInterestPriorityConfig } from "./lib/core-interest-priority.js";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OVERRIDES_FILE = resolve(ROOT, "config/readwise-priority-overrides.json");
const JUDGMENTS_FILE = resolve(ROOT, "config/readwise-priority-judgments.json");
const CORE_INTEREST_FILE = resolve(ROOT, "config/readwise-core-interest-priorities.json");
const DEFAULT_PLAN = ".tmp/readwise/archive-lees-plan.json";
const DEFAULT_JOURNAL = ".tmp/readwise/archive-lees-journal.json";
const RESPONSE_FIELDS = "title,author,summary,word_count,reading_time,published_date,saved_at,updated_at,category,location,reading_progress,tags,notes";

const overridesSchema = z.object({
  version: z.literal(1),
  items: z.record(z.string(), z.object({
    adjustment: z.number().optional(),
    reason: z.string().nullable().optional(),
  })),
});
const journalSchema = z.looseObject({
  planHash: z.string(),
  startedAt: z.string(),
  completed: z.array(z.string()),
  failures: z.array(z.object({
    documentId: z.string(),
    attempt: z.number(),
    at: z.string(),
    message: z.string(),
  })),
});
const moveResponseSchema = z.looseObject({
  results: z.array(z.looseObject({
    id: z.string(),
    success: z.boolean(),
    error: z.union([z.string(), z.looseObject({}), z.null()]).optional(),
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

async function fetchLater(): Promise<ReadwiseDocument[]> {
  const documents: ReadwiseDocument[] = [];
  let cursor: string | null = null;
  do {
    const args = ["reader-list-documents", "--location", "later", "--limit", "100", "--response-fields", RESPONSE_FIELDS, "--json"];
    if (cursor) { args.push("--page-cursor", cursor); }
    const { stdout } = await runReadwise(args);
    const page = parseReadwiseDocumentPage(JSON.parse(stdout));
    documents.push(...page.documents);
    cursor = page.nextPageCursor;
  } while (cursor);
  return documents;
}

async function loadOverrides(): Promise<PriorityOverridesConfig> {
  const path = option("--overrides", OVERRIDES_FILE);
  if (!path) { throw new Error("Pad naar scorecorrecties ontbreekt"); }
  return overridesSchema.parse(JSON.parse(await readFile(resolve(path), "utf8")));
}

async function loadJudgments(): Promise<PriorityJudgmentsConfig> {
  const value: unknown = JSON.parse(await readFile(JUDGMENTS_FILE, "utf8"));
  if (!validatePriorityJudgments(value)) { throw new Error("Ongeldige config/readwise-priority-judgments.json"); }
  return value;
}

async function loadCoreInterestConfig(): Promise<CoreInterestPriorityConfig> {
  const value: unknown = JSON.parse(await readFile(CORE_INTEREST_FILE, "utf8"));
  if (!validateCoreInterestPriorityConfig(value)) { throw new Error("Ongeldige config/readwise-core-interest-priorities.json"); }
  return value;
}

async function writeJson(path: string, value: unknown): Promise<string> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

async function readPlan(path: string): Promise<LeesArchivePlan> {
  const candidate: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
  if (!validateLeesArchivePlan(candidate)) { throw new Error("Ongeldig lees-archiveplan"); }
  return candidate;
}

async function readJournal(path: string, planHash: string): Promise<ArchiveJournal> {
  try {
    const parsed = journalSchema.parse(JSON.parse(await readFile(resolve(path), "utf8")));
    if (parsed.planHash !== planHash) {
      return { planHash, startedAt: new Date().toISOString(), completed: [], failures: [] };
    }
    return parsed;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return { planHash, startedAt: new Date().toISOString(), completed: [], failures: [] };
    }
    throw error;
  }
}

async function moveDocuments(documentIds: readonly string[]): Promise<readonly ArchiveMoveResult[]> {
  const { stdout } = await runReadwiseMutation([
    "reader-move-documents",
    "--document-ids",
    documentIds.join(","),
    "--location",
    "archive",
    "--json",
  ]);
  const response = moveResponseSchema.parse(JSON.parse(stdout));
  return response.results.map((result) => ({
    documentId: result.id,
    success: result.success,
    message: typeof result.error === "string" ? result.error : result.error ? JSON.stringify(result.error) : undefined,
  }));
}

async function createPlan(generatedAt?: string): Promise<{
  plan: LeesArchivePlan;
  documents: ReadwiseDocument[];
  overrides: PriorityOverridesConfig;
  judgments: PriorityJudgmentsConfig;
  coreInterestConfig: CoreInterestPriorityConfig;
}> {
  const [documents, overrides, judgments, coreInterestConfig] = await Promise.all([
    fetchLater(),
    loadOverrides(),
    loadJudgments(),
    loadCoreInterestConfig(),
  ]);
  const plan = buildLeesArchivePlan(documents, overrides, { generatedAt, judgments, coreInterestConfig });
  return { plan, documents, overrides, judgments, coreInterestConfig };
}

function printPlan(plan: LeesArchivePlan, path: string): void {
  console.log(
    `Proefrun: ${String(plan.summary.documents)} later-documenten, ` +
    `${String(plan.summary.leesTagged)} met lees-tag, ` +
    `${String(plan.summary.protected)} beschermd, ` +
    `${String(plan.summary.candidates)} archiefkandidaten, ` +
    `${String(plan.summary.excluded)} uitgesloten.`,
  );
  console.log(`Beschermd door huidige tags: ${String(plan.summary.protectedByCurrentTags)}.`);
  console.log(`Beschermd door berekende top-100: ${String(plan.summary.protectedByComputedRanking)}.`);
  console.log(`Plan: ${path}`);
  console.log(`Bevestigingshash: ${plan.planHash}`);
}

async function planCommand(): Promise<void> {
  const output = option("--output", DEFAULT_PLAN);
  if (!output) { throw new Error("Uitvoerpad ontbreekt"); }
  const { plan } = await createPlan();
  const path = await writeJson(output, plan);
  printPlan(plan, path);
}

async function applyCommand(): Promise<void> {
  const planPath = option("--plan", DEFAULT_PLAN);
  const confirmation = option("--confirm");
  if (!planPath || !confirmation) { throw new Error("Gebruik archive:lees:apply met --plan <bestand> --confirm <plan-hash>"); }
  const plan = await readPlan(planPath);
  if (confirmation !== plan.planHash) { throw new Error("Bevestigingshash komt niet overeen met het lees-archiveplan"); }
  const live = await createPlan(plan.generatedAt);
  const journalPath = option("--journal", DEFAULT_JOURNAL);
  if (!journalPath) { throw new Error("Journalpad ontbreekt"); }
  const journal = await readJournal(journalPath, plan.planHash);
  const result = await applyArchivePlan({
    plan,
    currentDocuments: live.documents,
    overrides: live.overrides,
    judgments: live.judgments,
    coreInterestConfig: live.coreInterestConfig,
    journal,
    assertFresh: () => {
      assertLeesArchivePlanFresh(plan, live.documents, live.overrides, live.judgments, live.coreInterestConfig);
    },
    moveDocuments,
    writeJournal: async (next) => { await writeJson(journalPath, next); },
  });
  const verification = await createPlan(plan.generatedAt);
  verifyLeesArchivePostcondition(plan, verification.documents, verification.overrides, verification.judgments, verification.coreInterestConfig);
  result.verified = true;
  await writeJson(journalPath, result);
  console.log(`Lees-archivering geverifieerd: ${String(result.completed.length)} documenten verplaatst.`);
}

async function verifyCommand(): Promise<void> {
  const planPath = option("--plan", DEFAULT_PLAN);
  if (!planPath) { throw new Error("Gebruik archive:lees:verify met --plan <bestand>"); }
  const plan = await readPlan(planPath);
  const current = await createPlan(plan.generatedAt);
  verifyLeesArchivePostcondition(plan, current.documents, current.overrides, current.judgments, current.coreInterestConfig);
  console.log("Lees-archiveplan live geverifieerd: alle kandidaten zijn gearchiveerd en beschermde top-100-documenten staan nog in later.");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "plan") { return planCommand(); }
  if (command === "apply") { return applyCommand(); }
  if (command === "verify") { return verifyCommand(); }
  throw new Error("Gebruik: archive-lees-cli.js <plan|apply|verify>");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Lees-archive-CLI mislukt: ${message}`);
  process.exitCode = 1;
});
