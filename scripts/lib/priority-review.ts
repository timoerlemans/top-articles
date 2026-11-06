import { createHash } from "node:crypto";
import { buildPriorityEvidence, judgmentMatchesSource, judgmentMatchesEvidence, validateContentJudgment } from "./priority-judgments.js";
import type { ContentJudgment } from "./priority-judgments.js";
import { AUTOMATED_FALLBACK_JUDGER } from "./priority-judgments.js";
import type { PriorityDocument } from "./priority-document.js";
import { TOPIC_SEQUENCE_ORDER } from "./priority-sequences.js";
import { reviewAssessmentSchema, SOURCE_REVIEW_STANDARD } from "./priority-review-standard.js";
import type { ReviewAssessment } from "./priority-review-standard.js";
import type { ReviewSource } from "./priority-review-source.js";

export function reviewHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireCompleteReading(ranges: readonly { start: number; end: number }[], length: number, label: string): void {
  let readUntil = 0;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (range.start > readUntil || range.end <= range.start || range.end > length) { throw new Error(`${label}: gaten of ongeldige bereiken in vastgelegde bronlezing`); }
    readUntil = Math.max(readUntil, range.end);
  }
  if (readUntil !== length) { throw new Error(`${label}: volledige bronlezing is niet vastgelegd`); }
}

export function sourceJudgmentIsCurrent(judgment: ContentJudgment | undefined, doc: PriorityDocument, source: ReviewSource, preferencesFingerprint: string): boolean {
  return judgment !== undefined && validateContentJudgment(judgment) && judgment.status === "accepted"
    && judgment.judgedBy !== AUTOMATED_FALLBACK_JUDGER && judgment.confidence !== "low"
    && judgmentMatchesSource(doc, judgment) && judgmentMatchesSource(doc, source)
    && judgmentMatchesEvidence(doc, buildPriorityEvidence(doc), judgment)
    && judgment.preferencesFingerprint === preferencesFingerprint
    && judgment.sourceReview?.standard === SOURCE_REVIEW_STANDARD && judgment.sourceReview.sourceStatus === "complete"
    && source.availability === "available" && source.content !== null
    && judgment.sourceReview.contentHash === reviewHash(source.content) && source.contentHash === judgment.sourceReview.contentHash
    && TOPIC_SEQUENCE_ORDER.every((topic) => judgment.topicRelevance?.[topic] !== undefined);
}

