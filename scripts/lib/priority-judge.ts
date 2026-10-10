import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  automatedFallbackJudgment,
  buildPriorityEvidence,
  AUTOMATED_FALLBACK_JUDGER,
  validatePriorityJudgments,
  judgmentMatchesSource,
  judgmentMatchesEvidence,
  type PriorityJudgmentsConfig,
  type PriorityDocumentEvidence,
} from "./priority-judgments.js";
import type { PriorityDocument } from "./priority-document.js";
import { TOPIC_SEQUENCE_ORDER } from "./priority-sequences.js";
import { fetchReadwiseDocuments } from "./readwise-documents.js";
import type { ReadwiseExecutor } from "./readwise-request.js";

export type EvidenceSelection = "top100" | "all-later";

export interface PriorityEvidenceSnapshot {
  version: 1;
  generatedAt: string;
  scope: "later";
  selection?: EvidenceSelection;
  documents: Record<string, PriorityDocumentEvidence>;
}

export interface PriorityEvidenceBatch {
  version: 1;
  rubricVersion: "semantic-v2";
  selection: EvidenceSelection;
  instruction: string;
  readingPreferences: string;
  documents: PriorityDocumentEvidence[];
}

export interface PriorityEvidencePreparation {
  snapshot: PriorityEvidenceSnapshot;
  batches: PriorityEvidenceBatch[];
}

export interface PriorityEvidencePreparationDependencies {
  runReadwise: ReadwiseExecutor<{ stdout: string }>;
  now?: () => string;
  onProgress?: (event: { completed: number; total: number }) => void;
}

export interface PriorityEvidencePreparationOptions {
  selection: EvidenceSelection;
  readingPreferences: string;
  cacheDirectory: string;
  batchSize?: number;
  cacheOnly?: boolean;
  refreshHighlights?: boolean;
}

export interface JudgmentValidationReport {
  accepted: number;
  missing: number;
  stale: number;
  rejected: number;
  topicMissing?: number;
}

export interface Top100FallbackReport {
  top100: number;
  added: string[];
  existing: string[];
  stale: string[];
  draft: string[];
  rejected: string[];
}

export interface EnsureMissingTop100FallbackOptions {
  judgedAt?: string;
}

export interface EnsureMissingFallbackOptions extends EnsureMissingTop100FallbackOptions {
  selection?: EvidenceSelection;
}

export interface EnsureMissingTop100FallbackResult {
  config: PriorityJudgmentsConfig;
  report: Top100FallbackReport;
}

function normalize(value: unknown): string {
  return String(value ?? "").toLowerCase().trim();
}

function tagNames(doc: PriorityDocument): string[] {
  if (Array.isArray(doc.tags)) {
    return doc.tags.flatMap((tag) => {
      if (typeof tag === "string") {return [normalize(tag)];}
      if (tag && typeof tag === "object") {
        const value = (tag as { name?: unknown; key?: unknown }).name ?? (tag as { key?: unknown }).key;
        return typeof value === "string" ? [normalize(value)] : [];
      }
      return [];
    });
  }
  return doc.tags && typeof doc.tags === "object" ? Object.keys(doc.tags).map(normalize) : [];
}

export function isTop100Document(doc: PriorityDocument): boolean {
  return tagNames(doc).some((tag) => /(?:^|-)top-100$/.test(tag));
}

export function selectTop100Documents(documents: readonly PriorityDocument[]): PriorityDocument[] {
  return documents.filter(isTop100Document);
}

function batchPriorityEvidence(evidence: readonly PriorityDocumentEvidence[], batchSize: number): PriorityDocumentEvidence[][] {
  const batches: PriorityDocumentEvidence[][] = [];
  for (let index = 0; index < evidence.length; index += batchSize) {
    batches.push([...evidence.slice(index, index + batchSize)]);
  }
  return batches;
}

export function buildEvidenceSnapshot(
  documents: readonly PriorityDocument[],
  highlightsById: ReadonlyMap<string, readonly unknown[]> = new Map(),
  generatedAt = new Date().toISOString(),
  selection: EvidenceSelection = "top100",
): PriorityEvidenceSnapshot {
  const candidates = selection === "all-later" ? [...documents] : selectTop100Documents(documents);
  return snapshotForSelectedDocuments(candidates, highlightsById, generatedAt, selection);
}

