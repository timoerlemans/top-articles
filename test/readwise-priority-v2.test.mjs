import assert from "node:assert/strict";
import test from "node:test";

import { detectDutch, scorePriorityDocument, sequencesForDocument } from "../scripts/lib/readwise-priority-v2.mjs";

function document(overrides = {}) {
  return {
    id: "doc-1",
    title: "Een artikel",
    author: null,
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

test("scoret twee kerndomeinen en directe persoonlijke bruikbaarheid onafhankelijk", () => {
  const result = scorePriorityDocument(document({
    tags: {
      philosophy: {},
      history: {},
      writing: {},
    },
  }));

  assert.equal(result.score, 80);
  assert.equal(result.tier, "hoog");
  assert.deepEqual(result.components, {
    kerninteresse: 45,
    diepgang: 10,
    persoonlijke_bruikbaarheid: 20,
    leeskans: 0,
    onderscheidende_duurzame_waarde: 5,
    aftrek: 0,
  });
  assert.ok(result.rationale.kerninteresse.some((reason) => reason.includes("filosofie")));
  assert.ok(result.rationale.persoonlijke_bruikbaarheid.some((reason) => reason.includes("writing")));
});

test("herkent kerndomeinen en Waarom lezen in vrije tekst", () => {
  const result = scorePriorityDocument(document({
    title: "Artificial intelligence and political philosophy",
    summary: "A concise analysis.",
    word_count: 800,
    reading_time: "8 mins",
    notes: "Waarom lezen: bruikbaar voor mijn werk en kennisbeheer\nBeste moment: Weekend",
  }));

  assert.deepEqual(result.components, {
    kerninteresse: 45,
    diepgang: 10,
    persoonlijke_bruikbaarheid: 20,
    leeskans: 5,
    onderscheidende_duurzame_waarde: 5,
    aftrek: 0,
  });
  assert.equal(result.score, 85);
});

test("geeft alleen aangrenzende interesse vijftien punten", () => {
  const result = scorePriorityDocument(document({
    title: "Education and systems thinking",
    summary: "",
    word_count: 700,
  }));

  assert.equal(result.components.kerninteresse, 15);
  assert.equal(result.components.persoonlijke_bruikbaarheid, 0);
  assert.equal(result.components.onderscheidende_duurzame_waarde, 0);
});

test("stapelt de twee aftrekcategorieen maar trekt dunheid slechts eenmaal af", () => {
  const result = scorePriorityDocument(document({
    title: "Trump in America",
    summary: "",
    word_count: 120,
    category: "tweet",
    tags: { "current affairs": {}, newsletter: {} },
    notes: "",
  }));

  assert.equal(result.components.aftrek, -20);
  assert.equal(result.score, 0);
  assert.equal(result.rationale.aftrek.length, 2);
});

test("behandelt ontbrekende word_count niet als een dun stuk van nul woorden", () => {
  const result = scorePriorityDocument(document({
    summary: "",
    word_count: null,
    notes: "",
  }));

  assert.equal(result.components.aftrek, 0);
});

test("kent maximale diepgang en duurzame waarde toe aan EPUB zonder Nederlandse bonus", () => {
  const result = scorePriorityDocument(document({
    category: "epub",
    tags: { dutch: {} },
    word_count: 8_000,
  }));

  assert.equal(result.components.diepgang, 20);
  assert.equal(result.components.onderscheidende_duurzame_waarde, 10);
  assert.equal(result.components.kerninteresse, 0);
  assert.equal(result.score, 30);
});

test("taaldetectie volgt language en daarna expliciete tags", () => {
  assert.equal(detectDutch(document({ language: "nl", tags: { english: {} } })), true);
  assert.equal(detectDutch(document({ language: "en", tags: { dutch: {} } })), false);
  assert.equal(detectDutch(document({ language: null, tags: { dutch: {} } })), true);
  assert.equal(detectDutch(document({ language: null, tags: { english: {} }, title: "De het en" })), false);
  assert.equal(detectDutch(document({ language: null, title: "De geschiedenis van het denken" })), false);
});

test("bepaalt reeksen onafhankelijk en laat boeken nooit in lees toe", () => {
  assert.deepEqual(
    sequencesForDocument(document({
      category: "article",
      reading_time: "7 mins",
      tags: { nederlands: {} },
    })),
    ["lees", "dutch", "short", "short-dutch"]
  );
  assert.deepEqual(
    sequencesForDocument(document({ category: "article", tags: { books: {} } })),
    ["boek"]
  );
  assert.deepEqual(
    sequencesForDocument(document({ category: "video", reading_time: "5 mins" })),
    ["video", "short"]
  );
  assert.equal(scorePriorityDocument(document({ reading_time: "0 mins" })).components.leeskans, 5);
  assert.ok(sequencesForDocument(document({ reading_time: "0 mins" })).includes("short"));
});

test("een boek zit strikt alleen in de boek-reeks, ook met Nederlandse taal of korte leestijd", () => {
  assert.deepEqual(
    sequencesForDocument(document({
      category: "epub",
      reading_time: "7 mins",
      tags: { nederlands: {} },
    })),
    ["boek"]
  );
  assert.deepEqual(
    sequencesForDocument(document({
      category: "pdf",
      reading_time: "5 mins",
      language: "nl",
    })),
    ["boek"]
  );
  assert.deepEqual(
    sequencesForDocument(document({ category: "article", tags: { books: {}, dutch: {} } })),
    ["boek"]
  );
});
