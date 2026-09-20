import {
  actualPositionsForDocument,
  detectDutch,
  scorePriorityDocument as scorePriorityDocumentV6,
  SEQUENCE_ORDER,
  sequencesForDocument,
} from "./readwise-priority-v6.js";
import type {
  ContentJudgment,
  PriorityDocument,
  PriorityOverride,
  PriorityOverrideMap,
  PriorityOverridesConfig,
  PrioritySequence,
  PriorityTier,
} from "./readwise-priority-v6.js";
import { comparePriorityItems } from "./readwise-priority-v3.js";
import {
  CORE_INTEREST_LABELS,
  buildCoreInterestPriority,
  coreInterestBonus,
  defaultCoreInterestPriorityConfig,
  resolveCoreInterestMatches,
  validateCoreInterestPriorityConfig,
} from "./core-interest-priority.js";
import type {
  CoreInterestMatch,
  CoreInterestPriority,
  CoreInterestPriorityConfig,
  WeightedCoreInterestMatch,
} from "./core-interest-priority.js";
import {
  judgmentFor,
  contentTagsFor,
  type PriorityJudgmentsConfig,
} from "./priority-judgments.js";

export { actualPositionsForDocument, detectDutch, SEQUENCE_ORDER, sequencesForDocument };
export type { ContentJudgment, PriorityDocument, PrioritySequence } from "./readwise-priority-v6.js";
export type { PriorityOverride, PriorityOverrideMap, PriorityOverridesConfig, PriorityJudgmentsConfig };
export type { CoreInterestMatch, CoreInterestPriority, CoreInterestPriorityConfig, WeightedCoreInterestMatch };

export const PRIORITY_MODEL = "readwise-priority-v7" as const;
export const SEQUENCE_FIT_WEIGHT = 3;

/** Scrum-mastergerichte signalen krijgen extra gewicht binnen de scrum-reeks. */
const SCRUM_TAG_FIT_BONUS: Readonly<Record<string, number>> = {
  agile: 12,
  scrum: 12,
  "agile & scrum": 12,
  "scrum & agile": 12,
  "team coaching": 12,
  "team dynamics & collaboration": 3,
  "organizational behavior & culture": 3,
  "team dynamics": 3,
  "organizational behavior": 3,
};

export interface PriorityComponents {
  kerninteresse: number;
  relevantie: number;
  substantie: number;
  duurzaamheid: number;
  bruikbaarheid: number;
  leeskans: number;
  nederlandse_taal: number;
  aftrek: number;
}

export type PriorityComponentKey = keyof PriorityComponents;
export type PriorityRationale = Record<PriorityComponentKey, string[]>;

export interface PriorityScoreResult {
  baseScore: number;
  adjustment: number;
  adjustmentReason: string | null;
  score: number;
  tier: PriorityTier;
  components: PriorityComponents;
  rationale: PriorityRationale;
  judgmentSource: "label" | "fallback";
  judgmentConfidence: ContentJudgment["confidence"];
  coreInterestMatches: WeightedCoreInterestMatch[];
}

export type PriorityPositions = Partial<Record<PrioritySequence, number>>;
export type PrioritySequenceScores = Partial<Record<PrioritySequence, number>>;

export interface PriorityExportItem extends PriorityScoreResult {
  sequences: PrioritySequence[];
  sequenceScores: PrioritySequenceScores;
  positions: PriorityPositions;
  actualPositions: PriorityPositions;
}

export interface PriorityExport {
  generatedAt: string;
  model: typeof PRIORITY_MODEL;
  scope: "later";
  coreInterestPriority: CoreInterestPriority;
  items: Record<string, PriorityExportItem>;
}

