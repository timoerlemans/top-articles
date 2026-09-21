#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { buildPriorityTagPlan, formatTop100Changes, formatTop10Changes, tagNames, validatePriorityTagPlan } from "./lib/priority-tag-plan.js";
import type { PriorityTagPlan } from "./lib/priority-tag-plan.js";
import { applyPriorityDocumentUpdates } from "./lib/priority-apply.js";
import type { DocumentBatchResult, PriorityJournal, PriorityOperation } from "./lib/priority-apply.js";
import { buildDocumentTagUpdates, BULK_EDIT_BATCH_SIZE } from "./lib/priority-batch.js";
import type { DocumentTagUpdate } from "./lib/priority-batch.js";
import { reconcilePrioritySync } from "./lib/priority-reconcile.js";
import { createReadwiseRequester } from "./lib/readwise-request.js";
import { parseReadwiseDocumentPage } from "./lib/external-schemas.js";
import type { ReadwiseDocument } from "./lib/external-schemas.js";
import type { PriorityOverridesConfig, PriorityJudgmentsConfig } from "./lib/readwise-priority-v8.js";
import { validatePriorityJudgments } from "./lib/priority-judgments.js";
import { validateCoreInterestPriorityConfig } from "./lib/core-interest-priority.js";
import type { CoreInterestPriorityConfig } from "./lib/core-interest-priority.js";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OVERRIDES_FILE = resolve(ROOT, "config/readwise-priority-overrides.json");
const JUDGMENTS_FILE = resolve(ROOT, "config/readwise-priority-judgments.json");
const CORE_INTEREST_FILE = resolve(ROOT, "config/readwise-core-interest-priorities.json");
const RESPONSE_FIELDS = "title,summary,word_count,reading_time,published_date,saved_at,updated_at,category,location,reading_progress,tags,notes";
const LOCATIONS = ["later", "new", "shortlist", "archive", "feed"] as const;
type Location = (typeof LOCATIONS)[number];
const overridesSchema = z.object({
  version: z.literal(1),
  items: z.record(z.string(), z.object({ adjustment: z.number().optional(), reason: z.string().nullable().optional() })),
});
const journalSchema = z.looseObject({
  planHash: z.string(),
  startedAt: z.string(),
  completed: z.array(z.object({ action: z.enum(["add", "remove"]), documentId: z.string(), tag: z.string() })),
  failures: z.array(z.object({ action: z.enum(["add", "remove"]), documentId: z.string(), tag: z.string(), attempt: z.number(), at: z.string(), message: z.string() })),
});
const bulkEditResultSchema = z.looseObject({
  results: z.array(z.looseObject({
    id: z.string(),
    success: z.boolean(),
    error: z.union([z.string(), z.looseObject({}), z.null()]).optional(),
  })),
});
const runReadwise = createReadwiseRequester({ exec: (args) => execFileAsync("readwise", args) });
const runReadwiseMutation = createReadwiseRequester({ exec: (args) => execFileAsync("readwise", args), retries: 0 });

function option(name: string, fallback: string | null = null): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function renderProgressBar(current: number, total: number, width = 30): void {
  const filled = Math.round((current / total) * width);
  const bar = "#".repeat(filled) + "-".repeat(width - filled);
  const pct = Math.round((current / total) * 100);
  process.stdout.write(`\r[${bar}] ${current}/${total} (${pct}%)`);
}

function operationKey(operation: PriorityOperation): string {
  return JSON.stringify([operation.action, operation.documentId, operation.tag]);
}

function journalForPendingOperations(journal: PriorityJournal, operations: readonly PriorityOperation[]): PriorityJournal {
  const pending = new Set(operations.map(operationKey));
  return {
    ...journal,
    completed: journal.completed.filter((operation) => !pending.has(operationKey(operation))),
    failures: [...(journal.failures ?? [])],
    ...(journal.bulkFailures ? { bulkFailures: [...journal.bulkFailures] } : {}),
  };
}

async function fetchLocation(location: Location): Promise<ReadwiseDocument[]> {
  const documents: ReadwiseDocument[] = [];
  let cursor = null;
  do {
    const args = ["reader-list-documents", "--location", location, "--limit", "100", "--response-fields", RESPONSE_FIELDS, "--json"];
    if (cursor) {
      args.push("--page-cursor", cursor);
    }
    const { stdout } = await runReadwise(args);
    const page = parseReadwiseDocumentPage(JSON.parse(stdout));
    documents.push(...page.documents);
    cursor = page.nextPageCursor;
  } while (cursor);
  return documents;
}

