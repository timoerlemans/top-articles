import { parseReadingMinutes } from "./reading-time.js";
import type { ReadingTimeValue } from "./reading-time.js";

export type PriorityTier = "hoog" | "midden" | "laag";

export type PrioritySequenceV2 = "video" | "boek" | "pdf" | "lees" | "dutch" | "short" | "short-dutch";

export interface PriorityTagDescriptor {
  name?: string | null;
  key?: string | null;
}

export type PriorityTags = (string | PriorityTagDescriptor)[] | Readonly<Record<string, unknown>> | null;

export interface PriorityDocument {
  id?: string | null | undefined;
  title?: string | null | undefined;
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

export interface PriorityComponents {
  kerninteresse: number;
  diepgang: number;
  persoonlijke_bruikbaarheid: number;
  leeskans: number;
  onderscheidende_duurzame_waarde: number;
  aftrek: number;
}

export type PriorityComponentKey = keyof PriorityComponents;

export type PriorityRationale = Record<PriorityComponentKey, string[]>;

export interface PriorityScoreResult {
  score: number;
  tier: PriorityTier;
  components: PriorityComponents;
  rationale: PriorityRationale;
}

export const DIRECT_DOMAIN_TAGS = {
  ai_ethiek: ["ai ethics", "ai & machine learning", "artificial intelligence"],
  filosofie: ["philosophy", "political philosophy", "ethics", "critical thinking & epistemology"],
  ideologie: ["political ideologies", "totalitarianism & fascism", "politics & society", "political philosophy"],
  geschiedenis: ["history", "history & civilization", "history of ideas"],
  sociologie: ["sociology", "sociology & inequality", "sociology & social structures", "ethics & society"],
  schrijven: ["essay-writing", "writing", "writing & essays"],
  speculatieve_fictie: ["fantasy & science fiction", "fiction-analysis", "literary-criticism", "narrative-theory"],
  cultuur_games_film: ["games", "games & game studies", "film & tv analysis", "digital culture", "entertainment & pop culture"],
  pkm: ["personal knowledge management", "pkm & kennisbeheer", "pkm & note-taking", "readwise", "tools & workflows"],
  zorgouderschap: ["parenting", "parenting & care", "parenting & family", "mantelzorg", "family & relationships"],
  agile: ["agile", "scrum"],
} as const satisfies Record<string, readonly string[]>;

export type DirectDomain = keyof typeof DIRECT_DOMAIN_TAGS;

export const ADJACENT_TOPICS: readonly string[] = [
  "ai", "technology", "learning", "education", "economics", "climate", "environment",
  "current affairs", "geopolitics", "psychology", "media", "systems thinking",
];

const DIRECT_USEFULNESS_TAGS = [
  "parenting", "parenting & care", "parenting & family", "mantelzorg", "family & relationships",
  "business & work", "career & work", "work & career", "professional development", "scrum", "agile",
  "writing", "writing & essays", "essay-writing", "personal knowledge management",
  "pkm & kennisbeheer", "pkm & note-taking",
];
const USEFULNESS_WHY_WORDS = ["werk", "ouderschap", "mantelzorg", "schrijven", "kennisbeheer", "pkm", "scrum", "agile"];
const DEPTH_WORDS = ["essay", "analysis", "analyse", "report", "paper", "study", "onderzoek", "rapport"];
const RESEARCH_TAGS = ["research papers & academia", "history of ideas"];
const AMERICA_MARKERS = ["united states", "u.s.", "us politics", "trump", "america", "american"];
const DUTCH_TAGS = new Set(["dutch", "nederlands", "nl"]);
const ENGLISH_TAGS = new Set(["english", "lang:en"]);
const SEQUENCE_ORDER: readonly PrioritySequenceV2[] = ["video", "boek", "pdf", "lees", "dutch", "short", "short-dutch"];

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

function tagKeys(doc: PriorityDocument): string[] {
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
    .map(normalize)
    .filter(Boolean);
}

function whyReadFor(doc: PriorityDocument): string {
  const notes = doc.notes ?? "";
  const beforeMoment = notes.match(/Waarom lezen:\s*([\s\S]*?)(?:\n\s*Beste moment:|$)/i);
  return beforeMoment?.[1]?.trim() ?? "";
}

function freeTextFor(doc: PriorityDocument): string {
  return normalize([doc.title, doc.summary, whyReadFor(doc)].filter(Boolean).join(" \n "));
}

function phrasePattern(phrase: string): RegExp {
  const escaped = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i");
}

function hasPhrase(text: string, phrase: string): boolean {
  return phrasePattern(phrase).test(text);
}

function matchesVocabulary(doc: PriorityDocument, vocabulary: readonly string[]): boolean {
  const tags = new Set(tagKeys(doc));
  const text = freeTextFor(doc);
  return vocabulary.some((phrase) => tags.has(normalize(phrase)) || hasPhrase(text, phrase));
}

function matchedDomains(doc: PriorityDocument): DirectDomain[] {
  return (Object.keys(DIRECT_DOMAIN_TAGS) as DirectDomain[])
    .filter((domain) => matchesVocabulary(doc, DIRECT_DOMAIN_TAGS[domain]));
}

function wordCount(doc: PriorityDocument): number | null {
  if (doc.word_count === null || doc.word_count === undefined || doc.word_count === "") {
    return null;
  }
  const value = Number(doc.word_count);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function categoryFor(doc: PriorityDocument): string {
  return normalize(doc.category);
}

function priorityReadingMinutes(value: ReadingTimeValue): number | null {
  const parsed = parseReadingMinutes(value);
  if (parsed !== null) {
    return parsed;
  }
  if (typeof value === "string" && /^\s*0\s*(?:minutes?|mins?|min)\b/i.test(value)) {
    return 0;
  }
  return null;
}

function isBook(doc: PriorityDocument): boolean {
  const category = categoryFor(doc);
  const tags = new Set(tagKeys(doc));
  return (category === "epub" || tags.has("book") || tags.has("books")) && !tags.has("pdf") && category !== "pdf";
}

function isPdf(doc: PriorityDocument): boolean {
  return categoryFor(doc) === "pdf";
}

function tierForScore(score: number): PriorityTier {
  if (score >= 70) {
    return "hoog";
  }
  if (score >= 40) {
    return "midden";
  }
  return "laag";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export function scorePriorityDocument(doc: PriorityDocument): PriorityScoreResult {
  const tags = new Set(tagKeys(doc));
  const whyRead = normalize(whyReadFor(doc));
  const text = freeTextFor(doc);
  const words = wordCount(doc);
  const readingMinutes = priorityReadingMinutes(doc.reading_time);
  const category = categoryFor(doc);
  const domains = matchedDomains(doc);
  const hasAdjacent = domains.length === 0 && matchesVocabulary(doc, ADJACENT_TOPICS);
  const rationale: PriorityRationale = {
    kerninteresse: [],
    diepgang: [],
    persoonlijke_bruikbaarheid: [],
    leeskans: [],
    onderscheidende_duurzame_waarde: [],
    aftrek: [],
  };

  let kerninteresse = 0;
  if (domains.length >= 2) {
    kerninteresse = 45;
    rationale.kerninteresse.push(`Minstens twee kerndomeinen: ${domains.join(", ")}.`);
  } else if (domains.length === 1) {
    kerninteresse = 30;
    const domain = domains[0];
    if (domain !== undefined) {
      rationale.kerninteresse.push(`Eén kerndomein: ${domain}.`);
    }
  } else if (hasAdjacent) {
    kerninteresse = 15;
    rationale.kerninteresse.push("Alleen een aangrenzend onderwerp.");
  }

  const deepFormat = category === "pdf" || category === "epub";
  const deepTag = RESEARCH_TAGS.find((tag) => tags.has(tag));
  let diepgang = 0;
  if (deepFormat || (words !== null && words >= 7_000) || deepTag) {
    diepgang = 20;
    if (deepFormat) {
      rationale.diepgang.push(`${category.toUpperCase()} geldt als diepgaand formaat.`);
    } else if (words !== null && words >= 7_000) {
      rationale.diepgang.push(`${words.toLocaleString("nl-NL")} woorden.`);
    } else if (deepTag !== undefined) {
      rationale.diepgang.push(`Verdiepende tag: ${deepTag}.`);
    }
  } else {
    const depthWord = DEPTH_WORDS.find((word) => hasPhrase(text, word));
    if ((words !== null && words >= 1_200) || depthWord) {
      diepgang = 10;
      if (words !== null && words >= 1_200) {
        rationale.diepgang.push(`${words.toLocaleString("nl-NL")} woorden.`);
      } else if (depthWord !== undefined) {
        rationale.diepgang.push(`Verdiepend signaal in de tekst: ${depthWord}.`);
      }
    }
  }

  const usefulTag = DIRECT_USEFULNESS_TAGS.find((tag) => tags.has(tag));
  const usefulWhyWord = USEFULNESS_WHY_WORDS.find((word) => hasPhrase(whyRead, word));
  let persoonlijke_bruikbaarheid = 0;
  if (usefulTag || usefulWhyWord) {
    persoonlijke_bruikbaarheid = 20;
    if (usefulTag) {
      rationale.persoonlijke_bruikbaarheid.push(`Direct bruikbare tag: ${usefulTag}.`);
    } else if (usefulWhyWord !== undefined) {
      rationale.persoonlijke_bruikbaarheid.push(`Waarom lezen noemt: ${usefulWhyWord}.`);
    }
  } else if (domains.length > 0) {
    persoonlijke_bruikbaarheid = 10;
    rationale.persoonlijke_bruikbaarheid.push("Indirect bruikbaar via een kerndomein.");
  }

  const leeskans = readingMinutes !== null && readingMinutes < 10 ? 5 : 0;
  if (readingMinutes !== null && readingMinutes < 10) {
    rationale.leeskans.push(`Korte leestijd: ${readingMinutes} minuten.`);
  }

  const durableResearchTag = tags.has("research papers & academia");
  let onderscheidende_duurzame_waarde = 0;
  if (deepFormat || durableResearchTag) {
    onderscheidende_duurzame_waarde = 10;
    rationale.onderscheidende_duurzame_waarde.push(
      deepFormat ? `${category.toUpperCase()} heeft duurzame waarde.` : "Tag research papers & academia."
    );
  } else if ((words !== null && words >= 1_200) || domains.length > 0) {
    onderscheidende_duurzame_waarde = 5;
    rationale.onderscheidende_duurzame_waarde.push(
      words !== null && words >= 1_200 ? "Minstens 1.200 woorden." : "Aansluiting bij een kerndomein."
    );
  }

  let aftrek = 0;
  const hasUsMarker = AMERICA_MARKERS.some((marker) => tags.has(normalize(marker)) || hasPhrase(text, marker));
  if (tags.has("current affairs") && hasUsMarker && domains.length === 0) {
    aftrek -= 10;
    rationale.aftrek.push("Amerikaanse actualiteit zonder kerndomeinmatch.");
  }
  const noSummary = normalize(doc.summary) === "";
  const noWhyRead = whyRead === "";
  const thinOrPromotional =
    (words !== null && words < 250 && noSummary && noWhyRead) ||
    category === "tweet" ||
    (tags.has("newsletter") && words !== null && words < 600);
  if (thinOrPromotional) {
    aftrek -= 10;
    rationale.aftrek.push("Dun of promotioneel stuk.");
  }

  const components: PriorityComponents = {
    kerninteresse,
    diepgang,
    persoonlijke_bruikbaarheid,
    leeskans,
    onderscheidende_duurzame_waarde,
    aftrek,
  };
  const score = clampScore(
    components.kerninteresse +
    components.diepgang +
    components.persoonlijke_bruikbaarheid +
    components.leeskans +
    components.onderscheidende_duurzame_waarde +
    components.aftrek,
  );

  return { score, tier: tierForScore(score), components, rationale };
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

export function sequencesForDocument(doc: PriorityDocument): PrioritySequenceV2[] {
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
