import assert from "node:assert/strict";
import test from "node:test";

import { applyArchivePlan, type ArchiveJournal } from "../scripts/lib/archive-apply.js";
import {
  assertLeesArchivePlanFresh,
  buildLeesArchivePlan,
} from "../scripts/lib/archive-lees-plan.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function doc(id: string): PriorityDocument {
  return {
    id,
    title: id,
    category: "note",
    location: "later",
    saved_at: "2026-01-01T00:00:00.000Z",
    tags: { "lees-0001": {} },
  };
}

function journal(planHash: string): ArchiveJournal {
  return { planHash, startedAt: "2026-09-21T12:00:00.000Z", completed: [], failures: [] };
}

test("past een lees-archiveplan toe via een plan-specifieke freshness-check", async () => {
  const source = [doc("candidate")];
  const overrides = { version: 1 as const, items: {} };
  const plan = buildLeesArchivePlan(source, overrides, { generatedAt: "2026-09-21T12:00:00.000Z" });
  let freshnessChecks = 0;
  const moved: string[][] = [];

  const result = await applyArchivePlan({
    plan,
    currentDocuments: source,
    overrides,
    journal: journal(plan.planHash),
    assertFresh: () => {
      freshnessChecks += 1;
      assertLeesArchivePlanFresh(plan, source, overrides);
    },
    moveDocuments: (documentIds) => {
      moved.push([...documentIds]);
      return Promise.resolve(documentIds.map((documentId) => ({ documentId, success: true })));
    },
    writeJournal: () => Promise.resolve(),
  });

  assert.equal(freshnessChecks, 1);
  assert.deepEqual(moved, [["candidate"]]);
  assert.deepEqual(result.completed, ["candidate"]);
});
