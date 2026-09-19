import { buildPriorityEvidence, type PriorityJudgmentsConfig } from "./priority-judgments.js";
import { buildPriorityExport, PRIORITY_MODEL, SEQUENCE_ORDER } from "./readwise-priority-v7.js";
import type { CoreInterestPriorityConfig } from "./core-interest-priority.js";
import type { PriorityDocument } from "./readwise-priority-v2.js";
import type { PrioritySequence } from "./priority-sequences.js";

export interface PriorityComparisonItem {
  id: string;
  title: string;
  sequence: PrioritySequence;
  currentPosition: number | null;
  judgedPosition: number | null;
  score: number;
  confidence: "high" | "medium" | "low";
  curationSignals: string[];
}

export interface PrioritySequenceComparison {
  currentTop100: number;
  judgedTop100: number;
  overlap: number;
  entries: number;
  exits: number;
  spearman: number | null;
}

export interface PriorityComparisonReport {
  generatedAt: string;
  model: typeof PRIORITY_MODEL;
  sequences: Record<PrioritySequence, PrioritySequenceComparison>;
  items: PriorityComparisonItem[];
  curationConflicts: number;
  confidence: Record<"high" | "medium" | "low", number>;
}

function spearman(pairs: Array<{ current: number; judged: number }>): number | null {
  const n = pairs.length;
  if (n < 2) {return null;}
  const squaredDistance = pairs.reduce((sum, pair) => sum + (pair.current - pair.judged) ** 2, 0);
  return Number((1 - (6 * squaredDistance) / (n * (n ** 2 - 1))).toFixed(4));
}

export function buildPriorityComparisonReport(
  documents: readonly PriorityDocument[],
  judgments: PriorityJudgmentsConfig,
  generatedAt = new Date().toISOString(),
  coreInterestConfig?: CoreInterestPriorityConfig,
): PriorityComparisonReport {
  const priority = buildPriorityExport(documents, { generatedAt, judgments, coreInterestConfig });
  const items: PriorityComparisonItem[] = [];
  const confidence = { high: 0, medium: 0, low: 0 };
  let curationConflicts = 0;
  const sequences = Object.fromEntries(SEQUENCE_ORDER.map((sequence) => [sequence, {
    currentTop100: 0,
    judgedTop100: 0,
    overlap: 0,
    entries: 0,
    exits: 0,
    spearman: null,
  }])) as Record<PrioritySequence, PrioritySequenceComparison>;

  for (const doc of documents) {
    if (!doc.id) {continue;}
    const item = priority.items[doc.id];
    if (!item) {continue;}
    const evidence = buildPriorityEvidence(doc);
    confidence[item.judgmentConfidence] += 1;
    for (const sequence of item.sequences) {
      const currentPosition = item.actualPositions[sequence] ?? null;
      const judgedPosition = item.positions[sequence] ?? null;
      if (currentPosition !== null && currentPosition <= 100) {sequences[sequence].currentTop100 += 1;}
      if (judgedPosition !== null && judgedPosition <= 100) {sequences[sequence].judgedTop100 += 1;}
      if (currentPosition !== null && currentPosition <= 100 && judgedPosition !== null && judgedPosition <= 100) {sequences[sequence].overlap += 1;}
      if ((currentPosition === null || currentPosition > 100) && judgedPosition !== null && judgedPosition <= 100) {sequences[sequence].entries += 1;}
      if (currentPosition !== null && currentPosition <= 100 && (judgedPosition === null || judgedPosition > 100)) {sequences[sequence].exits += 1;}
      if (judgedPosition !== null && judgedPosition <= 100 && evidence.curationSignals.length > 0) {curationConflicts += 1;}
      items.push({ id: doc.id, title: doc.title ?? "(zonder titel)", sequence, currentPosition, judgedPosition, score: item.sequenceScores[sequence] ?? item.score, confidence: item.judgmentConfidence, curationSignals: evidence.curationSignals });
    }
  }
  for (const sequence of SEQUENCE_ORDER) {
    const pairs = items.filter((item) => item.sequence === sequence && item.currentPosition !== null && item.judgedPosition !== null).map((item) => ({ current: item.currentPosition as number, judged: item.judgedPosition as number }));
    sequences[sequence].spearman = spearman(pairs);
  }
  return { generatedAt, model: PRIORITY_MODEL, sequences, items, curationConflicts, confidence };
}
