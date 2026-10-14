import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidenceSnapshot,
  buildJudgmentCoverage,
  ensureMissingFallbacks,
  ensureMissingTop100Fallbacks,
  selectTop100Documents,
  validateJudgmentSet,
  type PriorityEvidenceSnapshot,
} from "../scripts/lib/priority-judge.js";
import { automatedFallbackJudgment, buildPriorityEvidence, type ContentJudgment } from "../scripts/lib/priority-judgments.js";
import { TOPIC_SEQUENCE_ORDER } from "../scripts/lib/priority-sequences.js";
import type { PriorityDocumentEvidence, PriorityJudgmentsConfig } from "../scripts/lib/priority-judgments.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function document(id: string, tags: Record<string, unknown>): PriorityDocument {
  return { id, title: id, summary: "summary", saved_at: "2026-01-01T00:00:00.000Z", tags };
}

function accepted(sourceFingerprint: string, evidenceFingerprint: string): PriorityJudgmentsConfig["items"][string] {
  return {
    sourceFingerprint,
    evidenceFingerprint,
    relevance: 2,
    substance: 2,
    durability: 2,
    usefulness: 2,
    sequenceFit: { lees: 0 },
    confidence: "medium" as const,
    status: "accepted" as const,
    reasonCodes: ["semantic-review"],
    evidenceRefs: ["summary"],
    judgedBy: "codex",
    judgedAt: "2026-09-19T00:00:00.000Z",
    rubricVersion: "semantic-v2",
  };
}

test("top-100 selection returns the union of all top-100 series and ignores ordinal values", () => {
  const docs = [
    document("one", { "aaa-top-100": {}, "lees-0001": {} }),
    document("two", { "aaa-dutch-top-100": {}, "dutch-0099": {} }),
    document("three", { "aaa-top-10": {}, "lees-0002": {} }),
  ];
  assert.deepEqual(selectTop100Documents(docs).map((doc) => doc.id), ["one", "two"]);
});

test("all-later evidence preparation includes documents outside current top-100 tags", () => {
  const docs = [
    document("top", { "aaa-top-100": {} }),
    document("outside", { philosophy: {} }),
  ];
  const snapshot = buildEvidenceSnapshot(docs, new Map(), "2026-09-20T00:00:00.000Z", "all-later");

  assert.equal(snapshot.selection, "all-later");
  assert.deepEqual(Object.keys(snapshot.documents).sort(), ["outside", "top"]);
});

test("required top-100 validation fails on missing, stale, or draft judgments", () => {
  const docs = [document("one", { "aaa-top-100": {} }), document("two", { "aaa-dutch-top-100": {} })];
  const evidence = docs.reduce<Record<string, PriorityDocumentEvidence>>((result, doc) => {
    if (doc.id) {result[doc.id] = buildPriorityEvidence(doc);}
    return result;
  }, {});
  const one = evidence.one;
  const two = evidence.two;
  if (!one || !two) {throw new Error("Test evidence ontbreekt");}
  const snapshot: PriorityEvidenceSnapshot = { version: 1, generatedAt: "2026-09-19T00:00:00.000Z", scope: "later", documents: evidence };
  const config: PriorityJudgmentsConfig = { version: 2, rubricVersion: "semantic-v2", items: { one: accepted(one.sourceFingerprint, one.evidenceFingerprint) } };
  assert.throws(() => validateJudgmentSet(docs, snapshot, config, true), /two|ontbreekt|missing/i);
  const valid = { ...config, items: {
    one: accepted(one.sourceFingerprint, one.evidenceFingerprint),
    two: accepted(two.sourceFingerprint, two.evidenceFingerprint),
  } };
  assert.deepEqual(validateJudgmentSet(docs, snapshot, valid, true), { accepted: 2, fallback: 0, missing: 0, stale: 0, rejected: 0 });
  const stale = { ...valid, items: { ...valid.items, two: accepted(two.sourceFingerprint, "b".repeat(64)) } };
  assert.throws(() => validateJudgmentSet(docs, snapshot, stale, true), /stale|fingerprint/i);
});

