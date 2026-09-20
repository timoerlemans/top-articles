import { createHash } from "node:crypto";

import { isReadwisePriorityTag } from "./readwise-tags.js";
import { tagNames } from "./priority-tag-plan.js";
import type { PriorityTagDocument, PriorityTagOperation } from "./priority-tag-plan.js";

export const ARCHIVE_CLEANUP_MODEL = "readwise-archive-tag-cleanup-v1" as const;

export interface ArchiveCleanupPlanOptions {
  generatedAt?: string;
}

export interface ArchiveCleanupChange {
  title: string;
  add: [];
  remove: string[];
}

export interface ArchiveCleanupPlanSummary {
  documents: number;
  changedDocuments: number;
  removals: number;
  operations: number;
}

export interface ArchiveCleanupPlan {
  generatedAt: string;
  model: typeof ARCHIVE_CLEANUP_MODEL;
  scope: "archive";
  sourceFingerprint: string;
  summary: ArchiveCleanupPlanSummary;
  changes: Record<string, ArchiveCleanupChange>;
  operations: PriorityTagOperation[];
  planHash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function archiveTags(doc: PriorityTagDocument): string[] {
  const byNormalized = new Map<string, string>();
  for (const tag of tagNames(doc)) {
    const normalized = tag.toLowerCase();
    if (isReadwisePriorityTag(normalized) && !byNormalized.has(normalized)) {
      byNormalized.set(normalized, tag);
    }
  }
  return [...byNormalized.values()].sort((a, b) => a.localeCompare(b));
}

function stableSource(documents: readonly PriorityTagDocument[]): Record<string, unknown>[] {
  return [...documents]
    .map((doc) => ({
      id: doc.id,
      location: doc.location ?? null,
      title: doc.title ?? null,
      tags: tagNames(doc).map((tag) => tag.toLowerCase()).sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function assertArchiveDocuments(documents: readonly PriorityTagDocument[]): void {
  for (const doc of documents) {
    if (doc.location !== undefined && doc.location !== null && doc.location !== "archive") {
      throw new Error(`Archive cleanup accepteert alleen archive-documenten: ${doc.id}`);
    }
  }
}

function sourceFingerprint(documents: readonly PriorityTagDocument[]): string {
  return hash({ scope: "archive", documents: stableSource(documents) });
}

export function buildArchiveCleanupPlan(
  documents: readonly PriorityTagDocument[],
  options: ArchiveCleanupPlanOptions = {},
): ArchiveCleanupPlan {
  assertArchiveDocuments(documents);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const changes: Record<string, ArchiveCleanupChange> = {};
  const operations: PriorityTagOperation[] = [];

  for (const doc of documents) {
    const remove = archiveTags(doc);
    if (remove.length === 0) {
      continue;
    }
    changes[doc.id] = {
      title: doc.title ?? "(zonder titel)",
      add: [],
      remove,
    };
    remove.forEach((tag) => {
      operations.push({ action: "remove", documentId: doc.id, tag });
    });
  }

  const body: Omit<ArchiveCleanupPlan, "planHash"> = {
    generatedAt,
    model: ARCHIVE_CLEANUP_MODEL,
    scope: "archive",
    sourceFingerprint: sourceFingerprint(documents),
    summary: {
      documents: documents.length,
      changedDocuments: Object.keys(changes).length,
      removals: operations.length,
      operations: operations.length,
    },
    changes,
    operations,
  };
  const plan: ArchiveCleanupPlan = { ...body, planHash: hash(body) };
  validateArchiveCleanupPlan(plan);
  return plan;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

export function validateArchiveCleanupPlan(value: unknown): value is ArchiveCleanupPlan {
  if (!isRecord(value) || value.model !== ARCHIVE_CLEANUP_MODEL || value.scope !== "archive") {
    throw new Error("Ongeldig archive-cleanup-planmodel");
  }
  if (typeof value.generatedAt !== "string" || typeof value.sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceFingerprint)) {
    throw new Error("Archive cleanup plan mist geldige metadata");
  }
  const { planHash, ...body } = value;
  if (typeof planHash !== "string" || hash(body) !== planHash) {
    throw new Error("Archive cleanup planhash komt niet overeen met de inhoud");
  }
  if (!isRecord(value.changes) || !Array.isArray(value.operations) || !isRecord(value.summary)) {
    throw new Error("Archive cleanup plan mist wijzigingen, operaties of samenvatting");
  }

  const expectedOperations: PriorityTagOperation[] = [];
  for (const [documentId, rawChange] of Object.entries(value.changes)) {
    if (!isRecord(rawChange) || typeof rawChange.title !== "string" || !Array.isArray(rawChange.add) || rawChange.add.length !== 0 || !isStringArray(rawChange.remove) || rawChange.remove.some((tag) => !isReadwisePriorityTag(tag))) {
      throw new Error("Ongeldige archive cleanup-wijziging");
    }
    for (const tag of rawChange.remove) {
      expectedOperations.push({ action: "remove", documentId, tag });
    }
  }
  for (const rawOperation of value.operations) {
    if (!isRecord(rawOperation) || rawOperation.action !== "remove" || typeof rawOperation.documentId !== "string" || !rawOperation.documentId || typeof rawOperation.tag !== "string" || !isReadwisePriorityTag(rawOperation.tag)) {
      throw new Error("Ongeldige archive cleanup-operatie");
    }
  }
  if (JSON.stringify(value.operations) !== JSON.stringify(expectedOperations)) {
    throw new Error("Archive cleanup-operaties komen niet overeen met de wijzigingen");
  }
  const summary = value.summary;
  if (typeof summary.documents !== "number" || !Number.isInteger(summary.documents) || summary.documents < 0 ||
    typeof summary.changedDocuments !== "number" || !Number.isInteger(summary.changedDocuments) || summary.changedDocuments !== Object.keys(value.changes).length ||
    typeof summary.removals !== "number" || !Number.isInteger(summary.removals) || summary.removals !== expectedOperations.length ||
    typeof summary.operations !== "number" || !Number.isInteger(summary.operations) || summary.operations !== expectedOperations.length) {
    throw new Error("Archive cleanup-samenvatting klopt niet");
  }
  return true;
}

export function assertArchiveCleanupPlanFresh(
  plan: ArchiveCleanupPlan,
  currentDocuments: readonly PriorityTagDocument[],
): true {
  validateArchiveCleanupPlan(plan);
  const current = buildArchiveCleanupPlan(currentDocuments, { generatedAt: plan.generatedAt });
  if (current.sourceFingerprint !== plan.sourceFingerprint) {
    throw new Error("Het archief of de tags zijn gewijzigd; maak een nieuw archive-cleanup-plan");
  }
  return true;
}
