import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { isGeneratedTopArticles, type GeneratedTopArticles } from "./helpers/generated-browser-data.js";

async function loadGeneratedData(): Promise<GeneratedTopArticles> {
  const source = await readFile(new URL("../../data/data.js", import.meta.url), "utf8");
  const context: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(source, context);
  const data = context.window.TOP_ARTICLES;
  if (!isGeneratedTopArticles(data)) {
    throw new TypeError("TOP_ARTICLES bevat een ongeldig browsercontract");
  }
  return data;
}

test("de gegenereerde data bevat de luchtig-families met doorlopende posities", async () => {
  const data = await loadGeneratedData();

  assert.ok(Array.isArray(data.catalog.items), "actieve catalogus ontbreekt");
  assert.ok(data.derivedLists.consensus, "consensuslijst ontbreekt");
  assert.ok(data.derivedLists.nieuw, "nieuw-lijst ontbreekt");
  assert.ok(data.derivedLists.tijdloos, "tijdloos-lijst ontbreekt");

  const expectedFamilies = [
    {
      id: "luchtig",
      top10Tag: "aaa-luchtig-top-10",
      top100Tag: "aaa-luchtig-top-100",
      top10Length: 10,
      top100Length: 100,
    },
    {
      id: "luchtig-nederlands",
      top10Tag: "aaa-luchtig-nederlands-top-10",
      top100Tag: "aaa-luchtig-nederlands-top-100",
      top10Length: 10,
      top100Length: 17,
    },
  ];

  for (const expected of expectedFamilies) {
    const family = data.families.find(({ id }) => id === expected.id);
    assert.ok(family, `familie ${expected.id} ontbreekt`);
    assert.equal(family.lists["top-10"].tag, expected.top10Tag);
    assert.equal(family.lists["top-100"].tag, expected.top100Tag);
    assert.equal(family.lists["top-10"].items.length, expected.top10Length);
    assert.equal(family.lists["top-100"].items.length, expected.top100Length);
    assert.deepEqual(
      Array.from(family.lists["top-100"].items, ({ position }) => position),
      Array.from({ length: expected.top100Length }, (_, index) => index + 1)
    );
    assert.ok(family.lists["top-100"].items.every(({ position }) => Number.isInteger(position)));
  }
});
