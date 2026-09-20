import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseTopArticlePriority, parseTopArticles } from "../src/types/browser-data.js";

test("de pagina legt de uniforme scorevolgorde uit", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const visibleText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  assert.match(html, /id="priority-controls"/);
  assert.match(html, /id="priority-sequence-chips"/);
  assert.match(html, /id="core-interest-priorities"/);
  assert.match(html, /id="priority-explainer"/);
  assert.match(visibleText, /hogere score.*hoger/i);
  assert.match(visibleText, /gelijke score.*oudste.*saved_at/i);
  assert.match(visibleText, /Nederlandse.*bonus.*score/i);
  assert.match(visibleText, /Sociale studies.*samenwerking/i);
  assert.match(visibleText, /zonder (?:een )?plafond|geen plafond|onbegrensd|geen bovengrens/i);
  assert.doesNotMatch(visibleText, /0[–-]100/);
});

test("de browser toont ADHD en sociale studies als eigen prioriteitsreeksen", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(source, /"social-studies": "Sociale studies & samenwerking"/);
  assert.match(source, /adhd: "ADHD"/);
  assert.match(source, /scrum: "Agile"/);
  assert.match(
    source,
    /"scrum",\s*"software-development",\s*"front-end-development",\s*"social-studies",\s*"adhd"/
  );
  for (const sequence of [
    "lees", "boek", "pdf", "video", "dutch", "short", "short-dutch", "luchtig",
    "luchtig-nederlands", "scrum", "software-development", "front-end-development", "social-studies", "adhd",
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
    coreInterests: [],
    alsoIn: [],
  };
  const list = { tag: "aaa-social-studies-top-10", items: [item] };

  const articles = parseTopArticles({
    generatedAt: "2026-09-09T00:00:00.000Z",
    families: [{ id: "social-studies", label: "Sociale studies & samenwerking", lists: { "top-10": list, "top-100": list } }],
    catalog: { items: [item] },
    derivedLists: {},
  });
  const coreInterestOrder = ["agile", "adhd", "filosofie", "ai_ethiek", "ideologie", "geschiedenis", "sociologie", "schrijven", "speculatieve_fictie", "cultuur_games_film", "pkm", "zorgouderschap"];
  const priority = parseTopArticlePriority({
    generatedAt: "2026-09-09T00:00:00.000Z",
    model: "readwise-priority-v7",
    scope: "later",
    coreInterestPriority: {
      version: 1,
      generatedAt: "2026-09-09T00:00:00.000Z",
      order: coreInterestOrder,
      weights: Object.fromEntries(coreInterestOrder.map((interest, index) => [interest, 20 - index])),
      entries: coreInterestOrder.map((interest, index) => ({
        interest,
        label: interest,
        rank: index + 1,
        weight: 20 - index,
        source: index < 3 ? "manual" : "derived",
        evidenceDocumentCount: index === 0 ? 1 : 0,
        evidenceScore: index === 0 ? 112 : 0,
      })),
    },
    items: {
      [item.id]: {
        baseScore: 70,
        adjustment: 0,
        adjustmentReason: null,
        score: 70,
        tier: "hoog",
        judgmentSource: "label",
        judgmentConfidence: "high",
        components: { kerninteresse: 20, relevantie: 0, substantie: 0, duurzaamheid: 0, bruikbaarheid: 0, leeskans: 0, nederlandse_taal: 0, aftrek: 0 },
        rationale: { kerninteresse: ["Agile: +20 (Agile)."], relevantie: [], substantie: [], duurzaamheid: [], bruikbaarheid: [], leeskans: [], nederlandse_taal: [], aftrek: [] },
        coreInterestMatches: [{
          interest: "agile",
          weight: 20,
          qualityScore: 112,
          evidence: [{ kind: "readwise-tag", source: "agile", label: "Agile" }],
        }],
        sequences: ["social-studies"],
        sequenceScores: { "social-studies": 70 },
        positions: { "social-studies": 1 },
        actualPositions: { "social-studies": 1 },
      },
    },
  });

  assert.equal(articles?.families[0]?.id, "social-studies");
  assert.deepEqual(priority?.items[item.id]?.sequences, ["social-studies"]);
});

test("browserprioriteit dwingt het huidige v7-model voor Reader later af", () => {
  const base = {
    generatedAt: "2026-09-09T00:00:00.000Z",
    items: {},
  };

  assert.equal(parseTopArticlePriority({ ...base, model: "readwise-priority-v6", scope: "later" }), null);
  assert.equal(parseTopArticlePriority({ ...base, model: "readwise-priority-v5", scope: "later" }), null);
  assert.equal(parseTopArticlePriority({ ...base, model: "readwise-priority-v4", scope: "later" }), null);
  assert.equal(parseTopArticlePriority({ ...base, model: "readwise-priority-v7", scope: "archive" }), null);
});

test("de scoreweergave gebruikt geen 100-puntenplafond", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(source, /Prioriteitsscore \$\{priority\.score\}/);
  assert.doesNotMatch(source, /Prioriteitsscore \$\{priority\.score\}\/100/);
});

test("de browsercode gebruikt alleen Prioriteitsscore", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(source, /Prioriteitsscore/);
  assert.doesNotMatch(source, /Appscore/);
  assert.doesNotMatch(source, /scoreBreakdown/);
  assert.match(source, /priority-breakdown/);
  assert.match(source, /prioritySequence/);
  assert.match(source, /coreInterestMatches/);
  assert.match(source, /Kerninteresses/);
  assert.match(source, /kerninteresse/);
  assert.match(source, /Handmatig/);
  assert.match(source, /Afgeleid/);
  assert.match(source, /match\.weight/);
  assert.doesNotMatch(source, /reasonCodes/);
});

test("de score-uitklapper vertaalt technische prioriteitsdata naar leesbare uitleg", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(source, /function priorityComponentExplanation\(/);
  assert.match(source, /Semantisch beoordeeld/);
  assert.match(source, /Veel vertrouwen/);
  assert.match(source, /Sterke aansluiting op je interesses/);
  assert.match(source, /volgens de score/i);
  assert.match(source, /huidige Readwise-positie/i);
  assert.doesNotMatch(source, /confidence \$\{priority\.judgmentConfidence\}/);
  assert.doesNotMatch(source, /reasons\.join\(" "\)/);
  assert.match(css, /\.priority-component-score/);
  assert.match(css, /\.priority-sync-status/);
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

test("toplijsten tonen standaard de berekende lijstpositie", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(source, /sort: "position",\s*sortDir: DEFAULT_SORT_DIR\.position/);
});
