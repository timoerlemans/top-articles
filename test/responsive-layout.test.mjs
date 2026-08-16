import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPromise = readFile(new URL("../styles.css", import.meta.url), "utf8");

test("alle desktopbediening deelt een container en vijf uitgelijnde filterkolommen", async () => {
  const css = await cssPromise;

  assert.match(css, /--content-width:\s*820px/);
  assert.match(css, /--content-gutter:\s*1\.25rem/);
  assert.match(css, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.desktop-sort-controls\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.search-input\s*\{[^}]*max-width:\s*none/s);
});

test("mobiel gebruikt een inklapbaar tweekolomsmenu en uitgelijnde sorteerknoppen", async () => {
  const css = await cssPromise;
  const mobileStart = css.indexOf("@media (max-width: 640px)");
  assert.notEqual(mobileStart, -1, "mobiele breakpoint ontbreekt");
  const mobileCss = css.slice(mobileStart);

  assert.match(mobileCss, /\.mobile-menu-toggle\s*\{[^}]*display:\s*flex/s);
  assert.match(
    mobileCss,
    /\.tabs\.mobile-open\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s
  );
  assert.match(
    mobileCss,
    /\.sort-chip-list\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s
  );
  assert.match(mobileCss, /\.filter-field select\s*\{[^}]*width:\s*100%[^}]*min-height:\s*44px/s);
});
