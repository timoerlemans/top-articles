import {
  actualPositionsForDocument,
  buildPriorityExport as buildGlobalPriorityExport,
  detectDutch,
  scorePriorityDocument as scoreGlobalPriorityDocument,
  SEQUENCE_ORDER,
  sequencesForDocument,
  validatePriorityExport as validateGlobalExportShape,
} from "./readwise-priority-v7.js";
import type {
  ContentJudgment,
  CoreInterestPriority,
  CoreInterestPriorityConfig,
  PriorityDocument,
  PriorityExportOptions as PriorityExportOptionsV7,
  PriorityOverride,
  PriorityOverrideMap,
  PriorityOverridesConfig,
  PriorityScoreResult as PriorityScoreResultV7,
  PrioritySequence,
  WeightedCoreInterestMatch,
} from "./readwise-priority-v7.js";
import type { PriorityTier } from "./readwise-priority-v2.js";
import { comparePriorityItems } from "./readwise-priority-v3.js";
import { judgmentFor, topicRelevanceFor } from "./priority-judgments.js";
import { TOPIC_SEQUENCE_ORDER } from "./priority-sequences.js";
import type { TopicSequence } from "./priority-sequences.js";

export { actualPositionsForDocument, detectDutch, SEQUENCE_ORDER, sequencesForDocument };
export type {
  ContentJudgment,
  CoreInterestPriority,
  CoreInterestPriorityConfig,
  PriorityDocument,
  PriorityOverride,
  PriorityOverrideMap,
  PriorityOverridesConfig,
  PriorityScoreResult as PriorityScoreResult,
  PrioritySequence,
  WeightedCoreInterestMatch,
} from "./readwise-priority-v7.js";
export type { PriorityTier } from "./readwise-priority-v2.js";
export type { PriorityJudgmentsConfig } from "./priority-judgments.js";
export type { TopicSequence } from "./priority-sequences.js";

export const PRIORITY_MODEL = "readwise-priority-v8" as const;
export const SEQUENCE_FIT_WEIGHT = 3;

export interface PriorityTopicComponents {
  kerninteresse: number;
  topic_relevantie: number;
  substantie: number;
  duurzaamheid: number;
  bruikbaarheid: number;
  leeskans: number;
  nederlandse_taal: number;
  aftrek: number;
}

export type PrioritySequenceScoreMode = "global" | "topic";

export interface PrioritySequenceScore {
  score: number;
  tier: PriorityTier;
  mode: PrioritySequenceScoreMode;
  topicRelevance?: number;
  relevanceSource?: "label" | "fallback";
  relevanceConfidence?: ContentJudgment["confidence"];
  components?: PriorityTopicComponents;
}

export type PrioritySequenceScores = Partial<Record<PrioritySequence, PrioritySequenceScore>>;

export interface PriorityExportItem extends PriorityScoreResultV7 {
  sequences: PrioritySequence[];
  sequenceScores: PrioritySequenceScores;
  positions: Partial<Record<PrioritySequence, number>>;
  actualPositions: Partial<Record<PrioritySequence, number>>;
}

export interface PriorityExport {
  generatedAt: string;
  model: typeof PRIORITY_MODEL;
  scope: "later";
  coreInterestPriority: CoreInterestPriority;
  items: Record<string, PriorityExportItem>;
}

