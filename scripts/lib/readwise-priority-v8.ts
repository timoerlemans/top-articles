import { parseReadingMinutes, isShort } from "../../src/reading-policy.js";
import { actualPositionsForDocument, comparePriorityItems, sequencesForDocument } from "./priority-membership.js";
import { detectDutch } from "./priority-document.js";
import type { PriorityDocument, PriorityTier } from "./priority-document.js";
import { hasTag, judgmentFor, topicRelevanceFor } from "./priority-judgments.js";
import type { ContentJudgment, PriorityJudgmentsConfig } from "./priority-judgments.js";
import { SEQUENCE_ORDER, TOPIC_SEQUENCE_ORDER } from "./priority-sequences.js";
import type { PrioritySequence, TopicSequence } from "./priority-sequences.js";
import {
  CORE_INTEREST_LABELS, buildCoreInterestPriorityFromEvidence, coreInterestBonus,
  defaultCoreInterestPriorityConfig, resolveCoreInterestMatches, validateCoreInterestPriorityConfig,
} from "./core-interest-priority.js";
import type { CoreInterestMatch, CoreInterestPriority, CoreInterestPriorityConfig, WeightedCoreInterestMatch } from "./core-interest-priority.js";
import { splitReadingFeedback } from "./reader-notes.js";

export { actualPositionsForDocument, detectDutch, SEQUENCE_ORDER, sequencesForDocument };
export type { PriorityDocument, PriorityTier } from "./priority-document.js";
export type { ContentJudgment, PriorityJudgmentsConfig } from "./priority-judgments.js";
export type { PrioritySequence, TopicSequence } from "./priority-sequences.js";
export type { CoreInterestPriority, CoreInterestPriorityConfig, WeightedCoreInterestMatch } from "./core-interest-priority.js";

export interface PriorityOverride {
  adjustment?: number | undefined;
  reason?: string | null | undefined;
}
export type PriorityOverrideMap = Record<string, PriorityOverride | undefined>;
export interface PriorityOverridesConfig { version: 1; items: PriorityOverrideMap; }

export interface PriorityComponents {
  kerninteresse: number;
  relevantie: number;
  substantie: number;
  duurzaamheid: number;
  bruikbaarheid: number;
  leeskans: number;
  nederlandse_taal: number;
  aftrek: number;
}

export type PriorityComponentKey = keyof PriorityComponents;
export type PriorityRationale = Record<PriorityComponentKey, string[]>;

export interface PriorityScoreResult {
  baseScore: number;
  adjustment: number;
  adjustmentReason: string | null;
  score: number;
  tier: PriorityTier;
  components: PriorityComponents;
  rationale: PriorityRationale;
  judgmentSource: "label" | "fallback";
  judgmentConfidence: ContentJudgment["confidence"];
  coreInterestMatches: WeightedCoreInterestMatch[];
}

export interface PriorityExportOptions {
  generatedAt?: string | undefined;
  overrides?: PriorityOverridesConfig | PriorityOverrideMap | undefined;
  judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment> | undefined;
  coreInterestConfig?: CoreInterestPriorityConfig | undefined;
}

export const PRIORITY_MODEL = "readwise-priority-v8" as const;
export const SEQUENCE_FIT_WEIGHT = 3;
export const SHORTLIST_SCORE_BONUS = 20;
export const MUST_READ_SCORE_BONUS = 30;
export const WANT_TO_READ_SCORE_BONUS = 50;
export const PRIORITY_AUTHOR_SCORE_BONUS = 50;
const PRIORITY_AUTHORS = new Map([
  ["henrik karlsson", "Henrik Karlsson"],
  ["eleanor konik", "Eleanor Konik"],
]);

export interface PriorityTopicComponents {
  kerninteresse: number;
  topic_relevantie: number;
  substantie: number;
  duurzaamheid: number;
  bruikbaarheid: number;
  leeskans: number;
  nederlandse_taal: number;
  aftrek: number;
}

