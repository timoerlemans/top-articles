#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createReadwiseRequester } from "./lib/readwise-request.js";
import { parseReadwiseDocumentPage } from "./lib/external-schemas.js";
import type { ReadwiseDocument } from "./lib/external-schemas.js";
import {
  judgmentSourceFingerprint,
  suggestedJudgmentFromHighlights,
  validatePriorityJudgments,
  type PriorityJudgmentsConfig,
} from "./lib/priority-judgments.js";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const JUDGMENTS_FILE = resolve(ROOT, "config/readwise-priority-judgments.json");
const RESPONSE_FIELDS = "title,summary,word_count,reading_time,published_date,saved_at,category,tags,notes,language";
const TOP100_TAG = /(?:^|-)top-100$/;
const runReadwise = createReadwiseRequester({
  exec: (args) => execFileAsync("readwise", args, { maxBuffer: 16 * 1024 * 1024 }),
});

function option(name: string, fallback: string | null = null): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function tagNames(doc: ReadwiseDocument): string[] {
  if (Array.isArray(doc.tags)) {return doc.tags.filter((tag): tag is string => typeof tag === "string");}
  if (doc.tags && typeof doc.tags === "object") {return Object.keys(doc.tags);}
  return [];
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

function highlightText(value: unknown): string[] {
  const records = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { highlights?: unknown }).highlights)
      ? (value as { highlights: unknown[] }).highlights
      : [];
  return records.flatMap((highlight) => {
    if (!highlight || typeof highlight !== "object") {return [];}
    const record = highlight as Record<string, unknown>;
    const text = record.text ?? record.highlight ?? record.plaintext ?? record.highlight_plaintext;
    return typeof text === "string" && text.trim() ? [text] : [];
  });
}

async function fetchHighlights(documentId: string): Promise<string[]> {
  const { stdout } = await runReadwise(["reader-get-document-highlights", "--document-id", documentId, "--json"]);
  return highlightText(JSON.parse(stdout));
}

async function loadConfig(): Promise<PriorityJudgmentsConfig> {
  const value: unknown = JSON.parse(await readFile(JUDGMENTS_FILE, "utf8"));
  if (!validatePriorityJudgments(value)) {throw new Error("Ongeldige config/readwise-priority-judgments.json");}
  return value;
}

async function main(): Promise<void> {
  const output = resolve(option("--output", JUDGMENTS_FILE) ?? JUDGMENTS_FILE);
  const force = process.argv.includes("--force");
  const [documents, config] = await Promise.all([fetchLater(), loadConfig()]);
  const candidates = documents.filter((doc) => tagNames(doc).some((tag) => TOP100_TAG.test(tag)));
  let updated = 0;
  let skipped = 0;

  for (const doc of candidates) {
    if (!force && config.items[doc.id]?.sourceFingerprint === judgmentSourceFingerprint(doc)) {
      skipped += 1;
      continue;
    }
    const highlights = await fetchHighlights(doc.id);
    config.items[doc.id] = suggestedJudgmentFromHighlights(doc, highlights);
    updated += 1;
    process.stdout.write(`\rBeoordeeld: ${String(updated + skipped)}/${String(candidates.length)}`);
  }
  process.stdout.write("\n");
  await writeFile(output, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`Judgments bijgewerkt: ${String(updated)}, overgeslagen: ${String(skipped)}, top-100-kandidaten: ${String(candidates.length)}.`);
  console.log(`Config: ${output}`);
}

main().catch((error: unknown) => {
  console.error(`Priority-judge mislukt: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