export interface PriorityExportOptions extends PriorityExportOptionsV7 {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function floorScore(score: number): number {
  return Math.max(0, Math.round(score));
}

function tierForScore(score: number): PriorityTier {
  if (score >= 70) {return "hoog";}
  if (score >= 40) {return "midden";}
  return "laag";
}

function overrideMap(overrides: PriorityExportOptions["overrides"]): PriorityOverrideMap {
  if (!overrides) {return {};}
  const record = overrides as unknown as Record<string, unknown>;
  if (record.version === 1 && isRecord(record.items)) {
    return record.items as PriorityOverrideMap;
  }
  return overrides as PriorityOverrideMap;
}

function topicComponents(global: PriorityScoreResultV7, relevance: number): PriorityTopicComponents {
  return {
    kerninteresse: global.components.kerninteresse,
    topic_relevantie: relevance,
    substantie: global.components.substantie,
    duurzaamheid: global.components.duurzaamheid,
    bruikbaarheid: global.components.bruikbaarheid,
    leeskans: global.components.leeskans,
    nederlandse_taal: global.components.nederlandse_taal,
    aftrek: global.components.aftrek,
  };
}

function topicScore(components: PriorityTopicComponents, adjustment: number): number {
  return floorScore(
    components.kerninteresse +
    components.topic_relevantie * 10 +
    components.substantie +
    components.duurzaamheid +
    components.bruikbaarheid +
    components.leeskans +
    components.nederlandse_taal +
    components.aftrek +
    adjustment,
  );
}

function sequenceScore(
  doc: PriorityDocument,
  sequence: PrioritySequence,
  global: PriorityScoreResultV7,
  judgment: ContentJudgment,
): PrioritySequenceScore {
  if ((TOPIC_SEQUENCE_ORDER as readonly string[]).includes(sequence)) {
    const resolution = topicRelevanceFor(doc, sequence as TopicSequence, judgment);
    const components = topicComponents(global, resolution.relevance);
    return {
      score: topicScore(components, global.adjustment),
      tier: tierForScore(topicScore(components, global.adjustment)),
      mode: "topic",
      topicRelevance: resolution.relevance,
      relevanceSource: resolution.source,
      relevanceConfidence: resolution.confidence,
      components,
    };
  }

  const score = floorScore(global.score + (judgment.sequenceFit[sequence] ?? 0) * SEQUENCE_FIT_WEIGHT);
  return { score, tier: tierForScore(score), mode: "global" };
}

export function scorePriorityDocument(
  doc: PriorityDocument,
  override: PriorityOverride = {},
  judgments: PriorityExportOptions["judgments"] = {},
  coreInterestPriority?: CoreInterestPriority,
  coreInterestConfig?: CoreInterestPriorityConfig,
): PriorityScoreResultV7 {
  return scoreGlobalPriorityDocument(doc, override, judgments, coreInterestPriority, coreInterestConfig);
}

interface ExpectedExport {
  coreInterestPriority: CoreInterestPriority;
  items: Record<string, PriorityExportItem>;
}

function buildExpected(
  documents: readonly PriorityDocument[],
  overrides: PriorityOverrideMap,
  judgments: PriorityExportOptions["judgments"],
  coreInterestConfig: CoreInterestPriorityConfig | undefined,
  generatedAt: string,
): ExpectedExport {
  const globalExport = buildGlobalExportForExpected(documents, overrides, judgments, coreInterestConfig, generatedAt);
  const items: Record<string, PriorityExportItem> = {};
  const savedAtById = new Map<string, number>();

  for (const doc of documents) {
    if (!doc.id) {throw new Error("Priority-document mist een Readwise document-id");}
    const globalItem = globalExport.items[doc.id];
    if (!globalItem) {throw new Error(`Global score ontbreekt voor ${doc.id}`);}
    const savedAt = Date.parse(doc.saved_at ?? "");
    if (!Number.isFinite(savedAt)) {throw new Error(`Document ${doc.id} heeft geen geldige saved_at`);}
    savedAtById.set(doc.id, savedAt);
    const { judgment } = judgmentFor(doc, judgments ?? {});
    const sequences = sequencesForDocument(doc);
    const sequenceScores = Object.fromEntries(
      sequences.map((sequence) => [sequence, sequenceScore(doc, sequence, globalItem, judgment)]),
    ) as PrioritySequenceScores;
    items[doc.id] = {
      ...globalItem,
      sequences,
      sequenceScores,
      positions: {},
      actualPositions: actualPositionsForDocument(doc),
    };
  }

  for (const sequence of SEQUENCE_ORDER) {
    const ranked = Object.entries(items)
      .filter(([, item]) => item.sequences.includes(sequence))
      .map(([id, item]) => ({
        id,
        item: { score: item.sequenceScores[sequence]?.score ?? item.score },
      }))
      .sort((a, b) => comparePriorityItems(a, b, savedAtById));
    ranked.forEach(({ id }, index) => {
      const item = items[id];
      if (item) {item.positions[sequence] = index + 1;}
    });
  }

  return { coreInterestPriority: globalExport.coreInterestPriority, items };
}

function buildGlobalExportForExpected(
  documents: readonly PriorityDocument[],
  overrides: PriorityOverrideMap,
  judgments: PriorityExportOptions["judgments"],
  coreInterestConfig: CoreInterestPriorityConfig | undefined,
  generatedAt: string,
): ReturnType<typeof buildGlobalPriorityExport> {
  return buildGlobalPriorityExport(documents, {
    generatedAt,
    overrides,
    judgments,
    ...(coreInterestConfig === undefined ? {} : { coreInterestConfig }),
  });
}

export function buildPriorityExport(
  documents: readonly PriorityDocument[],
  options: PriorityExportOptions = {},
): PriorityExport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const expected = buildExpected(documents, overrideMap(options.overrides), options.judgments, options.coreInterestConfig, generatedAt);
  const result: PriorityExport = {
    generatedAt,
    model: PRIORITY_MODEL,
    scope: "later",
    coreInterestPriority: expected.coreInterestPriority,
    items: expected.items,
  };
  validatePriorityExport(result, documents, options.overrides, options.judgments, options.coreInterestConfig);
  return result;
}

