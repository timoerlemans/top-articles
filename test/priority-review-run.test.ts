import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

import { automatedFallbackJudgment, buildPriorityEvidence, validatePriorityJudgments } from "../scripts/lib/priority-judgments.js";
import type { ContentJudgment, PriorityJudgmentsConfig } from "../scripts/lib/priority-judgments.js";
import { fetchSourceReview, importSourceReview, inspectSourceReview, prepareSourceReview } from "../scripts/lib/priority-review-run.js";
import { acceptedReviewJudgment, reviewHash } from "../scripts/lib/priority-review.js";
import { reviewSourceFromDetails } from "../scripts/lib/priority-review-source.js";
import type { ReviewAssessment } from "../scripts/lib/priority-review-standard.js";
import { TOPIC_SEQUENCE_ORDER } from "../scripts/lib/priority-sequences.js";
import type { ReadwiseExecutor } from "../scripts/lib/readwise-request.js";

// Contract: docs/priority-review.md. Everything, including config writes, is isolated.
const NOW = "2026-10-29T12:00:00.000Z";
const PREFERENCES = "Prefer well-supported arguments about software and philosophy.\n";
const JUDGMENTS = "readwise-priority-judgments.json";
const PROFILES = "readwise-reading-profiles.json";

function document(id = "article", category = "article") {
  return {
    id, category, title: `Synthetic ${id}`, location: "later", tags: {},
    saved_at: "2026-10-01T00:00:00Z", summary: "A synthetic argument about learning.",
    notes: "Why read: consider the method.",
    content: `# ${id}\n\nPRIVATE BODY ${id}: the method requires evidence.\n\nThe conclusion describes its limitations.\n`,
  };
}
type Document = ReturnType<typeof document>;

