import type { PriorityDocument } from "./priority-document.js";
import { canonicalInterestTags } from "./readwise-tags.js";
import { splitReadingFeedback } from "./reader-notes.js";

/** Personal philosophy interests, agreed from the Filosofische interessekaart. */
export const PHILOSOPHY_TAGS = {
  primary: [
    "political philosophy", "social philosophy", "anarchism", "anarchist", "kropotkin", "bakunin",
    "emma goldman", "david graeber", "mutual aid", "critical theory", "frankfurt school",
    "secularization", "secularisation", "secularisering", "community formation", "gemeenschapsvorming",
    "meaning of life", "epistemic power",
  ],
  secondary: ["philosophy of mind", "free will", "personal identity", "consciousness", "mind-body problem", "philosophy of language", "taalfilosofie"],
  tertiary: ["ethics", "existentialism", "absurdism", "nihilism", "virtue ethics", "kant", "utilitarianism", "camus", "nietzsche", "sartre", "kierkegaard"],
  broad: ["philosophy", "filosofie", "critical thinking & epistemology", "epistemology", "metaphysics"],
  saturated: ["stoicism", "stoicisme", "philosophy of technology", "ai ethics & society", "totalitarianism & fascism", "hannah arendt", "byung-chul han"],
} as const;

const CONTENT_SIGNALS = [
  { rating: 4, name: "social-political", pattern: /\b(?:anarchis(?:m|me|t|tisch)|kropotkin|bakunin|emma goldman|graeber|mutual aid|wederzijdse hulp|critical theory|kritische theorie|frankfurt(?:er)? school|frankfurter schule|seculari[sz](?:ation|ering)|gemeenschapsvorming|community formation|crisis of meaning|meaning of life|zin van het leven|individu (?:en|versus|vs) gemeenschap|individual (?:and|versus|vs) community|epistemic power|epistemische macht|democratie onder druk|democracy under (?:pressure|threat)|democratic erosion|vrijheid (?:en|versus|vs) gelijkheid|freedom (?:and|versus|vs) equality|arbeid en werk|onderscheid tussen arbeid en werk|labor and work)\b/ },
  { rating: 3, name: "mind-language", pattern: /\b(?:philosophy of mind|filosofie van de geest|free will|vrije wil|personal identity|persoonlijke identiteit|mind.body problem|hard problem of consciousness|qualia|dualism(?:e)?|philosophy of language|taalfilosofie)\b/ },
  { rating: 2, name: "ethics-existentialism", pattern: /\b(?:existentialis(?:m|me|tisch)|absurdis(?:m|me)|nihilis(?:m|me)|virtue ethics|deugdethiek|utilitarianism|utilitarisme|utilisme|immanuel kant|kantian|kantiaans|camus|nietzsche|sartre|kierkegaard|aristotle|aristoteles)\b/ },
  { rating: 1, name: "saturation", pattern: /\b(?:stoicis(?:m|me)|stoicijns|hannah arendt|arendt|totalitarianism|totalitarisme|byung.chul han|philosophy of technology|tech(?:nologie)?filosofie|ai.filosofie|ai philosophy|ai[ -]ethics|ai[ -]ethiek|ethics of (?:ai|artificial intelligence)|ethiek van (?:ai|kunstmatige intelligentie))\b/ },
] as const;

export type PhilosophyRating = 0 | 1 | 2 | 3 | 4;

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function contentTags(doc: PriorityDocument): Set<string> {
  const raw = Array.isArray(doc.tags) ? doc.tags : doc.tags && typeof doc.tags === "object" ? Object.keys(doc.tags) : [];
  const names = raw.flatMap((tag: unknown) => {
    if (typeof tag === "string") {return [tag];}
    if (tag && typeof tag === "object") {
      const name = "name" in tag ? tag.name : "key" in tag ? tag.key : undefined;
      if (typeof name === "string") {return [name];}
    }
    return [];
  });
  return new Set(canonicalInterestTags(names).map(normalize));
}

export function philosophyRelevanceFor(doc: PriorityDocument): { relevance: PhilosophyRating; evidence: string[] } {
  const tags = contentTags(doc);
  // Generated reading decisions and personal feedback are not subject evidence.
  const notes = (splitReadingFeedback(doc.notes).contentNotes ?? "")
    .replace(/^[ \t]*(?:Waarom lezen|Waarom skippen|Beste moment|Aanbeveling):[^\n]*(?:\n(?![ \t]*\r?$)[^\n]*)*/gim, "");
  const text = normalize([doc.title, doc.summary, notes].filter(Boolean).join(" "));
  const signals = CONTENT_SIGNALS.filter(({ pattern }) => pattern.test(text));
  const saturated = PHILOSOPHY_TAGS.saturated.some((tag) => tags.has(tag)) || signals.some(({ name }) => name === "saturation");
  let relevance: PhilosophyRating = 0;
  const evidence: string[] = [];
  for (const [group, value] of [["primary", 4], ["secondary", 3], ["tertiary", 2], ["broad", 1], ["saturated", 1]] as const) {
    for (const tag of PHILOSOPHY_TAGS[group]) {
      if (!tags.has(tag)) {continue;}
      // Broad political/ethical tags do not counteract a saturated subject.
      const broad = ["political philosophy", "social philosophy", "ethics"].includes(tag);
      relevance = Math.max(relevance, saturated && broad ? 1 : value) as PhilosophyRating;
      evidence.push(tag);
    }
  }
  for (const signal of signals) {
    relevance = Math.max(relevance, signal.rating) as PhilosophyRating;
    evidence.push(`philosophy:${signal.name}`);
  }
  return { relevance, evidence: [...new Set(evidence)].sort() };
}
