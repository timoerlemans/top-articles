import { sequencesForDocument, actualPositionsForDocument, comparePriorityItems } from "./priority-membership.js";
export { sequencesForDocument, actualPositionsForDocument, comparePriorityItems } from "./priority-membership.js";
import {
  scorePriorityDocument as scoreBaseDocument,
} from "./readwise-priority-v2.js";
import type {
  PriorityComponents,
  PriorityDocument,
  PriorityRationale,
  PriorityTier,
} from "./readwise-priority-v2.js";
import { SEQUENCE_ORDER } from "./priority-sequences.js";
import type { PrioritySequence } from "./priority-sequences.js";

export { detectDutch } from "./readwise-priority-v2.js";
export { SEQUENCE_ORDER } from "./priority-sequences.js";
export type { PrioritySequence } from "./priority-sequences.js";

export const PRIORITY_MODEL = "readwise-priority-v4" as const;

export interface PriorityOverride {
  adjustment?: number | undefined;
  reason?: string | null | undefined;
}

export type PriorityOverrideMap = Record<string, PriorityOverride | undefined>;

export interface PriorityOverridesConfig {
  version: 1;
  items: PriorityOverrideMap;
}

export interface PriorityScoreResultV3 {
  baseScore: number;
  adjustment: number;
  adjustmentReason: string | null;
  score: number;
  tier: PriorityTier;
  components: PriorityComponents;
  rationale: PriorityRationale;
}

export type PriorityPositions = Partial<Record<PrioritySequence, number>>;

export interface PriorityExportItem extends PriorityScoreResultV3 {
  sequences: PrioritySequence[];
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
}

export interface PriorityComparisonItem<T extends { score: number } = { score: number }> {
  id: string;
  item: T;
}

interface ValidatedPriorityOverride {
  adjustment: number;
  reason: string | null;
}

const COMPONENT_KEYS = [
  "kerninteresse",
  "diepgang",
  "persoonlijke_bruikbaarheid",
  "leeskans",
  "onderscheidende_duurzame_waarde",
  "nederlandse_taal",
  "curatie",
  "aftrek",
] as const satisfies readonly (keyof PriorityComponents)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function displayValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  if (["number", "boolean", "bigint", "symbol"].includes(typeof value)) {
    return String(value);
  }
  return Object.prototype.toString.call(value);
}

function tierForScore(score: number): PriorityTier {
  if (score >= 70) {
    return "hoog";
  }
  if (score >= 40) {
    return "midden";
  }
  return "laag";
}

function floorScore(score: number): number {
  return Math.max(0, score);
}

function validateOverride(override: unknown = {}): ValidatedPriorityOverride {
  const record = isRecord(override) ? override : {};
  const adjustment = record.adjustment ?? 0;
  const reason = displayValue(record.reason ?? "").trim();
  if (typeof adjustment !== "number" || !Number.isInteger(adjustment)) {
    throw new Error("Handmatige scorecorrectie moet een geheel getal zijn");
  }
  if (adjustment !== 0 && !reason) {
    throw new Error("Handmatige scorecorrectie vereist een reden");
  }
  return { adjustment, reason: reason || null };
}

export function validatePriorityOverrides(config: unknown): config is PriorityOverridesConfig {
  if (!isRecord(config)) {
    throw new Error("Ongeldige overrideversie: undefined");
  }
  const record = config;
  const version = record.version;
  if (version !== 1) {
    throw new Error(`Ongeldige overrideversie: ${displayValue(version)}`);
  }
  if (!isRecord(record.items)) {
    throw new Error("Overrideconfig mist items");
  }
  for (const [id, override] of Object.entries(record.items)) {
    if (!id) {
      throw new Error("Overrideconfig bevat een leeg document-ID");
    }
    validateOverride(override);
  }
  return true;
}

export function scorePriorityDocument(
  doc: PriorityDocument,
  override: PriorityOverride = {},
): PriorityScoreResultV3 {
  const base = scoreBaseDocument(doc);
  const { adjustment, reason } = validateOverride(override);
  const baseScore = base.score;
  const score = floorScore(baseScore + adjustment);
  return {
    baseScore,
    adjustment,
    adjustmentReason: reason,
    score,
    tier: tierForScore(score),
    components: base.components,
    rationale: base.rationale,
  };
}

function overrideMapFor(overrides: PriorityExportOptions["overrides"]): PriorityOverrideMap {
  if (overrides === undefined) {
    return {};
  }
  const record = overrides;
  if ("version" in record && record.version !== undefined) {
    if (validatePriorityOverrides(record)) {
      return record.items;
    }
  }
  return isRecord(record.items) ? record.items : overrides as PriorityOverrideMap;
}

export function buildPriorityExport(
  documents: readonly PriorityDocument[],
  options: PriorityExportOptions = {},
): PriorityExport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const overrides = overrideMapFor(options.overrides);
  const items: Record<string, PriorityExportItem> = {};
  const savedAtById = new Map<string, number>();

  for (const doc of documents) {
    if (!doc.id) {
      throw new Error("Priority-document mist een Readwise document-id");
    }
    if (Object.hasOwn(items, doc.id)) {
      throw new Error(`Dubbel priority-document: ${doc.id}`);
    }
    const savedAt = Date.parse(doc.saved_at ?? "");
    if (!Number.isFinite(savedAt)) {
      throw new Error(`Document ${doc.id} heeft geen geldige saved_at`);
    }
    savedAtById.set(doc.id, savedAt);
    items[doc.id] = {
      ...scorePriorityDocument(doc, overrides[doc.id]),
      sequences: sequencesForDocument(doc),
      positions: {},
      actualPositions: actualPositionsForDocument(doc),
    };
  }

  for (const sequence of SEQUENCE_ORDER) {
    const ranked = Object.entries(items)
      .filter(([, item]) => item.sequences.includes(sequence))
      .map(([id, item]) => ({ id, item }))
      .sort((a, b) => comparePriorityItems(a, b, savedAtById));
    ranked.forEach(({ id }, index) => {
      const item = items[id];
      if (item !== undefined) {
        item.positions[sequence] = index + 1;
      }
    });
  }

  const result: PriorityExport = { generatedAt, model: PRIORITY_MODEL, scope: "later", items };
  validatePriorityExport(result, documents, overrides);
  return result;
}

