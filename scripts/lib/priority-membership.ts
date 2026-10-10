import { baseSequencesForDocument, detectDutch } from "./priority-document.js";
import type { PriorityDocument } from "./priority-document.js";
import { SEQUENCE_ORDER } from "./priority-sequences.js";
import type { PrioritySequence } from "./priority-sequences.js";
import { canonicalInterestTags } from "./readwise-tags.js";
import { philosophyRelevanceFor } from "./philosophy-profile.js";

export type { PrioritySequence } from "./priority-sequences.js";

export type PriorityPositions = Partial<Record<PrioritySequence, number>>;
export interface PriorityComparisonItem<T extends { score: number } = { score: number }> { id: string; item: T; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const LIGHT_TOPIC_TAGS = new Set([
  "arts & culture",
  "fiction",
  "games",
  "health & wellness",
  "food & cooking",
  "sports & recreation",
  "entertainment & pop culture",
]);

// De Agile-familie is bewust smal: brede team-/organisatietags horen bij
// social-studies, tenzij er ook een directe Agile- of Scrum-master-indicatie is.
const SCRUM_TAGS = new Set(["scrum", "agile", "agile & scrum", "scrum & agile"]);
const SCRUM_MASTER_TAGS = new Set(["team coaching", "facilitation", "flow & delivery", "psm-ii"]);
const SOFTWARE_DEVELOPMENT_TAGS = new Set(["software development", "software-development", "programming & software"]);
const FRONT_END_DEVELOPMENT_TAGS = new Set([
  "front-end development", "frontend development", "front end development", "front-end-development", "accessibility",
]);
const SOCIAL_STUDIES_TAGS = new Set([
  "social psychology & interpersonal dynamics",
  "team dynamics & collaboration",
  "organizational behavior & culture",
  "behavioral psychology & coaching",
  "sociology & social structures",
  "team coaching",
  "facilitation",
  "organizational culture",
  "scrum",
  "agile",
  "product management",
  "flow & delivery",
]);
const ADHD_TAGS = new Set(["adhd", "adhd & neurodivergence"]);

function rawTags(tags: unknown): unknown[] {
  if (!tags) {
    return [];
  }
  if (Array.isArray(tags)) {
    return tags;
  }
  if ((typeof tags === "object" && tags !== null) || typeof tags === "function" || typeof tags === "string") {
    return Object.keys(tags);
  }
  return [];
}

function tagsFor(doc: PriorityDocument): string[] {
  return rawTags(doc.tags)
    .map((tag) => {
      if (typeof tag === "string") {
        return tag;
      }
      if (!isRecord(tag)) {
        return "";
      }
      const name = tag.name ?? tag.key;
      return typeof name === "string" ? name : "";
    })
    .map((tag) => tag.toLowerCase().trim())
    .filter(Boolean);
}

function contentTagsFor(doc: PriorityDocument): string[] {
  const rawTags = tagsFor(doc);
  return [...new Set([...rawTags, ...canonicalInterestTags(rawTags)])];
}

export function sequencesForDocument(doc: PriorityDocument): PrioritySequence[] {
  const sequences = new Set<PrioritySequence>(baseSequencesForDocument(doc));
  if (!sequences.has("boek")) {
    const tags = new Set(contentTagsFor(doc));
    const lightReading = tags.has("light-reading") || [...tags].some((tag) =>
      /^luchtig-\d{3,4}$/.test(tag) || tag === "aaa-luchtig-top-10" || tag === "aaa-luchtig-top-100" || LIGHT_TOPIC_TAGS.has(tag)
    );
    if (lightReading) {
      sequences.add("luchtig");
      if (detectDutch(doc)) {
        sequences.add("luchtig-nederlands");
      }
    }
    if ([...tags].some((tag) => SCRUM_TAGS.has(tag) || SCRUM_MASTER_TAGS.has(tag))) {
      sequences.add("scrum");
    }
    if ([...tags].some((tag) => SOFTWARE_DEVELOPMENT_TAGS.has(tag))) {
      sequences.add("software-development");
    }
    if ([...tags].some((tag) => FRONT_END_DEVELOPMENT_TAGS.has(tag))) {
      sequences.add("front-end-development");
    }
    if ([...tags].some((tag) => SOCIAL_STUDIES_TAGS.has(tag))) {
      sequences.add("social-studies");
    }
    if ([...tags].some((tag) => ADHD_TAGS.has(tag))) {
      sequences.add("adhd");
    }
    if (philosophyRelevanceFor(doc).relevance > 0) {
      sequences.add("philosophy");
    }
  }
  return SEQUENCE_ORDER.filter((sequence) => sequences.has(sequence));
}

function positionPattern(sequence: PrioritySequence): RegExp {
  return sequence === "lees"
    ? new RegExp(`^${sequence}-([0-9]{4})$`)
    : new RegExp(`^${sequence}-([0-9]{3,4})$`);
}

export function actualPositionsForDocument(doc: PriorityDocument): PriorityPositions {
  const positions: PriorityPositions = {};
  for (const sequence of SEQUENCE_ORDER) {
    const pattern = positionPattern(sequence);
    const matches = tagsFor(doc)
      .map((tag) => tag.match(pattern))
      .filter((match): match is RegExpMatchArray => match !== null);
    if (matches.length > 1) {
      throw new Error(`Document ${doc.id ?? "undefined"} heeft meerdere ${sequence}-tags`);
    }
    const position = matches[0]?.[1];
    if (position !== undefined) {
      positions[sequence] = Number.parseInt(position, 10);
    }
  }
  return positions;
}

export function comparePriorityItems<T extends { score: number }>(
  a: PriorityComparisonItem<T>,
  b: PriorityComparisonItem<T>,
  savedAtById: ReadonlyMap<string, number>,
): number {
  return (
    b.item.score - a.item.score ||
    (savedAtById.get(a.id) ?? Number.NaN) - (savedAtById.get(b.id) ?? Number.NaN) ||
    a.id.localeCompare(b.id)
  );
}

