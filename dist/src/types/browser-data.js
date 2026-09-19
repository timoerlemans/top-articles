const CORE_INTEREST_IDS = [
    "ai_ethiek", "filosofie", "ideologie", "geschiedenis", "sociologie", "schrijven",
    "speculatieve_fictie", "cultuur_games_film", "pkm", "zorgouderschap", "adhd", "agile",
];
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function isDirectDomain(value) {
    return typeof value === "string" && CORE_INTEREST_IDS.includes(value);
}
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
        && Array.isArray(value.coreInterests) && value.coreInterests.every((interest) => typeof interest === "string")
        && Array.isArray(value.alsoIn) && value.alsoIn.every((tag) => typeof tag === "string")
        && nullableFields.every((field) => isNullableString(value[field]));
}
function isArticleList(value) {
    return isRecord(value) && typeof value.tag === "string" && Array.isArray(value.items) && value.items.every(isArticleItem);
}
// Controleert alleen de vorm (string/getal), niet of sequence-ids in de bekende SEQUENCE_ORDER-set
// zitten — data/score.js kan op een ander moment gegenereerd zijn dan de huidige TS-compilatie.
function isCoreInterestPriority(value) {
    if (!isRecord(value) || value.version !== 1 || typeof value.generatedAt !== "string" || !Array.isArray(value.order) || !isRecord(value.weights) || !Array.isArray(value.entries)) {
        return false;
    }
    const order = value.order;
    const weights = value.weights;
    const entries = value.entries;
    if (order.length !== CORE_INTEREST_IDS.length || new Set(order).size !== CORE_INTEREST_IDS.length || !order.every(isDirectDomain)) {
        return false;
    }
    if (Object.keys(weights).length !== CORE_INTEREST_IDS.length || !CORE_INTEREST_IDS.every((interest) => isFiniteNumber(weights[interest]) && Number.isInteger(weights[interest]) && weights[interest] > 0)) {
        return false;
    }
    if (entries.length !== CORE_INTEREST_IDS.length) {
        return false;
    }
    return entries.every((entry, index) => {
        if (!isRecord(entry) || entry.interest !== order[index] || !isDirectDomain(entry.interest) || typeof entry.label !== "string" || entry.rank !== index + 1 || entry.weight !== weights[entry.interest] || !Number.isInteger(entry.evidenceDocumentCount) || typeof entry.evidenceDocumentCount !== "number" || entry.evidenceDocumentCount < 0 || !Number.isInteger(entry.evidenceScore) || (entry.source !== "manual" && entry.source !== "derived")) {
            return false;
        }
        return typeof entry.weight === "number" && Number.isInteger(entry.weight) && entry.weight > 0;
    });
}
function isCoreInterestMatch(value, priority) {
    if (!isRecord(value) || !isDirectDomain(value.interest) || !priority.order.includes(value.interest) || value.weight !== priority.weights[value.interest] || !Number.isInteger(value.weight) || value.weight <= 0 || !isFiniteNumber(value.qualityScore) || !Array.isArray(value.evidence)) {
        return false;
    }
    return value.evidence.every((evidence) => isRecord(evidence) && (evidence.kind === "readwise-tag" || evidence.kind === "semantic-signal") && typeof evidence.source === "string" && evidence.source.length > 0 && typeof evidence.label === "string" && evidence.label.length > 0);
}
function isPriorityItem(value, priority) {
    if (!isRecord(value) || !Number.isInteger(value.baseScore) || !isFiniteNumber(value.adjustment) || !Number.isInteger(value.adjustment) || !Number.isInteger(value.score) || typeof value.tier !== "string" || !isNullableString(value.adjustmentReason) || (value.judgmentSource !== "label" && value.judgmentSource !== "fallback") || (value.judgmentConfidence !== "high" && value.judgmentConfidence !== "medium" && value.judgmentConfidence !== "low") || !isRecord(value.components) || !isRecord(value.rationale) || !Array.isArray(value.coreInterestMatches)) {
        return false;
    }
    const components = value.components;
    const rationale = value.rationale;
    const matches = value.coreInterestMatches;
    const componentKeys = ["kerninteresse", "relevantie", "substantie", "duurzaamheid", "bruikbaarheid", "leeskans", "nederlandse_taal", "aftrek"];
    if (Object.keys(components).length !== componentKeys.length || componentKeys.some((key) => !isFiniteNumber(components[key]))) {
        return false;
    }
    if (Object.keys(rationale).length !== componentKeys.length || componentKeys.some((key) => {
        const entries = rationale[key];
        return !Array.isArray(entries) || !entries.every((entry) => typeof entry === "string");
    })) {
        return false;
    }
    if (new Set(matches.map((match) => isRecord(match) ? match.interest : null)).size !== matches.length || !matches.every((match) => isCoreInterestMatch(match, priority))) {
        return false;
    }
    if (matches.reduce((sum, match) => sum + (isRecord(match) && typeof match.weight === "number" ? match.weight : 0), 0) !== components.kerninteresse) {
        return false;
    }
    return Array.isArray(value.sequences) && value.sequences.every((sequence) => typeof sequence === "string")
        && isRecord(value.sequenceScores) && Object.values(value.sequenceScores).every(isFiniteNumber)
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
    if (!isRecord(value) || typeof value.generatedAt !== "string" || value.model !== "readwise-priority-v7" || value.scope !== "later" || !isRecord(value.items)) {
        return false;
    }
    const coreInterestPriority = value.coreInterestPriority;
    if (!isCoreInterestPriority(coreInterestPriority)) {
        return false;
    }
    return Object.values(value.items).every((item) => isPriorityItem(item, coreInterestPriority));
}
export function parseTopArticles(value) {
    return isTopArticles(value) ? value : null;
}
export function parseTopArticlePriority(value) {
    return isTopArticlePriority(value) ? value : null;
}
