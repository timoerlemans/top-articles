import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPriorityDocumentUpdates,
  type DocumentBatchResult,
  type PriorityJournal,
} from "../scripts/lib/priority-apply.js";
import type { DocumentTagUpdate } from "../scripts/lib/priority-batch.js";

const update = (id: string, tags: string[] | null = ["aaa-top-100"]): DocumentTagUpdate => ({
  documentId: id,
  add: ["aaa-top-100"],
  remove: ["lees-0007"],
  tags,
});

const emptyJournal = (): PriorityJournal => ({ completed: [], failures: [] });

test("zet een hele batch documenten met één bulk-call en slaat afgeronde documenten over", async () => {
  const journal: PriorityJournal = {
    completed: [
      { action: "remove", documentId: "doc-1", tag: "lees-0007" },
      { action: "add", documentId: "doc-1", tag: "aaa-top-100" },
    ],
    failures: [],
  };
  const batches: string[][] = [];
  let documentCalls = 0;

  const result = await applyPriorityDocumentUpdates({
    updates: [update("doc-1"), update("doc-2"), update("doc-3")],
    journal,
    executeBatch: (batch) => {
      batches.push(batch.map((entry) => entry.documentId));
      return Promise.resolve(batch.map((entry): DocumentBatchResult => ({ documentId: entry.documentId, success: true })));
    },
    executeDocument: () => {
      documentCalls++;
      return Promise.resolve();
    },
    writeJournal: () => Promise.resolve(),
    delay: () => Promise.resolve(),
  });

  assert.deepEqual(batches, [["doc-2", "doc-3"]]);
  assert.equal(documentCalls, 0);
  assert.equal(result.completed.length, 6);
});

test("valt per document terug op losse calls als de bulkrespons dat document afkeurt", async () => {
  const journal = emptyJournal();
  const fallbacks: string[] = [];

  const result = await applyPriorityDocumentUpdates({
    updates: [update("doc-1"), update("doc-2")],
    journal,
    executeBatch: (batch) =>
      Promise.resolve(batch.map((entry): DocumentBatchResult => ({
        documentId: entry.documentId,
        success: entry.documentId !== "doc-2",
        message: entry.documentId === "doc-2" ? "document niet gevonden" : undefined,
      }))),
    executeDocument: (entry) => {
      fallbacks.push(entry.documentId);
      return Promise.resolve();
    },
    writeJournal: () => Promise.resolve(),
    delay: () => Promise.resolve(),
  });

  assert.deepEqual(fallbacks, ["doc-2"]);
  assert.equal(result.completed.length, 4);
  assert.equal(result.failures?.length, 2);
  assert.match(result.failures?.[0]?.message ?? "", /document niet gevonden/);
});

test("schakelt de bulkroute uit voor de rest van de run als de endpoint blijft falen", async () => {
  const journal = emptyJournal();
  const fallbacks: string[] = [];
  const waits: number[] = [];
  let batchCalls = 0;

  await applyPriorityDocumentUpdates({
    updates: [update("doc-1"), update("doc-2"), update("doc-3"), update("doc-4")],
    journal,
    batchSize: 2,
    retries: 1,
    executeBatch: () => {
      batchCalls++;
      return Promise.reject(new Error("bulk-endpoint onbereikbaar"));
    },
    executeDocument: (entry) => {
      fallbacks.push(entry.documentId);
      return Promise.resolve();
    },
    writeJournal: () => Promise.resolve(),
    delay: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  });

  assert.equal(batchCalls, 2, "alleen de eerste batch mag de bulkroute proberen");
  assert.deepEqual(waits, [1_000]);
  assert.deepEqual(fallbacks, ["doc-1", "doc-2", "doc-3", "doc-4"]);
  assert.equal(journal.bulkFailures?.length, 2);
  assert.equal(journal.completed.length, 8);
});

test("stuurt documenten zonder bekende tagset meteen langs de losse calls", async () => {
  const journal = emptyJournal();
  const fallbacks: string[] = [];
  const batches: string[][] = [];

  await applyPriorityDocumentUpdates({
    updates: [update("doc-1", null), update("doc-2")],
    journal,
    executeBatch: (batch) => {
      batches.push(batch.map((entry) => entry.documentId));
      return Promise.resolve(batch.map((entry): DocumentBatchResult => ({ documentId: entry.documentId, success: true })));
    },
    executeDocument: (entry) => {
      fallbacks.push(entry.documentId);
      return Promise.resolve();
    },
    writeJournal: () => Promise.resolve(),
    delay: () => Promise.resolve(),
  });

  assert.deepEqual(batches, [["doc-2"]]);
  assert.deepEqual(fallbacks, ["doc-1"]);
});

test("stopt na een blijvende fout in de losse calls met een hervatbaar journal", async () => {
  const journal = emptyJournal();
  const snapshots: PriorityJournal[] = [];

  await assert.rejects(
    applyPriorityDocumentUpdates({
      updates: [update("doc-1", null)],
      journal,
      executeDocument: () => Promise.reject(new Error("Reader blijft onbereikbaar")),
      writeJournal: (value) => {
        snapshots.push(structuredClone(value));
        return Promise.resolve();
      },
      delay: () => Promise.resolve(),
      retries: 1,
    }),
    /mislukte tagoperaties/i,
  );

  assert.equal(journal.completed.length, 0);
  assert.equal(journal.failures?.length, 4);
  const finalFailure = snapshots.at(-1)?.failures?.at(-1);
  assert.ok(finalFailure);
  assert.equal(finalFailure.attempt, 2);
});

test("logt een tijdelijke fout in de losse calls vóór een geslaagde retry", async () => {
  const journal = emptyJournal();
  const waits: number[] = [];
  let calls = 0;

  const result = await applyPriorityDocumentUpdates({
    updates: [update("doc-1", null)],
    journal,
    executeDocument: () => {
      calls++;
      return calls === 1 ? Promise.reject(new Error("tijdelijke Reader-fout")) : Promise.resolve();
    },
    writeJournal: () => Promise.resolve(),
    delay: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(waits, [1_000]);
  assert.equal(result.completed.length, 2);
  assert.equal(result.failures?.length, 2);
});
