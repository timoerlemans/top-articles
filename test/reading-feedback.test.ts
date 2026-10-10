import assert from "node:assert/strict";
import test from "node:test";

import { automatedFallbackJudgment, buildPriorityEvidence, judgmentFor } from "../scripts/lib/priority-judgments.js";
import { buildPriorityExport, scorePriorityDocument } from "../scripts/lib/readwise-priority-v8.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";
import { publicReadingNotes, splitReadingFeedback } from "../scripts/lib/reader-notes.js";
import { prepareReadingFeedback } from "../scripts/lib/reading-feedback.js";
import { validateContentJudgment } from "../scripts/lib/priority-judgments.js";
import { createHash } from "node:crypto";
import { buildEvidenceSnapshot, ensureMissingFallbacks, validateJudgmentSet } from "../scripts/lib/priority-judge.js";

const document: PriorityDocument = {
  id: "01kw4avt5cex86dndrehb65a7y",
  title: "Why You Cannot Believe Your Way Into Learning",
  summary: "An article about classroom learning.",
  notes: "Waarom lezen: een uitleg over leren.\nBeste moment: later",
  category: "article",
  saved_at: "2026-06-27T10:44:02.860Z",
  tags: { "learning & meta-learning": {} },
};
const feedback = "Dit artikel gaat voornamelijk over leren in de klas en in de VS. Niet relevant voor mij.";

test("adding feedback preserves an accepted judgment and every sequence score", () => {
  const judgment = { ...automatedFallbackJudgment(document), judgedBy: "codex", confidence: "high" as const };
  const judgments = { [document.id ?? ""]: judgment };
  const withFeedback = { ...document, notes: `${document.notes}\n\nFeedback: ${feedback}` };
  assert.equal(judgmentFor(withFeedback, judgments).source, "label");
  assert.deepEqual(buildPriorityExport([withFeedback], { judgments, generatedAt: "2026-09-30T00:00:00Z" }),
    buildPriorityExport([document], { judgments, generatedAt: "2026-09-30T00:00:00Z" }));
});

test("feedback keywords cannot influence fallback scores or evidence", () => {
  const withFeedback = { ...document, notes: `${document.notes}\n\nFeedback: philosophy research history work framework guide.` };
  assert.deepEqual(scorePriorityDocument(withFeedback), scorePriorityDocument(document));
  assert.deepEqual(buildPriorityEvidence(withFeedback), buildPriorityEvidence(document));
});

test("feedback does not extend an unterminated why-read field into scoring", () => {
  const original = { ...document, notes: "Waarom lezen: een korte uitleg." };
  const withFeedback = { ...original, notes: `${original.notes}\n\nFeedback: philosophy research history work framework guide.` };
  assert.deepEqual(scorePriorityDocument(withFeedback), scorePriorityDocument(original));
});

test("ordinary content changes still invalidate an accepted judgment", () => {
  const judgment = { ...automatedFallbackJudgment(document), judgedBy: "codex" };
  assert.equal(judgmentFor({ ...document, notes: "Een andere inhoudelijke notitie." }, { [document.id ?? ""]: judgment }).source, "fallback");
});

test("one short natural-language paragraph is enough, including multiline feedback", () => {
  assert.deepEqual(splitReadingFeedback(`${document.notes}\n\nFeedback: ${feedback}\nOok te weinig toepasbaar.`), {
    contentNotes: document.notes, feedback: `${feedback}\nOok te weinig toepasbaar.`,
  });
  assert.deepEqual(splitReadingFeedback("  feedback: meer hiervan  "), { contentNotes: null, feedback: "meer hiervan" });
  assert.deepEqual(splitReadingFeedback("Inhoud.\r\n\r\nFeedback: te oppervlakkig"), { contentNotes: "Inhoud.", feedback: "te oppervlakkig" });
  assert.deepEqual(splitReadingFeedback("Inhoud.\nFeedback: kort maar waardevol"), { contentNotes: "Inhoud.", feedback: "kort maar waardevol" });
});

test("unmarked notes remain byte-identical and empty feedback does not become a review", () => {
  for (const notes of [undefined, null, "", "Een essay over Feedback: geven.\n", "  Inhoud. \n"]) {
    assert.deepEqual(splitReadingFeedback(notes), { contentNotes: notes, feedback: null });
  }
  assert.deepEqual(splitReadingFeedback("Inhoud.\n\nFeedback:  \n"), { contentNotes: "Inhoud.", feedback: null });
});

test("public reading notes never include feedback, even if best moment is empty", () => {
  assert.deepEqual(publicReadingNotes(`${document.notes}\n\nFeedback: ${feedback}`), {
    whyRead: "een uitleg over leren.", bestMoment: "later",
  });
  assert.deepEqual(publicReadingNotes(`Waarom lezen: nuttig.\nBeste moment:\n\nFeedback: ${feedback}`), {
    whyRead: "nuttig.", bestMoment: "",
  });
  assert.deepEqual(publicReadingNotes(`Feedback: Waarom lezen: privé\nBeste moment: privé`), {
    whyRead: null, bestMoment: null,
  });
});

