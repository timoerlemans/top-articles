import assert from "node:assert/strict";
import test from "node:test";

import { mergeReviewedConfig, type ReviewedConfigPublication } from "../scripts/lib/review-publication.js";

function config(items: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { version: 1, items, ...extra };
}

const valid = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) { return false; }
  const items = (value as { items?: unknown }).items;
  return !!items && typeof items === "object" && !Array.isArray(items);
};

test("publication merges only run-produced IDs and preserves unrelated remote edits", () => {
  const publication: ReviewedConfigPublication = {
    name: "profiles",
    baseline: config({
      unchanged: { status: "accepted", score: 1 },
      reviewed: { status: "draft" },
    }, { activeRubric: "reading-profile-v2" }),
    remote: config({
      unchanged: { status: "accepted", score: 2 },
      reviewed: { status: "draft" },
      remoteOnly: { status: "accepted" },
    }, { activeRubric: "reading-profile-v2", unrelated: "keep" }),
    proposed: config({
      unchanged: { status: "accepted", score: 1 },
      reviewed: { status: "accepted", score: 4 },
    }, { activeRubric: "reading-profile-v2" }),
    producedIds: ["reviewed"],
    validate: valid,
  };

  const result = mergeReviewedConfig(publication);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.changedIds, ["reviewed"]);
  assert.deepEqual(result.value, config({
    unchanged: { status: "accepted", score: 2 },
    reviewed: { status: "accepted", score: 4 },
    remoteOnly: { status: "accepted" },
  }, { activeRubric: "reading-profile-v2", unrelated: "keep" }));
});

test("publication rejects a concurrent edit to the same run-produced ID before writing", () => {
  const publication: ReviewedConfigPublication = {
    name: "judgments",
    baseline: config({ one: { status: "accepted", score: 1 } }),
    remote: config({ one: { status: "accepted", score: 3 } }),
    proposed: config({ one: { status: "accepted", score: 4 } }),
    producedIds: ["one"],
    validate: valid,
  };

  assert.throws(() => mergeReviewedConfig(publication), /judgments.*one|conflict/i);
});

test("publication requires valid proposed and merged config objects", () => {
  const publication: ReviewedConfigPublication = {
    name: "profiles",
    baseline: config({ one: { status: "draft" } }),
    remote: config({ one: { status: "draft" } }),
    proposed: { invalid: true },
    producedIds: ["one"],
    validate: valid,
  };

  assert.throws(() => mergeReviewedConfig(publication), /proposed|valid/i);
});
