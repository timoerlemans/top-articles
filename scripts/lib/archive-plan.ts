import { createHash } from "node:crypto";

import { FAMILY_DEFINITIONS } from "./unified-lists.js";
import { buildPriorityExport, PRIORITY_MODEL } from "./readwise-priority-v8.js";
import type { PriorityJudgmentsConfig, PriorityOverridesConfig } from "./readwise-priority-v8.js";
import {
  coreInterestFingerprintInput,
  defaultCoreInterestPriorityConfig,
} from "./core-interest-priority.js";
import type { CoreInterestPriorityConfig } from "./core-interest-priority.js";
import type { ContentJudgment } from "./priority-judgments.js";
import type { PriorityDocument } from "./readwise-priority-v2.js";
import { tagNames } from "./priority-tag-plan.js";

export const ARCHIVE_PLAN_MODEL = "readwise-archive-plan-v1" as const;

export interface ArchiveCandidate {
  id: string;
  title: string;
}

export interface ArchiveFamilySummary {
  id: string;
  label: string;
  top100Tag: string;
  protectedDocumentIds: string[];
}

export interface ArchivePlanSummary {
  documents: number;
  protected: number;
  candidates: number;
}

export interface ArchivePlan {
  generatedAt: string;
  model: typeof ARCHIVE_PLAN_MODEL;
  priorityModel: typeof PRIORITY_MODEL;
  scope: "later";
  sourceFingerprint: string;
  summary: ArchivePlanSummary;
  families: ArchiveFamilySummary[];
  protectedDocumentIds: string[];
  candidateDocumentIds: string[];
  candidates: ArchiveCandidate[];
  planHash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalDocuments(documents: readonly PriorityDocument[]): Record<string, unknown>[] {
  return [...documents]
    .map((doc) => ({
      id: doc.id ?? null,
      title: doc.title ?? null,
      author: doc.author ?? null,
      summary: doc.summary ?? null,
      notes: doc.notes ?? null,
      language: doc.language ?? null,
      reading_time: doc.reading_time ?? null,
      word_count: doc.word_count ?? null,
      saved_at: doc.saved_at ?? null,
      category: doc.category ?? null,
      location: doc.location ?? null,
      tags: tagNames(doc).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function activeLater(documents: readonly PriorityDocument[]): PriorityDocument[] {
  return documents.filter((doc) => doc.location === undefined || doc.location === null || doc.location === "later");
}

function bodyForHash(plan: Omit<ArchivePlan, "planHash">): Omit<ArchivePlan, "planHash"> {
  return plan;
}

export function buildArchivePlan(
  documents: readonly PriorityDocument[],
  overrides: PriorityOverridesConfig,
  options: { generatedAt?: string; judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment>; coreInterestConfig?: CoreInterestPriorityConfig } = {},
): ArchivePlan {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const later = activeLater(documents);
  const coreInterestConfig = options.coreInterestConfig ?? defaultCoreInterestPriorityConfig();
  const priority = buildPriorityExport(later, { generatedAt, overrides, judgments: options.judgments, coreInterestConfig });
  const protectedByFamily = new Map<string, string[]>();
  const protectedIds = new Set<string>();

  for (const family of FAMILY_DEFINITIONS) {
    const ids = later
      .filter((doc) => {
        const id = doc.id;
        const position = id ? priority.items[id]?.positions[family.sequence] : undefined;
        return position !== undefined && position <= 100;
      })
      .sort((a, b) => {
        const aPosition = priority.items[a.id ?? ""]?.positions[family.sequence] ?? Number.POSITIVE_INFINITY;
        const bPosition = priority.items[b.id ?? ""]?.positions[family.sequence] ?? Number.POSITIVE_INFINITY;
        return aPosition - bPosition || (a.id ?? "").localeCompare(b.id ?? "");
      })
      .map((doc) => doc.id)
      .filter((id): id is string => typeof id === "string");
    ids.forEach((id) => protectedIds.add(id));
    protectedByFamily.set(family.id, ids);
  }

  for (const doc of later) {
    if (tagNames(doc).some((tag) => tag.toLowerCase() === "want-to-read") && typeof doc.id === "string") {
      protectedIds.add(doc.id);
    }
  }

  const candidates = later
    .filter((doc) => typeof doc.id === "string" && !protectedIds.has(doc.id))
    .sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""))
    .map((doc) => ({ id: doc.id as string, title: doc.title ?? "(zonder titel)" }));
  const protectedDocumentIds = [...protectedIds].sort((a, b) => a.localeCompare(b));
  const families = FAMILY_DEFINITIONS.map((family) => ({
    id: family.id,
    label: family.label,
    top100Tag: family.top100Tag,
    protectedDocumentIds: protectedByFamily.get(family.id) ?? [],
  }));
  const body: Omit<ArchivePlan, "planHash"> = {
    generatedAt,
    model: ARCHIVE_PLAN_MODEL,
    priorityModel: priority.model,
    scope: "later",
    sourceFingerprint: hash({
      documents: canonicalDocuments(later),
      overrides,
      coreInterestConfig: {
        version: coreInterestConfig.version,
        manualOrder: [...coreInterestConfig.manualOrder],
        weightByRank: [...coreInterestConfig.weightByRank],
      },
      coreInterestMapping: coreInterestFingerprintInput(),
    }),
    summary: {
      documents: later.length,
      protected: protectedDocumentIds.length,
      candidates: candidates.length,
    },
    families,
    protectedDocumentIds,
    candidateDocumentIds: candidates.map(({ id }) => id),
    candidates,
  };
  const plan: ArchivePlan = { ...body, planHash: hash(bodyForHash(body)) };
  validateArchivePlan(plan);
  return plan;
}

export function validateArchivePlan(plan: unknown): plan is ArchivePlan {
  if (!isRecord(plan)) {
    throw new Error("Ongeldig archive-planmodel");
  }
  if (plan.model !== ARCHIVE_PLAN_MODEL || plan.priorityModel !== PRIORITY_MODEL || plan.scope !== "later") {
    throw new Error("Ongeldig archive-planmodel of scope");
  }
  if (typeof plan.generatedAt !== "string" || typeof plan.sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(plan.sourceFingerprint)) {
    throw new Error("Archiveplan mist een geldige bronfingerprint");
  }
  const { planHash, ...body } = plan;
  if (typeof planHash !== "string" || hash(body) !== planHash) {
    throw new Error("Archiveplanhash komt niet overeen met de inhoud");
  }
  if (!isRecord(plan.summary) || !Array.isArray(plan.families) || !Array.isArray(plan.protectedDocumentIds) || !Array.isArray(plan.candidateDocumentIds) || !Array.isArray(plan.candidates)) {
    throw new Error("Archiveplan mist samenvatting of documentsets");
  }
  const protectedIds = new Set(plan.protectedDocumentIds.filter((id): id is string => typeof id === "string"));
  const candidateIds = new Set(plan.candidateDocumentIds.filter((id): id is string => typeof id === "string"));
  if (protectedIds.size !== plan.protectedDocumentIds.length || candidateIds.size !== plan.candidateDocumentIds.length) {
    throw new Error("Archiveplan bevat dubbele document-ID's");
  }
  if ([...protectedIds].some((id) => candidateIds.has(id))) {
    throw new Error("Archiveplan heeft overlap tussen beschermde documenten en kandidaten");
  }
  const candidateObjects = plan.candidates.filter((candidate): candidate is ArchiveCandidate =>
    isRecord(candidate) && typeof candidate.id === "string" && typeof candidate.title === "string",
  );
  if (candidateObjects.length !== plan.candidates.length || candidateObjects.length !== candidateIds.size || !candidateObjects.every(({ id }) => candidateIds.has(id))) {
    throw new Error("Archiveplan-kandidaten komen niet overeen met hun document-ID's");
  }
  if (plan.summary.documents !== protectedIds.size + candidateIds.size || plan.summary.protected !== protectedIds.size || plan.summary.candidates !== candidateIds.size) {
    throw new Error("Archiveplansamenvatting klopt niet");
  }
  const familyIds = new Set<string>();
  for (const family of plan.families) {
    if (!isRecord(family) || typeof family.id !== "string" || typeof family.label !== "string" || typeof family.top100Tag !== "string" || !Array.isArray(family.protectedDocumentIds)) {
      throw new Error("Ongeldige archiveplan-familie");
    }
    if (familyIds.has(family.id)) {
      throw new Error("Archiveplan bevat dubbele families");
    }
    familyIds.add(family.id);
    for (const id of family.protectedDocumentIds) {
      if (typeof id !== "string" || !protectedIds.has(id)) {
        throw new Error("Familiebescherming verwijst naar een onbekend document");
      }
    }
  }
  if (familyIds.size !== FAMILY_DEFINITIONS.length) {
    throw new Error("Archiveplan bevat niet alle priority-families");
  }
  return true;
}

export function assertArchivePlanFresh(
  plan: ArchivePlan,
  currentDocuments: readonly PriorityDocument[],
  overrides: PriorityOverridesConfig,
  judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment>,
  coreInterestConfig: CoreInterestPriorityConfig = defaultCoreInterestPriorityConfig(),
): ArchivePlan {
  const freshOptions = judgments === undefined
    ? { generatedAt: plan.generatedAt, coreInterestConfig }
    : { generatedAt: plan.generatedAt, judgments, coreInterestConfig };
  const fresh = buildArchivePlan(currentDocuments, overrides, freshOptions);
  if (fresh.sourceFingerprint !== plan.sourceFingerprint || fresh.planHash !== plan.planHash) {
    throw new Error("Archivebron is gewijzigd; maak een nieuw archiveplan");
  }
  return fresh;
}

export function verifyArchivePostcondition(
  plan: ArchivePlan,
  remainingDocuments: readonly PriorityDocument[],
  overrides: PriorityOverridesConfig,
  judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment>,
  coreInterestConfig: CoreInterestPriorityConfig = defaultCoreInterestPriorityConfig(),
): true {
  const remainingIds = new Set(
    activeLater(remainingDocuments)
      .map((doc) => doc.id)
      .filter((id): id is string => typeof id === "string"),
  );
  if (plan.candidateDocumentIds.some((id) => remainingIds.has(id))) {
    throw new Error("Een archiefkandidaat staat nog steeds in later");
  }
  if (plan.protectedDocumentIds.some((id) => !remainingIds.has(id))) {
    throw new Error("Een beschermd top-100-document ontbreekt uit later");
  }
  const freshOptions = judgments === undefined
    ? { generatedAt: plan.generatedAt, coreInterestConfig }
    : { generatedAt: plan.generatedAt, judgments, coreInterestConfig };
  const fresh = buildArchivePlan(remainingDocuments, overrides, freshOptions);
  const expectedFamilies = JSON.stringify(plan.families.map(({ id, protectedDocumentIds }) => ({ id, protectedDocumentIds })));
  const actualFamilies = JSON.stringify(fresh.families.map(({ id, protectedDocumentIds }) => ({ id, protectedDocumentIds })));
  if (expectedFamilies !== actualFamilies) {
    throw new Error("De top-100-families zijn na archivering gewijzigd");
  }
  return true;
}