function config(items: Record<string, ContentJudgment> = {}): PriorityJudgmentsConfig {
  return { version: 2, rubricVersion: "semantic-v2", items };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readRecord(path: string): Promise<Record<string, unknown>> {
  const value = await readJson(path);
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

async function readConfig(path: string): Promise<PriorityJudgmentsConfig> {
  const value = await readJson(path);
  assert.ok(validatePriorityJudgments(value));
  return value;
}

async function fixture(t: TestContext, judgments = config()) {
  const root = await mkdtemp(join(tmpdir(), "priority-review-run-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const directory = join(root, ".tmp/readwise/source-review");
  const configDir = join(root, "config");
  await mkdir(configDir);
  const judgmentPath = join(configDir, JUDGMENTS);
  const profilePath = join(configDir, PROFILES);
  const preferencePath = join(configDir, "readwise-reading-preferences.md");
  await writeJson(judgmentPath, judgments);
  await writeJson(profilePath, { version: 1, items: {} });
  await writeFile(preferencePath, PREFERENCES);
  return { root, directory, judgmentPath, profilePath, preferencePath };
}

function reader(t: TestContext, pages: unknown[], details: Record<string, unknown> = {}) {
  const remaining = [...pages];
  const calls: string[][] = [];
  t.after(() => {
    assert.equal(remaining.length, 0, "all scripted Later pages must have been consumed");
    for (const call of calls) {
      assert.ok(["reader-list-documents", "reader-get-document-details"].includes(call[0] ?? ""), "Reader writes are forbidden");
    }
  });
  const run: ReadwiseExecutor<{ stdout: string }> = (args) => {
    calls.push([...args]);
    let result: unknown;
    if (args[0] === "reader-list-documents") {
      assert.equal(args[args.indexOf("--location") + 1], "later");
      assert.ok(remaining.length > 0, "unexpected extra Later request");
      result = remaining.shift();
    } else {
      assert.equal(args[0], "reader-get-document-details", "unexpected command; never use live Reader");
      const id = args[args.indexOf("--document-id") + 1];
      assert.ok(id && Object.hasOwn(details, id), "unexpected details request");
      result = details[id];
    }
    return result instanceof Error ? Promise.reject(result) : Promise.resolve({ stdout: JSON.stringify(result) });
  };
  return { run, calls };
}

function assessment(doc: Document): ReviewAssessment {
  return {
    version: 1, standard: "full-source-v1", documentId: doc.id,
    sourceFingerprint: buildPriorityEvidence(doc).sourceFingerprint,
    contentHash: reviewHash(doc.content), preferencesFingerprint: reviewHash(PREFERENCES),
    status: "accepted", sourceStatus: "complete",
    completenessReason: "Both the method and final limitations section were read.",
    readRanges: [{ start: 0, end: doc.content.length }],
    thesis: "PRIVATE THESIS: the author treats evidence as a prerequisite for learning.",
    dimensions: ["relevance", "substance", "durability", "usefulness", ...TOPIC_SEQUENCE_ORDER].map((dimension) => ({
      dimension, reason: `PRIVATE REASON: the method and its limits support ${dimension}.`,
      passages: [{ start: doc.content.indexOf("the method"), end: doc.content.length }],
    })),
    uncertainties: { source: [], interpretation: [], personalFit: ["PRIVATE UNCERTAINTY: application to another setting is indirect."] },
    reason: "A grounded medium judgment suffices.", judgedBy: "codex-test-reviewer", judgedAt: NOW,
    judgment: {
      relevance: 2, substance: 3, durability: 2, usefulness: 1,
      topicRelevance: Object.fromEntries(TOPIC_SEQUENCE_ORDER.map((topic) => [topic, 0])),
      sequenceFit: {}, confidence: "medium",
    },
  };
}

function accepted(doc: Document): ContentJudgment {
  return acceptedReviewJudgment(doc, reviewSourceFromDetails(doc, doc, NOW), assessment(doc), reviewHash(PREFERENCES));
}

async function storeAssessment(directory: string, attempt: ReviewAssessment): Promise<void> {
  await writeJson(join(directory, "assessments", `${attempt.documentId}.json`), attempt);
}

function ratings(attempt: ReviewAssessment): Record<string, unknown> {
  assert.ok(attempt.judgment && typeof attempt.judgment === "object" && !Array.isArray(attempt.judgment));
  return attempt.judgment as Record<string, unknown>;
}

test("prepare freezes ALL paginated Later IDs, including untagged books and videos, without mutating configs", async (t) => {
  const f = await fixture(t);
  const article = document();
  const book = document("book", "epub");
  const video = document("video", "video");
  const original = await readFile(f.judgmentPath, "utf8");
  const profiles = await readFile(f.profilePath, "utf8");
  const mock = reader(t, [
    { results: [article], nextPageCursor: "page-2" },
    { results: [], nextPageCursor: "page-3" },
    { results: [book, video], nextPageCursor: null },
  ]);
  await prepareSourceReview(mock.run, f.root, f.directory);
  assert.equal(mock.calls.length, 3);
  assert.ok(mock.calls[1]?.includes("page-2"));
  assert.ok(mock.calls[2]?.includes("page-3"));
  const selection = await readRecord(join(f.directory, "selection.json"));
  assert.equal(selection.scope, "all-later");
  assert.deepEqual(selection.documentIds, [article.id, book.id, video.id]);
  assert.deepEqual(selection.reused, []);
  const batch = await readRecord(join(f.directory, "batch-001.json"));
  assert.ok(Array.isArray(batch.documents));
  assert.deepEqual(batch.documents.map((entry: unknown) => {
    assert.ok(entry && typeof entry === "object" && "id" in entry);
    return entry.id;
  }), [article.id, book.id, video.id]);
  for (const doc of [article, book, video]) {
    assert.equal(await readFile(join(f.directory, "sources", `${doc.id}.md`), "utf8"), doc.content);
  }
  const snapshot = await readFile(join(f.directory, "snapshot.json"), "utf8");
  assert.doesNotMatch(snapshot, /PRIVATE BODY/);
  assert.doesNotMatch(JSON.stringify(batch), /PRIVATE BODY|confidence|sequenceFit|topicRelevance/);
  assert.deepEqual(await readJson(join(f.directory, "baseline", JUDGMENTS)), config());
  assert.equal(await readFile(f.judgmentPath, "utf8"), original);
  assert.equal(await readFile(f.profilePath, "utf8"), profiles);
  await inspectSourceReview(f.root, f.directory);
  const report = await readRecord(join(f.directory, "report.json"));
  assert.equal(report.scope, "frozen-later-snapshot");
  assert.equal(report.total, 3);
  assert.equal(report.pending, 3);
  assert.equal(report.accepted, 0, "available content alone never proves a complete review");
  assert.deepEqual(await readdir(join(f.directory, "assessments")), []);
});

test("a failed final Later page cannot publish a partial snapshot or baseline", async (t) => {
  const f = await fixture(t);
  const before = await readFile(f.judgmentPath, "utf8");
  const failure = new Error("synthetic pagination failure");
  await assert.rejects(prepareSourceReview(reader(t, [
    { results: [document()], nextPageCursor: "next" }, failure,
  ]).run, f.root, f.directory), (error) => error === failure);
  await assert.rejects(readFile(join(f.directory, "snapshot.json")), { code: "ENOENT" });
  await assert.rejects(readFile(join(f.directory, "baseline", JUDGMENTS)), { code: "ENOENT" });
  assert.equal(await readFile(f.judgmentPath, "utf8"), before);
});

test("resuming preserves the frozen snapshot and private progress; changed preferences require a fresh run", async (t) => {
  const f = await fixture(t);
  const doc = document();
  await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(doc));
  const before = await readFile(join(f.directory, "snapshot.json"), "utf8");
  const noCalls = reader(t, []);
  await prepareSourceReview(noCalls.run, f.root, f.directory);
  assert.equal(await readFile(join(f.directory, "snapshot.json"), "utf8"), before);
  assert.deepEqual(await readJson(join(f.directory, "assessments", `${doc.id}.json`)), assessment(doc));
  await writeFile(f.preferencePath, "Changed preferences\n");
  await assert.rejects(prepareSourceReview(noCalls.run, f.root, f.directory), /voorkeur|preferences/i);
  assert.equal(noCalls.calls.length, 0);
});

test("a complete medium review is reused, while status explicitly describes snapshot coverage only", async (t) => {
  const doc = document();
  const f = await fixture(t, config({ [doc.id]: accepted(doc) }));
  await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  const selection = await readRecord(join(f.directory, "selection.json"));
  assert.deepEqual(selection.reused, [doc.id]);
  assert.equal(selection.batchCount, 0);
  // inspect has no executor: it cannot know about a new Later ID or a changed live body.
  await inspectSourceReview(f.root, f.directory);
  const report = await readRecord(join(f.directory, "report.json"));
  assert.equal(report.scope, "frozen-later-snapshot");
  assert.equal(report.total, 1);
  assert.equal(report.reused, 1);
  assert.equal(report.accepted, 0, "reused and newly accepted must be distinguished");
  assert.equal(report.pending, 0);
});

const nonReusable: [string, (judgment: ContentJudgment, doc: Document) => void][] = [
  ["legacy semantic-v2 without source provenance", (j) => { delete j.sourceReview; }],
  ["automated fallback", (j, doc) => { Object.assign(j, automatedFallbackJudgment(doc, NOW)); }],
  ["low confidence despite full-source provenance", (j) => { j.confidence = "low"; }],
  ["incomplete topic ratings", (j) => { delete j.topicRelevance?.philosophy; }],
  ["partial source provenance", (j) => { assert.ok(j.sourceReview); j.sourceReview.sourceStatus = "partial"; }],
  ["changed evidence fingerprint", (j) => { j.evidenceFingerprint = reviewHash("changed evidence"); }],
  ["changed source body", (j) => { assert.ok(j.sourceReview); j.sourceReview.contentHash = reviewHash("old body"); }],
  ["changed preferences fingerprint", (j) => { j.preferencesFingerprint = reviewHash("old preferences"); }],
];
for (const [name, change] of nonReusable) {
  test(`prepare and status never count ${name} as semantic coverage`, async (t) => {
    const doc = document();
    const old = accepted(doc);
    change(old, doc);
    const original = config({ [doc.id]: old });
    assert.ok(validatePriorityJudgments(original), "fixture remains valid under the legacy config schema");
    const f = await fixture(t, original);
    await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
    await inspectSourceReview(f.root, f.directory);
    const selection = await readRecord(join(f.directory, "selection.json"));
    const report = await readRecord(join(f.directory, "report.json"));
    assert.deepEqual({ reused: selection.reused, batchCount: selection.batchCount, statusReused: report.reused, pending: report.pending }, {
      reused: [], batchCount: 1, statusReused: 0, pending: 1,
    });
    assert.deepEqual(await readConfig(f.judgmentPath), original, "operational judgment is retained");
  });
}

for (const status of ["draft", "rejected"] as const) {
  test(`${status} without ratings stays private and preserves an existing accepted judgment`, async (t) => {
    const doc = document();
    const old = accepted(doc);
    delete old.sourceReview;
    const original = config({ [doc.id]: old });
    const f = await fixture(t, original);
    await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
    const attempt = assessment(doc);
    delete attempt.judgment;
    attempt.status = status;
    attempt.sourceStatus = "partial";
    attempt.readRanges = [{ start: 0, end: 10 }];
    attempt.completenessReason = "The final section is not available; ratings cannot be justified.";
    attempt.dimensions = [];
    await storeAssessment(f.directory, attempt);
    await inspectSourceReview(f.root, f.directory);
    const report = await readRecord(join(f.directory, "report.json"));
    assert.equal(report[status], 1);
    assert.equal(report.retained, 1);
    assert.equal(report.accepted, 0);
    await importSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
    assert.deepEqual(await readConfig(f.judgmentPath), original);
    assert.deepEqual(await readJson(join(f.directory, "proposed", JUDGMENTS)), original);
    assert.deepEqual(await readJson(join(f.directory, "produced.json")), { priorityJudgments: { ids: [] }, readingProfiles: { ids: [] } });
    assert.deepEqual(await readJson(join(f.directory, "assessments", `${doc.id}.json`)), attempt);
  });
}

test("accepted import validates fresh details, stores only compact provenance and preserves unrelated local edits", async (t) => {
  const doc = document();
  const untouched = document("untouched");
  const removed = document("removed");
  const original = config({ untouched: accepted(untouched), removed: accepted(removed) });
  const f = await fixture(t, original);
  await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(doc));
  const edited = config({ untouched: { ...accepted(untouched), usefulness: 4 }, added: accepted(document("added")) });
  await writeJson(f.judgmentPath, edited);
  const profiles = '{"version":1,"items":{},"concurrent":"preserve exactly"}\n';
  await writeFile(f.profilePath, profiles);
  const metadata = { ...doc, content: "" };
  const live = reader(t, [[metadata], [metadata]], { [doc.id]: doc });
  await importSourceReview(live.run, f.root, f.directory);
  assert.equal(live.calls.length, 3, "details are followed by a final metadata check");
  const result = await readConfig(f.judgmentPath);
  assert.deepEqual(result.items.untouched, edited.items.untouched);
  assert.deepEqual(result.items.added, edited.items.added);
  assert.equal(Object.hasOwn(result.items, "removed"), false);
  const imported = result.items[doc.id];
  assert.ok(imported);
  assert.equal(imported.status, "accepted");
  assert.equal(imported.confidence, "medium");
  assert.equal(imported.substance, 3);
  assert.equal(imported.sourceReview?.contentHash, reviewHash(doc.content));
  assert.equal(imported.sourceReview.standard, "full-source-v1");
  assert.equal(imported.preferencesFingerprint, reviewHash(PREFERENCES));
  assert.deepEqual(Object.keys(imported.topicRelevance ?? {}).sort(), [...TOPIC_SEQUENCE_ORDER].sort());
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE BODY|PRIVATE THESIS|PRIVATE REASON|PRIVATE UNCERTAINTY/);
  assert.deepEqual(await readJson(join(f.directory, "baseline", JUDGMENTS)), original);
  assert.equal(await readFile(f.profilePath, "utf8"), profiles);
  assert.deepEqual(await readJson(join(f.directory, "produced.json")), { priorityJudgments: { ids: [doc.id] }, readingProfiles: { ids: [] } });
});

const invalidImports: [string, (doc: Document, attempt: ReviewAssessment) => Document[], RegExp][] = [
  ["body changed with identical metadata", (doc) => [{ ...doc, content: `${doc.content}\nAn additional conclusion.` }], /hash|bron/i],
  ["metadata changed", (doc) => [{ ...doc, title: "A revised thesis" }], /metadata|bron/i],
  ["document left Later", () => [], /Later/i],
  ["nonempty source is only partial", (doc, a) => { a.sourceStatus = "partial"; return [doc]; }, /complete|bron/i],
  ["low confidence accepted", (doc, a) => { a.judgment = { ...ratings(a), confidence: "low" }; return [doc]; }, /confidence|medium|low|accepted|beoordeling/i],
  ["missing topic rating", (doc, a) => {
    a.judgment = { ...ratings(a), topicRelevance: { scrum: 0 } }; return [doc];
  }, /topic|ratings/i],
  ["forged out-of-bounds passage", (doc, a) => {
    assert.ok(a.dimensions[0]); a.dimensions[0].passages = [{ start: 0, end: doc.content.length + 1 }]; return [doc];
  }, /passage/i],
  ["no recorded source reading", (doc, a) => { a.readRanges = []; return [doc]; }, /bronlezing|bereik/i],
  ["unread opening", (doc, a) => { a.readRanges = [{ start: 1, end: doc.content.length }]; return [doc]; }, /bronlezing|bereik/i],
  ["unread final character", (doc, a) => { a.readRanges = [{ start: 0, end: doc.content.length - 1 }]; return [doc]; }, /bronlezing|bereik/i],
  ["gap between read chunks", (doc, a) => {
    a.readRanges = [{ start: 0, end: 10 }, { start: 11, end: doc.content.length }]; return [doc];
  }, /bronlezing|bereik/i],
  ["read range beyond the source", (doc, a) => { a.readRanges = [{ start: 0, end: doc.content.length + 1 }]; return [doc]; }, /bronlezing|bereik/i],
];
for (const [name, change, message] of invalidImports) {
  test(`accepted import refuses ${name} without writing partial judgments`, async (t) => {
    const doc = document();
    const second = document("second");
    const f = await fixture(t);
    await prepareSourceReview(reader(t, [[second, doc]]).run, f.root, f.directory);
    await storeAssessment(f.directory, assessment(second));
    const attempt = assessment(doc);
    const live = change(doc, attempt);
    await storeAssessment(f.directory, attempt);
    const before = await readFile(f.judgmentPath, "utf8");
    await assert.rejects(importSourceReview(reader(t, [[second, ...live]]).run, f.root, f.directory), message);
    assert.equal(await readFile(f.judgmentPath, "utf8"), before, "a prior valid ID must not leak into a failed import");
  });
}

test("accepted import permits complete reading in ordered chunks with overlapping rereads", async (t) => {
  const doc = document();
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  const a = assessment(doc);
  a.readRanges = [{ start: 0, end: 20 }, { start: 10, end: 30 }, { start: 30, end: doc.content.length }];
  await storeAssessment(f.directory, a);
  await importSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  const imported = (await readConfig(f.judgmentPath)).items[doc.id];
  assert.equal(imported?.status, "accepted");
  assert.equal(imported.confidence, "medium");
});

test("explicit current-Later import preserves departed reviews as history without changing their scores", async (t) => {
  const active = document("active");
  const departed = document("departed");
  const prior = accepted(departed);
  const f = await fixture(t, config({ [departed.id]: prior }));
  await prepareSourceReview(reader(t, [[active, departed]]).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(active));
  await storeAssessment(f.directory, assessment(departed));
  await importSourceReview(reader(t, [[active]]).run, f.root, f.directory, true);
  const result = await readConfig(f.judgmentPath);
  assert.deepEqual(result.items[departed.id], prior);
  assert.equal(result.items[active.id]?.sourceReview?.standard, "full-source-v1");
  const scope = await readRecord(join(f.directory, "import-scope.json"));
  assert.deepEqual(scope.importedIds, [active.id]);
  assert.deepEqual(scope.departedIds, [departed.id]);
  assert.ok(await readJson(join(f.directory, "assessments", `${departed.id}.json`)));
});

test("incremental import accepts this run's own evidence refinements without losing its original publication baseline", async (t) => {
  const doc = document();
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  const first = assessment(doc);
  await storeAssessment(f.directory, first);
  await importSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  const firstImported = (await readConfig(f.judgmentPath)).items[doc.id];
  assert.ok(firstImported?.sourceReview);
  const next = assessment(doc);
  next.thesis = "The method requires evidence and explicitly states its limitations.";
  await storeAssessment(f.directory, next);
  await importSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  const secondImported = (await readConfig(f.judgmentPath)).items[doc.id];
  assert.ok(secondImported?.sourceReview);
  assert.notEqual(secondImported.sourceReview.assessmentFingerprint, firstImported.sourceReview.assessmentFingerprint);
  assert.equal(secondImported.sourceReview.assessmentFingerprint, reviewHash(JSON.stringify(next)));
  assert.deepEqual((await readConfig(join(f.directory, "baseline", JUDGMENTS))).items, {});
});

test("a user edit after a staged import remains protected from this run's next revision", async (t) => {
  const doc = document();
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(doc));
  await importSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  const edited = await readConfig(f.judgmentPath);
  const imported = edited.items[doc.id];
  assert.ok(imported);
  edited.items[doc.id] = { ...imported, usefulness: 4 };
  await writeJson(f.judgmentPath, edited);
  const next = assessment(doc);
  next.thesis = "A more precise review of the method and its limitations.";
  await storeAssessment(f.directory, next);
  await assert.rejects(importSourceReview(reader(t, [[doc]]).run, f.root, f.directory), /gelijktijdig|conflict/i);
  assert.deepEqual(await readConfig(f.judgmentPath), edited);
});

