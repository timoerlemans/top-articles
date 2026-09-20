#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";

import { validateCoreInterestPriorityConfig } from "./lib/core-interest-priority.js";
import type { CoreInterestPriorityConfig } from "./lib/core-interest-priority.js";
import { parseReadwiseDocumentPage } from "./lib/external-schemas.js";
import type { ReadwiseDocument } from "./lib/external-schemas.js";
import { buildTopicPriorityImpactReport, formatTopicPriorityImpactMarkdown } from "./lib/topic-priority-report.js";
import { validatePriorityJudgments } from "./lib/priority-judgments.js";
import type { PriorityJudgmentsConfig } from "./lib/priority-judgments.js";
import type { PriorityOverridesConfig } from "./lib/readwise-priority-v8.js";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OVERRIDES_FILE = resolve(ROOT, "config/readwise-priority-overrides.json");
const JUDGMENTS_FILE = resolve(ROOT, "config/readwise-priority-judgments.json");
const CORE_INTEREST_FILE = resolve(ROOT, "config/readwise-core-interest-priorities.json");
const RESPONSE_FIELDS = "title,summary,word_count,reading_time,published_date,saved_at,category,tags,notes,location";
const DEFAULT_JSON = ".tmp/readwise/topic-priority-impact.json";
const DEFAULT_MARKDOWN = ".tmp/readwise/topic-priority-impact.md";
const overridesSchema = z.object({
  version: z.literal(1),
  items: z.record(z.string(), z.object({ adjustment: z.number().optional(), reason: z.string().nullable().optional() })),
});
const runReadwise = (args: readonly string[]) => execFileAsync("readwise", [...args, "--json"], { maxBuffer: 64 * 1024 * 1024 });

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

async function fetchLater(): Promise<ReadwiseDocument[]> {
  const documents: ReadwiseDocument[] = [];
  let cursor: string | null = null;
  do {
    const args = ["reader-list-documents", "--location", "later", "--limit", "100", "--response-fields", RESPONSE_FIELDS];
    if (cursor) {args.push("--page-cursor", cursor);}
    const { stdout } = await runReadwise(args);
    const page = parseReadwiseDocumentPage(JSON.parse(stdout));
    documents.push(...page.documents);
    cursor = page.nextPageCursor;
  } while (cursor);
  return documents;
}

async function readJudgments(): Promise<PriorityJudgmentsConfig> {
  const value: unknown = JSON.parse(await readFile(JUDGMENTS_FILE, "utf8"));
  if (!validatePriorityJudgments(value)) {throw new Error("Ongeldige config/readwise-priority-judgments.json");}
  return value;
}

async function readCoreInterestConfig(): Promise<CoreInterestPriorityConfig> {
  const value: unknown = JSON.parse(await readFile(CORE_INTEREST_FILE, "utf8"));
  if (!validateCoreInterestPriorityConfig(value)) {throw new Error("Ongeldige config/readwise-core-interest-priorities.json");}
  return value;
}

async function writeOutput(path: string, content: string): Promise<string> {
  const absolute = resolve(ROOT, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  return absolute;
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const [documents, judgments, coreInterestConfig] = await Promise.all([
    fetchLater(),
    readJudgments(),
    readCoreInterestConfig(),
  ]);
  const overrides: PriorityOverridesConfig = overridesSchema.parse(JSON.parse(await readFile(OVERRIDES_FILE, "utf8")));
  const report = buildTopicPriorityImpactReport(documents, judgments, generatedAt, overrides, coreInterestConfig);
  const jsonPath = await writeOutput(option("--output", DEFAULT_JSON), `${JSON.stringify(report, null, 2)}\n`);
  const markdownPath = await writeOutput(option("--markdown", DEFAULT_MARKDOWN), formatTopicPriorityImpactMarkdown(report));
  console.log(`Topic-impactrapport: ${String(report.items.length)} topiclidmaatschappen, fallback=${String(report.fallbackCount)}.`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${markdownPath}`);
}

main().catch((error: unknown) => {
  console.error(`Topic-impactrapport mislukt: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
