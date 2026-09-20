import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTopicPriorityImpactReport,
  formatTopicPriorityImpactMarkdown,
} from "../scripts/lib/topic-priority-report.js";
import { buildPriorityEvidence, type ContentJudgment, type PriorityJudgmentsConfig } from "../scripts/lib/priority-judgments.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function document(id: string, tags: Record<string, unknown>): PriorityDocument {
  return {
    id,
    title: id,
    summary: "Een inhoudelijk artikel.",
    saved_at: "2026-01-01T00:00:00.000Z",
    category: "article",
    reading_time: "8 mins",
    word_count: 1_500,
    tags,
  };
}

function judgment(doc: PriorityDocument, topicRelevance: ContentJudgment["relevance"]): ContentJudgment {
  const evidence = buildPriorityEvidence(doc);
  return {
    sourceFingerprint: evidence.sourceFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    relevance: 4,
    substance: 4,
    durability: 4,
    usefulness: 4,
    sequenceFit: {},
    topicRelevance: { scrum: topicRelevance, "social-studies": topicRelevance },
    confidence: "high",
    status: "accepted",
    rubricVersion: "semantic-v2",
    reasonCodes: ["semantic-review"],
    evidenceRefs: ["full-content"],
    judgedBy: "test",
    judgedAt: "2026-09-20T00:00:00.000Z",
  };
}

test("v7-to-v8 impact report exposes topic score deltas and fallback confidence", () => {
  const strong = document("strong", { facilitation: {} });
  const light = document("light", { "team coaching": {} });
  const judgments: PriorityJudgmentsConfig = {
    version: 2,
    rubricVersion: "semantic-v2",
    items: { strong: judgment(strong, 4), light: judgment(light, 1) },
  };

  const report = buildTopicPriorityImpactReport([strong, light], judgments, "2026-09-20T00:00:00.000Z");
  const strongItem = report.items.find((item) => item.id === "strong" && item.sequence === "scrum");
  const lightItem = report.items.find((item) => item.id === "light" && item.sequence === "scrum");

  assert.equal(report.beforeModel, "readwise-priority-v7");
  assert.equal(report.afterModel, "readwise-priority-v8");
  assert.equal(report.fallbackCount, 0);
  assert.ok(strongItem);
  assert.ok(lightItem);
  assert.equal(strongItem.topicRelevance, 4);
  assert.equal(strongItem.relevanceSource, "label");
  assert.notEqual(lightItem.scoreAfter, lightItem.scoreBefore);
  assert.equal(report.sequences.scrum.entries.length, 0);
  assert.match(formatTopicPriorityImpactMarkdown(report), /v7.*v8/i);
  assert.match(formatTopicPriorityImpactMarkdown(report), /topicrelevantie/i);
});

test("impact report marks an unreviewed topic as fallback", () => {
  const doc = document("fallback", { facilitation: {} });
  const report = buildTopicPriorityImpactReport([doc], { version: 2, rubricVersion: "semantic-v1", items: {} }, "2026-09-20T00:00:00.000Z");
  const item = report.items.find(({ id }) => id === "fallback");

  assert.ok(item);
  assert.equal(item.relevanceSource, "fallback");
  assert.equal(report.fallbackCount, 2);
});
