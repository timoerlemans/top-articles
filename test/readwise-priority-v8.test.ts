import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPriorityExport,
  scorePriorityDocument,
  validatePriorityExport,
  type CoreInterestPriorityConfig,
  type PriorityTopicComponents,
} from "../scripts/lib/readwise-priority-v8.js";
import {
  buildPriorityEvidence,
  type ContentJudgment,
  type PriorityJudgmentsConfig,
} from "../scripts/lib/priority-judgments.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

const CORE_INTEREST_CONFIG: CoreInterestPriorityConfig = {
  version: 1,
  manualOrder: ["agile", "adhd", "filosofie"],
  weightByRank: [20, 16, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2],
};

function document(overrides: Partial<PriorityDocument> = {}): PriorityDocument {
  return {
    id: "doc-1",
    title: "Een inhoudelijk artikel",
    summary: "Een helder framework.",
    word_count: 1_500,
    reading_time: "8 mins",
    saved_at: "2026-01-01T00:00:00.000Z",
    category: "article",
    language: "nl",
    tags: { "lees-0001": {}, agile: {} },
    notes: "Waarom lezen: toepasbaar in mijn werk.\nBeste moment: later",
    ...overrides,
  };
}

function labeledJudgment(
  doc: PriorityDocument,
  overrides: Partial<Pick<ContentJudgment, "relevance" | "topicRelevance">> = {},
): ContentJudgment {
  const evidence = buildPriorityEvidence(doc, []);
  return {
    sourceFingerprint: evidence.sourceFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    relevance: overrides.relevance ?? 4,
    substance: 4,
    durability: 4,
    usefulness: 4,
    sequenceFit: {},
    ...(overrides.topicRelevance === undefined ? {} : { topicRelevance: overrides.topicRelevance }),
    confidence: "high",
    status: "accepted",
    rubricVersion: "semantic-v1",
    reasonCodes: ["semantic-review"],
    evidenceRefs: ["full-content"],
    judgedBy: "test",
    judgedAt: "2026-09-19T00:00:00.000Z",
  };
}

function judgmentsFor(entries: readonly [PriorityDocument, ContentJudgment][]): PriorityJudgmentsConfig {
  const items: Record<string, ContentJudgment> = {};
  for (const [doc, judgment] of entries) {
    if (doc.id) {items[doc.id] = judgment;}
  }
  return {
    version: 2,
    rubricVersion: "semantic-v1",
    items,
  };
}

function expectedTopicScore(components: PriorityTopicComponents, adjustment: number): number {
  return Math.max(0, Math.round(
    components.kerninteresse +
    components.topic_relevantie * 10 +
    components.substantie +
    components.duurzaamheid +
    components.bruikbaarheid +
    components.leeskans +
    components.nederlandse_taal +
    components.aftrek +
    adjustment,
  ));
}

test("v8 publishes global and topic-aware per-sequence score records", () => {
  const doc = document();
  const judgments = judgmentsFor([[doc, labeledJudgment(doc, { topicRelevance: { scrum: 2 } })]]);
  const result = buildPriorityExport([doc], {
    generatedAt: "2026-09-20T00:00:00.000Z",
    judgments,
    coreInterestConfig: CORE_INTEREST_CONFIG,
  });
  const item = result.items["doc-1"];

  assert.ok(item);
  assert.equal(result.model, "readwise-priority-v8");
  assert.equal(item.sequenceScores.lees?.mode, "global");
  assert.equal(item.sequenceScores.scrum?.mode, "topic");
  assert.equal(item.sequenceScores.scrum?.topicRelevance, 2);
  assert.equal(item.sequenceScores.scrum?.relevanceSource, "label");
  assert.equal(item.sequenceScores.scrum?.relevanceConfidence, "high");
  assert.deepEqual(item.sequenceScores.scrum?.components, {
    kerninteresse: item.components.kerninteresse,
    topic_relevantie: 2,
    substantie: item.components.substantie,
    duurzaamheid: item.components.duurzaamheid,
    bruikbaarheid: item.components.bruikbaarheid,
    leeskans: item.components.leeskans,
    nederlandse_taal: item.components.nederlandse_taal,
    aftrek: item.components.aftrek,
  });
  const scrumScore = item.sequenceScores.scrum;
  assert.ok(scrumScore?.components);
  assert.equal(scrumScore.score, expectedTopicScore(scrumScore.components, item.adjustment));
  assert.equal(item.sequenceScores.lees?.score, item.score);
  assert.equal(validatePriorityExport(result), true);
});

