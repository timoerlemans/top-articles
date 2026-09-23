import { createHash } from "node:crypto";

import { buildPriorityExport, PRIORITY_MODEL, SEQUENCE_ORDER } from "./readwise-priority-v8.js";
import type {
  PriorityExportItem,
  PriorityExportOptions,
  PrioritySequence,
} from "./readwise-priority-v8.js";
import {
  coreInterestFingerprintInput,
  defaultCoreInterestPriorityConfig,
} from "./core-interest-priority.js";
import type { CoreInterestPriorityConfig } from "./core-interest-priority.js";
import type { ContentJudgment, PriorityJudgmentsConfig } from "./priority-judgments.js";
import type { PriorityDocument } from "./readwise-priority-v2.js";
import { FAMILY_DEFINITIONS } from "./unified-lists.js";
import { isReadwisePriorityTag } from "./readwise-tags.js";

export const TAG_PLAN_MODEL = "readwise-priority-tag-plan-v2" as const;

export interface PriorityTagDocument extends PriorityDocument {
  id: string;
  title?: string | null | undefined;
}

export interface PriorityTagPlanOptions {
  generatedAt?: string | undefined;
  overrides?: PriorityExportOptions["overrides"];
  judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment> | undefined;
  coreInterestConfig?: CoreInterestPriorityConfig | undefined;
  cleanupAll?: boolean | undefined;
}

export type PriorityTagAction = "add" | "remove";

export interface PriorityTagOperation {
  action: PriorityTagAction;
  documentId: string;
  tag: string;
}

export interface PriorityTagChange {
  title: string;
  add: string[];
  remove: string[];
}

export interface PriorityTop100Change {
  documentId: string;
  title: string;
  category: string;
  sequence: PrioritySequence;
  top100Tag: string;
  position: number | null;
}

export interface PriorityTagPlanSummary {
  documents: number;
  additions: number;
  removals: number;
  operations: number;
}

export interface PriorityTagPlan {
  generatedAt: string;
  model: typeof TAG_PLAN_MODEL;
  priorityModel: typeof PRIORITY_MODEL;
  scope: "later" | "all-locations";
  sourceFingerprint: string;
  summary: PriorityTagPlanSummary;
  changes: Record<string, PriorityTagChange>;
  top100Entries: PriorityTop100Change[];
  top100Exits: PriorityTop100Change[];
  operations: PriorityTagOperation[];
  planHash: string;
}

/** Geeft per toplijst weer welke documenten de top-10 in- of uitgaan. */
export function formatTop10Changes(plan: PriorityTagPlan): string {
  const changesByTag = new Map<string, { add: string[]; remove: string[] }>(
    FAMILY_DEFINITIONS.map(({ top10Tag }) => [top10Tag, { add: [], remove: [] }]),
  );

  for (const { title, add, remove } of Object.values(plan.changes)) {
    for (const tag of add) {
      changesByTag.get(tag)?.add.push(title);
    }
    for (const tag of remove) {
      changesByTag.get(tag)?.remove.push(title);
    }
  }

  const sections = FAMILY_DEFINITIONS.flatMap(({ label, top10Tag }) => {
    const change = changesByTag.get(top10Tag);
    if (!change || (change.add.length === 0 && change.remove.length === 0)) {
      return [];
    }
    return [
      `${label}:`,
      ...change.add.sort((a, b) => a.localeCompare(b)).map((title) => `  + ${title}`),
      ...change.remove.sort((a, b) => a.localeCompare(b)).map((title) => `  - ${title}`),
    ];
  });

  return sections.length > 0 ? `Top-10 gewijzigd:\n${sections.join("\n")}` : "Top-10 gewijzigd: geen wijzigingen.";
}

/** Geeft per categorie weer welke items de top-100 binnenkomen of verlaten. */
export function formatTop100Changes(plan: PriorityTagPlan): string {
  const sections = FAMILY_DEFINITIONS.flatMap(({ label, sequence }) => {
    const entries = plan.top100Entries
      .filter((entry) => entry.category === label && entry.sequence === sequence)
      .sort((a, b) => (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY) || a.title.localeCompare(b.title));
    const exits = plan.top100Exits
      .filter((exit) => exit.category === label && exit.sequence === sequence)
      .sort((a, b) => (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY) || a.title.localeCompare(b.title));
    if (entries.length === 0 && exits.length === 0) {
      return [];
    }
    return [
      `## ${label}`,
      ...entries.map(({ position, title }) => `- ${String(position)}/100 - ${title}`),
      ...exits.map(({ position, title }) => `- valt weg${position === null ? "" : ` (${String(position)}/100)`} - ${title}`),
    ];
  });

  return sections.length > 0 ? sections.join("\n") : "Geen nieuwe of weggevallen top-100-items.";
}

