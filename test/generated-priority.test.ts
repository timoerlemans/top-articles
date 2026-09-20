import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { validatePriorityExport } from "../scripts/lib/readwise-priority-v8.js";
import type { PrioritySequence } from "../scripts/lib/readwise-priority-v8.js";
import {
  isGeneratedPriority,
  isGeneratedTopArticles,
  type GeneratedArticle,
  type GeneratedPriority,
  type GeneratedTopArticles,
} from "./helpers/generated-browser-data.js";

async function loadBrowserData<T>(
  path: string,
  globalName: string,
  isExpectedValue: (value: unknown) => value is T,
): Promise<T> {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const context: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(source, context);
  const value = context.window[globalName];
  if (!isExpectedValue(value)) {
    throw new TypeError(`${globalName} bevat een ongeldig browsercontract`);
  }
  return value;
}

test("gegenereerde priority-export is geldig en sluit aan op dezelfde actieve catalogus", async () => {
  const [data, priority] = await Promise.all([
    loadBrowserData<GeneratedTopArticles>("../../data/data.js", "TOP_ARTICLES", isGeneratedTopArticles),
    loadBrowserData<GeneratedPriority>("../../data/score.js", "TOP_ARTICLE_PRIORITY", isGeneratedPriority),
  ]);
  const catalogById = new Map(data.catalog.items.map((item) => [item.id, item]));

  assert.equal(priority.generatedAt, data.generatedAt);
  assert.ok(Object.keys(priority.items).length > 0, "priority-export is leeg");
  assert.equal(Object.keys(priority.items).length, data.catalog.items.length, "priority-export en catalogus verschillen in omvang");
  assert.ok(
    Object.keys(priority.items).every((id) => catalogById.has(id)),
    "priority-export bevat een document buiten de actieve catalogus"
  );
  assert.equal(validatePriorityExport(priority), true);
  assert.equal(priority.model, "readwise-priority-v8");
  assert.equal(priority.coreInterestPriority.order.slice(0, 3).join(","), "agile,adhd,filosofie");
  assert.ok(Object.values(priority.items).every((item) => Array.isArray(item.coreInterestMatches)));
  assert.ok(
    data.catalog.items.every((item) => !("scoreBreakdown" in item) && !("score" in item)),
    "catalogus bevat nog legacy-scorevelden"
  );

  const assertPriorityOrder = (items: GeneratedArticle[], label: string, sequence?: PrioritySequence): void => {
    for (let index = 1; index < items.length; index++) {
      const previous = items[index - 1];
      const current = items[index];
      assert.ok(previous);
      assert.ok(current);
      const previousPriority = priority.items[previous.id];
      const currentPriority = priority.items[current.id];
      assert.ok(previousPriority);
      assert.ok(currentPriority);
      const previousScore = sequence ? previousPriority.sequenceScores?.[sequence]?.score ?? previousPriority.score : previousPriority.score;
      const currentScore = sequence ? currentPriority.sequenceScores?.[sequence]?.score ?? currentPriority.score : currentPriority.score;
      assert.ok(previousScore >= currentScore, `${label} is niet op score gesorteerd`);
      if (previousScore === currentScore) {
        assert.ok(previous.savedDate, "artikel zonder savedDate in de gegenereerde data");
        assert.ok(current.savedDate, "artikel zonder savedDate in de gegenereerde data");
        const savedDifference = Date.parse(previous.savedDate) - Date.parse(current.savedDate);
        assert.ok(savedDifference < 0 || (savedDifference === 0 && previous.id.localeCompare(current.id) <= 0), `${label} heeft een ongeldige tie-break`);
      }
    }
  };
  const sequenceByFamilyId: Record<string, PrioritySequence> = {
    algemeen: "lees",
    nederlands: "dutch",
    kort: "short",
    "kort-nederlands": "short-dutch",
    luchtig: "luchtig",
    "luchtig-nederlands": "luchtig-nederlands",
    scrum: "scrum",
    "social-studies": "social-studies",
    "software-development": "software-development",
    "front-end-development": "front-end-development",
    boeken: "boek",
    pdfs: "pdf",
    videos: "video",
    adhd: "adhd",
  };
  for (const family of data.families) {
    const sequence = sequenceByFamilyId[family.id];
    assert.ok(sequence, `onbekende familie: ${family.id}`);
    assertPriorityOrder(family.lists["top-10"].items, `${family.id}:top-10`, sequence);
    assertPriorityOrder(family.lists["top-100"].items, `${family.id}:top-100`, sequence);
  }
  for (const list of Object.values(data.derivedLists)) {
    const items = list.items.map((entry) => {
      const catalogItem = catalogById.get(entry.id);
      assert.ok(catalogItem, `${list.id} bevat een onbekend catalogusitem`);
      return { ...catalogItem, ...entry };
    });
    assertPriorityOrder(items, list.id);
  }
});
