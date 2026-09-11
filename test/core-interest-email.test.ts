import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoreInterestEmail,
  dailyRandomFor,
  isAmsterdamEightOClock,
  shouldSendCoreInterestEmail,
  selectCoreInterestArticle,
} from "../scripts/lib/core-interest-email.js";
import type { DirectDomain } from "../scripts/lib/readwise-priority-v2.js";

interface TestArticle {
  id: string;
  title: string;
  readwiseUrl: string;
  whyRead: string | null;
  readingMinutes: number | null;
  savedDate: string | null;
  coreInterests: DirectDomain[];
}

function article(id: string, score: number, overrides: Partial<TestArticle> = {}): { article: TestArticle; priority: { score: number } } {
  const testArticle: TestArticle = {
    id,
    title: `Artikel ${id}`,
    readwiseUrl: `https://read.readwise.io/read/${id}`,
    whyRead: null,
    readingMinutes: 10,
    savedDate: "2026-01-01T00:00:00.000Z",
    coreInterests: ["agile"],
    ...overrides,
  };
  return {
    article: testArticle,
    priority: { score },
  };
}

test("selecteert alleen posities 2 tot en met 25 met een leestijd onder 15 minuten", () => {
  const ranked = [
    article("top-1", 100),
    article("rank-2", 99),
    article("rank-3", 98, { readingMinutes: 15 }),
    article("rank-4", 97),
    ...Array.from({ length: 22 }, (_, index) => article(`rank-${String(index + 5)}`, 96 - index)),
    article("rank-26", 73),
  ];

  const selected = selectCoreInterestArticle(ranked, () => 0);

  assert.equal(selected?.interest, "agile");
  assert.equal(selected?.rank, 2);
  assert.equal(selected?.article.id, "rank-2");
});

test("valt terug op een andere kerninteresse als de gekozen interesse geen kandidaat heeft", () => {
  const articles = [
    article("agile-too-long", 100, { readingMinutes: 20 }),
    article("history-rank-1", 90, { coreInterests: ["geschiedenis"] }),
    article("history-rank-2", 80, { coreInterests: ["geschiedenis"] }),
  ];

  const selected = selectCoreInterestArticle(articles, () => 0);

  assert.equal(selected?.interest, "geschiedenis");
  assert.equal(selected?.rank, 2);
  assert.equal(selected?.article.id, "history-rank-2");
});

test("maakt voor dezelfde datum steeds dezelfde pseudo-willekeurige reeks", () => {
  const first = Array.from({ length: 3 }, () => dailyRandomFor("2026-09-11")());
  const second = Array.from({ length: 3 }, () => dailyRandomFor("2026-09-11")());

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, Array.from({ length: 3 }, () => dailyRandomFor("2026-09-12")()));
});

test("herkent 08:00 in Amsterdam tijdens winter- en zomertijd", () => {
  assert.equal(isAmsterdamEightOClock(new Date("2026-01-15T07:00:00.000Z")), true);
  assert.equal(isAmsterdamEightOClock(new Date("2026-01-15T06:00:00.000Z")), false);
  assert.equal(isAmsterdamEightOClock(new Date("2026-07-15T06:00:00.000Z")), true);
  assert.equal(isAmsterdamEightOClock(new Date("2026-07-15T07:00:00.000Z")), false);
});

test("forceert verzending buiten 08:00 wanneer force aanstaat", () => {
  const outsideEight = new Date("2026-09-11T10:00:00.000Z");

  assert.equal(shouldSendCoreInterestEmail(outsideEight, true), true);
  assert.equal(shouldSendCoreInterestEmail(outsideEight, false), false);
});

test("bouwt een mail met interesse, rang, leestijd en Readwise-link", () => {
  const selected = {
    interest: "agile" as const,
    rank: 7,
    article: article("selected", 80).article,
  };

  const email = buildCoreInterestEmail(selected, "11 september 2026");

  assert.match(email.subject, /Agile/);
  assert.match(email.html, /rank 7|positie 7/i);
  assert.match(email.html, /10 minuten/);
  assert.match(email.html, /https:\/\/read\.readwise\.io\/read\/selected/);
  assert.match(email.text, /Artikel selected/);
});
