import { createHash } from "node:crypto";

import { readwiseDocumentSchema } from "./external-schemas.js";
import type { PriorityDocument } from "./priority-document.js";
import { judgmentSourceFingerprint } from "./priority-judgments.js";
import type { ReadwiseExecutor } from "./readwise-request.js";

// Optional metadata must not prevent access to an otherwise valid source string.
const reviewDetailsSchema = readwiseDocumentSchema.pick({ id: true });

export interface ReviewSource {
  version: 1;
  documentId: string;
  sourceFingerprint: string;
  contentHash: string | null;
  content: string | null;
  fetchedAt: string;
  availability: "available" | "missing" | "error";
  limitations: string[];
}

/** Hash the exact Markdown bytes, without trimming or Unicode normalization. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function positiveWordCount(value: unknown): number | null {
  const count = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(count) && count > 0 ? count : null;
}

function sourceLimitations(content: string, details: Record<string, unknown>, doc: PriorityDocument): string[] {
  const limitations = ["Source checks are indicative; Codex must assess completeness."];
  const paywall = /\b(?:paywall|subscribe to (?:unlock|continue|read)|keep reading with a free trial|upgrade to paid|paid subscribers only|abonneer (?:je|u) om)\b/i;
  const truncated = /\[(?:(?:content|text)\s+)?truncated\]|\b(?:content|text|response)\s+(?:(?:has been|was|is)\s+)?truncated\b|\[\.{3}\]|\[…\]/i;
  if (paywall.test(content) || details.is_paywalled === true || details.paywall === true) {
    limitations.push("Possible paywall or subscription gate detected; Codex must assess accessible coverage.");
  }
  if (truncated.test(content) || details.truncated === true || details.is_truncated === true || details.has_more === true) {
    limitations.push("Possible truncation detected; the returned text may be an excerpt.");
  }

  const expectedWords = positiveWordCount(details.word_count) ?? positiveWordCount(doc.word_count);
  // A large shortfall is only a hint: Markdown and Reader word counts are not directly comparable.
  if (expectedWords !== null && content.trim().split(/\s+/u).length < expectedWords / 2) {
    limitations.push("Returned text has fewer than half the metadata word_count; possible incomplete source (indicative only).");
  }

  const categories = new Set([doc.category, details.category].map((value) => typeof value === "string" ? value.trim().toLowerCase() : ""));
  if (categories.has("epub")) {
    limitations.push("EPUB chapter coverage and completeness must be assessed by Codex from the returned source.");
  }
  if (categories.has("video")) {
    limitations.push("Video text may omit visual information or contain only shownotes; Codex must assess coverage.");
  }
  if (categories.has("pdf")) {
    limitations.push("PDF text may omit figures, tables, or page content; Codex must assess coverage.");
  }
  return limitations;
}

function emptySource(doc: PriorityDocument, fetchedAt: string): ReviewSource {
  return {
    version: 1,
    documentId: doc.id ?? "",
    sourceFingerprint: judgmentSourceFingerprint(doc),
    contentHash: null,
    content: null,
    fetchedAt,
    availability: "error",
    limitations: [],
  };
}

/** Parse either a bulk snapshot record or document details without I/O or completeness claims. */
export function reviewSourceFromDetails(doc: PriorityDocument, details: unknown, fetchedAt: string): ReviewSource {
  const source = emptySource(doc, fetchedAt);
  if (!source.documentId.trim()) {
    return { ...source, limitations: ["Document ID is missing; source was not requested."] };
  }
  const parsed = reviewDetailsSchema.safeParse(details);
  if (!parsed.success) {
    return { ...source, limitations: ["Reader source response was invalid; response details withheld for privacy."] };
  }
  const record = parsed.data;
  if (record.id !== source.documentId) {
    return { ...source, limitations: ["Reader response ID did not match the requested document; source discarded."] };
  }
  if (record.content === undefined || record.content === null || (typeof record.content === "string" && !record.content.trim())) {
    return { ...source, availability: "missing", limitations: ["Reader returned no nonempty Markdown content."] };
  }
  if (typeof record.content !== "string") {
    return { ...source, limitations: ["Reader source content was not a Markdown string; source discarded."] };
  }
  return {
    ...source,
    availability: "available",
    content: record.content,
    contentHash: contentHash(record.content),
    limitations: sourceLimitations(record.content, record, doc),
  };
}

/** Read-only retrieval; callers can inject their existing paced/cached executor. */
export async function fetchReviewSource(
  runReadwise: ReadwiseExecutor<{ stdout: string }>,
  doc: PriorityDocument,
  now: () => string = () => new Date().toISOString(),
): Promise<ReviewSource> {
  const fetchedAt = now();
  if (!doc.id?.trim()) {
    return reviewSourceFromDetails(doc, null, fetchedAt);
  }
  let stdout: string;
  try {
    ({ stdout } = await runReadwise(["reader-get-document-details", "--document-id", doc.id, "--json"]));
  } catch {
    // CLI errors can embed credentials, response bodies, URLs, and private notes.
    return { ...emptySource(doc, fetchedAt), limitations: ["Reader source request failed; error details withheld for privacy."] };
  }
  let input: unknown;
  try {
    input = JSON.parse(stdout) as unknown;
  } catch {
    return { ...emptySource(doc, fetchedAt), limitations: ["Reader source response was not valid JSON; response details withheld for privacy."] };
  }
  return reviewSourceFromDetails(doc, input, fetchedAt);
}