test("live status persists a resumable active ID selection without rewriting the frozen snapshot", async (t) => {
  const active = document("active");
  const departed = document("departed");
  const added = document("added");
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[active, departed]]).run, f.root, f.directory);
  const before = await readFile(join(f.directory, "snapshot.json"), "utf8");
  await inspectSourceReview(f.root, f.directory, [active, added]);
  const selection = await readRecord(join(f.directory, "live-selection.json"));
  assert.deepEqual(selection.documentIds, [active.id, added.id]);
  assert.deepEqual(selection.departedIds, [departed.id]);
  assert.deepEqual(selection.addedIds, [added.id]);
  assert.equal(await readFile(join(f.directory, "snapshot.json"), "utf8"), before);
});

test("source hydration uses matching private caches, ignores stale caches, and batches by text size", async (t) => {
  const cached = { ...document("cached", "epub"), content: `${document("cached").content}${"Chapter text. ".repeat(3_500)}` };
  const detailed = { ...document("detailed", "video"), content: `${document("detailed").content}${"Transcript text. ".repeat(3_000)}` };
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[{ ...cached, content: "" }, { ...detailed, content: "" }]]).run, f.root, f.directory);
  const cacheDir = join(f.root, ".tmp/readwise/reading-profiles");
  await mkdir(cacheDir, { recursive: true });
  await writeJson(join(cacheDir, "source-cached.json"), {
    sourceFingerprint: buildPriorityEvidence(cached).sourceFingerprint, full_content: cached.content,
  });
  await writeJson(join(cacheDir, "source-detailed.json"), {
    sourceFingerprint: reviewHash("obsolete metadata"), content: "STALE CACHE MUST NOT BE USED",
  });
  const before = await readFile(f.judgmentPath, "utf8");
  const sources = reader(t, [], { [detailed.id]: detailed });
  await fetchSourceReview(sources.run, f.root, f.directory);
  assert.equal(sources.calls.length, 1);
  assert.ok(sources.calls[0]?.includes(detailed.id));
  for (const doc of [cached, detailed]) {
    assert.equal(await readFile(join(f.directory, "sources", `${doc.id}.md`), "utf8"), doc.content);
    const source = await readRecord(join(f.directory, "sources", `${doc.id}.json`));
    assert.equal(source.availability, "available");
    assert.equal(source.contentHash, reviewHash(doc.content));
    assert.equal(Object.hasOwn(source, "sourceStatus"), false, "download availability is not completeness");
  }
  const index = await readRecord(join(f.directory, "source-batches/index.json"));
  assert.equal(index.count, 2, "the two long sources cannot share the 80,000-character batch");
  const batchOne = await readJson(join(f.directory, "source-batches/batch-001.json"));
  const batchTwo = await readJson(join(f.directory, "source-batches/batch-002.json"));
  assert.deepEqual(batchOne, [{ id: cached.id, source: `sources/${cached.id}.md`, characters: cached.content.length }]);
  assert.deepEqual(batchTwo, [{ id: detailed.id, source: `sources/${detailed.id}.md`, characters: detailed.content.length }]);
  const noCalls = reader(t, []);
  await fetchSourceReview(noCalls.run, f.root, f.directory);
  assert.equal(noCalls.calls.length, 0, "resuming hydration preserves already available sources");
  await inspectSourceReview(f.root, f.directory);
  assert.equal((await readRecord(join(f.directory, "report.json"))).pending, 2);
  assert.equal(await readFile(f.judgmentPath, "utf8"), before);
  assert.doesNotMatch(await readFile(join(f.directory, "baseline", JUDGMENTS), "utf8"), /PRIVATE BODY|Chapter text|Transcript text/);
});

