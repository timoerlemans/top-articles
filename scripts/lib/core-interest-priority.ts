import { DIRECT_DOMAIN_TAGS } from "./readwise-priority-v2.js";
import type { DirectDomain, PriorityDocument } from "./readwise-priority-v2.js";
import { contentTagsFor, judgmentFor } from "./priority-judgments.js";
import type { ContentJudgment, PriorityJudgmentsConfig } from "./priority-judgments.js";

export const CORE_INTEREST_PRIORITY_VERSION = 1 as const;
export const CORE_INTEREST_EVIDENCE_MAPPING_VERSION = 1 as const;

export const CORE_INTEREST_LABELS: Readonly<Record<DirectDomain, string>> = {
  ai_ethiek: "AI & ethiek",
  filosofie: "Filosofie",
  ideologie: "Ideologie",
  geschiedenis: "Geschiedenis",
  sociologie: "Sociologie",
  schrijven: "Schrijven",
  speculatieve_fictie: "Speculatieve fictie",
  cultuur_games_film: "Cultuur, games & film",
  pkm: "PKM",
  zorgouderschap: "Zorg & ouderschap",
  adhd: "ADHD",
  agile: "Agile",
};

export interface CoreInterestPriorityConfig {
  version: typeof CORE_INTEREST_PRIORITY_VERSION;
  manualOrder: DirectDomain[];
  weightByRank: number[];
}

export type CoreInterestEvidenceKind = "readwise-tag" | "semantic-signal";

export interface CoreInterestEvidence {
  kind: CoreInterestEvidenceKind;
  source: string;
  label: string;
}

export interface CoreInterestMatch {
  interest: DirectDomain;
  evidence: CoreInterestEvidence[];
  qualityScore: number;
}

export interface CoreInterestPriorityEntry {
  interest: DirectDomain;
  label: string;
  rank: number;
  weight: number;
  source: "manual" | "derived";
  evidenceDocumentCount: number;
  evidenceScore: number;
}

export interface CoreInterestPriority {
  version: typeof CORE_INTEREST_PRIORITY_VERSION;
  generatedAt: string;
  order: DirectDomain[];
  weights: Record<DirectDomain, number>;
  entries: CoreInterestPriorityEntry[];
}

export interface WeightedCoreInterestMatch extends CoreInterestMatch {
  weight: number;
}

const CORE_INTERESTS = Object.keys(DIRECT_DOMAIN_TAGS) as DirectDomain[];
const DEFAULT_MANUAL_ORDER: DirectDomain[] = ["agile", "adhd", "filosofie"];
const DEFAULT_WEIGHT_BY_RANK = [20, 16, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2];

/** Ambiguous tags have exactly one primary canonical interest. */
const AMBIGUOUS_TAG_PRIMARY: Readonly<Record<string, DirectDomain>> = {
  "political philosophy": "filosofie",
  anarchism: "ideologie",
  anarchist: "ideologie",
};

const SEMANTIC_SIGNAL_INTEREST: Readonly<Record<string, DirectDomain>> = {
  "interest:adhd": "adhd",
  "interest:agile": "agile",
  "interest:ai-ethics": "ai_ethiek",
  "interest:arts-culture": "cultuur_games_film",
  "interest:behavioral-psychology": "sociologie",
  "interest:ethics": "filosofie",
  "interest:existentialism": "filosofie",
  "interest:facilitation": "agile",
  "interest:fiction": "speculatieve_fictie",
  "interest:flow-delivery": "agile",
  "interest:games": "cultuur_games_film",
  "interest:history": "geschiedenis",
  "interest:organizational-behavior": "agile",
  "interest:organizational-culture": "agile",
  "interest:parenting-care": "zorgouderschap",
  "interest:philosophy": "filosofie",
  "interest:political-philosophy": "filosofie",
  "interest:scrum": "agile",
  "interest:social-psychology": "sociologie",
  "interest:sociology": "sociologie",
  "interest:team-coaching": "agile",
  "interest:team-dynamics": "agile",
  "interest:totalitarianism-fascism": "ideologie",
  "interest:writing": "schrijven",
};

