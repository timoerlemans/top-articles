import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPriorityExport,
  scorePriorityDocument,
  type ContentJudgment,
} from "../scripts/lib/readwise-priority-v6.js";
import { buildPriorityEvidence } from "../scripts/lib/priority-judgments.js";
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
    tags: { philosophy: {}, dutch: {}, "must-read": {}, shortlist: {} },
    notes: "Waarom lezen: toepasbaar in mijn werk.\nBeste moment: later",
    ...overrides,
  };
}

function judgment(doc: PriorityDocument): ContentJudgment {
  const evidence = buildPriorityEvidence(doc, [{ id: "h1", text: "Een bruikbaar principe." }]);
  return {
    sourceFingerprint: evidence.sourceFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    relevance: 4,
    substance: 4,
    durability: 4,
    usefulness: 4,
    sequenceFit: { lees: 0, dutch: 2 },
    confidence: "high",
    status: "accepted",
    rubricVersion: "semantic-v1",
    reasonCodes: ["semantic-review"],
    evidenceRefs: ["summary", "highlight:h1"],
    judgedBy: "codex",
    judgedAt: "2026-09-19T00:00:00.000Z",
  };
}

test("v6 curation signals are context only and do not change score", () => {
  const withoutCuration = scorePriorityDocument(document({ tags: { philosophy: {}, dutch: {} } }));
  const withCuration = scorePriorityDocument(document());
  assert.equal(withoutCuration.score, withCuration.score);
  assert.equal("curatie" in withCuration.components, false);
});

test("v6 applies the semantic rubric weights and sequence fit independently", () => {
  const doc = document({ id: "labeled" });
  const result = buildPriorityExport([doc], {
    generatedAt: "2026-09-19T00:00:00.000Z",
    judgments: { version: 2, rubricVersion: "semantic-v1", items: { labeled: judgment(doc) } },
  });
  const item = result.items.labeled;
  assert.ok(item);
  assert.equal(item.score, 122);
  assert.equal(item.sequenceScores.lees, 122);
  assert.equal(item.sequenceScores.dutch, 128);
  assert.equal(item.judgmentSource, "label");
  assert.equal(item.judgmentConfidence, "high");
});

test("v6 never rewards highlight count or generated provenance", () => {
  const doc = document();
  const noJudgment = scorePriorityDocument(doc);
  const sameDoc = scorePriorityDocument(doc);
  assert.equal(noJudgment.score, sameDoc.score);
  assert.equal(noJudgment.judgmentSource, "fallback");
});

test("v6 keeps books exclusive to the book sequence", () => {
  const result = buildPriorityExport([document({ id: "book", category: "epub", tags: { philosophy: {}, dutch: {}, book: {} } })]);
  assert.deepEqual(result.items.book?.sequences, ["boek"]);
});

test("v6 preserves light-reading as a sequence membership signal without scoring it", () => {
  const result = buildPriorityExport([document({ id: "light", tags: { philosophy: {}, "light-reading": {} } })]);
  assert.ok(result.items.light?.sequences.includes("luchtig"));
  assert.equal(result.items.light?.components.nederlandse_taal, 5);
});
