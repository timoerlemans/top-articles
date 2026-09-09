import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalInterestTags,
  isReadwiseSystemTag,
} from "../scripts/lib/readwise-tags.js";

test("normaliseert bekende inhoudelijke aliassen naar de officiële taxonomie", () => {
  assert.deepEqual(
    canonicalInterestTags(["agile & scrum", "psychology", "accessibility", "unknown topic"]),
    ["accessibility", "agile", "behavioral psychology & coaching", "scrum", "unknown topic"],
  );
});

test("verwijdert workflow-, lijst- en positietags uit de inhoudstags", () => {
  assert.deepEqual(
    canonicalInterestTags([
      "linked-from-readwise",
      "light-reading",
      "must-read",
      "pdf-top-100",
      "lees-0001",
      "accessibility",
    ]),
    ["accessibility"],
  );
  assert.equal(isReadwiseSystemTag("aaa-front-end-development-top-100"), true);
});
