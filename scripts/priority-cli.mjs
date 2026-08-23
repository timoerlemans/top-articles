#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPriorityTagPlan, validatePriorityTagPlan } from "./lib/priority-tag-plan.mjs";
import { applyPriorityOperations } from "./lib/priority-apply.mjs";
import { createReadwiseRequester } from "./lib/readwise-request.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OVERRIDES_FILE = resolve(ROOT, "config/readwise-priority-overrides.json");
const RESPONSE_FIELDS = "title,summary,word_count,reading_time,published_date,saved_at,updated_at,category,location,reading_progress,tags,notes";
const LOCATIONS = ["later", "new", "shortlist", "archive", "feed"];
const runReadwise = createReadwiseRequester({ exec: (args) => execFileAsync("readwise", args) });
const runReadwiseMutation = createReadwiseRequester({ exec: (args) => execFileAsync("readwise", args), retries: 0 });

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function renderProgressBar(current, total, width = 30) {
  const filled = Math.round((current / total) * width);
  const bar = "#".repeat(filled) + "-".repeat(width - filled);
  const pct = Math.round((current / total) * 100);
  process.stdout.write(`\r[${bar}] ${current}/${total} (${pct}%)`);
}

async function fetchLocation(location) {
  const documents = [];
  let cursor = null;
  do {
    const args = ["reader-list-documents", "--location", location, "--limit", "100", "--response-fields", RESPONSE_FIELDS, "--json"];
    if (cursor) args.push("--page-cursor", cursor);
    const { stdout } = await runReadwise(args);
    const parsed = JSON.parse(stdout);
    documents.push(...(Array.isArray(parsed) ? parsed : parsed.results ?? []));
    cursor = Array.isArray(parsed) ? null : parsed.nextPageCursor ?? null;
  } while (cursor);
  return documents;
}

async function fetchLibrary({ cleanupAll = false } = {}) {
  const byLocation = {};
  const locations = cleanupAll ? LOCATIONS : ["later"];
  for (const location of locations) byLocation[location] = await fetchLocation(location);
  const later = byLocation.later;
  const outside = [
    ...locations.filter((location) => location !== "later").flatMap((location) => byLocation[location]),
  ];
  return { later, outside };
}

async function loadOverrides() {
  const path = option("--overrides", OVERRIDES_FILE);
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function createPlan(generatedAt, { cleanupAll = false } = {}) {
  const [{ later, outside }, overrides] = await Promise.all([fetchLibrary({ cleanupAll }), loadOverrides()]);
  return buildPriorityTagPlan(later, outside, { generatedAt, overrides, cleanupAll });
}

async function writeJson(path, value) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function planCommand() {
  const output = option("--output", ".tmp/readwise/priority-plan.json");
  const cleanupAll = process.argv.includes("--cleanup-all");
  const plan = await createPlan(undefined, { cleanupAll });
  const path = await writeJson(output, plan);
  console.log(`Proefrun: ${plan.summary.documents} documenten, ${plan.summary.additions} toevoegingen, ${plan.summary.removals} verwijderingen.`);
  console.log(`Plan: ${path}`);
  console.log(`Bevestigingshash: ${plan.planHash}`);
}

async function applyCommand() {
  const planPath = option("--plan");
  const confirmation = option("--confirm");
  if (!planPath || !confirmation) throw new Error("Gebruik priority:apply met --plan <bestand> --confirm <plan-hash>");
  const plan = JSON.parse(await readFile(resolve(planPath), "utf8"));
  validatePriorityTagPlan(plan);
  if (confirmation !== plan.planHash) throw new Error("Bevestigingshash komt niet overeen met het plan");

  const livePlan = await createPlan(plan.generatedAt, { cleanupAll: plan.scope === "all-locations" });
  if (livePlan.sourceFingerprint !== plan.sourceFingerprint) throw new Error("Readwise of de scorecorrecties zijn gewijzigd; maak een nieuwe proefrun");

  const journalPath = option("--journal", ".tmp/readwise/priority-apply-journal.json");
  const previousJournal = await readJsonIfExists(journalPath);
  const journal = previousJournal?.planHash === plan.planHash
    ? previousJournal
    : { planHash: plan.planHash, startedAt: new Date().toISOString(), completed: [], failures: [] };
  await applyPriorityOperations({
    operations: livePlan.operations,
    journal,
    execute: async (operation) => {
    const command = operation.action === "add" ? "reader-add-tags-to-document" : "reader-remove-tags-from-document";
      await runReadwiseMutation([command, "--document-id", operation.documentId, "--tag-names", operation.tag]);
    },
    writeJournal: async (nextJournal) => {
      await writeJson(journalPath, nextJournal);
      renderProgressBar(nextJournal.completed.length, livePlan.operations.length);
    },
  });
  process.stdout.write("\n");

  const verification = await createPlan(plan.generatedAt, { cleanupAll: plan.scope === "all-locations" });
  if (verification.operations.length !== 0) throw new Error(`Live verificatie vond nog ${verification.operations.length} tagoperaties`);
  journal.completedAt = new Date().toISOString();
  journal.verified = true;
  await writeJson(journalPath, journal);
  console.log(`Synchronisatie geverifieerd: ${journal.completed.length} tagoperaties toegepast.`);
}

async function verifyCommand() {
  const plan = await createPlan(undefined, { cleanupAll: process.argv.includes("--cleanup-all") });
  if (plan.operations.length > 0) throw new Error(`Readwise wijkt af: ${plan.operations.length} tagoperaties nodig. Draai priority:plan.`);
  console.log("Readwise-reeksen en toplijsttags zijn volledig gesynchroniseerd.");
}

async function main() {
  const command = process.argv[2];
  if (command === "plan") return planCommand();
  if (command === "apply") return applyCommand();
  if (command === "verify") return verifyCommand();
  throw new Error("Gebruik: priority-cli.mjs <plan|apply|verify>");
}

main().catch((error) => {
  console.error(`Priority-CLI mislukt: ${error.message}`);
  process.exitCode = 1;
});
