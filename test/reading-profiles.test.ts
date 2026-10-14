import assert from "node:assert/strict";
import test from "node:test";
import { parseReadingMenu } from "../src/reading-profiles.js";

const traits = { effort: 1, emotionalWeight: 0, tone: "warm" as const, needFit: { ontspannen: 4, afleiding: 3, herkenning: 2, verkennen: 2, verdieping: 0 } };
test("menu contract admits complete safe traits and rejects invalid auxiliary data", () => {
  const good = { version: 1, scope: "later", complete: true, profiles: { a: traits } };
  assert.deepEqual(parseReadingMenu(good), good);
  for (const bad of [{ ...good, version: 3 }, { ...good, complete: false }, { ...good, profiles: { a: { ...traits, effort: 5 } } }, { ...good, profiles: { a: { ...traits, needFit: {} } } }]) {
    assert.equal(parseReadingMenu(bad), null);
  }
});

const completeTraits = { ...traits, activation: 1, interruptibility: 3 };
test("v2 browser profiles require both complete ratings and project away private evidence", () => {
  const good = { version: 2, scope: "later", complete: true, profiles: { a: { ...completeTraits, content: "private article", reason: "private review" } } };
  assert.deepEqual(parseReadingMenu(good), { version: 2, scope: "later", complete: true, profiles: { a: completeTraits } });
  for (const field of ["activation", "interruptibility"]) {
    for (const value of [undefined, null, -1, 5, 1.5, "1", NaN, Infinity]) {
      assert.equal(parseReadingMenu({ ...good, profiles: { a: { ...completeTraits, [field]: value } } }), null);
    }
  }
  assert.deepEqual(parseReadingMenu({ version: 1, scope: "later", complete: true, profiles: { a: traits } })?.profiles.a, traits);
});

import { buildReadingProfileCoverage, fingerprint, profileSourceFingerprint, publicReadingMenu, validateReadingProfiles, PROFILE_RUBRIC } from "../scripts/lib/reading-profiles.js";
import type { ReadingProfile } from "../scripts/lib/reading-profiles.js";

function document(id: string): { id: string; title: string; category: string } {
  return { id, title: id, category: "article" };
}

test("publication excludes stale/uncertain profiles and exports no private review evidence", () => {
  const doc = { id: "a", category: "article", title: "A", reading_time: "3 min", notes: "Content\n\nFeedback: private" };
  const prefs = "Preferences";
  const profile: ReadingProfile = { status: "accepted", confidence: "medium", rubricVersion: PROFILE_RUBRIC, sourceFingerprint: profileSourceFingerprint(doc), evidenceFingerprint: fingerprint("private full article"), preferencesFingerprint: fingerprint(prefs), judgedBy: "Reviewer", judgedAt: "2026-10-10", evidenceRefs: ["notes", "content"], reason: "Accessible source", traits: completeTraits };
  assert.equal(validateReadingProfiles({ version: 1, items: { a: profile } }), true);
  assert.deepEqual(publicReadingMenu([doc], { version: 1, items: { a: profile } }, prefs).profiles, { a: completeTraits });
  assert.deepEqual(publicReadingMenu([doc], { version: 1, items: { a: profile } }, "Changed preferences").profiles, {});
  assert.deepEqual(publicReadingMenu([{ ...doc, title: "Changed" }], { version: 1, items: { a: profile } }, prefs).profiles, {});
  assert.deepEqual(publicReadingMenu([doc], { version: 1, items: { a: { ...profile, status: "draft" } } }, prefs).profiles, {});
  assert.equal(profileSourceFingerprint({ ...doc, notes: "Content\n\nFeedback: other" }), profile.sourceFingerprint);
  assert.equal(validateReadingProfiles({ version: 1, items: { a: { ...profile, confidence: "low" } } }), false);
});

test("profile migration preserves legacy production until the complete set is reviewed", () => {
  const docs = [{ id: "old", title: "Old", category: "article" }, { id: "new", title: "New", category: "article" }] as const;
  const prefs = "Prefs";
  const make = (doc: typeof docs[number], rubricVersion: string, assessed: typeof traits): ReadingProfile => ({
    status: "accepted", confidence: "high", rubricVersion, sourceFingerprint: profileSourceFingerprint(doc), evidenceFingerprint: fingerprint("source text"),
    preferencesFingerprint: fingerprint(prefs), judgedBy: "Reviewer", judgedAt: "2026-10-14", evidenceRefs: ["content"], reason: "Reviewed full text", traits: assessed,
  });
  const config = { version: 1 as const, items: { old: make(docs[0], "reading-profile-v1", traits), new: make(docs[1], "reading-profile-v2", completeTraits) } };
  assert.equal(validateReadingProfiles(config), true);
  const transitional = publicReadingMenu(docs, config, prefs);
  assert.equal(transitional.version, 1);
  assert.deepEqual(transitional.profiles, { old: traits, new: traits });
  assert.equal(Object.hasOwn(transitional.profiles.old ?? {}, "activation"), false);
  const released = publicReadingMenu([docs[1]], config, prefs);
  assert.equal(released.version, 2);
  assert.deepEqual(parseReadingMenu(released), released);
  assert.deepEqual(released.profiles, { new: completeTraits });
  const activated = { ...config, activeRubric: "reading-profile-v2" as const };
  const withNewArrival = publicReadingMenu([docs[1], { id: "arrival", title: "Not reviewed yet" }], activated, prefs);
  assert.equal(withNewArrival.version, 2);
  assert.deepEqual(withNewArrival.profiles, { new: completeTraits });
  assert.equal(validateReadingProfiles({ ...config, items: { new: { ...config.items.new, traits } } }), false);
});

