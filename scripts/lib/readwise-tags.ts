const ORDINAL_TAG_PATTERN = /^[a-z]+(?:-[a-z]+)*-\d{3,4}$/i;
const TOPLIST_TAG_PATTERN = /^[a-z]+(?:-[a-z]+)*-top-(?:10|100)$/i;

/** Canonical tags that readwise-enrich may choose for content classification. */
export const READWISE_ENRICH_TAXONOMY = new Set([
  "learning & meta-learning",
  "behavioral psychology & coaching",
  "adhd & neurodivergence",
  "political philosophy",
  "totalitarianism & fascism",
  "ai ethics & society",
  "philosophy",
  "history",
  "sociology & social structures",
  "social psychology & interpersonal dynamics",
  "economics",
  "technology",
  "science",
  "arts & culture",
  "fiction",
  "games",
  "current affairs & politics",
  "business & startups",
  "professional development",
  "health & wellness",
  "personal growth & life philosophy",
  "environment & sustainability",
  "food & cooking",
  "sports & recreation",
  "entertainment & pop culture",
  "research papers & academia",
  "professional documents",
  "software development",
  "front-end software development",
  "accessibility",
  "scrum",
  "agile",
  "existentialism",
  "ethics",
  "team coaching",
  "team dynamics & collaboration",
  "facilitation",
  "organizational culture",
  "organizational behavior & culture",
  "product management",
  "flow & delivery",
]);

const LANGUAGE_TAGS = new Set([
  "dutch", "nl", "nederlands", "english", "en", "lang:en", "french", "fr",
]);

const WORKFLOW_TAGS = new Set([
  "linked-from-readwise", "must-read", "shortlist", "short-list", "light-reading",
  "triaged", "archiveren", "later", "translated",
]);

/** Known historical or overly broad labels mapped to the canonical vocabulary. */
export const READWISE_TAG_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "agile & scrum": ["agile", "scrum"],
  "scrum & agile": ["agile", "scrum"],
  psychology: ["behavioral psychology & coaching"],
  "social psychology": ["social psychology & interpersonal dynamics"],
  "interpersonal dynamics": ["social psychology & interpersonal dynamics"],
  "interpersonal relationships": ["social psychology & interpersonal dynamics"],
  "human interaction": ["social psychology & interpersonal dynamics"],
  "team dynamics": ["team dynamics & collaboration"],
  "team collaboration": ["team dynamics & collaboration"],
  teamwork: ["team dynamics & collaboration"],
  collaboration: ["team dynamics & collaboration"],
  "organizational behavior": ["organizational behavior & culture"],
  "organizational culture & behavior": ["organizational behavior & culture"],
  "organisational behaviour": ["organizational behavior & culture"],
  "organisational culture": ["organizational behavior & culture"],
  "critical thinking": ["philosophy"],
  communication: ["behavioral psychology & coaching"],
  "climate change": ["environment & sustainability"],
  poverty: ["sociology & social structures"],
  "poverty & inequality": ["sociology & social structures"],
  "technology & society": ["technology"],
  cybersecurity: ["technology"],
  "privacy & surveillance": ["technology"],
  geopolitics: ["current affairs & politics"],
  "war & geopolitics": ["current affairs & politics"],
  sanctions: ["current affairs & politics"],
  ukraine: ["current affairs & politics"],
  "united states": ["current affairs & politics"],
  "law & governance": ["current affairs & politics"],
  entertainment: ["entertainment & pop culture"],
};

export function isReadwiseSystemTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  return normalized.startsWith("aaa-") ||
    TOPLIST_TAG_PATTERN.test(normalized) ||
    ORDINAL_TAG_PATTERN.test(normalized) ||
    LANGUAGE_TAGS.has(normalized) ||
    WORKFLOW_TAGS.has(normalized);
}

/** Returns app-facing interest tags while preserving unknown custom tags. */
export function canonicalInterestTags(tags: readonly string[]): string[] {
  const canonical = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || isReadwiseSystemTag(normalized)) {
      continue;
    }
    const replacements = READWISE_TAG_ALIASES[normalized] ?? [normalized];
    for (const replacement of replacements) {
      canonical.add(replacement);
    }
  }
  return [...canonical].sort((a, b) => a.localeCompare(b));
}
