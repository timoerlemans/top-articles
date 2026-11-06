import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { PriorityDocument } from "../scripts/lib/priority-document.js";
import { judgmentSourceFingerprint } from "../scripts/lib/priority-judgments.js";
import { resolveReviewDocument, refreshPriorityReviewSources } from "../scripts/lib/priority-review-refresh.js";
import type { ReviewSource } from "../scripts/lib/priority-review-source.js";
import type { ReadwiseExecutor } from "../scripts/lib/readwise-request.js";

type TemporaryRun = { directory: string; cleanup: () => Promise<void> };

async function temporaryRun(): Promise<TemporaryRun> {
  const root = await mkdtemp(join(tmpdir(), "priority-review-refresh-"));
  const directory = join(root, "run");
  await mkdir(directory);
  await mkdir(join(directory, "sources"));
  await mkdir(join(directory, "assessments"));
  await mkdir(join(directory, "contexts"));
  await mkdir(join(directory, "baseline"));
  await mkdir(join(directory, "proposed"));
  return { directory, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function executorFor(responses: Readonly<Record<string, unknown>>, calls: string[][] = []): ReadwiseExecutor<{ stdout: string }> {
  return (args) => {
    calls.push([...args]);
    if (args[0] === "reader-list-documents") {
      const id = args[args.indexOf("--id") + 1];
      return Promise.resolve({ stdout: JSON.stringify(responses[id ?? ""] ?? []) });
    }
    const id = args[args.indexOf("--document-id") + 1];
    return Promise.resolve({ stdout: JSON.stringify(responses[`details:${id}`] ?? null) });
  };
}

async function createSnapshot(directory: string, documents: PriorityDocument[]): Promise<void> {
  await writeJson(join(directory, "snapshot.json"), {
    version: 1,
    scope: "later",
    standard: "full-source-v1",
    generatedAt: "2026-10-29T12:00:00.000Z",
    preferencesFingerprint: "a".repeat(64),
    readingPreferences: "private preferences",
    documents,
  });
}

async function putActiveRecords(directory: string, id: string): Promise<void> {
  const priorDoc = { id, title: "Frozen title", category: "article", tags: ["old-topic"] };
  const source: ReviewSource = {
    version: 1,
    documentId: id,
    sourceFingerprint: judgmentSourceFingerprint(priorDoc),
    contentHash: "b".repeat(64),
    content: "Old source body.\n",
    fetchedAt: "2026-10-20T10:00:00.000Z",
    availability: "available",
    limitations: ["old limitation"],
  };
  await writeJson(join(directory, "sources", `${id}.json`), source);
  assert.ok(source.content !== null);
  await writeFile(join(directory, "sources", `${id}.md`), source.content);
  await writeJson(join(directory, "assessments", `${id}.json`), { documentId: id, status: "accepted", private: "old assessment" });
  await writeJson(join(directory, "contexts", `${id}.json`), { version: 1, preparedAt: "2026-10-20T10:00:00.000Z", document: priorDoc });
}

test("refreshes only selected metadata and body, archiving old private material without touching frozen/public files", async (t) => {
  const f = await temporaryRun();
  t.after(f.cleanup);
  const { directory } = f;
  const frozen = [
    { id: "selected", title: "Frozen title", category: "article", tags: ["old-topic"] },
    { id: "untouched", title: "Unchanged", category: "article", tags: ["steady"] },
  ];
  await createSnapshot(directory, frozen);
  await putActiveRecords(directory, "selected");
  await putActiveRecords(directory, "untouched");
  const baseline = { items: { selected: { status: "accepted", reason: "baseline" } } };
  const proposed = { items: { selected: { status: "accepted", reason: "proposed" } } };
  const publicConfig = { version: 2, items: { selected: { status: "accepted", reason: "public" } } };
  await writeJson(join(directory, "baseline", "readwise-priority-judgments.json"), baseline);
  await writeJson(join(directory, "proposed", "readwise-priority-judgments.json"), proposed);
  await mkdir(join(directory, "config"));
  await writeJson(join(directory, "config", "readwise-priority-judgments.json"), publicConfig);
  const preserved = await Promise.all([
    readFile(join(directory, "snapshot.json"), "utf8"),
    readFile(join(directory, "baseline", "readwise-priority-judgments.json"), "utf8"),
    readFile(join(directory, "proposed", "readwise-priority-judgments.json"), "utf8"),
    readFile(join(directory, "config", "readwise-priority-judgments.json"), "utf8"),
  ]);
  const untouchedFiles = await Promise.all([
    readFile(join(directory, "sources", "untouched.json"), "utf8"),
    readFile(join(directory, "sources", "untouched.md"), "utf8"),
    readFile(join(directory, "assessments", "untouched.json"), "utf8"),
    readFile(join(directory, "contexts", "untouched.json"), "utf8"),
  ]);
  const calls: string[][] = [];
  const run = executorFor({
    selected: [{
      id: "selected", location: "later", title: "Current title", category: "article",
      tags: ["new-topic"], notes: "Waarom lezen: context\n\nFeedback: private feedback",
      content: "Current full body.\n", html_content: "<p>private html</p>",
    }],
  }, calls);

  await refreshPriorityReviewSources(run, directory, ["selected"]);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.slice(0, 3), ["reader-list-documents", "--id", "selected"]);
  const activeContext = await readJson(join(directory, "contexts", "selected.json")) as { version: number; preparedAt: string; document: PriorityDocument };
  assert.equal(activeContext.version, 1);
  assert.equal(new Date(activeContext.preparedAt).toISOString(), activeContext.preparedAt);
  assert.equal(activeContext.document.title, "Current title");
  assert.deepEqual(activeContext.document.tags, ["new-topic"]);
  assert.equal(activeContext.document.notes, "Waarom lezen: context");
  assert.equal("content" in activeContext.document, false);
  assert.equal("html_content" in activeContext.document, false);
  const activeSource = await readJson(join(directory, "sources", "selected.json")) as ReviewSource;
  assert.equal(activeSource.content, "Current full body.\n");
  assert.equal(activeSource.sourceFingerprint, judgmentSourceFingerprint(activeContext.document));
  assert.equal(await readFile(join(directory, "sources", "selected.md"), "utf8"), activeSource.content);
  assert.deepEqual(await Promise.all([
    readFile(join(directory, "sources", "untouched.json"), "utf8"),
    readFile(join(directory, "sources", "untouched.md"), "utf8"),
    readFile(join(directory, "assessments", "untouched.json"), "utf8"),
    readFile(join(directory, "contexts", "untouched.json"), "utf8"),
  ]), untouchedFiles);
  await assert.rejects(readFile(join(directory, "assessments", "selected.json")), { code: "ENOENT" });

  const historyParent = join(directory, "history", "selected");
  const history = await readdir(historyParent);
  assert.equal(history.length, 1);
  const historyName = history[0];
  assert.ok(historyName);
  const archived = join(historyParent, historyName);
  assert.deepEqual(await readJson(join(archived, "source.json")), {
    version: 1, documentId: "selected",
    sourceFingerprint: judgmentSourceFingerprint({ id: "selected", title: "Frozen title", category: "article", tags: ["old-topic"] }),
    contentHash: "b".repeat(64), content: "Old source body.\n", fetchedAt: "2026-10-20T10:00:00.000Z",
    availability: "available", limitations: ["old limitation"],
  });
  assert.equal(await readFile(join(archived, "source.md"), "utf8"), "Old source body.\n");
  assert.equal((await readJson(join(archived, "assessment.json")) as { private: string }).private, "old assessment");
  assert.deepEqual(await readJson(join(archived, "context.json")), {
    version: 1, preparedAt: "2026-10-20T10:00:00.000Z",
    document: { id: "selected", title: "Frozen title", category: "article", tags: ["old-topic"] },
  });
  assert.deepEqual(await Promise.all([
    readFile(join(directory, "snapshot.json"), "utf8"),
    readFile(join(directory, "baseline", "readwise-priority-judgments.json"), "utf8"),
    readFile(join(directory, "proposed", "readwise-priority-judgments.json"), "utf8"),
    readFile(join(directory, "config", "readwise-priority-judgments.json"), "utf8"),
  ]), preserved);
});

test("falls back to details for a missing bulk body and fingerprints sanitized current notes", async (t) => {
  const f = await temporaryRun();
  t.after(f.cleanup);
  const { directory } = f;
  await createSnapshot(directory, [{ id: "needs-details", title: "Old" }]);
  const calls: string[][] = [];
  await refreshPriorityReviewSources(executorFor({
    "needs-details": [{ id: "needs-details", location: "later", title: "New", notes: "Private context\n\nFeedback: don't score this", content: "" }],
    "details:needs-details": { id: "needs-details", content: "Details body.\n" },
  }, calls), directory, ["needs-details"]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], ["reader-get-document-details", "--document-id", "needs-details", "--json"]);
  const context = await readJson(join(directory, "contexts", "needs-details.json")) as { document: PriorityDocument };
  const source = await readJson(join(directory, "sources", "needs-details.json")) as ReviewSource;
  assert.equal(context.document.notes, "Private context");
  assert.equal(source.content, "Details body.\n");
  assert.equal(source.sourceFingerprint, judgmentSourceFingerprint(context.document));
});