async function fetchLibrary({ cleanupAll = false }: { cleanupAll?: boolean } = {}): Promise<{ later: ReadwiseDocument[]; outside: ReadwiseDocument[] }> {
  const byLocation: Partial<Record<Location, ReadwiseDocument[]>> = {};
  const locations: readonly Location[] = cleanupAll ? LOCATIONS : ["later"];
  for (const location of locations) {
    byLocation[location] = await fetchLocation(location);
  }
  const later = byLocation.later ?? [];
  const outside = [
    ...locations.filter((location) => location !== "later").flatMap((location) => byLocation[location] ?? []),
  ];
  return { later, outside };
}

async function loadOverrides(): Promise<PriorityOverridesConfig> {
  const path = option("--overrides", OVERRIDES_FILE);
  if (!path) {
    throw new Error("Pad naar scorecorrecties ontbreekt");
  }
  return overridesSchema.parse(JSON.parse(await readFile(resolve(path), "utf8")));
}

async function loadJudgments(): Promise<PriorityJudgmentsConfig> {
  const value: unknown = JSON.parse(await readFile(JUDGMENTS_FILE, "utf8"));
  if (!validatePriorityJudgments(value)) {
    throw new Error("Ongeldige config/readwise-priority-judgments.json");
  }
  return value;
}

async function loadCoreInterestConfig(): Promise<CoreInterestPriorityConfig> {
  const value: unknown = JSON.parse(await readFile(CORE_INTEREST_FILE, "utf8"));
  if (!validateCoreInterestPriorityConfig(value)) {
    throw new Error("Ongeldige config/readwise-core-interest-priorities.json");
  }
  return value;
}

async function createPlan(
  generatedAt: string | undefined,
  { cleanupAll = false }: { cleanupAll?: boolean } = {},
): Promise<{ plan: PriorityTagPlan; documents: ReadwiseDocument[] }> {
  const [{ later, outside }, overrides, judgments, coreInterestConfig] = await Promise.all([fetchLibrary({ cleanupAll }), loadOverrides(), loadJudgments(), loadCoreInterestConfig()]);
  return {
    plan: buildPriorityTagPlan(later, outside, { generatedAt, overrides, judgments, coreInterestConfig, cleanupAll }),
    documents: [...later, ...outside],
  };
}

async function writeJson(path: string, value: unknown): Promise<string> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

