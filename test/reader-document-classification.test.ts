import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyReaderDocument,
  readerClassificationFingerprintInput,
} from "../scripts/lib/reader-document-classification.js";
import type { PriorityDocument } from "../scripts/lib/priority-document.js";

function document(tags: unknown, overrides: Partial<PriorityDocument> = {}): PriorityDocument {
  return {
    id: "classification",
    title: "Een document over samenwerking",
    summary: "Een analyse van teams en inhoud.",
    notes: "Waarom lezen: toepasbaar in werk.",
    language: null,
    reading_time: "4.5 min",
    word_count: 1800,
    saved_at: "2026-01-01T00:00:00.000Z",
    category: "article",
    tags,
    ...overrides,
  };
}

function comparableClassification(documentValue: PriorityDocument) {
  const result = classifyReaderDocument(documentValue);
  return {
    language: result.language,
    isDutch: result.isDutch,
    isBook: result.isBook,
    isPdf: result.isPdf,
    readingMinutes: result.readingMinutes,
    interestTags: result.interestTags,
    tagDomains: result.tagDomains,
    sequences: result.sequences,
    topicRelevance: Object.fromEntries(Object.entries(result.topicRelevance).map(([topic, relevance]) => [topic, relevance.relevance])),
    coreInterestMatches: result.coreInterestMatches.map(({ interest }) => interest),
  };
}

test("gelijkwaardige aliases en Reader-tagrepresentaties leveren dezelfde actuele classificatie", () => {
  const stringTags = document(["team collaboration", "agile & scrum"]);
  const descriptorTags = document([{ name: "team dynamics & collaboration" }, { key: "scrum" }, { name: "agile" }]);
  const objectKeys = document({ "team dynamics & collaboration": {}, scrum: {}, agile: {} });

  assert.deepEqual(comparableClassification(stringTags), comparableClassification(descriptorTags));
  assert.deepEqual(comparableClassification(descriptorTags), comparableClassification(objectKeys));
  const result = classifyReaderDocument(stringTags);
  assert.equal(result.topicRelevance.scrum?.relevance, 4);
  assert.ok(result.sequences.includes("scrum"));
  assert.ok(result.sequences.includes("social-studies"));
});

test("brede teamtags geven lichte Scrum-relevantie zonder Agile-membership", () => {
  const result = classifyReaderDocument(document(["team dynamics"]));

  assert.equal(result.topicRelevance.scrum?.relevance, 1);
  assert.ok(!result.sequences.includes("scrum"));
  assert.ok(result.sequences.includes("social-studies"));
});

test("aliasuitbreiding en canonieke tags leveren één kerninteressematch op", () => {
  const result = classifyReaderDocument(document(["team collaboration", "team dynamics & collaboration"]));

  assert.equal(result.coreInterestMatches.filter(({ interest }) => interest === "agile").length, 1);
  assert.ok(result.interestTags.includes("team dynamics & collaboration"));
});

test("boeken blijven uitsluitend boek en PDF's behouden hun eigen uitzondering", () => {
  const book = classifyReaderDocument(document(["scrum", "dutch"], { category: "epub", reading_time: "4 mins" }));
  const pdf = classifyReaderDocument(document(["light-reading"], { category: "pdf", reading_time: null }));

  assert.deepEqual(book.sequences, ["boek"]);
  assert.equal(book.isBook, true);
  assert.deepEqual(pdf.sequences, ["pdf", "luchtig"]);
  assert.equal(pdf.isPdf, true);
});

test("actuele korte leestijd gebruikt de positieve grens onder vijf minuten", () => {
  assert.equal(classifyReaderDocument(document([], { reading_time: "4.5 min" })).sequences.includes("short"), true);
  assert.equal(classifyReaderDocument(document([], { reading_time: "5 min" })).sequences.includes("short"), false);
  assert.equal(classifyReaderDocument(document([], { reading_time: "0 min" })).sequences.includes("short"), false);
  assert.equal(classifyReaderDocument(document([], { reading_time: "onbekend" })).readingMinutes, null);
});

test("expliciete taalmetadata wint van tags en conflicterende tags zijn deterministisch", () => {
  assert.equal(classifyReaderDocument(document(["dutch"], { language: "en" })).language, "Engels");
  assert.equal(classifyReaderDocument(document(["english", "dutch"])).language, "Nederlands");
  assert.equal(classifyReaderDocument(document([{ key: "fr" }, { name: "dutch" }])).language, "Nederlands");
  assert.equal(classifyReaderDocument(document([], { language: "fr" })).language, "Frans");
});

test("onbekende en opaque tags blijven buiten semantische claims zonder invoermutatie", () => {
  const metadata: Record<string, unknown> = {};
  metadata.self = metadata;
  const tags = { custom: metadata, scrum: metadata, opaque: 7 };
  const original = structuredClone(tags);
  const result = classifyReaderDocument(document(tags));

  assert.ok(result.interestTags.includes("custom"));
  assert.ok(result.sequences.includes("scrum"));
  assert.deepEqual(tags, original);
});

test("classification policy input is versioned and serializable", () => {
  const input = readerClassificationFingerprintInput();

  assert.equal(input.version, 1);
  assert.equal(JSON.stringify(input), JSON.stringify(readerClassificationFingerprintInput()));
  assert.ok(Object.hasOwn(input, "aliases"));
  assert.ok(Object.hasOwn(input, "membership"));
  assert.ok(Object.hasOwn(input, "topicRelevance"));
  assert.ok(Object.hasOwn(input, "shortMinutesExclusive"));
});
