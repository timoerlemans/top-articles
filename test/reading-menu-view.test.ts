import assert from "node:assert/strict";
import test from "node:test";
import { mountReadingMenu } from "../src/reading-menu-view.js";
import type { ArticleItem, TopArticles, TopArticlePriority } from "../src/types/browser-data.js";
import type { ReadingTraits, ReadingNeed } from "../src/reading-profiles.js";
import { parseReadingMenu } from "../src/reading-profiles.js";
import { fingerprint, PROFILE_RUBRIC, profileSourceFingerprint, publicReadingMenu } from "../scripts/lib/reading-profiles.js";
import type { ReadingProfile } from "../scripts/lib/reading-profiles.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: { preventDefault?: () => void }) => void>();
  className = "";
  tabIndex = 0;
  open = false;
  private text = "";

  constructor(readonly tagName: string) {}
  append(...nodes: FakeElement[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeElement[]): void { this.children.splice(0, this.children.length, ...nodes); this.text = ""; }
  set textContent(value: string) { this.text = value; this.children.length = 0; }
  get textContent(): string { return this.text + this.children.map(({ textContent }) => textContent).join(""); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  addEventListener(name: string, listener: (event: { preventDefault?: () => void }) => void): void { this.listeners.set(name, listener); }
  click(): void { this.listeners.get("click")?.({}); }
  focus(): void {}
}

function descendants(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(descendants)];
}
function byClass(root: FakeElement, className: string): FakeElement[] {
  return descendants(root).filter((element) => element.className.split(/\s+/).includes(className));
}
function byText(root: FakeElement, tagName: string, text: string): FakeElement | undefined {
  return descendants(root).find((element) => element.tagName === tagName && element.textContent === text);
}
function choose(root: FakeElement, label: string): FakeElement {
  const option = byText(root, "button", label);
  assert.ok(option, `Missing choice: ${label}`);
  option.click();
  return option;
}
function historyIds(storage: MemoryStorage): unknown {
  const value = storage.getItem("top-articles-reading-history-v1");
  if (!value) { return undefined; }
  const parsed: unknown = JSON.parse(value);
  return parsed && typeof parsed === "object" && "ids" in parsed ? parsed.ids : undefined;
}
function makeArticle(id: string, minutes: number): ArticleItem {
  return { id, title: `Artikel ${id}`, readingMinutes: minutes, category: "article", position: null, author: null, siteName: null, language: "nl", readingTime: `${minutes} min`, wordCount: 300, publishedDate: null, savedDate: "2020-01-01", imageUrl: null, sourceUrl: null, readwiseUrl: `https://read.readwise.io/read/${id}`, summary: `Beschrijving ${id}`, whyRead: null, bestMoment: null, tags: [], coreInterests: [], alsoIn: [] };
}
const traits: ReadingTraits = { effort: 1, emotionalWeight: 0, tone: "warm", activation: 1, interruptibility: 3, needFit: { ontspannen: 4, afleiding: 3, herkenning: 2, verkennen: 2, verdieping: 2 } };
function fixture(
  catalog = [makeArticle("a", 3), makeArticle("b", 5), makeArticle("c", 2)],
  profiles: Record<string, ReadingTraits> = Object.fromEntries(catalog.map(({ id }) => [id, traits])),
): { data: TopArticles; priority: TopArticlePriority } {
  const data = { generatedAt: "2026-10-10T00:00:00Z", families: [], catalog: { items: catalog }, derivedLists: {}, readingMenu: { version: 2, scope: "later", complete: true, profiles } } as unknown as TopArticles;
  const priority = { generatedAt: data.generatedAt, model: "readwise-priority-v8", scope: "later", coreInterestPriority: {}, items: Object.fromEntries(catalog.map(({ id }, index) => [id, { score: 90 - index * 10, sequences: ["lees"] }])) } as unknown as TopArticlePriority;
  return { data, priority };
}
function withDom(run: (root: FakeElement, local: MemoryStorage, session: MemoryStorage) => void): void {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const document = { createElement: (tagName: string) => new FakeElement(tagName) };
  const window = { localStorage: local, sessionStorage: session, addEventListener() {} };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: window });
  try { run(new FakeElement("section"), local, session); }
  finally {
    if (previousDocument) { Object.defineProperty(globalThis, "document", previousDocument); }
    else { Reflect.deleteProperty(globalThis, "document"); }
    if (previousWindow) { Object.defineProperty(globalThis, "window", previousWindow); }
    else { Reflect.deleteProperty(globalThis, "window"); }
  }
}

