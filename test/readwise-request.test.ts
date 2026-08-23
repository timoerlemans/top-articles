import assert from "node:assert/strict";
import test from "node:test";

import { createReadwiseRequester, executeReadwise } from "../scripts/lib/readwise-request.js";

test("Readwise-verzoek probeert tijdelijke fouten opnieuw", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await executeReadwise(["reader-list-documents"], {
    retries: 2,
    exec: () => {
      calls++;
      if (calls === 1) {
        return Promise.reject(new Error("tijdelijke Reader-fout"));
      }
      return Promise.resolve({ stdout: '{"results":[]}' });
    },
    delay: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(waits, [1_000]);
  assert.equal(result.stdout, '{"results":[]}');
});

test("Readwise-verzoek geeft de laatste fout door na alle retries", async () => {
  await assert.rejects(
    executeReadwise(["reader-list-documents"], {
      retries: 1,
      exec: () => Promise.reject(new Error("blijvende Reader-fout")),
      delay: () => Promise.resolve(),
    }),
    /blijvende Reader-fout/
  );
});

test("gedeelde Reader-aanvrager spreidt opeenvolgende oproepen", async () => {
  const waits: number[] = [];
  const request = createReadwiseRequester({
    minInterval: 3_100,
    now: () => 0,
    delay: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
    exec: () => Promise.resolve({ stdout: "{}" }),
  });

  await request(["eerste"]);
  await request(["tweede"]);

  assert.deepEqual(waits, [3_100]);
});
