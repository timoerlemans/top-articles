import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLEANUP_CLI = fileURLToPath(new URL("../scripts/archive-cleanup-cli.js", import.meta.url));

function runCleanupCli(args: readonly string[], environment: NodeJS.ProcessEnv): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLEANUP_CLI, ...args], {
      cwd: REPOSITORY_ROOT,
      env: environment,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code) => { resolve({ code, stdout, stderr }); });
  });
}

async function readReadwiseCalls(path: string): Promise<string[]> {
  try {
    const content = await readFile(path, "utf8");
    return content.split("\n").filter(Boolean);
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

test("lege archive cleanup slaat live scans tijdens apply over", async () => {
  const directory = await mkdtemp(join(tmpdir(), "top-articles-archive-cleanup-"));
  try {
    const binDirectory = join(directory, "bin");
    const readwisePath = join(binDirectory, "readwise");
    const planPath = join(directory, "archive-cleanup-plan.json");
    const journalPath = join(directory, "archive-cleanup-journal.json");
    const callLogPath = join(directory, "readwise-calls.jsonl");
    await mkdir(binDirectory);
    await writeFile(readwisePath, [
      "#!/bin/sh",
      "printf '%s\\n' \"$*\" >> \"$ARCHIVE_CLEANUP_CALL_LOG\"",
      "printf '%s' '{\"results\":[],\"nextPageCursor\":null}'",
      "",
    ].join("\n"));
    await chmod(readwisePath, 0o755);

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
      ARCHIVE_CLEANUP_CALL_LOG: callLogPath,
    };
    const planResult = await runCleanupCli(["plan", "--output", planPath], environment);
    assert.equal(planResult.code, 0, JSON.stringify({ ...planResult, calls: await readReadwiseCalls(callLogPath) }));
    const plan: unknown = JSON.parse(await readFile(planPath, "utf8"));
    assert.ok(typeof plan === "object" && plan !== null && "operations" in plan && Array.isArray(plan.operations));
    assert.equal(plan.operations.length, 0);
    assert.equal((await readReadwiseCalls(callLogPath)).length, 1);

    const planHash = "planHash" in plan && typeof plan.planHash === "string" ? plan.planHash : "";
    const applyResult = await runCleanupCli([
      "apply",
      "--plan", planPath,
      "--confirm", planHash,
      "--journal", journalPath,
    ], environment);
    assert.equal(applyResult.code, 0, applyResult.stderr);
    assert.equal((await readReadwiseCalls(callLogPath)).length, 1);
    await assert.rejects(readFile(journalPath, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("archive-cleanup-workflow gate apply en verify op het planaantal", async () => {
  const workflow = await readFile(join(REPOSITORY_ROOT, ".github/workflows/archive-cleanup.yml"), "utf8");
  assert.match(workflow, /id: cleanup_plan/);
  assert.match(workflow, /operations=\$\(jq -r '\.summary\.operations'/);
  assert.equal([...workflow.matchAll(/if: steps\.cleanup_plan\.outputs\.operations != '0'/g)].length, 2);
});
