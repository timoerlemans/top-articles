import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repositoryRoot = process.cwd();

test("Hurl smoke contract covers the public page and committed runtime assets", async () => {
  const scenario = await readFile(resolve(repositoryRoot, "quality/hurl/site.hurl"), "utf8");

  for (const path of [
    "/",
    "/styles.css",
    "/data/score.js",
    "/data/data.js",
    "/dist/src/app.js",
  ]) {
    assert.match(scenario, new RegExp(`GET \\{\\{base_url\\}\\}${path.replaceAll("/", "\\/")}`));
  }
  assert.match(scenario, /HTTP 200/);
  assert.match(scenario, /xpath "string\(\/\/h1\)" == "Top Articles"/);
});

test("the local Hurl runner starts the same static site used by the smoke test", async () => {
  const runner = await readFile(resolve(repositoryRoot, ".github/scripts/run-local-hurl.sh"), "utf8");

  assert.match(runner, /npm run compile/);
  assert.match(runner, /python3 -m http\.server/);
  assert.match(runner, /hurl --test/);
});
