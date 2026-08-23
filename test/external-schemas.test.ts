import assert from "node:assert/strict";
import test from "node:test";

import { readwiseDocumentsSchema, resendEmailResponseSchema } from "../scripts/lib/external-schemas.js";

test("Readwise-documenten vereisen een results-array", () => {
  assert.throws(() => readwiseDocumentsSchema.parse({ results: "geen array" }));
});

test("Resend-succesrespons vereist een e-mail-id", () => {
  assert.deepEqual(resendEmailResponseSchema.parse({ id: "mail_123" }), { id: "mail_123" });
  assert.throws(() => resendEmailResponseSchema.parse({ ok: true }));
});
