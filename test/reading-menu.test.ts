import assert from "node:assert/strict";
import test from "node:test";
import { startSession, transitionSession, refreshSession } from "../src/reading-menu.js";
import type { MenuInputs, ReadingMoment, Mood } from "../src/reading-menu.js";
import type { ArticleItem } from "../src/types/browser-data.js";
import type { ReadingTraits } from "../src/reading-profiles.js";
function article(id: string, minutes: number | null, category = "article"): ArticleItem {
  return { id, title: id, readingMinutes: minutes, category, position: null, author: null, siteName: null, language: null, readingTime: null, wordCount: null, publishedDate: null, savedDate: "2020-01-01", imageUrl: null, sourceUrl: null, readwiseUrl: `https://read.readwise.io/read/${id}`, summary: null, whyRead: null, bestMoment: null, tags: [], coreInterests: [], alsoIn: [] };
}
const light: ReadingTraits = { effort: 1, emotionalWeight: 0, tone: "warm", needFit: { ontspannen: 4, afleiding: 3, herkenning: 2, verkennen: 2, verdieping: 2 } };
const moment: ReadingMoment = { energy: "gemiddeld", mood: null, need: "ontspannen", budget: 10 };
function inputs(): MenuInputs { return { catalog: [article("a", 3), article("b", 5), article("c", 2), article("heavy", 1), article("video", 1, "video"), article("book", 1), article("unknown", null)], profiles: { a: light, b: light, c: light, heavy: { ...light, emotionalWeight: 4 }, video: light, book: light, unknown: light }, scores: { a: { score: 90, sequences: ["lees"] }, b: { score: 80, sequences: ["lees"] }, c: { score: 70, sequences: ["lees"] }, book: { score: 100, sequences: ["boek"] } }, readIds: [] }; }
function menu(data: MenuInputs, selected: ReadingMoment, excluded: readonly string[] = []) {
  const session = startSession(data, selected);
  return excluded.length ? refreshSession(data, { ...session, excluded: [...excluded] }).proposals : session.proposals;
}
function rankingInputs(): MenuInputs {
  return {
    catalog: [article("a", 2), article("b", 2), article("c", 2)],
    profiles: { a: { ...light, tone: "zakelijk" }, b: { ...light, tone: "warm" }, c: { ...light, tone: "reflectief" } },
    scores: { a: { score: 90, sequences: [] }, b: { score: 80, sequences: [] }, c: { score: 70, sequences: [] } },
    readIds: [],
  };
}
test("menu starts light, respects whole-session time and excludes books/heavy/unknown/video", () => {
  assert.deepEqual(menu(inputs(), moment), [{ course: "voorgerecht", id: "a", minutes: 3 }, { course: "hoofdgerecht", id: "b", minutes: 5 }, { course: "nagerecht", id: "c", minutes: 2 }]);
  assert.deepEqual(menu(inputs(), { ...moment, budget: 3 }), [{ course: "voorgerecht", id: "a", minutes: 3 }]);
  assert.deepEqual(menu(inputs(), moment, ["a"])[0], { course: "voorgerecht", id: "c", minutes: 2 });
});
test("a missing appetizer offers a fitting main course with its own identity", () => {
  assert.deepEqual(menu(inputs(), moment, ["a", "c"]), [{ course: "hoofdgerecht", id: "b", minutes: 5 }]);
  const session = refreshSession(inputs(), { ...startSession(inputs(), moment), excluded: ["a", "c"] });
  assert.equal(session.course, "hoofdgerecht");
  assert.equal(session.proposal?.id, "b");
  assert.equal(session.plannedMinutes, 5);
  const finished = transitionSession(inputs(), session, "read-next", "b");
  assert.equal(finished.confirmedMinutes, 5);
  assert.deepEqual(finished.proposals, []);
  assert.equal(transitionSession(inputs(), session, "replace", "b").proposal, null);
  assert.equal(transitionSession(inputs(), session, "skip-main").proposal, null);
  assert.equal(transitionSession(inputs(), session, "stop").confirmedMinutes, 0);
  assert.equal(transitionSession(inputs(), finished, "read-next", "b").confirmedMinutes, 5);
});
test("an incomplete menu keeps all candidate limits and the remaining budget", () => {
  const data = inputs();
  data.readIds = ["a", "c"];
  assert.deepEqual(menu(data, { ...moment, budget: 4 }), []);
  assert.deepEqual(menu(data, { ...moment, budget: 5 }), [{ course: "hoofdgerecht", id: "b", minutes: 5 }]);
  assert.deepEqual(menu(data, { ...moment, budget: 10 }), [{ course: "hoofdgerecht", id: "b", minutes: 5 }]);
  data.profiles = { ...data.profiles, b: { ...light, effort: 2 } };
  assert.deepEqual(menu(data, { ...moment, energy: "weinig" }), []);
});
test("menu suggestions always have a direct Readwise Reader link", () => {
  const data = inputs();
  data.catalog = [...data.catalog, { ...article("missing-link", 1), readwiseUrl: null }];
  data.profiles = { ...data.profiles, "missing-link": light };
  data.scores = { ...data.scores, "missing-link": { score: 200, sequences: [] } };
  assert.ok(menu(data, moment).every(({ id }) => id !== "missing-link"));
});
test("read markers and low energy constrain every remaining course", () => {
  const data = inputs();
  data.readIds = ["a"];
  data.profiles = { ...data.profiles, b: { ...light, effort: 2 } };
  assert.deepEqual(menu(data, { ...moment, energy: "weinig" }), [{ course: "voorgerecht", id: "c", minutes: 2 }]);
});

