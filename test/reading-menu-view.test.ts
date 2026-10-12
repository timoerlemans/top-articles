import assert from "node:assert/strict";
import test from "node:test";
import { mountReadingMenu } from "../src/reading-menu-view.js";
import type { ArticleItem, TopArticles, TopArticlePriority } from "../src/types/browser-data.js";
import type { ReadingTraits, ReadingNeed } from "../src/reading-profiles.js";

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
const traits: ReadingTraits = { effort: 1, emotionalWeight: 0, tone: "warm", needFit: { ontspannen: 4, afleiding: 3, herkenning: 2, verkennen: 2, verdieping: 2 } };
function fixture(
  catalog = [makeArticle("a", 3), makeArticle("b", 5), makeArticle("c", 2)],
  profiles: Record<string, ReadingTraits> = Object.fromEntries(catalog.map(({ id }) => [id, traits])),
): { data: TopArticles; priority: TopArticlePriority } {
  const data = { generatedAt: "2026-10-10T00:00:00Z", families: [], catalog: { items: catalog }, derivedLists: {}, readingMenu: { version: 1, scope: "later", complete: true, profiles } } as unknown as TopArticles;
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
