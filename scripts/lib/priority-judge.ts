import {
  automatedFallbackJudgment,
  buildPriorityEvidence,
  AUTOMATED_FALLBACK_JUDGER,
  validatePriorityJudgments,
  type PriorityJudgmentsConfig,
  type PriorityDocumentEvidence,
} from "./priority-judgments.js";
import type { PriorityDocument } from "./readwise-priority-v2.js";
import { TOPIC_SEQUENCE_ORDER } from "./priority-sequences.js";

export type EvidenceSelection = "top100" | "all-later";

export interface PriorityEvidenceSnapshot {
  version: 1;
  generatedAt: string;
  scope: "later";
  selection?: EvidenceSelection;
  documents: Record<string, PriorityDocumentEvidence>;
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

export function batchPriorityEvidence(evidence: readonly PriorityDocumentEvidence[], batchSize = 25): PriorityDocumentEvidence[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {throw new Error("Batchgrootte moet positief zijn");}
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
  const evidence = Object.fromEntries(candidates.flatMap((doc) => {
    if (!doc.id) {return [];}
    return [[doc.id, buildPriorityEvidence(doc, highlightsById.get(doc.id) ?? [])]] as const;
  }));
  return { version: 1, generatedAt, scope: "later", selection, documents: evidence };
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
    if (judgment.status !== "accepted" || judgment.sourceFingerprint !== buildPriorityEvidence(doc, []).sourceFingerprint) {
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
    if (judgment.sourceFingerprint !== evidence.sourceFingerprint || judgment.evidenceFingerprint !== evidence.evidenceFingerprint) {
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
      return !judgment || !evidence || judgment.status !== "accepted" || judgment.sourceFingerprint !== evidence.sourceFingerprint || judgment.evidenceFingerprint !== evidence.evidenceFingerprint || (normalizedOptions.requireTopicRelevance && !hasSemanticTopicRelevance(judgment)) ? [doc.id] : [];
    });
    const preview = ids.slice(0, 10).join(", ");
    const scope = normalizedOptions.requireAllLater ? "All-later" : "Top-100";
    throw new Error(`${scope} judgments ontbreken, zijn stale, niet geaccepteerd of missen topicrelevantie (${String(ids.length)}): ${preview}${ids.length > 10 ? ", ..." : ""}`);
  }
  return report;
}
