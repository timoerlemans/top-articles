import { z } from "zod";

const nullableString = z.string().nullable();

export const ArticleItemSchema = z.object({
  position: z.number().int().nullable(),
  id: z.string().min(1),
  title: z.string(),
  author: nullableString,
  siteName: nullableString,
  category: nullableString,
  language: nullableString,
  readingTime: nullableString,
  readingMinutes: z.number().nullable(),
  wordCount: z.number().nullable(),
  publishedDate: nullableString,
  savedDate: nullableString,
  imageUrl: nullableString,
  sourceUrl: nullableString,
  readwiseUrl: nullableString,
  summary: nullableString,
  whyRead: nullableString,
  bestMoment: nullableString,
  tags: z.array(z.string()),
  alsoIn: z.array(z.string()),
}).loose();

const articleListSchema = z.object({ tag: z.string(), items: z.array(ArticleItemSchema) }).loose();
const derivedListSchema = z.object({
  id: z.string().min(1), label: z.string(),
  items: z.array(z.object({ id: z.string().min(1), title: z.string(), position: z.number().int().positive() }).loose()),
}).loose();

export const TopArticlesSchema = z.object({
  generatedAt: z.string(),
  families: z.array(z.object({
    id: z.string().min(1), label: z.string(),
    lists: z.object({ "top-10": articleListSchema, "top-100": articleListSchema }),
  }).loose()).min(1),
  catalog: z.object({ items: z.array(ArticleItemSchema) }).loose(),
  derivedLists: z.record(z.string(), derivedListSchema),
}).loose();

const priorityComponentsSchema = z.object({
  kerninteresse: z.number(), diepgang: z.number(), persoonlijke_bruikbaarheid: z.number(),
  leeskans: z.number(), onderscheidende_duurzame_waarde: z.number(), aftrek: z.number(),
});
const priorityRationaleSchema = z.object({
  kerninteresse: z.array(z.string()), diepgang: z.array(z.string()), persoonlijke_bruikbaarheid: z.array(z.string()),
  leeskans: z.array(z.string()), onderscheidende_duurzame_waarde: z.array(z.string()), aftrek: z.array(z.string()),
});

export const PriorityItemSchema = z.object({
  baseScore: z.number(), adjustment: z.number(), adjustmentReason: nullableString, score: z.number(), tier: z.string(),
  components: priorityComponentsSchema, rationale: priorityRationaleSchema, sequences: z.array(z.string()),
  positions: z.record(z.string(), z.number().int()), actualPositions: z.record(z.string(), z.number().int()),
}).loose();

export const TopArticlePrioritySchema = z.object({
  generatedAt: z.string(), model: z.literal("readwise-priority-v3"), scope: z.literal("later"),
  items: z.record(z.string(), PriorityItemSchema),
}).loose();

export type ArticleItem = z.infer<typeof ArticleItemSchema>;
export type ArticleFamily = z.infer<typeof TopArticlesSchema>["families"][number];
export type ArticleList = ArticleFamily["lists"]["top-10"];
export type PriorityItem = z.infer<typeof PriorityItemSchema>;
