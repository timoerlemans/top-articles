export type GeneratedArticle = {
  id: string;
  savedDate: string;
  position?: number | null;
  [key: string]: unknown;
};

export type GeneratedList = { tag: string; items: GeneratedArticle[] };

export type GeneratedDerivedArticle = { id: string; [key: string]: unknown };

export type GeneratedTopArticles = {
  generatedAt: string;
  catalog: { items: GeneratedArticle[] };
  families: Array<{ id: string; lists: { "top-10": GeneratedList; "top-100": GeneratedList } }>;
  derivedLists: Record<string, { id: string; items: GeneratedDerivedArticle[] }>;
};

export type GeneratedPriority = {
  generatedAt: string;
  model: string;
  scope: string;
  items: Record<string, { score: number }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArticle(value: unknown): value is GeneratedArticle {
  return isRecord(value) && typeof value.id === "string" && typeof value.savedDate === "string";
}

function isDerivedArticle(value: unknown): value is GeneratedDerivedArticle {
  return isRecord(value) && typeof value.id === "string";
}

function isList(value: unknown): value is GeneratedList {
  return isRecord(value) && typeof value.tag === "string" && Array.isArray(value.items) && value.items.every(isArticle);
}

export function isGeneratedTopArticles(value: unknown): value is GeneratedTopArticles {
  if (!isRecord(value) || typeof value.generatedAt !== "string" || !isRecord(value.catalog)
    || !Array.isArray(value.catalog.items) || !value.catalog.items.every(isArticle)
    || !Array.isArray(value.families) || !isRecord(value.derivedLists)) {
    return false;
  }

  return value.families.every((family) => isRecord(family) && typeof family.id === "string"
    && isRecord(family.lists) && isList(family.lists["top-10"]) && isList(family.lists["top-100"]))
    && Object.values(value.derivedLists).every((list) => isRecord(list) && typeof list.id === "string"
      && Array.isArray(list.items) && list.items.every(isDerivedArticle));
}

export function isGeneratedPriority(value: unknown): value is GeneratedPriority {
  return isRecord(value) && typeof value.generatedAt === "string" && typeof value.model === "string"
    && typeof value.scope === "string" && isRecord(value.items)
    && Object.values(value.items).every((item) => isRecord(item) && typeof item.score === "number");
}
