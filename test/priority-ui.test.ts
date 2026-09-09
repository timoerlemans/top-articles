import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseTopArticlePriority, parseTopArticles } from "../src/types/browser-data.js";

test("de pagina legt de uniforme scorevolgorde uit", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const visibleText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  assert.match(html, /id="priority-controls"/);
  assert.match(html, /id="priority-sequence-chips"/);
  assert.match(html, /id="priority-explainer"/);
  assert.match(visibleText, /hogere score.*hoger/i);
  assert.match(visibleText, /gelijke score.*oudste.*saved_at/i);
  assert.match(visibleText, /Nederlandse.*bonus.*score/i);
  assert.match(visibleText, /Sociale studies.*samenwerking/i);
});

test("de browser toont sociale studies als eigen prioriteitsreeks naast de bestaande reeksen", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(source, /"social-studies": "Sociale studies & samenwerking"/);
  assert.match(
    source,
    /"scrum",\s*"software-development",\s*"front-end-development",\s*"social-studies"/
  );
  for (const sequence of [
    "lees", "boek", "pdf", "video", "dutch", "short", "short-dutch", "luchtig",
    "luchtig-nederlands", "scrum", "software-development", "front-end-development", "social-studies",
  ]) {
    assert.match(source, new RegExp(`"${sequence}"`));
  }
});

test("browsercontracten accepteren de gegenereerde social-studies familie en reeks", () => {
  const item = {
    position: null,
    id: "social-studies-doc",
    title: "Samenwerking in de praktijk",
    author: null,
    siteName: null,
    category: "article",
    language: "nl",
    readingTime: null,
    readingMinutes: null,
    wordCount: null,
    publishedDate: null,
    savedDate: null,
    imageUrl: null,
    sourceUrl: null,
    readwiseUrl: null,
    summary: null,
    whyRead: null,
    bestMoment: null,
    tags: [],
    alsoIn: [],
  };
  const list = { tag: "aaa-social-studies-top-10", items: [item] };

  const articles = parseTopArticles({
    generatedAt: "2026-09-09T00:00:00.000Z",
    families: [{ id: "social-studies", label: "Sociale studies & samenwerking", lists: { "top-10": list, "top-100": list } }],
    catalog: { items: [item] },
    derivedLists: {},
  });
  const priority = parseTopArticlePriority({
    generatedAt: "2026-09-09T00:00:00.000Z",
    model: "readwise-priority-v3",
    scope: "later",
    items: {
      [item.id]: {
        baseScore: 70,
        adjustment: 0,
        adjustmentReason: null,
        score: 70,
        tier: "hoog",
        components: {},
        rationale: {},
        sequences: ["social-studies"],
        positions: { "social-studies": 1 },
        actualPositions: { "social-studies": 1 },
      },
    },
  });

  assert.equal(articles?.families[0]?.id, "social-studies");
  assert.deepEqual(priority?.items[item.id]?.sequences, ["social-studies"]);
});

test("browserprioriteit blijft model v3 voor Reader later afdwingen", () => {
  const base = {
    generatedAt: "2026-09-09T00:00:00.000Z",
    items: {},
  };

  assert.equal(parseTopArticlePriority({ ...base, model: "readwise-priority-v2", scope: "later" }), null);
  assert.equal(parseTopArticlePriority({ ...base, model: "readwise-priority-v3", scope: "archive" }), null);
});

test("de browsercode gebruikt alleen Prioriteitsscore", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(source, /Prioriteitsscore/);
  assert.doesNotMatch(source, /Appscore/);
  assert.doesNotMatch(source, /scoreBreakdown/);
  assert.match(source, /priority-breakdown/);
  assert.match(source, /prioritySequence/);
});

test("de pagina bevat toegankelijke responsieve menu- en sorteringsbediening", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");

  assert.match(
    html,
    /id="mobile-menu-toggle"[^>]*aria-controls="family-tabs"[^>]*aria-expanded="false"/s
  );
  assert.match(html, /id="mobile-menu-label"/);
  assert.match(html, /id="sort-select"/);
  assert.match(html, /id="sort-direction"[^>]*aria-label=/s);
});

test("de browsercode beheert mobiel menu en desktopsortering vanuit dezelfde state", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(source, /function setMobileMenuOpen\(/);
  assert.match(source, /mobileMenuToggleEl\.setAttribute\("aria-expanded"/);
  assert.match(source, /mobileMenuToggleEl\.setAttribute\("aria-label"/);
  assert.match(source, /tabsEl\.classList\.toggle\("mobile-open"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /mobileMenuToggleEl\.focus\(\)/);
  assert.match(source, /sortSelectEl\.addEventListener\("change"/);
  assert.match(source, /sortDirectionEl\.addEventListener\("click"/);
  assert.match(source, /closeMobileMenu\(\);[\s\S]*stateToHash\(\);[\s\S]*render\(\);/);
});