function snapshotForSelectedDocuments(
  candidates: readonly PriorityDocument[],
  highlightsById: ReadonlyMap<string, readonly unknown[]>,
  generatedAt: string,
  selection: EvidenceSelection,
): PriorityEvidenceSnapshot {
  const evidence = Object.fromEntries(candidates.flatMap((doc) => {
    if (!doc.id) {return [];}
    return [[doc.id, buildPriorityEvidence(doc, highlightsById.get(doc.id) ?? [])]] as const;
  }));
  return { version: 1, generatedAt, scope: "later", selection, documents: evidence };
}

async function fetchHighlights(runReadwise: ReadwiseExecutor<{ stdout: string }>, documentId: string): Promise<unknown[]> {
  const { stdout } = await runReadwise(["reader-get-document-highlights", "--document-id", documentId, "--json"]);
  const parsed: unknown = JSON.parse(stdout);
  if (Array.isArray(parsed)) {return parsed as unknown[];}
  const highlights = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).highlights : undefined;
  return Array.isArray(highlights) ? highlights as unknown[] : [];
}

async function cachedHighlightsIndex(root: string): Promise<Map<string, unknown[]>> {
  let names: string[];
  try {
    names = (await readdir(root, { recursive: true })).filter((name) => /(?:enrich|triage|highlight|prefetch)/i.test(name) && name.endsWith(".json"));
  } catch {
    return new Map();
  }
  const found = new Map<string, unknown[]>();
  for (const name of names) {
    try {
      const value: unknown = JSON.parse(await readFile(resolve(root, name), "utf8"));
      if (!value || typeof value !== "object" || typeof (value as { document_id?: unknown }).document_id !== "string") {continue;}
      const documentId = (value as { document_id: string }).document_id;
      const record = value as Record<string, unknown>;
      const entriesForDocument = found.get(documentId) ?? [];
      for (const key of ["highlights_created", "highlights"]) {
        const entries: unknown[] = Array.isArray(record[key]) ? record[key] as unknown[] : [];
        entriesForDocument.push(...entries.map((entry) => typeof entry === "string" ? { text: entry, pipeline: name } : entry));
      }
      found.set(documentId, entriesForDocument);
    } catch {
      // Een beschadigd cachebestand mag de read-only judge-run niet blokkeren.
    }
  }
  return found;
}

/** Prepare the complete evidence and batches; callers own presentation and publication. */
export async function preparePriorityEvidence(
  { runReadwise, now = () => new Date().toISOString(), onProgress }: PriorityEvidencePreparationDependencies,
  { selection, readingPreferences, cacheDirectory, batchSize = 25, cacheOnly = false, refreshHighlights = false }: PriorityEvidencePreparationOptions,
): Promise<PriorityEvidencePreparation> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {throw new Error("Batchgrootte moet positief zijn");}
  const documents = await fetchReadwiseDocuments(runReadwise, { profile: "judge", location: "later" });
  const candidates = selection === "all-later" ? documents : selectTop100Documents(documents);
  const cached = refreshHighlights ? new Map<string, unknown[]>() : await cachedHighlightsIndex(cacheDirectory);
  const highlightsById = new Map<string, readonly unknown[]>();
  for (const [index, doc] of candidates.entries()) {
    if (!doc.id) {continue;}
    const cachedForDocument = cached.get(doc.id) ?? [];
    highlightsById.set(doc.id, cachedForDocument.length > 0 || cacheOnly ? cachedForDocument : await fetchHighlights(runReadwise, doc.id));
    onProgress?.({ completed: index + 1, total: candidates.length });
  }
  const snapshot = snapshotForSelectedDocuments(candidates, highlightsById, now(), selection);
  const batches = batchPriorityEvidence(Object.values(snapshot.documents), batchSize).map((documents): PriorityEvidenceBatch => ({
    version: 1,
    rubricVersion: "semantic-v2",
    selection,
    instruction: `Lees en gebruik readingPreferences bij elke inhoudelijke beoordeling. Beoordeel elk document onafhankelijk van huidige Readwise-posities. Vul de bestaande vier scores én topicRelevance (0–4) in voor ${TOPIC_SEQUENCE_ORDER.join(", ")}. Gebruik voor philosophy de persoonlijke afbakening in readingPreferences; beoordeel de inhoud en toegankelijkheid, niet alleen de brede philosophy-tag.`,
    readingPreferences,
    documents,
  }));
  return { snapshot, batches };
}

