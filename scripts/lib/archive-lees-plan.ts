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

export const ARCHIVE_LEES_PLAN_MODEL = "readwise-archive-lees-plan-v1" as const;
export const CANONICAL_LEES_TAG_PATTERN = /^lees-[0-9]{4}$/i;

export interface LeesArchiveCandidate {
  id: string;
  title: string;
}

export interface LeesArchiveFamilySummary {
  id: string;
  label: string;
  top100Tag: string;
  protectedDocumentIds: string[];
}

export interface LeesArchivePlanSummary {
  documents: number;
  leesTagged: number;
  protectedByCurrentTags: number;
  protectedByComputedRanking: number;
  protected: number;
  candidates: number;
  excluded: number;
}

export interface LeesArchivePlan {
  generatedAt: string;
  model: typeof ARCHIVE_LEES_PLAN_MODEL;
  priorityModel: typeof PRIORITY_MODEL;
  scope: "later";
  selection: {
    leesTagPattern: "^lees-[0-9]{4}$";
    currentTop100Tags: string[];
    computedTop100: true;
  };
  sourceFingerprint: string;
  summary: LeesArchivePlanSummary;
  families: LeesArchiveFamilySummary[];
  currentTagProtectedDocumentIds: string[];
  computedTop100DocumentIds: string[];
  protectedDocumentIds: string[];
  candidateDocumentIds: string[];
  candidates: LeesArchiveCandidate[];
  planHash: string;
}

