import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPreferredAuthorTagPlan,
  assertPreferredAuthorTagPlanFresh,
} from "../scripts/lib/preferred-author-plan.js";
import type { PriorityTagDocument } from "../scripts/lib/priority-tag-plan.js";

function document(id: string, overrides: Partial<PriorityTagDocument> = {}): PriorityTagDocument {
  return { id, title: id, author: "Henrik Karlsson", location: "later", tags: { personal: {} }, ...overrides };
}

test("preferred-author plan contains only reliable missing want-to-read additions", () => {
  const plan = buildPreferredAuthorTagPlan([
    document("missing"),
    document("already", { author: "Eleanor Konik", tags: { "want-to-read": {}, personal: {} } }),
    document("title-only", { title: "Henrik Karlsson", author: "Someone else" }),
  ], { generatedAt: "2026-10-14T00:00:00.000Z" });

  assert.equal(plan.model, "readwise-preferred-author-tag-plan-v1");
  assert.deepEqual(plan.operations, [{ action: "add", documentId: "missing", tag: "want-to-read" }]);
  assert.equal(plan.summary.additions, 1);
  assert.equal(plan.summary.incomplete, 0);
});

test("preferred-author plan reports incomplete tag knowledge and rejects stale sources", () => {
  const source = [document("missing", { tags: [{ name: "personal" }, { opaque: true }] })];
  const plan = buildPreferredAuthorTagPlan(source, { generatedAt: "2026-10-14T00:00:00.000Z" });

  assert.equal(plan.operations.length, 0);
  assert.equal(plan.summary.incomplete, 1);
  assert.throws(() => assertPreferredAuthorTagPlanFresh(plan, [document("missing")]), /gewijzigd|bron|fresh/i);
});
