import { DIRECT_DOMAIN_TAGS } from "./readwise-priority-v2.js";
import type { DirectDomain } from "./readwise-priority-v2.js";

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
  priority: { score: number };
}

export interface SelectedCoreInterestArticle {
  interest: DirectDomain;
  rank: number;
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

function savedTime(article: CoreInterestArticle): number {
  const parsed = Date.parse(article.savedDate ?? "");
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function rankedCandidates(
  interest: DirectDomain,
  candidates: readonly CoreInterestCandidate[],
): Array<{ candidate: CoreInterestCandidate; rank: number }> {
  return candidates
    .filter(({ article }) => article.coreInterests.includes(interest))
    .sort((a, b) =>
      b.priority.score - a.priority.score ||
      savedTime(a.article) - savedTime(b.article) ||
      a.article.id.localeCompare(b.article.id)
    )
    .slice(0, 25)
    .map((candidate, index) => ({ candidate, rank: index + 1 }))
    .filter(({ candidate, rank }) => rank > 1 && candidate.article.readingMinutes !== null && candidate.article.readingMinutes < 15);
}

export function selectCoreInterestArticle(
  candidates: readonly CoreInterestCandidate[],
  random: () => number = Math.random,
): SelectedCoreInterestArticle | null {
  const available = CORE_INTERESTS.flatMap((interest) => {
    const ranked = rankedCandidates(interest, candidates);
    return ranked.length > 0 ? [{ interest, ranked }] : [];
  });
  if (available.length === 0) {
    return null;
  }

  const selectedInterest = available[randomIndex(random(), available.length)];
  if (!selectedInterest) {
    return null;
  }
  const selected = selectedInterest.ranked[randomIndex(random(), selectedInterest.ranked.length)];
  if (!selected) {
    return null;
  }
  return { interest: selectedInterest.interest, rank: selected.rank, article: selected.candidate.article };
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
  <p style="color: #888; font-size: 13px;">${escapeHtml(dateLabel)} · ${escapeHtml(label)} · positie ${String(selected.rank)} van de top-25</p>
  <p style="font-size: 18px;"><a href="${escapeHtml(article.readwiseUrl)}" style="color: #111;">${escapeHtml(article.title)}</a></p>
  <p style="font-size: 13px; color: #555;">Leestijd: ${String(readingMinutes)} minuten</p>
  ${article.whyRead ? `<p style="font-size: 14px; color: #555;">${escapeHtml(article.whyRead)}</p>` : ""}
</body></html>`,
    text: `Een artikel voor je (${dateLabel})\n\n${label} · positie ${String(selected.rank)} van de top-25\n${article.title}\n${article.readwiseUrl}\nLeestijd: ${String(readingMinutes)} minuten${article.whyRead ? `\n${article.whyRead}` : ""}\n`,
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
