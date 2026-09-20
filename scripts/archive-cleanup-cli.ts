#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import {
  ARCHIVE_CLEANUP_MODEL,
  assertArchiveCleanupPlanFresh,
  buildArchiveCleanupPlan,
  validateArchiveCleanupPlan,
  type ArchiveCleanupPlan,
} from "./lib/archive-cleanup.js";
import { applyPriorityDocumentUpdates } from "./lib/priority-apply.js";
import type { DocumentBatchResult, PriorityJournal } from "./lib/priority-apply.js";
import { buildDocumentTagUpdates, BULK_EDIT_BATCH_SIZE } from "./lib/priority-batch.js";
import type { DocumentTagUpdate } from "./lib/priority-batch.js";
import { createReadwiseRequester } from "./lib/readwise-request.js";
import { parseReadwiseDocumentPage } from "./lib/external-schemas.js";
import type { ReadwiseDocument } from "./lib/external-schemas.js";
import { tagNames } from "./lib/priority-tag-plan.js";

const execFileAsync = promisify(execFile);
const DEFAULT_PLAN = ".tmp/readwise/archive-cleanup-plan.json";
const DEFAULT_JOURNAL = ".tmp/readwise/archive-cleanup-journal.json";
const RESPONSE_FIELDS = "title,saved_at,category,location,tags";
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

async function fetchArchive(): Promise<ReadwiseDocument[]> {
  const documents: ReadwiseDocument[] = [];
  let cursor: string | null = null;
  do {
    const args = ["reader-list-documents", "--location", "archive", "--limit", "100", "--response-fields", RESPONSE_FIELDS, "--json"];
    if (cursor) {args.push("--page-cursor", cursor);}
    const { stdout } = await runReadwise(args);
    const page = parseReadwiseDocumentPage(JSON.parse(stdout));
    documents.push(...page.documents);
    cursor = page.nextPageCursor;
  } while (cursor);
  return documents;
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

async function readPlan(path: string): Promise<ArchiveCleanupPlan> {
  const candidate: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
  if (!validateArchiveCleanupPlan(candidate)) {throw new Error("Ongeldig archive-cleanup-plan");}
  return candidate;
}

async function readJournal(path: string, planHash: string): Promise<PriorityJournal> {
  const value = await readJsonIfExists(path);
  if (!value) {
    return { planHash, startedAt: new Date().toISOString(), completed: [], failures: [] };
  }
  const parsed = journalSchema.parse(value);
  if (parsed.planHash !== planHash) {
    return { planHash, startedAt: new Date().toISOString(), completed: [], failures: [] };
  }
  return parsed;
}

async function createPlan(generatedAt?: string): Promise<{ plan: ArchiveCleanupPlan; documents: ReadwiseDocument[] }> {
  const documents = await fetchArchive();
  const plan = generatedAt === undefined
    ? buildArchiveCleanupPlan(documents)
    : buildArchiveCleanupPlan(documents, { generatedAt });
  return { plan, documents };
}

function renderProgressBar(current: number, total: number, width = 30): void {
  if (total === 0) {return;}
  const filled = Math.round((current / total) * width);
  const bar = "#".repeat(filled) + "-".repeat(width - filled);
  const pct = Math.round((current / total) * 100);
  process.stdout.write(`\r[${bar}] ${current}/${total} (${pct}%)`);
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

function printPlan(plan: ArchiveCleanupPlan, path: string): void {
  console.log(`Proefrun: ${String(plan.summary.documents)} archiefdocumenten, ${String(plan.summary.changedDocuments)} documenten met cleanup, ${String(plan.summary.removals)} verwijderingen.`);
  console.log(`Plan: ${path}`);
  console.log(`Model: ${ARCHIVE_CLEANUP_MODEL}`);
  console.log(`Bevestigingshash: ${plan.planHash}`);
}

async function planCommand(): Promise<void> {
  const output = option("--output", DEFAULT_PLAN);
  if (!output) {throw new Error("Uitvoerpad ontbreekt");}
  const { plan } = await createPlan();
  const path = await writeJson(output, plan);
  printPlan(plan, path);
}

async function applyCommand(): Promise<void> {
  const planPath = option("--plan");
  const confirmation = option("--confirm");
  if (!planPath || !confirmation) {throw new Error("Gebruik archive:cleanup:apply met --plan <bestand> --confirm <plan-hash>");}
  const plan = await readPlan(planPath);
  if (confirmation !== plan.planHash) {throw new Error("Bevestigingshash komt niet overeen met het archive-cleanup-plan");}

  const { plan: livePlan, documents } = await createPlan(plan.generatedAt);
  assertArchiveCleanupPlanFresh(plan, documents);
  const journalPath = option("--journal", DEFAULT_JOURNAL);
  if (!journalPath) {throw new Error("Journalpad ontbreekt");}
  const journal = await readJournal(journalPath, plan.planHash);
  const currentTags = new Map(documents.map((doc) => [doc.id, tagNames(doc)]));
  const updates = buildDocumentTagUpdates(livePlan.operations, currentTags);
  console.log(`Uitvoeren: ${String(livePlan.operations.length)} tagverwijderingen op ${String(updates.length)} documenten via ~${String(Math.ceil(updates.length / BULK_EDIT_BATCH_SIZE))} bulk-calls.`);
  await applyPriorityDocumentUpdates({
    updates,
    journal,
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
      renderProgressBar(nextJournal.completed.length, livePlan.operations.length);
    },
  });
  process.stdout.write("\n");

  const verification = await createPlan(plan.generatedAt);
  if (verification.plan.operations.length !== 0) {
    throw new Error(`Live archiefverificatie vond nog ${verification.plan.operations.length} priority-tagverwijderingen`);
  }
  journal.completedAt = new Date().toISOString();
  journal.verified = true;
  await writeJson(journalPath, journal);
  console.log(`Archief cleanup geverifieerd: ${String(journal.completed.length)} tagoperaties toegepast.`);
}

async function verifyCommand(): Promise<void> {
  const { plan } = await createPlan();
  if (plan.operations.length > 0) {
    throw new Error(`Archive bevat nog ${String(plan.operations.length)} managed priority-tags. Draai archive:cleanup:plan en archive:cleanup:apply.`);
  }
  console.log("Archive bevat geen managed priority-tags meer.");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "plan") {return planCommand();}
  if (command === "apply") {return applyCommand();}
  if (command === "verify") {return verifyCommand();}
  throw new Error("Gebruik: archive-cleanup-cli.js <plan|apply|verify>");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Archive cleanup-CLI mislukt: ${message}`);
  process.exitCode = 1;
});