test("strict all-later validation requires a semantic topic rating for every topic sequence", () => {
  const docs = [document("one", { philosophy: {} })];
  const [doc] = docs;
  if (!doc) {throw new Error("Expected test document");}
  const evidence = buildPriorityEvidence(doc);
  const snapshot: PriorityEvidenceSnapshot = {
    version: 1,
    generatedAt: "2026-09-20T00:00:00.000Z",
    scope: "later",
    selection: "all-later",
    documents: { one: evidence },
  };
  const base = accepted(evidence.sourceFingerprint, evidence.evidenceFingerprint);
  assert.throws(
    () => validateJudgmentSet(docs, snapshot, { version: 2, rubricVersion: "semantic-v2", items: { one: base } }, { requireAllLater: true, requireTopicRelevance: true }),
    /topic|relevantie|one/i,
  );

  const completeTopicRelevance = Object.fromEntries(TOPIC_SEQUENCE_ORDER.map((topic) => [topic, 2])) as ContentJudgment["topicRelevance"];
  const valid = { ...base, topicRelevance: completeTopicRelevance, judgedBy: "codex-semantic-review" };
  assert.deepEqual(
    validateJudgmentSet(docs, snapshot, { version: 2, rubricVersion: "semantic-v2", items: { one: valid } }, { requireAllLater: true, requireTopicRelevance: true }),
    { accepted: 1, fallback: 0, missing: 0, stale: 0, rejected: 0, topicMissing: 0 },
  );
});

test("operational fallbacks are reported separately and fail strict semantic coverage", () => {
  const doc = document("fallback", { philosophy: {}, "aaa-top-100": {} });
  const evidence = buildPriorityEvidence(doc);
  const snapshot: PriorityEvidenceSnapshot = {
    version: 1,
    generatedAt: "2026-09-20T00:00:00.000Z",
    scope: "later",
    selection: "all-later",
    documents: { fallback: evidence },
  };
  const fallback = {
    version: 2 as const,
    rubricVersion: "semantic-v2" as const,
    items: { fallback: { ...automatedFallbackJudgment(doc), rubricVersion: "semantic-v2" } },
  };

  assert.deepEqual(validateJudgmentSet([doc], snapshot, fallback), {
    accepted: 0,
    fallback: 1,
    missing: 0,
    stale: 0,
    rejected: 0,
  });
  assert.throws(
    () => validateJudgmentSet([doc], snapshot, fallback, { requireAllLater: true, requireTopicRelevance: true }),
    /fallback|semantische review|ontbreken/i,
  );
});

test("judgment coverage selects missing, stale, fallback, and draft records incrementally", () => {
  const docs = [
    document("reused", { "aaa-top-100": {} }),
    document("missing", { "aaa-top-100": {} }),
    document("fallback", { "aaa-top-100": {} }),
    document("draft", { "aaa-top-100": {} }),
  ];
  const evidence = docs.reduce<Record<string, PriorityDocumentEvidence>>((result, doc) => {
    if (doc.id) { result[doc.id] = buildPriorityEvidence(doc); }
    return result;
  }, {});
  const snapshot: PriorityEvidenceSnapshot = { version: 1, generatedAt: "2026-09-20T00:00:00.000Z", scope: "later", selection: "all-later", documents: evidence };
  const reusedEvidence = evidence.reused;
  if (!reusedEvidence) { throw new Error("Missing reused evidence"); }
  const fallbackDocument = docs[2];
  const draftEvidence = evidence.draft;
  if (!fallbackDocument || !draftEvidence) { throw new Error("Missing fallback or draft fixture"); }
  const fallback = automatedFallbackJudgment(fallbackDocument);
  const config: PriorityJudgmentsConfig = {
    version: 2,
    rubricVersion: "semantic-v2",
    items: {
      reused: { ...semanticJudgmentForTest(reusedEvidence), rubricVersion: "semantic-v2", judgedBy: "reviewer" },
      fallback: { ...fallback, rubricVersion: "semantic-v2" },
      draft: { ...semanticJudgmentForTest(draftEvidence), status: "draft", rubricVersion: "semantic-v2", judgedBy: "reviewer" },
    },
  };

  assert.deepEqual(buildJudgmentCoverage(docs, snapshot, config), {
    total: 4,
    reused: 1,
    toReview: 3,
    incomplete: 0,
    accepted: 1,
    fallback: 1,
    draft: 1,
    rejected: 0,
    missing: 1,
    stale: 0,
    topicMissing: 0,
  });
});

