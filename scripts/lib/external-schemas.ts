import { z } from "zod";

export const readwiseDocumentSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  site_name: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  reading_time: z.string().nullable().optional(),
  word_count: z.number().nullable().optional(),
  published_date: z.string().nullable().optional(),
  saved_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  reading_progress: z.number().nullable().optional(),
  tags: z.unknown().optional(),
});

export const readwiseDocumentsSchema = z.looseObject({
  results: z.array(readwiseDocumentSchema),
  nextPageCursor: z.string().nullable().optional(),
});

export const resendEmailResponseSchema = z.object({
  id: z.string().min(1),
});

export type ReadwiseDocument = z.infer<typeof readwiseDocumentSchema>;
export type ReadwiseDocuments = z.infer<typeof readwiseDocumentsSchema>;

export function parseReadwiseDocumentPage(input: unknown): { documents: ReadwiseDocument[]; nextPageCursor: string | null } {
  if (Array.isArray(input)) {
    return { documents: z.array(readwiseDocumentSchema).parse(input), nextPageCursor: null };
  }
  const page = readwiseDocumentsSchema.parse(input);
  return { documents: page.results, nextPageCursor: page.nextPageCursor ?? null };
}
