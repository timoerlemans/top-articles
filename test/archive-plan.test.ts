import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArchivePlan,
  validateArchivePlan,
  verifyArchivePostcondition,
  type ArchivePlan,
} from "../scripts/lib/archive-plan.js";
import type { CoreInterestPriorityConfig } from "../scripts/lib/core-interest-priority.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function doc(id: string, overrides: Partial<PriorityDocument> = {}): PriorityDocument {
  return {
    id,
    title: id,
    category: "article",
    location: "later",
    saved_at: "2026-01-01T00:00:00.000Z",
    reading_time: "10 mins",
    summary: "",
    notes: "",
    tags: {},
    ...overrides,
  };
}

test("protects every document in at least one canonical top-100 family", () => {
  const plan = buildArchivePlan([
    doc("protected", { tags: { philosophy: {}, "aaa-top-100": {} } }),
    doc("unclassified", { category: "note" }),
  ], { version: 1, items: {} }, { generatedAt: "2026-09-16T12:00:00.000Z" });

  assert.deepEqual(plan.protectedDocumentIds, ["protected"]);
  assert.deepEqual(plan.candidateDocumentIds, ["unclassified"]);
  assert.equal(plan.summary.documents, 2);
  assert.equal(plan.summary.protected, 1);
  assert.equal(plan.summary.candidates, 1);
  assert.equal(validateArchivePlan(plan), true);
});

test("keeps documents outside later out of the archive candidate set", () => {
  const plan = buildArchivePlan([
    doc("later-doc", { category: "note" }),
    doc("already-archived", { location: "archive", category: "note" }),
  ], { version: 1, items: {} });

  assert.deepEqual(plan.candidateDocumentIds, ["later-doc"]);
  assert.equal(plan.summary.documents, 1);
});

test("changes the source fingerprint when an archive decision input changes", () => {
  const first = buildArchivePlan([doc("doc", { category: "note" })], { version: 1, items: {} });
  const changed = buildArchivePlan([doc("doc", { category: "note", title: "changed" })], { version: 1, items: {} });

  assert.notEqual(first.sourceFingerprint, changed.sourceFingerprint);
  assert.notEqual(first.planHash, changed.planHash);
});

test("archiveplan gebruikt v7 en bewaakt de kerninteresseconfiguratie", () => {
  const config: CoreInterestPriorityConfig = {
    version: 1,
    manualOrder: ["agile", "adhd", "filosofie"],
    weightByRank: [20, 16, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  };
  const changedConfig: CoreInterestPriorityConfig = {
    ...config,
    weightByRank: [21, 16, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  };
  const source = [doc("doc", { tags: { agile: {} } })];
  const first = buildArchivePlan(source, { version: 1, items: {} }, { coreInterestConfig: config });
  const changed = buildArchivePlan(source, { version: 1, items: {} }, { coreInterestConfig: changedConfig });

  assert.equal(first.priorityModel, "readwise-priority-v7");
  assert.notEqual(first.sourceFingerprint, changed.sourceFingerprint);
});

test("rejects a plan whose candidate and protected sets overlap", () => {
  const plan = buildArchivePlan([doc("doc", { category: "note" })], { version: 1, items: {} });
  const invalid: ArchivePlan = {
    ...plan,
    candidateDocumentIds: ["doc"],
    protectedDocumentIds: ["doc"],
  };

  assert.throws(() => validateArchivePlan(invalid), /hash/i);
});

test("verifies that protected family membership survives candidate archiving", () => {
  const source = [
    doc("protected", { tags: { philosophy: {} } }),
    doc("candidate", { category: "note" }),
  ];
  const plan = buildArchivePlan(source, { version: 1, items: {} }, { generatedAt: "2026-09-16T12:00:00.000Z" });
  const protectedDocument = source[0];
  assert.ok(protectedDocument);

  assert.equal(verifyArchivePostcondition(plan, [protectedDocument], { version: 1, items: {} }), true);
  assert.throws(() => verifyArchivePostcondition(plan, source, { version: 1, items: {} }), /kandidaat.*later/i);
});