function sequenceScoreShape(value: unknown, id: string, sequence: PrioritySequence, adjustment: number): value is PrioritySequenceScore {
  if (!isRecord(value) || !Number.isInteger(value.score) || !isFiniteNumber(value.score) || value.score < 0 || value.tier !== tierForScore(value.score)) {
    throw new Error(`Ongeldige v8-reeksscore voor ${id}/${sequence}`);
  }
  if (value.mode !== "global" && value.mode !== "topic") {
    throw new Error(`Ongeldige v8-scoremodus voor ${id}/${sequence}`);
  }
  if (value.mode === "global") {
    return true;
  }
  if (!Number.isInteger(value.topicRelevance) || !isFiniteNumber(value.topicRelevance) || value.topicRelevance < 0 || value.topicRelevance > 4) {
    throw new Error(`Ongeldige topicrelevantie voor ${id}/${sequence}`);
  }
  if (value.relevanceSource !== "label" && value.relevanceSource !== "fallback") {
    throw new Error(`Ongeldige topicbron voor ${id}/${sequence}`);
  }
  if (value.relevanceConfidence !== "high" && value.relevanceConfidence !== "medium" && value.relevanceConfidence !== "low") {
    throw new Error(`Ongeldige topic-confidence voor ${id}/${sequence}`);
  }
  if (!isRecord(value.components)) {
    throw new Error(`Topiccomponenten ontbreken voor ${id}/${sequence}`);
  }
  const componentsValue = value.components;
  const componentKeys: (keyof PriorityTopicComponents)[] = [
    "kerninteresse", "topic_relevantie", "substantie", "duurzaamheid", "bruikbaarheid", "leeskans", "nederlandse_taal", "aftrek",
  ];
  if (Object.keys(componentsValue).length !== componentKeys.length || componentKeys.some((key) => !Number.isInteger(componentsValue[key]) || !isFiniteNumber(componentsValue[key]))) {
    throw new Error(`Ongeldige topiccomponenten voor ${id}/${sequence}`);
  }
  const components = value.components as unknown as PriorityTopicComponents;
  if (components.topic_relevantie !== value.topicRelevance || value.score !== topicScore(components, adjustment)) {
    throw new Error(`Topicscorecomponenten kloppen niet voor ${id}/${sequence}`);
  }
  return true;
}

