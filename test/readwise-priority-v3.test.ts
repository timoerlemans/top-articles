import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPriorityExport,
  detectDutch,
  scorePriorityDocument,
  sequencesForDocument,
  validatePriorityOverrides,
  validatePriorityExport,
} from "../scripts/lib/readwise-priority-v3.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function document(overrides: Partial<PriorityDocument> = {}): PriorityDocument {
  return {
    id: "doc-1",
    title: "Een artikel",
    summary: "Een inhoudelijke samenvatting.",
    word_count: 1_500,
    reading_time: "12 mins",
    saved_at: "2026-01-01T00:00:00.000Z",
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
    ["score-80-oud-a", "score-80-oud-b", "score-80-nieuw", "score-70-oud"].map((id) => {
      const item = result.items[id];
      assert.ok(item);
      return item.positions.lees;
    }),
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
});

test("een pdf is niet strikt exclusief en mag wel in luchtig belanden", () => {
  assert.deepEqual(
    sequencesForDocument(document({ category: "pdf", tags: { "luchtig-0007": {} } })),
    ["pdf", "luchtig"]
  );
});

test("een lichte onderwerptag zoals fiction classificeert ook zonder light-reading-tag als luchtig", () => {
  assert.ok(sequencesForDocument(document({ tags: { fiction: {} } })).includes("luchtig"));
});

test("een onderwerptag buiten de lichte kernset classificeert niet als luchtig", () => {
  assert.ok(!sequencesForDocument(document({ tags: { "political philosophy": {} } })).includes("luchtig"));
});

test("een boek met een lichte onderwerptag zoals games hoort nog steeds strikt alleen in boek", () => {
  assert.deepEqual(
    sequencesForDocument(document({ category: "epub", tags: { games: {} } })),
    ["boek"]
  );
});

test("een NL-document met een lichte onderwerptag krijgt ook luchtig-nederlands", () => {
  assert.deepEqual(
    sequencesForDocument(document({ tags: { fiction: {}, dutch: {} } })),
    ["lees", "dutch", "luchtig", "luchtig-nederlands"]
  );
});

test("een document met de tag scrum of agile behoudt scrum naast de reguliere en social-studies-reeksen", () => {
  assert.deepEqual(
    sequencesForDocument(document({ tags: { scrum: {} } })),
    ["lees", "scrum", "social-studies"]
  );
  assert.ok(sequencesForDocument(document({ tags: { agile: {} } })).includes("scrum"));
  assert.ok(sequencesForDocument(document({ tags: { "agile & scrum": {} } })).includes("scrum"));
});

test("een boek met de tag scrum hoort nog steeds strikt alleen in boek", () => {
  assert.deepEqual(
    sequencesForDocument(document({ category: "epub", tags: { scrum: {} } })),
    ["boek"]
  );
});

test("classificeert uitsluitend de aangewezen sociale en samenwerkingssignalen in social-studies", () => {
  const socialTags = [
    "social psychology & interpersonal dynamics",
    "team dynamics & collaboration",
    "organizational behavior & culture",
    "behavioral psychology & coaching",
    "sociology & social structures",
    "team coaching",
    "facilitation",
    "organizational culture",
    "scrum",
    "agile",
    "product management",
    "flow & delivery",
  ];

  for (const tag of socialTags) {
    assert.ok(
      sequencesForDocument(document({ tags: { [tag]: {} } })).includes("social-studies"),
      `social-studies ontbreekt voor ${tag}`,
    );
  }
  assert.ok(!sequencesForDocument(document({ tags: { "agile & scrum": {} } })).includes("social-studies"));
  assert.ok(!sequencesForDocument(document({ tags: { "organizational learning": {} } })).includes("social-studies"));
});

test("exporteert de social-studies-positie en houdt boeken daarbij exclusief", () => {
  const social = document({ id: "social", tags: { "team dynamics & collaboration": {} } });
  const book = document({ id: "book", category: "epub", tags: { "team dynamics & collaboration": {} } });
  const result = buildPriorityExport([social, book], { generatedAt: "2026-08-16T10:00:00.000Z" });

  assert.equal(result.items.social?.positions["social-studies"], 1);
  assert.deepEqual(result.items.book?.sequences, ["boek"]);

  const invalidBook = result.items.book;
  assert.ok(invalidBook);
  invalidBook.sequences = ["boek", "social-studies"];
  invalidBook.positions = { boek: 1, "social-studies": 1 };
  assert.throws(() => validatePriorityExport(result), /strikt alleen/i);
});

test("classificeert development-onderwerptags in hun eigen reeksen", () => {
  for (const tag of ["software development", "software-development", "programming & software"]) {
    assert.deepEqual(sequencesForDocument(document({ tags: { [tag]: {} } })), ["lees", "software-development"]);
  }
  for (const tag of ["front-end development", "frontend development", "front end development", "front-end-development"]) {
    assert.deepEqual(sequencesForDocument(document({ tags: { [tag]: {} } })), ["lees", "front-end-development"]);
  }
  assert.deepEqual(sequencesForDocument(document({ tags: { "software development": {}, "front-end development": {} } })),
    ["lees", "software-development", "front-end-development"]);
  assert.deepEqual(sequencesForDocument(document({ category: "epub", tags: { "software development": {}, "front-end development": {} } })), ["boek"]);
  assert.deepEqual(sequencesForDocument(document({ tags: { "professional development": {} } })), ["lees"]);
});

test("classificeert accessibility als front-end-onderwerp", () => {
  assert.deepEqual(
    sequencesForDocument(document({ tags: { accessibility: {} } })),
    ["lees", "front-end-development"]
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

  const one = result.items.one;
  const two = result.items.two;
  assert.ok(one);
  assert.ok(two);
  assert.deepEqual(one.actualPositions, { lees: 2 });
  assert.deepEqual(two.actualPositions, { lees: 1 });
  assert.equal(validatePriorityExport(result, docs), true);
});
