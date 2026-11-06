import { z } from "zod";

export const SOURCE_REVIEW_STANDARD = "full-source-v1" as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);

// Public provenance only. Article text, passages and personal uncertainty stay private.
export const sourceReviewSchema = z.strictObject({
  standard: z.literal(SOURCE_REVIEW_STANDARD),
  contentHash: hash,
  sourceStatus: z.enum(["complete", "partial"]),
  assessmentFingerprint: hash,
});
export type SourceReview = z.infer<typeof sourceReviewSchema>;

const range = z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().positive() });
const sourceId = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const passage = range.extend({ sourceId: sourceId.optional() });
export const reviewAssessmentSchema = z.strictObject({
  version: z.literal(1),
  standard: z.literal(SOURCE_REVIEW_STANDARD),
  documentId: z.string().min(1),
  sourceFingerprint: hash,
  contentHash: hash.nullable(),
  preferencesFingerprint: hash,
  status: z.enum(["accepted", "draft", "rejected"]),
  sourceStatus: z.enum(["complete", "partial", "missing", "error"]),
  completenessReason: z.string().trim().min(1),
  readRanges: z.array(range),
  additionalSources: z.array(z.strictObject({
    id: sourceId,
    sourceUrl: z.url({ protocol: /^https?$/ }),
    fetchedAt: z.iso.datetime(),
    content: z.string().regex(/\S/, "Aanvullende tekstbron mag niet leeg zijn"),
    contentHash: hash,
    readRanges: z.array(range),
  })).optional(),
  thesis: z.string(),
  dimensions: z.array(z.strictObject({
    dimension: z.string().min(1), reason: z.string().trim().min(1), passages: z.array(passage),
  })),
  uncertainties: z.strictObject({ source: z.array(z.string().min(1)), interpretation: z.array(z.string().min(1)), personalFit: z.array(z.string().min(1)) }),
  reason: z.string().trim().min(1),
  judgedBy: z.string().trim().min(1),
  judgedAt: z.iso.datetime(),
  judgment: z.unknown().optional(),
});
export type ReviewAssessment = z.infer<typeof reviewAssessmentSchema>;