test("a matching cached source is still rechecked against live content before accepted import", async (t) => {
  const doc = document();
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[{ ...doc, content: "" }]]).run, f.root, f.directory);
  const cacheDir = join(f.root, ".tmp/readwise/reading-profiles-v2-migration");
  await mkdir(cacheDir, { recursive: true });
  await writeJson(join(cacheDir, `source-${doc.id}.json`), {
    sourceFingerprint: buildPriorityEvidence(doc).sourceFingerprint, content: doc.content,
  });
  await fetchSourceReview(reader(t, []).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(doc));
  const before = await readFile(f.judgmentPath, "utf8");
  const metadata = { ...doc, content: "" };
  await assert.rejects(importSourceReview(reader(t, [[metadata]], {
    [doc.id]: { ...doc, content: `${doc.content}New private chapter.` },
  }).run, f.root, f.directory), /hash|bron/i);
  assert.equal(await readFile(f.judgmentPath, "utf8"), before);
});

test("one failed details fetch remains a private source error while hydration continues for other IDs", async (t) => {
  const failed = document("failed");
  const good = document("good");
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[{ ...failed, content: "" }, { ...good, content: "" }]]).run, f.root, f.directory);
  await fetchSourceReview(reader(t, [], {
    failed: new Error("PRIVATE TOKEN AND BODY: simulated transport failure"), good,
  }).run, f.root, f.directory);
  const source = await readRecord(join(f.directory, "sources/failed.json"));
  assert.equal(source.availability, "error");
  assert.equal(source.content, null);
  assert.doesNotMatch(JSON.stringify(source), /PRIVATE TOKEN|simulated transport failure/);
  assert.equal(await readFile(join(f.directory, "sources/good.md"), "utf8"), good.content);
  await inspectSourceReview(f.root, f.directory);
  const report = await readRecord(join(f.directory, "report.json"));
  assert.equal(report.accepted, 0);
  assert.equal(report.pending, 2);
  assert.equal(report.errorSources, 1);
  assert.equal(report.missingSources, 0);
});

