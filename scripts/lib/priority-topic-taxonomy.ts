import type { PriorityDocument } from "./readwise-priority-v2.js";
import type { TopicSequence } from "./priority-sequences.js";

export const TOPIC_TAG_TAXONOMY_VERSION = 1 as const;

export type TopicTagStrength = "strong" | "medium" | "light";
export type TopicRelevanceRating = 0 | 1 | 2 | 4;

export interface TopicTagTaxonomyEntry {
  strong: readonly string[];
  medium: readonly string[];
  light: readonly string[];
}

export interface TopicTagTaxonomy {
  version: typeof TOPIC_TAG_TAXONOMY_VERSION;
  topics: Record<TopicSequence, TopicTagTaxonomyEntry>;
}

export interface TopicRelevanceFallback {
  relevance: TopicRelevanceRating;
  source: "fallback";
  confidence: "low";
  evidence: string[];
}

/**
 * Versioned deterministic fallback taxonomy. It supplies evidence for new or
 * not-yet-reviewed documents; a semantic topic label remains authoritative.
 */
export const DEFAULT_TOPIC_TAG_TAXONOMY: TopicTagTaxonomy = {
  version: TOPIC_TAG_TAXONOMY_VERSION,
  topics: {
    scrum: {
      strong: [
        "agile",
        "scrum",
        "agile & scrum",
        "scrum & agile",
        "team coaching",
        "facilitation",
        "flow & delivery",
        "psm-ii",
      ],
      medium: [],
      light: [
        "team dynamics",
        "team dynamics & collaboration",
        "organizational behavior",
        "organizational behavior & culture",
      ],
    },
    "software-development": {
      strong: ["software development", "software-development", "programming & software"],
      medium: [],
      light: [],
    },
    "front-end-development": {
      strong: [
        "front-end development",
        "frontend development",
        "front end development",
        "front-end-development",
        "accessibility",
      ],
      medium: [],
      light: [],
    },
    "social-studies": {
      strong: [
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
      ],
      medium: [],
      light: [],
    },
    adhd: {
      strong: ["adhd", "adhd & neurodivergence"],
      medium: [],
      light: [],
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tagNames(doc: PriorityDocument): string[] {
  const tags = doc.tags;
  const raw = Array.isArray(tags) ? tags : isRecord(tags) ? Object.keys(tags) : [];
  return raw.map((tag) => {
    if (typeof tag === "string") {
      return normalize(tag);
    }
    if (!isRecord(tag)) {
      return "";
    }
    return normalize(tag.name ?? tag.key);
  }).filter(Boolean);
}

const STRENGTH_RANK: Record<TopicTagStrength, number> = { light: 1, medium: 2, strong: 3 };
const RELEVANCE_BY_STRENGTH: Record<TopicTagStrength, TopicRelevanceRating> = { light: 1, medium: 2, strong: 4 };

export function topicTagStrengthFor(
  doc: PriorityDocument,
  topic: TopicSequence,
  taxonomy: TopicTagTaxonomy = DEFAULT_TOPIC_TAG_TAXONOMY,
): TopicTagStrength | null {
  const tags = new Set(tagNames(doc));
  const entry = taxonomy.topics[topic];
  let best: TopicTagStrength | null = null;
  for (const strength of ["light", "medium", "strong"] as const) {
    if (entry[strength].some((tag) => tags.has(normalize(tag))) && (best === null || STRENGTH_RANK[strength] > STRENGTH_RANK[best])) {
      best = strength;
    }
  }
  return best;
}

export function fallbackTopicRelevanceFor(
  doc: PriorityDocument,
  topic: TopicSequence,
  taxonomy: TopicTagTaxonomy = DEFAULT_TOPIC_TAG_TAXONOMY,
): TopicRelevanceFallback {
  const tags = new Set(tagNames(doc));
  const entry = taxonomy.topics[topic];
  const evidence = [...entry.strong, ...entry.medium, ...entry.light]
    .map(normalize)
    .filter((tag) => tags.has(tag))
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .sort((a, b) => a.localeCompare(b));
  const strength = topicTagStrengthFor(doc, topic, taxonomy);
  return {
    relevance: strength === null ? 0 : RELEVANCE_BY_STRENGTH[strength],
    source: "fallback",
    confidence: "low",
    evidence,
  };
}
