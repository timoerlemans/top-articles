import { DIRECT_DOMAIN_TAGS } from "./readwise-priority-v2.js";
import type { DirectDomain } from "./readwise-priority-v2.js";
import { SEQUENCE_ORDER } from "./priority-sequences.js";
import type { PrioritySequence } from "./priority-sequences.js";

export interface CoreInterestArticle {
  id: string;
  title: string;
  readwiseUrl: string;
  whyRead: string | null;
  readingMinutes: number | null;
  savedDate: string | null;
  coreInterests: readonly DirectDomain[];
}

export interface CoreInterestCandidate {
  article: CoreInterestArticle;
  priority: {
    score: number;
    actualPositions: Readonly<Record<string, number>>;
  };
}

export interface SelectedCoreInterestArticle {
  interest: DirectDomain;
  sequence: PrioritySequence;
  position: number;
  tag: string;
  article: CoreInterestArticle;
}

export interface CoreInterestEmail {
  subject: string;
  html: string;
  text: string;
}

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
  agile: "Agile",
};

const CORE_INTERESTS = Object.keys(DIRECT_DOMAIN_TAGS) as DirectDomain[];
const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";

function randomIndex(randomValue: number, length: number): number {
  const bounded = Math.max(0, Math.min(0.999999999, randomValue));
  return Math.floor(bounded * length);
}

function ordinalTag(sequence: PrioritySequence, position: number): string {
  return `${sequence}-${String(position).padStart(sequence === "lees" ? 4 : 3, "0")}`;
}

function bestTagPosition(candidate: CoreInterestCandidate): { sequence: PrioritySequence; position: number; tag: string } | null {
  return SEQUENCE_ORDER
    .flatMap((sequence) => {
      const position = candidate.priority.actualPositions[sequence];
      if (position === undefined || !Number.isInteger(position) || position < 2 || position > 25) {
        return [];
      }
      return [{ sequence, position, tag: ordinalTag(sequence, position) }];
    })
    .sort((a, b) => a.position - b.position || SEQUENCE_ORDER.indexOf(a.sequence) - SEQUENCE_ORDER.indexOf(b.sequence))[0] ?? null;
}

function positionedCandidates(
  interest: DirectDomain,
  candidates: readonly CoreInterestCandidate[],
): Array<{ candidate: CoreInterestCandidate; position: { sequence: PrioritySequence; position: number; tag: string } }> {
  return candidates
    .filter(({ article }) => article.coreInterests.includes(interest))
    .flatMap((candidate) => {
      const position = bestTagPosition(candidate);
      return position !== null && candidate.article.readingMinutes !== null && candidate.article.readingMinutes < 15
        ? [{ candidate, position }]
        : [];
    })
    .sort((a, b) =>
      a.position.position - b.position.position ||
      a.position.sequence.localeCompare(b.position.sequence) ||
      a.candidate.article.id.localeCompare(b.candidate.article.id)
    );
}

export function selectCoreInterestArticle(
  candidates: readonly CoreInterestCandidate[],
  random: () => number = Math.random,
): SelectedCoreInterestArticle | null {
  const available = CORE_INTERESTS.flatMap((interest) => {
    const positioned = positionedCandidates(interest, candidates);
    return positioned.length > 0 ? [{ interest, positioned }] : [];
  });
  if (available.length === 0) {
    return null;
  }

  const selectedInterest = available[randomIndex(random(), available.length)];
  if (!selectedInterest) {
    return null;
  }
  const selected = selectedInterest.positioned[randomIndex(random(), selectedInterest.positioned.length)];
  if (!selected) {
    return null;
  }
  return {
    interest: selectedInterest.interest,
    sequence: selected.position.sequence,
    position: selected.position.position,
    tag: selected.position.tag,
    article: selected.candidate.article,
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return character;
    }
  });
}

export function buildCoreInterestEmail(
  selected: SelectedCoreInterestArticle,
  dateLabel: string,
): CoreInterestEmail {
  const label = CORE_INTEREST_LABELS[selected.interest];
  const { article } = selected;
  const readingMinutes = article.readingMinutes ?? 0;
  return {
    subject: `Een artikel voor je — ${label} — ${dateLabel}`,
    html: `<!doctype html>
<html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="font-size: 20px;">Een artikel voor je</h1>
  <p style="color: #888; font-size: 13px;">${escapeHtml(dateLabel)} · ${escapeHtml(label)} · ${escapeHtml(selected.tag)} · positie ${String(selected.position)} van de top-25</p>
  <p style="font-size: 18px;"><a href="${escapeHtml(article.readwiseUrl)}" style="color: #111;">${escapeHtml(article.title)}</a></p>
  <p style="font-size: 13px; color: #555;">Leestijd: ${String(readingMinutes)} minuten</p>
  ${article.whyRead ? `<p style="font-size: 14px; color: #555;">${escapeHtml(article.whyRead)}</p>` : ""}
</body></html>`,
    text: `Een artikel voor je (${dateLabel})\n\n${label} · ${selected.tag} · positie ${String(selected.position)} van de top-25\n${article.title}\n${article.readwiseUrl}\nLeestijd: ${String(readingMinutes)} minuten${article.whyRead ? `\n${article.whyRead}` : ""}\n`,
  };
}

export function amsterdamDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isAmsterdamEightOClock(date: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: AMSTERDAM_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).find((part) => part.type === "hour")?.value);
  return hour === 8;
}

export function shouldSendCoreInterestEmail(date: Date, force: boolean): boolean {
  return force || isAmsterdamEightOClock(date);
}

export function dailyRandomFor(seed: string): () => number {
  let state = 2_166_136_261;
  for (const character of seed) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined) {
      state = Math.imul(state ^ codePoint, 16_777_619) >>> 0;
    }
  }
  return () => {
    state = (state + 1_836_731_593) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function coreInterestRandomFor(date: Date): () => number {
  return dailyRandomFor(`${amsterdamDateKey(date)}-${String(date.getTime())}`);
}
