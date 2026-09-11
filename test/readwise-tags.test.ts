import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalInterestTags,
  isReadwiseSystemTag,
  READWISE_ENRICH_TAXONOMY,
} from "../scripts/lib/readwise-tags.js";

test("normaliseert bekende inhoudelijke aliassen naar de officiële taxonomie", () => {
  assert.deepEqual(
    canonicalInterestTags(["agile & scrum", "scrum & agile", "psychology", "accessibility", "unknown topic"]),
    ["accessibility", "agile", "behavioral psychology & coaching", "scrum", "unknown topic"],
  );
});

test("bevat de drie canonieke sociale-studies-tags in de gedeelde taxonomie", () => {
  for (const tag of [
    "social psychology & interpersonal dynamics",
    "team dynamics & collaboration",
    "organizational behavior & culture",
  ]) {
    assert.equal(READWISE_ENRICH_TAXONOMY.has(tag), true, `ontbrekende canonical tag: ${tag}`);
  }
});

test("normaliseert sociale, team- en organisatievarianten naar de nieuwe canonical tags", () => {
  assert.deepEqual(
    canonicalInterestTags([
      "social psychology",
      "interpersonal dynamics",
      "human interaction",
      "team dynamics",
      "teamwork",
      "collaboration",
      "organizational behavior",
      "organisational culture",
      "organizational culture",
    ]),
    [
      "organizational behavior & culture",
      "organizational culture",
      "social psychology & interpersonal dynamics",
      "team dynamics & collaboration",
    ],
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
      "aaa-top-10",
      "accessibility",
    ]),
    ["accessibility"],
  );
  assert.equal(isReadwiseSystemTag("aaa-front-end-development-top-100"), true);
});
