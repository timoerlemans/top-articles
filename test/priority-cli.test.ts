import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile, readFile, chmod } from "node:fs/promises";
import { join, delimiter } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildPriorityTagPlan, validatePriorityTagPlan } from "../scripts/lib/priority-tag-plan.js";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../scripts/priority-cli.js", import.meta.url));

async function run(args: string[], env = process.env) {
  try {
    const result = await execFileAsync(process.execPath, [CLI, ...args], { env });
    return { ...result, code: 0 };
  } catch (error: unknown) {
    assert.ok(typeof error === "object" && error !== null && "code" in error && "stdout" in error && "stderr" in error);
    return { code: error.code, stdout: String(error.stdout), stderr: String(error.stderr) };
  }
}

test("priority CLI reports usage and missing apply arguments with a failing exit code", async () => {
  for (const args of [[], ["apply"], ["apply", "--plan", "missing.json"]]) {
    const result = await run(args);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Priority-CLI mislukt: Gebruik/);
  }
});

test("priority CLI rejects confirmation before invoking Readwise", async () => {
  const directory = await mkdtemp(join(tmpdir(), "priority-cli-confirm-"));
  try {
    const path = join(directory, "plan.json");
    await writeFile(path, JSON.stringify(buildPriorityTagPlan([])));
    const result = await run(["apply", "--plan", path, "--confirm", "wrong"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Bevestigingshash/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("priority CLI writes a v3 plan to the selected output path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "priority-cli-plan-"));
  try {
    const readwise = join(directory, "readwise");
    const output = join(directory, "nested", "plan.json");
    const overrides = join(directory, "overrides.json");
    await writeFile(readwise, "#!/bin/sh\nprintf '%s' '{\"results\":[],\"nextPageCursor\":null}'\n");
    await chmod(readwise, 0o755);
    await writeFile(overrides, '{"version":1,"items":{}}');
    const result = await run(["plan", "--output", output, "--overrides", overrides], {
      ...process.env, PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
    });
    assert.equal(result.code, 0, result.stderr);
    const plan: unknown = JSON.parse(await readFile(output, "utf8"));
    assert.ok(validatePriorityTagPlan(plan));
    assert.equal(plan.model, "readwise-priority-tag-plan-v3");
    assert.equal(plan.operations.length, 0);
    assert.match(result.stdout, /Bevestigingshash:/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
