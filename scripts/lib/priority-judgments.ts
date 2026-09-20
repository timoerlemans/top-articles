import { createHash } from "node:crypto";

import type { PriorityDocument } from "./readwise-priority-v2.js";
import { matchedDomainsFromTags } from "./readwise-priority-v2.js";
import { SEQUENCE_ORDER, TOPIC_SEQUENCE_ORDER } from "./priority-sequences.js";
import type { PrioritySequence, TopicSequence } from "./priority-sequences.js";
import { fallbackTopicRelevanceFor } from "./priority-topic-taxonomy.js";

export type ContentRating = 0 | 1 | 2 | 3 | 4;
export type JudgmentConfidence = "high" | "medium" | "low";
export type JudgmentSource = "label" | "fallback";
export type SequenceFit = -2 | -1 | 0 | 1 | 2;
export type JudgmentStatus = "accepted" | "draft" | "rejected";
export type HighlightProvenance = "user" | "readwise-enrich" | "readwise-triage" | "unknown";

export const AUTOMATED_FALLBACK_JUDGER = "automated-fallback-v1" as const;

export interface PriorityHighlight {
  stableRef: string;
  text: string;
  note: string | null;
  tags: string[];
  provenance: HighlightProvenance;
}

export interface PriorityDocumentEvidence {
  documentId: string;
  title: string | null;
  category: string | null;
  language: string | null;
  summary: string | null;
  notes: string | null;
  contentTags: string[];
  curationSignals: string[];
  positionTagsExcluded: string[];
  highlights: PriorityHighlight[];
  sourceFingerprint: string;
  evidenceFingerprint: string;
  triageRecommendation: string | null;
  triageReason: string | null;
  enrichmentPasses: number | null;
  pipelineArtifacts: string[];
}

export interface ContentJudgment {
  sourceFingerprint: string;
  evidenceFingerprint?: string;
  relevance: ContentRating;
  substance: ContentRating;
  durability: ContentRating;
  usefulness: ContentRating;
  sequenceFit: Partial<Record<PrioritySequence, SequenceFit>>;
  topicRelevance?: Partial<Record<TopicSequence, ContentRating>>;
  confidence: JudgmentConfidence;
  reasonCodes: string[];
  status?: JudgmentStatus;
  rubricVersion?: string;
  evidenceRefs?: string[];
  judgedBy?: string;
  judgedAt?: string;
}

export interface PriorityJudgmentsConfig {
  version: 1 | 2;
  rubricVersion?: string;
  items: Record<string, ContentJudgment>;
}

const ORDER_TAG = /^(?:video|boek|pdf|lees|dutch|short|short-dutch|luchtig|luchtig-nederlands|scrum|software-development|front-end-development|social-studies|adhd)-\d{3,4}$/;
const DERIVED_ORDER_TAG = /(?:^|-)top-(?:10|100)$/;
const CURATION_TAGS = new Set(["must-read", "shortlist", "short-list", "light-reading"]);
const USEFULNESS_MARKERS = [
  "werk", "work", "career", "professional", "ouderschap", "mantelzorg", "schrijven", "kennisbeheer",
  "pkm", "scrum", "agile", "team", "collaboration", "organizational", "software", "development",
];
const SUBSTANCE_MARKERS = [
  "study", "research", "evidence", "framework", "analysis", "analyse", "essay", "paper", "onderzoek",
  "report", "history", "systematic", "experiment", "case study", "theory", "theorie",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tagNames(doc: PriorityDocument): string[] {
  const tags = doc.tags;
  const raw = Array.isArray(tags)
    ? tags
    : isRecord(tags) ? Object.keys(tags) : [];
  return raw.map((tag) => {
    if (typeof tag === "string") {return normalize(tag);}
    if (!isRecord(tag)) {return "";}
    return normalize(tag.name ?? tag.key);
  }).filter(Boolean);
}

function isPositionTag(tag: string): boolean {
  return ORDER_TAG.test(tag) || DERIVED_ORDER_TAG.test(tag);
}

export function contentTagsFor(doc: PriorityDocument): string[] {
  return tagNames(doc)
    .filter((tag) => !isPositionTag(tag) && !CURATION_TAGS.has(tag))
    .sort((a, b) => a.localeCompare(b));
}

function curationSignalsFor(doc: PriorityDocument): string[] {
  return tagNames(doc).filter((tag) => CURATION_TAGS.has(tag)).sort((a, b) => a.localeCompare(b));
}

function positionTagsFor(doc: PriorityDocument): string[] {
  return tagNames(doc).filter(isPositionTag).sort((a, b) => a.localeCompare(b));
}

function canonicalInput(doc: PriorityDocument): Record<string, unknown> {
  return {
    id: doc.id ?? null,
    title: doc.title ?? null,
    summary: doc.summary ?? null,
    notes: doc.notes ?? null,
    language: doc.language ?? null,
    reading_time: doc.reading_time ?? null,
    word_count: doc.word_count ?? null,
    category: doc.category ?? null,
    tags: contentTagsFor(doc),
  };
}

/** Fingerprint deliberately excludes ordinal and derived top-list tags. */
export function judgmentSourceFingerprint(doc: PriorityDocument): string {
  return createHash("sha256").update(JSON.stringify(canonicalInput(doc))).digest("hex");
}

function highlightRecord(value: unknown): PriorityHighlight | null {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {return null;}
    return { stableRef: "", text, note: null, tags: [], provenance: "unknown" };
  }
  if (!isRecord(value)) {return null;}
  const textValue = value.text ?? value.highlight ?? value.plaintext ?? value.highlight_plaintext;
  if (typeof textValue !== "string" || !textValue.trim()) {return null;}
  const noteValue = value.note ?? value.notes;
  const rawTags = Array.isArray(value.tags) ? value.tags : [];
  const tags = rawTags.filter((tag): tag is string => typeof tag === "string").map(normalize).filter(Boolean).sort();
  const pipeline = normalize(value.provenance ?? value.pipeline ?? value.source);
  const provenance: HighlightProvenance = pipeline === "user" ? "user" : pipeline.includes("enrich") ? "readwise-enrich" : pipeline.includes("triage") ? "readwise-triage" : "unknown";
  const note = typeof noteValue === "string" && noteValue.trim() ? noteValue.trim() : null;
  return { stableRef: typeof value.id === "string" && value.id.trim() ? value.id.trim() : "", text: textValue.trim(), note, tags, provenance };
}

