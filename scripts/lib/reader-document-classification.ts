import {
  CORE_INTEREST_LABELS,
  coreInterestFingerprintInput,
  resolveCoreInterestMatchesFromSignals,
} from "./core-interest-priority.js";
import type { CoreInterestMatch } from "./core-interest-priority.js";
import {
  AUTOMATED_FALLBACK_JUDGER,
  buildPriorityEvidence,
  contentTagsFor,
  fallbackJudgment,
  judgmentFor,
  judgmentSourceFingerprint,
  topicRelevanceFor,
} from "./priority-judgments.js";
import type { ContentJudgment, JudgmentSource, PriorityJudgmentsConfig, TopicRelevanceResolution } from "./priority-judgments.js";
import { categoryFor, DIRECT_DOMAIN_TAGS, isBook, isPdf, matchedDomainsFromTags } from "./priority-document.js";
import type { PriorityDocument, DirectDomain } from "./priority-document.js";
import { DEFAULT_TOPIC_TAG_TAXONOMY } from "./priority-topic-taxonomy.js";
import { PHILOSOPHY_TAGS } from "./philosophy-profile.js";
import { canonicalInterestTags, READWISE_TAG_ALIASES } from "./readwise-tags.js";
import { SEQUENCE_ORDER, TOPIC_SEQUENCE_ORDER } from "./priority-sequences.js";
import type { PrioritySequence, TopicSequence } from "./priority-sequences.js";
import { parseReadingMinutes } from "../../src/reading-policy.js";

export const READER_CLASSIFICATION_POLICY_VERSION = 1 as const;

export interface ReaderDocumentClassification {
  readonly category: string;
  readonly language: "Nederlands" | "Engels" | "Frans" | null;
  readonly isDutch: boolean;
  readonly isBook: boolean;
  readonly isPdf: boolean;
  readonly readingMinutes: number | null;
  readonly interestTags: readonly string[];
  readonly tagDomains: readonly DirectDomain[];
  readonly sequences: readonly PrioritySequence[];
  readonly judgment: ContentJudgment;
  readonly judgmentSource: JudgmentSource;
  readonly topicRelevance: Readonly<Record<TopicSequence, TopicRelevanceResolution>>;
  readonly coreInterestMatches: readonly CoreInterestMatch[];
}

export interface ReaderClassificationOptions {
  readonly judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment>;
}

export function classifyReaderDocument(
  document: PriorityDocument,
  options: ReaderClassificationOptions = {},
): ReaderDocumentClassification {
  const semanticDocument = semanticDocumentFor(document);
  const decodedTags = decodeTagNames(document.tags);
  const interestTags = canonicalInterestTags(decodedTags);
  const resolution = resolveCurrentJudgment(document, semanticDocument, options.judgments ?? {});
  const topicRelevance = Object.fromEntries(
    TOPIC_SEQUENCE_ORDER.map((topic) => [topic, topicRelevanceFor(semanticDocument, topic, resolution.judgment)]),
  ) as Record<TopicSequence, TopicRelevanceResolution>;
  return {
    category: categoryFor(document),
    language: publicLanguageFor(document, decodedTags),
    isDutch: isDutchFor(document, decodedTags),
    isBook: isBook(semanticDocument),
    isPdf: isPdf(document),
    readingMinutes: parseReadingMinutes(document.reading_time),
    interestTags,
    tagDomains: matchedDomainsFromTags(semanticDocument),
    sequences: currentSequencesFor(semanticDocument, decodedTags),
    judgment: resolution.judgment,
    judgmentSource: resolution.source,
    topicRelevance,
    coreInterestMatches: resolveCoreInterestMatchesFromSignals(
      contentTagsFor(document).map((source) => ({ source, canonicalTags: canonicalInterestTags([source]) })),
      resolution.judgment,
    ),
  };
}