export function ensureMissingFallbacks(
  documents: readonly PriorityDocument[],
  config: PriorityJudgmentsConfig,
  options: EnsureMissingFallbackOptions = {},
): EnsureMissingTop100FallbackResult {
  if (!validatePriorityJudgments(config) || config.version !== 2) {
    throw new Error("Semantische judgment-config moet version 2 en rubricVersion semantic-v1 hebben");
  }
  const report: Top100FallbackReport = { top100: 0, added: [], existing: [], stale: [], draft: [], rejected: [] };
  const items = { ...config.items };
  const candidates = options.selection === "all-later" ? documents : selectTop100Documents(documents);
  for (const doc of candidates) {
    if (!doc.id) {continue;}
    report.top100 += 1;
    const judgment = items[doc.id];
    if (!judgment) {
      items[doc.id] = automatedFallbackJudgment(doc, options.judgedAt);
      report.added.push(doc.id);
      continue;
    }
    if (judgment.status === "draft") {
      report.draft.push(doc.id);
      continue;
    }
    if (judgment.status === "rejected") {
      report.rejected.push(doc.id);
      continue;
    }
    if (judgment.status !== "accepted" || !judgmentMatchesSource(doc, judgment)) {
      report.stale.push(doc.id);
      continue;
    }
    report.existing.push(doc.id);
  }
  return { config: { ...config, items }, report };
}

export function ensureMissingTop100Fallbacks(
  documents: readonly PriorityDocument[],
  config: PriorityJudgmentsConfig,
  options: EnsureMissingTop100FallbackOptions = {},
): EnsureMissingTop100FallbackResult {
  return ensureMissingFallbacks(documents, config, { ...options, selection: "top100" });
}

export interface JudgmentValidationOptions {
  requireTop100?: boolean;
  requireAllLater?: boolean;
  requireTopicRelevance?: boolean;
}

function hasSemanticTopicRelevance(judgment: PriorityJudgmentsConfig["items"][string]): boolean {
  return judgment.judgedBy !== AUTOMATED_FALLBACK_JUDGER
    && TOPIC_SEQUENCE_ORDER.every((topic) => judgment.topicRelevance?.[topic] !== undefined);
}

export function validateJudgmentSet(
  documents: readonly PriorityDocument[],
  snapshot: PriorityEvidenceSnapshot,
  config: unknown,
  options: boolean | JudgmentValidationOptions = false,
): JudgmentValidationReport {
  if (!validatePriorityJudgments(config) || config.version !== 2) {
    throw new Error("Semantische judgment-config moet version 2 en rubricVersion semantic-v1 hebben");
  }
  const normalizedOptions: JudgmentValidationOptions = typeof options === "boolean" ? { requireTop100: options } : options;
  const candidates = normalizedOptions.requireAllLater ? [...documents] : selectTop100Documents(documents);
  const report: JudgmentValidationReport = { accepted: 0, missing: 0, stale: 0, rejected: 0 };
  if (normalizedOptions.requireTopicRelevance) {report.topicMissing = 0;}
  for (const doc of candidates) {
    if (!doc.id) {continue;}
    const evidence = snapshot.documents[doc.id];
    const judgment = config.items[doc.id];
    if (!evidence || !judgment) {
      report.missing += 1;
      continue;
    }
    if (judgment.status !== "accepted") {
      report.rejected += 1;
      continue;
    }
    if (!judgmentMatchesEvidence(doc, evidence, judgment)) {
      report.stale += 1;
      continue;
    }
    report.accepted += 1;
    if (normalizedOptions.requireTopicRelevance && !hasSemanticTopicRelevance(judgment)) {
      report.topicMissing = (report.topicMissing ?? 0) + 1;
    }
  }
  const requiresCompleteSet = normalizedOptions.requireTop100 || normalizedOptions.requireAllLater;
  if (requiresCompleteSet && (report.missing > 0 || report.stale > 0 || report.rejected > 0 || (report.topicMissing ?? 0) > 0)) {
    const ids = candidates.flatMap((doc) => {
      if (!doc.id) {return [];}
      const judgment = config.items[doc.id];
      const evidence = snapshot.documents[doc.id];
      return !judgment || !evidence || judgment.status !== "accepted" || !judgmentMatchesEvidence(doc, evidence, judgment) || (normalizedOptions.requireTopicRelevance && !hasSemanticTopicRelevance(judgment)) ? [doc.id] : [];
    });
    const preview = ids.slice(0, 10).join(", ");
    const scope = normalizedOptions.requireAllLater ? "All-later" : "Top-100";
    throw new Error(`${scope} judgments ontbreken, zijn stale, niet geaccepteerd of missen topicrelevantie (${String(ids.length)}): ${preview}${ids.length > 10 ? ", ..." : ""}`);
  }
  return report;
}
