import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, "..", "app.js");

test("filtersToParams en paramsToFilters bestaan met de juiste paramnamen", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /function filtersToParams\(/);
  assert.match(source, /function paramsToFilters\(/);
  assert.match(source, /params\.set\("q",/);
  assert.match(source, /params\.set\("lang",/);
  assert.match(source, /params\.set\("cat",/);
  assert.match(source, /params\.set\("mood",/);
  assert.match(source, /params\.set\("time",/);
  assert.match(source, /params\.append\("tags",/);
  assert.match(source, /READING_TIME_BUCKETS/);
});

test("hashToState leest filters uit location.search", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(
    source,
    /function hashToState\(\)[\s\S]*paramsToFilters\(new URLSearchParams\(location\.search\)\)/
  );
});

test("stateToHash schrijft filters mee in de query-string", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /function stateToHash\(\)[\s\S]{0,400}filtersToParams\(\)/);
});

test("clearAllFilters wordt niet meer aangeroepen bij tab- of size-wissel", async () => {
  const source = await readFile(appPath, "utf8");
  assert.doesNotMatch(source, /family\.id;\s*clearAllFilters\(\);/);
  assert.doesNotMatch(source, /state\.view = "priority";\s*clearAllFilters\(\);/);
  assert.doesNotMatch(source, /state\.view = "discover";\s*clearAllFilters\(\);/);
  assert.doesNotMatch(source, /btn\.dataset\.size;\s*clearAllFilters\(\);/);
});

test("Wis alles-knop blijft filters wissen en synct de URL", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /clearFiltersBtnEl\.addEventListener\("click", \(\) => \{[\s\S]*clearAllFilters\(\);[\s\S]*stateToHash\(\);/);
});

test("populateFilterOptions valideert readingTime tegen de scope", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(
    source,
    /function populateFilterOptions\(\)[\s\S]*readingTimeMatches[\s\S]*state\.readingTime = ""/
  );
  assert.match(
    source,
    /function populateFilterOptions\(\)[\s\S]*readingTimeFilterEl\.value = state\.readingTime/
  );
});

test("stateToHash gebruikt location.pathname zodat een leeggemaakte query-string niet blijft hangen", async () => {
  const source = await readFile(appPath, "utf8");
  // Zonder expliciet pathname resolveert een pad-loze "#/..."-referentie via
  // history.replaceState relatief aan de HUIDIGE url en erft daarbij de oude
  // querystring over (RFC 3986 5.3) — cat=article blijft dan hangen nadat het
  // type-filter is teruggezet naar "Alle types".
  assert.match(
    source,
    /function stateToHash\(\)[\s\S]{0,600}location\.pathname \+ \(search \? `\?\$\{search\}` : ""\) \+ hashPart/
  );
});

test("renderDiscoverControls wist de chip-lijst ook als de view niet actief is", async () => {
  const source = await readFile(appPath, "utf8");
  // Zonder dit wist de vorige render van Ontdek-chips niet mee bij het
  // wisselen naar toplists/priority: de CSS-fix maakt het element onzichtbaar,
  // maar de knoppen met hun oude click-handlers (die op de verkeerde view
  // werken en dus "niets doen") blijven anders in de DOM staan.
  assert.match(
    source,
    /function renderDiscoverControls\(\)\s*\{\s*const active = state\.view === "discover";\s*discoverControlsEl\.hidden = !active;\s*discoverListChipsEl\.textContent = "";\s*if \(!active\) return;/
  );
});

test("filterwijzigingen synchroniseren de URL via stateToHash", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /searchEl\.addEventListener\("input", \(\) => \{[\s\S]*stateToHash\(\);/);
  assert.match(source, /languageFilterEl\.addEventListener\("change", \(\) => \{[\s\S]*stateToHash\(\);/);
  assert.match(source, /categoryFilterEl\.addEventListener\("change", \(\) => \{[\s\S]*stateToHash\(\);/);
  assert.match(source, /moodFilterEl\.addEventListener\("change", \(\) => \{[\s\S]*stateToHash\(\);/);
  assert.match(source, /readingTimeFilterEl\.addEventListener\("change", \(\) => \{[\s\S]*stateToHash\(\);/);
  assert.match(source, /function toggleTagFilter\([\s\S]{0,200}stateToHash\(\);/);
});