test("hydrated batches skip current accepted and draft attempts and complete new-standard judgments", async (t) => {
  const reviewed = document("reviewed");
  const blocked = document("blocked");
  const reused = document("reused");
  const pending = document("pending");
  const f = await fixture(t, config({ [reused.id]: accepted(reused) }));
  await prepareSourceReview(reader(t, [[reviewed, blocked, reused, pending]]).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(reviewed));
  const draft = assessment(blocked);
  draft.status = "draft";
  draft.sourceStatus = "partial";
  draft.readRanges = [{ start: 0, end: 10 }];
  delete draft.judgment;
  await storeAssessment(f.directory, draft);
  await fetchSourceReview(reader(t, []).run, f.root, f.directory);
  assert.deepEqual(await readJson(join(f.directory, "source-batches/batch-001.json")), [
    { id: pending.id, source: `sources/${pending.id}.md`, characters: pending.content.length },
  ]);
  assert.equal((await readRecord(join(f.directory, "source-batches/index.json"))).count, 1);
  assert.deepEqual(await readJson(join(f.directory, "assessments", `${blocked.id}.json`)), draft);
});

test("accepted import checks current preferences rather than trusting the run snapshot", async (t) => {
  const doc = document();
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(doc));
  await writeFile(f.preferencePath, `${PREFERENCES}New personal preference.\n`);
  await inspectSourceReview(f.root, f.directory);
  const report = await readRecord(join(f.directory, "report.json"));
  assert.equal(report.stale, 1);
  assert.equal(report.accepted, 0);
  const before = await readFile(f.judgmentPath, "utf8");
  await assert.rejects(importSourceReview(reader(t, [[doc]]).run, f.root, f.directory), /voorkeur|preferences/i);
  assert.equal(await readFile(f.judgmentPath, "utf8"), before);
});

