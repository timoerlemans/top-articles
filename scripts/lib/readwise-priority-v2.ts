import { DIRECT_DOMAIN_TAGS, matchedDomainsFromTags, tagKeys, categoryFor, priorityReadingMinutes, detectDutch } from "./priority-document.js";
import type { DirectDomain, PriorityDocument, PriorityTier } from "./priority-document.js";
export { DIRECT_DOMAIN_TAGS, matchedDomainsFromTags, detectDutch, baseSequencesForDocument as sequencesForDocument } from "./priority-document.js";
export type { DirectDomain, PriorityDocument, PriorityTier, PriorityTags, PriorityTagDescriptor } from "./priority-document.js";
import { splitReadingFeedback } from "./reader-notes.js";

export type { PrioritySequenceV2 } from "./priority-sequences.js";

export interface PriorityComponents {
  kerninteresse: number;
  diepgang: number;
  persoonlijke_bruikbaarheid: number;
  leeskans: number;
  onderscheidende_duurzame_waarde: number;
  nederlandse_taal: number;
  curatie: number;
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

export const ADJACENT_TOPICS: readonly string[] = [
  "ai", "technology", "learning", "education", "economics", "climate", "environment",
  "current affairs", "geopolitics", "psychology", "media", "systems thinking",
];

const DIRECT_USEFULNESS_TAGS = [
  "parenting", "parenting & care", "parenting & family", "mantelzorg", "family & relationships",
  "business & work", "career & work", "work & career", "professional development", "scrum", "agile",
  "team coaching", "facilitation", "organizational culture", "product management", "flow & delivery",
  "team dynamics & collaboration", "organizational behavior & culture",
  "writing", "writing & essays", "essay-writing", "personal knowledge management",
  "pkm & kennisbeheer", "pkm & note-taking",
];
const USEFULNESS_WHY_WORDS = [
  "werk", "work", "career", "professional", "ouderschap", "mantelzorg", "schrijven", "kennisbeheer",
  "pkm", "scrum", "agile", "team coaching", "collaboration", "organizational behavior",
];
const DEPTH_WORDS = ["essay", "analysis", "analyse", "report", "paper", "study", "onderzoek", "rapport"];
const RESEARCH_TAGS = ["research papers & academia", "history of ideas"];
const SATURATED_PHILOSOPHY_PHRASES = [
  "hannah arendt", "arendt", "totalitarianism", "totalitarianism & fascism", "fascism", "authoritarianism",
  "byung-chul han", "philosophy of technology",
];
const AMERICA_MARKERS = ["united states", "u.s.", "us politics", "trump", "america", "american"];
const DUTCH_SCORE_BONUS = 5;
const SHORTLIST_SCORE_BONUS = 10;
const MUST_READ_SCORE_BONUS = 20;

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function whyReadFor(doc: PriorityDocument): string {
  const notes = splitReadingFeedback(doc.notes).contentNotes ?? "";
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

export function matchedDomains(doc: PriorityDocument): DirectDomain[] {
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

function tierForScore(score: number): PriorityTier {
  if (score >= 70) {
    return "hoog";
  }
  if (score >= 40) {
    return "midden";
  }
  return "laag";
}

function floorScore(score: number): number {
  return Math.max(0, score);
}

export function scorePriorityDocument(doc: PriorityDocument): PriorityScoreResult {
  const tags = new Set(tagKeys(doc));
  const whyRead = normalize(whyReadFor(doc));
  const text = freeTextFor(doc);
  const words = wordCount(doc);
  const readingMinutes = priorityReadingMinutes(doc.reading_time);
  const category = categoryFor(doc);
  const domains = matchedDomainsFromTags(doc);
  const dutch = detectDutch(doc);
  const rationale: PriorityRationale = {
    kerninteresse: [],
    diepgang: [],
    persoonlijke_bruikbaarheid: [],
    leeskans: [],
    onderscheidende_duurzame_waarde: [],
    nederlandse_taal: [],
    curatie: [],
    aftrek: [],
  };

  const kerninteresse = domains.length * 20;
  if (domains.length > 0) {
    rationale.kerninteresse.push(
      `${domains.length} expliciete kerninteresse${domains.length === 1 ? "" : "s"}: ${domains.join(", ")}.`,
    );
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

  const nederlandse_taal = dutch ? DUTCH_SCORE_BONUS : 0;
  if (dutch) {
    rationale.nederlandse_taal.push("Nederlandstalig document: +5 bonuspunten.");
  }

  let curatie = 0;
  if (tags.has("must-read")) {
    curatie = MUST_READ_SCORE_BONUS;
    rationale.curatie.push("Must-read: +20 bonuspunten.");
  } else if (tags.has("shortlist") || tags.has("short-list")) {
    curatie = SHORTLIST_SCORE_BONUS;
    rationale.curatie.push("Shortlist: +10 bonuspunten.");
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
  const saturatedPhrase = SATURATED_PHILOSOPHY_PHRASES.find(
    (phrase) => tags.has(normalize(phrase)) || hasPhrase(text, phrase),
  );
  if (saturatedPhrase && !deepFormat && !deepTag) {
    aftrek -= 15;
    rationale.aftrek.push(`Verzadigd onderwerp (AI/tech-filosofie of Arendt/totalitarisme): ${saturatedPhrase}.`);
  }

  const components: PriorityComponents = {
    kerninteresse,
    diepgang,
    persoonlijke_bruikbaarheid,
    leeskans,
    onderscheidende_duurzame_waarde,
    nederlandse_taal,
    curatie,
    aftrek,
  };
  const score = floorScore(
    components.kerninteresse +
    components.diepgang +
    components.persoonlijke_bruikbaarheid +
    components.leeskans +
    components.onderscheidende_duurzame_waarde +
    components.nederlandse_taal +
    components.curatie +
    components.aftrek,
  );

  return { score, tier: tierForScore(score), components, rationale };
}
