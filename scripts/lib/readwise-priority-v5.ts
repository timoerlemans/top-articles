import {
  actualPositionsForDocument,
  comparePriorityItems,
  detectDutch,
  sequencesForDocument,
} from "./readwise-priority-v3.js";
import type { PriorityDocument, PriorityTier } from "./readwise-priority-v2.js";
import { SEQUENCE_ORDER } from "./priority-sequences.js";
import type { PrioritySequence } from "./priority-sequences.js";
import {
  judgmentFor,
  type ContentJudgment,
  type JudgmentSource,
  type PriorityJudgmentsConfig,
} from "./priority-judgments.js";

export { detectDutch, SEQUENCE_ORDER };
export { actualPositionsForDocument, sequencesForDocument };
export type { PrioritySequence };
export type { PriorityDocument };
export type { ContentJudgment, PriorityJudgmentsConfig } from "./priority-judgments.js";

export const PRIORITY_MODEL = "readwise-priority-v5" as const;
export const SEQUENCE_FIT_WEIGHT = 3;

export interface PriorityOverride {
  adjustment?: number | undefined;
  reason?: string | null | undefined;
}

export type PriorityOverrideMap = Record<string, PriorityOverride | undefined>;

export interface PriorityOverridesConfig {
  version: 1;
  items: PriorityOverrideMap;
}

export interface PriorityComponents {
  relevantie: number;
  substantie: number;
  duurzaamheid: number;
  bruikbaarheid: number;
  leeskans: number;
  nederlandse_taal: number;
  curatie: number;
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
  judgmentSource: JudgmentSource;
  judgmentConfidence: ContentJudgment["confidence"];
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
  items: Record<string, PriorityExportItem>;
}

export interface PriorityExportOptions {
  generatedAt?: string | undefined;
  overrides?: PriorityOverridesConfig | PriorityOverrideMap | undefined;
  judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment> | undefined;
}