test("archives the old assessment and removes stale active Markdown when refreshed source is missing or errors", async (t) => {
  for (const [id, details, expected] of [
    ["missing-body", { id: "missing-body" }, "missing"],
    ["error-body", new Error("details unavailable"), "error"],
  ] as const) {
    const f = await temporaryRun();
    t.after(f.cleanup);
    const { directory } = f;
    await createSnapshot(directory, [{ id, title: "Frozen" }]);
    await putActiveRecords(directory, id);
    const run: ReadwiseExecutor<{ stdout: string }> = (args) => {
      if (args[0] === "reader-list-documents") {
        return Promise.resolve({ stdout: JSON.stringify([{ id, location: "later", title: "Refreshed" }]) });
      }
      if (expected === "error") { return Promise.reject(details); }
      return Promise.resolve({ stdout: JSON.stringify(details) });
    };
    await refreshPriorityReviewSources(run, directory, [id]);
    const source = await readJson(join(directory, "sources", `${id}.json`)) as ReviewSource;
    assert.equal(source.availability, expected);
    assert.equal(source.content, null);
    await assert.rejects(readFile(join(directory, "sources", `${id}.md`)), { code: "ENOENT" });
    await assert.rejects(readFile(join(directory, "assessments", `${id}.json`)), { code: "ENOENT" });
    const historyRoot = join(directory, "history", id);
    const history = await readdir(historyRoot);
    assert.equal(history.length, 1);
    const historyName = history[0];
    assert.ok(historyName);
    assert.equal((await readJson(join(historyRoot, historyName, "assessment.json")) as { private: string }).private, "old assessment");
    assert.equal(await readFile(join(historyRoot, historyName, "source.md"), "utf8"), "Old source body.\n");
  }
});

