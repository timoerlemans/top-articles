import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../scripts/review-publication.js", import.meta.url));
const hash = "a".repeat(64);

test("review publication CLI writes validated merged configs only to isolated output", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-publication-cli-"));
  try {
    const run = join(root, "run");
    const output = join(root, "output");
    const repo = join(root, "repo");
    for (const directory of [join(run, "baseline"), join(run, "proposed"), join(repo, "config")]) { await mkdir(directory, { recursive: true }); }
    const priorityBaseline = { version: 2, rubricVersion: "semantic-v2", items: {} };
    const judgment = {
      sourceFingerprint: hash, evidenceFingerprint: hash, relevance: 2, substance: 2, durability: 2, usefulness: 2,
      sequenceFit: { lees: 0 }, confidence: "medium", reasonCodes: ["semantic-review"], status: "accepted",
      rubricVersion: "semantic-v2", evidenceRefs: ["summary"], judgedBy: "reviewer", judgedAt: "2026-10-14T00:00:00Z",
    };
    const priorityProposed = { ...priorityBaseline, items: { one: judgment } };
    const profileConfig = { version: 1, items: {} };
    for (const [name, value] of [
      ["readwise-priority-judgments.json", priorityBaseline],
      ["readwise-reading-profiles.json", profileConfig],
    ] as const) {
      await writeFile(join(run, "baseline", name), `${JSON.stringify(value)}\n`);
      await writeFile(join(run, "proposed", name), `${JSON.stringify(name === "readwise-priority-judgments.json" ? priorityProposed : value)}\n`);
      await writeFile(join(repo, "config", name), `${JSON.stringify(value)}\n`);
    }
    await writeFile(join(run, "produced.json"), JSON.stringify({ priorityJudgments: { ids: ["one"] }, readingProfiles: { ids: [] } }));

    const result = await exec(process.execPath, [cli, "publish", "--run-dir", run, "--output-dir", output, "--repo", repo]);
    assert.match(result.stdout, /baselineconflicten 0/);
    const published = JSON.parse(await readFile(join(output, "readwise-priority-judgments.json"), "utf8")) as { items: Record<string, unknown> };
    assert.deepEqual(Object.keys(published.items), ["one"]);
    const remote = JSON.parse(await readFile(join(repo, "config", "readwise-priority-judgments.json"), "utf8")) as { items: Record<string, unknown> };
    assert.deepEqual(remote.items, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
