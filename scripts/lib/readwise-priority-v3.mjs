import {
  detectDutch,
  scorePriorityDocument as scoreBaseDocument,
  sequencesForDocument as baseSequencesForDocument,
} from "./readwise-priority-v2.mjs";

export { detectDutch } from "./readwise-priority-v2.mjs";

export const PRIORITY_MODEL = "readwise-priority-v3";
export const SEQUENCE_ORDER = [
  "video",
  "boek",
  "pdf",
  "lees",
  "dutch",
  "short",
  "short-dutch",
  "luchtig",
  "luchtig-nederlands",
];

const LIGHT_TOPIC_TAGS = new Set([
  "arts & culture",
  "fiction",
  "games",
  "food & cooking",
  "sports & recreation",
  "entertainment & pop culture",
]);

const TIER_ORDER = { hoog: 0, midden: 1, laag: 2 };
const COMPONENT_KEYS = [
  "kerninteresse",
  "diepgang",
  "persoonlijke_bruikbaarheid",
  "leeskans",
  "onderscheidende_duurzame_waarde",
  "aftrek",
];

function tagsFor(doc) {
  if (!doc?.tags) return [];
  return (Array.isArray(doc.tags) ? doc.tags : Object.keys(doc.tags))
    .map((tag) => typeof tag === "string" ? tag : tag?.name ?? tag?.key ?? "")
    .map((tag) => tag.toLowerCase().trim())
    .filter(Boolean);
}

function tierForScore(score) {
  if (score >= 70) return "hoog";
  if (score >= 40) return "midden";
  return "laag";
}

function clamp(score) {
  return Math.max(0, Math.min(100, score));
}

function validateOverride(override = {}) {
  const adjustment = override.adjustment ?? 0;
  const reason = String(override.reason ?? "").trim();
  if (!Number.isInteger(adjustment)) throw new Error("Handmatige scorecorrectie moet een geheel getal zijn");
  if (adjustment !== 0 && !reason) throw new Error("Handmatige scorecorrectie vereist een reden");
  return { adjustment, reason: reason || null };
}

export function validatePriorityOverrides(config) {
  if (config?.version !== 1) throw new Error(`Ongeldige overrideversie: ${config?.version}`);
  if (!config.items || typeof config.items !== "object" || Array.isArray(config.items)) throw new Error("Overrideconfig mist items");
  for (const [id, override] of Object.entries(config.items)) {
    if (!id) throw new Error("Overrideconfig bevat een leeg document-ID");
    validateOverride(override);
  }
  return true;
}

export function scorePriorityDocument(doc, override = {}) {
  const base = scoreBaseDocument(doc);
  const { adjustment, reason } = validateOverride(override);
  const baseScore = base.score;
  const score = clamp(baseScore + adjustment);
  return {
    baseScore,
    adjustment,
    adjustmentReason: reason,
    score,
    tier: tierForScore(score),
    components: base.components,
    rationale: base.rationale,
  };
}

export function sequencesForDocument(doc) {
  const sequences = new Set(baseSequencesForDocument(doc));
  if (!sequences.has("boek")) {
    const tags = new Set(tagsFor(doc));
    const lightReading = tags.has("light-reading") || [...tags].some((tag) =>
      /^luchtig-\d{3,4}$/.test(tag) || tag === "aaa-luchtig-top-10" || tag === "aaa-luchtig-top-100" || LIGHT_TOPIC_TAGS.has(tag)
    );
    if (lightReading) {
      sequences.add("luchtig");
      if (detectDutch(doc)) sequences.add("luchtig-nederlands");
    }
  }
  return SEQUENCE_ORDER.filter((sequence) => sequences.has(sequence));
}

function positionPattern(sequence) {
  return sequence === "lees"
    ? new RegExp(`^${sequence}-([0-9]{4})$`)
    : new RegExp(`^${sequence}-([0-9]{3,4})$`);
}

export function actualPositionsForDocument(doc) {
  const positions = {};
  for (const sequence of SEQUENCE_ORDER) {
    const pattern = positionPattern(sequence);
    const matches = tagsFor(doc).map((tag) => tag.match(pattern)).filter(Boolean);
    if (matches.length > 1) throw new Error(`Document ${doc.id} heeft meerdere ${sequence}-tags`);
    if (matches.length === 1) positions[sequence] = Number.parseInt(matches[0][1], 10);
  }
  return positions;
}

export function comparePriorityItems(a, b, savedAtById) {
  return (
    b.item.score - a.item.score ||
    savedAtById.get(a.id) - savedAtById.get(b.id) ||
    a.id.localeCompare(b.id)
  );
}

