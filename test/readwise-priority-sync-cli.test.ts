import assert from "node:assert/strict";
import test from "node:test";

import { parseMaintenanceConfirmations, parseMaintenanceThrough } from "../scripts/readwise-priority-sync.js";

test("local maintenance CLI parses exact per-stage confirmations", () => {
  assert.deepEqual(parseMaintenanceConfirmations(["authors=aaa,priority=bbb", "archive=ccc"]), {
    authors: "aaa",
    priority: "bbb",
    archive: "ccc",
  });
});

test("local maintenance CLI rejects unknown or malformed confirmations", () => {
  assert.throws(() => parseMaintenanceConfirmations(["unknown=hash"]), /Onbekende onderhoudsstap/);
  assert.throws(() => parseMaintenanceConfirmations(["priority"]), /Gebruik --confirm/);
});

test("local maintenance CLI limits remote automation to a canonical stage", () => {
  assert.equal(parseMaintenanceThrough("priority"), "priority");
  assert.throws(() => parseMaintenanceThrough("unknown"), /Gebruik --through/);
});
