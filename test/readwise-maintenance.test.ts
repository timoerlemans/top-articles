import assert from "node:assert/strict";
import test from "node:test";

import {
  createMaintenanceRoute,
  MAINTENANCE_STAGE_ORDER,
  type MaintenanceStageName,
  type MaintenanceStageAdapter,
  type MaintenanceStagePlan,
  type MaintenanceStageResult,
} from "../scripts/lib/readwise-maintenance.js";

function stagePlan(stage: MaintenanceStageName, planHash: string, mutations = true): MaintenanceStagePlan {
  return { stage, planHash, mutations, summary: { operations: mutations ? 1 : 0 } };
}

function fakeStage(
  stage: MaintenanceStageName,
  plans: MaintenanceStagePlan[],
  calls: string[],
  result: MaintenanceStageResult = { ok: true, summary: { verified: 1 } },
  verification: MaintenanceStageResult = result,
) {
  return {
    plan: () => {
      calls.push(`${stage}:plan`);
      return Promise.resolve(plans.shift() ?? stagePlan(stage, `${stage}-fallback`, false));
    },
    apply: (plan: MaintenanceStagePlan) => {
      calls.push(`${stage}:apply:${plan.planHash}`);
      return Promise.resolve(result);
    },
    verify: (plan: MaintenanceStagePlan) => {
      calls.push(`${stage}:verify:${plan.planHash}`);
      return Promise.resolve(verification);
    },
  };
}

function stageMap(factory: (stage: MaintenanceStageName) => MaintenanceStageAdapter): Record<MaintenanceStageName, MaintenanceStageAdapter> {
  return Object.fromEntries(MAINTENANCE_STAGE_ORDER.map((stage: MaintenanceStageName) => [stage, factory(stage)])) as Record<MaintenanceStageName, MaintenanceStageAdapter>;
}

test("maintenance plan is read-only and follows the canonical stage order", async () => {
  const calls: string[] = [];
  const stages = stageMap((stage) => fakeStage(stage, [stagePlan(stage, `${stage}-hash`), stagePlan(stage, `${stage}-hash`)], calls));
  const route = createMaintenanceRoute(stages);

  const plan = await route.plan();

  assert.deepEqual(plan.stages.map(({ stage }: MaintenanceStagePlan) => stage), [...MAINTENANCE_STAGE_ORDER]);
  assert.deepEqual(calls, MAINTENANCE_STAGE_ORDER.map((stage: MaintenanceStageName) => `${stage}:plan`));
  assert.equal(plan.stages[0]?.planHash, "authors-hash");
  assert.equal(plan.stages[0]?.summary.operations, 1);
});

test("maintenance apply requires exact confirmation and replans after a successful mutation", async () => {
  const calls: string[] = [];
  const stages = stageMap((stage) => fakeStage(stage, [stagePlan(stage, `${stage}-hash`), stagePlan(stage, `${stage}-hash`)], calls));
  const route = createMaintenanceRoute(stages);

  const waiting = await route.apply({ authors: "wrong-hash" });
  assert.equal(waiting.status, "awaiting-confirmation");
  assert.equal(waiting.next?.stage, "authors");
  assert.ok(calls.every((call) => !call.includes(":apply:")));

  calls.length = 0;
  const confirmed = await route.apply({ authors: "authors-hash" });
  assert.equal(confirmed.status, "awaiting-confirmation");
  assert.equal(confirmed.next?.stage, "priority");
  assert.deepEqual(calls.slice(0, 3), ["authors:plan", "authors:apply:authors-hash", "authors:verify:authors-hash"]);
  assert.ok(calls.includes("priority:plan"));
});

test("maintenance stops downstream stages after an upstream verification failure", async () => {
  const calls: string[] = [];
  const failing = fakeStage("priority", [stagePlan("priority", "priority-hash")], calls, { ok: true, summary: { applied: 1 } }, { ok: false, summary: { verified: 0 }, message: "stale" });
  const stages = stageMap((stage) => stage === "priority" ? failing : fakeStage(stage, [stagePlan(stage, `${stage}-hash`)], calls));
  const route = createMaintenanceRoute(stages);

  const report = await route.apply({ authors: "authors-hash", priority: "priority-hash" });

  assert.equal(report.status, "failed");
  assert.equal(report.stages.find(({ stage }) => stage === "priority")?.message, "stale");
  assert.ok(calls.includes("priority:verify:priority-hash"));
  assert.ok(!calls.some((call) => call.startsWith("archive:")));
});

test("maintenance runs an idempotent final build without a Reader mutation confirmation", async () => {
  const calls: string[] = [];
  const stages = stageMap((stage) => fakeStage(stage, [stagePlan(stage, `${stage}-hash`, false)], calls));
  stages.build = {
    plan: () => Promise.resolve({ stage: "build", planHash: "build-hash", mutations: false, run: true, summary: { builds: 1 } }),
    apply: (plan) => { calls.push(`build:apply:${plan.planHash}`); return Promise.resolve({ ok: true, summary: { builds: 1 } }); },
    verify: (plan) => { calls.push(`build:verify:${plan.planHash}`); return Promise.resolve({ ok: true, summary: { files: 2 } }); },
  };

  const report = await createMaintenanceRoute(stages).apply();

  assert.equal(report.status, "verified");
  assert.deepEqual(calls.slice(-2), ["build:apply:build-hash", "build:verify:build-hash"]);
  assert.equal(report.stages.at(-1)?.status, "verified");
});

test("maintenance reports thrown stage failures and does not continue downstream", async () => {
  const calls: string[] = [];
  const stages = stageMap((stage) => fakeStage(stage, [stagePlan(stage, `${stage}-hash`)], calls));
  stages.priority = {
    plan: () => Promise.resolve(stagePlan("priority", "priority-hash")),
    apply: () => Promise.reject(new Error("bulk endpoint down")),
    verify: () => Promise.resolve({ ok: true, summary: { verified: 1 } }),
  };

  const report = await createMaintenanceRoute(stages).apply({ authors: "authors-hash", priority: "priority-hash" });

  assert.equal(report.status, "failed");
  assert.equal(report.stages.at(-1)?.message, "bulk endpoint down");
  assert.ok(!calls.some((call) => call.startsWith("archive:")));
});

test("maintenance can stop after a verified stage for repository automation", async () => {
  const calls: string[] = [];
  const stages = stageMap((stage) => fakeStage(stage, [stagePlan(stage, `${stage}-hash`, false)], calls));

  const report = await createMaintenanceRoute(stages).apply({}, undefined, "priority");

  assert.equal(report.status, "verified");
  assert.deepEqual(calls, [
    "authors:plan", "authors:verify:authors-hash",
    "priority:plan", "priority:verify:priority-hash",
  ]);
});
