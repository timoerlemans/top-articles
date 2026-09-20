import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoreInterestImpactReport,
  formatCoreInterestImpactMarkdown,
} from "../scripts/lib/core-interest-report.js";
import { buildPriorityExport as buildPriorityExportV6 } from "../scripts/lib/readwise-priority-v6.js";
import { buildPriorityExport as buildPriorityExportV8 } from "../scripts/lib/readwise-priority-v8.js";
import { buildPriorityEvidence, type ContentJudgment, type PriorityJudgmentsConfig } from "../scripts/lib/priority-judgments.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function document(id: string, savedAt: string, tags: Record<string, unknown>): PriorityDocument {
  return {
    id,
    title: id,
    summary: "Een inhoudelijk artikel.",
    saved_at: savedAt,
    category: "article",
    reading_time: "8 mins",
    word_count: 1_000,
    tags,
  };
}

function judgment(doc: PriorityDocument): ContentJudgment {
  const evidence = buildPriorityEvidence(doc, []);
  return {
    sourceFingerprint: evidence.sourceFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    relevance: 4,
    substance: 4,
    durability: 4,
    usefulness: 4,
    sequenceFit: { lees: 0 },
    confidence: "high",
    status: "accepted",
    rubricVersion: "semantic-v1",
    reasonCodes: ["semantic-review"],
    evidenceRefs: ["full-content"],
    judgedBy: "test",
    judgedAt: "2026-09-19T00:00:00.000Z",
  };
}

function judgmentsFor(documents: readonly PriorityDocument[]): PriorityJudgmentsConfig {
  const items: Record<string, ContentJudgment> = {};
  for (const doc of documents) {
    if (doc.id) {items[doc.id] = judgment(doc);}
  }
  return { version: 2, rubricVersion: "semantic-v1", items };
}

test("impactrapport toont rangorde, gestapelde scoreverschillen en top-100-beweging", () => {
  const documents = [
    document("exit", "2026-01-01T00:00:00.000Z", { "lees-0001": {} }),
    document("steady", "2026-01-02T00:00:00.000Z", { "lees-0002": {} }),
    document("target", "2026-01-03T00:00:00.000Z", { "lees-0003": {}, agile: {}, adhd: {}, philosophy: {} }),
  ];
  const judgments = judgmentsFor(documents);
  const before = buildPriorityExportV6(documents, { generatedAt: "2026-09-19T00:00:00.000Z", judgments });
  const after = buildPriorityExportV8(documents, { generatedAt: "2026-09-19T00:00:00.000Z", judgments });

  const targetBefore = before.items.target;
  const steadyBefore = before.items.steady;
  const exitBefore = before.items.exit;
  const targetAfter = after.items.target;
  const steadyAfter = after.items.steady;
  const exitAfter = after.items.exit;
  assert.ok(targetBefore && steadyBefore && exitBefore && targetAfter && steadyAfter && exitAfter);
  targetBefore.positions.lees = 101;
  steadyBefore.positions.lees = 2;
  exitBefore.positions.lees = 1;
  targetAfter.positions.lees = 1;
  steadyAfter.positions.lees = 2;
  exitAfter.positions.lees = 101;

  const report = buildCoreInterestImpactReport(documents, before, after, "2026-09-19T00:00:00.000Z");

  assert.deepEqual(report.interests.slice(0, 3).map(({ interest, rank, weight }) => [interest, rank, weight]), [
    ["agile", 1, 20],
    ["adhd", 2, 16],
    ["filosofie", 3, 12],
  ]);
  const targetDelta = report.scoreDeltas.find(({ id }) => id === "target");
  assert.ok(targetDelta);
  assert.equal(targetDelta.coreInterestBonus, 48);
  assert.equal(targetDelta.scoreDelta, 48);
  assert.deepEqual(report.sequences.lees.entries.map(({ id }) => id), ["target"]);
  assert.deepEqual(report.sequences.lees.exits.map(({ id }) => id), ["exit"]);
  assert.equal(report.largestMovers[0]?.id, "target");
});

test("impactrapport maakt expliciet dat Readwise-posities geen interessebewijs zijn", () => {
  const documents = [document("one", "2026-01-01T00:00:00.000Z", { "lees-0001": {}, agile: {} })];
  const judgments = judgmentsFor(documents);
  const before = buildPriorityExportV6(documents, { generatedAt: "2026-09-19T00:00:00.000Z", judgments });
  const after = buildPriorityExportV8(documents, { generatedAt: "2026-09-19T00:00:00.000Z", judgments });
  const markdown = formatCoreInterestImpactMarkdown(buildCoreInterestImpactReport(documents, before, after, "2026-09-19T00:00:00.000Z"));

  assert.match(markdown, /Readwise-posities zijn alleen vergelijkingsuitkomst/);
  assert.doesNotMatch(markdown, /interesse.*afgeleid.*positie/i);
});
