import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { scorePriorityDocument as scoreV2 } from "../scripts/lib/readwise-priority-v2.js";
import { buildPriorityExport as buildV3 } from "../scripts/lib/readwise-priority-v3.js";
import { buildPriorityExport as buildV5 } from "../scripts/lib/readwise-priority-v5.js";
import { buildPriorityExport as buildV6 } from "../scripts/lib/readwise-priority-v6.js";
import { buildPriorityExport as buildV7 } from "../scripts/lib/readwise-priority-v7.js";
import {
  buildPriorityEvidence,
  judgmentMatchesSource,
  judgmentSourceFingerprint,
} from "../scripts/lib/priority-judgments.js";
import type { PriorityDocument } from "../scripts/lib/priority-document.js";

const fixture = JSON.parse(readFileSync("test/fixtures/reader-document-classification-history.json", "utf8")) as {
  generatedAt: string;
  documents: PriorityDocument[];
};

test("historische modellen behouden hun vaste karakterisatie-uitvoer", () => {
  const alias = fixture.documents.find(({ id }) => id === "history-alias");
  const descriptors = fixture.documents.find(({ id }) => id === "history-descriptors");
  const book = fixture.documents.find(({ id }) => id === "history-book");
  assert.ok(alias && descriptors && book);

  assert.deepEqual(scoreV2(alias), {
    score: 80,
    tier: "hoog",
    components: {
      kerninteresse: 20,
      diepgang: 10,
      persoonlijke_bruikbaarheid: 20,
      leeskans: 5,
      onderscheidende_duurzame_waarde: 5,
      nederlandse_taal: 0,
      curatie: 20,
      aftrek: 0,
    },
    rationale: {
      kerninteresse: ["1 expliciete kerninteresse: agile."],
      diepgang: ["1.800 woorden."],
      persoonlijke_bruikbaarheid: ["Direct bruikbare tag: scrum."],
      leeskans: ["Korte leestijd: 5 minuten."],
      onderscheidende_duurzame_waarde: ["Minstens 1.200 woorden."],
      nederlandse_taal: [],
      curatie: ["Must-read: +20 bonuspunten."],
      aftrek: [],
    },
  });

  const expected = {
    v3: buildV3(fixture.documents, { generatedAt: fixture.generatedAt }),
    v5: buildV5(fixture.documents, { generatedAt: fixture.generatedAt }),
    v6: buildV6(fixture.documents, { generatedAt: fixture.generatedAt }),
    v7: buildV7(fixture.documents, { generatedAt: fixture.generatedAt }),
  };
  const serializedHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.equal(serializedHash(expected.v3), "961c404d39d8bab8f595edd64bb87a9323ffeeadf2f2b3eea69c580e35525d5a");
  assert.equal(serializedHash(expected.v5), "dc9ad2a405e3a516388563a29e260b0903d365a40329d10ff65410826b0dc3e5");
  assert.equal(serializedHash(expected.v6), "0b385c284fb4e50cef05f2a39d9933ab14e2849dfdfcdd3fe29c2dca3c6cac94");
  assert.equal(serializedHash(expected.v7), "0d2d220ae2a5df6181a3b9c709fdfb133181269bec6296a6c27711ae9121f147");
  assert.equal(expected.v3.model, "readwise-priority-v4");
  assert.equal(expected.v5.model, "readwise-priority-v5");
  assert.equal(expected.v6.model, "readwise-priority-v6");
  assert.equal(expected.v7.model, "readwise-priority-v7");
  assert.equal(descriptors.language, null);
});

test("bron- en evidencefingerprints blijven gekoppeld aan de originele invoer", () => {
  const document = fixture.documents.find(({ id }) => id === "history-descriptors");
  assert.ok(document);
  const evidence = buildPriorityEvidence(document, ["Een exacte passage"]);
  assert.equal(judgmentSourceFingerprint(document), "8c783189fc866085e366694240224d6057fc6d9b4dc9afd00001f39525c93b7e");
  assert.equal(evidence.evidenceFingerprint, "14e16e5646b08f02ae26e14e971555fe49866695e64b40d3ce560d20860159cf");
  assert.equal(judgmentMatchesSource(document, { sourceFingerprint: judgmentSourceFingerprint(document) }), true);
  const base = { ...document, notes: "Filosofische inhoud" };
  const withFeedback = { ...base, notes: "Filosofische inhoud\n\nFeedback: feedback toegevoegd." };
  assert.equal(judgmentMatchesSource(withFeedback, { sourceFingerprint: judgmentSourceFingerprint(base) }), true);
});
