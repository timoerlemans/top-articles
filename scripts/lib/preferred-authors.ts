import type { PriorityDocument, PriorityTagDescriptor } from "./priority-document.js";

export const PREFERRED_AUTHOR_WANT_TO_READ_TAG = "want-to-read" as const;

const PREFERRED_AUTHORS = new Map([
  ["henrik karlsson", "Henrik Karlsson"],
  ["eleanor konik", "Eleanor Konik"],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeAuthor(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function preferredAuthorFor(doc: Pick<PriorityDocument, "author">): string | null {
  return PREFERRED_AUTHORS.get(normalizeAuthor(doc.author)) ?? null;
}

export function isPreferredAuthor(doc: Pick<PriorityDocument, "author">): boolean {
  return preferredAuthorFor(doc) !== null;
}

function hasTag(doc: PriorityDocument, expected: string): boolean {
  const tags = doc.tags;
  const names = Array.isArray(tags)
    ? tags.map((tag) => typeof tag === "string" ? tag : isRecord(tag) ? tag.name ?? tag.key : null)
    : isRecord(tags) ? Object.keys(tags) : [];
  return names.some((tag) => typeof tag === "string" && tag.toLowerCase() === expected.toLowerCase());
}

/** Adds the automatic curation tag to an internal scoring copy without mutating the source document. */
export function withPreferredAuthorTag(doc: PriorityDocument): PriorityDocument {
  if (!isPreferredAuthor(doc) || hasTag(doc, PREFERRED_AUTHOR_WANT_TO_READ_TAG)) {
    return doc;
  }
  if (Array.isArray(doc.tags)) {
    const tags = Array.from(doc.tags as ReadonlyArray<string | PriorityTagDescriptor>);
    return { ...doc, tags: [...tags, PREFERRED_AUTHOR_WANT_TO_READ_TAG] };
  }
  if (isRecord(doc.tags)) {
    return { ...doc, tags: { ...doc.tags, [PREFERRED_AUTHOR_WANT_TO_READ_TAG]: {} } };
  }
  return { ...doc, tags: { [PREFERRED_AUTHOR_WANT_TO_READ_TAG]: {} } };
}
