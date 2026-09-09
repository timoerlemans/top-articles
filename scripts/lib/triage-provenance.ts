/**
 * Pure, fail-closed provenance rules for a future archive phase. This module
 * never reads a vault, changes Readwise, or writes content tags.
 */

export type ArchiveRecordKind = "automatic-archive" | "restored-to-later";
export type ArchiveDestination = "archive" | "later";
export type TriageReasonCode =
  | "automatic-archive"
  | "automatic-archive-after-enrichment"
  | "explicit-later-to-archive"
  | "restored-to-later";

export interface TriageLogInput {
  path: string;
  text: string;
}

export interface TriageDocument {
  id: string;
  title: string | null;
  /** A stable human-readable publisher/source when available. */
  source: string | null;
  sourceUrl: string | null;
}

export interface ArchiveLogRecord {
  kind: ArchiveRecordKind;
  logPath: string;
  line: number;
  evidenceText: string;
  title?: string;
  source?: string;
  sourceUrl?: string;
  documentId?: string;
  originalLocation: string | null;
  destination: ArchiveDestination;
  date: string | null;
  triageReasonCode: TriageReasonCode;
}

/**
 * Metadata/log data for a future archive operation. It deliberately has no
 * tag field: provenance must not be stored in Reader content tags.
 */
export interface ArchiveProvenanceMarker {
  model: "readwise-archive-provenance-v1";
  documentId: string;
  source: string | null;
  originalLocation: string | null;
  destination: "archive";
  date: string;
  triageReasonCode: Exclude<TriageReasonCode, "restored-to-later">;
  evidence: {
    logPath: string;
    line: number;
    text: string;
  };
}

export type ArchiveMatchMethod = "document-id" | "source-url" | "title-and-source";
export type ArchiveMatchRejection =
  | "document-id-not-found"
  | "ambiguous-document-id"
  | "source-url-not-found"
  | "ambiguous-source-url"
  | "missing-stable-identity"
  | "title-and-source-not-found"
  | "ambiguous-title-and-source";

export type ArchiveRecordMatch =
  | { status: "matched"; document: TriageDocument; matchedBy: ArchiveMatchMethod }
  | { status: "rejected"; reason: ArchiveMatchRejection };

export interface MatchedArchiveRecord {
  record: ArchiveLogRecord;
  document: TriageDocument;
  matchedBy: ArchiveMatchMethod;
}

export type ArchiveEligibility =
  | { eligible: true }
  | { eligible: false; reason: "restored-to-later" | "not-automatic-archive" };
export type ArchiveEligibilityRejection = "restored-to-later" | "not-automatic-archive";

export interface ArchiveProvenanceResolution {
  accepted: MatchedArchiveRecord[];
  rejected: Array<{ record: ArchiveLogRecord; reason: ArchiveMatchRejection | ArchiveEligibilityRejection }>;
}

const AUTOMATIC_ARCHIVE = /\b(?:automatically archived(?:\s+after\s+(?:enrichment|processing))?|automatisch gearchiveerd(?:\s+na\s+(?:enrichment|verrijking|verwerking))?)\b/i;
const AUTOMATIC_ARCHIVE_AFTER_ENRICHMENT = /\b(?:automatically archived\s+after\s+enrichment|automatisch gearchiveerd\s+na\s+(?:enrichment|verrijking))\b/i;
const LATER_TO_ARCHIVE = /\b`?later`?\s*(?:→|->|naar)\s*`?(?:archive|archief)`?\b/i;
const RESTORED_TO_LATER = /\b(?:restored|returned|moved|set|teruggezet|hersteld|verplaatst)\b[\s\S]{0,100}\b(?:to|naar)\s*`?later`?\b/i;
const URL = /https?:\/\/[^\s<>()`|]+/gi;
const READER_URL = /https?:\/\/read\.readwise\.io\/read\/([^/?#\s`|]+)/i;

function trimCell(value: string): string {
  return value.trim().replace(/^`|`$/g, "");
}

function splitMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }
  const cells = trimmed.slice(1, -1).split("|").map(trimCell);
  if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return null;
  }
  return cells;
}

function titleForLine(line: string, cells: readonly string[] | null): string | undefined {
  if (cells && cells.length > 0) {
    const title = cells[0];
    return title ? title : undefined;
  }
  const bold = line.match(/^\s*[-*+]\s+\*\*(.+?)\*\*/);
  if (bold?.[1]) {
    return bold[1].trim();
  }
  const bullet = line.match(/^\s*[-*+]\s+(.+?)\s+[—–-]\s+/);
  return bullet?.[1]?.trim();
}

