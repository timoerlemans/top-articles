import { createHash } from "node:crypto";

import type { PriorityDocument } from "./readwise-priority-v2.js";
import { matchedDomainsFromTags } from "./readwise-priority-v2.js";
import { SEQUENCE_ORDER } from "./priority-sequences.js";
import type { PrioritySequence } from "./priority-sequences.js";

export type ContentRating = 0 | 1 | 2 | 3 | 4;
export type JudgmentConfidence = "high" | "medium" | "low";
export type JudgmentSource = "label" | "fallback";
export type SequenceFit = -2 | -1 | 0 | 1 | 2;

export interface ContentJudgment {
  sourceFingerprint: string;
  relevance: ContentRating;
  substance: ContentRating;
  durability: ContentRating;
  usefulness: ContentRating;
  sequenceFit: Partial<Record<PrioritySequence, SequenceFit>>;
  confidence: JudgmentConfidence;
  reasonCodes: string[];
}

export interface PriorityJudgmentsConfig {
  version: 1;
  items: Record<string, ContentJudgment>;
}

const ORDER_TAG = /^(?:video|boek|pdf|lees|dutch|short|short-dutch|luchtig|luchtig-nederlands|scrum|software-development|front-end-development|social-studies|adhd)-\d{3,4}$/;
const DERIVED_ORDER_TAG = /^aaa(?:-[a-z0-9-]+)?-top-(?:10|100)$/;
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

function contentTags(doc: PriorityDocument): string[] {
  return tagNames(doc)
    .filter((tag) => !ORDER_TAG.test(tag) && !DERIVED_ORDER_TAG.test(tag) && !CURATION_TAGS.has(tag))
    .sort((a, b) => a.localeCompare(b));
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
    tags: contentTags(doc),
  };
}

/** Fingerprint deliberately excludes ordinal and derived top-list tags. */
export function judgmentSourceFingerprint(doc: PriorityDocument): string {
  return createHash("sha256").update(JSON.stringify(canonicalInput(doc))).digest("hex");
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
  const tags = new Set(contentTags(doc));
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

/** Builds a low-cost label from the actual highlight text, without using highlight count. */
export function suggestedJudgmentFromHighlights(
  doc: PriorityDocument,
  highlights: readonly string[],
): ContentJudgment {
  const base = fallbackJudgment(doc);
  if (highlights.length === 0) {return base;}
  const reasonCodes = [...base.reasonCodes, "highlight-evidence-available"];
  return {
    ...base,
    confidence: "low",
    reasonCodes,
  };
}

function isRating(value: unknown): value is ContentRating {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 4;
}

function isFit(value: unknown): value is SequenceFit {
  return Number.isInteger(value) && typeof value === "number" && value >= -2 && value <= 2;
}

export function validateContentJudgment(value: unknown): value is ContentJudgment {
  if (!isRecord(value) || typeof value.sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceFingerprint)) {return false;}
  if (!["high", "medium", "low"].includes(String(value.confidence))) {return false;}
  if (!["relevance", "substance", "durability", "usefulness"].every((key) => isRating(value[key]))) {return false;}
  if (!isRecord(value.sequenceFit) || !Object.values(value.sequenceFit).every(isFit)) {return false;}
  return Array.isArray(value.reasonCodes) && value.reasonCodes.every((code) => typeof code === "string" && code.length > 0);
}

export function validatePriorityJudgments(value: unknown): value is PriorityJudgmentsConfig {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.items)) {return false;}
  return Object.entries(value.items).every(([id, judgment]) => id.length > 0 && validateContentJudgment(judgment));
}

export function judgmentFor(
  doc: PriorityDocument,
  judgments: PriorityJudgmentsConfig | Record<string, ContentJudgment> = {},
): { judgment: ContentJudgment; source: JudgmentSource } {
  const items: Record<string, ContentJudgment> = "version" in judgments
    ? (judgments as PriorityJudgmentsConfig).items
    : judgments;
  const candidate = doc.id ? items[doc.id] : undefined;
  if (candidate && validateContentJudgment(candidate) && candidate.sourceFingerprint === judgmentSourceFingerprint(doc)) {
    return { judgment: candidate, source: "label" };
  }
  return { judgment: fallbackJudgment(doc), source: "fallback" };
}