test("mood is soft and priority breaks equal fits before oldest date and ID", () => {
  const data = inputs();
  data.profiles = { ...data.profiles, a: { ...light, tone: "zakelijk" } };
  assert.equal(menu(data, { ...moment, mood: "gespannen" })[0]?.id, "c");
  assert.equal(menu(data, moment, ["c"])[0]?.id, "a");
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
  const withMood = (mood: Mood): ReadingMoment => ({ ...moment, mood });

  assert.equal(menu(data, withMood("nieuwsgierig"))[0]?.id, "b");
  assert.equal(menu(data, withMood("vol-hoofd"))[0]?.id, "c");
  assert.ok(menu(data, withMood("nieuwsgierig")).some(({ id }) => id === "a"));
  assert.ok(menu(data, { ...withMood("vol-hoofd"), energy: "weinig" }).every(({ id }) => id !== "heavy"));
});

test("the selected need outranks mood and priority and excludes insufficient need matches", () => {
  const data = rankingInputs();
  data.profiles = {
    a: { ...light, tone: "warm", needFit: { ...light.needFit, verkennen: 3 } },
    b: { ...light, tone: "zakelijk", needFit: { ...light.needFit, verkennen: 4 } },
    c: { ...light, tone: "warm", needFit: { ...light.needFit, verkennen: 1 } },
  };
  assert.deepEqual(menu(data, { ...moment, need: "verkennen", mood: "gespannen" }).map(({ id }) => id), ["b", "a"]);
});

const toneCases: readonly [Mood, readonly string[]][] = [
  ["rustig", ["b", "a", "c"]],
  ["nieuwsgierig", ["c", "a", "b"]],
  ["vrolijk", ["b", "a", "c"]],
  ["somber", ["b", "a", "c"]],
  ["gespannen", ["b", "a", "c"]],
];
for (const [mood, expected] of toneCases) {
  test(`mood ${mood} reorders tone matches without excluding other tones`, () => {
    assert.deepEqual(menu(rankingInputs(), { ...moment, mood }).map(({ id }) => id), expected);
  });
}

test("no mood preference and a neutral mood leave priority in control", () => {
  for (const mood of [null, "neutraal"] as const) {
    assert.deepEqual(menu(rankingInputs(), { ...moment, mood }).map(({ id }) => id), ["a", "b", "c"]);
  }
});

test("full head favors lower effort before priority", () => {
  const data = rankingInputs();
  data.profiles = { ...data.profiles, c: { ...light, effort: 0, tone: "reflectief" } };
  assert.deepEqual(menu(data, { ...moment, mood: "vol-hoofd" }).map(({ id }) => id), ["c", "a", "b"]);
});

test("full head preserves the explicitly chosen energy limit for the main course", () => {
  const data: MenuInputs = {
    catalog: [article("starter", 2), article("main", 6)],
    profiles: { starter: { ...light, effort: 0 }, main: { ...light, effort: 3 } },
    scores: { starter: { score: 10, sequences: [] }, main: { score: 100, sequences: [] } },
    readIds: [],
  };
  assert.deepEqual(menu(data, { ...moment, mood: "vol-hoofd", energy: "veel" }), [
    { course: "voorgerecht", id: "starter", minutes: 2 },
    { course: "hoofdgerecht", id: "main", minutes: 6 },
  ]);
  for (const energy of ["weinig", "gemiddeld"] as const) {
    assert.deepEqual(menu(data, { ...moment, mood: "vol-hoofd", energy }), [{ course: "voorgerecht", id: "starter", minutes: 2 }]);
  }
});

test("mood does not admit missing profiles or unknown and nonpositive reading times", () => {
  const data: MenuInputs = {
    catalog: [article("valid", 2), article("missing-profile", 1), article("unknown", null), article("zero", 0), article("negative", -1), article("infinite", Infinity), article("not-a-number", NaN)],
    profiles: { valid: { ...light, tone: "zakelijk" }, unknown: light, zero: light, negative: light, infinite: light, "not-a-number": light },
    scores: {},
    readIds: [],
  };
  assert.deepEqual(menu(data, { ...moment, mood: "gespannen" }), [{ course: "voorgerecht", id: "valid", minutes: 2 }]);
});