function locationForLine(line: string, cells: readonly string[] | null): string | null {
  if (cells && cells.length > 1) {
    return cells[1] || null;
  }
  const match = line.match(/\b(?:locatie|location|vorige locatie|previous location)\s*:\s*`?([a-z-]+)`?/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function sourceForLine(line: string): string | undefined {
  const match = line.match(/\b(?:source|bron)\s*:\s*([^|\n]+)/i);
  const source = match?.[1]?.trim();
  if (!source || /^https?:\/\//i.test(source)) {
    return undefined;
  }
  return source;
}

function identifiersForLine(line: string): { documentId?: string; sourceUrl?: string } {
  const urls = line.match(URL) ?? [];
  const readerUrl = urls.find((url) => READER_URL.test(url));
  const documentId = readerUrl?.match(READER_URL)?.[1];
  const sourceUrl = urls.find((url) => !READER_URL.test(url));
  return {
    ...(documentId ? { documentId } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

function dateForPath(path: string): string | null {
  return path.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? null;
}

function recordForLine(input: TriageLogInput, line: string, lineNumber: number): ArchiveLogRecord | null {
  const cells = splitMarkdownTableRow(line);
  if (!cells && !line.trim().startsWith("-")) {
    return null;
  }
  const restored = RESTORED_TO_LATER.test(line);
  const automaticArchive = AUTOMATIC_ARCHIVE.test(line);
  const explicitLaterToArchive = LATER_TO_ARCHIVE.test(line);
  if (!restored && !automaticArchive && !explicitLaterToArchive) {
    return null;
  }

  const kind: ArchiveRecordKind = restored ? "restored-to-later" : "automatic-archive";
  const triageReasonCode: TriageReasonCode = restored
    ? "restored-to-later"
    : explicitLaterToArchive
      ? "explicit-later-to-archive"
      : AUTOMATIC_ARCHIVE_AFTER_ENRICHMENT.test(line)
        ? "automatic-archive-after-enrichment"
        : "automatic-archive";
  const title = titleForLine(line, cells);
  const source = sourceForLine(line);

  return {
    kind,
    logPath: input.path,
    line: lineNumber,
    evidenceText: line.trim(),
    ...(title ? { title } : {}),
    ...(source ? { source } : {}),
    ...identifiersForLine(line),
    originalLocation: locationForLine(line, cells),
    destination: restored ? "later" : "archive",
    date: dateForPath(input.path),
    triageReasonCode,
  };
}

/** Parses supplied log text only; callers own all filesystem access. */
export function parseTriageLogs(logs: readonly TriageLogInput[]): ArchiveLogRecord[] {
  return logs.flatMap((input) => input.text.split(/\r?\n/)
    .map((line, index) => recordForLine(input, line, index + 1))
    .filter((record): record is ArchiveLogRecord => record !== null));
}

/** Strict identity matching: never falls back to fuzzy titles. */
export function matchArchiveRecord(record: ArchiveLogRecord, documents: readonly TriageDocument[]): ArchiveRecordMatch {
  if (record.documentId) {
    const matches = documents.filter((document) => document.id === record.documentId);
    const document = matches[0];
    if (matches.length === 1 && document) {
      return { status: "matched", document, matchedBy: "document-id" };
    }
    return { status: "rejected", reason: matches.length === 0 ? "document-id-not-found" : "ambiguous-document-id" };
  }

  if (record.sourceUrl) {
    const matches = documents.filter((document) => document.sourceUrl === record.sourceUrl);
    const document = matches[0];
    if (matches.length === 1 && document) {
      return { status: "matched", document, matchedBy: "source-url" };
    }
    if (matches.length === 0) {
      return { status: "rejected", reason: "source-url-not-found" };
    }
    if (!record.title || !record.source) {
      return { status: "rejected", reason: "ambiguous-source-url" };
    }
  }

  if (!record.title || !record.source) {
    return { status: "rejected", reason: "missing-stable-identity" };
  }
  const matches = documents.filter((document) => document.title === record.title && document.source === record.source);
  const document = matches[0];
  if (matches.length === 1 && document) {
    return { status: "matched", document, matchedBy: "title-and-source" };
  }
  return { status: "rejected", reason: matches.length === 0 ? "title-and-source-not-found" : "ambiguous-title-and-source" };
}

/** The archive decision seam: matched evidence is still denied after a restore. */
export function decideArchiveEligibility(
  match: MatchedArchiveRecord,
  { restoredToLater }: { restoredToLater: boolean },
): ArchiveEligibility {
  if (match.record.kind !== "automatic-archive") {
    return { eligible: false, reason: "not-automatic-archive" };
  }
  if (restoredToLater) {
    return { eligible: false, reason: "restored-to-later" };
  }
  return { eligible: true };
}

function matchesDocument(record: ArchiveLogRecord, document: TriageDocument, documents: readonly TriageDocument[]): boolean {
  const match = matchArchiveRecord(record, documents);
  return match.status === "matched" && match.document.id === document.id;
}

/** Resolves records into the only documents a future apply phase may consider. */
export function resolveArchiveProvenance(
  records: readonly ArchiveLogRecord[],
  documents: readonly TriageDocument[],
): ArchiveProvenanceResolution {
  const accepted: MatchedArchiveRecord[] = [];
  const rejected: ArchiveProvenanceResolution["rejected"] = [];
  const restores = records.filter((record) => record.kind === "restored-to-later");

  for (const record of records) {
    if (record.kind !== "automatic-archive") {
      continue;
    }
    const result = matchArchiveRecord(record, documents);
    if (result.status === "rejected") {
      rejected.push({ record, reason: result.reason });
      continue;
    }
    const match: MatchedArchiveRecord = { record, document: result.document, matchedBy: result.matchedBy };
    const eligibility = decideArchiveEligibility(match, {
      restoredToLater: restores.some((restore) => matchesDocument(restore, result.document, documents)),
    });
    if (eligibility.eligible) {
      accepted.push(match);
    } else {
      rejected.push({ record, reason: eligibility.reason });
    }
  }
  return { accepted, rejected };
}

/** Only explicit triage outcomes can decide a location; unknown text stays undecided. */
export function archiveDestinationForRecommendation(recommendation: string): ArchiveDestination | null {
  switch (recommendation.trim().toLocaleLowerCase("nl-NL")) {
    case "later":
    case "shortlist":
    case "must-read":
      return "later";
    case "archiveren":
      return "archive";
    default:
      return null;
  }
}
