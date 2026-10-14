import assert from "node:assert/strict";
import test from "node:test";

import { completeReaderTagSet } from "../scripts/lib/reader-tag-set.js";

test("completeReaderTagSet treats missing, null, and primitive tag values as unknown", () => {
  for (const value of [undefined, null, 7, true, "personal"]) {
    assert.equal(completeReaderTagSet(value), null);
  }
});

test("completeReaderTagSet accepts empty and complete arrays and maps", () => {
  assert.deepEqual(completeReaderTagSet([]), []);
  assert.deepEqual(completeReaderTagSet({}), []);
  assert.deepEqual(completeReaderTagSet(["personal", "lees-0001"]), ["personal", "lees-0001"]);
  assert.deepEqual(completeReaderTagSet([{ name: "personal" }, { key: "lees-0001" }]), ["personal", "lees-0001"]);
  assert.deepEqual(completeReaderTagSet({ personal: {}, "lees-0001": {} }), ["personal", "lees-0001"]);
});

test("completeReaderTagSet rejects one opaque or empty array item", () => {
  assert.equal(completeReaderTagSet(["lees-0001", { opaque: true }, "personal"]), null);
  assert.equal(completeReaderTagSet([{ name: "" }, "personal"]), null);
  assert.equal(completeReaderTagSet([{ name: 7, key: null }, "personal"]), null);
});
