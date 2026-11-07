import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildPriorityEvidence, evaluateJudgmentValidity, judgmentFor, type ContentJudgment } from "../scripts/lib/priority-judgments.js";
import { sourceJudgmentIsCurrent } from "../scripts/lib/priority-review.js";
import { buildJudgmentCoverage, validateJudgmentSet } from "../scripts/lib/priority-judge.js";
import type { ReviewSource } from "../scripts/lib/priority-review-source.js";
import { TOPIC_SEQUENCE_ORDER } from "../scripts/lib/priority-sequences.js";

const hash = (text: string): string => createHash("sha256").update(text).digest("hex");
const doc = { id: "validity", title: "Evidence", saved_at: "2026-01-01", tags: { "aaa-top-100": {} } };
const evidence = buildPriorityEvidence(doc);
const preferencesFingerprint = hash("preferences");
const content = "A complete source.";
const source = { version: 1 as const, documentId: doc.id, sourceFingerprint: evidence.sourceFingerprint, contentHash: hash(content), content, availability: "available" as const, fetchedAt: "2026-11-07", limitations: [] };
function judgment(): ContentJudgment {
  return { sourceFingerprint: evidence.sourceFingerprint, evidenceFingerprint: evidence.evidenceFingerprint,
    preferencesFingerprint, status: "accepted", confidence: "medium", judgedBy: "reviewer", judgedAt: "2026-11-07",
    relevance: 2, substance: 2, durability: 2, usefulness: 2, sequenceFit: {}, reasonCodes: [], rubricVersion: "semantic-v2",
    topicRelevance: Object.fromEntries(TOPIC_SEQUENCE_ORDER.map(topic => [topic, 2])),
    sourceReview: { standard: "full-source-v1", contentHash: hash(content), sourceStatus: "complete", assessmentFingerprint: hash("assessment") } };
}

test("operation remains usable when preferences or source review require renewed evidence", () => {
  const j = judgment();
  delete j.preferencesFingerprint;
  delete j.sourceReview;
  assert.equal(evaluateJudgmentValidity(doc, j, { level: "operational" }).usable, true);
  assert.equal(judgmentFor(doc, { [doc.id]: j }).source, "label");
  assert.equal(evaluateJudgmentValidity(doc, j, { level: "evidence", evidence, preferencesFingerprint }).usable, false);
  assert.equal(sourceJudgmentIsCurrent(j, doc, source, preferencesFingerprint), false);
});

test("evidence policy and both report adapters agree under independent context changes", () => {
  for (const change of ["none", "metadata", "evidence", "preferences", "rubric", "fallback", "draft", "rejected"] as const) {
    const j = judgment();
    const currentDoc = change === "metadata" ? { ...doc, title: "Changed" } : doc;
    const currentEvidence = change === "evidence" ? { ...evidence, evidenceFingerprint: hash("changed") } : evidence;
    if (change === "preferences") { j.preferencesFingerprint = hash("changed"); }
    if (change === "rubric") { j.rubricVersion = "semantic-v1"; }
    if (change === "fallback") { j.judgedBy = "automated-fallback-v1"; }
    if (change === "draft" || change === "rejected") { j.status = change; }
    const context = { level: "evidence" as const, evidence: currentEvidence, preferencesFingerprint, rubricVersion: "semantic-v2" };
    const result = evaluateJudgmentValidity(currentDoc, j, context);
    assert.equal(result.usable, change === "none", change);
    const snapshot = { version: 1 as const, generatedAt: "2026-11-07", scope: "later" as const, rubricVersion: "semantic-v2" as const, preferencesFingerprint, documents: { [doc.id]: currentEvidence } };
    const config = { version: 2 as const, rubricVersion: "semantic-v2", items: { [doc.id]: j } };
    assert.equal(buildJudgmentCoverage([currentDoc], snapshot, config).reused, change === "none" ? 1 : 0, change);
    assert.equal(validateJudgmentSet([currentDoc], snapshot, config).accepted, change === "none" ? 1 : 0, change);
  }
});

test("legacy snapshot context and inherited rubric remain supported", () => {
  const j = judgment();
  delete j.preferencesFingerprint;
  delete j.rubricVersion;
  assert.equal(evaluateJudgmentValidity(doc, j, { level: "evidence", evidence }).usable, true);
  assert.equal(evaluateJudgmentValidity(doc, j, { level: "evidence", evidence, rubricVersion: "semantic-v2", configRubricVersion: "semantic-v2" }).usable, true);
});

test("full source policy and review adapter reject independently changed proof", () => {
  for (const change of ["none", "content", "hash", "unavailable", "preferences", "topics", "confidence", "provenance"] as const) {
    const j = judgment();
    const currentSource: ReviewSource = { ...source };
    if (change === "content") { currentSource.content = content + " Changed"; }
    if (change === "hash") { currentSource.contentHash = hash("changed"); }
    if (change === "unavailable") { currentSource.availability = "error"; }
    if (change === "preferences") { j.preferencesFingerprint = hash("changed"); }
    if (change === "topics") { delete j.topicRelevance; }
    if (change === "confidence") { j.confidence = "low"; }
    if (change === "provenance") { delete j.sourceReview; }
    assert.equal(evaluateJudgmentValidity(doc, j, { level: "full-source", source: currentSource, preferencesFingerprint }).usable, change === "none", change);
    assert.equal(sourceJudgmentIsCurrent(j, doc, currentSource, preferencesFingerprint), change === "none", change);
    assert.equal(judgmentFor(doc, { [doc.id]: j }).source, "label", change);
  }
});


test("missing and incomplete evidence keep distinct reporting and operational outcomes", () => {
  const j = judgment();
  delete j.topicRelevance;
  assert.equal(evaluateJudgmentValidity(doc, undefined, { level: "operational" }).reason, "missing");
  assert.equal(evaluateJudgmentValidity(doc, j, { level: "evidence", evidence: undefined }).reason, "missing");
  const snapshot = { version: 1 as const, generatedAt: "2026-11-07", scope: "later" as const, documents: { [doc.id]: evidence } };
  const config = { version: 2 as const, rubricVersion: "semantic-v2", items: { [doc.id]: j } };
  const coverage = buildJudgmentCoverage([doc], snapshot, config);
  assert.equal(coverage.accepted, 1);
  assert.equal(coverage.reused, 0);
  assert.equal(coverage.topicMissing, 1);
  assert.throws(() => validateJudgmentSet([doc], snapshot, config, { requireTop100: true, requireTopicRelevance: true }), /validity/);
  assert.equal(judgmentFor(doc, config).source, "label");
});

test("automated fallback stays classified before preference staleness", () => {
  const j = { ...judgment(), judgedBy: "automated-fallback-v1", preferencesFingerprint: hash("old") };
  const result = evaluateJudgmentValidity(doc, j, { level: "evidence", evidence, preferencesFingerprint });
  assert.equal(result.reason, "fallback");
  assert.equal(result.usable, false);
  assert.equal(evaluateJudgmentValidity(doc, j, { level: "operational" }).usable, true);
  assert.equal(judgmentFor(doc, { [doc.id]: j }).source, "fallback");
});