test("rejects invalid selections before Reader calls or run changes", async (t) => {
  const f = await temporaryRun();
  t.after(f.cleanup);
  const { directory } = f;
  await createSnapshot(directory, [{ id: "valid" }]);
  const calls: string[][] = [];
  const run = executorFor({}, calls);
  for (const ids of [[], ["valid", "valid"], ["../escape"], ["missing"]]) {
    await assert.rejects(refreshPriorityReviewSources(run, directory, ids));
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(await readdir(directory), ["assessments", "baseline", "contexts", "proposed", "snapshot.json", "sources"]);
});

test("requires an existing valid snapshot before any Reader call", async (t) => {
  const f = await temporaryRun();
  t.after(f.cleanup);
  const calls: string[][] = [];
  await assert.rejects(refreshPriorityReviewSources(executorFor({}, calls), f.directory, ["selected"]), { code: "ENOENT" });
  assert.deepEqual(calls, []);
});

test("rejects wrong IDs and documents outside Later without archiving or changing active records", async (t) => {
  for (const [id, returned] of [
    ["wrong", [{ id: "other", location: "later", content: "private" }]],
    ["not-later", [{ id: "not-later", location: "archive", content: "private" }]],
    ["ambiguous", [{ id: "ambiguous", location: "later" }, { id: "ambiguous", location: "later" }]],
  ] as const) {
    const f = await temporaryRun();
    t.after(f.cleanup);
    const { directory } = f;
    await createSnapshot(directory, [{ id }]);
    await putActiveRecords(directory, id);
    const beforeSource = await readFile(join(directory, "sources", `${id}.json`), "utf8");
    const beforeAssessment = await readFile(join(directory, "assessments", `${id}.json`), "utf8");
    await assert.rejects(refreshPriorityReviewSources(executorFor({ [id]: returned }), directory, [id]));
    assert.equal(await readFile(join(directory, "sources", `${id}.json`), "utf8"), beforeSource);
    assert.equal(await readFile(join(directory, "assessments", `${id}.json`), "utf8"), beforeAssessment);
    await assert.rejects(readdir(join(directory, "history", id)), { code: "ENOENT" });
  }
});

test("resolves validated per-document contexts, falls back only when absent, and rejects corrupt contexts", async (t) => {
  const f = await temporaryRun();
  t.after(f.cleanup);
  const { directory } = f;
  const frozen: PriorityDocument = { id: "context-id", title: "Frozen" };
  assert.equal(await resolveReviewDocument(directory, frozen), frozen);
  await writeJson(join(directory, "contexts", "context-id.json"), {
    version: 1,
    preparedAt: "2026-10-30T10:00:00.000Z",
    document: { id: "context-id", title: "Current", tags: ["new-topic"] },
  });
  assert.deepEqual(await resolveReviewDocument(directory, frozen), { id: "context-id", title: "Current", tags: ["new-topic"] });
  await writeJson(join(directory, "contexts", "context-id.json"), {
    version: 1, preparedAt: "not-a-date", document: { id: "somebody-else", title: "Wrong" },
  });
  await assert.rejects(resolveReviewDocument(directory, frozen), /context|ID/i);
  for (const document of [
    { id: "context-id", title: 42 },
    { id: "context-id", notes: { feedback: "invalid type" } },
    { id: "context-id", content: "body fields are forbidden in context" },
  ]) {
    await writeJson(join(directory, "contexts", "context-id.json"), {
      version: 1, preparedAt: "2026-10-30T10:00:00.000Z", document,
    });
    await assert.rejects(resolveReviewDocument(directory, frozen), /context|ID/i);
  }
  await writeFile(join(directory, "contexts", "context-id.json"), "not json");
  await assert.rejects(resolveReviewDocument(directory, frozen), SyntaxError);
});