const SUBTOPIC_LABELS: Readonly<Record<string, string>> = {
  "interest:adhd": "ADHD & neurodivergentie",
  "interest:agile": "Agile",
  "interest:ai-ethics": "AI-ethiek",
  "interest:arts-culture": "kunst & cultuur",
  "interest:behavioral-psychology": "gedragspsychologie",
  "interest:ethics": "ethiek",
  "interest:existentialism": "existentialisme",
  "interest:facilitation": "facilitatie",
  "interest:fiction": "fictie",
  "interest:flow-delivery": "flow & delivery",
  "interest:games": "games",
  "interest:history": "geschiedenis",
  "interest:organizational-behavior": "organisatiegedrag",
  "interest:organizational-culture": "organisatiecultuur",
  "interest:parenting-care": "ouderschap & zorg",
  "interest:philosophy": "filosofie",
  "interest:political-philosophy": "politieke filosofie",
  "interest:scrum": "scrum",
  "interest:social-psychology": "sociale psychologie",
  "interest:sociology": "sociologie",
  "interest:team-coaching": "teamcoaching",
  "interest:team-dynamics": "teamdynamiek",
  "interest:totalitarianism-fascism": "totalitarisme & fascisme",
  "interest:writing": "schrijven",
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function humanize(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelForTag(tag: string): string {
  const labels: Readonly<Record<string, string>> = {
    "political philosophy": "politieke filosofie",
    "political ideologies": "politieke ideologieën",
    philosophy: "filosofie",
    history: "geschiedenis",
    writing: "schrijven",
    "parenting & care": "ouderschap & zorg",
    "adhd & neurodivergence": "ADHD & neurodivergentie",
  };
  return labels[tag] ?? humanize(tag);
}

function labelForSemanticSignal(signal: string): string {
  return SUBTOPIC_LABELS[signal] ?? humanize(signal.replace(/^interest:/, ""));
}

function qualityScore(judgment: ContentJudgment): number {
  return judgment.relevance * 10 + judgment.substance * 8 + judgment.durability * 5 + judgment.usefulness * 5;
}

function buildPrimaryTagMap(): ReadonlyMap<string, DirectDomain> {
  const map = new Map<string, DirectDomain>();
  for (const interest of CORE_INTERESTS) {
    for (const rawTag of DIRECT_DOMAIN_TAGS[interest]) {
      const tag = normalize(rawTag);
      const primary = AMBIGUOUS_TAG_PRIMARY[tag];
      if (primary !== undefined && primary !== interest) {
        continue;
      }
      const existing = map.get(tag);
      if (existing !== undefined && existing !== interest) {
        throw new Error(`Ambigue kerninteresse-tag mist primaire mapping: ${tag}`);
      }
      map.set(tag, interest);
    }
  }
  return map;
}

const PRIMARY_TAG_INTEREST = buildPrimaryTagMap();

export function coreInterestFingerprintInput(): Record<string, unknown> {
  return {
    priorityVersion: CORE_INTEREST_PRIORITY_VERSION,
    evidenceMappingVersion: CORE_INTEREST_EVIDENCE_MAPPING_VERSION,
    directDomainTags: DIRECT_DOMAIN_TAGS,
    ambiguousTagPrimary: AMBIGUOUS_TAG_PRIMARY,
    semanticSignalInterest: SEMANTIC_SIGNAL_INTEREST,
  };
}

export function validateCoreInterestPriorityConfig(value: unknown): value is CoreInterestPriorityConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("Ongeldige kerninteresseconfiguratie");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== CORE_INTEREST_PRIORITY_VERSION || !Array.isArray(record.manualOrder) || record.manualOrder.length !== 3 || !Array.isArray(record.weightByRank)) {
    throw new Error("Kerninteresseconfiguratie moet versie 1, drie handmatige kerninteresses en gewichten bevatten");
  }
  const manualOrder = record.manualOrder;
  if (!manualOrder.every((interest): interest is DirectDomain => typeof interest === "string" && CORE_INTERESTS.includes(interest as DirectDomain)) || new Set(manualOrder).size !== manualOrder.length) {
    throw new Error("Handmatige kerninteresses moeten drie verschillende bekende interesses zijn");
  }
  const weights = record.weightByRank;
  if (weights.length < CORE_INTERESTS.length || !weights.every((weight) => typeof weight === "number" && Number.isInteger(weight) && weight > 0)) {
    throw new Error("Gewichten voor kerninteresses moeten positieve gehele getallen voor alle interesses zijn");
  }
  return true;
}

export function defaultCoreInterestPriorityConfig(): CoreInterestPriorityConfig {
  return { version: CORE_INTEREST_PRIORITY_VERSION, manualOrder: [...DEFAULT_MANUAL_ORDER], weightByRank: [...DEFAULT_WEIGHT_BY_RANK] };
}