test("preferences changed while fetching live sources also invalidate accepted import", async (t) => {
  const doc = document();
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(doc));
  const before = await readFile(f.judgmentPath, "utf8");
  const live = reader(t, [[doc]]);
  const run: ReadwiseExecutor<{ stdout: string }> = async (args) => {
    await writeFile(f.preferencePath, `${PREFERENCES}A concurrently changed preference.\n`);
    return live.run(args);
  };
  await assert.rejects(importSourceReview(run, f.root, f.directory), /voorkeur|preferences/i);
  assert.equal(await readFile(f.judgmentPath, "utf8"), before);
});

test("same-ID concurrent edits block the whole import and preserve both judgments and profile edits", async (t) => {
  const doc = document();
  const second = document("second");
  const old = accepted(doc);
  delete old.sourceReview;
  const f = await fixture(t, config({ [doc.id]: old }));
  await prepareSourceReview(reader(t, [[second, doc]]).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(second));
  await storeAssessment(f.directory, assessment(doc));
  const concurrent = config({ [doc.id]: { ...old, relevance: 4 }, unrelated: accepted(document("unrelated")) });
  await writeJson(f.judgmentPath, concurrent);
  const before = await readFile(f.judgmentPath, "utf8");
  const profiles = await readFile(f.profilePath, "utf8");
  await assert.rejects(importSourceReview(reader(t, [[second, doc]]).run, f.root, f.directory), /gelijktijdige wijzigingen.*article/i);
  assert.equal(await readFile(f.judgmentPath, "utf8"), before);
  assert.equal(await readFile(f.profilePath, "utf8"), profiles);
});

