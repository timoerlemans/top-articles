import assert from "node:assert/strict";
import test from "node:test";

import { buildPriorityExport, sequencesForDocument } from "../scripts/lib/readwise-priority-v8.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";
import { buildPriorityEvidence, type ContentJudgment } from "../scripts/lib/priority-judgments.js";
import { buildUnifiedLists } from "../scripts/lib/unified-lists.js";

function document(id: string, overrides: Partial<PriorityDocument> = {}): PriorityDocument {
  return { id, title: "Een essay", summary: "Een inhoudelijke analyse.", category: "article", word_count: 1500,
    reading_time: "8 mins", saved_at: "2026-01-01T00:00:00.000Z", tags: {}, ...overrides };
}

function philosophyScore(doc: PriorityDocument) {
  const item = buildPriorityExport([doc]).items[doc.id ?? ""];
  return item?.sequenceScores.philosophy;
}

test("philosophy membership recognizes focused content and excludes books and position tags", () => {
  assert.ok(sequencesForDocument(document("political", { tags: { "political philosophy": {} } })).includes("philosophy"));
  assert.ok(sequencesForDocument(document("mind", { title: "Vrije wil versus determinisme" })).includes("philosophy"));
  assert.ok(!sequencesForDocument(document("book", { category: "epub", tags: { anarchism: {} } })).includes("philosophy"));
  assert.ok(!sequencesForDocument(document("positions", { tags: { "philosophy-001": {}, "aaa-philosophy-top-10": {}, "want-to-read": {} } })).includes("philosophy"));
});

test("philosophy fallback follows the personal hierarchy and remains low confidence", () => {
  for (const [tag, expected] of [["political philosophy", 4], ["philosophy of mind", 3], ["ethics", 2], ["philosophy", 1]] as const) {
    const score = philosophyScore(document(tag, { tags: { [tag]: {} } }));
    assert.equal(score?.topicRelevance, expected, tag);
    assert.equal(score?.relevanceSource, "fallback", tag);
    assert.equal(score?.relevanceConfidence, "low", tag);
  }
});

test("specific source content raises broad philosophy evidence while saturated topics stay low", () => {
  assert.equal(philosophyScore(document("graeber", { tags: { philosophy: {} }, summary: "Graeber onderzoekt anarchisme, wederzijdse hulp en gemeenschapsvorming." }))?.topicRelevance, 4);
  assert.equal(philosophyScore(document("language", { title: "Hoe taalfilosofie betekenis verklaart" }))?.topicRelevance, 3);
  assert.equal(philosophyScore(document("stoic", { tags: { stoicism: {} } }))?.topicRelevance, 1);
  assert.equal(philosophyScore(document("arendt", { title: "Hannah Arendt over totalitarisme", tags: { "political philosophy": {} } }))?.topicRelevance, 1);
  assert.equal(philosophyScore(document("work", { title: "Arendt: het onderscheid tussen arbeid en werk", tags: { philosophy: {} } }))?.topicRelevance, 4);
});

test("generated reading decisions and feedback do not invent philosophical content", () => {
  const doc = document("unrelated", { title: "Een recept", notes: "Waarom lezen: Raakt je interesse in anarchisme en filosofie.\nBeste moment: analytisch\n\nEen recept voor soep.\n\nFeedback: Ik wil meer taalfilosofie." });
  assert.ok(!sequencesForDocument(doc).includes("philosophy"));
  for (const label of ["Waarom lezen", "Waarom skippen", "Aanbeveling", "Beste moment"]) {
    const notes = `${label}:\nRaakt je interesse in anarchisme.\nNog een regel over taalfilosofie.\n\nEen recept voor soep.`;
    assert.ok(!sequencesForDocument(document(label, { title: "Een recept", notes })).includes("philosophy"), label);
    assert.equal(philosophyScore(document(label, { notes: `${notes}\n\nInhoudelijke notitie over vrije wil.` }))?.topicRelevance, 3, label);
  }
});

test("AI ethics content respects saturation while concrete preferred questions remain relevant", () => {
  for (const title of ["The ethics of artificial intelligence", "AI ethics", "Ethiek van kunstmatige intelligentie", "AI-ethiek"]) {
    assert.equal(philosophyScore(document(title, { title, summary: "Can machines make moral decisions?", tags: { "political philosophy": {}, ethics: {} } }))?.topicRelevance, 1, title);
  }
  assert.equal(philosophyScore(document("ai-mind", { title: "AI ethics and the hard problem of consciousness", tags: { ethics: {} } }))?.topicRelevance, 3);
});

test("ambiguous surnames and ordinary Dutch words do not create philosophy membership", () => {
  for (const title of ["Goldman Sachs onderzoekt obligaties", "Zet de soep aan de kant"]) {
    assert.ok(!sequencesForDocument(document("unrelated", { title })).includes("philosophy"), title);
  }
});

test("a semantic philosophy rating outranks global relevance in its family", () => {
  const docs = [document("generic", { tags: { philosophy: {} } }), document("preferred", { tags: { philosophy: {} } })];
  const items: Record<string, ContentJudgment> = {};
  for (const doc of docs) {
    const evidence = buildPriorityEvidence(doc);
    items[doc.id ?? ""] = { sourceFingerprint: evidence.sourceFingerprint, evidenceFingerprint: evidence.evidenceFingerprint,
      relevance: doc.id === "generic" ? 4 : 1, substance: 3, durability: 3, usefulness: 2, sequenceFit: {},
      topicRelevance: { philosophy: doc.id === "generic" ? 1 : 4 }, confidence: "high", status: "accepted",
      reasonCodes: ["semantic-review"], judgedBy: "test", judgedAt: "2026-10-10T00:00:00.000Z" };
  }
  const priority = buildPriorityExport(docs, { judgments: { version: 2, rubricVersion: "semantic-v2", items } });
  assert.ok((priority.items.generic?.score ?? 0) > (priority.items.preferred?.score ?? 0));
  const catalog = docs.map((doc) => {
    const item = priority.items[doc.id ?? ""];
    assert.ok(item);
    return { id: doc.id ?? "", savedDate: doc.saved_at ?? null, priority: item };
  });
  const family = buildUnifiedLists(catalog, "2026-10-10T00:00:00.000Z").families.philosophy;
  assert.deepEqual(family["top-10"].map(({ id }) => id), ["preferred", "generic"]);
  assert.equal(priority.items.preferred?.sequenceScores.philosophy?.relevanceSource, "label");
});
