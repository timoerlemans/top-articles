import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLeesArchivePlanFresh,
  buildLeesArchivePlan,
  validateLeesArchivePlan,
  verifyLeesArchivePostcondition,
} from "../scripts/lib/archive-lees-plan.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function doc(id: string, overrides: Partial<PriorityDocument> = {}): PriorityDocument {
  return {
    id,
    title: id,
    category: "note",
    location: "later",
    saved_at: "2026-01-01T00:00:00.000Z",
    reading_time: "10 mins",
    summary: "",
    notes: "",
    tags: {},
    ...overrides,
  };
}

const overrides = { version: 1 as const, items: {} };

test("selecteert alleen canonieke lees-documenten buiten de unie van huidige en berekende top-100", () => {
  const plan = buildLeesArchivePlan([
    doc("candidate", { tags: { "lees-0001": {}, philosophy: {} } }),
    doc("current-tag", { tags: { "lees-0002": {}, "aaa-top-100": {} } }),
    doc("computed", { category: "article", tags: { "lees-0003": {} } }),
    doc("no-lees", { tags: { philosophy: {} } }),
    doc("custom-tag", { tags: { "lees-0004": {}, "custom-top-100": {} } }),
    doc("archived", { location: "archive", tags: { "lees-0005": {} } }),
  ], overrides, { generatedAt: "2026-09-21T12:00:00.000Z" });

  assert.deepEqual(plan.candidateDocumentIds, ["candidate", "custom-tag"]);
  assert.deepEqual(plan.currentTagProtectedDocumentIds, ["current-tag"]);
  assert.deepEqual(plan.computedTop100DocumentIds, ["computed"]);
  assert.deepEqual(plan.protectedDocumentIds, ["computed", "current-tag"]);
  assert.deepEqual(plan.summary, {
    documents: 5,
    leesTagged: 4,
    protectedByCurrentTags: 1,
    protectedByComputedRanking: 1,
    protected: 2,
    candidates: 2,
    excluded: 1,
  });
  assert.equal(validateLeesArchivePlan(plan), true);
});

test("herkent lees-tags hoofdletterongevoelig maar accepteert geen niet-canonieke suffix", () => {
  const plan = buildLeesArchivePlan([
    doc("uppercase", { tags: { "LEES-0001": {} } }),
    doc("three-digits", { tags: { "lees-001": {} } }),
    doc("text-suffix", { tags: { "lees-next": {} } }),
  ], overrides);

  assert.deepEqual(plan.candidateDocumentIds, ["uppercase"]);
  assert.equal(plan.summary.leesTagged, 1);
});

test("archiveplan wordt ongeldig en vers als de selectiebron verandert", () => {
  const source = [doc("candidate", { tags: { "lees-0001": {} } })];
  const plan = buildLeesArchivePlan(source, overrides, { generatedAt: "2026-09-21T12:00:00.000Z" });

  assert.throws(() => validateLeesArchivePlan({ ...plan, planHash: "0".repeat(64) }), /planhash/i);
  assert.throws(
    () => assertLeesArchivePlanFresh(plan, [doc("candidate", { title: "gewijzigd", tags: { "lees-0001": {} } })], overrides),
    /bron.*gewijzigd|stale/i,
  );
});

test("postcondition eist dat alle kandidaten weg zijn en beschermde documenten blijven", () => {
  const source = [
    doc("candidate", { tags: { "lees-0001": {} } }),
    doc("protected", { category: "article", tags: { "lees-0002": {} } }),
  ];
  const plan = buildLeesArchivePlan(source, overrides, { generatedAt: "2026-09-21T12:00:00.000Z" });
  const protectedDocument = source[1];
  assert.ok(protectedDocument);

  assert.equal(verifyLeesArchivePostcondition(plan, [protectedDocument], overrides), true);
  assert.throws(() => verifyLeesArchivePostcondition(plan, source, overrides), /kandidaat.*later/i);
});