async function readJsonIfExists(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function planCommand() {
  const output = option("--output", ".tmp/readwise/priority-plan.json");
  if (!output) {
    throw new Error("Uitvoerpad ontbreekt");
  }
  const cleanupAll = process.argv.includes("--cleanup-all");
  const { plan } = await createPlan(undefined, { cleanupAll });
  const path = await writeJson(output, plan);
  console.log(`Proefrun: ${plan.summary.documents} documenten, ${plan.summary.additions} toevoegingen, ${plan.summary.removals} verwijderingen.`);
  console.log(formatTop10Changes(plan));
  console.log(formatTop100Changes(plan));
  console.log(`Plan: ${path}`);
  console.log(`Bevestigingshash: ${plan.planHash}`);
}

async function bulkEditTags(batch: readonly DocumentTagUpdate[]): Promise<DocumentBatchResult[]> {
  const payload = batch.map((update) => ({ document_id: update.documentId, tags: update.tags ?? [] }));
  const { stdout } = await runReadwiseMutation(["reader-bulk-edit-document-metadata", "--documents", JSON.stringify(payload), "--json"]);
  const { results } = bulkEditResultSchema.parse(JSON.parse(stdout));
  return results.map((result) => ({
    documentId: result.id,
    success: result.success,
    message: typeof result.error === "string" ? result.error : result.error ? JSON.stringify(result.error) : undefined,
  }));
}

async function applyCommand() {
  const planPath = option("--plan");
  const confirmation = option("--confirm");
  if (!planPath || !confirmation) {throw new Error("Gebruik priority:apply met --plan <bestand> --confirm <plan-hash>");}
  const candidate: unknown = JSON.parse(await readFile(resolve(planPath), "utf8"));
  if (!validatePriorityTagPlan(candidate)) {
    throw new Error("Ongeldig prioriteitsplan");
  }
  const plan = candidate;
  if (confirmation !== plan.planHash) {throw new Error("Bevestigingshash komt niet overeen met het plan");}

  const { plan: livePlan, documents } = await createPlan(plan.generatedAt, { cleanupAll: plan.scope === "all-locations" });
  if (livePlan.sourceFingerprint !== plan.sourceFingerprint) {throw new Error("Readwise of de scorecorrecties zijn gewijzigd; maak een nieuwe proefrun");}

  const journalPath = option("--journal", ".tmp/readwise/priority-apply-journal.json");
  if (!journalPath) {
    throw new Error("Journalpad ontbreekt");
  }
  const previousJournal = await readJsonIfExists(journalPath);
  const parsedJournal = previousJournal ? journalSchema.safeParse(previousJournal) : undefined;
  const journal: PriorityJournal = parsedJournal?.success && parsedJournal.data.planHash === plan.planHash
    ? parsedJournal.data
    : { planHash: plan.planHash, startedAt: new Date().toISOString(), completed: [], failures: [] };
  const initialOperations = livePlan.operations.length;
  const finalSnapshot = await reconcilePrioritySync({
    initial: { plan: livePlan, documents, operations: livePlan.operations },
    apply: async (snapshot, attempt) => {
      const currentTags = new Map(snapshot.documents.map((doc) => [doc.id, tagNames(doc)]));
      const updates = buildDocumentTagUpdates(snapshot.operations, currentTags);
      console.log(
        `${attempt === 0 ? "Uitvoeren" : `Herstelronde ${String(attempt)}`}: ` +
        `${String(snapshot.operations.length)} tagoperaties op ${String(updates.length)} documenten ` +
        `via ~${String(Math.ceil(updates.length / BULK_EDIT_BATCH_SIZE))} bulk-calls.`,
      );
      const roundJournal = journalForPendingOperations(journal, snapshot.operations);
      await applyPriorityDocumentUpdates({
        updates,
        journal: roundJournal,
        executeBatch: bulkEditTags,
        executeDocument: async (update) => {
          if (update.remove.length > 0) {
            await runReadwiseMutation(["reader-remove-tags-from-document", "--document-id", update.documentId, "--tag-names", update.remove.join(",")]);
          }
          if (update.add.length > 0) {
            await runReadwiseMutation(["reader-add-tags-to-document", "--document-id", update.documentId, "--tag-names", update.add.join(",")]);
          }
        },
        writeJournal: async (nextJournal) => {
          await writeJson(journalPath, nextJournal);
          renderProgressBar(nextJournal.completed.length, initialOperations);
        },
      });
      Object.assign(journal, roundJournal);
      process.stdout.write("\n");
    },
    verify: async () => {
      const next = await createPlan(plan.generatedAt, { cleanupAll: plan.scope === "all-locations" });
      if (next.plan.sourceFingerprint !== livePlan.sourceFingerprint) {
        throw new Error("Readwise of de scorecorrecties zijn tijdens de synchronisatie gewijzigd; maak een nieuwe proefrun");
      }
      return { ...next, operations: next.plan.operations };
    },
  });
  if (finalSnapshot.operations.length !== 0) {throw new Error(`Live verificatie vond nog ${finalSnapshot.operations.length} tagoperaties`);}
  journal.completedAt = new Date().toISOString();
  journal.verified = true;
  await writeJson(journalPath, journal);
  console.log(`Synchronisatie geverifieerd: ${journal.completed.length} tagoperaties toegepast.`);
}

async function verifyCommand() {
  const { plan } = await createPlan(undefined, { cleanupAll: process.argv.includes("--cleanup-all") });
  if (plan.operations.length > 0) {throw new Error(`Readwise wijkt af: ${plan.operations.length} tagoperaties nodig. Draai priority:plan.`);}
  console.log("Readwise-reeksen en toplijsttags zijn volledig gesynchroniseerd.");
}

async function main() {
  const command = process.argv[2];
  if (command === "plan") {return planCommand();}
  if (command === "apply") {return applyCommand();}
  if (command === "verify") {return verifyCommand();}
  throw new Error("Gebruik: priority-cli.js <plan|apply|verify>");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Priority-CLI mislukt: ${message}`);
  process.exitCode = 1;
});