test("the menu opens with the default choices and all budget-fitting course cards", () => {
  withDom((root) => {
    const { data, priority } = fixture();
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    const cards = byClass(root, "reading-course-card");
    assert.equal(cards.length, 3);
    const expectedCards: readonly [string, string, number][] = [["Voorgerecht", "a", 3], ["Hoofdgerecht", "b", 5], ["Nagerecht", "c", 2]];
    for (const [index, [course, id, minutes]] of expectedCards.entries()) {
      const text = cards[index]?.textContent ?? "";
      assert.ok(text.includes(course));
      assert.ok(text.includes(`Artikel ${id}`));
      assert.ok(text.includes(`Beschrijving ${id}`));
      assert.ok(text.includes(`${minutes} min leestijd`));
    }
    for (const [choice, selected] of [["budget:15", "true"], ["need:ontspannen", "true"], ["energy:gemiddeld", "true"], ["mood:none", "true"]]) {
      assert.equal(descendants(root).find((element) => element.getAttribute("data-reading-choice") === choice)?.getAttribute("aria-pressed"), selected);
    }
    for (const budget of [5, 10, 15, 20, 30]) {
      assert.ok(descendants(root).some((element) => element.getAttribute("data-reading-choice") === `budget:${budget}`));
    }
    assert.equal(descendants(root).some(({ tagName }) => tagName === "form" || tagName === "select"), false);
    assert.equal(byClass(root, "reading-course-title").length, 3);
    assert.ok(descendants(root).filter(({ tagName }) => tagName === "a").every((link) => link.getAttribute("href")?.startsWith("https://read.readwise.io/read/")));
    assert.equal(byClass(root, "reading-course-time").reduce((sum, { textContent }) => sum + Number.parseFloat(textContent), 0), 10);

    descendants(root).find((element) => element.getAttribute("data-reading-choice") === "budget:5")?.click();
    const shortMenu = byClass(root, "reading-course-card");
    assert.equal(shortMenu.length, 2);
    assert.ok(shortMenu.every(({ textContent }) => textContent.includes("leestijd")));
    assert.equal(byClass(root, "reading-course-time").reduce((sum, { textContent }) => sum + Number.parseFloat(textContent), 0), 5);
    assert.equal(descendants(root).find((element) => element.getAttribute("data-reading-choice") === "budget:5")?.getAttribute("aria-pressed"), "true");
  });
});

test("opening a Reader link does not count as read; explicit confirmation records progress", () => {
  withDom((root, local, session) => {
    const { data, priority } = fixture();
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    const firstLink = byClass(root, "reading-course-title")[0];
    assert.ok(firstLink);
    firstLink.click();
    assert.deepEqual(historyIds(local), []);

    byText(root, "button", "Gelezen, volgende gang")?.click();
    assert.deepEqual(historyIds(local), ["a"]);
    assert.ok(session.getItem("top-articles-reading-session-v1"));
  });
});

test("a main course without an appetizer shows working read and skip actions", () => {
  withDom((root, local) => {
    const { data, priority } = fixture([makeArticle("main", 5)]);
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    const card = byClass(root, "reading-course-card")[0];
    assert.ok(card);
    assert.ok(card.textContent.includes("Hoofdgerecht"));
    assert.equal(card.getAttribute("data-current-course"), "true");
    assert.ok(byText(card, "button", "Sla hoofdgerecht over"));
    choose(root, "Gelezen, volgende gang");
    assert.deepEqual(historyIds(local), ["main"]);
    assert.ok(root.textContent.includes("5 min bevestigd gelezen"));
    assert.equal(byClass(root, "reading-course-card").length, 0);
  });
});

test("empty supply and spent budget have distinct explanations and adjustment actions", () => {
  withDom((root) => {
    const { data, priority } = fixture([makeArticle("main", 5)]);
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "5 min");
    choose(root, "Gelezen, volgende gang");
    assert.ok(root.textContent.includes("Je gekozen leestijd is opgebruikt"));
    assert.ok(byText(root, "button", "Pas leestijd aan"));
    assert.ok(byText(root, "button", "Rond leesmoment af"));
    choose(root, "10 min");
    assert.ok(root.textContent.includes("Geen passende artikelen voor dit leesmoment"));
    assert.ok(byText(root, "button", "Pas je leesmoment aan"));
    assert.equal(byClass(root, "reading-course-card").length, 0);
    choose(root, "Rond leesmoment af");
    assert.ok(root.textContent.includes("Leesmoment afgerond"));
  });
});