export function automatedReaderFallbackJudgment(document: PriorityDocument, judgedAt?: string): ContentJudgment {
  const semanticDocument = semanticDocumentFor(document);
  const evidence = buildPriorityEvidence(document, []);
  const fallback = currentFallbackJudgment(document, semanticDocument);
  const topicRelevance = Object.fromEntries(
    TOPIC_SEQUENCE_ORDER.map((topic) => [topic, topicRelevanceFor(semanticDocument, topic).relevance]),
  ) as Partial<Record<TopicSequence, ContentJudgment["relevance"]>>;
  return {
    ...fallback,
    topicRelevance,
    evidenceFingerprint: evidence.evidenceFingerprint,
    reasonCodes: [...new Set([...fallback.reasonCodes, "automated-fallback"])],
    status: "accepted",
    rubricVersion: "semantic-v1",
    evidenceRefs: ["metadata"],
    judgedBy: AUTOMATED_FALLBACK_JUDGER,
    judgedAt: judgedAt ?? new Date().toISOString(),
  };
}

export function readerClassificationFingerprintInput(): Record<string, unknown> {
  return {
    version: READER_CLASSIFICATION_POLICY_VERSION,
    decoder: { version: 1, descriptorPreference: ["name", "key"], objectMetadata: "keys-only" },
    aliases: READWISE_TAG_ALIASES,
    directDomains: DIRECT_DOMAIN_TAGS,
    membership: {
      currentSequenceOrder: ["video", "boek", "pdf", "lees", "dutch", "short", "short-dutch", "luchtig", "luchtig-nederlands", "scrum", "software-development", "front-end-development", "social-studies", "adhd", "philosophy"],
      booksOnly: true,
    },
    shortMinutesExclusive: 5,
    topicRelevance: DEFAULT_TOPIC_TAG_TAXONOMY,
    philosophy: PHILOSOPHY_TAGS,
    coreInterest: { labels: CORE_INTEREST_LABELS, ...coreInterestFingerprintInput() },
    language: { explicitPrecedence: ["nl", "en", "fr"], tagPrecedence: ["nl", "en", "fr"] },
    fallback: { automaticJudger: AUTOMATED_FALLBACK_JUDGER, confidence: "low" },
  };
}

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

function decodeTagNames(tags: unknown): string[] {
  const raw = Array.isArray(tags) ? tags : isRecord(tags) ? Object.keys(tags) : [];
  return [...new Set(raw.flatMap((tag) => {
    if (typeof tag === "string") {return [normalize(tag)];}
    if (!isRecord(tag)) {return [];}
    const name = tag.name;
    if (typeof name === "string") {return [normalize(name)];}
    const key = tag.key;
    return typeof key === "string" ? [normalize(key)] : [];
  }).filter(Boolean))];
}

function semanticDocumentFor(document: PriorityDocument): PriorityDocument {
  const decodedTags = decodeTagNames(document.tags);
  const interestTags = canonicalInterestTags(decodedTags);
  return { ...document, tags: [...new Set([...decodedTags, ...interestTags])] };
}

function currentFallbackJudgment(document: PriorityDocument, semanticDocument: PriorityDocument): ContentJudgment {
  return { ...fallbackJudgment(semanticDocument), sourceFingerprint: judgmentSourceFingerprint(document) };
}

function resolveCurrentJudgment(
  document: PriorityDocument,
  semanticDocument: PriorityDocument,
  judgments: PriorityJudgmentsConfig | Record<string, ContentJudgment>,
): { judgment: ContentJudgment; source: JudgmentSource } {
  const resolution = judgmentFor(document, judgments);
  return resolution.source === "label"
    ? resolution
    : { judgment: currentFallbackJudgment(document, semanticDocument), source: "fallback" };
}

function languageCode(value: unknown): "nl" | "en" | "fr" | null {
  const normalized = normalize(value);
  if (["nl", "nld", "dut", "dutch", "nederlands"].includes(normalized)) {return "nl";}
  if (["en", "eng", "english"].includes(normalized)) {return "en";}
  if (["fr", "fra", "fre", "french", "frans"].includes(normalized)) {return "fr";}
  return null;
}

function tagLanguage(tags: readonly string[]): "nl" | "en" | "fr" | null {
  const set = new Set(tags);
  if (["dutch", "nl", "nederlands"].some((tag) => set.has(tag))) {return "nl";}
  if (["english", "en", "lang:en"].some((tag) => set.has(tag))) {return "en";}
  if (["french", "fr"].some((tag) => set.has(tag))) {return "fr";}
  return null;
}