export interface LeesArchivePlanOptions {
  generatedAt?: string | undefined;
  judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment> | undefined;
  coreInterestConfig?: CoreInterestPriorityConfig | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function activeLater(documents: readonly PriorityDocument[]): PriorityDocument[] {
  return documents.filter((doc) => doc.location === undefined || doc.location === null || doc.location === "later");
}

function canonicalDocuments(documents: readonly PriorityDocument[]): Record<string, unknown>[] {
  return [...documents]
    .map((doc) => ({
      id: doc.id ?? null,
      title: doc.title ?? null,
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

function sortedIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function normalizedTags(doc: PriorityDocument): string[] {
  return tagNames(doc).map((tag) => tag.toLowerCase());
}

function hasCanonicalLeesTag(doc: PriorityDocument): boolean {
  return tagNames(doc).some((tag) => CANONICAL_LEES_TAG_PATTERN.test(tag));
}

function computedFamilyDocumentIds(
  documents: readonly PriorityDocument[],
  priority: ReturnType<typeof buildPriorityExport>,
  sequence: (typeof FAMILY_DEFINITIONS)[number]["sequence"],
): string[] {
  return sortedIds(
    documents
      .filter((doc) => {
        const id = doc.id;
        const position = id ? priority.items[id]?.positions[sequence] : undefined;
        return typeof id === "string" && position !== undefined && position <= 100;
      })
      .map((doc) => doc.id)
      .filter((id): id is string => typeof id === "string"),
  );
}

function bodyForHash(plan: Omit<LeesArchivePlan, "planHash">): Omit<LeesArchivePlan, "planHash"> {
  return plan;
}

export function buildLeesArchivePlan(
  documents: readonly PriorityDocument[],
  overrides: PriorityOverridesConfig,
  options: LeesArchivePlanOptions = {},
): LeesArchivePlan {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const later = activeLater(documents);
  const coreInterestConfig = options.coreInterestConfig ?? defaultCoreInterestPriorityConfig();
  const priority = buildPriorityExport(later, {
    generatedAt,
    overrides,
    judgments: options.judgments,
    coreInterestConfig,
  });
  const currentTop100Tags = FAMILY_DEFINITIONS.map(({ top100Tag }) => top100Tag.toLowerCase()).sort((a, b) => a.localeCompare(b));
  const currentTop100TagSet = new Set(currentTop100Tags);
  const currentTagProtectedDocumentIds = sortedIds(
    later
      .filter((doc) => normalizedTags(doc).some((tag) => currentTop100TagSet.has(tag)))
      .map((doc) => doc.id)
      .filter((id): id is string => typeof id === "string"),
  );
  const protectedByFamily = FAMILY_DEFINITIONS.map((family) => ({
    id: family.id,
    label: family.label,
    top100Tag: family.top100Tag,
    protectedDocumentIds: computedFamilyDocumentIds(later, priority, family.sequence),
  }));
  const computedTop100DocumentIds = sortedIds(protectedByFamily.flatMap(({ protectedDocumentIds }) => protectedDocumentIds));
  const protectedDocumentIds = sortedIds([
    ...currentTagProtectedDocumentIds,
    ...computedTop100DocumentIds,
  ]);
  const candidates = later
    .filter((doc) => typeof doc.id === "string" && hasCanonicalLeesTag(doc) && !protectedDocumentIds.includes(doc.id))
    .sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""))
    .map((doc) => ({ id: doc.id as string, title: doc.title ?? "(zonder titel)" }));
  const body: Omit<LeesArchivePlan, "planHash"> = {
    generatedAt,
    model: ARCHIVE_LEES_PLAN_MODEL,
    priorityModel: priority.model,
    scope: "later",
    selection: {
      leesTagPattern: "^lees-[0-9]{4}$",
      currentTop100Tags,
      computedTop100: true,
    },
    sourceFingerprint: hash({
      documents: canonicalDocuments(later),
      overrides,
      selection: {
        leesTagPattern: "^lees-[0-9]{4}$",
        currentTop100Tags,
        computedTop100: true,
      },
      coreInterestConfig: {
        version: coreInterestConfig.version,
        manualOrder: [...coreInterestConfig.manualOrder],
        weightByRank: [...coreInterestConfig.weightByRank],
      },
      coreInterestMapping: coreInterestFingerprintInput(),
    }),
    summary: {
      documents: later.length,
      leesTagged: later.filter(hasCanonicalLeesTag).length,
      protectedByCurrentTags: currentTagProtectedDocumentIds.length,
      protectedByComputedRanking: computedTop100DocumentIds.length,
      protected: protectedDocumentIds.length,
      candidates: candidates.length,
      excluded: later.length - protectedDocumentIds.length - candidates.length,
    },
    families: protectedByFamily,
    currentTagProtectedDocumentIds,
    computedTop100DocumentIds,
    protectedDocumentIds,
    candidateDocumentIds: candidates.map(({ id }) => id),
    candidates,
  };
  const plan: LeesArchivePlan = { ...body, planHash: hash(bodyForHash(body)) };
  validateLeesArchivePlan(plan);
  return plan;
}

function validStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") && new Set(value).size === value.length;
}

export function validateLeesArchivePlan(plan: unknown): plan is LeesArchivePlan {
  if (!isRecord(plan)) {
    throw new Error("Ongeldig lees-archive-planmodel");
  }
  if (plan.model !== ARCHIVE_LEES_PLAN_MODEL || plan.priorityModel !== PRIORITY_MODEL || plan.scope !== "later") {
    throw new Error("Ongeldig lees-archive-planmodel of scope");
  }
  if (typeof plan.generatedAt !== "string" || typeof plan.sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(plan.sourceFingerprint)) {
    throw new Error("Lees-archiveplan mist een geldige bronfingerprint");
  }
  const { planHash, ...body } = plan;
  if (typeof planHash !== "string" || hash(body) !== planHash) {
    throw new Error("Lees-archiveplanhash komt niet overeen met de inhoud");
  }
  if (!isRecord(plan.selection) || plan.selection.leesTagPattern !== "^lees-[0-9]{4}$" || plan.selection.computedTop100 !== true || !validStringArray(plan.selection.currentTop100Tags)) {
    throw new Error("Ongeldige lees-archiveplanselectie");
  }
  if (!isRecord(plan.summary) || !Array.isArray(plan.families) || !validStringArray(plan.currentTagProtectedDocumentIds) || !validStringArray(plan.computedTop100DocumentIds) || !validStringArray(plan.protectedDocumentIds) || !validStringArray(plan.candidateDocumentIds) || !Array.isArray(plan.candidates)) {
    throw new Error("Lees-archiveplan mist samenvatting of documentsets");
  }
  const currentIds = new Set(plan.currentTagProtectedDocumentIds);
  const computedIds = new Set(plan.computedTop100DocumentIds);
  const protectedIds = new Set(plan.protectedDocumentIds);
  const candidateIds = new Set(plan.candidateDocumentIds);
  if ([...currentIds, ...computedIds].some((id) => !protectedIds.has(id))) {
    throw new Error("Lees-archiveplan mist een beschermde top-100-document-ID");
  }
  if ([...protectedIds].some((id) => candidateIds.has(id))) {
    throw new Error("Lees-archiveplan heeft overlap tussen beschermde documenten en kandidaten");
  }
  const candidateObjects = plan.candidates.filter((candidate): candidate is LeesArchiveCandidate =>
    isRecord(candidate) && typeof candidate.id === "string" && typeof candidate.title === "string",
  );
  if (candidateObjects.length !== plan.candidates.length || candidateObjects.length !== candidateIds.size || !candidateObjects.every(({ id }) => candidateIds.has(id))) {
    throw new Error("Lees-archiveplankandidaten komen niet overeen met hun document-ID's");
  }
  const summary = plan.summary as unknown as LeesArchivePlanSummary;
  const summaryKeys: (keyof LeesArchivePlanSummary)[] = [
    "documents", "leesTagged", "protectedByCurrentTags", "protectedByComputedRanking", "protected", "candidates", "excluded",
  ];
  if (summaryKeys.some((key) => typeof summary[key] !== "number" || !Number.isInteger(summary[key]) || summary[key] < 0)) {
    throw new Error("Ongeldige lees-archiveplansamenvatting");
  }
  if (summary.documents !== protectedIds.size + candidateIds.size + summary.excluded || summary.protected !== protectedIds.size || summary.candidates !== candidateIds.size || summary.protectedByCurrentTags !== currentIds.size || summary.protectedByComputedRanking !== computedIds.size || summary.protected < summary.protectedByCurrentTags || summary.protected < summary.protectedByComputedRanking || summary.leesTagged < summary.candidates) {
    throw new Error("Lees-archiveplansamenvatting klopt niet");
  }
  const familyIds = new Set<string>();
  const expectedFamilies = new Map<string, (typeof FAMILY_DEFINITIONS)[number]>(
    FAMILY_DEFINITIONS.map((family): [string, (typeof FAMILY_DEFINITIONS)[number]] => [family.id, family]),
  );
  for (const family of plan.families) {
    if (!isRecord(family) || typeof family.id !== "string" || typeof family.label !== "string" || typeof family.top100Tag !== "string" || !validStringArray(family.protectedDocumentIds)) {
      throw new Error("Ongeldige lees-archiveplan-familie");
    }
    if (familyIds.has(family.id)) {
      throw new Error("Lees-archiveplan bevat dubbele families");
    }
    const expected = expectedFamilies.get(family.id);
    if (!expected || family.label !== expected.label || family.top100Tag !== expected.top100Tag || family.protectedDocumentIds.some((id) => !computedIds.has(id))) {
      throw new Error("Lees-archiveplan-familie wijkt af van de canonieke top-100-familie");
    }
    familyIds.add(family.id);
  }
  if (familyIds.size !== FAMILY_DEFINITIONS.length || plan.selection.currentTop100Tags.join("\u0000") !== FAMILY_DEFINITIONS.map(({ top100Tag }) => top100Tag.toLowerCase()).sort((a, b) => a.localeCompare(b)).join("\u0000")) {
    throw new Error("Lees-archiveplan bevat niet alle canonieke top-100-tags");
  }
  return true;
}

export function assertLeesArchivePlanFresh(
  plan: LeesArchivePlan,
  currentDocuments: readonly PriorityDocument[],
  overrides: PriorityOverridesConfig,
  judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment>,
  coreInterestConfig: CoreInterestPriorityConfig = defaultCoreInterestPriorityConfig(),
): LeesArchivePlan {
  const fresh = buildLeesArchivePlan(currentDocuments, overrides, {
    generatedAt: plan.generatedAt,
    judgments,
    coreInterestConfig,
  });
  if (fresh.sourceFingerprint !== plan.sourceFingerprint || fresh.planHash !== plan.planHash) {
    throw new Error("Lees-archivebron is gewijzigd; maak een nieuw lees-archiveplan");
  }
  return fresh;
}

export function verifyLeesArchivePostcondition(
  plan: LeesArchivePlan,
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
    throw new Error("Een lees-archivekandidaat staat nog steeds in later");
  }
  if (plan.protectedDocumentIds.some((id) => !remainingIds.has(id))) {
    throw new Error("Een beschermd lees-top-100-document ontbreekt uit later");
  }
  const fresh = buildLeesArchivePlan(remainingDocuments, overrides, {
    generatedAt: plan.generatedAt,
    judgments,
    coreInterestConfig,
  });
  if (fresh.candidateDocumentIds.length > 0) {
    throw new Error(`Archive bevat nog ${String(fresh.candidateDocumentIds.length)} nieuwe lees-archivekandidaat(en)`);
  }
  const expectedFamilies = JSON.stringify(plan.families.map(({ id, protectedDocumentIds }) => ({ id, protectedDocumentIds })));
  const actualFamilies = JSON.stringify(fresh.families.map(({ id, protectedDocumentIds }) => ({ id, protectedDocumentIds })));
  if (expectedFamilies !== actualFamilies) {
    throw new Error("De berekende top-100-families zijn na archivering gewijzigd");
  }
  return true;
}
