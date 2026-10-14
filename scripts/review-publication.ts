#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

import { mergeReviewedConfig } from "./lib/review-publication.js";
import { validatePriorityJudgments } from "./lib/priority-judgments.js";
import { validateReadingProfiles } from "./lib/reading-profiles.js";

const CONFIGS = {
  priorityJudgments: {
    file: "readwise-priority-judgments.json",
    validate: validatePriorityJudgments,
  },
  readingProfiles: {
    file: "readwise-reading-profiles.json",
    validate: validateReadingProfiles,
  },
} as const;
const exec = promisify(execFile);

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main(): Promise<void> {
  if (process.argv[2] !== "publish") {
    throw new Error("Gebruik: review:publish -- publish --run-dir PAD --output-dir PAD [--repo PAD]");
  }
  const runDirectory = option("--run-dir");
  const outputDirectory = option("--output-dir");
  const repositoryRoot = resolve(option("--repo") ?? process.cwd());
  if (!runDirectory || !outputDirectory) { throw new Error("--run-dir en --output-dir zijn verplicht"); }
  const runRoot = resolve(runDirectory);
  const outputRoot = resolve(outputDirectory);
  if (outputRoot === resolve(repositoryRoot, "config")) { throw new Error("Gebruik een geïsoleerde outputmap, niet de actieve configmap"); }
  const expectedRemote = option("--expected-remote");
  if (expectedRemote) {
    const { stdout } = await exec("git", ["ls-remote", "origin", "refs/heads/main"], { cwd: repositoryRoot });
    const remoteCommit = stdout.trim().split(/\s+/)[0] ?? "";
    if (remoteCommit !== expectedRemote) { throw new Error(`Remote main veranderde: verwacht ${expectedRemote}, kreeg ${remoteCommit || "geen commit"}`); }
    console.log(`Remote main bevestigd op ${remoteCommit}.`);
  }
  const produced = await readJson(resolve(runRoot, "produced.json"));
  if (!produced || typeof produced !== "object" || Array.isArray(produced)) { throw new Error("Ongeldige produced.json"); }

  const outputs: Array<{ path: string; value: unknown }> = [];
  for (const [name, definition] of Object.entries(CONFIGS)) {
    const producedEntry = (produced as Record<string, unknown>)[name];
    if (!producedEntry || typeof producedEntry !== "object" || Array.isArray(producedEntry)) { throw new Error(`produced.json mist ${name}`); }
    const entry = producedEntry as { ids?: unknown; topLevelKeys?: unknown };
    if (!Array.isArray(entry.ids) || !entry.ids.every((id) => typeof id === "string")) { throw new Error(`${name}.ids moet een stringarray zijn`); }
    const topLevelKeys = entry.topLevelKeys === undefined ? [] : entry.topLevelKeys;
    if (!Array.isArray(topLevelKeys) || !topLevelKeys.every((key) => typeof key === "string")) { throw new Error(`${name}.topLevelKeys moet een stringarray zijn`); }
    const baseline = await readJson(resolve(runRoot, "baseline", definition.file));
    const proposed = await readJson(resolve(runRoot, "proposed", definition.file));
    const remote = await readJson(resolve(repositoryRoot, "config", definition.file));
    const merged = mergeReviewedConfig({
      name,
      baseline,
      proposed,
      remote,
      producedIds: entry.ids,
      producedTopLevelKeys: topLevelKeys,
      validate: definition.validate,
    });
    outputs.push({ path: resolve(outputRoot, definition.file), value: merged.value });
    console.log(`${name}: ${String(merged.changedIds.length)} IDs gepubliceerd; baselineconflicten 0.`);
  }
  await mkdir(outputRoot, { recursive: true });
  for (const output of outputs) {
    await writeFile(output.path, `${JSON.stringify(output.value, null, 2)}\n`, "utf8");
  }
  console.log(`Gevalideerde reviewconfiguraties geschreven naar ${outputRoot}. Commit/push vereist een afzonderlijke expliciete worktree-stap.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
