#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createReadwiseRequester } from "./lib/readwise-request.js";
import { parseReadwiseDocumentPage } from "./lib/external-schemas.js";
import type { ReadwiseDocument } from "./lib/external-schemas.js";
import { buildEvidenceSnapshot, batchPriorityEvidence, validateJudgmentSet, type PriorityEvidenceSnapshot } from "./lib/priority-judge.js";
import { validatePriorityJudgments, type PriorityJudgmentsConfig } from "./lib/priority-judgments.js";
import { buildPriorityComparisonReport } from "./lib/priority-report.js";
import { validateCoreInterestPriorityConfig } from "./lib/core-interest-priority.js";
import type { CoreInterestPriorityConfig } from "./lib/core-interest-priority.js";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const JUDGMENTS_FILE = resolve(ROOT, "config/readwise-priority-judgments.json");
const CORE_INTEREST_FILE = resolve(ROOT, "config/readwise-core-interest-priorities.json");
const DEFAULT_EVIDENCE_FILE = resolve(ROOT, ".tmp/readwise/priority-evidence.json");
const DEFAULT_BATCH_DIR = resolve(ROOT, ".tmp/readwise/priority-judgment-batches");
const RESPONSE_FIELDS = "title,summary,word_count,reading_time,published_date,saved_at,category,tags,notes,location";
const runReadwise = createReadwiseRequester({ exec: (args) => execFileAsync("readwise", args, { maxBuffer: 16 * 1024 * 1024 }) });

function option(name: string, fallback: string | null = null): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function requireTop100(): void {
  if (!process.argv.includes("--top100")) {throw new Error("Gebruik prepare met --top100: alle huidige top-100-tagreeksen worden meegenomen");}
}

async function fetchLater(): Promise<ReadwiseDocument[]> {
  const documents: ReadwiseDocument[] = [];
  let cursor: string | null = null;
  do {
    const args = ["reader-list-documents", "--location", "later", "--limit", "100", "--response-fields", RESPONSE_FIELDS, "--json"];
    if (cursor) {args.push("--page-cursor", cursor);}
    const { stdout } = await runReadwise(args);
    const page = parseReadwiseDocumentPage(JSON.parse(stdout));
    documents.push(...page.documents);
    cursor = page.nextPageCursor;
  } while (cursor);
  return documents;
}

async function fetchHighlights(documentId: string): Promise<unknown[]> {
  const { stdout } = await runReadwise(["reader-get-document-highlights", "--document-id", documentId, "--json"]);
  const parsed: unknown = JSON.parse(stdout);
  if (Array.isArray(parsed)) {return parsed as unknown[];}
  const highlights = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).highlights : undefined;
  if (Array.isArray(highlights)) {return highlights as unknown[];}
  return [];
}

async function cachedHighlightsIndex(): Promise<Map<string, unknown[]>> {
  const root = resolve(ROOT, ".tmp/readwise");
  let names: string[];
  try {
    names = (await readdir(root, { recursive: true })).filter((name) => /(?:enrich|triage|highlight|prefetch)/i.test(name) && name.endsWith(".json"));
  } catch {
    return new Map();
  }
  const found = new Map<string, unknown[]>();
  for (const name of names) {
    try {
      const value: unknown = JSON.parse(await readFile(resolve(root, name), "utf8"));
      if (!value || typeof value !== "object" || typeof (value as { document_id?: unknown }).document_id !== "string") {continue;}
      const documentId = (value as { document_id: string }).document_id;
      const record = value as Record<string, unknown>;
      const entriesForDocument = found.get(documentId) ?? [];
      for (const key of ["highlights_created", "highlights"]) {
        const entries: unknown[] = Array.isArray(record[key]) ? record[key] as unknown[] : [];
        entriesForDocument.push(...entries.map((entry) => typeof entry === "string" ? { text: entry, pipeline: name } : entry));
      }
      found.set(documentId, entriesForDocument);
    } catch {
      // Een beschadigd cachebestand mag de read-only judge-run niet blokkeren.
    }
  }
  return found;
}

async function writeJson(path: string, value: unknown): Promise<string> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

async function writeText(path: string, value: string): Promise<string> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, value, "utf8");
  return absolute;
}

async function readConfig(path = JUDGMENTS_FILE): Promise<PriorityJudgmentsConfig> {
  const value: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
  if (!validatePriorityJudgments(value)) {throw new Error("Ongeldige config/readwise-priority-judgments.json");}
  return value;
}

async function readCoreInterestConfig(): Promise<CoreInterestPriorityConfig> {
  const value: unknown = JSON.parse(await readFile(CORE_INTEREST_FILE, "utf8"));
  if (!validateCoreInterestPriorityConfig(value)) {throw new Error("Ongeldige config/readwise-core-interest-priorities.json");}
  return value;
}

async function readEvidence(path = DEFAULT_EVIDENCE_FILE): Promise<PriorityEvidenceSnapshot> {
  const value: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1 || (value as { scope?: unknown }).scope !== "later") {
    throw new Error("Ongeldige priority-evidence snapshot");
  }
  return value as PriorityEvidenceSnapshot;
}