function canonicalHighlightKey(highlight: PriorityHighlight): string {
  return JSON.stringify({ text: normalize(highlight.text), note: normalize(highlight.note) });
}

function normalizeHighlights(rawHighlights: readonly unknown[]): PriorityHighlight[] {
  const seen = new Set<string>();
  return rawHighlights.flatMap((value) => {
    const parsed = highlightRecord(value);
    if (!parsed) {return [];}
    const key = canonicalHighlightKey(parsed);
    if (seen.has(key)) {return [];}
    seen.add(key);
    const stableRef = parsed.stableRef || `highlight:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
    return [{ ...parsed, stableRef }];
  });
}

export function evidenceFingerprint(evidence: Pick<PriorityDocumentEvidence, "documentId" | "title" | "summary" | "notes" | "contentTags" | "highlights">): string {
  const canonical = {
    documentId: evidence.documentId,
    title: evidence.title,
    summary: evidence.summary,
    notes: evidence.notes,
    contentTags: [...evidence.contentTags].sort(),
    highlights: evidence.highlights.map((highlight) => ({
      text: normalize(highlight.text),
      note: normalize(highlight.note),
      tags: [...highlight.tags].sort(),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function buildPriorityEvidence(
  doc: PriorityDocument,
  rawHighlights: readonly unknown[] = [],
  context: Partial<Pick<PriorityDocumentEvidence, "triageRecommendation" | "triageReason" | "enrichmentPasses" | "pipelineArtifacts">> = {},
): PriorityDocumentEvidence {
  const highlights = normalizeHighlights(rawHighlights);
  const evidence = {
    documentId: doc.id ?? "",
    title: doc.title ?? null,
    category: doc.category ?? null,
    language: doc.language ?? null,
    summary: doc.summary ?? null,
    notes: doc.notes ?? null,
    contentTags: contentTagsFor(doc),
    curationSignals: curationSignalsFor(doc),
    positionTagsExcluded: positionTagsFor(doc),
    highlights,
    sourceFingerprint: judgmentSourceFingerprint(doc),
    evidenceFingerprint: "",
    triageRecommendation: context.triageRecommendation ?? null,
    triageReason: context.triageReason ?? null,
    enrichmentPasses: context.enrichmentPasses ?? null,
    pipelineArtifacts: [...(context.pipelineArtifacts ?? [])].sort(),
  } satisfies Omit<PriorityDocumentEvidence, "evidenceFingerprint"> & { evidenceFingerprint: string };
  evidence.evidenceFingerprint = evidenceFingerprint(evidence);
  return evidence;
}

function textFor(doc: PriorityDocument): string {
  return normalize([doc.title, doc.summary, doc.notes].filter(Boolean).join(" "));
}

function hasMarker(text: string, markers: readonly string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

function rating(value: number): ContentRating {
  return Math.max(0, Math.min(4, Math.round(value))) as ContentRating;
}

function fitFor(doc: PriorityDocument, sequence: PrioritySequence): SequenceFit {
  const category = normalize(doc.category);
  const tags = new Set(tagNames(doc));
  if (sequence === "boek") {return category === "epub" || tags.has("book") || tags.has("books") ? 2 : 0;}
  if (sequence === "pdf") {return category === "pdf" ? 2 : 0;}
  if (sequence === "video") {return category === "video" ? 2 : 0;}
  if (sequence === "dutch") {return tags.has("dutch") || tags.has("nederlands") || normalize(doc.language) === "nl" ? 2 : 0;}
  if (sequence === "short" || sequence === "short-dutch") {return /^\s*[0-9]+\s*(?:min|mins|minute|minutes)\b/.test(normalize(doc.reading_time)) ? 1 : 0;}
  if (sequence === "scrum") {return tags.has("scrum") || tags.has("agile") ? 2 : 0;}
  if (sequence === "software-development") {return tags.has("software development") || tags.has("programming & software") ? 2 : 0;}
  if (sequence === "front-end-development") {return tags.has("front-end development") || tags.has("accessibility") ? 2 : 0;}
  if (sequence === "social-studies") {return [...tags].some((tag) => tag.includes("social") || tag.includes("team") || tag.includes("organizational")) ? 2 : 0;}
  if (sequence === "adhd") {return tags.has("adhd") || tags.has("adhd & neurodivergence") ? 2 : 0;}
  if (sequence === "luchtig" || sequence === "luchtig-nederlands") {return tags.has("light-reading") || tags.has("fiction") || tags.has("games") ? 1 : 0;}
  return 0;
}

/**
 * Deterministic fallback for documents that have not gone through priority:judge.
 * It is intentionally marked low-confidence and never uses highlight count/presence.
 */
export function fallbackJudgment(doc: PriorityDocument): ContentJudgment {
  const tags = new Set(contentTagsFor(doc));
  const text = textFor(doc);
  const domains = matchedDomainsFromTags(doc);
  const words = Number(doc.word_count);
  const substanceSignal = hasMarker(text, SUBSTANCE_MARKERS);
  const usefulnessSignal = hasMarker(text, USEFULNESS_MARKERS) || [...tags].some((tag) => USEFULNESS_MARKERS.includes(tag));
  const deepFormat = ["pdf", "epub"].includes(normalize(doc.category));
  const fit = Object.fromEntries(SEQUENCE_ORDER.map((sequence) => [sequence, fitFor(doc, sequence)])) as Partial<Record<PrioritySequence, SequenceFit>>;
  const reasonCodes = ["fallback-no-label"];
  if (domains.length > 0) {reasonCodes.push("explicit-interest-tag");}
  if (substanceSignal || deepFormat || (Number.isFinite(words) && words >= 1_200)) {reasonCodes.push("substance-signal");}
  if (usefulnessSignal) {reasonCodes.push("usefulness-signal");}

  return {
    sourceFingerprint: judgmentSourceFingerprint(doc),
    relevance: rating(domains.length > 0 ? domains.length : hasMarker(text, ["why", "idee", "concept", "guide"]) ? 2 : 1),
    substance: rating(deepFormat || (Number.isFinite(words) && words >= 7_000) ? 4 : substanceSignal || (Number.isFinite(words) && words >= 1_200) ? 3 : 1),
    durability: rating(deepFormat || tags.has("research papers & academia") || hasMarker(text, ["history", "theory", "principle"]) ? 4 : domains.length > 0 ? 3 : 1),
    usefulness: rating(usefulnessSignal ? 4 : domains.length > 0 ? 2 : 1),
    sequenceFit: fit,
    confidence: "low",
    reasonCodes,
  };
}

/**
 * Operational judgment for a new top-100 document without a semantic review.
 * It deliberately reuses the deterministic low-confidence fallback and records
 * enough provenance for the scheduled workflow to distinguish it from a label.
 */
export function automatedFallbackJudgment(doc: PriorityDocument, judgedAt = new Date().toISOString()): ContentJudgment {
  const evidence = buildPriorityEvidence(doc, []);
  const fallback = fallbackJudgment(doc);
  const topicRelevance = Object.fromEntries(
    TOPIC_SEQUENCE_ORDER.map((topic) => [topic, fallbackTopicRelevanceFor(doc, topic).relevance]),
  ) as Partial<Record<TopicSequence, ContentRating>>;
  return {
    ...fallback,
    topicRelevance,
    evidenceFingerprint: evidence.evidenceFingerprint,
    reasonCodes: [...new Set([...fallback.reasonCodes, "automated-fallback"])],
    status: "accepted",
    rubricVersion: "semantic-v1",
    evidenceRefs: ["metadata"],
    judgedBy: AUTOMATED_FALLBACK_JUDGER,
    judgedAt,
  };
}

function isRating(value: unknown): value is ContentRating {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 4;
}

function isFit(value: unknown): value is SequenceFit {
  return Number.isInteger(value) && typeof value === "number" && value >= -2 && value <= 2;
}

function isTopicRelevance(value: unknown): value is Partial<Record<TopicSequence, ContentRating>> {
  if (!isRecord(value)) {return false;}
  return Object.entries(value).every(([topic, relevance]) => TOPIC_SEQUENCE_ORDER.includes(topic as TopicSequence) && isRating(relevance));
}

export function validateContentJudgment(value: unknown): value is ContentJudgment {
  if (!isRecord(value) || typeof value.sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceFingerprint)) {return false;}
  if (!["high", "medium", "low"].includes(String(value.confidence))) {return false;}
  if (!["relevance", "substance", "durability", "usefulness"].every((key) => isRating(value[key]))) {return false;}
  if (!isRecord(value.sequenceFit) || !Object.values(value.sequenceFit).every(isFit)) {return false;}
  if (value.topicRelevance !== undefined && !isTopicRelevance(value.topicRelevance)) {return false;}
  if (!Array.isArray(value.reasonCodes) || !value.reasonCodes.every((code) => typeof code === "string" && code.length > 0)) {return false;}
  if (Object.hasOwn(value, "highlights")) {return false;}
  if (value.status !== undefined && value.status !== "accepted" && value.status !== "draft" && value.status !== "rejected") {return false;}
  if (value.evidenceFingerprint !== undefined && (typeof value.evidenceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.evidenceFingerprint))) {return false;}
  if (value.evidenceRefs !== undefined && (!Array.isArray(value.evidenceRefs) || !value.evidenceRefs.every((ref) => typeof ref === "string" && ref.length > 0))) {return false;}
  return true;
}

export function validatePriorityJudgments(value: unknown): value is PriorityJudgmentsConfig {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2) || !isRecord(value.items)) {return false;}
  if (value.version === 2 && value.rubricVersion !== "semantic-v1") {return false;}
  if (value.version === 2 && Object.entries(value.items).some(([, judgment]) => {
    if (!isRecord(judgment) || !["accepted", "draft", "rejected"].includes(String(judgment.status))) {return true;}
    return typeof judgment.evidenceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(judgment.evidenceFingerprint) ||
      typeof judgment.judgedBy !== "string" || judgment.judgedBy.trim().length === 0 ||
      typeof judgment.judgedAt !== "string" || judgment.judgedAt.trim().length === 0;
  })) {return false;}
  return Object.entries(value.items).every(([id, judgment]) => id.length > 0 && validateContentJudgment(judgment));
}

export interface TopicRelevanceResolution {
  relevance: ContentRating;
  source: "label" | "fallback";
  confidence: JudgmentConfidence;
  evidence: string[];
}

export function topicRelevanceFor(
  doc: PriorityDocument,
  topic: TopicSequence,
  judgment?: ContentJudgment,
): TopicRelevanceResolution {
  const labeledRelevance = judgment?.topicRelevance?.[topic];
  if (judgment && labeledRelevance !== undefined) {
    return {
      relevance: labeledRelevance,
      source: judgment.judgedBy === AUTOMATED_FALLBACK_JUDGER ? "fallback" : "label",
      confidence: judgment.confidence,
      evidence: [],
    };
  }
  return fallbackTopicRelevanceFor(doc, topic);
}

export function judgmentFor(
  doc: PriorityDocument,
  judgments: PriorityJudgmentsConfig | Record<string, ContentJudgment> = {},
): { judgment: ContentJudgment; source: JudgmentSource } {
  const items: Record<string, ContentJudgment> = "version" in judgments
    ? (judgments as PriorityJudgmentsConfig).items
    : judgments;
  const candidate = doc.id ? items[doc.id] : undefined;
  if (candidate && validateContentJudgment(candidate) && candidate.status === "accepted" && candidate.sourceFingerprint === judgmentSourceFingerprint(doc)) {
    return { judgment: candidate, source: candidate.judgedBy === AUTOMATED_FALLBACK_JUDGER ? "fallback" : "label" };
  }
  return { judgment: fallbackJudgment(doc), source: "fallback" };
}