export interface PriorityComparisonItem<T extends { score: number } = { score: number }> {
  id: string;
  item: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalize(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function tagsFor(doc: PriorityDocument): Set<string> {
  const raw = Array.isArray(doc.tags) ? doc.tags : isRecord(doc.tags) ? Object.keys(doc.tags) : [];
  return new Set(raw.map((tag) => {
    if (typeof tag === "string") {return normalize(tag);}
    if (!isRecord(tag)) {return "";}
    return normalize(tag.name ?? tag.key);
  }).filter(Boolean));
}

function whyRead(doc: PriorityDocument): string {
  return doc.notes?.match(/Waarom lezen:\s*([\s\S]*?)(?:\n\s*Beste moment:|$)/i)?.[1]?.toLowerCase().trim() ?? "";
}

function tierForScore(score: number): PriorityTier {
  if (score >= 70) {return "hoog";}
  if (score >= 40) {return "midden";}
  return "laag";
}

function floorScore(score: number): number {
  return Math.max(0, Math.round(score));
}

function readingMinutes(doc: PriorityDocument): number | null {
  const value = normalize(doc.reading_time);
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/);
  return match ? Number(match[1]) : null;
}

function validateOverride(override: unknown = {}): { adjustment: number; reason: string | null } {
  const record = isRecord(override) ? override : {};
  const adjustment = record.adjustment ?? 0;
  const reason = String(record.reason ?? "").trim() || null;
  if (typeof adjustment !== "number" || !Number.isInteger(adjustment)) {throw new Error("Handmatige scorecorrectie moet een geheel getal zijn");}
  if (adjustment !== 0 && !reason) {throw new Error("Handmatige scorecorrectie vereist een reden");}
  return { adjustment, reason };
}

export function validatePriorityOverrides(config: unknown): config is PriorityOverridesConfig {
  if (!isRecord(config) || config.version !== 1 || !isRecord(config.items)) {throw new Error("Ongeldige overrideconfig");}
  for (const [id, override] of Object.entries(config.items)) {
    if (!id) {throw new Error("Overrideconfig bevat een leeg document-ID");}
    validateOverride(override);
  }
  return true;
}

function overrideMapFor(overrides: PriorityExportOptions["overrides"]): PriorityOverrideMap {
  if (!overrides) {return {};}
  if ("version" in overrides) {
    validatePriorityOverrides(overrides);
    return (overrides as PriorityOverridesConfig).items;
  }
  return overrides;
}

function rationaleFor(judgment: ContentJudgment, components: PriorityComponents): PriorityRationale {
  const labels: Record<PriorityComponentKey, string> = {
    relevantie: "inhoudelijke relevantie",
    substantie: "substantie",
    duurzaamheid: "duurzaamheid",
    bruikbaarheid: "bruikbaarheid",
    leeskans: "leeskans",
    nederlandse_taal: "Nederlandse taal",
    curatie: "curatie",
    aftrek: "aftrek",
  };
  const rationale = Object.fromEntries(Object.keys(labels).map((key) => [key, []])) as unknown as PriorityRationale;
  (Object.keys(components) as PriorityComponentKey[]).forEach((key) => {
    if (components[key] !== 0) {rationale[key].push(`${labels[key]} uit de ${judgment.confidence}-confidence inhoudsbeoordeling.`);}
  });
  if (judgment.reasonCodes.length > 0) {
    rationale.relevantie.push(`Bewijs: ${judgment.reasonCodes.join(", ")}.`);
  }
  return rationale;
}

export function scorePriorityDocument(
  doc: PriorityDocument,
  override: PriorityOverride = {},
  judgments: PriorityExportOptions["judgments"] = {},
): PriorityScoreResult {
  const { judgment, source } = judgmentFor(doc, judgments ?? {});
  const tags = tagsFor(doc);
  const minutes = readingMinutes(doc);
  const text = `${normalize(doc.title)} ${normalize(doc.summary)} ${whyRead(doc)}`;
  const noSummary = normalize(doc.summary) === "";
  const noWhyRead = whyRead(doc) === "";
  const words = Number(doc.word_count);
  const leeskans = minutes !== null && minutes < 10 ? 5 : 0;
  const nederlandse_taal = detectDutch(doc) ? 5 : 0;
  const curatie = tags.has("must-read") ? 8 : tags.has("shortlist") || tags.has("short-list") ? 4 : 0;
  let aftrek = 0;
  if (tags.has("current affairs") && /(united states|u\.s\.|us politics|trump|america|american)/.test(text) && judgment.relevance === 0) {aftrek -= 10;}
  if ((Number.isFinite(words) && words < 250 && noSummary && noWhyRead) || normalize(doc.category) === "tweet" || (tags.has("newsletter") && Number.isFinite(words) && words < 600)) {aftrek -= 10;}

  const components: PriorityComponents = {
    relevantie: judgment.relevance * 10,
    substantie: judgment.substance * 8,
    duurzaamheid: judgment.durability * 5,
    bruikbaarheid: judgment.usefulness * 5,
    leeskans,
    nederlandse_taal,
    curatie,
    aftrek,
  };
  const baseScore = floorScore(
    components.relevantie + components.substantie + components.duurzaamheid + components.bruikbaarheid +
    components.leeskans + components.nederlandse_taal + components.curatie + components.aftrek,
  );
  const { adjustment, reason } = validateOverride(override);
  const score = floorScore(baseScore + adjustment);
  return {
    baseScore,
    adjustment,
    adjustmentReason: reason,
    score,
    tier: tierForScore(score),
    components,
    rationale: rationaleFor(judgment, components),
    judgmentSource: source,
    judgmentConfidence: judgment.confidence,
  };
}

function compareSequenceItems(
  a: PriorityComparisonItem<PriorityExportItem>,
  b: PriorityComparisonItem<PriorityExportItem>,
  sequence: PrioritySequence,
  savedAtById: ReadonlyMap<string, number>,
): number {
  return comparePriorityItems(
    { ...a, item: { score: a.item.sequenceScores[sequence] ?? a.item.score } },
    { ...b, item: { score: b.item.sequenceScores[sequence] ?? b.item.score } },
    savedAtById,
  );
}

function buildExpected(
  documents: readonly PriorityDocument[],
  overrides: PriorityOverrideMap,
  judgments: PriorityExportOptions["judgments"],
): Record<string, PriorityExportItem> {
  const items: Record<string, PriorityExportItem> = {};
  const savedAtById = new Map<string, number>();
  for (const doc of documents) {
    if (!doc.id || Object.hasOwn(items, doc.id)) {throw new Error("Bron bevat documenten zonder ID of met dubbele IDs");}
    const savedAt = Date.parse(doc.saved_at ?? "");
    if (!Number.isFinite(savedAt)) {throw new Error(`Document ${doc.id} heeft geen geldige saved_at`);}
    savedAtById.set(doc.id, savedAt);
    const score = scorePriorityDocument(doc, overrides[doc.id], judgments);
    const sequences = sequencesForDocument(doc);
    const sequenceScores = Object.fromEntries(sequences.map((sequence) => {
      const { judgment } = judgmentFor(doc, judgments ?? {});
      return [sequence, floorScore(score.score + (judgment.sequenceFit[sequence] ?? 0) * SEQUENCE_FIT_WEIGHT)];
    })) as PrioritySequenceScores;
    items[doc.id] = { ...score, sequences, sequenceScores, positions: {}, actualPositions: actualPositionsForDocument(doc) };
  }
  for (const sequence of SEQUENCE_ORDER) {
    Object.entries(items)
      .filter(([, item]) => item.sequences.includes(sequence))
      .map(([id, item]) => ({ id, item }))
      .sort((a, b) => compareSequenceItems(a, b, sequence, savedAtById))
      .forEach(({ id }, index) => {
        const item = items[id];
        if (item) {item.positions[sequence] = index + 1;}
      });
  }
  return items;
}

export function buildPriorityExport(documents: readonly PriorityDocument[], options: PriorityExportOptions = {}): PriorityExport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const overrides = overrideMapFor(options.overrides);
  const items = buildExpected(documents, overrides, options.judgments);
  const result: PriorityExport = { generatedAt, model: PRIORITY_MODEL, scope: "later", items };
  validatePriorityExport(result, documents, overrides, options.judgments);
  return result;
}

