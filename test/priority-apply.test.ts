import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPriorityOperations,
  type PriorityJournal,
  type PriorityOperation,
} from "../scripts/lib/priority-apply.js";

const operation = (tag: string): PriorityOperation => ({ action: "add", documentId: "doc-1", tag });

test("hervat vanaf de journal en logt een tijdelijke fout vóór succesvolle retry", async () => {
  const journal: PriorityJournal = { completed: [operation("lees-001")], failures: [] };
  const snapshots: PriorityJournal[] = [];
  const waits: number[] = [];
  let calls = 0;

  const result = await applyPriorityOperations({
    operations: [operation("lees-001"), operation("lees-002")],
    journal,
    execute: () => {
      calls++;
      if (calls === 1) {
        return Promise.reject(new Error("tijdelijke Reader-fout"));
      }
      return Promise.resolve();
    },
    writeJournal: (value) => {
      snapshots.push(structuredClone(value));
      return Promise.resolve();
    },
    delay: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(waits, [1_000]);
  assert.deepEqual(result.completed, [operation("lees-001"), operation("lees-002")]);
  const failures = result.failures;
  assert.ok(failures);
  assert.equal(failures.length, 1);
  const firstFailure = failures[0];
  assert.ok(firstFailure);
  assert.equal(firstFailure.attempt, 1);
  assert.match(firstFailure.message, /tijdelijke Reader-fout/);
  const finalSnapshot = snapshots.at(-1);
  assert.ok(finalSnapshot);
  assert.equal(finalSnapshot.completed.length, 2);
});

test("stopt na blijvende fout met een hervatbare journal", async () => {
  const journal: PriorityJournal = { completed: [], failures: [] };
  const snapshots: PriorityJournal[] = [];

  await assert.rejects(
    applyPriorityOperations({
      operations: [operation("lees-001")],
      journal,
      execute: () => Promise.reject(new Error("Reader blijft onbereikbaar")),
      writeJournal: (value) => {
        snapshots.push(structuredClone(value));
        return Promise.resolve();
      },
      delay: () => Promise.resolve(),
      retries: 1,
    }),
    /mislukte tagoperatie/i
  );

  assert.equal(journal.completed.length, 0);
  assert.equal(journal.failures?.length, 2);
  const finalSnapshot = snapshots.at(-1);
  const finalFailure = finalSnapshot?.failures?.at(-1);
  assert.ok(finalFailure);
  assert.equal(finalFailure.attempt, 2);
});