export function validatePriorityExport(
  exportData: unknown,
  sourceDocuments: readonly PriorityDocument[] = [],
  overrides: PriorityOverrideMap = {},
): boolean {
  if (!isRecord(exportData)) {
    throw new Error("Ongeldig priority-model: undefined");
  }
  const record = exportData;
  const model = record.model;
  if (model !== PRIORITY_MODEL) {
    throw new Error(`Ongeldig priority-model: ${displayValue(model)}`);
  }
  if (record.scope !== "later") {
    throw new Error(`Ongeldige priority-scope: ${displayValue(record.scope)}`);
  }
  if (!isRecord(record.items)) {
    throw new Error("Priority-export mist items");
  }
  const items = record.items;

  for (const [id, value] of Object.entries(items)) {
    const item = isRecord(value) ? value : {};
    if (!Number.isInteger(item.baseScore) || !isFiniteNumber(item.baseScore) || item.baseScore < 0) {
      throw new Error(`Ongeldige basisscore voor ${id}`);
    }
    if (!Number.isInteger(item.adjustment) || !isFiniteNumber(item.adjustment)) {
      throw new Error(`Ongeldige scorecorrectie voor ${id}`);
    }
    if (item.adjustment !== 0 && !item.adjustmentReason) {
      throw new Error(`Scorecorrectie voor ${id} mist een reden`);
    }
    if (!Number.isInteger(item.score) || !isFiniteNumber(item.score) || item.score < 0 || item.score !== floorScore(item.baseScore + item.adjustment)) {
      throw new Error(`Ongeldige score voor ${id}`);
    }
    if (item.tier !== tierForScore(item.score)) {
      throw new Error(`Ongeldige tier voor ${id}`);
    }
    const components = item.components;
    if (!isRecord(components) || COMPONENT_KEYS.some((key) => !isFiniteNumber(components[key]))) {
      throw new Error(`Ongeldige componenten voor ${id}`);
    }
    if (!Array.isArray(item.sequences) || new Set(item.sequences).size !== item.sequences.length) {
      throw new Error(`Ongeldige reeksen voor ${id}`);
    }
    if (item.sequences.includes("boek") && item.sequences.length !== 1) {
      throw new Error(`Boek/EPUB ${id} hoort strikt alleen in de boek-reeks, niet in ${item.sequences.filter((sequence) => sequence !== "boek").join(", ")}`);
    }
    if (!isRecord(item.positions) || Object.keys(item.positions).length !== item.sequences.length) {
      throw new Error(`Posities en reeksen verschillen voor ${id}`);
    }
  }

  for (const sequence of SEQUENCE_ORDER) {
    const positions = Object.values(items)
      .filter((item): item is Record<string, unknown> => isRecord(item) && Array.isArray(item.sequences) && item.sequences.includes(sequence))
      .map((item) => isRecord(item.positions) ? item.positions[sequence] : undefined)
      .filter((position): position is number => typeof position === "number")
      .sort((a, b) => a - b);
    positions.forEach((position, index) => {
      if (position !== index + 1) {
        throw new Error(`Posities voor ${sequence} zijn niet uniek en doorlopend vanaf 1`);
      }
    });
  }

  if (sourceDocuments.length > 0) {
    const expected = buildExpected(sourceDocuments, overrides);
    if (JSON.stringify(items) !== JSON.stringify(expected)) {
      throw new Error("Priority-export volgt score, reeksindeling of volgorde niet");
    }
  }
  return true;
}

function buildExpected(
  documents: readonly PriorityDocument[],
  overrides: PriorityOverrideMap,
): Record<string, PriorityExportItem> {
  const items: Record<string, PriorityExportItem> = {};
  const savedAtById = new Map<string, number>();
  for (const doc of documents) {
    if (!doc.id || Object.hasOwn(items, doc.id)) {
      throw new Error("Bron bevat documenten zonder ID of met dubbele IDs");
    }
    const savedAt = Date.parse(doc.saved_at ?? "");
    if (!Number.isFinite(savedAt)) {
      throw new Error(`Document ${doc.id} heeft geen geldige saved_at`);
    }
    savedAtById.set(doc.id, savedAt);
    items[doc.id] = {
      ...scorePriorityDocument(doc, overrides[doc.id]),
      sequences: sequencesForDocument(doc),
      positions: {},
      actualPositions: actualPositionsForDocument(doc),
    };
  }
  for (const sequence of SEQUENCE_ORDER) {
    Object.entries(items)
      .filter(([, item]) => item.sequences.includes(sequence))
      .map(([id, item]) => ({ id, item }))
      .sort((a, b) => comparePriorityItems(a, b, savedAtById))
      .forEach(({ id }, index) => {
        const item = items[id];
        if (item !== undefined) {
          item.positions[sequence] = index + 1;
        }
      });
  }
  return items;
}
