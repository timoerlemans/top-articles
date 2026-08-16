import { parseReadingMinutes } from "./reading-time.mjs";

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
};

export const ADJACENT_TOPICS = [
  "ai", "technology", "learning", "education", "economics", "climate", "environment",
  "current affairs", "geopolitics", "psychology", "media", "systems thinking",
];

const DIRECT_USEFULNESS_TAGS = [
  "parenting", "parenting & care", "parenting & family", "mantelzorg", "family & relationships",
  "business & work", "career & work", "work & career", "professional development", "scrum",
  "writing", "writing & essays", "essay-writing", "personal knowledge management",
  "pkm & kennisbeheer", "pkm & note-taking",
];
const USEFULNESS_WHY_WORDS = ["werk", "ouderschap", "mantelzorg", "schrijven", "kennisbeheer", "pkm", "scrum"];
const DEPTH_WORDS = ["essay", "analysis", "analyse", "report", "paper", "study", "onderzoek", "rapport"];
const RESEARCH_TAGS = ["research papers & academia", "history of ideas"];
const AMERICA_MARKERS = ["united states", "u.s.", "us politics", "trump", "america", "american"];
const DUTCH_TAGS = new Set(["dutch", "nederlands", "nl"]);
const ENGLISH_TAGS = new Set(["english", "lang:en"]);
const COMPONENT_KEYS = [
  "kerninteresse",
  "diepgang",
  "persoonlijke_bruikbaarheid",
  "leeskans",
  "onderscheidende_duurzame_waarde",
  "aftrek",
];
const SEQUENCE_ORDER = ["video", "boek", "pdf", "lees", "dutch", "short", "short-dutch"];

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tagKeys(doc) {
  if (!doc?.tags) return [];
  const raw = Array.isArray(doc.tags) ? doc.tags : Object.keys(doc.tags);
  return raw
    .map((tag) => typeof tag === "string" ? tag : tag?.name ?? tag?.key ?? "")
    .map(normalize)
    .filter(Boolean);
}

function whyReadFor(doc) {
  const notes = String(doc?.notes ?? "");
  const beforeMoment = notes.match(/Waarom lezen:\s*([\s\S]*?)(?:\n\s*Beste moment:|$)/i);
  return beforeMoment?.[1]?.trim() ?? "";
}

function freeTextFor(doc) {
  return normalize([doc?.title, doc?.summary, whyReadFor(doc)].filter(Boolean).join(" \n "));
}

function phrasePattern(phrase) {
  const escaped = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i");
}

function hasPhrase(text, phrase) {
  return phrasePattern(phrase).test(text);
}

function matchesVocabulary(doc, vocabulary) {
  const tags = new Set(tagKeys(doc));
  const text = freeTextFor(doc);
  return vocabulary.some((phrase) => tags.has(normalize(phrase)) || hasPhrase(text, phrase));
}

function matchedDomains(doc) {
  return Object.entries(DIRECT_DOMAIN_TAGS)
    .filter(([, vocabulary]) => matchesVocabulary(doc, vocabulary))
    .map(([domain]) => domain);
}

