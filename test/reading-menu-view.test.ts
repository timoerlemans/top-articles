import assert from "node:assert/strict";
import test from "node:test";
import { mountReadingMenu } from "../src/reading-menu-view.js";
import type { ArticleItem, TopArticles, TopArticlePriority } from "../src/types/browser-data.js";
import type { ReadingTraits } from "../src/reading-profiles.js";

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
function fixture(): { data: TopArticles; priority: TopArticlePriority } {
  const catalog = [makeArticle("a", 3), makeArticle("b", 5), makeArticle("c", 2)];
  const data = { generatedAt: "2026-10-10T00:00:00Z", families: [], catalog: { items: catalog }, derivedLists: {}, readingMenu: { version: 1, scope: "later", complete: true, profiles: Object.fromEntries(catalog.map(({ id }) => [id, traits])) } } as unknown as TopArticles;
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