test("feedback preparation scans every page of later and archive using read-only calls", async () => {
  const recordedCalls: string[][] = [];
  const pages = [
    { results: [{ ...document, notes: `${document.notes}\n\nFeedback: nuttig` }], nextPageCursor: "later-next" },
    { results: [{ id: "ordinary", notes: "Geen feedback." }], nextPageCursor: null },
    { results: [{ ...document, id: "archived", location: "archive", notes: `${document.notes}\n\nFeedback: ${feedback}` }], nextPageCursor: "archive-next" },
    { results: [{ id: "blank", notes: "Feedback: " }], nextPageCursor: null },
  ];
  const judgments = { version: 2 as const, rubricVersion: "semantic-v1", items: { archived: automatedFallbackJudgment({ ...document, id: "archived" }) } };
  const before = JSON.stringify(judgments);
  const review = await prepareReadingFeedback((args) => {
    recordedCalls.push([...args]);
    const page = pages.shift();
    assert.ok(page, "unexpected Reader request");
    return Promise.resolve({ stdout: JSON.stringify(page) });
  }, judgments, "Amerikaans schoolonderwijs heeft minder prioriteit.");
  assert.equal(recordedCalls.length, 4);
  assert.ok(recordedCalls.every((args) => args[0] === "reader-list-documents"));
  assert.ok(recordedCalls.every((args) => {
    const fields = args[args.indexOf("--response-fields") + 1]?.split(",");
    return fields && !fields.includes("language");
  }), "Reader's list endpoint does not accept language as a response field");
  assert.equal(recordedCalls[0]?.[2], "later");
  assert.equal(recordedCalls[2]?.[2], "archive");
  assert.ok(recordedCalls[1]?.includes("later-next"));
  assert.ok(recordedCalls[3]?.includes("archive-next"));
  assert.deepEqual(review.documents.map((entry) => entry.document.id), [document.id, "archived"]);
  assert.equal(review.documents[1]?.document.location, "archive");
  assert.equal(review.documents[1]?.feedback, feedback);
  assert.equal(review.documents[1]?.evidence.notes, document.notes);
  assert.equal(review.documents[1]?.document.notes, document.notes);
  assert.equal(review.documents[1]?.currentJudgment?.judgedBy, "automated-fallback-v1");
  assert.equal(review.readingPreferences, "Amerikaans schoolonderwijs heeft minder prioriteit.");
  assert.equal(JSON.stringify(judgments), before);
});

test("targeted feedback preparation reads an archived document without a location filter", async () => {
  let request: readonly string[] = [];
  const review = await prepareReadingFeedback((args) => {
    request = args;
    return Promise.resolve({ stdout: JSON.stringify({ results: [{ ...document, location: "archive", notes: `Feedback: ${feedback}` }] }) });
  }, { version: 2, rubricVersion: "semantic-v1", items: {} }, "", document.id ?? "");
  assert.ok(request.includes("--id"));
  assert.ok(!request.includes("--location"));
  assert.equal(review.documents[0]?.feedback, feedback);
  assert.equal(review.documents[0]?.document.location, "archive");
});

for (const location of [undefined, null]) {
  test(`feedback bewaart laatste versie en oorspronkelijke ID-volgorde: ${String(location)}`, async () => {
    const pages = [
      { results: [{ ...document, id: "one", notes: "Old source.\n\nFeedback: first" }], nextPageCursor: "later-next" },
      { results: [{ ...document, id: "two", notes: "Second source.\n\nFeedback: second" }] },
      { results: [{ ...document, id: "one", location, notes: "New source.\n\nFeedback: last" }] },
    ];
    const review = await prepareReadingFeedback(() => {
      const page = pages.shift();
      assert.ok(page, "unexpected Reader request");
      return Promise.resolve({ stdout: JSON.stringify(page) });
    }, { version: 2, rubricVersion: "semantic-v1", items: {} }, "");
    assert.deepEqual(review.documents.map((entry) => entry.document.id), ["one", "two"]);
    assert.equal(review.documents[0]?.feedback, "last");
    assert.equal(review.documents[0]?.document.notes, "New source.");
    assert.equal(review.documents[0]?.evidence.notes, "New source.");
    assert.equal(review.documents[0]?.document.location, "archive");
    assert.equal(review.documents[1]?.document.location, "later");
    assert.equal(pages.length, 0);
  });
}

test("feedback behoudt de expliciete documentlocatie", async () => {
  const pages = [
    { results: [] },
    { results: [{ ...document, location: "later", notes: "Feedback: returned location" }] },
  ];
  const review = await prepareReadingFeedback(() => {
    const page = pages.shift();
    assert.ok(page, "unexpected Reader request");
    return Promise.resolve({ stdout: JSON.stringify(page) });
  }, { version: 2, rubricVersion: "semantic-v1", items: {} }, "");
  assert.equal(review.documents[0]?.document.location, "later");
});

