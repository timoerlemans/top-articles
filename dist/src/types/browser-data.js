function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isNullableString(value) {
    return typeof value === "string" || value === null;
}
function isArticleItem(value) {
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
function isArticleList(value) {
    return isRecord(value) && typeof value.tag === "string" && Array.isArray(value.items) && value.items.every(isArticleItem);
}
function isPriorityItem(value) {
    if (!isRecord(value) || typeof value.baseScore !== "number" || typeof value.adjustment !== "number" || typeof value.score !== "number" || typeof value.tier !== "string" || !isNullableString(value.adjustmentReason)) {
        return false;
    }
    return isRecord(value.components) && Object.values(value.components).every((component) => typeof component === "number")
        && isRecord(value.rationale) && Object.values(value.rationale).every((items) => Array.isArray(items) && items.every((item) => typeof item === "string"))
        && Array.isArray(value.sequences) && value.sequences.every((sequence) => typeof sequence === "string")
        && isRecord(value.positions) && Object.values(value.positions).every((position) => Number.isInteger(position))
        && isRecord(value.actualPositions) && Object.values(value.actualPositions).every((position) => Number.isInteger(position));
}
function isTopArticles(value) {
    if (!isRecord(value) || typeof value.generatedAt !== "string" || !Array.isArray(value.families) || !isRecord(value.catalog) || !Array.isArray(value.catalog.items) || !isRecord(value.derivedLists)) {
        return false;
    }
    const families = value.families.every((family) => isRecord(family) && typeof family.id === "string" && typeof family.label === "string" && isRecord(family.lists) && isArticleList(family.lists["top-10"]) && isArticleList(family.lists["top-100"]));
    const derivedLists = Object.values(value.derivedLists).every((list) => isRecord(list) && typeof list.id === "string" && typeof list.label === "string" && Array.isArray(list.items) && list.items.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.title === "string" && Number.isInteger(item.position)));
    return families && value.catalog.items.every(isArticleItem) && derivedLists;
}
function isTopArticlePriority(value) {
    if (!isRecord(value) || typeof value.generatedAt !== "string" || value.model !== "readwise-priority-v3" || value.scope !== "later" || !isRecord(value.items)) {
        return false;
    }
    return Object.values(value.items).every(isPriorityItem);
}
export function parseTopArticles(value) {
    return isTopArticles(value) ? value : null;
}
export function parseTopArticlePriority(value) {
    return isTopArticlePriority(value) ? value : null;
}