export function buildPriorityExport(documents, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  if (options.overrides?.version !== undefined) validatePriorityOverrides(options.overrides);
  const overrides = options.overrides?.items ?? options.overrides ?? {};
  const items = {};
  const savedAtById = new Map();

  for (const doc of documents) {
    if (!doc?.id) throw new Error("Priority-document mist een Readwise document-id");
    if (Object.hasOwn(items, doc.id)) throw new Error(`Dubbel priority-document: ${doc.id}`);
    const savedAt = Date.parse(doc.saved_at ?? "");
    if (!Number.isFinite(savedAt)) throw new Error(`Document ${doc.id} heeft geen geldige saved_at`);
    savedAtById.set(doc.id, savedAt);
    items[doc.id] = {
      ...scorePriorityDocument(doc, overrides[doc.id]),
      sequences: sequencesForDocument(doc),
      positions: {},
      actualPositions: actualPositionsForDocument(doc),
    };
  }

  for (const sequence of SEQUENCE_ORDER) {
    const ranked = Object.entries(items)
      .filter(([, item]) => item.sequences.includes(sequence))
      .map(([id, item]) => ({ id, item }))
      .sort((a, b) => comparePriorityItems(a, b, savedAtById));
    ranked.forEach(({ id }, index) => { items[id].positions[sequence] = index + 1; });
  }

  const result = { generatedAt, model: PRIORITY_MODEL, scope: "later", items };
  validatePriorityExport(result, documents, overrides);
  return result;
}

export function validatePriorityExport(exportData, sourceDocuments = [], overrides = {}) {
  if (exportData?.model !== PRIORITY_MODEL) throw new Error(`Ongeldig priority-model: ${exportData?.model}`);
  if (exportData?.scope !== "later") throw new Error(`Ongeldige priority-scope: ${exportData?.scope}`);
  if (!exportData.items || typeof exportData.items !== "object") throw new Error("Priority-export mist items");

  for (const [id, item] of Object.entries(exportData.items)) {
    if (!Number.isInteger(item.baseScore) || item.baseScore < 0 || item.baseScore > 100) throw new Error(`Ongeldige basisscore voor ${id}`);
    if (!Number.isInteger(item.adjustment)) throw new Error(`Ongeldige scorecorrectie voor ${id}`);
    if (item.adjustment !== 0 && !item.adjustmentReason) throw new Error(`Scorecorrectie voor ${id} mist een reden`);
    if (!Number.isInteger(item.score) || item.score !== clamp(item.baseScore + item.adjustment)) throw new Error(`Ongeldige score voor ${id}`);
    if (item.tier !== tierForScore(item.score)) throw new Error(`Ongeldige tier voor ${id}`);
    if (!item.components || COMPONENT_KEYS.some((key) => !Number.isFinite(item.components[key]))) throw new Error(`Ongeldige componenten voor ${id}`);
    if (!Array.isArray(item.sequences) || new Set(item.sequences).size !== item.sequences.length) throw new Error(`Ongeldige reeksen voor ${id}`);
    if (item.sequences.includes("boek") && item.sequences.length !== 1) throw new Error(`Boek/EPUB ${id} hoort strikt alleen in de boek-reeks, niet in ${item.sequences.filter((s) => s !== "boek").join(", ")}`);
    if (Object.keys(item.positions).length !== item.sequences.length) throw new Error(`Posities en reeksen verschillen voor ${id}`);
  }

  for (const sequence of SEQUENCE_ORDER) {
    const positions = Object.values(exportData.items)
      .filter((item) => item.sequences.includes(sequence))
      .map((item) => item.positions[sequence])
      .sort((a, b) => a - b);
    positions.forEach((position, index) => {
      if (position !== index + 1) throw new Error(`Posities voor ${sequence} zijn niet uniek en doorlopend vanaf 1`);
    });
  }

  if (sourceDocuments.length > 0) {
    const expected = buildExpected(sourceDocuments, overrides);
    if (JSON.stringify(exportData.items) !== JSON.stringify(expected)) throw new Error("Priority-export volgt score, reeksindeling of volgorde niet");
  }
  return true;
}

function buildExpected(documents, overrides) {
  const items = {};
  const savedAtById = new Map();
  for (const doc of documents) {
    if (!doc?.id || Object.hasOwn(items, doc.id)) throw new Error("Bron bevat documenten zonder ID of met dubbele IDs");
    const savedAt = Date.parse(doc.saved_at ?? "");
    if (!Number.isFinite(savedAt)) throw new Error(`Document ${doc.id} heeft geen geldige saved_at`);
    savedAtById.set(doc.id, savedAt);
    items[doc.id] = {
      ...scorePriorityDocument(doc, overrides[doc.id]),
      sequences: sequencesForDocument(doc),
      positions: {},
      actualPositions: actualPositionsForDocument(doc),
    };
  }
  for (const sequence of SEQUENCE_ORDER) {
    Object.entries(items)
      .filter(([, item]) => item.sequences.includes(sequence))
      .map(([id, item]) => ({ id, item }))
      .sort((a, b) => comparePriorityItems(a, b, savedAtById))
      .forEach(({ id }, index) => { items[id].positions[sequence] = index + 1; });
  }
  return items;
}
