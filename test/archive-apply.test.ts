import assert from "node:assert/strict";
import test from "node:test";

import { buildArchivePlan } from "../scripts/lib/archive-plan.js";
import { applyArchivePlan, type ArchiveJournal } from "../scripts/lib/archive-apply.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function doc(id: string): PriorityDocument {
  return {
    id,
    title: id,
    category: "note",
    location: "later",
    saved_at: "2026-01-01T00:00:00.000Z",
    tags: {},
  };
}

function journal(planHash: string): ArchiveJournal {
  return { planHash, startedAt: "2026-09-16T12:00:00.000Z", completed: [], failures: [] };
}

test("moves candidates in bounded batches and journals completed IDs", async () => {
  const source = [doc("one"), doc("two"), doc("three")];
  const plan = buildArchivePlan(source, { version: 1, items: {} }, { generatedAt: "2026-09-16T12:00:00.000Z" });
  const calls: string[][] = [];
  const writes: ArchiveJournal[] = [];

  const result = await applyArchivePlan({
    plan,
    currentDocuments: source,
    overrides: { version: 1, items: {} },
    journal: journal(plan.planHash),
    batchSize: 2,
    moveDocuments: (documentIds) => {
      calls.push([...documentIds]);
      return Promise.resolve(documentIds.map((documentId) => ({ documentId, success: true })));
    },
    writeJournal: (next) => { writes.push(structuredClone(next)); return Promise.resolve(); },
  });

  assert.deepEqual(calls, [["one", "three"], ["two"]]);
  assert.deepEqual(result.completed, ["one", "three", "two"]);
  assert.equal(writes.length >= 2, true);
});

test("rejects a stale source before issuing any move", async () => {
  const plan = buildArchivePlan([doc("candidate")], { version: 1, items: {} });
  let calls = 0;

  await assert.rejects(
    applyArchivePlan({
      plan,
      currentDocuments: [doc("candidate"), doc("new-document")],
      overrides: { version: 1, items: {} },
      journal: journal(plan.planHash),
      moveDocuments: () => {
        calls += 1;
        return Promise.resolve([]);
      },
      writeJournal: () => Promise.resolve(),
    }),
    /bron.*gewijzigd|stale/i,
  );
  assert.equal(calls, 0);
});

test("stops on a failed move result and records the failure", async () => {
  const source = [doc("one"), doc("two")];
  const plan = buildArchivePlan(source, { version: 1, items: {} });
  const writes: ArchiveJournal[] = [];

  await assert.rejects(
    applyArchivePlan({
      plan,
      currentDocuments: source,
      overrides: { version: 1, items: {} },
      journal: journal(plan.planHash),
      moveDocuments: (documentIds) => Promise.resolve(documentIds.map((documentId) => ({
        documentId,
        success: documentId === "one",
        message: documentId === "two" ? "rate limited" : undefined,
      }))),
      writeJournal: (next) => { writes.push(structuredClone(next)); return Promise.resolve(); },
    }),
    /weigerde|failed/i,
  );

  assert.equal(writes.at(-1)?.completed.includes("one"), true);
  assert.equal(writes.at(-1)?.failures.some(({ documentId }) => documentId === "two"), true);
});

test("retries a thrown batch error before failing", async () => {
  const source = [doc("candidate")];
  const plan = buildArchivePlan(source, { version: 1, items: {} });
  let attempts = 0;

  const result = await applyArchivePlan({
    plan,
    currentDocuments: source,
    overrides: { version: 1, items: {} },
    journal: journal(plan.planHash),
    retries: 1,
    delay: () => Promise.resolve(),
    moveDocuments: (documentIds) => {
      attempts += 1;
      if (attempts === 1) { return Promise.reject(new Error("tijdelijke fout")); }
      return Promise.resolve(documentIds.map((documentId) => ({ documentId, success: true })));
    },
    writeJournal: () => Promise.resolve(),
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result.completed, ["candidate"]);
});
