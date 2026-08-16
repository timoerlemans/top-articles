import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("de pagina legt de uniforme scorevolgorde uit", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const visibleText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  assert.match(html, /id="priority-controls"/);
  assert.match(html, /id="priority-sequence-chips"/);
  assert.match(html, /id="priority-explainer"/);
  assert.match(visibleText, /hogere score.*hoger/i);
  assert.match(visibleText, /gelijke score.*oudste.*saved_at/i);
  assert.match(visibleText, /Nederlandse.*geen invloed.*score/i);
});

test("de browsercode gebruikt alleen Prioriteitsscore", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

  assert.match(source, /Prioriteitsscore/);
  assert.doesNotMatch(source, /Appscore/);
  assert.doesNotMatch(source, /scoreBreakdown/);
  assert.match(source, /priority-breakdown/);
  assert.match(source, /prioritySequence/);
});
