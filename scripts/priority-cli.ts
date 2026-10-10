#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatTop100Changes, formatTop10Changes } from "./lib/priority-tag-plan.js";
import { createPrioritySync } from "./lib/priority-sync.js";
import type { PrioritySyncEvent } from "./lib/priority-sync.js";
import { BULK_EDIT_BATCH_SIZE } from "./lib/priority-batch.js";
import { createReadwiseRequester } from "./lib/readwise-request.js";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const runReadwise = createReadwiseRequester({ exec: (args) => execFileAsync("readwise", args) });
const runReadwiseMutation = createReadwiseRequester({ exec: (args) => execFileAsync("readwise", args), retries: 0 });

function option(name: string, fallback: string | null = null): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function present(event: PrioritySyncEvent): void {
  if (event.type === "round") {
    console.log(
      `${event.round === 1 ? "Uitvoeren" : `\nHerstelronde ${String(event.round - 1)}`}: ` +
      `${String(event.operations)} tagoperaties op ${String(event.documents)} documenten ` +
      `via ~${String(Math.ceil(event.documents / BULK_EDIT_BATCH_SIZE))} bulk-calls.`,
    );
    return;
  }
  const ratio = event.total === 0 ? 1 : Math.min(1, Math.max(0, event.completed / event.total));
  const filled = Math.round(ratio * 30);
  const bar = "#".repeat(filled) + "-".repeat(30 - filled);
  process.stdout.write(`\r[${bar}] ${String(event.completed)}/${String(event.total)} (${String(Math.round(ratio * 100))}%)`);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function writeJson(path: string, value: unknown): Promise<string> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

const sync = createPrioritySync({
  readwise: runReadwise,
  mutate: runReadwiseMutation,
  loadConfiguration: async () => {
    const overridesPath = option("--overrides", resolve(ROOT, "config/readwise-priority-overrides.json"));
    if (!overridesPath) { throw new Error("Pad naar scorecorrecties ontbreekt"); }
    const [overrides, judgments, coreInterestConfig] = await Promise.all([
      readJson(overridesPath),
      readJson(resolve(ROOT, "config/readwise-priority-judgments.json")),
      readJson(resolve(ROOT, "config/readwise-core-interest-priorities.json")),
    ]);
    return { overrides, judgments, coreInterestConfig };
  },
  journal: {
    read: async (path) => {
      try { return await readJson(path); }
      catch (error: unknown) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") { return null; }
        throw error;
      }
    },
    write: async (path, value) => { await writeJson(path, value); },
  },
  onEvent: present,
});

async function main() {
  const command = process.argv[2];
  if (command === "plan") {
    const output = option("--output", ".tmp/readwise/priority-plan.json");
    if (!output) { throw new Error("Uitvoerpad ontbreekt"); }
    const plan = await sync.plan({ cleanupAll: process.argv.includes("--cleanup-all") });
    const path = await writeJson(output, plan);
    console.log(`Proefrun: ${String(plan.summary.documents)} documenten, ${String(plan.summary.additions)} toevoegingen, ${String(plan.summary.removals)} verwijderingen.`);
    console.log(formatTop10Changes(plan));
    console.log(formatTop100Changes(plan));
    console.log(`Plan: ${path}`);
    console.log(`Bevestigingshash: ${plan.planHash}`);
    return;
  }
  if (command === "apply") {
    const planPath = option("--plan");
    const confirmation = option("--confirm");
    if (!planPath || !confirmation) { throw new Error("Gebruik priority:apply met --plan <bestand> --confirm <plan-hash>"); }
    const journalPath = option("--journal", ".tmp/readwise/priority-apply-journal.json");
    if (!journalPath) { throw new Error("Journalpad ontbreekt"); }
    const journal = await sync.apply({ plan: await readJson(planPath), confirmation, journalPath });
    console.log(`\nSynchronisatie geverifieerd: ${String(journal.completed.length)} tagoperaties toegepast.`);
    return;
  }
  if (command === "verify") {
    await sync.verify({ cleanupAll: process.argv.includes("--cleanup-all") });
    console.log("Readwise-reeksen en toplijsttags zijn volledig gesynchroniseerd.");
    return;
  }
  throw new Error("Gebruik: priority-cli.js <plan|apply|verify>");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Priority-CLI mislukt: ${message}`);
  process.exitCode = 1;
});
