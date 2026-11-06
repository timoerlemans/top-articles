import assert from "node:assert/strict";
import test from "node:test";

import type { PriorityDocument } from "../scripts/lib/priority-document.js";
import { judgmentSourceFingerprint } from "../scripts/lib/priority-judgments.js";
import { contentHash, fetchReviewSource, reviewSourceFromDetails } from "../scripts/lib/priority-review-source.js";
import type { ReadwiseExecutor } from "../scripts/lib/readwise-request.js";

const NOW = "2026-10-29T12:00:00.000Z";
const doc: PriorityDocument = { id: "doc-1", title: "A source", category: "article" };

function response(value: unknown): ReadwiseExecutor<{ stdout: string }> {
  return () => Promise.resolve({ stdout: JSON.stringify(value) });
}

test("contentHash is SHA-256 of exact UTF-8, including whitespace and Unicode", () => {
  assert.equal(contentHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(contentHash(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(contentHash("é"), "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c");
  assert.notEqual(contentHash("é"), contentHash("e\u0301"));
  assert.notEqual(contentHash("abc\n"), contentHash("abc"));
  assert.notEqual(contentHash("abc\r\n"), contentHash("abc\n"));
});

test("fetches only document details, preserves Markdown, and binds source metadata", async () => {
  const calls: (readonly string[])[] = [];
  const content = "\n# Héllo\r\n\nA [link](https://example.com) and **text**.  \n";
  const before = structuredClone(doc);
  const run: ReadwiseExecutor<{ stdout: string }> = (args) => {
    calls.push(args);
    return response({ id: doc.id, content })(args);
  };
  const result = await fetchReviewSource(run, doc, () => NOW);
  assert.deepEqual(calls, [["reader-get-document-details", "--document-id", "doc-1", "--json"]]);
  assert.deepEqual(doc, before);
  assert.equal(result.version, 1);
  assert.equal(result.documentId, doc.id);
  assert.equal(result.sourceFingerprint, judgmentSourceFingerprint(doc));
  assert.equal(result.content, content);
  assert.equal(result.contentHash, contentHash(content));
  assert.equal(result.fetchedAt, NOW);
  assert.equal(result.availability, "available");
  assert.match(result.limitations.join(" "), /Codex.*completeness|completeness.*Codex/i);
  assert.equal("confidence" in result, false);
  assert.equal("complete" in result, false);
});

test("a new source variant changes its content hash even when metadata is unchanged", async () => {
  const first = await fetchReviewSource(response({ id: doc.id, content: "First version." }), doc, () => NOW);
  const second = await fetchReviewSource(response({ id: doc.id, content: "First version.\n" }), doc, () => NOW);
  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.notEqual(first.contentHash, second.contentHash);
});

test("pure snapshot parsing and detail fetching produce identical records", async () => {
  for (const details of [
    { id: doc.id, content: "# A source\n\nAvailable content.", word_count: 500 },
    { id: doc.id, content: "Subscribe to unlock. [truncated]", category: "epub" },
    { id: doc.id, content: null },
    { id: "wrong-private-id", content: "private content" },
    null,
  ]) {
    const before = structuredClone(details);
    const parsed = reviewSourceFromDetails(doc, details, NOW);
    const fetched = await fetchReviewSource(response(details), doc, () => NOW);
    assert.deepEqual(parsed, fetched);
    assert.deepEqual(details, before);
    assert.deepEqual(reviewSourceFromDetails(doc, details, NOW), parsed);
  }
});

test("bulk snapshot records can serve as both metadata and source without discarding optional fields", () => {
  const snapshot = {
    ...doc, content: "Source Markdown.\n", word_count: "1000", category: "video",
    source_url: "https://private.example/source", extra: { private: true },
  };
  const before = structuredClone(snapshot);
  const result = reviewSourceFromDetails(snapshot, snapshot, NOW);
  assert.equal(result.availability, "available");
  assert.equal(result.content, snapshot.content);
  assert.equal(result.contentHash, contentHash(snapshot.content));
  assert.equal(result.sourceFingerprint, judgmentSourceFingerprint(snapshot));
  assert.match(result.limitations.join(" "), /word_count/i);
  assert.match(result.limitations.join(" "), /visual/i);
  assert.doesNotMatch(JSON.stringify(result), /private/);
  assert.deepEqual(snapshot, before);
});

test("rejects a wrong response ID without exposing its content or ID", async () => {
  const result = await fetchReviewSource(response({ id: "private-other-id", content: "private content" }), doc, () => NOW);
  assert.equal(result.availability, "error");
  assert.equal(result.content, null);
  assert.equal(result.contentHash, null);
  assert.match(result.limitations.join(" "), /id.*match/i);
  assert.doesNotMatch(JSON.stringify(result), /private/);
});

for (const content of [undefined, null, "", " \n\t"]) {
  test(`missing content (${JSON.stringify(content)}) remains missing`, async () => {
    const result = await fetchReviewSource(response({ id: doc.id, content }), doc, () => NOW);
    assert.equal(result.availability, "missing");
    assert.equal(result.content, null);
    assert.equal(result.contentHash, null);
    assert.equal(result.fetchedAt, NOW);
    assert.equal(result.sourceFingerprint, judgmentSourceFingerprint(doc));
    assert.ok(result.limitations.length > 0);
  });
}

for (const payload of [null, [], {}, { id: doc.id, content: { text: "private" } }, { error: "private" }]) {
  test(`malformed details are a safe per-document error (${JSON.stringify(payload)})`, async () => {
    const result = await fetchReviewSource(response(payload), doc, () => NOW);
    assert.equal(result.availability, "error");
    assert.equal(result.content, null);
    assert.equal(result.contentHash, null);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  });
}

test("malformed JSON and API exceptions never leak stdout, stderr, or messages", async () => {
  const executors: ReadwiseExecutor<{ stdout: string }>[] = [
    () => Promise.resolve({ stdout: "private invalid JSON bearer-secret" }),
    () => Promise.reject(Object.assign(new Error("private token=secret"), {
      stdout: "private body", stderr: "Authorization: Bearer secret", code: 1,
    })),
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Executors may reject with non-Error values.
    () => Promise.reject("private API error"),
  ];
  for (const run of executors) {
    const result = await fetchReviewSource(run, doc, () => NOW);
    assert.equal(result.availability, "error");
    assert.equal(result.content, null);
    assert.equal(result.contentHash, null);
    assert.equal(result.fetchedAt, NOW);
    assert.doesNotMatch(JSON.stringify(result), /private|secret|Authorization/);
    assert.ok(result.limitations.length > 0);
  }
  const next = await fetchReviewSource(response({ id: doc.id, content: "Still works." }), doc, () => NOW);
  assert.equal(next.availability, "available");
});

test("missing document IDs return an error without calling Reader", async () => {
  for (const id of [undefined, null, "", "   "]) {
    let calls = 0;
    const result = await fetchReviewSource(() => {
      calls += 1;
      return Promise.reject(new Error("should not be called"));
    }, { ...doc, id }, () => NOW);
    assert.equal(calls, 0);
    assert.equal(result.availability, "error");
    assert.equal(result.content, null);
    assert.equal(result.contentHash, null);
  }
});

test("paywall and truncation signals are limitations while nonempty content stays available", async () => {
  for (const content of [
    "Subscribe to unlock the rest of this article.",
    "Keep reading with a free trial.",
    "Upgrade to paid to continue reading.",
    "An excerpt. [Content truncated]",
    "A preview. [truncated]",
  ]) {
    const result = await fetchReviewSource(response({ id: doc.id, content }), doc, () => NOW);
    assert.equal(result.availability, "available");
    assert.equal(result.content, content);
    assert.equal(result.contentHash, contentHash(content));
    assert.match(result.limitations.join(" "), /paywall|truncat/i);
  }
});

test("explicit paywall and truncation metadata also produce limitations", async () => {
  const result = await fetchReviewSource(response({
    id: doc.id, content: "An available excerpt.", is_paywalled: true, truncated: true,
  }), doc, () => NOW);
  assert.equal(result.availability, "available");
  assert.match(result.limitations.join(" "), /paywall/i);
  assert.match(result.limitations.join(" "), /truncat/i);
});

test("substantial word_count shortfalls are indicative limitations using details or document metadata", async () => {
  for (const [metadata, details] of [
    [{ word_count: 1_000 }, {}],
    [{ word_count: "1000" }, {}],
    [{}, { word_count: 1_000 }],
  ]) {
    const result = await fetchReviewSource(response({ id: doc.id, content: "Only a short excerpt.", ...details }), { ...doc, ...metadata }, () => NOW);
    assert.equal(result.availability, "available");
    assert.match(result.limitations.join(" "), /word_count/i);
  }
  const result = await fetchReviewSource(response({ id: doc.id, content: "Four whole words here.", word_count: 4 }), doc, () => NOW);
  assert.doesNotMatch(result.limitations.join(" "), /word_count/i);
});

for (const category of ["epub", "video", "pdf", "email", "rss", "unknown"]) {
  test(`fetches ${category} content without automatically assessing completeness`, async () => {
    const result = await fetchReviewSource(response({ id: doc.id, content: "Available source text." }), { ...doc, category }, () => NOW);
    assert.equal(result.availability, "available");
    assert.equal(result.content, "Available source text.");
    assert.equal(result.contentHash, contentHash("Available source text."));
    assert.match(result.limitations.join(" "), /Codex/i);
    if (category === "epub") { assert.match(result.limitations.join(" "), /EPUB.*completeness/i); }
    if (category === "video") { assert.match(result.limitations.join(" "), /visual/i); }
  });
}

test("uses the current ISO timestamp by default", async () => {
  const before = Date.now();
  const result = await fetchReviewSource(response({ id: doc.id, content: "Content." }), doc);
  const timestamp = Date.parse(result.fetchedAt);
  assert.ok(timestamp >= before && timestamp <= Date.now());
  assert.equal(new Date(timestamp).toISOString(), result.fetchedAt);
});
