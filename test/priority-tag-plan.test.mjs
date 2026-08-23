import assert from "node:assert/strict";
import test from "node:test";

import { buildPriorityTagPlan, validatePriorityTagPlan } from "../scripts/lib/priority-tag-plan.mjs";

function doc(id, overrides = {}) {
  return {
    id,
    title: id,
    location: "later",
    category: "article",
    saved_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-08-16T00:00:00.000Z",
    reading_progress: 0,
    word_count: 1_500,
    reading_time: "12 mins",
    summary: "Samenvatting",
    notes: "",
    tags: {},
    ...overrides,
  };
}

test("plant ordinale en afgeleide toplijsttags vanuit dezelfde scorepositie", () => {
  const documents = [
    doc("low", { tags: { philosophy: {}, "lees-0001": {}, "aaa-top-10": {} } }),
    doc("high", { saved_at: "2026-02-01", tags: { philosophy: {}, history: {}, writing: {}, "lees-0002": {} } }),
  ];
  const plan = buildPriorityTagPlan(documents, [], { generatedAt: "2026-08-16T10:00:00.000Z" });

  assert.deepEqual(plan.changes.high.add.sort(), ["aaa-top-10", "aaa-top-100", "lees-0001"]);
  assert.deepEqual(plan.changes.high.remove, ["lees-0002"]);
  assert.ok(plan.changes.low.add.includes("aaa-top-100"));
  assert.ok(plan.changes.low.add.includes("lees-0002"));
  assert.ok(plan.changes.low.remove.includes("lees-0001"));
  assert.equal(validatePriorityTagPlan(plan), true);
});

test("migreert luchtig-lidmaatschap en ruimt beheerde tags buiten later op", () => {
  const later = [doc("light", { tags: { dutch: {}, "luchtig-004": {}, "aaa-luchtig-top-100": {} } })];
  const outside = [doc("archived", { location: "archive", tags: { "lees-0009": {}, "aaa-top-100": {}, philosophy: {} } })];
  const plan = buildPriorityTagPlan(later, outside, { generatedAt: "2026-08-16T10:00:00.000Z", cleanupAll: true });

  assert.ok(plan.changes.light.add.includes("light-reading"));
  assert.ok(plan.changes.light.add.includes("luchtig-001"));
  assert.ok(plan.changes.light.add.includes("luchtig-nederlands-001"));
  assert.deepEqual(plan.changes.archived.remove.sort(), ["aaa-top-100", "lees-0009"]);
  assert.equal(plan.changes.archived.add.length, 0);
  assert.equal(plan.scope, "all-locations");
});

test("verwijdert historische viercijferige tags uit driecijferige reeksen", () => {
  const document = doc("legacy", { tags: { dutch: {}, "dutch-0007": {} } });
  const plan = buildPriorityTagPlan([document], [], { generatedAt: "2026-08-16T10:00:00.000Z" });
  assert.ok(plan.changes.legacy.remove.includes("dutch-0007"));
  assert.ok(plan.changes.legacy.add.includes("dutch-001"));
});

test("behoudt luchtig-lidmaatschap uit historische viercijferige tags", () => {
  const document = doc("light-legacy", { tags: { "luchtig-0004": {} } });
  const plan = buildPriorityTagPlan([document], [], { generatedAt: "2026-08-16T10:00:00.000Z" });

  assert.ok(plan.changes["light-legacy"].add.includes("light-reading"));
  assert.ok(plan.changes["light-legacy"].add.includes("luchtig-001"));
  assert.ok(plan.changes["light-legacy"].remove.includes("luchtig-0004"));
});

test("houdt ieder document in later in de gewenste reeksen ongeacht leesvoortgang", () => {
  const read = doc("read", { reading_progress: 0.98, tags: {} });
  const plan = buildPriorityTagPlan([read], [], {
    generatedAt: "2026-08-16T10:00:00.000Z",
  });
  assert.ok(plan.changes.read.add.includes("lees-0001"));
});

test("bronfingerprint negeert Reader updated_at maar bewaakt score-invoer", () => {
  const base = doc("stable", { tags: { agile: {} } });
  const plan = buildPriorityTagPlan([base], [], { generatedAt: "2026-08-16T10:00:00.000Z" });
  const onlyUpdated = buildPriorityTagPlan([
    doc("stable", { tags: { agile: {} }, updated_at: "2026-08-17T00:00:00.000Z" }),
  ], [], { generatedAt: "2026-08-16T10:00:00.000Z" });
  const changedSummary = buildPriorityTagPlan([
    doc("stable", { tags: { agile: {} }, summary: "Een andere samenvatting." }),
  ], [], { generatedAt: "2026-08-16T10:00:00.000Z" });

  assert.equal(onlyUpdated.sourceFingerprint, plan.sourceFingerprint);
  assert.notEqual(changedSummary.sourceFingerprint, plan.sourceFingerprint);
});
