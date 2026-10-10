import { createHash } from "node:crypto";
import { isReadingTraits, record } from "../../src/reading-profiles.js";
import type { ReadingTraits, ReadingMenuData } from "../../src/reading-profiles.js";
import type { PriorityDocument } from "./priority-document.js";
import { judgmentSourceFingerprint } from "./priority-judgments.js";

export const PROFILE_RUBRIC = "reading-profile-v1";
export interface ReadingProfile {
  status: "accepted" | "draft" | "rejected";
  confidence: "high" | "medium" | "low";
  rubricVersion: string;
  sourceFingerprint: string;
  evidenceFingerprint: string;
  preferencesFingerprint: string;
  judgedBy: string;
  judgedAt: string;
  evidenceRefs: string[];
  reason: string;
  traits?: ReadingTraits;
}
export interface ReadingProfilesConfig { version: 1; items: Record<string, ReadingProfile>; }
export function fingerprint(text: string): string { return createHash("sha256").update(text).digest("hex"); }
export function profileSourceFingerprint(doc: PriorityDocument): string { return judgmentSourceFingerprint(doc); }
export function validateReadingProfiles(value: unknown): value is ReadingProfilesConfig {
  if (!record(value) || value.version !== 1 || !record(value.items)) { return false; }
  return Object.entries(value.items).every(([id, item]) => id.length > 0 && record(item)
    && ["accepted", "draft", "rejected"].includes(String(item.status))
    && ["high", "medium", "low"].includes(String(item.confidence))
    && typeof item.rubricVersion === "string"
    && [item.sourceFingerprint, item.evidenceFingerprint, item.preferencesFingerprint].every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))
    && typeof item.judgedBy === "string" && item.judgedBy.trim().length > 0
    && typeof item.judgedAt === "string" && Number.isFinite(Date.parse(item.judgedAt))
    && typeof item.reason === "string" && item.reason.trim().length > 0
    && Array.isArray(item.evidenceRefs) && item.evidenceRefs.every((ref) => typeof ref === "string" && ref.length > 0)
    && (item.traits === undefined || isReadingTraits(item.traits))
    && (item.status !== "accepted" || (isReadingTraits(item.traits) && item.confidence !== "low" && item.evidenceRefs.length > 0)));
}
export function profileIsCurrent(profile: ReadingProfile, doc: PriorityDocument, preferences: string): boolean {
  return profile.rubricVersion === PROFILE_RUBRIC && profile.sourceFingerprint === profileSourceFingerprint(doc)
    && profile.preferencesFingerprint === fingerprint(preferences);
}
export function publicReadingMenu(documents: readonly PriorityDocument[], config: ReadingProfilesConfig, preferences: string): ReadingMenuData {
  const profiles: Record<string, ReadingTraits> = {};
  for (const doc of documents) {
    const profile = doc.id ? config.items[doc.id] : undefined;
    if (doc.id && profile?.status === "accepted" && profile.confidence !== "low" && profile.traits && profileIsCurrent(profile, doc, preferences)) {
      const { effort, emotionalWeight, tone, needFit } = profile.traits;
      profiles[doc.id] = { effort, emotionalWeight, tone, needFit: { ...needFit } };
    }
  }
  return { version: 1, scope: "later", complete: true, profiles };
}

export function profileNeedsSource(profile: ReadingProfile | undefined, doc: PriorityDocument, preferences: string): boolean {
  return !profile || profile.status === "draft" || !profileIsCurrent(profile, doc, preferences);
}