test("skipping a first main course exposes a light dessert without recording a read", () => {
  withDom((root, local) => {
    const limitedRelaxation = { ...traits, needFit: { ...traits.needFit, ontspannen: 2 } };
    const { data, priority } = fixture([makeArticle("main", 5), makeArticle("dessert", 2)], {
      main: limitedRelaxation, dessert: limitedRelaxation,
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "Sla hoofdgerecht over");
    const card = byClass(root, "reading-course-card")[0];
    assert.ok(card);
    assert.ok(card.textContent.includes("Nagerecht"));
    assert.equal(byClass(card, "reading-course-title")[0]?.textContent, "Artikel dessert");
    assert.equal(card.getAttribute("data-current-course"), "true");
    assert.deepEqual(historyIds(local), []);
    choose(root, "Gelezen, rond af");
    assert.deepEqual(historyIds(local), ["dessert"]);
  });
});

const needCases: readonly [string, ReadingNeed][] = [
  ["Licht & luchtig", "ontspannen"],
  ["Even iets anders", "afleiding"],
  ["Herkenning", "herkenning"],
  ["Een frisse invalshoek", "verkennen"],
  ["Iets om over na te denken", "verdieping"],
];
for (const [label, need] of needCases) {
  test(`need choice ${label} selects matching material while preserving mood and budget`, () => {
    withDom((root, local) => {
      const catalog = needCases.map(([, id]) => makeArticle(id, 2));
      const profiles: Record<string, ReadingTraits> = {};
      for (const [, id] of needCases) {
        profiles[id] = { ...traits, needFit: { ontspannen: 3, afleiding: 2, herkenning: 2, verkennen: 2, verdieping: 2, [id]: 4 } };
      }
      const { data, priority } = fixture(catalog, profiles);
      mountReadingMenu(root as unknown as HTMLElement, data, priority);
      choose(root, "10 min");
      choose(root, "Somber");
      assert.equal(choose(root, label).getAttribute("aria-pressed"), "true");
      assert.equal(byClass(root, "reading-course-title")[0]?.textContent, `Artikel ${need}`);
      assert.equal(byText(root, "button", "Somber")?.getAttribute("aria-pressed"), "true");
      assert.equal(byText(root, "button", "10 min")?.getAttribute("aria-pressed"), "true");
      assert.equal(byClass(root, "reading-course-time").reduce((sum, { textContent }) => sum + Number.parseFloat(textContent), 0), 6);
      assert.deepEqual(historyIds(local), []);
    });
  });
}

test("clearing a mood preference restores priority without changing need, energy or budget", () => {
  withDom((root, local) => {
    const { data, priority } = fixture([makeArticle("a", 3), makeArticle("b", 2), makeArticle("c", 2)], {
      a: { ...traits, tone: "zakelijk" }, b: { ...traits, tone: "reflectief" }, c: traits,
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "10 min");
    choose(root, "Herkenning");
    choose(root, "Veel");
    choose(root, "Nieuwsgierig");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel b");
    choose(root, "Geen voorkeur");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel a");
    for (const label of ["Geen voorkeur", "Herkenning", "Veel", "10 min"]) {
      assert.equal(byText(root, "button", label)?.getAttribute("aria-pressed"), "true");
    }
    assert.deepEqual(historyIds(local), []);
  });
});

test("full head keeps a high-energy main course available until the reader lowers energy", () => {
  withDom((root) => {
    const { data, priority } = fixture([makeArticle("a", 2), makeArticle("b", 6)], {
      a: { ...traits, effort: 0 }, b: { ...traits, effort: 3 },
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "10 min");
    choose(root, "Veel");
    choose(root, "Vol hoofd");
    assert.deepEqual(byClass(root, "reading-course-title").map(({ textContent }) => textContent), ["Artikel a", "Artikel b"]);
    assert.equal(byText(root, "button", "Veel")?.getAttribute("aria-pressed"), "true");
    choose(root, "Weinig");
    assert.deepEqual(byClass(root, "reading-course-title").map(({ textContent }) => textContent), ["Artikel a"]);
    assert.equal(byText(root, "button", "Vol hoofd")?.getAttribute("aria-pressed"), "true");
    assert.equal(byText(root, "button", "10 min")?.getAttribute("aria-pressed"), "true");
  });
});

test("need and mood changes preserve the remaining course, reading budget and explicit read actions", () => {
  withDom((root, local) => {
    const { data, priority } = fixture(undefined, {
      a: traits,
      b: { ...traits, tone: "reflectief", needFit: { ...traits.needFit, verkennen: 4 } },
      c: traits,
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "10 min");
    choose(root, "Gelezen, volgende gang");
    assert.deepEqual(historyIds(local), ["a"]);
    choose(root, "Een frisse invalshoek");
    choose(root, "Nieuwsgierig");
    const current = descendants(root).find((element) => element.getAttribute("data-current-course") === "true");
    assert.ok(current);
    assert.equal(byClass(current, "reading-course-title")[0]?.textContent, "Artikel b");
    assert.ok(current.textContent.includes("Hoofdgerecht"));
    assert.ok(root.textContent.includes("3 min bevestigd gelezen"));
    assert.equal(byText(root, "button", "10 min")?.getAttribute("aria-pressed"), "true");
    assert.deepEqual(historyIds(local), ["a"]);
    choose(current, "Gelezen, volgende gang");
    assert.deepEqual(historyIds(local), ["a", "b"]);
    assert.ok(root.textContent.includes("8 min bevestigd gelezen"));
    assert.equal(byClass(root, "reading-course-time").reduce((sum, { textContent }) => sum + Number.parseFloat(textContent), 0), 2);
  });
});

test("making a read marker available again refreshes the current card and its actions together", () => {
  withDom((root, local) => {
    const { data, priority } = fixture();
    local.setItem("top-articles-reading-history-v1", JSON.stringify({ version: 1, generatedAt: data.generatedAt, ids: ["a"] }));
    mountReadingMenu(root as unknown as HTMLElement, data, priority);

    byText(root, "button", "Opnieuw beschikbaar")?.click();
    const current = descendants(root).find((element) => element.getAttribute("data-current-course") === "true");
    assert.ok(current);
    assert.equal(byClass(current, "reading-course-title")[0]?.textContent, "Artikel a");
    for (const label of ["Vervang voorstel", "Gelezen, volgende gang", "Stop zonder dit artikel te markeren"]) {
      assert.ok(byText(current, "button", label), `Missing current-card action: ${label}`);
    }
  });
});

test("a restored session keeps over-budget progress and resumes after a later budget increase", () => {
  withDom((root, local, session) => {
    const { data, priority } = fixture();
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "10 min");
    byText(root, "button", "Gelezen, volgende gang")?.click();
    byText(root, "button", "Gelezen, volgende gang")?.click();
    choose(root, "5 min");

    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    assert.ok(root.textContent.includes("8 min bevestigd gelezen"));
    assert.equal(byText(root, "button", "5 min")?.getAttribute("aria-pressed"), "true");
    assert.equal(byClass(root, "reading-course-card").length, 0);

    choose(root, "10 min");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel c");
    assert.ok(byText(root, "button", "Gelezen, rond af"));
    assert.ok(session.getItem("top-articles-reading-session-v1"));
    assert.deepEqual(historyIds(local), ["a", "b"]);
  });
});

test("a finished session has no stale actions and a new session starts without old progress", () => {
  withDom((root, local) => {
    const { data, priority } = fixture();
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    byText(root, "button", "Gelezen, rond af")?.click();
    assert.ok(root.textContent.includes("Leesmoment afgerond"));
    assert.equal(byClass(root, "reading-actions").length, 0);

    byText(root, "button", "Nieuw leesmoment")?.click();
    assert.ok(root.textContent.includes("0 min bevestigd gelezen"));
    assert.ok(byClass(root, "reading-actions").length > 0);
    assert.deepEqual(historyIds(local), ["a"]);
  });
});

test("bedtime changes eligibility and ranking while keeping custom adjustments accessible", () => {
  withDom((root, local) => {
    const { data, priority } = fixture([makeArticle("activating", 2), makeArticle("calm-work", 3), makeArticle("neutral", 2)], {
      activating: { ...traits, activation: 3, tone: "reflectief" },
      "calm-work": { ...traits, activation: 1, tone: "warm" },
      neutral: { ...traits, activation: 0, tone: "zakelijk" },
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    assert.equal(byClass(root, "reading-adjustments")[0]?.open, false);
    assert.equal(byText(root, "button", "Zelf samenstellen")?.getAttribute("aria-pressed"), "true");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel activating");
    choose(root, "In bed voor het slapen");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel calm-work");
    assert.ok(byClass(root, "reading-course-title").every(el => el.textContent !== "Artikel activating"));
    for (const label of ["10 min", "Weinig", "Licht & luchtig", "Geen voorkeur"]) {
      assert.equal(byText(root, "button", label)?.getAttribute("aria-pressed"), "true");
    }
    assert.ok(byClass(root, "reading-settings-summary")[0]?.textContent.includes("In bed voor het slapen"));
    const adjustments = byClass(root, "reading-adjustments")[0]; assert.ok(adjustments); adjustments.open = true;
    choose(root, "Veel"); choose(root, "Nieuwsgierig"); choose(root, "30 min");
    assert.equal(adjustments.open, true);
    assert.equal(byText(root, "button", "In bed voor het slapen")?.getAttribute("aria-pressed"), "true");
    assert.ok(byClass(root, "reading-course-title").every(el => el.textContent !== "Artikel activating"));
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel calm-work");
    choose(root, "Zelf samenstellen");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel activating");
    assert.equal(byText(root, "button", "30 min")?.getAttribute("aria-pressed"), "true");
    assert.equal(byText(root, "button", "Nieuwsgierig")?.getAttribute("aria-pressed"), "true");
    assert.deepEqual(historyIds(local), []);
  });
});

test("reviewed source fixtures reach bedtime through the real publication and browser parser", () => {
  withDom((root) => {
    const preferences = "Accessible calm reading";
    const sources = [
      { id: "calm-work", category: "article", title: "A quiet closing ritual at work", reading_time: "3 min", summary: "Finish by putting papers away and noticing one completed task. No planning exercise or unresolved problem." },
      { id: "stimulating", category: "article", title: "An absorbing puzzle", reading_time: "2 min", summary: "An approachable logical paradox asks readers to hold competing premises in mind and solve an open problem." },
      { id: "moderate", category: "article", title: "A new project", reading_time: "2 min", summary: "Several inviting experiments to try next, requiring decisions and an action plan." },
    ];
    const profile = (source: typeof sources[number], activation: number): ReadingProfile => ({
      status: "accepted", confidence: "medium", rubricVersion: PROFILE_RUBRIC, sourceFingerprint: profileSourceFingerprint(source),
      preferencesFingerprint: fingerprint(preferences), evidenceFingerprint: fingerprint(source.summary), judgedBy: "Test fixture review", judgedAt: "2026-10-14",
      evidenceRefs: ["summary"], reason: activation === 1 ? "Self-contained gentle closing ritual, without an activating problem; work topic alone does not exclude it." : "Easy language invites sustained problem-solving or planning, so effort and activation differ.",
      traits: { ...traits, activation, interruptibility: activation === 1 ? 4 : 2 },
    });
    const { data, priority } = fixture([makeArticle("stimulating", 2), makeArticle("moderate", 2), makeArticle("calm-work", 3)]);
    const published = publicReadingMenu(sources, { version: 1, items: Object.fromEntries(sources.map((source, index) => [source.id, profile(source, index + 1)])) }, preferences);
    assert.equal(published.version, 2);
    const parsed = parseReadingMenu(published); assert.ok(parsed); data.readingMenu = parsed;
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "In bed voor het slapen");
    assert.deepEqual(byClass(root, "reading-course-title").map(el => el.textContent), ["Artikel calm-work"]);
  });
});

test("switching situation preserves confirmed time, remaining course and temporary exclusions", () => {
  withDom((root, local, stored) => {
    const { data, priority } = fixture([makeArticle("a", 3), makeArticle("b", 5), makeArticle("c", 2), makeArticle("d", 2)]);
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "Vervang voorstel");
    choose(root, "Gelezen, volgende gang");
    assert.deepEqual(historyIds(local), ["c"]);
    choose(root, "In bed voor het slapen");
    assert.ok(root.textContent.includes("2 min bevestigd gelezen"));
    const current = descendants(root).find(el => el.getAttribute("data-current-course") === "true"); assert.ok(current);
    assert.ok(current.textContent.includes("Hoofdgerecht"));
    assert.equal(byClass(current, "reading-course-title")[0]?.textContent, "Artikel b");
    assert.ok(byClass(root, "reading-course-title").every(el => el.textContent !== "Artikel a"));
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    assert.equal(byText(root, "button", "In bed voor het slapen")?.getAttribute("aria-pressed"), "true");
    assert.ok(root.textContent.includes("2 min bevestigd gelezen"));
    assert.ok(stored.getItem("top-articles-reading-session-v1")?.includes("bedtime"));
    choose(root, "Gelezen, rond af");
    choose(root, "Zelf samenstellen");
    assert.equal(byClass(root, "reading-course-card").length, 0);
    assert.ok(root.textContent.includes("Leesmoment afgerond"));
    assert.deepEqual(historyIds(local), ["c", "b"]);
  });
});

test("legacy sessions restore as custom and legacy production stays usable without invented suitability", () => {
  withDom((root, _local, stored) => {
    const { data, priority } = fixture();
    data.readingMenu = { version: 1, scope: "later", complete: true, profiles: { a: { effort: 1, emotionalWeight: 0, tone: "warm", needFit: traits.needFit } } };
    stored.setItem("top-articles-reading-session-v1", JSON.stringify({ version: 1, moment: { budget: 10, energy: "gemiddeld", need: "ontspannen", mood: null }, course: "voorgerecht", excluded: [], completed: [], finished: false }));
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    assert.equal(byText(root, "button", "Zelf samenstellen")?.getAttribute("aria-pressed"), "true");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel a");
    choose(root, "In bed voor het slapen");
    assert.equal(byClass(root, "reading-course-card").length, 0);
    assert.ok(byText(root, "button", "Zelf samenstellen"));
    choose(root, "Zelf samenstellen");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel a");
  });
});

const dailySituationDefaults = [
  ["Net wakker", "10 min", "Weinig", "Licht & luchtig"],
  ["Op de bank na een drukke werkdag", "20 min", "Weinig", "Even iets anders"],
  ["Rustig weekend", "30 min", "Veel", "Iets om over na te denken"],
] as const;
for (const [situation, budget, energy, need] of dailySituationDefaults) {
  test(`${situation} applies all defaults, clears mood and keeps its visible summary`, () => {
    withDom((root) => {
      const { data, priority } = fixture(); mountReadingMenu(root as unknown as HTMLElement, data, priority);
      choose(root, "Somber"); choose(root, situation);
      for (const label of [situation, budget, energy, need, "Geen voorkeur"]) {
        assert.equal(byText(root, "button", label)?.getAttribute("aria-pressed"), "true");
      }
      assert.ok(byClass(root, "reading-settings-summary")[0]?.textContent.includes(situation));
      assert.ok(byClass(root, "reading-course-card").length > 0);
      assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel a");
      choose(root, "Veel");
      assert.equal(byText(root, "button", situation)?.getAttribute("aria-pressed"), "true");
      choose(root, "Zelf samenstellen");
      assert.equal(byText(root, "button", budget)?.getAttribute("aria-pressed"), "true");
      assert.equal(byText(root, "button", "Veel")?.getAttribute("aria-pressed"), "true");
    });
  });
}

test("morning excludes activation three and ranks calm tone then lower activation before priority or mood", () => {
  withDom((root) => {
    const catalog = [makeArticle("active-three", 2), makeArticle("warm-two", 2), makeArticle("neutral-zero", 2), makeArticle("warm-one", 2)];
    const { data, priority } = fixture(catalog, {
      "active-three": { ...traits, activation: 3, tone: "reflectief" }, "warm-two": { ...traits, activation: 2 },
      "neutral-zero": { ...traits, activation: 0, tone: "zakelijk" }, "warm-one": { ...traits, activation: 1 },
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "10 min"); choose(root, "Weinig");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel active-three");
    choose(root, "Net wakker"); choose(root, "Nieuwsgierig");
    assert.deepEqual(byClass(root, "reading-course-title").map(el => el.textContent), ["Artikel warm-one", "Artikel warm-two", "Artikel neutral-zero"]);
    choose(root, "Veel");
    assert.ok(byClass(root, "reading-course-title").every(el => el.textContent !== "Artikel active-three"));
    choose(root, "Zelf samenstellen");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel active-three");
  });
});

test("after work softly prefers warm tone but admits activating businesslike content", () => {
  withDom((root) => {
    const { data, priority } = fixture([makeArticle("business", 2), makeArticle("warm", 2)], {
      business: { ...traits, activation: 4, tone: "zakelijk" }, warm: { ...traits, activation: 3, tone: "warm" },
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "Op de bank na een drukke werkdag");
    assert.deepEqual(byClass(root, "reading-course-title").map(el => el.textContent), ["Artikel warm", "Artikel business"]);
    choose(root, "Zelf samenstellen");
    assert.deepEqual(byClass(root, "reading-course-title").map(el => el.textContent), ["Artikel business", "Artikel warm"]);
  });
});

test("weekend keeps ordinary need and priority ordering with no additional activation bound", () => {
  withDom((root) => {
    const { data, priority } = fixture([makeArticle("starter", 2), makeArticle("deep", 8)], {
      starter: traits, deep: { ...traits, activation: 4, effort: 3, emotionalWeight: 3, needFit: { ...traits.needFit, verdieping: 4 } },
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "Rustig weekend");
    const weekend = byClass(root, "reading-course-title").map(el => el.textContent);
    assert.deepEqual(weekend, ["Artikel starter", "Artikel deep"]);
    choose(root, "Zelf samenstellen");
    assert.deepEqual(byClass(root, "reading-course-title").map(el => el.textContent), weekend);
  });
});

test("daily situation switches after replace/read preserve progress and reject stale card actions", () => {
  withDom((root, local) => {
    const { data, priority } = fixture([makeArticle("a", 3), makeArticle("b", 5), makeArticle("c", 2), makeArticle("d", 2)]);
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    const staleConfirmation = byText(root, "button", "Gelezen, volgende gang"); assert.ok(staleConfirmation);
    choose(root, "Vervang voorstel"); choose(root, "Net wakker"); staleConfirmation.click();
    assert.deepEqual(historyIds(local), []);
    choose(root, "Gelezen, volgende gang");
    assert.deepEqual(historyIds(local), ["c"]);
    for (const [situation] of dailySituationDefaults) {
      choose(root, situation);
      const current = descendants(root).find(el => el.getAttribute("data-current-course") === "true"); assert.ok(current);
      assert.ok(current.textContent.includes("Hoofdgerecht"));
      assert.equal(byClass(current, "reading-course-title")[0]?.textContent, "Artikel b");
      assert.ok(root.textContent.includes("2 min bevestigd gelezen"));
      assert.ok(byClass(root, "reading-course-title").every(el => el.textContent !== "Artikel a"));
      assert.deepEqual(historyIds(local), ["c"]);
    }
  });
});

const interruptedDefaults = [
  ["In de wachtkamer", "10 min", "Gemiddeld", "Even iets anders"],
  ["Onderweg in het ov", "20 min", "Gemiddeld", "Een frisse invalshoek"],
  ["Korte pauze tussendoor", "5 min", "Weinig", "Even iets anders"],
] as const;
for (const [situation, budget, energy, need] of interruptedDefaults) {
  test(`${situation} applies complete defaults without inferring an anxious mood`, () => {
    withDom((root) => {
      const { data, priority } = fixture(); mountReadingMenu(root as unknown as HTMLElement, data, priority);
      choose(root, "Gespannen"); choose(root, situation);
      for (const label of [situation, budget, energy, need, "Geen voorkeur"]) {
        assert.equal(byText(root, "button", label)?.getAttribute("aria-pressed"), "true");
      }
      assert.ok(byClass(root, "reading-settings-summary")[0]?.textContent.includes(situation));
      assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel a");
    });
  });
}

test("public transport admits a longer resumable main and excludes a short continuous argument", () => {
  withDom((root) => {
    const { data, priority } = fixture([makeArticle("continuous", 1), makeArticle("long", 12), makeArticle("short", 2)], {
      continuous: { ...traits, interruptibility: 2 }, long: { ...traits, interruptibility: 4, effort: 2 }, short: { ...traits, interruptibility: 3 },
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority); choose(root, "Onderweg in het ov");
    assert.deepEqual(byClass(root, "reading-course-title").map(el => el.textContent), ["Artikel short", "Artikel long"]);
    assert.ok(byClass(root, "reading-course-card")[1]?.textContent.includes("Hoofdgerecht"));
    assert.equal(byClass(root, "reading-course-time").reduce((sum, el) => sum + Number.parseFloat(el.textContent), 0), 14);
    choose(root, "10 min");
    assert.deepEqual(byClass(root, "reading-course-title").map(el => el.textContent), ["Artikel short"]);
    choose(root, "30 min"); choose(root, "Veel");
    assert.ok(byClass(root, "reading-course-title").every(el => el.textContent !== "Artikel continuous"));
    assert.equal(byText(root, "button", "Onderweg in het ov")?.getAttribute("aria-pressed"), "true");
  });
});

test("equal settings produce different eligibility and interruptibility outranks mood and priority", () => {
  withDom((root) => {
    const { data, priority } = fixture([makeArticle("continuous", 5), makeArticle("good", 5), makeArticle("best", 5)], {
      continuous: { ...traits, interruptibility: 2 }, good: { ...traits, interruptibility: 3 }, best: { ...traits, interruptibility: 4, tone: "zakelijk" },
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "In bed voor het slapen"); choose(root, "Gemiddeld"); choose(root, "Even iets anders");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel continuous");
    choose(root, "In de wachtkamer"); choose(root, "Rustig");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel best");
    choose(root, "Vervang voorstel");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel good");
    choose(root, "Vervang voorstel");
    assert.equal(byClass(root, "reading-course-card").length, 0);
  });
});

test("need fit precedes interruptibility among eligible articles", () => {
  withDom((root) => {
    const { data, priority } = fixture([makeArticle("need-first", 5), makeArticle("interruptible", 5)], {
      "need-first": { ...traits, interruptibility: 3, needFit: { ...traits.needFit, afleiding: 4 } }, interruptible: { ...traits, interruptibility: 4 },
    });
    mountReadingMenu(root as unknown as HTMLElement, data, priority); choose(root, "In de wachtkamer");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel need-first");
  });
});

test("empty interruption supply stays strict through adjustments and custom explicitly removes the requirement", () => {
  withDom((root, local) => {
    const { data, priority } = fixture([makeArticle("continuous", 2)], { continuous: { ...traits, interruptibility: 2 } });
    mountReadingMenu(root as unknown as HTMLElement, data, priority); choose(root, "In de wachtkamer");
    assert.equal(byClass(root, "reading-course-card").length, 0);
    choose(root, "Pas je leesmoment aan");
    assert.equal(byClass(root, "reading-adjustments")[0]?.open, true);
    choose(root, "30 min"); choose(root, "Veel"); choose(root, "Nieuwsgierig");
    assert.equal(byClass(root, "reading-course-card").length, 0);
    choose(root, "Zelf samenstellen");
    assert.equal(byClass(root, "reading-course-title")[0]?.textContent, "Artikel continuous");
    assert.equal(byText(root, "button", "30 min")?.getAttribute("aria-pressed"), "true");
    assert.deepEqual(historyIds(local), []);
  });
});

test("interruptible switches preserve exclusions, confirmed time and course across smaller budgets", () => {
  withDom((root, local) => {
    const { data, priority } = fixture([makeArticle("a", 3), makeArticle("b", 5), makeArticle("c", 2), makeArticle("d", 2)]);
    mountReadingMenu(root as unknown as HTMLElement, data, priority);
    choose(root, "Vervang voorstel"); choose(root, "Gelezen, volgende gang");
    choose(root, "Korte pauze tussendoor");
    assert.ok(root.textContent.includes("2 min bevestigd gelezen"));
    choose(root, "Onderweg in het ov");
    const main = descendants(root).find(el => el.getAttribute("data-current-course") === "true"); assert.ok(main);
    assert.ok(main.textContent.includes("Hoofdgerecht"));
    assert.equal(byClass(main, "reading-course-title")[0]?.textContent, "Artikel b");
    assert.ok(byClass(root, "reading-course-title").every(el => el.textContent !== "Artikel a"));
    choose(root, "Gelezen, volgende gang");
    choose(root, "Korte pauze tussendoor");
    assert.equal(byClass(root, "reading-course-card").length, 0);
    assert.ok(root.textContent.includes("7 min bevestigd gelezen"));
    assert.ok(root.textContent.includes("Je gekozen leestijd is opgebruikt"));
    choose(root, "In de wachtkamer");
    const dessert = descendants(root).find(el => el.getAttribute("data-current-course") === "true"); assert.ok(dessert);
    assert.ok(dessert.textContent.includes("Nagerecht"));
    assert.equal(byClass(dessert, "reading-course-title")[0]?.textContent, "Artikel d");
    assert.deepEqual(historyIds(local), ["c", "b"]);
  });
});
