import assert from "node:assert/strict";
import test from "node:test";

import { buildPriorityComparisonReport } from "../scripts/lib/priority-report.js";
import { buildPriorityEvidence } from "../scripts/lib/priority-judgments.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function document(id: string, title: string, tags: Record<string, unknown>): PriorityDocument {
  return { id, title, summary: title, saved_at: "2026-01-01T00:00:00.000Z", category: "article", tags };
}

test("comparison report measures judged top-100 overlap and rank movement per sequence", () => {
  const first = document("first", "First", { "aaa-top-100": {}, "lees-0001": {} });
  const second = document("second", "Second", { "aaa-top-100": {}, "lees-0002": {} });
  const evidence = [first, second].map((doc) => buildPriorityEvidence(doc));
  const firstEvidence = evidence[0];
  const secondEvidence = evidence[1];
  if (!firstEvidence || !secondEvidence) {throw new Error("Test evidence ontbreekt");}
  const judgments = {
    version: 2 as const,
    rubricVersion: "semantic-v1",
    items: {
      first: { sourceFingerprint: firstEvidence.sourceFingerprint, evidenceFingerprint: firstEvidence.evidenceFingerprint, relevance: 1 as const, substance: 1 as const, durability: 1 as const, usefulness: 1 as const, sequenceFit: { lees: 0 as const }, confidence: "high" as const, status: "accepted" as const, reasonCodes: ["semantic-review"], evidenceRefs: ["summary"], judgedBy: "codex", judgedAt: "2026-09-19T00:00:00.000Z" },
      second: { sourceFingerprint: secondEvidence.sourceFingerprint, evidenceFingerprint: secondEvidence.evidenceFingerprint, relevance: 4 as const, substance: 4 as const, durability: 4 as const, usefulness: 4 as const, sequenceFit: { lees: 0 as const }, confidence: "high" as const, status: "accepted" as const, reasonCodes: ["semantic-review"], evidenceRefs: ["summary"], judgedBy: "codex", judgedAt: "2026-09-19T00:00:00.000Z" },
    },
  };
  const report = buildPriorityComparisonReport([first, second], judgments, "2026-09-19T00:00:00.000Z");
  assert.equal(report.model, "readwise-priority-v7");
  const lees = report.sequences.lees;
  assert.equal(lees.currentTop100, 2);
  assert.equal(lees.judgedTop100, 2);
  assert.equal(lees.overlap, 2);
  assert.ok(report.items.some((item) => item.id === "second" && item.judgedPosition === 1 && item.currentPosition === 2));
  assert.equal(report.curationConflicts, 0);
});