async function prepareCommand(): Promise<void> {
  requireTop100();
  const documents = await fetchLater();
  const candidates = documents.filter((doc) => {
    const tags = Array.isArray(doc.tags) ? doc.tags : doc.tags && typeof doc.tags === "object" ? Object.keys(doc.tags) : [];
    return tags.some((tag) => typeof tag === "string" && /(?:^|-)top-100$/.test(tag.toLowerCase()));
  });
  const highlightsById = new Map<string, readonly unknown[]>();
  const cached = process.argv.includes("--refresh-highlights") ? new Map<string, unknown[]>() : await cachedHighlightsIndex();
  for (const [index, doc] of candidates.entries()) {
    if (!doc.id) {continue;}
    const cachedForDocument = cached.get(doc.id) ?? [];
    highlightsById.set(doc.id, cachedForDocument.length > 0 || process.argv.includes("--cache-only") ? cachedForDocument : await fetchHighlights(doc.id));
    process.stdout.write(`\rEvidence: ${String(index + 1)}/${String(candidates.length)}`);
  }
  process.stdout.write("\n");
  const snapshot = buildEvidenceSnapshot(candidates, highlightsById);
  const evidencePath = await writeJson(option("--output", DEFAULT_EVIDENCE_FILE) ?? DEFAULT_EVIDENCE_FILE, snapshot);
  const batchDir = resolve(option("--batch-dir", DEFAULT_BATCH_DIR) ?? DEFAULT_BATCH_DIR);
  const batches = batchPriorityEvidence(Object.values(snapshot.documents), Number(option("--batch-size", "25")));
  await mkdir(batchDir, { recursive: true });
  for (const [index, batch] of batches.entries()) {
    await writeJson(resolve(batchDir, `batch-${String(index + 1).padStart(3, "0")}.json`), {
      version: 1,
      rubricVersion: "semantic-v1",
      instruction: "Beoordeel elk document onafhankelijk van huidige top-100-posities en vul daarna de v2 judgment-config in.",
      documents: batch,
    });
  }
  console.log(`Evidence voorbereid voor ${String(Object.keys(snapshot.documents).length)} documenten in ${String(batches.length)} batches.`);
  console.log(`Evidence: ${evidencePath}`);
  console.log(`Batches: ${batchDir}`);
}

async function validateCommand(): Promise<void> {
  const documents = await fetchLater();
  const snapshot = await readEvidence(option("--evidence", DEFAULT_EVIDENCE_FILE) ?? DEFAULT_EVIDENCE_FILE);
  const config = await readConfig(option("--config", JUDGMENTS_FILE) ?? JUDGMENTS_FILE);
  const report = validateJudgmentSet(documents, snapshot, config, process.argv.includes("--require-top100"));
  console.log(`Judgments: accepted=${String(report.accepted)}, missing=${String(report.missing)}, stale=${String(report.stale)}, rejected=${String(report.rejected)}.`);
}

function reportMarkdown(report: ReturnType<typeof buildPriorityComparisonReport>): string {
  const lines = ["# Readwise priority comparison", "", `Generated: ${report.generatedAt}`, "", "| Reeks | Huidig top-100 | Beoordeeld top-100 | Overlap | Entries | Exits | Spearman |", "|---|---:|---:|---:|---:|---:|---:|"];
  for (const [sequence, metrics] of Object.entries(report.sequences)) {
    lines.push(`| ${sequence} | ${metrics.currentTop100} | ${metrics.judgedTop100} | ${metrics.overlap} | ${metrics.entries} | ${metrics.exits} | ${metrics.spearman ?? "—"} |`);
  }
  lines.push("", `Curationconflicten: ${String(report.curationConflicts)}`, `Confidence: high=${String(report.confidence.high)}, medium=${String(report.confidence.medium)}, low=${String(report.confidence.low)}`, "");
  return `${lines.join("\n")}\n`;
}

async function reportCommand(): Promise<void> {
  const documents = await fetchLater();
  const config = await readConfig(option("--config", JUDGMENTS_FILE) ?? JUDGMENTS_FILE);
  const coreInterestConfig = await readCoreInterestConfig();
  const report = buildPriorityComparisonReport(documents, config, new Date().toISOString(), coreInterestConfig);
  const jsonPath = await writeJson(option("--output", ".tmp/readwise/priority-judgment-report.json") ?? ".tmp/readwise/priority-judgment-report.json", report);
  const markdownPath = await writeText(option("--markdown", ".tmp/readwise/priority-judgment-report.md") ?? ".tmp/readwise/priority-judgment-report.md", reportMarkdown(report));
  console.log(`Rapport: ${jsonPath}`);
  console.log(`Markdown: ${markdownPath}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "prepare") {return prepareCommand();}
  if (command === "validate") {return validateCommand();}
  if (command === "report") {return reportCommand();}
  throw new Error("Gebruik: priority:judge <prepare|validate|report>");
}

main().catch((error: unknown) => {
  console.error(`Priority-judge mislukt: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