function legacyExportShape(exportData: PriorityExport): unknown {
  const items = Object.fromEntries(Object.entries(exportData.items).map(([id, item]) => [id, {
    ...item,
    sequenceScores: Object.fromEntries(Object.entries(item.sequenceScores).map(([sequence, score]) => [sequence, score?.score ?? item.score])),
  }]));
  return { ...exportData, model: "readwise-priority-v7", items };
}

function validateV8ItemShape(id: string, value: unknown): value is PriorityExportItem {
  if (!isRecord(value) || !Array.isArray(value.sequences) || !isRecord(value.sequenceScores) || !isRecord(value.positions)) {
    throw new Error(`Ongeldig v8-item voor ${id}`);
  }
  const sequences = value.sequences;
  const typedSequences: PrioritySequence[] = [];
  for (const sequence of sequences) {
    if (typeof sequence !== "string" || !(SEQUENCE_ORDER as readonly string[]).includes(sequence)) {
      throw new Error(`Ongeldige v8-reeks voor ${id}`);
    }
    typedSequences.push(sequence as PrioritySequence);
  }
  if (new Set(typedSequences).size !== typedSequences.length || Object.keys(value.sequenceScores).length !== typedSequences.length || Object.keys(value.positions).length !== typedSequences.length) {
    throw new Error(`Reeksgegevens verschillen voor ${id}`);
  }
  for (const sequence of typedSequences) {
    sequenceScoreShape(value.sequenceScores[sequence], id, sequence, typeof value.adjustment === "number" ? value.adjustment : 0);
    const position = value.positions[sequence];
    if (!Number.isInteger(position) || !isFiniteNumber(position) || position < 1) {
      throw new Error(`Ongeldige v8-positie voor ${id}/${sequence}`);
    }
  }
  if (typedSequences.includes("boek") && typedSequences.length !== 1) {
    throw new Error(`Boek/EPUB ${id} hoort strikt alleen in de boek-reeks`);
  }
  return true;
}

export function validatePriorityExport(
  exportData: unknown,
  sourceDocuments: readonly PriorityDocument[] = [],
  overrides: PriorityExportOptions["overrides"] = {},
  judgments: PriorityExportOptions["judgments"] = {},
  coreInterestConfig?: CoreInterestPriorityConfig,
): boolean {
  if (!isRecord(exportData) || exportData.model !== PRIORITY_MODEL || exportData.scope !== "later" || typeof exportData.generatedAt !== "string" || !isRecord(exportData.items)) {
    throw new Error(`Ongeldig ${PRIORITY_MODEL}-export`);
  }
  const typedExport = exportData as unknown as PriorityExport;
  for (const [id, value] of Object.entries(exportData.items)) {
    validateV8ItemShape(id, value);
  }
  const typedItems = exportData.items as Record<string, PriorityExportItem>;
  for (const sequence of SEQUENCE_ORDER) {
    const positions = Object.values(typedItems)
      .filter((item) => item.sequences.includes(sequence))
      .map((item) => item.positions[sequence])
      .filter((position): position is number => typeof position === "number")
      .sort((a, b) => a - b);
    positions.forEach((position, index) => {
      if (position !== index + 1) {throw new Error(`Posities voor ${sequence} zijn niet doorlopend`);}
    });
  }
  validateGlobalExportShape(legacyExportShape(typedExport));
  if (sourceDocuments.length > 0) {
    const expected = buildExpected(sourceDocuments, overrideMap(overrides), judgments, coreInterestConfig, exportData.generatedAt);
    if (JSON.stringify(exportData.items) !== JSON.stringify(expected.items) || JSON.stringify(exportData.coreInterestPriority) !== JSON.stringify(expected.coreInterestPriority)) {
      throw new Error("Priority-export volgt v8-score, kerninteresses, reeksen of volgorde niet");
    }
  }
  return true;
}
