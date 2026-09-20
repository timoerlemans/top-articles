import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHIVE_CLEANUP_MODEL,
  assertArchiveCleanupPlanFresh,
  buildArchiveCleanupPlan,
  validateArchiveCleanupPlan,
} from "../scripts/lib/archive-cleanup.js";
import type { PriorityTagDocument } from "../scripts/lib/priority-tag-plan.js";

function document(id: string, overrides: Partial<PriorityTagDocument> = {}): PriorityTagDocument {
  return {
    id,
    title: id,
    location: "archive",
    tags: {},
    ...overrides,
  };
}

test("archive cleanup removes only managed priority tags and preserves content tags", () => {
  const plan = buildArchiveCleanupPlan([
    document("one", {
      tags: {
        philosophy: {},
        "must-read": {},
        "historical-series-1234": {},
        "custom-top-10": {},
        "light-reading": {},
      },
    }),
    document("clean", { tags: { history: {}, "must-read": {} } }),
  ], { generatedAt: "2026-09-20T00:00:00.000Z" });

  assert.equal(plan.model, ARCHIVE_CLEANUP_MODEL);
  assert.equal(plan.scope, "archive");
  assert.deepEqual(plan.summary, { documents: 2, changedDocuments: 1, removals: 3, operations: 3 });
  assert.deepEqual(plan.changes.one, {
    title: "one",
    add: [],
    remove: ["custom-top-10", "historical-series-1234", "light-reading"],
  });
  assert.deepEqual(plan.operations, [
    { action: "remove", documentId: "one", tag: "custom-top-10" },
    { action: "remove", documentId: "one", tag: "historical-series-1234" },
    { action: "remove", documentId: "one", tag: "light-reading" },
  ]);
  assert.equal(validateArchiveCleanupPlan(plan), true);
});

test("archive cleanup rejects tampered plans and changed archive sources", () => {
  const documents = [document("one", { tags: { "lees-0001": {} } })];
  const plan = buildArchiveCleanupPlan(documents, { generatedAt: "2026-09-20T00:00:00.000Z" });
  assert.throws(() => validateArchiveCleanupPlan({ ...plan, planHash: "0".repeat(64) }), /planhash/i);
  assert.throws(() => assertArchiveCleanupPlanFresh(plan, [document("one", { tags: { "lees-0002": {} } })]), /fingerprint|gewijzigd|bron/i);
  assert.throws(() => buildArchiveCleanupPlan([document("later", { location: "later", tags: { "lees-0001": {} } })]), /archive|archief/i);
});
