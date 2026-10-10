import { parseReadingMinutes } from "./reading-time.js";
import type { ReadingTimeValue } from "./reading-time.js";
import { BASE_SEQUENCE_ORDER } from "./priority-sequences.js";
import type { PrioritySequenceV2 } from "./priority-sequences.js";
import { canonicalInterestTags } from "./readwise-tags.js";

export type PriorityTier = "hoog" | "midden" | "laag";

export interface PriorityTagDescriptor {
  name?: string | null;
  key?: string | null;
}

export type PriorityTags = (string | PriorityTagDescriptor)[] | Readonly<Record<string, unknown>> | null;

export interface PriorityDocument {
  id?: string | null | undefined;
  title?: string | null | undefined;
  author?: string | null | undefined;
  summary?: string | null | undefined;
  notes?: string | null | undefined;
  language?: string | null | undefined;
  reading_time?: ReadingTimeValue | undefined;
  word_count?: number | string | null | undefined;
  saved_at?: string | null | undefined;
  category?: string | null | undefined;
  location?: string | null | undefined;
  tags?: unknown;
}

export const DIRECT_DOMAIN_TAGS = {
  ai_ethiek: ["ai ethics", "ai & machine learning", "artificial intelligence"],
  filosofie: [
    "philosophy", "political philosophy", "ethics", "critical thinking & epistemology",
    "epistemology", "metaphysics",
    "anarchism", "anarchist", "kropotkin", "bakunin", "emma goldman", "david graeber",
    "mutual aid", "frankfurt school", "critical theory",
    "philosophy of mind", "free will", "personal identity", "philosophy of language",
    "existentialism", "absurdism", "nihilism", "virtue ethics", "stoicism",
  ],
  ideologie: ["political ideologies", "totalitarianism & fascism", "politics & society", "political philosophy", "anarchism", "anarchist"],
  geschiedenis: ["history", "history & civilization", "history of ideas"],
  sociologie: [
    "sociology", "sociology & inequality", "sociology & social structures", "ethics & society",
    "social psychology & interpersonal dynamics", "social psychology", "interpersonal dynamics",
  ],
  schrijven: ["essay-writing", "writing", "writing & essays"],
  speculatieve_fictie: ["fantasy & science fiction", "fiction-analysis", "literary-criticism", "narrative-theory"],
  cultuur_games_film: ["games", "games & game studies", "film & tv analysis", "digital culture", "entertainment & pop culture"],
  pkm: ["personal knowledge management", "pkm & kennisbeheer", "pkm & note-taking", "readwise", "tools & workflows"],
  zorgouderschap: ["parenting", "parenting & care", "parenting & family", "mantelzorg", "family & relationships"],
  adhd: ["adhd & neurodivergence", "adhd"],
  agile: [
    "agile", "scrum", "agile & scrum", "team coaching", "facilitation", "organizational culture",
    "team dynamics & collaboration", "organizational behavior & culture", "team dynamics", "collaboration",
    "organizational behavior", "product management", "flow & delivery",
  ],
} as const satisfies Record<string, readonly string[]>;

export type DirectDomain = keyof typeof DIRECT_DOMAIN_TAGS;

const DUTCH_TAGS = new Set(["dutch", "nederlands", "nl"]);
const ENGLISH_TAGS = new Set(["english", "lang:en"]);
const SEQUENCE_ORDER = BASE_SEQUENCE_ORDER;

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

export function tagKeys(doc: PriorityDocument): string[] {
  const raw = rawTags(doc.tags)
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
    .map(normalize)
    .filter(Boolean);
  return [...new Set([...raw, ...canonicalInterestTags(raw)])];
}

export function matchedDomainsFromTags(doc: PriorityDocument): DirectDomain[] {
  const tags = new Set(tagKeys(doc));
  return (Object.keys(DIRECT_DOMAIN_TAGS) as DirectDomain[])
    .filter((domain) => DIRECT_DOMAIN_TAGS[domain].some((phrase) => tags.has(normalize(phrase))));
}

export function categoryFor(doc: PriorityDocument): string {
  return normalize(doc.category);
}

export function priorityReadingMinutes(value: ReadingTimeValue): number | null {
  const parsed = parseReadingMinutes(value);
  if (parsed !== null) {
    return parsed;
  }
  if (typeof value === "string" && /^\s*0\s*(?:minutes?|mins?|min)\b/i.test(value)) {
    return 0;
  }
  return null;
}

export function isBook(doc: PriorityDocument): boolean {
  const category = categoryFor(doc);
  const tags = new Set(tagKeys(doc));
  return (category === "epub" || tags.has("book") || tags.has("books")) && !tags.has("pdf") && category !== "pdf";
}

export function isPdf(doc: PriorityDocument): boolean {
  return categoryFor(doc) === "pdf";
}

export function detectDutch(doc: PriorityDocument): boolean {
  const language = normalize(doc.language);
  if (["nl", "nld", "dut", "dutch", "nederlands"].includes(language)) {
    return true;
  }
  if (["en", "eng", "english"].includes(language)) {
    return false;
  }
  const tags = new Set(tagKeys(doc));
  if ([...DUTCH_TAGS].some((tag) => tags.has(tag))) {
    return true;
  }
  if ([...ENGLISH_TAGS].some((tag) => tags.has(tag))) {
    return false;
  }
  return false;
}

export function baseSequencesForDocument(doc: PriorityDocument): PrioritySequenceV2[] {
  const category = categoryFor(doc);
  const book = isBook(doc);
  const pdf = isPdf(doc);
  const dutch = detectDutch(doc);
  const readingMinutes = priorityReadingMinutes(doc.reading_time);
  const short = readingMinutes !== null && readingMinutes < 10;
  const sequences: PrioritySequenceV2[] = [];

  if (category === "video") {
    sequences.push("video");
  }
  if (book) {
    sequences.push("boek");
  }
  if (pdf) {
    sequences.push("pdf");
  }
  if (!book && ["article", "email", "rss"].includes(category)) {
    sequences.push("lees");
  }
  if (!book && dutch) {
    sequences.push("dutch");
  }
  if (!book && short) {
    sequences.push("short");
  }
  if (!book && short && dutch) {
    sequences.push("short-dutch");
  }
  return SEQUENCE_ORDER.filter((sequence) => sequences.includes(sequence));
}