for (const sameId of [false, true]) {
  test(`a ${sameId ? "same-ID" : "different-ID"} config edit during the live fetch is preserved`, async (t) => {
    const doc = document();
    const old = accepted(doc);
    delete old.sourceReview;
    const f = await fixture(t, config({ [doc.id]: old }));
    await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
    await storeAssessment(f.directory, assessment(doc));
    const concurrent = sameId
      ? config({ [doc.id]: { ...old, usefulness: 4 } })
      : config({ [doc.id]: old, unrelated: accepted(document("unrelated")) });
    const live = reader(t, [[doc]]);
    const run: ReadwiseExecutor<{ stdout: string }> = async (args) => {
      // Deterministic interleaving: import has read config, but is awaiting Reader I/O.
      await writeJson(f.judgmentPath, concurrent);
      return live.run(args);
    };
    if (sameId) {
      await assert.rejects(importSourceReview(run, f.root, f.directory), /gelijktijdige wijzigingen.*article/i);
      assert.deepEqual(await readConfig(f.judgmentPath), concurrent);
    } else {
      await importSourceReview(run, f.root, f.directory);
      const imported = await readConfig(f.judgmentPath);
      assert.deepEqual(imported.items.unrelated, concurrent.items.unrelated);
      assert.equal(imported.items[doc.id]?.sourceReview?.standard, "full-source-v1");
    }
  });
}

