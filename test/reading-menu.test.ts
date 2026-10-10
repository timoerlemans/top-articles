import assert from "node:assert/strict";
import test from "node:test";
import { planMenu } from "../src/reading-menu.js";
import type { MenuInputs, ReadingMoment } from "../src/reading-menu.js";
import type { ArticleItem } from "../src/types/browser-data.js";
import type { ReadingTraits } from "../src/reading-profiles.js";
function article(id: string, minutes: number | null, category = "article"): ArticleItem {
  return { id, title: id, readingMinutes: minutes, category, position: null, author: null, siteName: null, language: null, readingTime: null, wordCount: null, publishedDate: null, savedDate: "2020-01-01", imageUrl: null, sourceUrl: null, readwiseUrl: `https://read.readwise.io/read/${id}`, summary: null, whyRead: null, bestMoment: null, tags: [], coreInterests: [], alsoIn: [] };
}
const light: ReadingTraits = { effort: 1, emotionalWeight: 0, tone: "warm", needFit: { ontspannen: 4, afleiding: 3, herkenning: 2, verkennen: 2, verdieping: 2 } };
const moment: ReadingMoment = { energy: "gemiddeld", mood: null, need: "ontspannen", budget: 10 };
function inputs(): MenuInputs { return { catalog: [article("a", 3), article("b", 5), article("c", 2), article("heavy", 1), article("video", 1, "video"), article("book", 1), article("unknown", null)], profiles: { a: light, b: light, c: light, heavy: { ...light, emotionalWeight: 4 }, video: light, book: light, unknown: light }, scores: { a: { score: 90, sequences: ["lees"] }, b: { score: 80, sequences: ["lees"] }, c: { score: 70, sequences: ["lees"] }, book: { score: 100, sequences: ["boek"] } }, readIds: [] }; }
test("menu starts light, respects whole-session time and excludes books/heavy/unknown/video", () => {
  assert.deepEqual(planMenu(inputs(), moment), [{ course: "voorgerecht", id: "a", minutes: 3 }, { course: "hoofdgerecht", id: "b", minutes: 5 }, { course: "nagerecht", id: "c", minutes: 2 }]);
  assert.deepEqual(planMenu(inputs(), { ...moment, budget: 3 }), [{ course: "voorgerecht", id: "a", minutes: 3 }]);
  assert.deepEqual(planMenu(inputs(), moment, ["a"])[0], { course: "voorgerecht", id: "c", minutes: 2 });
});
test("there is no heavy or five-minute fallback for an empty appetizer", () => {
  assert.deepEqual(planMenu(inputs(), moment, ["a", "c"]), []);
});
test("menu suggestions always have a direct Readwise Reader link", () => {
  const data = inputs();
  data.catalog = [...data.catalog, { ...article("missing-link", 1), readwiseUrl: null }];
  data.profiles = { ...data.profiles, "missing-link": light };
  data.scores = { ...data.scores, "missing-link": { score: 200, sequences: [] } };
  assert.ok(planMenu(data, moment).every(({ id }) => id !== "missing-link"));
});
test("read markers and low energy constrain every remaining course", () => {
  const data = inputs();
  data.readIds = ["a"];
  data.profiles = { ...data.profiles, b: { ...light, effort: 2 } };
  assert.deepEqual(planMenu(data, { ...moment, energy: "weinig" }), [{ course: "voorgerecht", id: "c", minutes: 2 }]);
});

test("mood is soft and priority breaks equal fits before oldest date and ID", () => {
  const data = inputs();
  data.profiles = { ...data.profiles, a: { ...light, tone: "zakelijk" } };
  assert.equal(planMenu(data, { ...moment, mood: "gespannen" })[0]?.id, "c");
  assert.equal(planMenu(data, moment, ["c"])[0]?.id, "a");
});

