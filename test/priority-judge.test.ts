import assert from "node:assert/strict";
import test from "node:test";

import {
  batchPriorityEvidence,
  selectTop100Documents,
  validateJudgmentSet,
  type PriorityEvidenceSnapshot,
} from "../scripts/lib/priority-judge.js";
import { buildPriorityEvidence } from "../scripts/lib/priority-judgments.js";
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

test("batching keeps every evidence record exactly once", () => {
  const evidence = ["one", "two", "three"].map((id) => buildPriorityEvidence(document(id, { "aaa-top-100": {} })));
  const batches = batchPriorityEvidence(evidence, 2);
  assert.deepEqual(batches.map((batch) => batch.map((item) => item.documentId)), [["one", "two"], ["three"]]);
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
  const config: PriorityJudgmentsConfig = { version: 2, rubricVersion: "semantic-v1", items: { one: accepted(one.sourceFingerprint, one.evidenceFingerprint) } };
  assert.throws(() => validateJudgmentSet(docs, snapshot, config, true), /two|ontbreekt|missing/i);
  const valid = { ...config, items: {
    one: accepted(one.sourceFingerprint, one.evidenceFingerprint),
    two: accepted(two.sourceFingerprint, two.evidenceFingerprint),
  } };
  assert.deepEqual(validateJudgmentSet(docs, snapshot, valid, true), { accepted: 2, missing: 0, stale: 0, rejected: 0 });
  const stale = { ...valid, items: { ...valid.items, two: accepted(two.sourceFingerprint, "b".repeat(64)) } };
  assert.throws(() => validateJudgmentSet(docs, snapshot, stale, true), /stale|fingerprint/i);
});
