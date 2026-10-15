import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const scriptsRoot = resolve(repositoryRoot, ".github/scripts");

test("resolve-parent-context writes validated GitHub outputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "top-articles-quality-"));
  const chainFile = join(directory, "maintenance-run.json");
  const outputFile = join(directory, "github-output");
  await writeFile(chainFile, JSON.stringify({ finalSha: "a".repeat(40), branch: "main" }));

  await execFileAsync("bash", [join(scriptsRoot, "resolve-parent-context.sh"), chainFile], {
    cwd: repositoryRoot,
    env: { ...process.env, GITHUB_OUTPUT: outputFile },
  });

  assert.equal(await readFile(outputFile, "utf8"), "final_sha=" + "a".repeat(40) + "\nbranch=main\n");
});

test("write-maintenance-run writes the chain manifest with a nullable parent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "top-articles-quality-"));
  const outputFile = join(directory, "maintenance-run.json");

  await execFileAsync("bash", [join(scriptsRoot, "write-maintenance-run.sh")], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      MAINTENANCE_RUN_FILE: outputFile,
      WORKFLOW: "Synchroniseer Readwise-prioriteit",
      RUN_ID: "123",
      BRANCH: "main",
      INITIAL_SHA: "b".repeat(40),
      FINAL_SHA: "c".repeat(40),
      STATUS: "success",
      PARENT_RUN_ID: "",
    },
  });

  assert.deepEqual(JSON.parse(await readFile(outputFile, "utf8")), {
    version: 1,
    workflow: "Synchroniseer Readwise-prioriteit",
    runId: "123",
    parentRunId: null,
    branch: "main",
    initialSha: "b".repeat(40),
    finalSha: "c".repeat(40),
    status: "success",
  });
});

test("maintenance workflows call the versioned shell scripts", async () => {
  const workflows = await Promise.all([
    readFile(resolve(repositoryRoot, ".github/workflows/priority-sync.yml"), "utf8"),
    readFile(resolve(repositoryRoot, ".github/workflows/archive-lees.yml"), "utf8"),
    readFile(resolve(repositoryRoot, ".github/workflows/archive-cleanup.yml"), "utf8"),
    readFile(resolve(repositoryRoot, ".github/workflows/refresh.yml"), "utf8"),
  ]);

  assert.match(workflows[0], /run-priority-maintenance\.sh/);
  assert.ok(workflows.slice(1).every((workflow) => workflow.includes("resolve-parent-context.sh")));
  assert.ok(workflows.every((workflow) => workflow.includes("write-maintenance-run.sh")));
});
