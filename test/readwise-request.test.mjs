import assert from "node:assert/strict";
import test from "node:test";

import { createReadwiseRequester, executeReadwise } from "../scripts/lib/readwise-request.mjs";

test("Readwise-verzoek probeert tijdelijke fouten opnieuw", async () => {
  let calls = 0;
  const waits = [];
  const result = await executeReadwise(["reader-list-documents"], {
    retries: 2,
    exec: async () => {
      calls++;
      if (calls === 1) throw new Error("tijdelijke Reader-fout");
      return { stdout: '{"results":[]}' };
    },
    delay: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(calls, 2);
  assert.deepEqual(waits, [1_000]);
  assert.equal(result.stdout, '{"results":[]}');
});

test("Readwise-verzoek geeft de laatste fout door na alle retries", async () => {
  await assert.rejects(
    executeReadwise(["reader-list-documents"], {
      retries: 1,
      exec: async () => {
        throw new Error("blijvende Reader-fout");
      },
      delay: async () => {},
    }),
    /blijvende Reader-fout/
  );
});

test("gedeelde Reader-aanvrager spreidt opeenvolgende oproepen", async () => {
  const waits = [];
  const request = createReadwiseRequester({
    minInterval: 3_100,
    now: () => 0,
    delay: async (milliseconds) => waits.push(milliseconds),
    exec: async () => ({ stdout: "{}" }),
  });

  await request(["eerste"]);
  await request(["tweede"]);

  assert.deepEqual(waits, [3_100]);
});
