import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoreInterestPriority,
  coreInterestBonus,
  resolveCoreInterestMatches,
  type CoreInterestPriorityConfig,
} from "../scripts/lib/core-interest-priority.js";
import {
  buildPriorityEvidence,
  type ContentJudgment,
  type PriorityJudgmentsConfig,
} from "../scripts/lib/priority-judgments.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

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
    tags: {},
    notes: "Waarom lezen: toepasbaar in mijn werk.\nBeste moment: later",
    ...overrides,
  };
}

function semanticJudgment(doc: PriorityDocument, reasonCodes: string[] = []): ContentJudgment {
  const evidence = buildPriorityEvidence(doc, []);
  return {
    sourceFingerprint: evidence.sourceFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    relevance: 4,
    substance: 4,
    durability: 4,
    usefulness: 4,
    sequenceFit: {},
    confidence: "high",
    status: "accepted",
    rubricVersion: "semantic-v1",
    reasonCodes,
    evidenceRefs: ["full-content"],
    judgedBy: "test",
    judgedAt: "2026-09-19T00:00:00.000Z",
  };
}

const config: CoreInterestPriorityConfig = {
  version: 1,
  manualOrder: ["agile", "adhd", "filosofie"],
  weightByRank: [20, 16, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2],
};

test("one ambigue tag awards only its explicit primary core interest", () => {
  const oneAmbiguousTag = document({ tags: { "political philosophy": {} } });

  assert.deepEqual(resolveCoreInterestMatches(oneAmbiguousTag, semanticJudgment(oneAmbiguousTag)), [
    {
      interest: "filosofie",
      evidence: [{ kind: "readwise-tag", source: "political philosophy", label: "politieke filosofie" }],
      qualityScore: 112,
    },
  ]);
});

test("separate tags can independently award separate core interests", () => {
  const twoIndependentSignals = document({ tags: { philosophy: {}, "political ideologies": {} } });

  assert.deepEqual(
    resolveCoreInterestMatches(twoIndependentSignals, semanticJudgment(twoIndependentSignals)).map(({ interest }) => interest),
    ["filosofie", "ideologie"],
  );
});

test("aliases for one core interest are deduplicated", () => {
  const duplicateAliases = document({ tags: { philosophy: {}, "critical thinking & epistemology": {} } });
  const matches = resolveCoreInterestMatches(duplicateAliases, semanticJudgment(duplicateAliases));

  assert.equal(matches.filter(({ interest }) => interest === "filosofie").length, 1);
  assert.equal(matches[0]?.evidence.length, 2);
});

test("manual anchors stay first and derived interests use deterministic quality and coverage", () => {
  const history = document({ id: "history", tags: { history: {} } });
  const writing = document({ id: "writing", tags: { writing: {} } });
  const judgments: PriorityJudgmentsConfig = {
    version: 2,
    rubricVersion: "semantic-v1",
    items: {
      history: semanticJudgment(history),
      writing: { ...semanticJudgment(writing), relevance: 1, substance: 1, durability: 1, usefulness: 1 },
    },
  };

  const priority = buildCoreInterestPriority([history, writing], judgments, config, "2026-09-19T00:00:00.000Z");

  assert.deepEqual(priority.order.slice(0, 3), ["agile", "adhd", "filosofie"]);
  assert.equal(priority.order[3], "geschiedenis");
  assert.ok(priority.entries.find((entry) => entry.interest === "geschiedenis")?.evidenceDocumentCount === 1);
  assert.equal(priority.entries.find((entry) => entry.interest === "agile")?.source, "manual");
  assert.equal(priority.entries.find((entry) => entry.interest === "geschiedenis")?.source, "derived");
});

test("invalid config cannot duplicate anchors or use non-positive weights", () => {
  assert.throws(
    () => buildCoreInterestPriority([], {}, { ...config, manualOrder: ["agile", "agile", "adhd"] }, "2026-09-19T00:00:00.000Z"),
    /handmatige kerninteresses/i,
  );
  assert.throws(
    () => buildCoreInterestPriority([], {}, { ...config, weightByRank: [20, 0] }, "2026-09-19T00:00:00.000Z"),
    /gewicht/i,
  );
});

test("all independently evidenced core interests stack their configured weights", () => {
  const priority = buildCoreInterestPriority([], {}, config, "2026-09-19T00:00:00.000Z");
  const matches = [
    { interest: "agile" as const, evidence: [], qualityScore: 112 },
    { interest: "adhd" as const, evidence: [], qualityScore: 112 },
    { interest: "filosofie" as const, evidence: [], qualityScore: 112 },
  ];

  const result = coreInterestBonus(matches, priority);

  assert.equal(result.bonus, 48);
  assert.deepEqual(result.matches.map(({ interest, weight }) => [interest, weight]), [
    ["agile", 20],
    ["adhd", 16],
    ["filosofie", 12],
  ]);
});
