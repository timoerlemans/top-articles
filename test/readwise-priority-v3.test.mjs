import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPriorityExport,
  detectDutch,
  scorePriorityDocument,
  sequencesForDocument,
  validatePriorityOverrides,
  validatePriorityExport,
} from "../scripts/lib/readwise-priority-v3.mjs";

function document(overrides = {}) {
  return {
    id: "doc-1",
    title: "Een artikel",
    summary: "Een inhoudelijke samenvatting.",
    word_count: 1_500,
    reading_time: "12 mins",
    saved_at: "2026-01-01T00:00:00.000Z",
    published_date: "2020-01-01T00:00:00.000Z",
    category: "article",
    tags: {},
    notes: "",
    ...overrides,
  };
}

test("sorteert op eindscore en gebruikt saved_at alleen bij gelijke score", () => {
  const docs = [
    document({ id: "score-70-oud", saved_at: "2020-01-01", tags: { philosophy: {}, writing: {} }, word_count: 300 }),
    document({ id: "score-80-nieuw", saved_at: "2025-01-01", tags: { philosophy: {}, history: {}, writing: {} } }),
    document({ id: "score-80-oud-b", saved_at: "2021-01-01", tags: { philosophy: {}, history: {}, writing: {} } }),
    document({ id: "score-80-oud-a", saved_at: "2021-01-01", tags: { philosophy: {}, history: {}, writing: {} } }),
  ];

  const result = buildPriorityExport(docs, { generatedAt: "2026-08-16T10:00:00.000Z" });

  assert.equal(result.model, "readwise-priority-v3");
  assert.deepEqual(
    ["score-80-oud-a", "score-80-oud-b", "score-80-nieuw", "score-70-oud"].map((id) => result.items[id].positions.lees),
    [1, 2, 3, 4]
  );
});

test("neemt een handmatige correctie met reden op in dezelfde eindscore", () => {
  const doc = document({ tags: { philosophy: {} } });
  const result = scorePriorityDocument(doc, {
    adjustment: 10,
    reason: "Tijdelijk meer aandacht voor filosofie",
  });

  assert.equal(result.baseScore, 55);
  assert.equal(result.adjustment, 10);
  assert.equal(result.adjustmentReason, "Tijdelijk meer aandacht voor filosofie");
  assert.equal(result.score, 65);
  assert.equal(result.tier, "midden");
  assert.throws(() => scorePriorityDocument(doc, { adjustment: 10, reason: "" }), /reden/i);
  assert.throws(() => scorePriorityDocument(doc, { adjustment: 2.5, reason: "Fractie" }), /geheel/i);
});

test("valideert het getrackte correctiecontract", () => {
  assert.equal(validatePriorityOverrides({ version: 1, items: { "doc-1": { adjustment: -10, reason: "Lager" } } }), true);
  assert.throws(() => validatePriorityOverrides({ version: 2, items: {} }), /versie/i);
  assert.throws(() => validatePriorityOverrides({ version: 1, items: { "doc-1": { adjustment: 5, reason: "" } } }), /reden/i);
});

test("classificeert light-reading in beide luchtig-reeksen", () => {
  assert.deepEqual(
    sequencesForDocument(document({ tags: { "light-reading": {}, dutch: {} } })),
    ["lees", "dutch", "luchtig", "luchtig-nederlands"]
  );
  assert.ok(sequencesForDocument(document({ tags: { "luchtig-007": {} } })).includes("luchtig"));
  assert.ok(sequencesForDocument(document({ tags: { "luchtig-0007": {} } })).includes("luchtig"));
});

test("een boek belandt nooit in luchtig of luchtig-nederlands, ook niet met light-reading-signalen", () => {
  assert.deepEqual(
    sequencesForDocument(document({ category: "epub", tags: { "light-reading": {}, dutch: {} } })),
    ["boek"]
  );
  assert.deepEqual(
    sequencesForDocument(document({ category: "pdf", tags: { "luchtig-0007": {} } })),
    ["boek"]
  );
});

test("gebruikt language en expliciete taaltags zonder tekstheuristiek", () => {
  assert.equal(detectDutch(document({ language: "nl", title: "The history of ideas" })), true);
  assert.equal(detectDutch(document({ language: "en", tags: { dutch: {} }, title: "De geschiedenis" })), false);
  assert.equal(detectDutch(document({ language: null, tags: { nederlands: {} } })), true);
  assert.equal(detectDutch(document({ language: null, tags: { english: {} }, title: "De geschiedenis" })), false);
  assert.equal(detectDutch(document({ language: null, tags: {}, title: "De geschiedenis van het denken" })), false);
});

test("exporteert alleen later-brondocumenten en valideert werkelijke posities afzonderlijk", () => {
  const docs = [
    document({ id: "one", tags: { "lees-0002": {} }, saved_at: "2024-01-01" }),
    document({ id: "two", tags: { "lees-0001": {} }, saved_at: "2025-01-01" }),
  ];
  const result = buildPriorityExport(docs, { generatedAt: "2026-08-16T10:00:00.000Z" });

  assert.deepEqual(result.items.one.actualPositions, { lees: 2 });
  assert.deepEqual(result.items.two.actualPositions, { lees: 1 });
  assert.equal(validatePriorityExport(result, docs), true);
});