/** Validates recorded evidence; this cannot prove that a reviewer read attentively. */
export function acceptedReviewJudgment(
  doc: PriorityDocument, source: ReviewSource, value: unknown, preferencesFingerprint: string,
): ContentJudgment {
  const assessment = reviewAssessmentSchema.parse(value);
  if (assessment.status !== "accepted") { throw new Error("Een onvoltooide reviewpoging vervangt geen accepted judgment"); }
  if (assessment.documentId !== doc.id || source.documentId !== doc.id || !judgmentMatchesSource(doc, assessment) || !judgmentMatchesSource(doc, source)) {
    throw new Error("Review en bron horen niet bij de actuele documentmetadata");
  }
  if (assessment.preferencesFingerprint !== preferencesFingerprint) { throw new Error("Leesvoorkeuren veranderden; beoordeel de actuele preferences"); }
  if (!source.content || source.availability !== "available" || !source.contentHash || reviewHash(source.content) !== source.contentHash || assessment.contentHash !== source.contentHash) {
    throw new Error("Broncontenthash ontbreekt of veranderde");
  }
  if (assessment.sourceStatus !== "complete" || !assessment.thesis.trim()) { throw new Error("Accepted vereist complete bronlezing en een inhoudelijke these; onvolledige bron blijft draft"); }
  requireCompleteReading(assessment.readRanges, source.content.length, "Reader-bron");
  const additionalSources = new Map<string, string>();
  for (const additional of assessment.additionalSources ?? []) {
    if (additionalSources.has(additional.id)) { throw new Error(`Dubbel aanvullend bron-ID: ${additional.id}`); }
    if (reviewHash(additional.content) !== additional.contentHash) { throw new Error(`Aanvullende broncontenthash veranderde: ${additional.id}`); }
    requireCompleteReading(additional.readRanges, additional.content.length, `Aanvullende bron ${additional.id}`);
    additionalSources.set(additional.id, additional.content);
  }
  const dimensions = ["relevance", "substance", "durability", "usefulness", ...TOPIC_SEQUENCE_ORDER];
  if (assessment.dimensions.length !== dimensions.length || new Set(assessment.dimensions.map((d) => d.dimension)).size !== dimensions.length) {
    throw new Error("Onderbouw alle inhoudelijke dimensies precies eenmaal");
  }
  for (const dimension of dimensions) {
    const support = assessment.dimensions.find((entry) => entry.dimension === dimension);
    if (!support || support.passages.length === 0) { throw new Error(`Ontbrekende passageonderbouwing voor ${dimension}`); }
    for (const ref of support.passages) {
      const text = ref.sourceId === undefined ? source.content : additionalSources.get(ref.sourceId);
      if (text === undefined) { throw new Error(`Onbekende aanvullende bron voor ${dimension}: ${ref.sourceId}`); }
      if (ref.end <= ref.start || ref.end > text.length) { throw new Error(`Ongeldige passage voor ${dimension}`); }
    }
  }
  if (!assessment.judgment || typeof assessment.judgment !== "object" || Array.isArray(assessment.judgment)) { throw new Error("Accepted mist de Codex-beoordeling"); }
  const ratings = assessment.judgment as Record<string, unknown>;
  if (ratings.confidence !== "high" && ratings.confidence !== "medium") { throw new Error("Accepted vereist medium/high confidence; low blijft draft"); }
  if (ratings.confidence === "high" && (assessment.sourceStatus !== "complete" || Object.values(assessment.uncertainties).some((list) => list.length > 0))) {
    throw new Error("High vereist complete bronlezing zonder materiële resterende onzekerheid");
  }
  const evidence = buildPriorityEvidence(doc);
  const judgment = {
    relevance: ratings.relevance, substance: ratings.substance, durability: ratings.durability,
    usefulness: ratings.usefulness, topicRelevance: ratings.topicRelevance, sequenceFit: ratings.sequenceFit,
    confidence: ratings.confidence, reasonCodes: ["codex-full-source-review"],
    sourceFingerprint: evidence.sourceFingerprint, evidenceFingerprint: evidence.evidenceFingerprint,
    preferencesFingerprint, status: "accepted", rubricVersion: "semantic-v2",
    judgedBy: assessment.judgedBy, judgedAt: assessment.judgedAt,
    evidenceRefs: [`source-sha256:${source.contentHash}`, `assessment-sha256:${reviewHash(JSON.stringify(assessment))}`, ...(assessment.additionalSources ?? []).map((additional) => `additional-source-sha256:${additional.contentHash}`)],
    sourceReview: { standard: SOURCE_REVIEW_STANDARD, contentHash: source.contentHash, sourceStatus: assessment.sourceStatus, assessmentFingerprint: reviewHash(JSON.stringify(assessment)) },
  };
  if (!validateContentJudgment(judgment) || !TOPIC_SEQUENCE_ORDER.every((topic) => judgment.topicRelevance?.[topic] !== undefined)) {
    throw new Error("Ongeldige inhoudelijke ratings of ontbrekende topicrelevantie");
  }
  return judgment;
}

/** An honestly blocked attempt is finished work, but is never an accepted score. */
export function reviewAttemptIsCurrent(
  value: unknown, doc: PriorityDocument, source: ReviewSource, preferencesFingerprint: string,
): boolean {
  const parsed = reviewAssessmentSchema.safeParse(value);
  if (!parsed.success) { return false; }
  const a: ReviewAssessment = parsed.data;
  if (a.documentId !== doc.id || a.contentHash !== source.contentHash || a.preferencesFingerprint !== preferencesFingerprint || !judgmentMatchesSource(doc, a) || !judgmentMatchesSource(doc, source)) { return false; }
  if (a.status === "accepted") {
    try { acceptedReviewJudgment(doc, source, a, preferencesFingerprint); } catch { return false; }
  }
  return true;
}