function wordCount(doc) {
  if (doc?.word_count === null || doc?.word_count === undefined || doc?.word_count === "") return null;
  const value = Number(doc?.word_count);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function categoryFor(doc) {
  return normalize(doc?.category);
}

function priorityReadingMinutes(value) {
  const parsed = parseReadingMinutes(value);
  if (parsed !== null) return parsed;
  if (typeof value === "string" && /^\s*0\s*(?:minutes?|mins?|min)\b/i.test(value)) return 0;
  return null;
}

function isBook(doc) {
  const category = categoryFor(doc);
  const tags = new Set(tagKeys(doc));
  return (category === "epub" || tags.has("book") || tags.has("books")) && !tags.has("pdf") && category !== "pdf";
}

function isPdf(doc) {
  return categoryFor(doc) === "pdf";
}

function tierForScore(score) {
  if (score >= 70) return "hoog";
  if (score >= 40) return "midden";
  return "laag";
}

function clampScore(score) {
  return Math.max(0, Math.min(100, score));
}

export function scorePriorityDocument(doc) {
  const tags = new Set(tagKeys(doc));
  const whyRead = normalize(whyReadFor(doc));
  const text = freeTextFor(doc);
  const words = wordCount(doc);
  const readingMinutes = priorityReadingMinutes(doc?.reading_time);
  const category = categoryFor(doc);
  const domains = matchedDomains(doc);
  const hasAdjacent = domains.length === 0 && matchesVocabulary(doc, ADJACENT_TOPICS);
  const rationale = Object.fromEntries(COMPONENT_KEYS.map((key) => [key, []]));

  let kerninteresse = 0;
  if (domains.length >= 2) {
    kerninteresse = 45;
    rationale.kerninteresse.push(`Minstens twee kerndomeinen: ${domains.join(", ")}.`);
  } else if (domains.length === 1) {
    kerninteresse = 30;
    rationale.kerninteresse.push(`Eén kerndomein: ${domains[0]}.`);
  } else if (hasAdjacent) {
    kerninteresse = 15;
    rationale.kerninteresse.push("Alleen een aangrenzend onderwerp.");
  }

  const deepFormat = category === "pdf" || category === "epub";
  const deepTag = RESEARCH_TAGS.find((tag) => tags.has(tag));
  let diepgang = 0;
  if (deepFormat || (words !== null && words >= 7_000) || deepTag) {
    diepgang = 20;
    if (deepFormat) rationale.diepgang.push(`${category.toUpperCase()} geldt als diepgaand formaat.`);
    else if (words >= 7_000) rationale.diepgang.push(`${words.toLocaleString("nl-NL")} woorden.`);
    else rationale.diepgang.push(`Verdiepende tag: ${deepTag}.`);
  } else {
    const depthWord = DEPTH_WORDS.find((word) => hasPhrase(text, word));
    if ((words !== null && words >= 1_200) || depthWord) {
      diepgang = 10;
      if (words !== null && words >= 1_200) rationale.diepgang.push(`${words.toLocaleString("nl-NL")} woorden.`);
      else rationale.diepgang.push(`Verdiepend signaal in de tekst: ${depthWord}.`);
    }
  }

  const usefulTag = DIRECT_USEFULNESS_TAGS.find((tag) => tags.has(tag));
  const usefulWhyWord = USEFULNESS_WHY_WORDS.find((word) => hasPhrase(whyRead, word));
  let persoonlijke_bruikbaarheid = 0;
  if (usefulTag || usefulWhyWord) {
    persoonlijke_bruikbaarheid = 20;
    if (usefulTag) rationale.persoonlijke_bruikbaarheid.push(`Direct bruikbare tag: ${usefulTag}.`);
    else rationale.persoonlijke_bruikbaarheid.push(`Waarom lezen noemt: ${usefulWhyWord}.`);
  } else if (domains.length > 0) {
    persoonlijke_bruikbaarheid = 10;
    rationale.persoonlijke_bruikbaarheid.push("Indirect bruikbaar via een kerndomein.");
  }

  const leeskans = readingMinutes !== null && readingMinutes < 10 ? 5 : 0;
  if (leeskans) rationale.leeskans.push(`Korte leestijd: ${readingMinutes} minuten.`);

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
  const noSummary = normalize(doc?.summary) === "";
  const noWhyRead = whyRead === "";
  const thinOrPromotional =
    (words !== null && words < 250 && noSummary && noWhyRead) ||
    category === "tweet" ||
    (tags.has("newsletter") && words !== null && words < 600);
  if (thinOrPromotional) {
    aftrek -= 10;
    rationale.aftrek.push("Dun of promotioneel stuk.");
  }

  const components = {
    kerninteresse,
    diepgang,
    persoonlijke_bruikbaarheid,
    leeskans,
    onderscheidende_duurzame_waarde,
    aftrek,
  };
  const score = clampScore(Object.values(components).reduce((sum, value) => sum + value, 0));

  return { score, tier: tierForScore(score), components, rationale };
}

export function detectDutch(doc) {
  const language = normalize(doc?.language);
  if (["nl", "nld", "dut", "dutch", "nederlands"].includes(language)) return true;
  if (["en", "eng", "english"].includes(language)) return false;
  const tags = new Set(tagKeys(doc));
  if ([...DUTCH_TAGS].some((tag) => tags.has(tag))) return true;
  if ([...ENGLISH_TAGS].some((tag) => tags.has(tag))) return false;
  return false;
}

export function sequencesForDocument(doc) {
  const category = categoryFor(doc);
  const book = isBook(doc);
  const pdf = isPdf(doc);
  const dutch = detectDutch(doc);
  const readingMinutes = priorityReadingMinutes(doc?.reading_time);
  const short = readingMinutes !== null && readingMinutes < 10;
  const sequences = [];

  if (category === "video") sequences.push("video");
  if (book) sequences.push("boek");
  if (pdf) sequences.push("pdf");
  if (!book && ["article", "email", "rss"].includes(category)) sequences.push("lees");
  if (!book && dutch) sequences.push("dutch");
  if (!book && short) sequences.push("short");
  if (!book && short && dutch) sequences.push("short-dutch");
  return SEQUENCE_ORDER.filter((sequence) => sequences.includes(sequence));
}