test("new mood choices gently rank tone or effort without overriding need and energy", () => {
  const data = inputs();
  data.catalog = data.catalog.map((item) => item.id === "b" ? article("b", 2) : item);
  data.profiles = {
    ...data.profiles,
    a: { ...light, tone: "warm", needFit: { ...light.needFit, ontspannen: 4 } },
    b: { ...light, tone: "reflectief", needFit: { ...light.needFit, ontspannen: 4 } },
    c: { ...light, effort: 0, tone: "warm", needFit: { ...light.needFit, ontspannen: 4 } },
    heavy: { ...light, effort: 2, needFit: { ...light.needFit, ontspannen: 4 } },
  };
  data.scores = {
    ...data.scores,
    a: { score: 90, sequences: [] },
    b: { score: 10, sequences: [] },
    c: { score: 5, sequences: [] },
    heavy: { score: 100, sequences: [] },
  };
  const withMood = (mood: string): ReadingMoment => ({ ...moment, mood } as unknown as ReadingMoment);

  assert.equal(planMenu(data, withMood("nieuwsgierig"))[0]?.id, "b");
  assert.equal(planMenu(data, withMood("vol-hoofd"))[0]?.id, "c");
  assert.ok(planMenu(data, withMood("nieuwsgierig")).some(({ id }) => id === "a"));
  assert.ok(planMenu(data, { ...withMood("vol-hoofd"), energy: "weinig" }).every(({ id }) => id !== "heavy"));
});

import { startSession, transitionSession, refreshSession } from "../src/reading-menu.js";
import { parseHistory, parseSession, reconcileHistory, writeStored } from "../src/reading-storage.js";
test("replacing is temporary and stale read confirmations cannot consume the next proposal", () => {
  const data = inputs(); const start = startSession(data, moment);
  const replaced = transitionSession(data, start, "replace", "a");
  assert.deepEqual(replaced.completed, []);
  assert.equal(replaced.proposal?.id, "c");
  const read = transitionSession(data, start, "read-next", "a");
  assert.deepEqual(read.completed, [{ id: "a", minutes: 3 }]);
  assert.equal(read.proposal?.id, "b");
  assert.equal(transitionSession(data, read, "read-next", "a"), read);
  assert.equal(transitionSession(data, start, "read-finish", "a").finished, true);
  assert.deepEqual(transitionSession(data, start, "stop").completed, []);
  assert.equal(transitionSession(data, read, "skip-main").proposal?.id, "c");
  const restored = parseSession(JSON.parse(JSON.stringify(read)));
  assert.ok(restored);
  assert.equal(refreshSession(data, restored).proposal?.id, "b");
});
test("archiving prunes only with a newer complete consistent catalog and never an older offline snapshot", () => {
  const history = { version: 1 as const, generatedAt: "2026-10-10T10:00:00Z", ids: ["a", "archived"] };
  assert.equal(reconcileHistory(history, ["a"], "2026-10-10T11:00:00Z", false), history);
  assert.equal(reconcileHistory(history, ["a"], "2026-10-09T11:00:00Z", true), history);
  assert.deepEqual(reconcileHistory(history, ["a"], "2026-10-10T11:00:00Z", true).ids, ["a"]);
  assert.deepEqual(parseHistory({ version: 1, ids: [123] }).ids, []);
  assert.equal(parseSession({ version: 1 }), null);
  assert.equal(writeStored({ setItem() { throw new Error("blocked"); } }, "read", history), false);
});

test("restored sessions accept the complete menu mood vocabulary", () => {
  for (const mood of ["neutraal", "rustig", "nieuwsgierig", "vrolijk", "somber", "gespannen", "vol-hoofd"]) {
    const restored = parseSession({ version: 1, moment: { ...moment, mood }, course: "voorgerecht", excluded: [], completed: [], proposal: null, finished: false });
    assert.equal(restored?.moment.mood, mood);
  }
});

import { latestHistory } from "../src/reading-storage.js";
test("an older tab adopts concurrent read/unread changes without regressing the newest watermark", () => {
  const older = { version: 1 as const, generatedAt: "2026-10-09", ids: ["cleared"] };
  const newer = { version: 1 as const, generatedAt: "2026-10-11", ids: ["new"] };
  assert.deepEqual(latestHistory(older, newer), newer);
  assert.deepEqual(latestHistory(newer, older), { ...older, generatedAt: newer.generatedAt });
});
