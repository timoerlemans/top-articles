import { buildPriorityExport as buildV7Export, PRIORITY_MODEL as PRIORITY_MODEL_V7 } from "./readwise-priority-v7.js";
import { buildPriorityExport as buildV8Export, PRIORITY_MODEL as PRIORITY_MODEL_V8 } from "./readwise-priority-v8.js";
import type { CoreInterestPriorityConfig } from "./core-interest-priority.js";
import type { ContentJudgment, PriorityJudgmentsConfig } from "./priority-judgments.js";
import type { PriorityDocument } from "./readwise-priority-v2.js";
import type { PriorityOverrideMap, PriorityOverridesConfig } from "./readwise-priority-v8.js";
import { TOPIC_SEQUENCE_ORDER } from "./priority-sequences.js";
import type { TopicSequence } from "./priority-sequences.js";

export interface TopicPriorityImpactItem {
  id: string;
  title: string;
  sequence: TopicSequence;
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  beforePosition: number | null;
  afterPosition: number | null;
  topicRelevance: number;
  relevanceSource: "label" | "fallback";
  relevanceConfidence: ContentJudgment["confidence"];
}

export interface TopicPrioritySequenceImpact {
  entries: TopicPriorityImpactItem[];
  exits: TopicPriorityImpactItem[];
  beforeTop100: number;
  afterTop100: number;
  overlap: number;
  fallbackCount: number;
}

export interface TopicPriorityImpactReport {
  generatedAt: string;
  beforeModel: typeof PRIORITY_MODEL_V7;
  afterModel: typeof PRIORITY_MODEL_V8;
  fallbackCount: number;
  sequences: Record<TopicSequence, TopicPrioritySequenceImpact>;
  items: TopicPriorityImpactItem[];
}

function scoreDeltaOrder(a: TopicPriorityImpactItem, b: TopicPriorityImpactItem): number {
  return Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta) || b.scoreDelta - a.scoreDelta || a.id.localeCompare(b.id);
}

export function buildTopicPriorityImpactReport(
  documents: readonly PriorityDocument[],
  judgments: PriorityJudgmentsConfig,
  generatedAt = new Date().toISOString(),
  overrides: PriorityOverridesConfig | PriorityOverrideMap = {},
  coreInterestConfig?: CoreInterestPriorityConfig,
): TopicPriorityImpactReport {
  const before = buildV7Export(documents, { generatedAt, overrides, judgments });
  const after = buildV8Export(documents, { generatedAt, overrides, judgments, coreInterestConfig });
  const titleById = new Map(documents.flatMap((doc) => doc.id ? [[doc.id, doc.title ?? "(zonder titel)"] as const] : []));
  const items: TopicPriorityImpactItem[] = [];
  const sequences = Object.fromEntries(TOPIC_SEQUENCE_ORDER.map((sequence) => [sequence, {
    entries: [],
    exits: [],
    beforeTop100: 0,
    afterTop100: 0,
    overlap: 0,
    fallbackCount: 0,
  }])) as unknown as Record<TopicSequence, TopicPrioritySequenceImpact>;

  for (const [id, afterItem] of Object.entries(after.items)) {
    const beforeItem = before.items[id];
    if (!beforeItem) {continue;}
    for (const sequence of TOPIC_SEQUENCE_ORDER) {
      if (!afterItem.sequences.includes(sequence)) {continue;}
      const afterSequenceScore = afterItem.sequenceScores[sequence];
      const scoreBefore = beforeItem.sequences.includes(sequence) ? beforeItem.sequenceScores[sequence] ?? beforeItem.score : beforeItem.score;
      if (!afterSequenceScore || !Number.isInteger(scoreBefore)) {continue;}
      const impact: TopicPriorityImpactItem = {
        id,
        title: titleById.get(id) ?? "(zonder titel)",
        sequence,
        scoreBefore,
        scoreAfter: afterSequenceScore.score,
        scoreDelta: afterSequenceScore.score - scoreBefore,
        beforePosition: beforeItem.positions[sequence] ?? null,
        afterPosition: afterItem.positions[sequence] ?? null,
        topicRelevance: afterSequenceScore.topicRelevance ?? 0,
        relevanceSource: afterSequenceScore.relevanceSource ?? "fallback",
        relevanceConfidence: afterSequenceScore.relevanceConfidence ?? "low",
      };
      items.push(impact);
      const sequenceReport = sequences[sequence];
      if (impact.relevanceSource === "fallback") {sequenceReport.fallbackCount += 1;}
      if (impact.beforePosition !== null && impact.beforePosition <= 100) {sequenceReport.beforeTop100 += 1;}
      if (impact.afterPosition !== null && impact.afterPosition <= 100) {sequenceReport.afterTop100 += 1;}
      if (impact.beforePosition !== null && impact.beforePosition <= 100 && impact.afterPosition !== null && impact.afterPosition <= 100) {sequenceReport.overlap += 1;}
      if ((impact.beforePosition === null || impact.beforePosition > 100) && impact.afterPosition !== null && impact.afterPosition <= 100) {sequenceReport.entries.push(impact);}
      if (impact.beforePosition !== null && impact.beforePosition <= 100 && (impact.afterPosition === null || impact.afterPosition > 100)) {sequenceReport.exits.push(impact);}
    }
  }

  items.sort(scoreDeltaOrder);
  for (const sequence of TOPIC_SEQUENCE_ORDER) {
    sequences[sequence].entries.sort(scoreDeltaOrder);
    sequences[sequence].exits.sort(scoreDeltaOrder);
  }
  return {
    generatedAt,
    beforeModel: PRIORITY_MODEL_V7,
    afterModel: PRIORITY_MODEL_V8,
    fallbackCount: items.filter(({ relevanceSource }) => relevanceSource === "fallback").length,
    sequences,
    items,
  };
}

function position(value: number | null): string {
  return value === null ? "—" : String(value);
}

export function formatTopicPriorityImpactMarkdown(report: TopicPriorityImpactReport): string {
  const lines = [
    "# Topic-priority-impactrapport",
    "",
    `Gegenereerd: ${report.generatedAt}`,
    `Model: ${report.beforeModel} → ${report.afterModel}`,
    `Fallback-topicrelevantie: ${String(report.fallbackCount)}`,
    "",
    "| Reeks | v7 top-100 | v8 top-100 | Overlap | Fallback |",
    "|---|---:|---:|---:|---:|",
    ...TOPIC_SEQUENCE_ORDER.map((sequence) => {
      const impact = report.sequences[sequence];
      return `| ${sequence} | ${String(impact.beforeTop100)} | ${String(impact.afterTop100)} | ${String(impact.overlap)} | ${String(impact.fallbackCount)} |`;
    }),
    "",
    "## Grootste scoreverschuivingen",
    "",
    "| Artikel | Reeks | v7 | v8 | Verschil | Topicrelevantie | Bron | Positie |",
    "|---|---|---:|---:|---:|---:|---|---|",
    ...report.items.slice(0, 50).map((item) => `| ${item.title} | ${item.sequence} | ${String(item.scoreBefore)} | ${String(item.scoreAfter)} | ${item.scoreDelta >= 0 ? "+" : ""}${String(item.scoreDelta)} | ${String(item.topicRelevance)}/4 | ${item.relevanceSource} | ${position(item.beforePosition)} → ${position(item.afterPosition)} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
