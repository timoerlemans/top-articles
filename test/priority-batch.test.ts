import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDocumentTagUpdates,
  chunkDocumentUpdates,
  documentUpdateOperations,
} from "../scripts/lib/priority-batch.js";
import type { PriorityOperation } from "../scripts/lib/priority-apply.js";

const operations: PriorityOperation[] = [
  { action: "remove", documentId: "doc-1", tag: "lees-0007" },
  { action: "add", documentId: "doc-1", tag: "lees-0003" },
  { action: "add", documentId: "doc-1", tag: "aaa-top-100" },
  { action: "remove", documentId: "doc-2", tag: "short-012" },
];

test("bundelt operaties per document en behoudt niet-beheerde tags in de eindtagset", () => {
  const updates = buildDocumentTagUpdates(
    operations,
    new Map([
      ["doc-1", ["history", "lees-0007", "aaa-top-10"]],
      ["doc-2", ["short-012"]],
    ]),
  );

  assert.equal(updates.length, 2);
  const [first, second] = updates;
  assert.ok(first && second);
  assert.deepEqual(first, {
    documentId: "doc-1",
    add: ["lees-0003", "aaa-top-100"],
    remove: ["lees-0007"],
    tags: ["history", "aaa-top-10", "lees-0003", "aaa-top-100"],
  });
  assert.deepEqual(second.tags, []);
});

test("laat de eindtagset weg als de huidige tags onbekend zijn", () => {
  const updates = buildDocumentTagUpdates(operations, new Map([["doc-2", []]]));
  const first = updates[0];
  assert.ok(first);
  assert.equal(first.tags, null);
});

test("ontdubbelt hoofdletterongevoelig zodat een bestaande tag niet twee keer wordt gezet", () => {
  const updates = buildDocumentTagUpdates(
    [{ action: "add", documentId: "doc-1", tag: "light-reading" }],
    new Map([["doc-1", ["Light-Reading", "history"]]]),
  );
  const first = updates[0];
  assert.ok(first);
  assert.deepEqual(first.tags, ["Light-Reading", "history"]);
});

test("splitst in batches van maximaal de opgegeven grootte", () => {
  const updates = buildDocumentTagUpdates(
    Array.from({ length: 7 }, (_unused, index): PriorityOperation => ({
      action: "add",
      documentId: `doc-${String(index)}`,
      tag: "aaa-top-100",
    })),
    new Map(),
  );
  const batches = chunkDocumentUpdates(updates, 3);
  assert.deepEqual(batches.map((batch) => batch.length), [3, 3, 1]);
  assert.throws(() => chunkDocumentUpdates(updates, 0), /positieve batchgrootte/);
});

test("zet een documentwijziging terug om in verwijderingen vóór toevoegingen", () => {
  const updates = buildDocumentTagUpdates(operations, new Map([["doc-1", []]]));
  const first = updates[0];
  assert.ok(first);
  assert.deepEqual(documentUpdateOperations(first), [
    { action: "remove", documentId: "doc-1", tag: "lees-0007" },
    { action: "add", documentId: "doc-1", tag: "lees-0003" },
    { action: "add", documentId: "doc-1", tag: "aaa-top-100" },
  ]);
});
