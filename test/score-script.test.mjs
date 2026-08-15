import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("scoreconfiguratie wordt niet in de browser geladen", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /src="data\/score\.js"/);
});
