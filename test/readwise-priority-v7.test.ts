import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPriorityExport,
  scorePriorityDocument,
  validatePriorityExport,
  type CoreInterestPriorityConfig,
} from "../scripts/lib/readwise-priority-v7.js";
import {
  scorePriorityDocument as scorePriorityDocumentV6,
  type PriorityScoreResult as PriorityScoreResultV6,
} from "../scripts/lib/readwise-priority-v6.js";
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
    tags: { "lees-0001": {} },
    notes: "Waarom lezen: toepasbaar in mijn werk.\nBeste moment: later",
    ...overrides,
  };
}

function labeledJudgment(doc: PriorityDocument, sequenceFit: ContentJudgment["sequenceFit"] = {}): ContentJudgment {
  const evidence = buildPriorityEvidence(doc, []);
  return {
    sourceFingerprint: evidence.sourceFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    relevance: 4,
    substance: 4,
    durability: 4,
    usefulness: 4,
    sequenceFit,
    confidence: "high",
    status: "accepted",
    rubricVersion: "semantic-v1",
    reasonCodes: ["semantic-review"],
    evidenceRefs: ["full-content"],
    judgedBy: "test",
    judgedAt: "2026-09-19T00:00:00.000Z",
  };
}

function judgmentsFor(documents: readonly PriorityDocument[], sequenceFit: ContentJudgment["sequenceFit"] = {}): PriorityJudgmentsConfig {
  const items: Record<string, ContentJudgment> = {};
  for (const doc of documents) {
    if (doc.id) {items[doc.id] = labeledJudgment(doc, sequenceFit);}
  }
  return {
    version: 2,
    rubricVersion: "semantic-v1",
    items,
  };
}

test("v7 stacks independently evidenced core interests on top of the v6 score", () => {
  const doc = document({ tags: { "lees-0001": {}, agile: {}, adhd: {}, philosophy: {} } });
  const judgments = judgmentsFor([doc], { lees: 1 });
  const v6 = scorePriorityDocumentV6(doc, {}, judgments);
  const v7 = scorePriorityDocument(doc, {}, judgments, undefined, CORE_INTEREST_CONFIG);

  assert.equal(v7.components.kerninteresse, 48);
  assert.equal(v7.baseScore, v6.baseScore + 48);
  assert.equal(v7.score, v6.score + 48);
  assert.deepEqual(v7.coreInterestMatches.map(({ interest, weight }) => [interest, weight]), [
    ["filosofie", 12],
    ["adhd", 16],
    ["agile", 20],
  ]);
});

test("the stacked core-interest bonus also changes sequence ranking", () => {
  const oneInterest = document({ id: "one", tags: { "lees-0001": {}, agile: {} } });
  const threeInterests = document({ id: "three", tags: { "lees-0002": {}, agile: {}, adhd: {}, philosophy: {} } });
  const judgments = judgmentsFor([oneInterest, threeInterests], { lees: 2 });
  const result = buildPriorityExport([oneInterest, threeInterests], {
    generatedAt: "2026-09-19T00:00:00.000Z",
    judgments,
    coreInterestConfig: CORE_INTEREST_CONFIG,
  });

  assert.ok(result.items.three);
  assert.ok(result.items.one);
  assert.equal(result.items.three.score - result.items.one.score, 28);
  assert.equal(result.items.three.sequenceScores.lees, result.items.three.score + 6);
  assert.equal(result.items.three.positions.lees, 1);
  assert.equal(result.items.one.positions.lees, 2);
});

