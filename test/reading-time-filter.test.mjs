import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("leestijdfilter staat in het algemene filterpaneel", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const panel = html.match(/<div class="search-filters-panel"[\s\S]*?<\/div>\n\n<p class="search-scope-note"/);

  assert.ok(panel, "zoek- en filterpaneel ontbreekt");
  assert.match(panel[0], /<select id="reading-time-filter">/);
});