function publicLanguageFor(document: PriorityDocument, tags: readonly string[]): "Nederlands" | "Engels" | "Frans" | null {
  const code = languageCode(document.language) ?? tagLanguage(tags);
  return code === "nl" ? "Nederlands" : code === "en" ? "Engels" : code === "fr" ? "Frans" : null;
}

function isDutchFor(document: PriorityDocument, tags: readonly string[]): boolean {
  return (languageCode(document.language) ?? tagLanguage(tags)) === "nl";
}

const LIGHT_TOPIC_TAGS = new Set([
  "arts & culture", "fiction", "games", "health & wellness", "food & cooking", "sports & recreation", "entertainment & pop culture",
]);
const SCRUM_TAGS = new Set(["scrum", "agile", "agile & scrum", "scrum & agile"]);
const SCRUM_MASTER_TAGS = new Set(["team coaching", "facilitation", "flow & delivery", "psm-ii"]);
const SOFTWARE_DEVELOPMENT_TAGS = new Set(["software development", "software-development", "programming & software"]);
const FRONT_END_DEVELOPMENT_TAGS = new Set(["front-end development", "frontend development", "front end development", "front-end-development", "accessibility"]);
const SOCIAL_STUDIES_TAGS = new Set([
  "social psychology & interpersonal dynamics", "team dynamics & collaboration", "organizational behavior & culture", "behavioral psychology & coaching",
  "sociology & social structures", "team coaching", "facilitation", "organizational culture", "scrum", "agile", "product management", "flow & delivery",
]);
const ADHD_TAGS = new Set(["adhd", "adhd & neurodivergence"]);

function currentSequencesFor(document: PriorityDocument, decodedTags: readonly string[]): PrioritySequence[] {
  const tags = new Set([...decodedTags, ...canonicalInterestTags(decodedTags)]);
  const category = categoryFor(document);
  const book = isBook({ ...document, tags: [...tags] });
  const dutch = isDutchFor(document, decodedTags);
  const minutes = parseReadingMinutes(document.reading_time);
  const short = minutes !== null && minutes > 0 && minutes < 5;
  const sequences = new Set<PrioritySequence>();

  if (category === "video") { sequences.add("video"); }
  if (book) { sequences.add("boek"); }
  if (isPdf(document)) { sequences.add("pdf"); }
  if (!book && ["article", "email", "rss"].includes(category)) { sequences.add("lees"); }
  if (!book && dutch) { sequences.add("dutch"); }
  if (!book && short) {
    sequences.add("short");
    if (dutch) { sequences.add("short-dutch"); }
  }

  if (!book) {
    const lightReading = tags.has("light-reading") || [...tags].some((tag) => /^luchtig-\d{3,4}$/.test(tag) || tag === "aaa-luchtig-top-10" || tag === "aaa-luchtig-top-100" || LIGHT_TOPIC_TAGS.has(tag));
    if (lightReading) {
      sequences.add("luchtig");
      if (dutch) { sequences.add("luchtig-nederlands"); }
    }
    if ([...tags].some((tag) => SCRUM_TAGS.has(tag) || SCRUM_MASTER_TAGS.has(tag))) { sequences.add("scrum"); }
    if ([...tags].some((tag) => SOFTWARE_DEVELOPMENT_TAGS.has(tag))) { sequences.add("software-development"); }
    if ([...tags].some((tag) => FRONT_END_DEVELOPMENT_TAGS.has(tag))) { sequences.add("front-end-development"); }
    if ([...tags].some((tag) => SOCIAL_STUDIES_TAGS.has(tag))) { sequences.add("social-studies"); }
    if ([...tags].some((tag) => ADHD_TAGS.has(tag))) { sequences.add("adhd"); }
    if (topicRelevanceFor({ ...document, tags: [...tags] }, "philosophy").relevance > 0) { sequences.add("philosophy"); }
  }
  return SEQUENCE_ORDER.filter((sequence) => sequences.has(sequence));
}