test("equal need and tone matches use priority then saved date then document ID", () => {
  const data = rankingInputs();
  data.catalog = [{ ...article("b", 2), savedDate: "2021-01-01" }, article("a", 2), { ...article("c", 2), savedDate: "2019-01-01" }];
  data.profiles = { a: light, b: light, c: light };
  data.scores = { a: { score: 50, sequences: [] }, b: { score: 50, sequences: [] }, c: { score: 50, sequences: [] } };
  assert.deepEqual(menu(data, { ...moment, mood: "rustig" }).map(({ id }) => id), ["c", "a", "b"]);
  data.catalog = [article("b", 2), article("a", 2), article("c", 2)];
  assert.deepEqual(menu(data, { ...moment, mood: "rustig" }).map(({ id }) => id), ["a", "b", "c"]);
});

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
  assert.deepEqual(restored.proposals, []);
  assert.equal(refreshSession(data, restored).proposal?.id, "b");
});
test("the session owns the complete menu and refreshes it with current read markers", () => {
  const data = inputs();
  const start = startSession(data, moment);
  assert.deepEqual(start.proposals, [
    { course: "voorgerecht", id: "a", minutes: 3 },
    { course: "hoofdgerecht", id: "b", minutes: 5 },
    { course: "nagerecht", id: "c", minutes: 2 },
  ]);
  assert.equal(start.proposal?.id, "a");
  assert.equal(start.confirmedMinutes, 0);
  assert.equal(start.plannedMinutes, 10);

  const afterRead = transitionSession(data, start, "read-next", "a");
  assert.deepEqual(afterRead.proposals, [
    { course: "hoofdgerecht", id: "b", minutes: 5 },
    { course: "nagerecht", id: "c", minutes: 2 },
  ]);
  assert.equal(afterRead.proposal?.id, "b");
  assert.equal(afterRead.confirmedMinutes, 3);
  assert.equal(afterRead.plannedMinutes, 7);

  const changed = { ...data, readIds: ["b"] };
  const refreshed = refreshSession(changed, afterRead);
  assert.deepEqual(refreshed.proposals, [{ course: "hoofdgerecht", id: "c", minutes: 2 }]);
  assert.equal(refreshed.proposal?.id, "c");
  assert.equal(refreshed.confirmedMinutes, 3);
  assert.equal(refreshed.plannedMinutes, 2);
});
test("a session keeps confirmed time when the budget is lowered below it", () => {
  const data = inputs();
  const start = startSession(data, moment);
  const afterStarter = transitionSession(data, start, "read-next", "a");
  const afterMain = transitionSession(data, afterStarter, "read-next", "b");

  const reduced = refreshSession(data, { ...afterMain, moment: { ...moment, budget: 5 } });
  assert.deepEqual(reduced.completed, [{ id: "a", minutes: 3 }, { id: "b", minutes: 5 }]);
  assert.deepEqual(reduced.proposals, []);
  assert.equal(reduced.proposal, null);
  assert.equal(reduced.confirmedMinutes, 8);
  assert.equal(reduced.plannedMinutes, 0);

  const increased = refreshSession(data, { ...reduced, moment: { ...moment, budget: 10 } });
  assert.deepEqual(increased.proposals, [{ course: "nagerecht", id: "c", minutes: 2 }]);
  assert.deepEqual(increased.proposal, increased.proposals[0]);
  assert.equal(increased.confirmedMinutes, 8);
  assert.equal(increased.plannedMinutes, 2);
});
test("finished sessions clear the complete menu as well as the current proposal", () => {
  const data = inputs();
  const start = startSession(data, moment);
  const finished = transitionSession(data, start, "read-finish", "a");
  const stopped = transitionSession(data, start, "stop");
  assert.deepEqual(finished.proposals, []);
  assert.equal(finished.proposal, null);
  assert.deepEqual(stopped.proposals, []);
  assert.equal(stopped.proposal, null);
  assert.equal(finished.confirmedMinutes, 3);
  assert.equal(finished.plannedMinutes, 0);
  assert.equal(stopped.confirmedMinutes, 0);
  assert.equal(stopped.plannedMinutes, 0);
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

test("restored sessions preserve confirmed time above a lowered budget", () => {
  const restored = parseSession({
    version: 1,
    moment: { ...moment, budget: 5 },
    course: "nagerecht",
    excluded: [],
    completed: [{ id: "a", minutes: 3 }, { id: "b", minutes: 5 }],
    proposal: null,
    finished: false,
  });
  assert.ok(restored);
  assert.equal(restored.moment.budget, 5);
  assert.deepEqual(restored.completed, [{ id: "a", minutes: 3 }, { id: "b", minutes: 5 }]);
  assert.deepEqual(restored.proposals, []);
});

test("restored sessions discard stale derived proposals", () => {
  const restored = parseSession({
    version: 1,
    moment,
    course: "voorgerecht",
    excluded: [],
    completed: [],
    proposals: [{ course: "voorgerecht", id: "stale", minutes: 1 }],
    proposal: { course: "voorgerecht", id: "stale", minutes: 1 },
    finished: false,
  });
  assert.ok(restored);
  assert.deepEqual(restored.proposals, []);
  assert.equal(restored.proposal, null);
});

test("restored sessions reject non-finite confirmed-time totals", () => {
  assert.equal(parseSession({
    version: 1,
    moment,
    course: "voorgerecht",
    excluded: [],
    completed: [{ id: "a", minutes: Number.MAX_VALUE }, { id: "b", minutes: Number.MAX_VALUE }],
    proposal: null,
    finished: false,
  }), null);
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
