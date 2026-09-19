import {
  actualPositionsForDocument,
  buildPriorityExport as buildLegacyPriorityExport,
  detectDutch,
  scorePriorityDocument as scoreLegacyPriorityDocument,
  sequencesForDocument,
  validatePriorityExport as validateLegacyPriorityExport,
} from "./readwise-priority-v5.js";
import type {
  ContentJudgment,
  PriorityJudgmentsConfig,
} from "./priority-judgments.js";
import type { PriorityDocument, PriorityTier } from "./readwise-priority-v2.js";
import { SEQUENCE_ORDER } from "./priority-sequences.js";
import type { PrioritySequence } from "./priority-sequences.js";

export { actualPositionsForDocument, detectDutch, SEQUENCE_ORDER, sequencesForDocument };
export type { ContentJudgment, PriorityJudgmentsConfig } from "./priority-judgments.js";
export type { PriorityDocument, PriorityTier };
export type { PrioritySequence };

export const PRIORITY_MODEL = "readwise-priority-v6" as const;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isCurationTag(tag: string): boolean {
  return new Set(["must-read", "shortlist", "short-list"]).has(normalize(tag));
}

function withoutCurationTags(doc: PriorityDocument): PriorityDocument {
  if (Array.isArray(doc.tags)) {
    return { ...doc, tags: doc.tags.filter((tag) => typeof tag !== "string" || !isCurationTag(tag)) };
  }
  if (isRecord(doc.tags)) {
    return { ...doc, tags: Object.fromEntries(Object.entries(doc.tags).filter(([tag]) => !isCurationTag(tag))) };
  }
  return doc;
}

function stripCuration(result: ReturnType<typeof scoreLegacyPriorityDocument>): PriorityScoreResult {
  const components = Object.fromEntries(Object.entries(result.components).filter(([key]) => key !== "curatie")) as PriorityComponents;
  const rationale = Object.fromEntries(Object.entries(result.rationale).filter(([key]) => key !== "curatie")) as PriorityRationale;
  return { ...result, components, rationale };
}

function overrideMap(overrides: PriorityExportOptions["overrides"]): PriorityOverrideMap {
  if (!overrides) {return {};}
  const record = overrides as unknown as Record<string, unknown>;
  if (record.version === 1 && isRecord(record.items)) {
    return record.items as PriorityOverrideMap;
  }
  return overrides as PriorityOverrideMap;
}

export function scorePriorityDocument(
  doc: PriorityDocument,
  override: PriorityOverride = {},
  judgments: PriorityExportOptions["judgments"] = {},
): PriorityScoreResult {
  return stripCuration(scoreLegacyPriorityDocument(withoutCurationTags(doc), override, judgments));
}

export function buildPriorityExport(documents: readonly PriorityDocument[], options: PriorityExportOptions = {}): PriorityExport {
  const legacy = buildLegacyPriorityExport(documents.map(withoutCurationTags), options);
  const items = Object.fromEntries(Object.entries(legacy.items).map(([id, item]) => [id, {
    ...stripCuration(item),
    sequences: item.sequences,
    sequenceScores: item.sequenceScores,
    positions: item.positions,
    actualPositions: item.actualPositions,
  }])) as Record<string, PriorityExportItem>;
  const result: PriorityExport = { generatedAt: legacy.generatedAt, model: PRIORITY_MODEL, scope: "later", items };
  validatePriorityExport(result);
  return result;
}

export function validatePriorityExport(
  exportData: unknown,
  sourceDocuments: readonly PriorityDocument[] = [],
  overrides: PriorityExportOptions["overrides"] = {},
  judgments: PriorityExportOptions["judgments"] = {},
): boolean {
  if (!isRecord(exportData) || exportData.model !== PRIORITY_MODEL || exportData.scope !== "later" || !isRecord(exportData.items)) {
    throw new Error(`Ongeldig ${PRIORITY_MODEL}-export`);
  }
  for (const [id, value] of Object.entries(exportData.items)) {
    const item = isRecord(value) ? value : {};
    if (!isRecord(item.components) || Object.hasOwn(item.components, "curatie")) {throw new Error(`V6 bevat een directe curatiecomponent voor ${id}`);}
    if (item.judgmentSource !== "label" && item.judgmentSource !== "fallback") {throw new Error(`Ongeldige judgmentbron voor ${id}`);}
  }
  if (sourceDocuments.length > 0) {
    const expected = buildPriorityExport(sourceDocuments, { generatedAt: String(exportData.generatedAt), overrides, judgments });
    if (JSON.stringify(exportData.items) !== JSON.stringify(expected.items)) {throw new Error("Priority-export volgt v6-score, reeksen of volgorde niet");}
  }
  // The legacy validator checks the complete positional and book invariants.
  const legacyItems = Object.fromEntries(Object.entries(exportData.items).map(([id, value]) => {
    const item = value as Record<string, unknown>;
    return [id, { ...item, components: { ...(item.components as Record<string, unknown>), curatie: 0 }, rationale: { ...(item.rationale as Record<string, unknown>), curatie: [] } }];
  }));
  return validateLegacyPriorityExport({ ...exportData, model: "readwise-priority-v5", items: legacyItems }, sourceDocuments.map(withoutCurationTags), overrideMap(overrides), judgments);
}
