import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { isGeneratedPriority } from "./helpers/generated-browser-data.js";

test("priority-export wordt voor de appdata in de browser geladen", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const scoreIndex = html.indexOf('src="data/score.js?c=');
  const dataIndex = html.indexOf('src="data/data.js?c=');
  const appIndex = html.indexOf('src="dist/src/app.js?c=');

  assert.ok(scoreIndex >= 0, "data/score.js wordt niet geladen");
  assert.ok(scoreIndex < dataIndex && dataIndex < appIndex, "datascripts staan in de verkeerde volgorde");
  const versions = [...html.matchAll(/src="(?:data\/(?:data|score)\.js|dist\/src\/app\.js)\?c=(\d+)"/g)].map((match) => match[1]);
  assert.equal(versions.length, 3);
  assert.equal(new Set(versions).size, 1, "scripts gebruiken niet dezelfde dataversie");
});

test("score.js bevat het zelfstandige priority-v8 browsercontract", async () => {
  const source = await readFile(new URL("../../data/score.js", import.meta.url), "utf8");
  const context: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(source, context);

  const priority = context.window.TOP_ARTICLE_PRIORITY;
  assert.ok(isGeneratedPriority(priority), "TOP_ARTICLE_PRIORITY bevat een ongeldig browsercontract");
  assert.equal(priority.model, "readwise-priority-v8");
  assert.ok("coreInterestPriority" in priority);
  assert.equal(priority.scope, "later");
  assert.equal("TOP_ARTICLE_SCORING" in context.window, false);
});
