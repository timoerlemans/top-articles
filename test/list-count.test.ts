import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("de lijst toont het daadwerkelijke aantal items bovenaan", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  assert.match(html, /<p class="list-count" id="list-count"><\/p>\s*<ol class="item-list" id="item-list">/);
});

test("de browsercode werkt het aantal items bij op basis van de gerenderde lijst", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(source, /const listCountEl = requiredElement\("list-count", HTMLElement\);/);
  assert.match(
    source,
    /listCountEl\.textContent = sorted\.length === 1 \? "1 item" : `\$\{sorted\.length\} items`;/
  );
});
