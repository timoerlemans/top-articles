import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildPriorityEvidence, validateContentJudgment } from "../scripts/lib/priority-judgments.js";
import { acceptedReviewJudgment, reviewAttemptIsCurrent } from "../scripts/lib/priority-review.js";
import { TOPIC_SEQUENCE_ORDER } from "../scripts/lib/priority-sequences.js";
import { scorePriorityDocument } from "../scripts/lib/readwise-priority-v8.js";
import type { ReviewAssessment } from "../scripts/lib/priority-review-standard.js";

const content = "A complete argument with evidence and a considered conclusion.";
const hash = (s: string): string => createHash("sha256").update(s).digest("hex");
const doc = { id: "a", title: "A", summary: "Summary", saved_at: "2026-01-01", tags: {} };
const evidence = buildPriorityEvidence(doc);
const source = { version: 1 as const, documentId: "a", sourceFingerprint: evidence.sourceFingerprint, contentHash: hash(content), content, fetchedAt: "2026-10-29T00:00:00Z", availability: "available" as const, limitations: [] };
function assessment(): ReviewAssessment {
  return {
    version: 1, standard: "full-source-v1", documentId: "a", sourceFingerprint: evidence.sourceFingerprint,
    contentHash: hash(content), preferencesFingerprint: hash("preferences"), status: "accepted", sourceStatus: "complete",
    completenessReason: "The argument and conclusion are both present.", thesis: "An argument.",
    readRanges: [{ start: 0, end: content.length }],
    dimensions: ["relevance", "substance", "durability", "usefulness", ...TOPIC_SEQUENCE_ORDER].map((dimension) => ({ dimension, reason: "Evidence supports this rating.", passages: [{ start: 0, end: content.length }] })),
    uncertainties: { source: [], interpretation: [], personalFit: [] }, reason: "Independently read source.", judgedBy: "codex", judgedAt: "2026-10-29T00:00:00Z",
    judgment: { relevance: 2, substance: 2, durability: 2, usefulness: 2, topicRelevance: Object.fromEntries(TOPIC_SEQUENCE_ORDER.map((t) => [t, 0])), sequenceFit: {}, confidence: "high", reasonCodes: ["source-review"] },
  };
}
test("accepted full-source reviews preserve only hashes and references in config", () => {
  const result = acceptedReviewJudgment(doc, source, assessment(), hash("preferences"));
  assert.equal(result.confidence, "high");
  assert.equal(result.sourceReview?.contentHash, hash(content));
  assert.ok(validateContentJudgment(result));
  assert.ok(!JSON.stringify(result).includes(content));
});
test("high requires complete source and no material unresolved uncertainty", () => {
  assert.throws(() => acceptedReviewJudgment(doc, source, { ...assessment(), sourceStatus: "partial" }, hash("preferences")), /high|complete/i);
  assert.throws(() => acceptedReviewJudgment(doc, source, { ...assessment(), uncertainties: { source: [], interpretation: [], personalFit: ["Uncertain fit"] } }, hash("preferences")), /high|uncertainty|onzeker/i);
});
test("forged refs, changed content and current preferences fail closed", () => {
  const invalid = assessment();
  const ref = invalid.dimensions[0]?.passages[0];
  assert.ok(ref);
  ref.end = content.length + 1;
  assert.throws(() => acceptedReviewJudgment(doc, source, invalid, hash("preferences")), /passage/i);
  assert.throws(() => acceptedReviewJudgment(doc, { ...source, content: content + " changed" }, assessment(), hash("preferences")), /hash|bron/i);
  assert.throws(() => acceptedReviewJudgment(doc, source, assessment(), hash("new preferences")), /voorkeur|preferences/i);
});
test("a grounded medium is complete work and a draft need not invent scores", () => {
  const a = assessment();
  a.judgment = { ...(a.judgment as object), confidence: "medium" };
  assert.equal(acceptedReviewJudgment(doc, source, a, hash("preferences")).confidence, "medium");
  assert.ok(reviewAttemptIsCurrent(a, doc, source, hash("preferences")));
  const draft = { ...a };
  delete draft.judgment;
  assert.ok(reviewAttemptIsCurrent({ ...draft, status: "draft" }, doc, source, hash("preferences")));
  assert.ok(!reviewAttemptIsCurrent(draft, doc, { ...source, contentHash: hash("changed") }, hash("preferences")));
});
test("legacy judgments remain valid while malformed new provenance is rejected", () => {
  const j = acceptedReviewJudgment(doc, source, assessment(), hash("preferences"));
  const legacy = { ...j };
  delete legacy.sourceReview;
  assert.ok(validateContentJudgment(legacy));
  assert.ok(!validateContentJudgment({ ...j, sourceReview: { ...j.sourceReview, contentHash: "bad" } }));
});