export function resolveCoreInterestMatches(doc: PriorityDocument, judgment: ContentJudgment): CoreInterestMatch[] {
  const matches = new Map<DirectDomain, Map<string, CoreInterestEvidence>>();
  const addEvidence = (interest: DirectDomain, evidence: CoreInterestEvidence): void => {
    const evidenceBySource = matches.get(interest) ?? new Map<string, CoreInterestEvidence>();
    evidenceBySource.set(`${evidence.kind}:${normalize(evidence.source)}`, evidence);
    matches.set(interest, evidenceBySource);
  };

  for (const tag of contentTagsFor(doc)) {
    const interest = PRIMARY_TAG_INTEREST.get(normalize(tag));
    if (interest !== undefined) {
      addEvidence(interest, { kind: "readwise-tag", source: normalize(tag), label: labelForTag(normalize(tag)) });
    }
  }

  for (const rawCode of judgment.reasonCodes) {
    const code = normalize(rawCode);
    const interest = SEMANTIC_SIGNAL_INTEREST[code];
    if (interest !== undefined) {
      addEvidence(interest, { kind: "semantic-signal", source: code, label: labelForSemanticSignal(code) });
    }
  }

  const score = qualityScore(judgment);
  return CORE_INTERESTS.flatMap((interest) => {
    const evidence = matches.get(interest);
    return evidence && evidence.size > 0
      ? [{ interest, evidence: [...evidence.values()].sort((a, b) => a.source.localeCompare(b.source)), qualityScore: score }]
      : [];
  });
}

interface DomainEvidenceAggregate {
  documentIds: Set<string>;
  qualityScores: number[];
}

function judgmentsFor(
  judgments: PriorityJudgmentsConfig | Record<string, ContentJudgment>,
): PriorityJudgmentsConfig | Record<string, ContentJudgment> {
  return judgments;
}

export function buildCoreInterestPriority(
  documents: readonly PriorityDocument[],
  judgments: PriorityJudgmentsConfig | Record<string, ContentJudgment>,
  config: CoreInterestPriorityConfig,
  generatedAt: string,
): CoreInterestPriority {
  validateCoreInterestPriorityConfig(config);
  const aggregates = new Map<DirectDomain, DomainEvidenceAggregate>(CORE_INTERESTS.map((interest) => [interest, { documentIds: new Set<string>(), qualityScores: [] }]));
  for (const doc of documents) {
    const { judgment } = judgmentFor(doc, judgmentsFor(judgments));
    const matches = resolveCoreInterestMatches(doc, judgment);
    for (const match of matches) {
      const aggregate = aggregates.get(match.interest);
      if (!aggregate) {continue;}
      if (doc.id) {aggregate.documentIds.add(doc.id);}
      aggregate.qualityScores.push(match.qualityScore);
    }
  }

  const derived = CORE_INTERESTS
    .filter((interest) => !config.manualOrder.includes(interest))
    .map((interest) => {
      const aggregate = aggregates.get(interest);
      const qualityScores = [...(aggregate?.qualityScores ?? [])].sort((a, b) => b - a).slice(0, 10);
      const evidenceDocumentCount = aggregate?.documentIds.size ?? 0;
      return {
        interest,
        evidenceDocumentCount,
        evidenceScore: qualityScores.reduce((sum, score) => sum + score, 0) + 2 * Math.min(evidenceDocumentCount, 10),
      };
    })
    .sort((a, b) => b.evidenceScore - a.evidenceScore || a.interest.localeCompare(b.interest));

  const order = [...config.manualOrder, ...derived.map(({ interest }) => interest)];
  const weights = Object.fromEntries(order.map((interest, index) => {
    const weight = config.weightByRank[index];
    if (weight === undefined) {throw new Error(`Ontbrekend gewicht voor kerninteressepositie ${String(index + 1)}`);}
    return [interest, weight];
  })) as Record<DirectDomain, number>;
  const derivedByInterest = new Map(derived.map((entry) => [entry.interest, entry]));
  const entries = order.map((interest, index) => {
    const derivedEntry = derivedByInterest.get(interest);
    const aggregate = aggregates.get(interest);
    return {
      interest,
      label: CORE_INTEREST_LABELS[interest],
      rank: index + 1,
      weight: weights[interest],
      source: config.manualOrder.includes(interest) ? "manual" as const : "derived" as const,
      evidenceDocumentCount: derivedEntry?.evidenceDocumentCount ?? aggregate?.documentIds.size ?? 0,
      evidenceScore: derivedEntry?.evidenceScore ?? 0,
    };
  });

  return { version: CORE_INTEREST_PRIORITY_VERSION, generatedAt, order, weights, entries };
}

export function coreInterestBonus(
  matches: readonly CoreInterestMatch[],
  priority: CoreInterestPriority,
): { bonus: number; matches: WeightedCoreInterestMatch[] } {
  const seen = new Set<DirectDomain>();
  const weightedMatches = matches.flatMap((match) => {
    if (seen.has(match.interest)) {return [];}
    seen.add(match.interest);
    const weight = priority.weights[match.interest];
    if (weight === undefined) {throw new Error(`Kerninteresse ontbreekt in prioriteitsrangorde: ${match.interest}`);}
    return [{ ...match, weight }];
  });
  return { bonus: weightedMatches.reduce((sum, match) => sum + match.weight, 0), matches: weightedMatches };
}