test("topic relevance replaces global relevance in the topic score", () => {
  const lowGlobal = document({ id: "low-global" });
  const highGlobal = document({ id: "high-global" });
  const judgments = judgmentsFor([
    [lowGlobal, labeledJudgment(lowGlobal, { relevance: 0, topicRelevance: { scrum: 2 } })],
    [highGlobal, labeledJudgment(highGlobal, { relevance: 4, topicRelevance: { scrum: 2 } })],
  ]);
  const low = scorePriorityDocument(lowGlobal, {}, judgments, undefined, CORE_INTEREST_CONFIG);
  const high = scorePriorityDocument(highGlobal, {}, judgments, undefined, CORE_INTEREST_CONFIG);
  const result = buildPriorityExport([lowGlobal, highGlobal], {
    generatedAt: "2026-09-20T00:00:00.000Z",
    judgments,
    coreInterestConfig: CORE_INTEREST_CONFIG,
  });

  assert.notEqual(low.score, high.score);
  assert.equal(result.items["low-global"]?.sequenceScores.scrum?.score, result.items["high-global"]?.sequenceScores.scrum?.score);
});

test("topic score determines the topic ranking and respects Agile tag weighting", () => {
  const strong = document({ id: "strong", tags: { "lees-0001": {}, facilitation: {} } });
  const weak = document({ id: "weak", tags: { "lees-0002": {}, "team coaching": {} } });
  const strongJudgment = labeledJudgment(strong, { topicRelevance: { scrum: 4 } });
  const weakJudgment = labeledJudgment(weak, { topicRelevance: { scrum: 1 } });
  const result = buildPriorityExport([strong, weak], {
    generatedAt: "2026-09-20T00:00:00.000Z",
    judgments: judgmentsFor([[strong, strongJudgment], [weak, weakJudgment]]),
    coreInterestConfig: CORE_INTEREST_CONFIG,
  });

  assert.ok(result.items.strong);
  assert.ok(result.items.weak);
  const strongScore = result.items.strong.sequenceScores.scrum?.score;
  const weakScore = result.items.weak.sequenceScores.scrum?.score;
  assert.ok(strongScore !== undefined && weakScore !== undefined);
  assert.equal(strongScore > weakScore, true);
  assert.equal(result.items.strong.positions.scrum, 1);
  assert.equal(result.items.weak.positions.scrum, 2);
});

test("gives want-to-read an extra bonus in global and topic sequence scores", () => {
  const withoutWantToRead = document({ id: "without-want-to-read" });
  const wantToRead = document({
    id: "want-to-read",
    tags: { "lees-0001": {}, agile: {}, "want-to-read": {} },
  });
  const judgments = judgmentsFor([
    [withoutWantToRead, labeledJudgment(withoutWantToRead, { topicRelevance: { scrum: 2 } })],
    [wantToRead, labeledJudgment(wantToRead, { topicRelevance: { scrum: 2 } })],
  ]);

  const withoutScore = scorePriorityDocument(withoutWantToRead, {}, judgments, undefined, CORE_INTEREST_CONFIG);
  const wantToReadScore = scorePriorityDocument(wantToRead, {}, judgments, undefined, CORE_INTEREST_CONFIG);
  const result = buildPriorityExport([withoutWantToRead, wantToRead], {
    generatedAt: "2026-09-20T00:00:00.000Z",
    judgments,
    coreInterestConfig: CORE_INTEREST_CONFIG,
  });

  assert.equal(wantToReadScore.score, withoutScore.score + 25);
  assert.match(wantToReadScore.adjustmentReason ?? "", /want-to-read/i);
  assert.equal(
    result.items["want-to-read"]?.sequenceScores.lees?.score,
    (result.items["without-want-to-read"]?.sequenceScores.lees?.score ?? 0) + 25,
  );
  assert.equal(
    result.items["want-to-read"]?.sequenceScores.scrum?.score,
    (result.items["without-want-to-read"]?.sequenceScores.scrum?.score ?? 0) + 25,
  );
});

test("treats want-to-read as manual curation instead of content evidence", () => {
  const withoutWantToRead = document();
  const wantToRead = document({
    tags: { "lees-0001": {}, agile: {}, "want-to-read": {} },
  });

  assert.equal(
    buildPriorityEvidence(withoutWantToRead).sourceFingerprint,
    buildPriorityEvidence(wantToRead).sourceFingerprint,
  );
});

test("v8 validation rejects a tampered sequence score", () => {
  const doc = document();
  const judgments = judgmentsFor([[doc, labeledJudgment(doc, { topicRelevance: { scrum: 2 } })]]);
  const result = buildPriorityExport([doc], {
    generatedAt: "2026-09-20T00:00:00.000Z",
    judgments,
    coreInterestConfig: CORE_INTEREST_CONFIG,
  });
  const tampered = structuredClone(result);
  const item = tampered.items["doc-1"];
  assert.ok(item);
  const sequenceScore = item.sequenceScores.scrum;
  assert.ok(sequenceScore);
  sequenceScore.score += 1;
  assert.throws(
    () => validatePriorityExport(tampered, [doc], {}, judgments, CORE_INTEREST_CONFIG),
    /v8|export|score|reeks/i,
  );
});
