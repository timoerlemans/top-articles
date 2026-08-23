import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { isGeneratedPriority } from "./helpers/generated-browser-data.js";

test("priority-export wordt voor de appdata in de browser geladen", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const scoreIndex = html.indexOf('src="data/score.js"');
  const dataIndex = html.indexOf('src="data/data.js"');
  const appIndex = html.indexOf('src="dist/src/app.js"');

  assert.ok(scoreIndex >= 0, "data/score.js wordt niet geladen");
  assert.ok(scoreIndex < dataIndex && dataIndex < appIndex, "datascripts staan in de verkeerde volgorde");
});

test("score.js bevat het zelfstandige priority-v3 browsercontract", async () => {
  const source = await readFile(new URL("../../data/score.js", import.meta.url), "utf8");
  const context: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(source, context);

  const priority = context.window.TOP_ARTICLE_PRIORITY;
  assert.ok(isGeneratedPriority(priority), "TOP_ARTICLE_PRIORITY bevat een ongeldig browsercontract");
  assert.equal(priority.model, "readwise-priority-v3");
  assert.equal(priority.scope, "later");
  assert.equal("TOP_ARTICLE_SCORING" in context.window, false);
});
