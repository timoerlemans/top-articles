import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTOMATED_FALLBACK_JUDGER,
  buildPriorityEvidence,
  evidenceFingerprint,
  automatedFallbackJudgment,
  judgmentFor,
  validatePriorityJudgments,
  type PriorityDocumentEvidence,
} from "../scripts/lib/priority-judgments.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function document(overrides: Partial<PriorityDocument> = {}): PriorityDocument {
  return {
    id: "doc-1",
    title: "Een artikel",
    summary: "Een samenvatting.",
    notes: "Waarom lezen: bruikbaar voor mijn werk.\nBeste moment: later",
    category: "article",
    tags: {
      philosophy: {},
      "lees-0001": {},
      "aaa-top-100": {},
      "must-read": {},
    },
    ...overrides,
  };
}

function accepted(fingerprint: string): Record<string, unknown> {
  return {
    sourceFingerprint: fingerprint,
    evidenceFingerprint: "a".repeat(64),
    relevance: 3,
    substance: 3,
    durability: 3,
    usefulness: 3,
    sequenceFit: { lees: 0 },
    confidence: "high",
    status: "accepted",
    reasonCodes: ["semantic-review"],
    evidenceRefs: ["summary", "highlight:h1"],
    judgedBy: "codex",
    judgedAt: "2026-09-19T00:00:00.000Z",
  };
}

test("priority evidence excludes ordinal, top-list, and curation tags from content context", () => {
  const evidence = buildPriorityEvidence(document());
  assert.deepEqual(evidence.contentTags, ["philosophy"]);
  assert.deepEqual(evidence.curationSignals, ["must-read"]);
  assert.deepEqual(evidence.positionTagsExcluded, ["aaa-top-100", "lees-0001"]);
});

test("semantic topic tags that share a sequence name remain content context", () => {
  const evidence = buildPriorityEvidence(document({ tags: { adhd: {}, scrum: {}, "adhd-0001": {} } }));
  assert.deepEqual(evidence.contentTags, ["adhd", "scrum"]);
});

test("priority evidence deduplicates generated highlights but preserves semantic text", () => {
  const evidence = buildPriorityEvidence(document(), [
    { id: "h1", text: "Een belangrijk principe.", note: "", tags: ["readwise-enrich"], pipeline: "readwise-enrich" },
    { id: "h2", text: "Een belangrijk principe.", note: null, tags: [], pipeline: "readwise-triage" },
    { id: "h3", text: "Een ander mechanisme.", note: null, tags: [], pipeline: "unknown" },
  ]);
  assert.equal(evidence.highlights.length, 2);
  assert.equal(evidence.highlights[0]?.text, "Een belangrijk principe.");
  assert.equal(evidence.highlights[0]?.provenance, "readwise-enrich");
  assert.equal(evidence.highlights[1]?.text, "Een ander mechanisme.");
});

test("evidence fingerprint changes when a new unique highlight changes the evidence", () => {
  const first = buildPriorityEvidence(document(), [{ id: "h1", text: "Eerste inzicht." }]);
  const second = buildPriorityEvidence(document(), [
    { id: "h1", text: "Eerste inzicht." },
    { id: "h2", text: "Nieuw inzicht." },
  ]);
  assert.notEqual(evidenceFingerprint(first), evidenceFingerprint(second));
  assert.equal(evidenceFingerprint(first), evidenceFingerprint(buildPriorityEvidence(document(), [{ id: "h9", text: "Eerste inzicht." }])));
});

test("judgment config accepts accepted, draft, and rejected v2 records with metadata", () => {
  const evidence: PriorityDocumentEvidence = buildPriorityEvidence(document());
  const value = {
    version: 2,
    rubricVersion: "semantic-v1",
    items: { "doc-1": accepted(evidence.sourceFingerprint) },
  };
  assert.equal(validatePriorityJudgments(value), true);
  assert.equal(validatePriorityJudgments({ ...value, items: { "doc-1": { ...accepted(evidence.sourceFingerprint), status: "draft" } } }), true);
  assert.equal(validatePriorityJudgments({ ...value, items: { "doc-1": { ...accepted(evidence.sourceFingerprint), status: "rejected" } } }), true);
  assert.equal(validatePriorityJudgments({ ...value, items: { "doc-1": { ...accepted(evidence.sourceFingerprint), judgedBy: undefined } } }), false);
  assert.equal(validatePriorityJudgments({ ...value, items: { "doc-1": { ...accepted(evidence.sourceFingerprint), highlights: ["raw text"] } } }), false);
});

test("runtime uses only accepted current judgments and marks automated fallbacks", () => {
  const fallback = automatedFallbackJudgment(document(), "2026-09-20T00:00:00.000Z");
  assert.equal(fallback.status, "accepted");
  assert.equal(fallback.judgedBy, AUTOMATED_FALLBACK_JUDGER);
  assert.equal(fallback.confidence, "low");
  assert.equal(fallback.judgedAt, "2026-09-20T00:00:00.000Z");
  assert.equal(judgmentFor(document(), { version: 2, rubricVersion: "semantic-v1", items: { "doc-1": fallback } }).source, "fallback");

  const draft = { ...fallback, status: "draft" as const };
  assert.equal(judgmentFor(document(), { version: 2, rubricVersion: "semantic-v1", items: { "doc-1": draft } }).source, "fallback");

  const rejected = { ...fallback, status: "rejected" as const };
  assert.equal(judgmentFor(document(), { version: 2, rubricVersion: "semantic-v1", items: { "doc-1": rejected } }).source, "fallback");
});
