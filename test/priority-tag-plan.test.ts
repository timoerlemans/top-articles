import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPriorityTagPlan,
  formatTop10Changes,
  validatePriorityTagPlan,
  type PriorityTagChange,
  type PriorityTagDocument,
  type PriorityTagPlan,
} from "../scripts/lib/priority-tag-plan.js";

type TagPlanTestDocument = PriorityTagDocument & {
  updated_at?: string;
  reading_progress?: number;
};

function changeFor(plan: PriorityTagPlan, id: string): PriorityTagChange {
  const change = plan.changes[id];
  assert.ok(change, `verandering voor ${id} ontbreekt`);
  return change;
}

function doc(id: string, overrides: Partial<TagPlanTestDocument> = {}): TagPlanTestDocument {
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

  const high = changeFor(plan, "high");
  const low = changeFor(plan, "low");
  assert.deepEqual(high.add.sort(), ["aaa-top-10", "aaa-top-100", "lees-0001"]);
  assert.deepEqual(high.remove, ["lees-0002"]);
  assert.ok(low.add.includes("aaa-top-100"));
  assert.ok(low.add.includes("lees-0002"));
  assert.ok(low.remove.includes("lees-0001"));
  assert.equal(validatePriorityTagPlan(plan), true);
});

test("plant development-reeksen met ordinale tags en toplijsttags", () => {
  const plan = buildPriorityTagPlan([doc("dev", { tags: { "software development": {}, "front-end development": {} } })], []);
  const change = changeFor(plan, "dev");
  for (const tag of ["software-development-001", "front-end-development-001", "aaa-software-development-top-10", "aaa-software-development-top-100", "aaa-front-end-development-top-10", "aaa-front-end-development-top-100"]) {
    assert.ok(change.add.includes(tag), `ontbrekende tag: ${tag}`);
  }
});

test("maakt top-10 binnenkomers en vertrekkers per lijst zichtbaar", () => {
  const base = buildPriorityTagPlan([], [], { generatedAt: "2026-08-16T10:00:00.000Z" });
  const plan = {
    ...base,
    changes: {
      "komt-binnen": { title: "Komt binnen", add: ["aaa-top-10"], remove: [] },
      "valt-af": { title: "Valt af", add: [], remove: ["aaa-top-10"] },
    },
  };
  const output = formatTop10Changes(plan);
  assert.match(output, /Top-10 gewijzigd:/);
  assert.match(output, /Algemeen:/);
  assert.match(output, /\+ Komt binnen/);
  assert.match(output, /- Valt af/);
});

test("meldt expliciet wanneer een plan geen top-10 wijzigt", () => {
  const plan = buildPriorityTagPlan([], [], { generatedAt: "2026-08-16T10:00:00.000Z" });
  assert.equal(formatTop10Changes(plan), "Top-10 gewijzigd: geen wijzigingen.");
});

test("migreert luchtig-lidmaatschap en ruimt beheerde tags buiten later op", () => {
  const later = [doc("light", { tags: { dutch: {}, "luchtig-004": {}, "aaa-luchtig-top-100": {} } })];
  const outside = [doc("archived", { location: "archive", tags: { "lees-0009": {}, "aaa-top-100": {}, philosophy: {} } })];
  const plan = buildPriorityTagPlan(later, outside, { generatedAt: "2026-08-16T10:00:00.000Z", cleanupAll: true });

  const light = changeFor(plan, "light");
  const archived = changeFor(plan, "archived");
  assert.ok(light.add.includes("light-reading"));
  assert.ok(light.add.includes("luchtig-001"));
  assert.ok(light.add.includes("luchtig-nederlands-001"));
  assert.deepEqual(archived.remove.sort(), ["aaa-top-100", "lees-0009"]);
  assert.equal(archived.add.length, 0);
  assert.equal(plan.scope, "all-locations");
});

test("verwijdert historische viercijferige tags uit driecijferige reeksen", () => {
  const document = doc("legacy", { tags: { dutch: {}, "dutch-0007": {} } });
  const plan = buildPriorityTagPlan([document], [], { generatedAt: "2026-08-16T10:00:00.000Z" });
  const legacy = changeFor(plan, "legacy");
  assert.ok(legacy.remove.includes("dutch-0007"));
  assert.ok(legacy.add.includes("dutch-001"));
});

test("behoudt luchtig-lidmaatschap uit historische viercijferige tags", () => {
  const document = doc("light-legacy", { tags: { "luchtig-0004": {} } });
  const plan = buildPriorityTagPlan([document], [], { generatedAt: "2026-08-16T10:00:00.000Z" });

  const lightLegacy = changeFor(plan, "light-legacy");
  assert.ok(lightLegacy.add.includes("light-reading"));
  assert.ok(lightLegacy.add.includes("luchtig-001"));
  assert.ok(lightLegacy.remove.includes("luchtig-0004"));
});

test("houdt ieder document in later in de gewenste reeksen ongeacht leesvoortgang", () => {
  const read = doc("read", { reading_progress: 0.98, tags: {} });
  const plan = buildPriorityTagPlan([read], [], {
    generatedAt: "2026-08-16T10:00:00.000Z",
  });
  assert.ok(changeFor(plan, "read").add.includes("lees-0001"));
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
