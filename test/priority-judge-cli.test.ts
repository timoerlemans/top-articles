import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const JUDGE_CLI = fileURLToPath(new URL("../scripts/priority-judge.js", import.meta.url));

interface CommandResult { code: number | null; stdout: string; stderr: string; }
interface Fixture {
  evidencePath: string;
  batchDirectory: string;
  calls: () => Promise<string[][]>;
  run: (args: readonly string[]) => Promise<CommandResult>;
}

async function withReader(responses: Record<string, string>, check: (fixture: Fixture) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "top-articles-judge-cli-"));
  try {
    const binDirectory = join(directory, "bin");
    const executable = join(binDirectory, "readwise");
    const responsesPath = join(directory, "responses.json");
    const callLog = join(directory, "calls.jsonl");
    const evidencePath = join(directory, "output", "evidence.json");
    const batchDirectory = join(directory, "batches");
    await mkdir(binDirectory);
    await mkdir(join(directory, "output"));
    await writeFile(responsesPath, JSON.stringify(responses));
    await writeFile(callLog, "");
    await writeFile(executable, [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      "fs.appendFileSync(process.env.PRIORITY_JUDGE_TEST_CALL_LOG, JSON.stringify(args) + '\\n');",
      "const responses = JSON.parse(fs.readFileSync(process.env.PRIORITY_JUDGE_TEST_RESPONSES, 'utf8'));",
      "const selector = args.includes('--page-cursor') ? args[args.indexOf('--page-cursor') + 1] : args.includes('--document-id') ? args[args.indexOf('--document-id') + 1] : '';",
      "const response = responses[args[0] + ':' + selector];",
      "if (typeof response !== 'string') { throw new Error('Unexpected Readwise request: ' + JSON.stringify(args)); }",
      "process.stdout.write(response);",
      "",
    ].join("\n"));
    await chmod(executable, 0o755);
    await check({
      evidencePath,
      batchDirectory,
      calls: async () => (await readFile(callLog, "utf8")).split("\n").filter(Boolean).map((line): string[] => JSON.parse(line) as string[]),
      run: (args) => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [JUDGE_CLI, "prepare", ...args, "--output", evidencePath, "--batch-dir", batchDirectory], {
          cwd: REPOSITORY_ROOT,
          env: {
            ...process.env,
            PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
            PRIORITY_JUDGE_TEST_CALL_LOG: callLog,
            PRIORITY_JUDGE_TEST_RESPONSES: responsesPath,
          },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
        child.once("error", reject);
        child.once("close", (code) => { resolve({ code, stdout, stderr }); });
      }),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("prepare schrijft snapshot en volledige batches op gekozen paden en bewaart oudere batchbestanden", async () => {
  await withReader({
    "reader-list-documents:": JSON.stringify({ results: [{ id: "one", title: "Eerste", tags: [{ name: "aaa-top-100" }] }], nextPageCursor: "next" }),
    "reader-list-documents:next": JSON.stringify({ results: [{ id: "two", tags: ["aaa-dutch-top-100"] }, { id: "outside", tags: ["aaa-top-10"] }] }),
    "reader-get-document-highlights:one": JSON.stringify({ highlights: [{ id: "h1", text: "Eerste inzicht." }] }),
    "reader-get-document-highlights:two": JSON.stringify(["Tweede inzicht."]),
  }, async ({ run, evidencePath, batchDirectory, calls }) => {
    await mkdir(batchDirectory);
    await writeFile(join(batchDirectory, "batch-999.json"), "oude batch\n");
    const result = await run(["--top100", "--refresh-highlights", "--batch-size", "1"]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Evidence: 1\/2/);
    assert.match(result.stdout, /Evidence: 2\/2/);
    assert.match(result.stdout, /Evidence voorbereid voor 2 documenten in 2 batches\./);
    assert.ok(result.stdout.includes(`Evidence: ${evidencePath}`));
    assert.ok(result.stdout.includes(`Batches: ${batchDirectory}`));

    const evidenceSource = await readFile(evidencePath, "utf8");
    const snapshot = JSON.parse(evidenceSource) as { generatedAt: string; version: number; scope: string; selection: string; documents: Record<string, { documentId: string; highlights: Array<{ text: string }> }> };
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.scope, "later");
    assert.equal(snapshot.selection, "top100");
    assert.ok(Number.isFinite(Date.parse(snapshot.generatedAt)));
    assert.deepEqual(Object.keys(snapshot.documents), ["one", "two"]);
    assert.equal(snapshot.documents.one?.highlights[0]?.text, "Eerste inzicht.");
    assert.equal(snapshot.documents.two?.highlights[0]?.text, "Tweede inzicht.");
    assert.equal(evidenceSource, `${JSON.stringify(snapshot, null, 2)}\n`);
    assert.deepEqual(await readdir(batchDirectory), ["batch-001.json", "batch-002.json", "batch-999.json"]);
    assert.equal(await readFile(join(batchDirectory, "batch-999.json"), "utf8"), "oude batch\n");
    const preferences = await readFile(join(REPOSITORY_ROOT, "config/readwise-reading-preferences.md"), "utf8");
    for (const [index, id] of ["one", "two"].entries()) {
      const batchSource = await readFile(join(batchDirectory, `batch-${String(index + 1).padStart(3, "0")}.json`), "utf8");
      const batch = JSON.parse(batchSource) as Record<string, unknown>;
      assert.equal(batch.version, 1);
      assert.equal(batch.rubricVersion, "semantic-v2");
      assert.equal(batch.selection, "top100");
      assert.equal(batch.readingPreferences, preferences);
      assert.equal(typeof batch.instruction, "string");
      assert.deepEqual(batch.documents, [snapshot.documents[id]]);
      assert.equal(batchSource, `${JSON.stringify(batch, null, 2)}\n`);
    }
    const requests = await calls();
    assert.deepEqual(requests.map((args) => args[0]), ["reader-list-documents", "reader-list-documents", "reader-get-document-highlights", "reader-get-document-highlights"]);
    assert.ok(requests[1]?.includes("next"));
  });
});

test("prepare wijst ongeldige batchgrootte af zonder Reader-opvragen of gewijzigde output", async () => {
  await withReader({}, async ({ run, evidencePath, batchDirectory, calls }) => {
    await writeFile(evidencePath, "bestaande snapshot\n");
    const result = await run(["--all-later", "--batch-size", "0"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Priority-judge mislukt: Batchgrootte moet positief zijn/);
    assert.deepEqual(await calls(), []);
    assert.equal(await readFile(evidencePath, "utf8"), "bestaande snapshot\n");
    await assert.rejects(readdir(batchDirectory), { code: "ENOENT" });
  });
});

test("prepare vereist precies één selectieflag", async () => {
  await withReader({}, async ({ run, evidencePath, calls }) => {
    for (const flags of [[], ["--all-later", "--top100"]]) {
      const result = await run(flags);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Kies precies één dekking/);
    }
    assert.deepEqual(await calls(), []);
    await assert.rejects(readFile(evidencePath), { code: "ENOENT" });
  });
});

test("een highlightfout schrijft geen gedeeltelijke snapshot of batches", async () => {
  await withReader({
    "reader-list-documents:": JSON.stringify([{ id: "doc" }]),
    "reader-get-document-highlights:doc": "{broken",
  }, async ({ run, evidencePath, batchDirectory, calls }) => {
    const result = await run(["--all-later", "--refresh-highlights"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Priority-judge mislukt:/);
    assert.equal((await calls()).length, 2);
    await assert.rejects(readFile(evidencePath), { code: "ENOENT" });
    await assert.rejects(readdir(batchDirectory), { code: "ENOENT" });
  });
});

test("cache-only samen met refresh schrijft lege highlights zonder live highlightophaling", async () => {
  await withReader({ "reader-list-documents:": JSON.stringify([{ id: "doc" }]) }, async ({ run, evidencePath, calls }) => {
    const result = await run(["--all-later", "--cache-only", "--refresh-highlights"]);
    assert.equal(result.code, 0, result.stderr);
    const snapshot = JSON.parse(await readFile(evidencePath, "utf8")) as { documents: Record<string, { highlights: unknown[] }> };
    assert.deepEqual(snapshot.documents.doc?.highlights, []);
    assert.equal((await calls()).length, 1);
  });
});
