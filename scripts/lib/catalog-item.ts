import { classifyReaderDocument } from "./reader-document-classification.js";
import type { DirectDomain } from "./priority-document.js";
import type { ReadwiseDocument } from "./external-schemas.js";
import { publicReadingNotes } from "./reader-notes.js";

export interface CatalogItem {
  position: number | null;
  id: string;
  title: string;
  author: string | null;
  siteName: string | null;
  category: string | null;
  language: string | null;
  readingTime: string | null;
  readingMinutes: number | null;
  wordCount: number | null;
  publishedDate: string | null;
  savedDate: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  readwiseUrl: string | null;
  summary: string | null;
  whyRead: string | null;
  bestMoment: string | null;
  tags: string[];
  coreInterests: DirectDomain[];
  alsoIn: string[];
}

/** Convert one Reader document to the public catalog shape without exposing raw workflow data. */
export function toCatalogItem(doc: ReadwiseDocument, position: number | null): CatalogItem {
  const classification = classifyReaderDocument(doc);
  const { whyRead, bestMoment } = publicReadingNotes(doc.notes);

  return {
    position,
    id: doc.id,
    title: doc.title ?? "(zonder titel)",
    author: doc.author ?? null,
    siteName: doc.site_name ?? null,
    category: doc.category ?? null,
    language: classification.language,
    readingTime: doc.reading_time ?? null,
    readingMinutes: classification.readingMinutes,
    wordCount: doc.word_count ?? null,
    publishedDate: doc.published_date ?? null,
    savedDate: doc.saved_at ?? null,
    imageUrl: doc.image_url ?? null,
    sourceUrl: doc.source_url ?? null,
    readwiseUrl: doc.url ?? null,
    summary: doc.summary ?? null,
    whyRead,
    bestMoment,
    tags: [...classification.interestTags],
    coreInterests: [...classification.tagDomains],
    alsoIn: [],
  };
}