test("verified source provenance reaches the browser export without penalizing honest medium confidence", () => {
  const high = acceptedReviewJudgment(doc, source, assessment(), hash("preferences"));
  const mediumAssessment = assessment();
  mediumAssessment.judgment = { ...(mediumAssessment.judgment as object), confidence: "medium" };
  mediumAssessment.uncertainties.personalFit = ["The transfer to this reader's daily work remains uncertain."];
  const medium = acceptedReviewJudgment(doc, source, mediumAssessment, hash("preferences"));
  const highScore = scorePriorityDocument(doc, {}, { a: high });
  const mediumScore = scorePriorityDocument(doc, {}, { a: medium });
  assert.equal(highScore.judgmentSourceStatus, "complete");
  assert.equal(mediumScore.judgmentSourceStatus, "complete");
  assert.equal(highScore.score, mediumScore.score);
});

const originalArticle = "The full original article contains its methods, qualifications and complete conclusion beyond the saved excerpt.";
const additionalAssessment = () => {
  const a = assessment();
  return {
    ...a,
    additionalSources: [{
      id: "original-article", sourceUrl: "https://example.org/original-article",
      fetchedAt: "2026-10-31T00:00:00Z", content: originalArticle, contentHash: hash(originalArticle),
      readRanges: [{ start: 0, end: 45 }, { start: 45, end: originalArticle.length }],
    }],
    dimensions: a.dimensions.map((dimension) => ({
      ...dimension, passages: [{ sourceId: "original-article", start: 65, end: originalArticle.length }],
    })),
  };
};

test("a fully read original article can support passages outside the Reader excerpt without publishing its text", () => {
  const result = acceptedReviewJudgment(doc, source, additionalAssessment(), hash("preferences"));
  assert.equal(result.confidence, "high");
  assert.equal(result.sourceReview?.contentHash, hash(content));
  assert.ok(validateContentJudgment(result));
  assert.ok(result.evidenceRefs?.includes(`additional-source-sha256:${hash(originalArticle)}`));
  assert.ok(!JSON.stringify(result).includes(originalArticle));
  assert.ok(!JSON.stringify(result).includes("https://example.org/original-article"));
});

test("additional text keeps its exact whitespace when checking hashes and reading offsets", () => {
  const a = additionalAssessment();
  const original = a.additionalSources[0];
  assert.ok(original);
  original.content = `\n${originalArticle}\n`;
  original.contentHash = hash(original.content);
  original.readRanges = [{ start: 0, end: original.content.length }];
  assert.doesNotThrow(() => acceptedReviewJudgment(doc, source, a, hash("preferences")));
});

test("changing additional text invalidates the review rather than retaining its old provenance", () => {
  const a = additionalAssessment();
  assert.doesNotThrow(() => acceptedReviewJudgment(doc, source, a, hash("preferences")));
  const original = a.additionalSources[0];
  assert.ok(original);
  original.content += " Changed after reading.";
  assert.throws(() => acceptedReviewJudgment(doc, source, a, hash("preferences")), /hash/i);
});

test("a gap in reading the additional article cannot count as complete source coverage", () => {
  const a = additionalAssessment();
  assert.doesNotThrow(() => acceptedReviewJudgment(doc, source, a, hash("preferences")));
  const original = a.additionalSources[0];
  assert.ok(original);
  original.readRanges = [{ start: 0, end: 45 }, { start: 46, end: originalArticle.length }];
  assert.throws(() => acceptedReviewJudgment(doc, source, a, hash("preferences")), /gat|lezing|bereik/i);
});

test("passages must name an available source and stay within that source", () => {
  const a = additionalAssessment();
  assert.doesNotThrow(() => acceptedReviewJudgment(doc, source, a, hash("preferences")));
  const ref = a.dimensions[0]?.passages[0];
  assert.ok(ref);
  ref.sourceId = "unrecorded-article";
  assert.throws(() => acceptedReviewJudgment(doc, source, a, hash("preferences")), /bron|source/i);
  ref.sourceId = "original-article";
  ref.end = originalArticle.length + 1;
  assert.throws(() => acceptedReviewJudgment(doc, source, a, hash("preferences")), /passage/i);
});

test("duplicate source IDs cannot make passage provenance ambiguous", () => {
  const a = additionalAssessment();
  assert.doesNotThrow(() => acceptedReviewJudgment(doc, source, a, hash("preferences")));
  const original = a.additionalSources[0];
  assert.ok(original);
  a.additionalSources.push({ ...original });
  assert.throws(() => acceptedReviewJudgment(doc, source, a, hash("preferences")), /uniek|dubbel|bron/i);
});

test("additional source provenance requires an HTTP or HTTPS retrieval URL", () => {
  const a = additionalAssessment();
  assert.doesNotThrow(() => acceptedReviewJudgment(doc, source, a, hash("preferences")));
  const original = a.additionalSources[0];
  assert.ok(original);
  original.sourceUrl = "file:///private/not-a-retrieval-url";
  assert.throws(() => acceptedReviewJudgment(doc, source, a, hash("preferences")));
});
