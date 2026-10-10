import { isShort } from "./reading-policy.js";
import type { ArticleItem } from "./types/browser-data.js";
import type { ReadingNeed, ReadingTraits } from "./reading-profiles.js";
export type Energy = "weinig" | "gemiddeld" | "veel";
export const READING_MOODS = ["neutraal", "rustig", "nieuwsgierig", "vrolijk", "somber", "gespannen", "vol-hoofd"] as const;
export type Mood = typeof READING_MOODS[number] | null;
export type Course = "voorgerecht" | "hoofdgerecht" | "nagerecht";
export interface ReadingMoment { energy: Energy; mood: Mood; need: ReadingNeed; budget: number; }
export interface MenuInputs {
  catalog: readonly ArticleItem[];
  profiles: Readonly<Record<string, ReadingTraits>>;
  scores: Readonly<Record<string, { score: number; sequences: readonly string[] }>>;
  readIds: readonly string[];
}
export interface MenuProposal { course: Course; id: string; minutes: number; }
export interface MenuSession {
  version: 1;
  moment: ReadingMoment;
  course: Course;
  excluded: string[];
  completed: Array<{ id: string; minutes: number }>;
  proposal: MenuProposal | null;
  finished: boolean;
}
const COURSES: readonly Course[] = ["voorgerecht", "hoofdgerecht", "nagerecht"];
function preferredTones(moment: ReadingMoment): string[] {
  if (moment.mood === "rustig" || moment.mood === "gespannen") { return ["rustig", "warm"]; }
  if (moment.mood === "nieuwsgierig") { return ["reflectief", "speels"]; }
  if (moment.mood === "vrolijk") { return ["speels", "warm"]; }
  if (moment.mood === "somber") {
    if (moment.need === "afleiding") { return ["speels", "warm", "rustig"]; }
    if (moment.need === "herkenning") { return ["warm", "reflectief"]; }
    return ["rustig", "warm"];
  }
  return [];
}
function hasReaderLink(url: string | null): boolean {
  try {
    const parsed = new URL(url ?? "");
    return parsed.protocol === "https:" && parsed.hostname === "read.readwise.io" && parsed.pathname.startsWith("/read/");
  } catch { return false; }
}
function savedTime(item: ArticleItem): number {
  const time = Date.parse(item.savedDate ?? "");
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}
export function planMenu(inputs: MenuInputs, moment: ReadingMoment, excluded: readonly string[] = [], start: Course = "voorgerecht", spent = 0): MenuProposal[] {
  if (!Number.isFinite(moment.budget) || moment.budget <= 0 || spent < 0 || !Number.isFinite(spent)) { return []; }
  const blocked = new Set([...inputs.readIds, ...excluded]);
  const cap = { weinig: 1, gemiddeld: 2, veel: 4 }[moment.energy];
  const tones = preferredTones(moment);
  const pool = inputs.catalog.filter((item) => {
    const profile = inputs.profiles[item.id];
    return !blocked.has(item.id) && ["article", "email", "rss", "pdf"].includes(item.category ?? "")
      && hasReaderLink(item.readwiseUrl)
      && !inputs.scores[item.id]?.sequences.includes("boek")
      && !item.tags.some((tag) => /^(books?|epub)$/i.test(tag))
      && profile && profile.needFit[moment.need] >= 2 && profile.effort <= cap && profile.emotionalWeight <= cap
      && item.readingMinutes !== null && Number.isFinite(item.readingMinutes) && item.readingMinutes > 0;
  }).sort((a, b) => {
    const ap = inputs.profiles[a.id]; const bp = inputs.profiles[b.id];
    if (!ap || !bp) { return 0; }
    return bp.needFit[moment.need] - ap.needFit[moment.need]
      || Number(tones.includes(bp.tone)) - Number(tones.includes(ap.tone))
      || (moment.mood === "vol-hoofd" ? ap.effort - bp.effort : 0)
      || (inputs.scores[b.id]?.score ?? 0) - (inputs.scores[a.id]?.score ?? 0)
      || savedTime(a) - savedTime(b) || a.id.localeCompare(b.id);
  });
  let remaining = moment.budget - spent;
  const result: MenuProposal[] = [];
  for (const course of COURSES.slice(COURSES.indexOf(start))) {
    const item = pool.find((candidate) => {
      const profile = inputs.profiles[candidate.id];
      return !blocked.has(candidate.id) && candidate.readingMinutes !== null && candidate.readingMinutes <= remaining
        && profile && (course === "hoofdgerecht" || (isShort(candidate.readingMinutes) && profile.effort <= 1 && profile.emotionalWeight <= 1))
        && (course !== "voorgerecht" || profile.needFit.ontspannen >= 3);
    });
    // An appetizer never silently becomes a main course.
    if (!item && course === "voorgerecht") { return []; }
    if (item && item.readingMinutes !== null) {
      result.push({ course, id: item.id, minutes: item.readingMinutes });
      blocked.add(item.id); remaining -= item.readingMinutes;
    }
  }
  return result;
}
export function startSession(inputs: MenuInputs, moment: ReadingMoment): MenuSession {
  return refreshSession(inputs, { version: 1, moment, course: "voorgerecht", excluded: [], completed: [], proposal: null, finished: false });
}
export function refreshSession(inputs: MenuInputs, session: MenuSession): MenuSession {
  if (session.finished) { return { ...session, proposal: null }; }
  const proposal = planMenu(inputs, session.moment, [...session.excluded, ...session.completed.map((entry) => entry.id)], session.course,
    session.completed.reduce((sum, entry) => sum + entry.minutes, 0))[0] ?? null;
  return { ...session, course: proposal?.course ?? session.course, proposal };
}
export type MenuAction = "replace" | "read-next" | "read-finish" | "stop" | "skip-main";
export function transitionSession(inputs: MenuInputs, session: MenuSession, action: MenuAction, proposalId?: string): MenuSession {
  if (session.finished) { return session; }
  if (action === "stop") { return { ...session, finished: true, proposal: null }; }
  if (action === "skip-main" && session.course === "hoofdgerecht") { return refreshSession(inputs, { ...session, course: "nagerecht" }); }
  const proposal = session.proposal;
  if (!proposal || proposal.id !== proposalId) { return session; }
  if (action === "replace") { return refreshSession(inputs, { ...session, excluded: [...session.excluded, proposal.id] }); }
  if (action !== "read-next" && action !== "read-finish") { return session; }
  const completed = [...session.completed, { id: proposal.id, minutes: proposal.minutes }];
  const next = COURSES[COURSES.indexOf(session.course) + 1];
  if (action === "read-finish" || !next) { return { ...session, completed, finished: true, proposal: null }; }
  return refreshSession(inputs, { ...session, completed, course: next });
}