test("a newly arrived Later ID does not turn frozen snapshot status into current Later coverage", async (t) => {
  const doc = document();
  const newDoc = document("arrived-after-prepare", "epub");
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[doc]]).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(doc));
  await importSourceReview(reader(t, [[doc, newDoc]]).run, f.root, f.directory);
  const messages: unknown[][] = [];
  const log = t.mock.method(console, "log", (...args: unknown[]) => { messages.push(args); });
  await inspectSourceReview(f.root, f.directory, [doc, newDoc]);
  log.mock.restore();
  const report = await readRecord(join(f.directory, "report.json"));
  assert.equal(report.scope, "current-later-metadata");
  assert.match(String(report.contentFreshness), /recorded-source-variants.*import rechecks live content/i);
  assert.equal(report.total, 1);
  assert.equal(report.liveTotal, 2);
  assert.equal(report.added, 1);
  assert.equal(report.removed, 0);
  assert.equal(report.pending, 1);
  assert.equal(report.accepted, 1);
  assert.equal(Object.hasOwn((await readConfig(f.judgmentPath)).items, newDoc.id), false);
  assert.deepEqual((await readRecord(join(f.directory, "selection.json"))).documentIds, [doc.id]);
  assert.match(JSON.stringify(messages), /current-later-metadata/i, "terminal status must disclose scope");
  assert.match(JSON.stringify(messages), /recorded-source-variants/i, "terminal status must disclose source freshness");
});

test("live metadata status detects removed and changed documents while preserving the frozen source history", async (t) => {
  const gone = document("gone");
  const changed = document("changed");
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [[gone, changed]]).run, f.root, f.directory);
  await storeAssessment(f.directory, assessment(gone));
  await storeAssessment(f.directory, assessment(changed));
  const sourceBefore = await readFile(join(f.directory, "sources/changed.json"), "utf8");
  await inspectSourceReview(f.root, f.directory, [{ ...changed, title: "Changed live metadata" }]);
  const report = await readRecord(join(f.directory, "report.json"));
  assert.equal(report.scope, "current-later-metadata");
  assert.deepEqual([report.total, report.liveTotal, report.added, report.removed, report.stale, report.accepted], [2, 1, 0, 1, 1, 0]);
  assert.equal(await readFile(join(f.directory, "sources/changed.json"), "utf8"), sourceBefore);
  await inspectSourceReview(f.root, f.directory, []);
  const empty = await readRecord(join(f.directory, "report.json"));
  assert.deepEqual([empty.scope, empty.liveTotal, empty.removed, empty.accepted], ["current-later-metadata", 0, 2, 0]);
});

test("status separates valid accepted, draft, rejected, stale and pending IDs without changing configs", async (t) => {
  const docs = ["accepted", "high", "draft", "rejected", "stale", "pending"].map((id) => ({ ...document(id), ...(id === "pending" ? { content: "" } : {}) }));
  const f = await fixture(t);
  await prepareSourceReview(reader(t, [docs]).run, f.root, f.directory);
  for (const doc of docs) {
    if (doc.id === "pending") { continue; }
    const a = assessment(doc);
    if (doc.id === "high") {
      a.judgment = { ...ratings(a), confidence: "high" };
      a.uncertainties = { source: [], interpretation: [], personalFit: [] };
    }
    if (doc.id === "draft" || doc.id === "rejected") { a.status = doc.id; delete a.judgment; }
    if (doc.id === "stale") { a.contentHash = reviewHash("old body"); }
    await storeAssessment(f.directory, a);
  }
  const before = await readFile(f.judgmentPath, "utf8");
  await inspectSourceReview(f.root, f.directory);
  const report = await readRecord(join(f.directory, "report.json"));
  assert.equal(report.scope, "frozen-later-snapshot");
  assert.deepEqual([report.total, report.accepted, report.draft, report.rejected, report.stale, report.pending, report.reused], [6, 2, 1, 1, 1, 1, 0]);
  assert.equal(report.medium, 1);
  assert.equal(report.high, 1);
  assert.equal(report.missingSources, 1);
  assert.equal(await readFile(f.judgmentPath, "utf8"), before);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE BODY|PRIVATE THESIS|PRIVATE REASON|PRIVATE UNCERTAINTY/);
});
