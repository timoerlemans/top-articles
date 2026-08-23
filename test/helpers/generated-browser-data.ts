import { parseTopArticlePriority, parseTopArticles } from "../../src/types/browser-data.js";
import type { ArticleItem, TopArticles, TopArticlePriority } from "../../src/types/browser-data.js";

export type { ArticleItem as GeneratedArticle, TopArticles as GeneratedTopArticles, TopArticlePriority as GeneratedPriority };

export function isGeneratedTopArticles(value: unknown): value is TopArticles {
  return parseTopArticles(value) !== null;
}

export function isGeneratedPriority(value: unknown): value is TopArticlePriority {
  return parseTopArticlePriority(value) !== null;
}
