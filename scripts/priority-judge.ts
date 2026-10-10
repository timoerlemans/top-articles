#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createReadwiseRequester } from "./lib/readwise-request.js";
import { fetchReadwiseDocuments } from "./lib/readwise-documents.js";
import { preparePriorityEvidence, ensureMissingFallbacks, validateJudgmentSet, type EvidenceSelection, type PriorityEvidenceSnapshot } from "./lib/priority-judge.js";
import { validatePriorityJudgments, type PriorityJudgmentsConfig } from "./lib/priority-judgments.js";
import { buildPriorityComparisonReport } from "./lib/priority-report.js";
import { validateCoreInterestPriorityConfig } from "./lib/core-interest-priority.js";
import type { CoreInterestPriorityConfig } from "./lib/core-interest-priority.js";
import { prepareReadingFeedback } from "./lib/reading-feedback.js";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const JUDGMENTS_FILE = resolve(ROOT, "config/readwise-priority-judgments.json");
const CORE_INTEREST_FILE = resolve(ROOT, "config/readwise-core-interest-priorities.json");
const READING_PREFERENCES_FILE = resolve(ROOT, "config/readwise-reading-preferences.md");
const DEFAULT_EVIDENCE_FILE = resolve(ROOT, ".tmp/readwise/priority-evidence.json");
const DEFAULT_BATCH_DIR = resolve(ROOT, ".tmp/readwise/priority-judgment-batches");
const runReadwise = createReadwiseRequester({ exec: (args) => execFileAsync("readwise", args, { maxBuffer: 16 * 1024 * 1024 }) });

function option(name: string, fallback: string | null = null): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function selectionArgument(): EvidenceSelection {
  const allLater = process.argv.includes("--all-later");
  const top100 = process.argv.includes("--top100");
  if (allLater === top100) {
    throw new Error("Kies precies één dekking: --all-later voor alle later-documenten of --top100 voor huidige top-100-documenten");
  }
  return allLater ? "all-later" : "top100";
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
  const readingPreferences = await readFile(READING_PREFERENCES_FILE, "utf8");
  const { snapshot, batches } = await preparePriorityEvidence({
    runReadwise,
    onProgress: ({ completed, total }) => { process.stdout.write(`\rEvidence: ${String(completed)}/${String(total)}`); },
  }, {
    selection: selectionArgument(),
    readingPreferences,
    cacheDirectory: resolve(ROOT, ".tmp/readwise"),
    batchSize: Number(option("--batch-size", "25")),
    cacheOnly: process.argv.includes("--cache-only"),
    refreshHighlights: process.argv.includes("--refresh-highlights"),
  });
  process.stdout.write("\n");
  const evidencePath = await writeJson(option("--output", DEFAULT_EVIDENCE_FILE) ?? DEFAULT_EVIDENCE_FILE, snapshot);
  const batchDir = resolve(option("--batch-dir", DEFAULT_BATCH_DIR) ?? DEFAULT_BATCH_DIR);
  await mkdir(batchDir, { recursive: true });
  for (const [index, batch] of batches.entries()) {
    await writeJson(resolve(batchDir, `batch-${String(index + 1).padStart(3, "0")}.json`), batch);
  }
  console.log(`Evidence voorbereid voor ${String(Object.keys(snapshot.documents).length)} documenten in ${String(batches.length)} batches.`);
  console.log(`Evidence: ${evidencePath}`);
  console.log(`Batches: ${batchDir}`);
}

async function prepareFeedbackCommand(): Promise<void> {
  const documentId = option("--document-id");
  if (process.argv.includes("--document-id") && (!documentId || documentId.startsWith("--"))) {
    throw new Error("--document-id vereist een document-ID");
  }
  const config = await readConfig();
  const readingPreferences = await readFile(READING_PREFERENCES_FILE, "utf8");
  const review = await prepareReadingFeedback(runReadwise, config, readingPreferences, documentId ?? undefined);
  // Feedback is private evidence, never a tracked config or public browser export.
  const path = await writeJson(resolve(ROOT, ".tmp/readwise/reading-feedback.json"), review);
  console.log(`Leesfeedback: ${String(review.documents.filter((entry) => entry.status === "pending").length)} te beoordelen, ${String(review.documents.filter((entry) => entry.status === "reviewed").length)} al verwerkt.`);
  console.log(`Privé evidence: ${path}`);
  console.log("Bespreek voorstellen met Codex; ophalen verandert geen beoordelingen, scores of Reader-documenten.");
}

async function validateCommand(): Promise<void> {
  const documents = await fetchReadwiseDocuments(runReadwise, { profile: "judge", location: "later" });
  const snapshot = await readEvidence(option("--evidence", DEFAULT_EVIDENCE_FILE) ?? DEFAULT_EVIDENCE_FILE);
  const config = await readConfig(option("--config", JUDGMENTS_FILE) ?? JUDGMENTS_FILE);
  const report = validateJudgmentSet(documents, snapshot, config, {
    requireTop100: process.argv.includes("--require-top100"),
    requireAllLater: process.argv.includes("--require-all"),
    requireTopicRelevance: process.argv.includes("--require-topic"),
  });
  console.log(`Judgments: accepted=${String(report.accepted)}, missing=${String(report.missing)}, stale=${String(report.stale)}, rejected=${String(report.rejected)}, topicMissing=${String(report.topicMissing ?? 0)}.`);
}

async function ensureFallbackCommand(): Promise<void> {
  const selection = selectionArgument();
  const documents = await fetchReadwiseDocuments(runReadwise, { profile: "judge", location: "later" });
  const configPath = option("--config", JUDGMENTS_FILE) ?? JUDGMENTS_FILE;
  const config = await readConfig(configPath);
  const judgedAt = option("--judged-at");
  const result = ensureMissingFallbacks(documents, config, { selection, ...(judgedAt ? { judgedAt } : {}) });
  const reportPath = await writeJson(option("--report", ".tmp/readwise/priority-judge-audit.json") ?? ".tmp/readwise/priority-judge-audit.json", result.report);
  if (result.report.added.length > 0) {
    await writeJson(configPath, result.config);
  }
  console.log(`${selection === "all-later" ? "All-later" : "Top-100"} fallback: documenten=${String(result.report.top100)}, toegevoegd=${String(result.report.added.length)}, bestaand=${String(result.report.existing.length)}, stale=${String(result.report.stale.length)}, draft=${String(result.report.draft.length)}, rejected=${String(result.report.rejected.length)}.`);
  console.log(`Audit: ${reportPath}`);
  if (result.report.added.length > 0) {console.log(`Config bijgewerkt: ${resolve(configPath)}`);}
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
  const documents = await fetchReadwiseDocuments(runReadwise, { profile: "judge", location: "later" });
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
  if (command === "prepare-feedback") {return prepareFeedbackCommand();}
  if (command === "validate") {return validateCommand();}
  if (command === "ensure-fallback") {return ensureFallbackCommand();}
  if (command === "report") {return reportCommand();}
  throw new Error("Gebruik: priority:judge <prepare|prepare-feedback|validate|ensure-fallback|report>");
}

main().catch((error: unknown) => {
  console.error(`Priority-judge mislukt: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