const TOPLIST_TAGS: ReadonlySet<string> = new Set(
  FAMILY_DEFINITIONS.flatMap(({ top10Tag, top100Tag }) => [top10Tag, top100Tag]),
);
const ORDINAL_PATTERNS: ReadonlyMap<PrioritySequence, RegExp> = new Map(
  SEQUENCE_ORDER.map((sequence): [PrioritySequence, RegExp] => [
    sequence,
    sequence === "lees" ? new RegExp(`^${sequence}-[0-9]{4}$`) : new RegExp(`^${sequence}-[0-9]{3,4}$`),
  ]),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function rawTags(tags: unknown): unknown[] {
  if (!tags) {
    return [];
  }
  if (Array.isArray(tags)) {
    return tags;
  }
  if ((typeof tags === "object" && tags !== null) || typeof tags === "function" || typeof tags === "string") {
    return Object.keys(tags);
  }
  return [];
}

/** Tagnamen zoals Readwise ze teruggeeft, met originele schrijfwijze. */
export function tagNames(doc: PriorityDocument): string[] {
  return rawTags(doc.tags)
    .map((tag) => {
      if (typeof tag === "string") {
        return tag;
      }
      if (!isRecord(tag)) {
        return "";
      }
      const name = tag.name ?? tag.key;
      return typeof name === "string" ? name : "";
    })
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function tagKeys(doc: PriorityDocument): string[] {
  return tagNames(doc).map((tag) => tag.toLowerCase());
}

export function isManagedOrderTag(tag: string): boolean {
  return TOPLIST_TAGS.has(tag) || [...ORDINAL_PATTERNS.values()].some((pattern) => pattern.test(tag)) || isReadwisePriorityTag(tag);
}

function ordinalTag(sequence: PrioritySequence, position: number): string {
  return `${sequence}-${String(position).padStart(sequence === "lees" ? 4 : 3, "0")}`;
}

function stableSource(documents: readonly PriorityTagDocument[]): Record<string, unknown>[] {
  return [...documents]
    .map((doc) => ({
      id: doc.id,
      location: doc.location ?? null,
      saved_at: doc.saved_at ?? null,
      category: doc.category ?? null,
      title: doc.title ?? null,
      author: doc.author ?? null,
      summary: doc.summary ?? null,
      notes: doc.notes ?? null,
      word_count: doc.word_count ?? null,
      reading_time: doc.reading_time ?? null,
      language: doc.language ?? null,
      lightMembership: tagKeys(doc).some((tag) => tag === "light-reading" || /^luchtig-\d{3,4}$/.test(tag) || tag.startsWith("aaa-luchtig-top-")),
      tags: tagKeys(doc).filter((tag) => !isManagedOrderTag(tag) && tag !== "light-reading").sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function desiredTagsFor(priority: PriorityExportItem): Set<string> {
  const desired = new Set<string>();
  for (const sequence of priority.sequences) {
    const position = priority.positions[sequence];
    if (position !== undefined) {
      desired.add(ordinalTag(sequence, position));
    }
  }
  for (const family of FAMILY_DEFINITIONS) {
    const position = priority.positions[family.sequence];
    if (position === undefined || !Number.isInteger(position)) {
      continue;
    }
    if (position <= 100) {
      desired.add(family.top100Tag);
    }
    if (position <= 10) {
      desired.add(family.top10Tag);
    }
  }
  if (priority.sequences.includes("luchtig")) {
    desired.add("light-reading");
  }
  return desired;
}

export function buildPriorityTagPlan(
  laterDocuments: readonly PriorityTagDocument[],
  outsideDocuments: readonly PriorityTagDocument[] = [],
  options: PriorityTagPlanOptions = {},
): PriorityTagPlan {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const overrides = options.overrides ?? {};
  const coreInterestConfig = options.coreInterestConfig ?? defaultCoreInterestPriorityConfig();
  const activeLater = laterDocuments.filter((doc) => doc.location === undefined || doc.location === null || doc.location === "later");
  const excludedLater = laterDocuments.filter((doc) => !activeLater.includes(doc));
  const priority = buildPriorityExport(activeLater, { generatedAt, overrides, judgments: options.judgments, coreInterestConfig });
  const sourceDocuments = [...activeLater, ...excludedLater, ...outsideDocuments];
  const changes: Record<string, PriorityTagChange> = {};
  const operations: PriorityTagOperation[] = [];
  const top100Entries: PriorityTop100Change[] = [];
  const top100Exits: PriorityTop100Change[] = [];

  for (const doc of activeLater) {
    const priorityItem = priority.items[doc.id];
    if (!priorityItem) {
      continue;
    }
    const currentTags = new Set(tagKeys(doc));
    for (const family of FAMILY_DEFINITIONS) {
      const position = priorityItem.positions[family.sequence];
      if (position === undefined) {
        continue;
      }
      if (position <= 100 && !currentTags.has(family.top100Tag)) {
        top100Entries.push({
          documentId: doc.id,
          title: doc.title ?? "(zonder titel)",
          category: family.label,
          sequence: family.sequence,
          top100Tag: family.top100Tag,
          position,
        });
      }
      if (position > 100 && currentTags.has(family.top100Tag)) {
        top100Exits.push({
          documentId: doc.id,
          title: doc.title ?? "(zonder titel)",
          category: family.label,
          sequence: family.sequence,
          top100Tag: family.top100Tag,
          position: priorityItem.actualPositions[family.sequence] ?? null,
        });
      }
    }
  }

  for (const doc of sourceDocuments) {
    const current = new Set(tagKeys(doc));
    const priorityItem = priority.items[doc.id];
    const desired = priorityItem ? desiredTagsFor(priorityItem) : new Set<string>();
    const remove = [...current].filter((tag) => isManagedOrderTag(tag) && !desired.has(tag)).sort();
    const add = [...desired].filter((tag) => !current.has(tag)).sort();
    if (remove.length === 0 && add.length === 0) {
      continue;
    }
    changes[doc.id] = { title: doc.title ?? "(zonder titel)", add, remove };
    remove.forEach((tag) => {
      operations.push({ action: "remove", documentId: doc.id, tag });
    });
    add.forEach((tag) => {
      operations.push({ action: "add", documentId: doc.id, tag });
    });
  }

  const sourceFingerprint = hash({
    documents: stableSource(sourceDocuments),
    overrides,
    coreInterestConfig: {
      version: coreInterestConfig.version,
      manualOrder: [...coreInterestConfig.manualOrder],
      weightByRank: [...coreInterestConfig.weightByRank],
    },
    coreInterestMapping: coreInterestFingerprintInput(),
  });
  const body: Omit<PriorityTagPlan, "planHash"> = {
    generatedAt,
    model: TAG_PLAN_MODEL,
    priorityModel: priority.model,
    scope: options.cleanupAll ? "all-locations" : "later",
    sourceFingerprint,
    summary: {
      documents: Object.keys(changes).length,
      additions: operations.filter(({ action }) => action === "add").length,
      removals: operations.filter(({ action }) => action === "remove").length,
      operations: operations.length,
    },
    changes,
    top100Entries,
    top100Exits,
    operations,
  };
  const plan: PriorityTagPlan = { ...body, planHash: hash(body) };
  validatePriorityTagPlan(plan);
  return plan;
}

export function validatePriorityTagPlan(plan: unknown): plan is PriorityTagPlan {
  if (!isRecord(plan)) {
    throw new Error("Ongeldig tagplanmodel: undefined");
  }
  const record = plan;
  const model = record.model;
  if (model !== TAG_PLAN_MODEL) {
    throw new Error(`Ongeldig tagplanmodel: ${displayValue(model)}`);
  }
  if (record.priorityModel !== PRIORITY_MODEL) {
    throw new Error(`Ongeldig prioriteitsmodel: ${displayValue(record.priorityModel)}`);
  }
  if (record.scope !== "later" && record.scope !== "all-locations") {
    throw new Error(`Ongeldige tagplanscope: ${displayValue(record.scope)}`);
  }
  if (typeof record.generatedAt !== "string") {
    throw new Error("Tagplan mist een geldige generatietijd");
  }
  if (typeof record.sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(record.sourceFingerprint)) {
    throw new Error("Tagplan mist een geldige bronfingerprint");
  }
  const { planHash, ...body } = record;
  if (typeof planHash !== "string" || hash(body) !== planHash) {
    throw new Error("Tagplanhash komt niet overeen met de inhoud");
  }
  if (!Array.isArray(record.operations)) {
    throw new Error("Tagplan mist operaties");
  }
  for (const value of record.operations) {
    const operation = isRecord(value) ? value : {};
    if ((operation.action !== "add" && operation.action !== "remove") || typeof operation.documentId !== "string" || !operation.documentId || typeof operation.tag !== "string" || !operation.tag) {
      throw new Error("Ongeldige tagoperatie");
    }
    if (!isManagedOrderTag(operation.tag) && operation.tag !== "light-reading") {
      throw new Error(`Onbeheerde tag in plan: ${operation.tag}`);
    }
  }
  if (
    !isRecord(record.changes) ||
    !Array.isArray(record.top100Entries) ||
    !Array.isArray(record.top100Exits) ||
    !isRecord(record.summary) ||
    typeof record.summary.documents !== "number" ||
    typeof record.summary.additions !== "number" ||
    typeof record.summary.removals !== "number" ||
    record.summary.operations !== record.operations.length
  ) {
    throw new Error("Tagplansamenvatting klopt niet");
  }
  const top100Entries = record.top100Entries as unknown[];
  const top100Exits = record.top100Exits as unknown[];
  for (const change of [...top100Entries, ...top100Exits]) {
    if (
      !isRecord(change) ||
      typeof change.documentId !== "string" ||
      !change.documentId ||
      typeof change.title !== "string" ||
      typeof change.category !== "string" ||
      typeof change.sequence !== "string" ||
      !SEQUENCE_ORDER.includes(change.sequence as PrioritySequence) ||
      typeof change.top100Tag !== "string" ||
      !change.top100Tag ||
      (change.position !== null && (typeof change.position !== "number" || !Number.isInteger(change.position) || change.position < 1))
    ) {
      throw new Error("Ongeldige top-100-wijziging");
    }
  }
  return true;
}