function semanticJudgmentForTest(evidence: PriorityDocumentEvidence): PriorityJudgmentsConfig["items"][string] {
  return {
    sourceFingerprint: evidence.sourceFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    relevance: 2,
    substance: 2,
    durability: 2,
    usefulness: 2,
    sequenceFit: { lees: 0 },
    topicRelevance: Object.fromEntries(TOPIC_SEQUENCE_ORDER.map((topic) => [topic, 2])),
    confidence: "medium",
    reasonCodes: ["semantic-review"],
    status: "accepted",
    rubricVersion: "semantic-v2",
    evidenceRefs: ["summary"],
    judgedBy: "reviewer",
    judgedAt: "2026-09-20T00:00:00.000Z",
  };
}


test("fallback ensure adds only missing top-100 items and reports preserved statuses", () => {
  const docs = [
    document("missing", { "aaa-top-100": {} }),
    document("draft", { "aaa-top-100": {} }),
    document("rejected", { "aaa-top-100": {} }),
    document("stale", { "aaa-top-100": {} }),
    document("existing", { "aaa-top-100": {} }),
    document("outside", { philosophy: {} }),
  ];
  const evidence = docs.reduce<Record<string, PriorityDocumentEvidence>>((result, doc) => {
    if (doc.id) {result[doc.id] = buildPriorityEvidence(doc);}
    return result;
  }, {});
  const current = (id: string) => {
    const item = evidence[id];
    if (!item) {throw new Error(`Missing test evidence for ${id}`);}
    return accepted(item.sourceFingerprint, item.evidenceFingerprint);
  };
  const config: PriorityJudgmentsConfig = {
    version: 2,
    rubricVersion: "semantic-v1",
    items: {
      draft: { ...current("draft"), status: "draft" },
      rejected: { ...current("rejected"), status: "rejected" },
      stale: { ...current("stale"), sourceFingerprint: "c".repeat(64) },
      existing: current("existing"),
    },
  };

  const result = ensureMissingTop100Fallbacks(docs, config, { judgedAt: "2026-09-20T00:00:00.000Z" });
  assert.deepEqual(result.report, {
    top100: 5,
    added: ["missing"],
    existing: ["existing"],
    fallback: [],
    stale: ["stale"],
    draft: ["draft"],
    rejected: ["rejected"],
  });
  assert.equal(result.config.items.missing?.status, "accepted");
  assert.equal(result.config.items.missing?.judgedBy, "automated-fallback-v1");
  assert.equal(result.config.items.stale?.sourceFingerprint, "c".repeat(64));
  assert.equal(result.config.items.draft?.status, "draft");
  assert.equal(result.config.items.rejected?.status, "rejected");
  assert.equal(result.config.items.outside, undefined);
});

test("all-later fallback preparation adds low-confidence topic relevance without changing membership", () => {
  const docs = [document("outside", { facilitation: {} })];
  const result = ensureMissingFallbacks(docs, { version: 2, rubricVersion: "semantic-v1", items: {} }, { selection: "all-later", judgedAt: "2026-09-20T00:00:00.000Z" });
  const judgment = result.config.items.outside;
  assert.equal(result.report.top100, 1);
  assert.equal(result.report.added.length, 1);
  assert.equal(judgment?.topicRelevance?.scrum, 4);
  assert.equal(judgment?.confidence, "low");
});