export function validatePriorityExport(
  exportData: unknown,
  sourceDocuments: readonly PriorityDocument[] = [],
  overrides: PriorityOverrideMap = {},
  judgments: PriorityExportOptions["judgments"] = {},
): boolean {
  if (!isRecord(exportData) || exportData.model !== PRIORITY_MODEL || exportData.scope !== "later" || !isRecord(exportData.items)) {
    throw new Error(`Ongeldig ${PRIORITY_MODEL}-export`);
  }
  for (const [id, value] of Object.entries(exportData.items)) {
    const item = isRecord(value) ? value : {};
    if (!Number.isInteger(item.baseScore) || !isFiniteNumber(item.baseScore) || item.baseScore < 0) {throw new Error(`Ongeldige basisscore voor ${id}`);}
    if (!Number.isInteger(item.score) || !isFiniteNumber(item.score) || item.score < 0) {throw new Error(`Ongeldige score voor ${id}`);}
    if (!isRecord(item.components) || Object.values(item.components).some((value) => !isFiniteNumber(value))) {throw new Error(`Ongeldige componenten voor ${id}`);}
    if (!Array.isArray(item.sequences) || !isRecord(item.sequenceScores) || !isRecord(item.positions)) {throw new Error(`Ongeldige reeksgegevens voor ${id}`);}
    if (item.sequences.includes("boek") && item.sequences.length !== 1) {throw new Error(`Boek/EPUB ${id} hoort strikt alleen in de boek-reeks`);}
    if (Object.keys(item.positions).length !== item.sequences.length || Object.keys(item.sequenceScores).length !== item.sequences.length) {throw new Error(`Reeksgegevens verschillen voor ${id}`);}
    if (item.judgmentSource !== "label" && item.judgmentSource !== "fallback") {throw new Error(`Ongeldige judgmentbron voor ${id}`);}
  }
  for (const sequence of SEQUENCE_ORDER) {
    const positions = Object.values(exportData.items)
      .filter((item): item is Record<string, unknown> => isRecord(item) && Array.isArray(item.sequences) && item.sequences.includes(sequence))
      .map((item) => isRecord(item.positions) ? item.positions[sequence] : undefined)
      .filter((position): position is number => typeof position === "number")
      .sort((a, b) => a - b);
    positions.forEach((position, index) => { if (position !== index + 1) {throw new Error(`Posities voor ${sequence} zijn niet doorlopend`);} });
  }
  if (sourceDocuments.length > 0) {
    const expected = buildExpected(sourceDocuments, overrides, judgments);
    if (JSON.stringify(exportData.items) !== JSON.stringify(expected)) {throw new Error("Priority-export volgt v5-score, reeksen of volgorde niet");}
  }
  return true;
}
