import { createHash } from "node:crypto";

import { buildPriorityExport, PRIORITY_MODEL, SEQUENCE_ORDER } from "./readwise-priority-v3.js";
import type {
  PriorityExportItem,
  PriorityExportOptions,
  PrioritySequence,
} from "./readwise-priority-v3.js";
import type { PriorityDocument } from "./readwise-priority-v2.js";
import { FAMILY_DEFINITIONS } from "./unified-lists.js";

export const TAG_PLAN_MODEL = "readwise-priority-tag-plan-v1" as const;

export interface PriorityTagDocument extends PriorityDocument {
  id: string;
  title?: string | null | undefined;
}

export interface PriorityTagPlanOptions {
  generatedAt?: string | undefined;
  overrides?: PriorityExportOptions["overrides"];
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
  operations: PriorityTagOperation[];
  planHash: string;
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
  return TOPLIST_TAGS.has(tag) || [...ORDINAL_PATTERNS.values()].some((pattern) => pattern.test(tag));
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
  const activeLater = laterDocuments.filter((doc) => doc.location === undefined || doc.location === null || doc.location === "later");
  const excludedLater = laterDocuments.filter((doc) => !activeLater.includes(doc));
  const priority = buildPriorityExport(activeLater, { generatedAt, overrides });
  const sourceDocuments = [...activeLater, ...excludedLater, ...outsideDocuments];
  const changes: Record<string, PriorityTagChange> = {};
  const operations: PriorityTagOperation[] = [];

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

  const sourceFingerprint = hash({ documents: stableSource(sourceDocuments), overrides });
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
    !isRecord(record.summary) ||
    typeof record.summary.documents !== "number" ||
    typeof record.summary.additions !== "number" ||
    typeof record.summary.removals !== "number" ||
    record.summary.operations !== record.operations.length
  ) {
    throw new Error("Tagplansamenvatting klopt niet");
  }
  return true;
}