import { profileNeedsSource } from "../scripts/lib/reading-profiles.js";
test("a current draft retries unavailable body evidence instead of staying permanently unreviewable", () => {
  const doc = { id: "a", title: "A" }; const prefs = "Prefs";
  const profile: ReadingProfile = { status: "draft", confidence: "low", rubricVersion: PROFILE_RUBRIC, sourceFingerprint: profileSourceFingerprint(doc), evidenceFingerprint: fingerprint("no content"), preferencesFingerprint: fingerprint(prefs), judgedBy: "Reviewer", judgedAt: "2026-10-10", evidenceRefs: [], reason: "Missing content" };
  assert.equal(profileNeedsSource(profile, doc, prefs), true);
});

test("profile coverage separates reused profiles, targeted reviews, and explicit outcomes", () => {
  const docs = [
    document("reused"),
    document("missing"),
    document("draft"),
    document("rejected"),
  ];
  const preferences = "preferences";
  const makeEvidence = (doc: typeof docs[number]) => ({
    id: doc.id,
    sourceFingerprint: profileSourceFingerprint(doc),
    evidenceFingerprint: fingerprint(`${doc.id}-evidence`),
    preferencesFingerprint: fingerprint(preferences),
  });
  const evidence = docs.map(makeEvidence);
  const profile = (doc: typeof docs[number], status: ReadingProfile["status"]): ReadingProfile => ({
    status,
    confidence: status === "accepted" ? "medium" : "low",
    rubricVersion: PROFILE_RUBRIC,
    sourceFingerprint: profileSourceFingerprint(doc),
    evidenceFingerprint: fingerprint(`${doc.id}-evidence`),
    preferencesFingerprint: fingerprint(preferences),
    judgedBy: "reviewer",
    judgedAt: "2026-10-14T00:00:00Z",
    evidenceRefs: ["content"],
    reason: "Fixture outcome",
    ...(status === "accepted" ? { traits: completeTraits } : {}),
  });
  const reusedDocument = docs[0];
  const draftDocument = docs[2];
  const rejectedDocument = docs[3];
  if (!reusedDocument || !draftDocument || !rejectedDocument) { throw new Error("Fixture documents ontbreken"); }
  const config = { version: 1 as const, items: {
    reused: profile(reusedDocument, "accepted"),
    draft: profile(draftDocument, "draft"),
    rejected: profile(rejectedDocument, "rejected"),
  } };

  assert.deepEqual(buildReadingProfileCoverage(evidence, config, preferences), {
    total: 4,
    reused: 1,
    toReview: 2,
    incomplete: 0,
    accepted: 1,
    draft: 1,
    rejected: 1,
    missing: 1,
    stale: 0,
    newlyReviewed: 0,
  });
});

test("incomplete profile evidence is visible and never reused as a menu-ready assessment", () => {
  const doc = document("partial");
  const preferences = "preferences";
  const profile: ReadingProfile = {
    status: "accepted", confidence: "medium", rubricVersion: PROFILE_RUBRIC,
    sourceFingerprint: profileSourceFingerprint(doc), evidenceFingerprint: fingerprint("partial-evidence"),
    preferencesFingerprint: fingerprint(preferences), judgedBy: "reviewer", judgedAt: "2026-10-14T00:00:00Z",
    evidenceRefs: ["summary"], reason: "Insufficient fixture evidence", traits: completeTraits,
  };
  assert.deepEqual(buildReadingProfileCoverage([{
    id: doc.id, sourceFingerprint: profile.sourceFingerprint, evidenceFingerprint: profile.evidenceFingerprint,
    preferencesFingerprint: profile.preferencesFingerprint, sourceStatus: "partial",
  }], { version: 1, items: { partial: profile } }, preferences), {
    total: 1, reused: 0, toReview: 1, incomplete: 1, accepted: 0, draft: 0, rejected: 0, missing: 0, stale: 0, newlyReviewed: 0,
  });
});
