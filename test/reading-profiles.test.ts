import assert from "node:assert/strict";
import test from "node:test";
import { parseReadingMenu } from "../src/reading-profiles.js";

const traits = { effort: 1, emotionalWeight: 0, tone: "warm", needFit: { ontspannen: 4, afleiding: 3, herkenning: 2, verkennen: 2, verdieping: 0 } };
test("menu contract admits complete safe traits and rejects invalid auxiliary data", () => {
  const good = { version: 1, scope: "later", complete: true, profiles: { a: traits } };
  assert.deepEqual(parseReadingMenu(good), good);
  for (const bad of [{ ...good, version: 2 }, { ...good, complete: false }, { ...good, profiles: { a: { ...traits, effort: 5 } } }, { ...good, profiles: { a: { ...traits, needFit: {} } } }]) {
    assert.equal(parseReadingMenu(bad), null);
  }
});

import { fingerprint, profileSourceFingerprint, publicReadingMenu, validateReadingProfiles, PROFILE_RUBRIC } from "../scripts/lib/reading-profiles.js";
import type { ReadingProfile } from "../scripts/lib/reading-profiles.js";
import type { ReadingTraits } from "../src/reading-profiles.js";
test("publication excludes stale/uncertain profiles and exports no private review evidence", () => {
  const doc = { id: "a", category: "article", title: "A", reading_time: "3 min", notes: "Content\n\nFeedback: private" };
  const prefs = "Preferences";
  const profile: ReadingProfile = { status: "accepted", confidence: "medium", rubricVersion: PROFILE_RUBRIC, sourceFingerprint: profileSourceFingerprint(doc), evidenceFingerprint: fingerprint("private full article"), preferencesFingerprint: fingerprint(prefs), judgedBy: "Reviewer", judgedAt: "2026-10-10", evidenceRefs: ["notes", "content"], reason: "Accessible source", traits: traits as ReadingTraits };
  assert.equal(validateReadingProfiles({ version: 1, items: { a: profile } }), true);
  assert.deepEqual(publicReadingMenu([doc], { version: 1, items: { a: profile } }, prefs).profiles, { a: traits });
  assert.deepEqual(publicReadingMenu([doc], { version: 1, items: { a: profile } }, "Changed preferences").profiles, {});
  assert.deepEqual(publicReadingMenu([{ ...doc, title: "Changed" }], { version: 1, items: { a: profile } }, prefs).profiles, {});
  assert.deepEqual(publicReadingMenu([doc], { version: 1, items: { a: { ...profile, status: "draft" } } }, prefs).profiles, {});
  assert.equal(profileSourceFingerprint({ ...doc, notes: "Content\n\nFeedback: other" }), profile.sourceFingerprint);
  assert.equal(validateReadingProfiles({ version: 1, items: { a: { ...profile, confidence: "low" } } }), false);
});

import { profileNeedsSource } from "../scripts/lib/reading-profiles.js";
test("a current draft retries unavailable body evidence instead of staying permanently unreviewable", () => {
  const doc = { id: "a", title: "A" }; const prefs = "Prefs";
  const profile: ReadingProfile = { status: "draft", confidence: "low", rubricVersion: PROFILE_RUBRIC, sourceFingerprint: profileSourceFingerprint(doc), evidenceFingerprint: fingerprint("no content"), preferencesFingerprint: fingerprint(prefs), judgedBy: "Reviewer", judgedAt: "2026-10-10", evidenceRefs: [], reason: "Missing content" };
  assert.equal(profileNeedsSource(profile, doc, prefs), true);
});
