import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { validatePriorityExport } from "../scripts/lib/readwise-priority-v3.mjs";

async function loadBrowserData(path, globalName) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window[globalName];
}

test("gegenereerde priority-export is geldig en sluit aan op dezelfde actieve catalogus", async () => {
  const [data, priority] = await Promise.all([
    loadBrowserData("../data/data.js", "TOP_ARTICLES"),
    loadBrowserData("../data/score.js", "TOP_ARTICLE_PRIORITY"),
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
  assert.ok(
    data.catalog.items.every((item) => !("scoreBreakdown" in item) && !("score" in item)),
    "catalogus bevat nog legacy-scorevelden"
  );

  const assertPriorityOrder = (items, label) => {
    for (let index = 1; index < items.length; index++) {
      const previous = items[index - 1];
      const current = items[index];
      const previousPriority = priority.items[previous.id];
      const currentPriority = priority.items[current.id];
      assert.ok(previousPriority.score >= currentPriority.score, `${label} is niet op score gesorteerd`);
      if (previousPriority.score === currentPriority.score) {
        const savedDifference = Date.parse(previous.savedDate) - Date.parse(current.savedDate);
        assert.ok(savedDifference < 0 || (savedDifference === 0 && previous.id.localeCompare(current.id) <= 0), `${label} heeft een ongeldige tie-break`);
      }
    }
  };
  for (const family of data.families) {
    assertPriorityOrder(family.lists["top-10"].items, `${family.id}:top-10`);
    assertPriorityOrder(family.lists["top-100"].items, `${family.id}:top-100`);
  }
  for (const list of Object.values(data.derivedLists)) {
    const items = list.items.map((entry) => ({ ...catalogById.get(entry.id), ...entry }));
    assertPriorityOrder(items, list.id);
  }
});
