import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPriorityExport, scorePriorityDocument, validatePriorityExport } from "../scripts/lib/readwise-priority-v8.js";
import type { PriorityDocument, PriorityExportOptions } from "../scripts/lib/readwise-priority-v8.js";
import { buildPriorityExport as buildV6 } from "../scripts/lib/readwise-priority-v6.js";
import { buildTopicPriorityImpactReport } from "../scripts/lib/topic-priority-report.js";
import { buildCoreInterestImpactReport } from "../scripts/lib/core-interest-report.js";
import { buildPriorityTagPlan } from "../scripts/lib/priority-tag-plan.js";
import type { PriorityTagDocument } from "../scripts/lib/priority-tag-plan.js";
import { buildArchivePlan } from "../scripts/lib/archive-plan.js";
import type { PriorityJudgmentsConfig } from "../scripts/lib/priority-judgments.js";
import type { PriorityOverridesConfig } from "../scripts/lib/readwise-priority-v8.js";

// Frozen regression snapshot, migrated for the deliberate <5-minute policy.
// Migration audited all document components, evidence, and adjustments before updating derived plans.
const fixture = JSON.parse(readFileSync("test/fixtures/current-priority-baseline.json", "utf8")) as {
  documents: PriorityTagDocument[];
  options: PriorityExportOptions & { generatedAt: string; judgments: PriorityJudgmentsConfig; overrides: PriorityOverridesConfig };
  exported: unknown; empty: unknown;
  standalone: { document: PriorityDocument; score: unknown }[];
  topicReport: unknown; coreReport: unknown; tagPlan: unknown; archivePlan: unknown;
};

test("current priority preserves the complete serialized export and standalone scores", () => {
  assert.equal(JSON.stringify(buildPriorityExport(fixture.documents, fixture.options)), JSON.stringify(fixture.exported));
  assert.equal(JSON.stringify(buildPriorityExport([], { generatedAt: fixture.options.generatedAt })), JSON.stringify(fixture.empty));
  for (const { document, score } of fixture.standalone) {
    assert.equal(JSON.stringify(scorePriorityDocument(document)), JSON.stringify(score));
  }
});

test("current priority preserves historical reports and downstream plan hashes", () => {
  const { documents, options } = fixture;
  const exported = buildPriorityExport(documents, options);
  assert.deepEqual(buildTopicPriorityImpactReport(documents, options.judgments, options.generatedAt, options.overrides), fixture.topicReport);
  assert.deepEqual(buildCoreInterestImpactReport(documents, buildV6(documents, options), exported), fixture.coreReport);
  assert.deepEqual(buildPriorityTagPlan(documents, [], options), fixture.tagPlan);
  assert.deepEqual(buildArchivePlan(documents, options.overrides, { generatedAt: options.generatedAt, judgments: options.judgments }), fixture.archivePlan);
});

test("current priority rejects invalid source identity, dates, books, and conflicting position tags", () => {
  const doc = fixture.documents[0];
  assert.ok(doc);
  for (const docs of [[{ ...doc, id: null }], [doc, doc], [{ ...doc, saved_at: "invalid" }],
    [{ ...doc, category: "video", tags: { books: {} } }],
    [{ ...doc, tags: { "lees-0001": {}, "lees-0002": {} } }],
    [{ ...doc, tags: [{ name: "must-read" }] }]]) {
    assert.throws(() => buildPriorityExport(docs, fixture.options));
  }
});

test("current priority rejects export corruption with and without source comparison", () => {
  const exported = buildPriorityExport(fixture.documents, fixture.options);
  for (const mutate of [
    (item: typeof exported.items[string]) => { item.components.substantie += 1; },
    (item: typeof exported.items[string]) => { item.tier = "laag"; item.score = 500; },
    (item: typeof exported.items[string]) => { item.positions.lees = 99; },
    (item: typeof exported.items[string]) => { const match = item.coreInterestMatches[0]; assert.ok(match); match.weight += 1; },
    (item: typeof exported.items[string]) => { const score = item.sequenceScores.scrum; assert.ok(score); score.score += 1; },
  ]) {
    const corrupted = structuredClone(exported);
    const item = corrupted.items.agile;
    assert.ok(item);
    mutate(item);
    assert.throws(() => validatePriorityExport(corrupted));
    assert.throws(() => validatePriorityExport(corrupted, fixture.documents, fixture.options.overrides, fixture.options.judgments));
  }
  assert.equal(validatePriorityExport(exported, []), true);
  assert.throws(() => validatePriorityExport(exported, fixture.documents.slice(1), fixture.options.overrides, fixture.options.judgments));
});

