import assert from "node:assert/strict";
import test from "node:test";

import { applyPriorityOperations } from "../scripts/lib/priority-apply.mjs";

const operation = (tag) => ({ action: "add", documentId: "doc-1", tag });

test("hervat vanaf de journal en logt een tijdelijke fout vóór succesvolle retry", async () => {
  const journal = { completed: [operation("lees-001")], failures: [] };
  const snapshots = [];
  const waits = [];
  let calls = 0;

  const result = await applyPriorityOperations({
    operations: [operation("lees-001"), operation("lees-002")],
    journal,
    execute: async () => {
      calls++;
      if (calls === 1) throw new Error("tijdelijke Reader-fout");
    },
    writeJournal: async (value) => snapshots.push(structuredClone(value)),
    delay: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(calls, 2);
  assert.deepEqual(waits, [1_000]);
  assert.deepEqual(result.completed, [operation("lees-001"), operation("lees-002")]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].attempt, 1);
  assert.match(result.failures[0].message, /tijdelijke Reader-fout/);
  assert.equal(snapshots.at(-1).completed.length, 2);
});

test("stopt na blijvende fout met een hervatbare journal", async () => {
  const journal = { completed: [], failures: [] };
  const snapshots = [];

  await assert.rejects(
    applyPriorityOperations({
      operations: [operation("lees-001")],
      journal,
      execute: async () => { throw new Error("Reader blijft onbereikbaar"); },
      writeJournal: async (value) => snapshots.push(structuredClone(value)),
      delay: async () => {},
      retries: 1,
    }),
    /mislukte tagoperatie/i
  );

  assert.equal(journal.completed.length, 0);
  assert.equal(journal.failures.length, 2);
  assert.equal(snapshots.at(-1).failures.at(-1).attempt, 2);
});
