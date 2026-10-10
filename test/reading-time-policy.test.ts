import assert from "node:assert/strict";
import test from "node:test";
import { parseReadingMinutes } from "../scripts/lib/reading-time.js";
import { sequencesForDocument, scorePriorityDocument } from "../scripts/lib/readwise-priority-v8.js";
import { sequencesForDocument as historical } from "../scripts/lib/readwise-priority-v6.js";

test("current duration preserves decimal minutes and rejects nonpositive estimates", () => {
  for (const [input, expected] of [["4.5 min", 4.5], ["1 uur 2,5 min", 62.5], [0, null], ["0 mins", null], [-1, null], [Infinity, null]] as const) {
    assert.equal(parseReadingMinutes(input), expected);
  }
});
test("five minutes leaves current short lists and bonus but historical lists retain it", () => {
  const doc = { id: "five", category: "article", reading_time: "5 min", tags: {} };
  assert.ok(!sequencesForDocument(doc).includes("short"));
  assert.equal(scorePriorityDocument(doc).components.leeskans, 0);
  assert.ok(historical(doc).includes("short"));
  assert.ok(sequencesForDocument({ ...doc, reading_time: "4.5 min" }).includes("short"));
});