test("current priority runs when historical model modules are unavailable", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "priority-independent-"));
  const resultPath = join(directory, "result.txt");
  const moduleUrl = new URL("../scripts/lib/readwise-priority-v8.js", import.meta.url).href;
  const script = `
    import { registerHooks } from "node:module";
    registerHooks({ resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (/readwise-priority-v[23567]\\.js$/.test(resolved.url)) {
        throw new Error("Historical model unavailable: " + resolved.url);
      }
      return resolved;
    }});
    const { buildPriorityExport, validatePriorityExport } = await import(${JSON.stringify(moduleUrl)});
    const docs = [{ id: "independent", category: "article", title: "Team coaching", tags: { scrum: {} }, saved_at: "2026-01-01" }];
    const result = buildPriorityExport(docs, { generatedAt: "2026-10-10" });
    if (!result.items.independent.sequenceScores.scrum || !validatePriorityExport(result, docs)) throw new Error("Missing result");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(${JSON.stringify(resultPath)}, result.model);
  `;
  try {
    execFileSync(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(readFileSync(resultPath, "utf8"), "readwise-priority-v8");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("current priority ignores opaque tag metadata, including cyclic values", () => {
  const metadata: Record<string, unknown> = {};
  metadata.self = metadata;
  const minimal = fixture.standalone.find(({ document }) => document.title === "Minimal");
  assert.ok(minimal);
  assert.deepEqual(scorePriorityDocument({ ...minimal.document, tags: { neutral: metadata } }), minimal.score);
});

test("current priority preserves tier thresholds and global clipping before sequence fit", async () => {
  const { judgmentSourceFingerprint } = await import("../scripts/lib/priority-judgments.js");
  const doc = { id: "threshold", title: "Neutral", summary: "Contents", category: "article", word_count: 1000, reading_time: null, saved_at: "2026-01-01" };
  const judgments = { threshold: { sourceFingerprint: judgmentSourceFingerprint(doc), relevance: 0, substance: 0, durability: 0, usefulness: 0, sequenceFit: { lees: 2 }, confidence: "high", status: "accepted", reasonCodes: [] } } as PriorityJudgmentsConfig["items"];
  for (const [adjustment, tier] of [[39, "laag"], [40, "midden"], [69, "midden"], [70, "hoog"]] as const) {
    const result = buildPriorityExport([doc], { judgments, overrides: { threshold: { adjustment, reason: "Threshold check" } } });
    const item = result.items.threshold;
    assert.ok(item);
    assert.equal(item.baseScore, 0);
    assert.equal(item.score, adjustment);
    assert.equal(item.tier, tier);
    assert.equal(item.sequenceScores.lees?.score, adjustment + 6);
  }
  const clipped = buildPriorityExport([doc], { judgments, overrides: { threshold: { adjustment: -100, reason: "Clip check" } } }).items.threshold;
  assert.ok(clipped);
  assert.equal(clipped.score, 0);
  assert.equal(clipped.sequenceScores.lees?.score, 6);
});

test("current priority accepts legacy want-to-read fingerprints after feedback is appended", async () => {
  const { createHash } = await import("node:crypto");
  const doc = { id: "legacy", title: "Neutral", summary: "Contents", notes: "Some notes.  \n\nFeedback: Meer filosofie.", language: null, reading_time: null, word_count: 1000, category: "article", saved_at: "2026-01-01", tags: { "must-read": {}, "want-to-read": {} } };
  // The old canonical form retained want-to-read and the original note whitespace.
  const sourceFingerprint = createHash("sha256").update(JSON.stringify({ id: "legacy", title: "Neutral", summary: "Contents", notes: "Some notes.  ", language: null, reading_time: null, word_count: 1000, category: "article", tags: ["want-to-read"] })).digest("hex");
  const judgments = { legacy: { sourceFingerprint, relevance: 3, substance: 2, durability: 4, usefulness: 1, sequenceFit: {}, confidence: "high", status: "accepted", reasonCodes: ["legacy-review"] } } as PriorityJudgmentsConfig["items"];
  const item = buildPriorityExport([doc], { judgments }).items.legacy;
  assert.ok(item);
  assert.equal(item.judgmentSource, "label");
  assert.equal(item.baseScore, 71);
  assert.equal(item.adjustment, 80);
  assert.equal(item.score, 151);
});

test("current priority validates per-sequence mode and membership against the sources", () => {
  const original = buildPriorityExport(fixture.documents, fixture.options);
  for (const mutate of [
    (item: typeof original.items[string]) => { const score = item.sequenceScores.scrum; assert.ok(score); score.mode = "global"; },
    (item: typeof original.items[string]) => { item.sequences = []; item.sequenceScores = {}; item.positions = {}; },
  ]) {
    const corrupted = structuredClone(original);
    const item = corrupted.items.agile;
    assert.ok(item);
    mutate(item);
    assert.throws(() => validatePriorityExport(corrupted, fixture.documents, fixture.options.overrides, fixture.options.judgments));
  }
});
