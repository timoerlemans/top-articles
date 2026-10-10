import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateArchiveCleanupPlan } from "../scripts/lib/archive-cleanup.js";

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

async function withReadwisePages(
  pages: readonly unknown[],
  check: (fixture: { environment: NodeJS.ProcessEnv; planPath: string; callLogPath: string }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "top-articles-cleanup-pages-"));
  try {
    const binDirectory = join(directory, "bin");
    const readwisePath = join(binDirectory, "readwise");
    const planPath = join(directory, "plan.json");
    const callLogPath = join(directory, "calls.log");
    await mkdir(binDirectory);
    await writeFile(readwisePath, [
      "#!/bin/sh",
      "printf '%s\\n' \"$*\" >> \"$ARCHIVE_CLEANUP_CALL_LOG\"",
      'case $(wc -l < "$ARCHIVE_CLEANUP_CALL_LOG") in',
      ...pages.map((page, index) => `${String(index + 1)}) printf '%s' '${JSON.stringify(page)}' ;;`),
      `*) printf '%s' '{"results":[],"nextPageCursor":null}' ;;`,
      "esac",
      "",
    ].join("\n"));
    await chmod(readwisePath, 0o755);
    await check({
      planPath,
      callLogPath,
      environment: {
        ...process.env,
        PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
        ARCHIVE_CLEANUP_CALL_LOG: callLogPath,
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("herhaalde paginacursor schrijft geen gedeeltelijk cleanup-plan", async () => {
  await withReadwisePages([
    { results: [{ id: "first", location: "archive", tags: { "lees-0001": {} } }], nextPageCursor: "again" },
    { results: [], nextPageCursor: "again" },
  ], async ({ environment, planPath, callLogPath }) => {
    const result = await runCleanupCli(["plan", "--output", planPath], environment);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /paginacursor/i);
    assert.equal((await readReadwiseCalls(callLogPath)).length, 2);
    await assert.rejects(readFile(planPath, "utf8"), { code: "ENOENT" });
  });
});

test("cleanup-plan bevat documenten van alle pagina's", async () => {
  await withReadwisePages([
    { results: [{ id: "one", location: "archive", tags: { "lees-0001": {} } }], nextPageCursor: "next" },
    { results: [{ id: "two", location: "archive", tags: { "aaa-top-10": {} } }] },
  ], async ({ environment, planPath, callLogPath }) => {
    const result = await runCleanupCli(["plan", "--output", planPath], environment);
    assert.equal(result.code, 0, result.stderr);
    const plan: unknown = JSON.parse(await readFile(planPath, "utf8"));
    assert.ok(validateArchiveCleanupPlan(plan));
    assert.equal(plan.summary.documents, 2);
    assert.deepEqual(plan.operations, [
      { action: "remove", documentId: "one", tag: "lees-0001" },
      { action: "remove", documentId: "two", tag: "aaa-top-10" },
    ]);
    const calls = await readReadwiseCalls(callLogPath);
    assert.equal(calls.length, 2);
    assert.ok(calls[1]?.includes("--page-cursor next"));
    for (const call of calls) {
      const args = call.split(" ");
      assert.equal(args[0], "reader-list-documents");
      assert.equal(args[args.indexOf("--location") + 1], "archive");
      assert.equal(args.filter((arg) => arg === "--json").length, 1);
    }
  });
});

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
