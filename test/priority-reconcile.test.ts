import assert from "node:assert/strict";
import test from "node:test";

import { reconcilePrioritySync } from "../scripts/lib/priority-reconcile.js";

interface Snapshot {
  operations: { id: string }[];
}

test("biedt een niet-gesynchroniseerd live-plan opnieuw aan", async () => {
  const remaining: Snapshot[] = [
    { operations: [{ id: "doc-1" }] },
    { operations: [] },
  ];
  const applied: string[][] = [];
  const waits: number[] = [];

  const result = await reconcilePrioritySync({
    initial: { operations: [{ id: "doc-1" }] },
    apply: (snapshot: Snapshot) => {
      applied.push(snapshot.operations.map(({ id }) => id));
      return Promise.resolve();
    },
    verify: () => Promise.resolve(remaining.shift() ?? { operations: [] }),
    delay: (milliseconds: number) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
    delayMilliseconds: 500,
  });

  assert.deepEqual(applied, [["doc-1"], ["doc-1"]]);
  assert.deepEqual(waits, [500]);
  assert.deepEqual(result.operations, []);
});
