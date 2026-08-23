import type { PrioritySequence } from "../../scripts/lib/readwise-priority-v3.js";

export interface ArticleItem {
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
  alsoIn: string[];
  priorityPosition?: number;
  memberships?: Array<{ familyId: string; size: string; position: number }>;
}

export interface ArticleList { tag: string; items: ArticleItem[]; }
export interface ArticleFamily { id: string; label: string; lists: { "top-10": ArticleList; "top-100": ArticleList }; }
export interface TopArticles { generatedAt: string; families: ArticleFamily[]; catalog: { items: ArticleItem[] }; derivedLists: Record<string, { id: string; label: string; items: Array<{ id: string; title: string; position: number }> }>; }
export type PriorityComponentKey = "kerninteresse" | "diepgang" | "persoonlijke_bruikbaarheid" | "leeskans" | "onderscheidende_duurzame_waarde" | "aftrek";
export interface PriorityItem { baseScore: number; adjustment: number; adjustmentReason: string | null; score: number; tier: string; components: Record<PriorityComponentKey, number>; rationale: Record<PriorityComponentKey, string[]>; sequences: PrioritySequence[]; positions: Partial<Record<PrioritySequence, number>>; actualPositions: Partial<Record<PrioritySequence, number>>; }
export interface TopArticlePriority { generatedAt: string; model: "readwise-priority-v3"; scope: "later"; items: Record<string, PriorityItem>; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isArticleItem(value: unknown): value is ArticleItem {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.title !== "string") {
    return false;
  }
  const nullableFields = ["author", "siteName", "category", "language", "readingTime", "publishedDate", "savedDate", "imageUrl", "sourceUrl", "readwiseUrl", "summary", "whyRead", "bestMoment"];
  return (typeof value.position === "number" || value.position === null)
    && (typeof value.readingMinutes === "number" || value.readingMinutes === null)
    && (typeof value.wordCount === "number" || value.wordCount === null)
    && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")
    && Array.isArray(value.alsoIn) && value.alsoIn.every((tag) => typeof tag === "string")
    && nullableFields.every((field) => isNullableString(value[field]));
}

function isArticleList(value: unknown): value is ArticleList {
  return isRecord(value) && typeof value.tag === "string" && Array.isArray(value.items) && value.items.every(isArticleItem);
}

// Controleert alleen de vorm (string/getal), niet of sequence-ids in de bekende SEQUENCE_ORDER-set
// zitten — data/score.js kan op een ander moment gegenereerd zijn dan de huidige TS-compilatie.
function isPriorityItem(value: unknown): value is PriorityItem {
  if (!isRecord(value) || typeof value.baseScore !== "number" || typeof value.adjustment !== "number" || typeof value.score !== "number" || typeof value.tier !== "string" || !isNullableString(value.adjustmentReason)) {
    return false;
  }
  return isRecord(value.components) && Object.values(value.components).every((component) => typeof component === "number")
    && isRecord(value.rationale) && Object.values(value.rationale).every((items) => Array.isArray(items) && items.every((item) => typeof item === "string"))
    && Array.isArray(value.sequences) && value.sequences.every((sequence) => typeof sequence === "string")
    && isRecord(value.positions) && Object.values(value.positions).every((position) => Number.isInteger(position))
    && isRecord(value.actualPositions) && Object.values(value.actualPositions).every((position) => Number.isInteger(position));
}

function isTopArticles(value: unknown): value is TopArticles {
  if (!isRecord(value) || typeof value.generatedAt !== "string" || !Array.isArray(value.families) || !isRecord(value.catalog) || !Array.isArray(value.catalog.items) || !isRecord(value.derivedLists)) {
    return false;
  }
  const families = value.families.every((family) => isRecord(family) && typeof family.id === "string" && typeof family.label === "string" && isRecord(family.lists) && isArticleList(family.lists["top-10"]) && isArticleList(family.lists["top-100"]));
  const derivedLists = Object.values(value.derivedLists).every((list) => isRecord(list) && typeof list.id === "string" && typeof list.label === "string" && Array.isArray(list.items) && list.items.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.title === "string" && Number.isInteger(item.position)));
  return families && value.catalog.items.every(isArticleItem) && derivedLists;
}

function isTopArticlePriority(value: unknown): value is TopArticlePriority {
  if (!isRecord(value) || typeof value.generatedAt !== "string" || value.model !== "readwise-priority-v3" || value.scope !== "later" || !isRecord(value.items)) {
    return false;
  }
  return Object.values(value.items).every(isPriorityItem);
}

export function parseTopArticles(value: unknown): TopArticles | null {
  return isTopArticles(value) ? value : null;
}

export function parseTopArticlePriority(value: unknown): TopArticlePriority | null {
  return isTopArticlePriority(value) ? value : null;
}