export interface PriorityExportOptions {
  generatedAt?: string | undefined;
  overrides?: PriorityOverridesConfig | PriorityOverrideMap | undefined;
  judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment> | undefined;
  coreInterestConfig?: CoreInterestPriorityConfig | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function floorScore(score: number): number {
  return Math.max(0, Math.round(score));
}

function scrumTagFitBonus(doc: PriorityDocument): number {
  return Math.max(0, ...contentTagsFor(doc).map((tag) => SCRUM_TAG_FIT_BONUS[tag] ?? 0));
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

function coreInterestConfigFor(options: PriorityExportOptions): CoreInterestPriorityConfig {
  return options.coreInterestConfig ?? defaultCoreInterestPriorityConfig();
}

function rationaleFor(
  baseRationale: Record<string, string[]>,
  matches: readonly WeightedCoreInterestMatch[],
): PriorityRationale {
  const rationale = {
    ...baseRationale,
    kerninteresse: matches.map((match) => {
      const labels = match.evidence.map(({ label }) => label).join(", ");
      const interestLabel = CORE_INTEREST_LABELS[match.interest];
      return `${interestLabel}: +${match.weight}${labels ? ` (${labels})` : ""}.`;
    }),
  } as PriorityRationale;
  return rationale;
}

function standalonePriority(
  doc: PriorityDocument,
  judgments: PriorityExportOptions["judgments"],
  config: CoreInterestPriorityConfig,
): CoreInterestPriority {
  return buildCoreInterestPriority([doc], judgments ?? {}, config, "standalone");
}

export function scorePriorityDocument(
  doc: PriorityDocument,
  override: PriorityOverride = {},
  judgments: PriorityExportOptions["judgments"] = {},
  coreInterestPriority?: CoreInterestPriority,
  coreInterestConfig: CoreInterestPriorityConfig = defaultCoreInterestPriorityConfig(),
): PriorityScoreResult {
  const base = scorePriorityDocumentV6(doc, override, judgments);
  const priority = coreInterestPriority ?? standalonePriority(doc, judgments, coreInterestConfig);
  const { judgment } = judgmentFor(doc, judgments ?? {});
  const matches: CoreInterestMatch[] = resolveCoreInterestMatches(doc, judgment);
  const { bonus, matches: weightedMatches } = coreInterestBonus(matches, priority);
  const components: PriorityComponents = {
    kerninteresse: bonus,
    ...base.components,
  };
  const baseScore = floorScore(base.baseScore + bonus);
  const score = floorScore(baseScore + base.adjustment);
  return {
    baseScore,
    adjustment: base.adjustment,
    adjustmentReason: base.adjustmentReason,
    score,
    tier: tierForScore(score),
    components,
    rationale: rationaleFor(base.rationale, weightedMatches),
    judgmentSource: base.judgmentSource,
    judgmentConfidence: base.judgmentConfidence,
    coreInterestMatches: weightedMatches,
  };
}

interface ExpectedExport {
  coreInterestPriority: CoreInterestPriority;
  items: Record<string, PriorityExportItem>;
}

function buildExpected(
  documents: readonly PriorityDocument[],
  overrides: PriorityOverrideMap,
  judgments: PriorityExportOptions["judgments"],
  coreInterestConfig: CoreInterestPriorityConfig,
  generatedAt: string,
): ExpectedExport {
  validateCoreInterestPriorityConfig(coreInterestConfig);
  const coreInterestPriority = buildCoreInterestPriority(documents, judgments ?? {}, coreInterestConfig, generatedAt);
  const items: Record<string, PriorityExportItem> = {};
  const savedAtById = new Map<string, number>();

  for (const doc of documents) {
    if (!doc.id) {throw new Error("Priority-document mist een Readwise document-id");}
    if (Object.hasOwn(items, doc.id)) {throw new Error(`Dubbel priority-document: ${doc.id}`);}
    const savedAt = Date.parse(doc.saved_at ?? "");
    if (!Number.isFinite(savedAt)) {throw new Error(`Document ${doc.id} heeft geen geldige saved_at`);}
    savedAtById.set(doc.id, savedAt);

    const score = scorePriorityDocument(doc, overrides[doc.id], judgments, coreInterestPriority, coreInterestConfig);
    const sequences = sequencesForDocument(doc);
    const { judgment } = judgmentFor(doc, judgments ?? {});
    const sequenceScores = Object.fromEntries(sequences.map((sequence) => [
      sequence,
      floorScore(
        score.score +
        (judgment.sequenceFit[sequence] ?? 0) * SEQUENCE_FIT_WEIGHT +
        (sequence === "scrum" ? scrumTagFitBonus(doc) : 0),
      ),
    ])) as PrioritySequenceScores;
    items[doc.id] = {
      ...score,
      sequences,
      sequenceScores,
      positions: {},
      actualPositions: actualPositionsForDocument(doc),
    };
  }

  for (const sequence of SEQUENCE_ORDER) {
    const ranked = Object.entries(items)
      .filter(([, item]) => item.sequences.includes(sequence))
      .map(([id, item]) => ({ id, item }))
      .sort((a, b) => comparePriorityItems(
        { ...a, item: { score: a.item.sequenceScores[sequence] ?? a.item.score } },
        { ...b, item: { score: b.item.sequenceScores[sequence] ?? b.item.score } },
        savedAtById,
      ));
    ranked.forEach(({ id }, index) => {
      const item = items[id];
      if (item) {item.positions[sequence] = index + 1;}
    });
  }

  return { coreInterestPriority, items };
}

export function buildPriorityExport(
  documents: readonly PriorityDocument[],
  options: PriorityExportOptions = {},
): PriorityExport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const coreInterestConfig = coreInterestConfigFor(options);
  const expected = buildExpected(documents, overrideMap(options.overrides), options.judgments, coreInterestConfig, generatedAt);
  const result: PriorityExport = {
    generatedAt,
    model: PRIORITY_MODEL,
    scope: "later",
    coreInterestPriority: expected.coreInterestPriority,
    items: expected.items,
  };
  validatePriorityExport(result, documents, options.overrides, options.judgments, coreInterestConfig);
  return result;
}

function validateCoreInterestPriorityOutput(value: unknown): value is CoreInterestPriority {
  if (!isRecord(value) || value.version !== 1 || typeof value.generatedAt !== "string" || !Array.isArray(value.order) || !isRecord(value.weights) || !Array.isArray(value.entries)) {
    return false;
  }
  const order: unknown[] = value.order;
  const weights: Record<string, unknown> = value.weights;
  const entries: unknown[] = value.entries;
  const interests = Object.keys(CORE_INTEREST_LABELS);
  if (order.length !== interests.length || new Set(order).size !== interests.length || !order.every((interest) => typeof interest === "string" && interests.includes(interest))) {
    return false;
  }
  if (Object.keys(weights).length !== interests.length || !interests.every((interest) => Object.hasOwn(weights, interest)) || Object.values(weights).some((weight) => !Number.isInteger(weight) || !isFiniteNumber(weight) || weight <= 0)) {
    return false;
  }
  if (entries.length !== interests.length) {return false;}
  return entries.every((entry, index) => {
    if (!isRecord(entry)) {return false;}
    const interest = order[index];
    if (typeof interest !== "string") {return false;}
    return entry.interest === interest && entry.label === CORE_INTEREST_LABELS[interest as keyof typeof CORE_INTEREST_LABELS] &&
      entry.rank === index + 1 && Number.isInteger(entry.weight) && isFiniteNumber(entry.weight) &&
      Number.isInteger(entry.evidenceDocumentCount) && isFiniteNumber(entry.evidenceDocumentCount) && entry.evidenceDocumentCount >= 0 &&
      Number.isInteger(entry.evidenceScore) && isFiniteNumber(entry.evidenceScore) && (entry.source === "manual" || entry.source === "derived") && entry.weight === weights[interest];
  });
}

function validateCoreInterestMatches(value: unknown): value is WeightedCoreInterestMatch[] {
  if (!Array.isArray(value)) {return false;}
  const seen = new Set<string>();
  return value.every((match) => {
    if (!isRecord(match) || typeof match.interest !== "string" || !Object.hasOwn(CORE_INTEREST_LABELS, match.interest) || seen.has(match.interest) || !Number.isInteger(match.weight) || !isFiniteNumber(match.weight) || match.weight <= 0 || !Number.isInteger(match.qualityScore) || !isFiniteNumber(match.qualityScore) || !Array.isArray(match.evidence)) {
      return false;
    }
    seen.add(match.interest);
    return match.evidence.every((evidence) => isRecord(evidence) && (evidence.kind === "readwise-tag" || evidence.kind === "semantic-signal") && typeof evidence.source === "string" && evidence.source.length > 0 && typeof evidence.label === "string" && evidence.label.length > 0);
  });
}

function validateItemShape(id: string, value: unknown): value is PriorityExportItem {
  if (!isRecord(value) || !Number.isInteger(value.baseScore) || !isFiniteNumber(value.baseScore) || value.baseScore < 0 ||
      !Number.isInteger(value.adjustment) || !isFiniteNumber(value.adjustment) || !Number.isInteger(value.score) || !isFiniteNumber(value.score) || value.score < 0 ||
      !isRecord(value.components) || !isRecord(value.rationale) || !validateCoreInterestMatches(value.coreInterestMatches) ||
      !Array.isArray(value.sequences) || !isRecord(value.sequenceScores) || !isRecord(value.positions) || !isRecord(value.actualPositions)) {
    throw new Error(`Ongeldige v7-score voor ${id}`);
  }
  const components = value.components;
  const rationale = value.rationale;
  const coreInterestMatches = value.coreInterestMatches;
  const sequences: unknown[] = value.sequences;
  const positions = value.positions;
  const sequenceScores = value.sequenceScores;
  const componentKeys: PriorityComponentKey[] = ["kerninteresse", "relevantie", "substantie", "duurzaamheid", "bruikbaarheid", "leeskans", "nederlandse_taal", "aftrek"];
  if (!isRecord(components) || !isRecord(rationale) || !Array.isArray(sequences) || !isRecord(positions) || !isRecord(sequenceScores) ||
      Object.keys(components).length !== componentKeys.length || componentKeys.some((key) => !Number.isInteger(components[key]) || !isFiniteNumber(components[key]))) {
    throw new Error(`Ongeldige v7-componenten voor ${id}`);
  }
  if (Object.keys(rationale).length !== componentKeys.length || componentKeys.some((key) => {
    const entries = rationale[key];
    return !Array.isArray(entries) || !entries.every((entry: unknown) => typeof entry === "string");
  })) {
    throw new Error(`Ongeldige v7-rationale voor ${id}`);
  }
  if (value.adjustmentReason !== null && typeof value.adjustmentReason !== "string") {throw new Error(`Ongeldige correctiereden voor ${id}`);}
  if (value.judgmentConfidence !== "high" && value.judgmentConfidence !== "medium" && value.judgmentConfidence !== "low") {throw new Error(`Ongeldige judgment-confidence voor ${id}`);}
  let componentSum = 0;
  for (const key of componentKeys) {
    const component = components[key];
    if (typeof component !== "number") {throw new Error(`Ongeldige v7-component voor ${id}`);}
    componentSum += component;
  }
  if (value.baseScore !== floorScore(componentSum) || value.score !== floorScore(value.baseScore + value.adjustment)) {throw new Error(`V7-scorecomponenten kloppen niet voor ${id}`);}
  if (!validateCoreInterestMatches(coreInterestMatches)) {throw new Error(`Ongeldige kerninteresses voor ${id}`);}
  if (coreInterestMatches.reduce((sum, match) => sum + match.weight, 0) !== components.kerninteresse) {throw new Error(`Kerninteressebonus klopt niet voor ${id}`);}
  if (value.tier !== tierForScore(value.score)) {throw new Error(`Ongeldige v7-tier voor ${id}`);}
  if (value.judgmentSource !== "label" && value.judgmentSource !== "fallback") {throw new Error(`Ongeldige judgmentbron voor ${id}`);}
  const typedSequences: PrioritySequence[] = [];
  for (const sequence of sequences) {
    if (typeof sequence !== "string" || !SEQUENCE_ORDER.includes(sequence as PrioritySequence)) {throw new Error(`Ongeldige v7-reeks voor ${id}`);}
    typedSequences.push(sequence as PrioritySequence);
  }
  if (new Set(typedSequences).size !== typedSequences.length || Object.keys(positions).length !== typedSequences.length || Object.keys(sequenceScores).length !== typedSequences.length) {throw new Error(`Reeksgegevens verschillen voor ${id}`);}
  for (const sequence of typedSequences) {
    const sequenceScore = sequenceScores[sequence];
    const position = positions[sequence];
    if (!Number.isInteger(sequenceScore) || !isFiniteNumber(sequenceScore) || !Number.isInteger(position) || !isFiniteNumber(position) || position < 1) {throw new Error(`Ongeldige v7-reeksgegevens voor ${id}`);}
  }
  for (const position of Object.values(value.actualPositions)) {
    if (!isFiniteNumber(position) || !Number.isInteger(position) || position < 1) {throw new Error(`Ongeldige actuele positie voor ${id}`);}
  }
  if (typedSequences.includes("boek") && typedSequences.length !== 1) {throw new Error(`Boek/EPUB ${id} hoort strikt alleen in de boek-reeks`);}
  return true;
}

export function validatePriorityExport(
  exportData: unknown,
  sourceDocuments: readonly PriorityDocument[] = [],
  overrides: PriorityExportOptions["overrides"] = {},
  judgments: PriorityExportOptions["judgments"] = {},
  coreInterestConfig: CoreInterestPriorityConfig = defaultCoreInterestPriorityConfig(),
): boolean {
  if (!isRecord(exportData) || exportData.model !== PRIORITY_MODEL || exportData.scope !== "later" || typeof exportData.generatedAt !== "string" || !validateCoreInterestPriorityOutput(exportData.coreInterestPriority) || !isRecord(exportData.items)) {
    throw new Error(`Ongeldig ${PRIORITY_MODEL}-export`);
  }
  for (const [id, value] of Object.entries(exportData.items)) {
    validateItemShape(id, value);
  }
  for (const sequence of SEQUENCE_ORDER) {
    const positions = Object.values(exportData.items)
      .filter((item): item is PriorityExportItem => isRecord(item) && Array.isArray(item.sequences) && item.sequences.includes(sequence))
      .map((item) => item.positions[sequence])
      .filter((position): position is number => typeof position === "number")
      .sort((a, b) => a - b);
    positions.forEach((position, index) => {
      if (position !== index + 1) {throw new Error(`Posities voor ${sequence} zijn niet doorlopend`);}
    });
  }
  if (sourceDocuments.length > 0) {
    const generatedAt = exportData.generatedAt;
    const expected = buildExpected(sourceDocuments, overrideMap(overrides), judgments, coreInterestConfig, generatedAt);
    if (JSON.stringify(exportData.coreInterestPriority) !== JSON.stringify(expected.coreInterestPriority) || JSON.stringify(exportData.items) !== JSON.stringify(expected.items)) {
      throw new Error("Priority-export volgt v7-score, kerninteresses, reeksen of volgorde niet");
    }
  }
  return true;
}
