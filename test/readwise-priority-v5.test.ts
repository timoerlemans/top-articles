import assert from "node:assert/strict";
import test from "node:test";

import { buildPriorityExport, scorePriorityDocument } from "../scripts/lib/readwise-priority-v5.js";
import { judgmentSourceFingerprint, suggestedJudgmentFromHighlights } from "../scripts/lib/priority-judgments.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function document(overrides: Partial<PriorityDocument> = {}): PriorityDocument {
  return {
    id: "doc-1",
    title: "Een inhoudelijk artikel",
    summary: "Een analyse met een bruikbaar framework.",
    word_count: 1_500,
    reading_time: "12 mins",
    saved_at: "2026-01-01T00:00:00.000Z",
    category: "article",
    tags: { philosophy: {} },
    notes: "Waarom lezen: toepasbaar in mijn werk.\nBeste moment: later",
    ...overrides,
  };
}

test("v5 fingerprint negeert posities en afgeleide toplijsttags", () => {
  const base = document({ tags: { philosophy: {}, "lees-0001": {}, "aaa-top-100": {} } });
  const moved = document({ tags: { philosophy: {}, "lees-0099": {}, "aaa-top-10": {}, "aaa-top-100": {} } });
  assert.equal(judgmentSourceFingerprint(base), judgmentSourceFingerprint(moved));
});

test("v5 gebruikt een expliciet inhoudslabel en kleine sequence-fitcorrectie", () => {
  const doc = document({ id: "labeled" });
  const judgment = suggestedJudgmentFromHighlights(doc, ["This study explains an important framework for collaboration at work."]);
  const result = buildPriorityExport([doc], {
    generatedAt: "2026-09-19T00:00:00.000Z",
    judgments: { version: 1, items: { labeled: judgment } },
  });
  const item = result.items.labeled;
  assert.ok(item);
  assert.equal(item.judgmentSource, "label");
  assert.equal(item.judgmentConfidence, "low");
  assert.equal(item.sequenceScores.lees, item.score);
  assert.ok(item.sequenceScores.lees !== undefined);
});

test("v5 gebruikt fallback zonder highlight-aanwezigheid als kwaliteitsbonus", () => {
  const withoutHighlights = scorePriorityDocument(document());
  const withHighlights = scorePriorityDocument(document());
  assert.equal(withoutHighlights.judgmentSource, "fallback");
  assert.equal(withoutHighlights.score, withHighlights.score);
});

test("boeken blijven strikt exclusief in de boekreeks", () => {
  const result = buildPriorityExport([document({ id: "book", category: "epub", tags: { philosophy: {}, dutch: {} } })]);
  assert.deepEqual(result.items.book?.sequences, ["boek"]);
});