export type PrioritySequenceScoreMode = "global" | "topic";

export interface PrioritySequenceScore {
  score: number;
  tier: PriorityTier;
  mode: PrioritySequenceScoreMode;
  topicRelevance?: number;
  relevanceSource?: "label" | "fallback";
  relevanceConfidence?: ContentJudgment["confidence"];
  components?: PriorityTopicComponents;
}

export type PrioritySequenceScores = Partial<Record<PrioritySequence, PrioritySequenceScore>>;

export interface PriorityExportItem extends PriorityScoreResult {
  sequences: PrioritySequence[];
  sequenceScores: PrioritySequenceScores;
  positions: Partial<Record<PrioritySequence, number>>;
  actualPositions: Partial<Record<PrioritySequence, number>>;
}

export interface PriorityExport {
  generatedAt: string;
  model: typeof PRIORITY_MODEL;
  scope: "later";
  coreInterestPriority: CoreInterestPriority;
  items: Record<string, PriorityExportItem>;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function floorScore(score: number): number {
  return Math.max(0, Math.round(score));
}

function tierForScore(score: number): PriorityTier {
  if (score >= 70) {return "hoog";}
  if (score >= 40) {return "midden";}
  return "laag";
}

function normalizedAuthor(author: string | null | undefined): string {
  return (author ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function curationBonusesFor(doc: PriorityDocument): { total: number; reasons: string[] } {
  const reasons: string[] = [];
  const authorLabel = PRIORITY_AUTHORS.get(normalizedAuthor(doc.author));
  let total = 0;

  if (authorLabel) {
    total += PRIORITY_AUTHOR_SCORE_BONUS;
    reasons.push(`Voorkeursauteur ${authorLabel}: +${PRIORITY_AUTHOR_SCORE_BONUS} bonuspunten.`);
  } else if (hasTag(doc, "must-read")) {
    total += MUST_READ_SCORE_BONUS;
    reasons.push(`Tag must-read: +${MUST_READ_SCORE_BONUS} bonuspunten.`);
  } else if (hasTag(doc, "shortlist") || hasTag(doc, "short-list")) {
    total += SHORTLIST_SCORE_BONUS;
    reasons.push(`Tag shortlist: +${SHORTLIST_SCORE_BONUS} bonuspunten.`);
  }

  if (hasTag(doc, "want-to-read")) {
    total += WANT_TO_READ_SCORE_BONUS;
    reasons.push(`Tag want-to-read: +${WANT_TO_READ_SCORE_BONUS} bonuspunten.`);
  }

  return { total, reasons };
}

function withCurationBonuses<T extends PriorityScoreResult>(doc: PriorityDocument, score: T): T {
  const bonuses = curationBonusesFor(doc);
  if (bonuses.total === 0) {return score;}
  const adjustment = score.adjustment + bonuses.total;
  const existingReasons = typeof score.adjustmentReason === "string" ? [score.adjustmentReason] : [];
  const adjustmentReason = [...existingReasons, ...bonuses.reasons].join("; ");
  const totalScore = floorScore(score.baseScore + adjustment);
  return {
    ...score,
    adjustment,
    adjustmentReason,
    score: totalScore,
    tier: tierForScore(totalScore),
  };
}

function overrideMap(overrides: PriorityExportOptions["overrides"]): PriorityOverrideMap {
  if (!overrides) {return {};}
  const record = overrides as unknown as Record<string, unknown>;
  if (record.version === 1 && isRecord(record.items)) {
    return record.items as PriorityOverrideMap;
  }
  return overrides as PriorityOverrideMap;
}

function topicComponents(global: PriorityScoreResult, relevance: number): PriorityTopicComponents {
  return {
    kerninteresse: global.components.kerninteresse,
    topic_relevantie: relevance,
    substantie: global.components.substantie,
    duurzaamheid: global.components.duurzaamheid,
    bruikbaarheid: global.components.bruikbaarheid,
    leeskans: global.components.leeskans,
    nederlandse_taal: global.components.nederlandse_taal,
    aftrek: global.components.aftrek,
  };
}

function topicScore(components: PriorityTopicComponents, adjustment: number): number {
  return floorScore(
    components.kerninteresse +
    components.topic_relevantie * 10 +
    components.substantie +
    components.duurzaamheid +
    components.bruikbaarheid +
    components.leeskans +
    components.nederlandse_taal +
    components.aftrek +
    adjustment,
  );
}

function sequenceScore(
  doc: PriorityDocument,
  sequence: PrioritySequence,
  global: PriorityScoreResult,
  judgment: ContentJudgment,
): PrioritySequenceScore {
  if ((TOPIC_SEQUENCE_ORDER as readonly string[]).includes(sequence)) {
    const resolution = topicRelevanceFor(doc, sequence as TopicSequence, judgment);
    const components = topicComponents(global, resolution.relevance);
    const score = topicScore(components, global.adjustment);
    return {
      score,
      tier: tierForScore(score),
      mode: "topic",
      topicRelevance: resolution.relevance,
      relevanceSource: resolution.source,
      relevanceConfidence: resolution.confidence,
      components,
    };
  }

  const score = floorScore(global.score + (judgment.sequenceFit[sequence] ?? 0) * SEQUENCE_FIT_WEIGHT);
  return { score, tier: tierForScore(score), mode: "global" };
}

function normalize(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function tagsFor(doc: PriorityDocument): Set<string> {
  const raw = Array.isArray(doc.tags) ? doc.tags : isRecord(doc.tags) ? Object.keys(doc.tags) : [];
  return new Set(raw.map((tag) => {
    if (typeof tag === "string") {return normalize(tag);}
    if (!isRecord(tag)) {return "";}
    return normalize(tag.name ?? tag.key);
  }).filter(Boolean));
}

function whyRead(doc: PriorityDocument): string {
  return splitReadingFeedback(doc.notes).contentNotes?.match(/Waarom lezen:\s*([\s\S]*?)(?:\n\s*Beste moment:|$)/i)?.[1]?.toLowerCase().trim() ?? "";
}

function readingMinutes(doc: PriorityDocument): number | null {
  return parseReadingMinutes(doc.reading_time);
}

function validateOverride(override: unknown = {}): { adjustment: number; reason: string | null } {
  const record = isRecord(override) ? override : {};
  const adjustment = record.adjustment ?? 0;
  const reason = String(record.reason ?? "").trim() || null;
  if (typeof adjustment !== "number" || !Number.isInteger(adjustment)) {throw new Error("Handmatige scorecorrectie moet een geheel getal zijn");}
  if (adjustment !== 0 && !reason) {throw new Error("Handmatige scorecorrectie vereist een reden");}
  return { adjustment, reason };
}

interface PreparedDocument {
  doc: PriorityDocument;
  scoringDoc: PriorityDocument;
  resolution: ReturnType<typeof judgmentFor>;
  matches: CoreInterestMatch[];
}

function withoutLegacyCuration(doc: PriorityDocument): PriorityDocument {
  const isCuration = (tag: string): boolean => ["must-read", "shortlist", "short-list"].includes(
    tag.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(),
  );
  if (Array.isArray(doc.tags)) {
    return { ...doc, tags: doc.tags.filter((tag) => typeof tag !== "string" || !isCuration(tag)) };
  }
  if (isRecord(doc.tags)) {
    return { ...doc, tags: Object.fromEntries(Object.entries(doc.tags).filter(([tag]) => !isCuration(tag))) };
  }
  return doc;
}

function prepareDocument(doc: PriorityDocument, judgments: PriorityExportOptions["judgments"]): PreparedDocument {
  const resolution = judgmentFor(doc, judgments ?? {});
  const scoringDoc = withoutLegacyCuration(doc);
  // Current and legacy fingerprints exclude these curation tags; fallback does too.
  return { doc, scoringDoc, resolution, matches: resolveCoreInterestMatches(doc, resolution.judgment) };
}

function scorePreparedDocument(
  prepared: PreparedDocument,
  override: PriorityOverride,
  priority: CoreInterestPriority,
): PriorityScoreResult {
  const { doc, scoringDoc, resolution: { judgment, source }, matches } = prepared;
  const tags = tagsFor(scoringDoc);
  const minutes = readingMinutes(scoringDoc);
  const text = `${normalize(scoringDoc.title)} ${normalize(scoringDoc.summary)} ${whyRead(scoringDoc)}`;
  const noSummary = normalize(scoringDoc.summary) === "";
  const noWhyRead = whyRead(scoringDoc) === "";
  const words = Number(scoringDoc.word_count);
  let aftrek = 0;
  if (tags.has("current affairs") && /(united states|u\.s\.|us politics|trump|america|american)/.test(text) && judgment.relevance === 0) {aftrek -= 10;}
  if ((Number.isFinite(words) && words < 250 && noSummary && noWhyRead) || normalize(scoringDoc.category) === "tweet" || (tags.has("newsletter") && Number.isFinite(words) && words < 600)) {aftrek -= 10;}
  const { bonus, matches: weightedMatches } = coreInterestBonus(matches, priority);
  const components: PriorityComponents = {
    kerninteresse: bonus,
    relevantie: judgment.relevance * 10,
    substantie: judgment.substance * 8,
    duurzaamheid: judgment.durability * 5,
    bruikbaarheid: judgment.usefulness * 5,
    leeskans: isShort(minutes) ? 5 : 0,
    nederlandse_taal: detectDutch(scoringDoc) ? 5 : 0,
    aftrek,
  };
  // Preserve historical clipping before the interest bonus, and descriptor-tag standalone behavior.
  const legacyCuration = tags.has("must-read") ? 8 : tags.has("shortlist") || tags.has("short-list") ? 4 : 0;
  const baseScore = floorScore(floorScore(
    components.relevantie + components.substantie + components.duurzaamheid + components.bruikbaarheid +
    components.leeskans + components.nederlandse_taal + legacyCuration + components.aftrek,
  ) + bonus);
  const { adjustment, reason } = validateOverride(override);
  const score = floorScore(baseScore + adjustment);
  const labels = {
    relevantie: "inhoudelijke relevantie", substantie: "substantie", duurzaamheid: "duurzaamheid",
    bruikbaarheid: "bruikbaarheid", leeskans: "leeskans", nederlandse_taal: "Nederlandse taal", aftrek: "aftrek",
  };
  const rationale = Object.fromEntries(Object.entries(labels).map(([key, label]) => [key,
    components[key as keyof typeof labels] !== 0 ? [`${label} uit de ${judgment.confidence}-confidence inhoudsbeoordeling.`] : [],
  ])) as PriorityRationale;
  if (judgment.reasonCodes.length > 0) {rationale.relevantie.push(`Bewijs: ${judgment.reasonCodes.join(", ")}.`);}
  rationale.kerninteresse = weightedMatches.map((match) => {
    const labels = match.evidence.map(({ label }) => label).join(", ");
    return `${CORE_INTEREST_LABELS[match.interest]}: +${match.weight}${labels ? ` (${labels})` : ""}.`;
  });
  return withCurationBonuses(doc, {
    baseScore, adjustment, adjustmentReason: reason, score, tier: tierForScore(score), components, rationale,
    judgmentSource: source, judgmentConfidence: judgment.confidence, coreInterestMatches: weightedMatches,
  });
}

export function scorePriorityDocument(
  doc: PriorityDocument,
  override: PriorityOverride = {},
  judgments: PriorityExportOptions["judgments"] = {},
  coreInterestPriority?: CoreInterestPriority,
  coreInterestConfig?: CoreInterestPriorityConfig,
): PriorityScoreResult {
  const config = coreInterestConfig ?? defaultCoreInterestPriorityConfig();
  const prepared = prepareDocument(doc, judgments);
  const priority = coreInterestPriority ?? buildCoreInterestPriorityFromEvidence(
    [{ documentId: doc.id, matches: prepared.matches }], config, "standalone",
  );
  return scorePreparedDocument(prepared, override, priority);
}

interface ExpectedExport {
  coreInterestPriority: CoreInterestPriority;
  items: Record<string, PriorityExportItem>;
}

function buildExpected(
  documents: readonly PriorityDocument[],
  overrides: PriorityOverrideMap,
  judgments: PriorityExportOptions["judgments"],
  coreInterestConfig: CoreInterestPriorityConfig | undefined,
  generatedAt: string,
): ExpectedExport {
  const config = coreInterestConfig ?? defaultCoreInterestPriorityConfig();
  validateCoreInterestPriorityConfig(config);
  const prepared = documents.map((doc) => prepareDocument(doc, judgments));
  const coreInterestPriority = buildCoreInterestPriorityFromEvidence(prepared.map(({ doc, matches }) => ({ documentId: doc.id, matches })), config, generatedAt);
  const items: Record<string, PriorityExportItem> = {};
  const savedAtById = new Map<string, number>();

  for (const entry of prepared) {
    const { doc, resolution: { judgment } } = entry;
    if (!doc.id) {throw new Error("Priority-document mist een Readwise document-id");}
    if (Object.hasOwn(items, doc.id)) {throw new Error(`Dubbel priority-document: ${doc.id}`);}
    const savedAt = Date.parse(doc.saved_at ?? "");
    if (!Number.isFinite(savedAt)) {throw new Error(`Document ${doc.id} heeft geen geldige saved_at`);}
    savedAtById.set(doc.id, savedAt);
    const scored = scorePreparedDocument(entry, overrides[doc.id] ?? {}, coreInterestPriority);
    const sequences = sequencesForDocument(doc);
    const sequenceScores = Object.fromEntries(sequences.map((sequence) => [sequence, sequenceScore(doc, sequence, scored, judgment)])) as PrioritySequenceScores;
    items[doc.id] = { ...scored, sequences, sequenceScores, positions: {}, actualPositions: actualPositionsForDocument(doc) };
  }

  for (const sequence of SEQUENCE_ORDER) {
    const ranked = Object.entries(items)
      .filter(([, item]) => item.sequences.includes(sequence))
      .map(([id, item]) => ({
        id,
        item: { score: item.sequenceScores[sequence]?.score ?? item.score },
      }))
      .sort((a, b) => comparePriorityItems(a, b, savedAtById));
    ranked.forEach(({ id }, index) => {
      const item = items[id];
      if (item) {item.positions[sequence] = index + 1;}
    });
  }

  return { coreInterestPriority, items };
}

export function buildPriorityExport(
  documents: readonly PriorityDocument[],
  options: PriorityExportOptions = {},
): PriorityExport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const expected = buildExpected(documents, overrideMap(options.overrides), options.judgments, options.coreInterestConfig, generatedAt);
  const result: PriorityExport = {
    generatedAt,
    model: PRIORITY_MODEL,
    scope: "later",
    coreInterestPriority: expected.coreInterestPriority,
    items: expected.items,
  };
  validatePriorityExport(result, documents, options.overrides, options.judgments, options.coreInterestConfig);
  return result;
}

function sequenceScoreShape(value: unknown, id: string, sequence: PrioritySequence, adjustment: number): value is PrioritySequenceScore {
  if (!isRecord(value) || !Number.isInteger(value.score) || !isFiniteNumber(value.score) || value.score < 0 || value.tier !== tierForScore(value.score)) {
    throw new Error(`Ongeldige v8-reeksscore voor ${id}/${sequence}`);
  }
  if (value.mode !== "global" && value.mode !== "topic") {
    throw new Error(`Ongeldige v8-scoremodus voor ${id}/${sequence}`);
  }
  if (value.mode === "global") {
    return true;
  }
  if (!Number.isInteger(value.topicRelevance) || !isFiniteNumber(value.topicRelevance) || value.topicRelevance < 0 || value.topicRelevance > 4) {
    throw new Error(`Ongeldige topicrelevantie voor ${id}/${sequence}`);
  }
  if (value.relevanceSource !== "label" && value.relevanceSource !== "fallback") {
    throw new Error(`Ongeldige topicbron voor ${id}/${sequence}`);
  }
  if (value.relevanceConfidence !== "high" && value.relevanceConfidence !== "medium" && value.relevanceConfidence !== "low") {
    throw new Error(`Ongeldige topic-confidence voor ${id}/${sequence}`);
  }
  if (!isRecord(value.components)) {
    throw new Error(`Topiccomponenten ontbreken voor ${id}/${sequence}`);
  }
  const componentsValue = value.components;
  const componentKeys: (keyof PriorityTopicComponents)[] = [
    "kerninteresse", "topic_relevantie", "substantie", "duurzaamheid", "bruikbaarheid", "leeskans", "nederlandse_taal", "aftrek",
  ];
  if (Object.keys(componentsValue).length !== componentKeys.length || componentKeys.some((key) => !Number.isInteger(componentsValue[key]) || !isFiniteNumber(componentsValue[key]))) {
    throw new Error(`Ongeldige topiccomponenten voor ${id}/${sequence}`);
  }
  const components = value.components as unknown as PriorityTopicComponents;
  if (components.topic_relevantie !== value.topicRelevance || value.score !== topicScore(components, adjustment)) {
    throw new Error(`Topicscorecomponenten kloppen niet voor ${id}/${sequence}`);
  }
  return true;
}

function validateCoreInterestPriorityOutput(value: unknown): value is CoreInterestPriority {
  if (!isRecord(value) || value.version !== 1 || typeof value.generatedAt !== "string" || !Array.isArray(value.order) || !isRecord(value.weights) || !Array.isArray(value.entries)) {
    return false;
  }
  const order: unknown[] = value.order;
  const weights: Record<string, unknown> = value.weights;
  const entries: unknown[] = value.entries;
  const interests = Object.keys(CORE_INTEREST_LABELS);
  if (order.length !== interests.length || new Set(order).size !== interests.length || !order.every((interest) => typeof interest === "string" && interests.includes(interest))) {
    return false;
  }
  if (Object.keys(weights).length !== interests.length || !interests.every((interest) => Object.hasOwn(weights, interest)) || Object.values(weights).some((weight) => !Number.isInteger(weight) || !isFiniteNumber(weight) || weight <= 0)) {
    return false;
  }
  if (entries.length !== interests.length) {return false;}
  return entries.every((entry, index) => {
    if (!isRecord(entry)) {return false;}
    const interest = order[index];
    if (typeof interest !== "string") {return false;}
    return entry.interest === interest && entry.label === CORE_INTEREST_LABELS[interest as keyof typeof CORE_INTEREST_LABELS] &&
      entry.rank === index + 1 && Number.isInteger(entry.weight) && isFiniteNumber(entry.weight) &&
      Number.isInteger(entry.evidenceDocumentCount) && isFiniteNumber(entry.evidenceDocumentCount) && entry.evidenceDocumentCount >= 0 &&
      Number.isInteger(entry.evidenceScore) && isFiniteNumber(entry.evidenceScore) && (entry.source === "manual" || entry.source === "derived") && entry.weight === weights[interest];
  });
}

function validateCoreInterestMatches(value: unknown): value is WeightedCoreInterestMatch[] {
  if (!Array.isArray(value)) {return false;}
  const seen = new Set<string>();
  return value.every((match) => {
    if (!isRecord(match) || typeof match.interest !== "string" || !Object.hasOwn(CORE_INTEREST_LABELS, match.interest) || seen.has(match.interest) || !Number.isInteger(match.weight) || !isFiniteNumber(match.weight) || match.weight <= 0 || !Number.isInteger(match.qualityScore) || !isFiniteNumber(match.qualityScore) || !Array.isArray(match.evidence)) {
      return false;
    }
    seen.add(match.interest);
    return match.evidence.every((evidence) => isRecord(evidence) && (evidence.kind === "readwise-tag" || evidence.kind === "semantic-signal") && typeof evidence.source === "string" && evidence.source.length > 0 && typeof evidence.label === "string" && evidence.label.length > 0);
  });
}

function validateGlobalScoreShape(id: string, value: unknown): value is PriorityExportItem {
  if (!isRecord(value) || !Number.isInteger(value.baseScore) || !isFiniteNumber(value.baseScore) || value.baseScore < 0 ||
      !Number.isInteger(value.adjustment) || !isFiniteNumber(value.adjustment) || !Number.isInteger(value.score) || !isFiniteNumber(value.score) || value.score < 0 ||
      !isRecord(value.components) || !isRecord(value.rationale) || !validateCoreInterestMatches(value.coreInterestMatches) ||
      !Array.isArray(value.sequences) || !isRecord(value.sequenceScores) || !isRecord(value.positions) || !isRecord(value.actualPositions)) {
    throw new Error(`Ongeldige v8-score voor ${id}`);
  }
  const components = value.components;
  const rationale = value.rationale;
  const coreInterestMatches = value.coreInterestMatches;
  const sequences: unknown[] = value.sequences;
  const positions = value.positions;
  const sequenceScores = value.sequenceScores;
  const componentKeys: PriorityComponentKey[] = ["kerninteresse", "relevantie", "substantie", "duurzaamheid", "bruikbaarheid", "leeskans", "nederlandse_taal", "aftrek"];
  if (!isRecord(components) || !isRecord(rationale) || !Array.isArray(sequences) || !isRecord(positions) || !isRecord(sequenceScores) ||
      Object.keys(components).length !== componentKeys.length || componentKeys.some((key) => !Number.isInteger(components[key]) || !isFiniteNumber(components[key]))) {
    throw new Error(`Ongeldige v8-componenten voor ${id}`);
  }
  if (Object.keys(rationale).length !== componentKeys.length || componentKeys.some((key) => {
    const entries = rationale[key];
    return !Array.isArray(entries) || !entries.every((entry: unknown) => typeof entry === "string");
  })) {
    throw new Error(`Ongeldige v8-rationale voor ${id}`);
  }
  if (value.adjustmentReason !== null && typeof value.adjustmentReason !== "string") {throw new Error(`Ongeldige correctiereden voor ${id}`);}
  if (value.judgmentConfidence !== "high" && value.judgmentConfidence !== "medium" && value.judgmentConfidence !== "low") {throw new Error(`Ongeldige judgment-confidence voor ${id}`);}
  let componentSum = 0;
  for (const key of componentKeys) {
    const component = components[key];
    if (typeof component !== "number") {throw new Error(`Ongeldige v8-component voor ${id}`);}
    componentSum += component;
  }
  if (value.baseScore !== floorScore(componentSum) || value.score !== floorScore(value.baseScore + value.adjustment)) {throw new Error(`V8-scorecomponenten kloppen niet voor ${id}`);}
  if (!validateCoreInterestMatches(coreInterestMatches)) {throw new Error(`Ongeldige kerninteresses voor ${id}`);}
  if (coreInterestMatches.reduce((sum, match) => sum + match.weight, 0) !== components.kerninteresse) {throw new Error(`Kerninteressebonus klopt niet voor ${id}`);}
  if (value.tier !== tierForScore(value.score)) {throw new Error(`Ongeldige v8-tier voor ${id}`);}
  if (value.judgmentSource !== "label" && value.judgmentSource !== "fallback") {throw new Error(`Ongeldige judgmentbron voor ${id}`);}
  for (const position of Object.values(value.actualPositions)) {
    if (!isFiniteNumber(position) || !Number.isInteger(position) || position < 1) {throw new Error(`Ongeldige actuele positie voor ${id}`);}
  }
  return true;
}

function validateV8ItemShape(id: string, value: unknown): value is PriorityExportItem {
  if (!isRecord(value) || !Array.isArray(value.sequences) || !isRecord(value.sequenceScores) || !isRecord(value.positions)) {
    throw new Error(`Ongeldig v8-item voor ${id}`);
  }
  const sequences = value.sequences;
  const typedSequences: PrioritySequence[] = [];
  for (const sequence of sequences) {
    if (typeof sequence !== "string" || !(SEQUENCE_ORDER as readonly string[]).includes(sequence)) {
      throw new Error(`Ongeldige v8-reeks voor ${id}`);
    }
    typedSequences.push(sequence as PrioritySequence);
  }
  if (new Set(typedSequences).size !== typedSequences.length || Object.keys(value.sequenceScores).length !== typedSequences.length || Object.keys(value.positions).length !== typedSequences.length) {
    throw new Error(`Reeksgegevens verschillen voor ${id}`);
  }
  for (const sequence of typedSequences) {
    sequenceScoreShape(value.sequenceScores[sequence], id, sequence, typeof value.adjustment === "number" ? value.adjustment : 0);
    const position = value.positions[sequence];
    if (!Number.isInteger(position) || !isFiniteNumber(position) || position < 1) {
      throw new Error(`Ongeldige v8-positie voor ${id}/${sequence}`);
    }
  }
  if (typedSequences.includes("boek") && typedSequences.length !== 1) {
    throw new Error(`Boek/EPUB ${id} hoort strikt alleen in de boek-reeks`);
  }
  return true;
}

export function validatePriorityExport(
  exportData: unknown,
  sourceDocuments: readonly PriorityDocument[] = [],
  overrides: PriorityExportOptions["overrides"] = {},
  judgments: PriorityExportOptions["judgments"] = {},
  coreInterestConfig?: CoreInterestPriorityConfig,
): boolean {
  if (!isRecord(exportData) || exportData.model !== PRIORITY_MODEL || exportData.scope !== "later" || typeof exportData.generatedAt !== "string" || !isRecord(exportData.items)) {
    throw new Error(`Ongeldig ${PRIORITY_MODEL}-export`);
  }
  for (const [id, value] of Object.entries(exportData.items)) {
    validateV8ItemShape(id, value);
    validateGlobalScoreShape(id, value);
  }
  const typedItems = exportData.items as Record<string, PriorityExportItem>;
  for (const sequence of SEQUENCE_ORDER) {
    const positions = Object.values(typedItems)
      .filter((item) => item.sequences.includes(sequence))
      .map((item) => item.positions[sequence])
      .filter((position): position is number => typeof position === "number")
      .sort((a, b) => a - b);
    positions.forEach((position, index) => {
      if (position !== index + 1) {throw new Error(`Posities voor ${sequence} zijn niet doorlopend`);}
    });
  }
  if (!validateCoreInterestPriorityOutput(exportData.coreInterestPriority)) {throw new Error("Ongeldige v8-kerninteresseprioriteit");}
  if (sourceDocuments.length > 0) {
    const expected = buildExpected(sourceDocuments, overrideMap(overrides), judgments, coreInterestConfig, exportData.generatedAt);
    if (JSON.stringify(exportData.items) !== JSON.stringify(expected.items) || JSON.stringify(exportData.coreInterestPriority) !== JSON.stringify(expected.coreInterestPriority)) {
      throw new Error("Priority-export volgt v8-score, kerninteresses, reeksen of volgorde niet");
    }
  }
  return true;
}