test("scrum ranking gives scrum-master signals more weight than broad team signals", () => {
  const documents = [
    document({ id: "agile", tags: { "lees-0001": {}, agile: {} } }),
    document({ id: "coaching", tags: { "lees-0002": {}, "team coaching": {} } }),
    document({ id: "team-dynamics", tags: { "lees-0003": {}, "team dynamics & collaboration": {} } }),
    document({ id: "organizational-behavior", tags: { "lees-0004": {}, "organizational behavior & culture": {} } }),
  ];
  const judgments = judgmentsFor(documents, { scrum: 0 });
  const result = buildPriorityExport(documents, {
    generatedAt: "2026-09-19T00:00:00.000Z",
    judgments,
    coreInterestConfig: CORE_INTEREST_CONFIG,
  });

  const agile = result.items.agile;
  const coaching = result.items.coaching;
  const teamDynamics = result.items["team-dynamics"];
  const organizationalBehavior = result.items["organizational-behavior"];
  assert.ok(agile);
  assert.ok(coaching);
  assert.ok(teamDynamics);
  assert.ok(organizationalBehavior);
  assert.equal(agile.score, teamDynamics.score);
  assert.equal(coaching.score, organizationalBehavior.score);
  assert.ok(agile.sequences.includes("scrum"));
  assert.ok(coaching.sequences.includes("scrum"));
  assert.ok(!teamDynamics.sequences.includes("scrum"));
  assert.ok(!organizationalBehavior.sequences.includes("scrum"));
  assert.ok((agile.sequenceScores.scrum ?? 0) > (teamDynamics.sequenceScores.scrum ?? 0));
  assert.ok((coaching.sequenceScores.scrum ?? 0) > (organizationalBehavior.sequenceScores.scrum ?? 0));
  assert.equal(agile.sequenceScores.lees, teamDynamics.sequenceScores.lees);
  assert.equal(coaching.sequenceScores.lees, organizationalBehavior.sequenceScores.lees);
});

test("scrum tag bonuses use the strongest matching signal instead of stacking aliases", () => {
  const doc = document({
    tags: {
      "lees-0001": {},
      agile: {},
      "team coaching": {},
      "team dynamics & collaboration": {},
      "organizational behavior & culture": {},
    },
  });
  const result = buildPriorityExport([doc], {
    generatedAt: "2026-09-19T00:00:00.000Z",
    judgments: judgmentsFor([doc], { scrum: 0 }),
    coreInterestConfig: CORE_INTEREST_CONFIG,
  });

  assert.ok(result.items["doc-1"]);
  assert.equal(result.items["doc-1"].sequenceScores.scrum, result.items["doc-1"].score + 12);
});

test("a document without core-interest evidence keeps the v6 components and gets no bonus", () => {
  const doc = document({ tags: { "lees-0001": {}, dutch: {} } });
  const judgments = judgmentsFor([doc]);
  const v6 = scorePriorityDocumentV6(doc, {}, judgments);
  const v7 = scorePriorityDocument(doc, {}, judgments, undefined, CORE_INTEREST_CONFIG);

  assert.equal(v7.components.kerninteresse, 0);
  for (const key of Object.keys(v6.components) as Array<keyof PriorityScoreResultV6["components"]>) {
    assert.equal(v7.components[key], v6.components[key]);
  }
  assert.equal(v7.score, v6.score);
});

test("v7 validation rejects tampered interest bonus, position, and ranking", () => {
  const doc = document({ tags: { "lees-0001": {}, agile: {}, philosophy: {} } });
  const judgments = judgmentsFor([doc]);
  const exportData = buildPriorityExport([doc], {
    generatedAt: "2026-09-19T00:00:00.000Z",
    judgments,
    coreInterestConfig: CORE_INTEREST_CONFIG,
  });

  const bonusTampered = structuredClone(exportData);
  const bonusItem = bonusTampered.items["doc-1"];
  assert.ok(bonusItem);
  bonusItem.components.kerninteresse += 1;
  assert.throws(
    () => validatePriorityExport(bonusTampered, [doc], {}, judgments, CORE_INTEREST_CONFIG),
    /v7|export|kerninteresse|interest/i,
  );

  const positionTampered = structuredClone(exportData);
  const positionItem = positionTampered.items["doc-1"];
  assert.ok(positionItem);
  positionItem.positions.lees = 2;
  assert.throws(
    () => validatePriorityExport(positionTampered, [doc], {}, judgments, CORE_INTEREST_CONFIG),
    /v7-score|positie|position/i,
  );

  const rankingTampered = structuredClone(exportData);
  rankingTampered.coreInterestPriority.order.reverse();
  assert.throws(
    () => validatePriorityExport(rankingTampered, [doc], {}, judgments, CORE_INTEREST_CONFIG),
    /v7|export|kerninteresse|interest/i,
  );
});