test("gerichte feedback verzint geen ontbrekende documentlocatie", async () => {
  const review = await prepareReadingFeedback(() => Promise.resolve({
    stdout: JSON.stringify({ results: [{ ...document, notes: "Feedback: targeted" }] }),
  }), { version: 2, rubricVersion: "semantic-v1", items: {} }, "", document.id ?? "");
  assert.equal(review.documents[0]?.document.location, null);
});

test("Reader errors do not return a misleading incomplete review", async () => {
  let calls = 0;
  await assert.rejects(prepareReadingFeedback(() => {
    calls += 1;
    if (calls === 1) {return Promise.resolve({ stdout: JSON.stringify({ results: [], nextPageCursor: null }) });}
    return Promise.reject(new Error("Reader unavailable"));
  }, { version: 2, rubricVersion: "semantic-v1", items: {} }, ""), /Reader unavailable/);
});

test("judgments validate a feedback fingerprint without storing feedback text", () => {
  const judgment = automatedFallbackJudgment(document);
  assert.equal(validateContentJudgment({ ...judgment, feedbackFingerprint: "invalid" }), false);
  assert.equal(validateContentJudgment({ ...judgment, feedbackFingerprint: "a".repeat(64) }), true);
});

test("approved feedback is recognized while changed feedback awaits a new review", async () => {
  const judgments = { version: 2 as const, rubricVersion: "semantic-v1", items: {} };
  const fetch = (): Promise<{ stdout: string }> => Promise.resolve({ stdout: JSON.stringify({ results: [{ ...document, notes: `Feedback: ${feedback}` }] }) });
  const first = await prepareReadingFeedback(fetch, judgments, "", document.id ?? "");
  assert.equal(first.documents[0]?.status, "pending");
  const fingerprint = first.documents[0]?.feedbackFingerprint;
  assert.ok(fingerprint);
  const reviewed = { ...judgments, items: { [document.id ?? ""]: { ...automatedFallbackJudgment(document), feedbackFingerprint: fingerprint } } };
  const second = await prepareReadingFeedback(fetch, reviewed, "", document.id ?? "");
  assert.equal(second.documents[0]?.status, "reviewed");
  const changed = await prepareReadingFeedback(() => Promise.resolve({ stdout: JSON.stringify({ results: [{ ...document, notes: "Feedback: Toch waardevol." }] }) }), reviewed, "", document.id ?? "");
  assert.equal(changed.documents[0]?.status, "pending");
  assert.notEqual(changed.documents[0]?.feedbackFingerprint, fingerprint);
});

for (const notes of ["", null, "Inhoud.\n", "Inhoud.\r\n", "Inhoud.  \n"]) {
  test(`feedback preserves existing empty/trailing-whitespace judgments: ${JSON.stringify(notes)}`, () => {
    const original = { ...document, notes };
    // Independent pre-feedback serialization, matching already committed v8 judgments.
    const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const judgment = {
      ...automatedFallbackJudgment(original),
      relevance: 4 as const, substance: 4 as const, durability: 4 as const, usefulness: 4 as const,
      judgedBy: "codex",
      sourceFingerprint: hash({ id: original.id, title: original.title, summary: original.summary, notes,
        language: null, reading_time: null, word_count: null, category: "article", tags: ["learning & meta-learning"] }),
      evidenceFingerprint: hash({ documentId: original.id, title: original.title, summary: original.summary, notes,
        contentTags: ["learning & meta-learning"], highlights: [] }),
    };
    const config = { version: 2 as const, rubricVersion: "semantic-v1", items: { [document.id ?? ""]: judgment } };
    const withFeedback = { ...original, notes: `${notes ?? ""}${notes ? "\n" : ""}Feedback: niet relevant` };
    assert.equal(judgmentFor(original, config).source, "label");
    assert.equal(judgmentFor(withFeedback, config).source, "label");
    assert.deepEqual(buildPriorityExport([withFeedback], { judgments: config, generatedAt: "2026-09-30T00:00:00Z" }),
      buildPriorityExport([original], { judgments: config, generatedAt: "2026-09-30T00:00:00Z" }));
    assert.deepEqual(buildPriorityEvidence(withFeedback), buildPriorityEvidence(original));
    assert.equal(ensureMissingFallbacks([withFeedback], config, { selection: "all-later" }).report.stale.length, 0);
    const report = validateJudgmentSet([withFeedback], buildEvidenceSnapshot([withFeedback], new Map(), "2026-09-30T00:00:00Z", "all-later"), config, { requireAllLater: true });
    assert.equal(report.accepted, 1);
    assert.equal(report.stale, 0);
  });
}
