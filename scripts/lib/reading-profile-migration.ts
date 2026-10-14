import { record } from "../../src/reading-profiles.js";
import { fingerprint, PROFILE_RUBRIC } from "./reading-profiles.js";

export interface ProfileEvidence extends Record<string, unknown> {
  id: string;
  sourceFingerprint: string;
  evidenceFingerprint: string;
  preferencesFingerprint: string;
}
export interface MigrationSnapshot {
  version: 2;
  scope: "later";
  complete: true;
  rubricVersion: string;
  generatedAt: string;
  preferencesFingerprint: string;
  documents: ProfileEvidence[];
}
export interface MigrationManifest {
  version: 1;
  rubricVersion: string;
  generatedAt: string;
  snapshotHash: string;
  documentCount: number;
  batches: Array<{ number: number; file: string; documentIds: string[] }>;
}
export function createMigration(documents: ProfileEvidence[], preferences: string, generatedAt: string): { snapshot: MigrationSnapshot; manifest: MigrationManifest } {
  const sorted = [...documents].sort((a, b) => a.id.localeCompare(b.id));
  if (sorted.some(doc => !doc.id) || new Set(sorted.map(doc => doc.id)).size !== sorted.length) { throw new Error("Ongeldige of dubbele migratie-ID"); }
  const snapshot: MigrationSnapshot = { version: 2, scope: "later", complete: true, rubricVersion: PROFILE_RUBRIC, generatedAt,
    preferencesFingerprint: fingerprint(preferences), documents: sorted };
  const batches: MigrationManifest["batches"] = [];
  for (let offset = 0; offset < sorted.length; offset += 25) {
    const number = offset / 25 + 1;
    batches.push({ number, file: `batch-${String(number).padStart(3, "0")}.json`, documentIds: sorted.slice(offset, offset + 25).map(doc => doc.id) });
  }
  return { snapshot, manifest: { version: 1, rubricVersion: PROFILE_RUBRIC, generatedAt, snapshotHash: fingerprint(JSON.stringify(snapshot)), documentCount: sorted.length, batches } };
}
export function validMigration(snapshot: unknown, manifest: unknown): snapshot is MigrationSnapshot {
  if (!record(snapshot) || snapshot.version !== 2 || snapshot.scope !== "later" || snapshot.complete !== true || snapshot.rubricVersion !== PROFILE_RUBRIC
    || typeof snapshot.generatedAt !== "string" || !Number.isFinite(Date.parse(snapshot.generatedAt)) || !Array.isArray(snapshot.documents)
    || typeof snapshot.preferencesFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.preferencesFingerprint)
    || !record(manifest) || manifest.version !== 1 || manifest.rubricVersion !== PROFILE_RUBRIC || manifest.generatedAt !== snapshot.generatedAt
    || manifest.snapshotHash !== fingerprint(JSON.stringify(snapshot)) || manifest.documentCount !== snapshot.documents.length || !Array.isArray(manifest.batches)) { return false; }
  const ids: string[] = [];
  for (const doc of snapshot.documents) {
    if (!record(doc) || typeof doc.id !== "string" || !doc.id || doc.preferencesFingerprint !== snapshot.preferencesFingerprint
      || ![doc.sourceFingerprint, doc.evidenceFingerprint].every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))) { return false; }
    ids.push(doc.id);
  }
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && (ids[index - 1] ?? "").localeCompare(id) >= 0)) { return false; }
  const assigned: string[] = [];
  for (const [index, batch] of manifest.batches.entries()) {
    if (!record(batch) || batch.number !== index + 1 || batch.file !== `batch-${String(index + 1).padStart(3, "0")}.json`
      || !Array.isArray(batch.documentIds) || batch.documentIds.length < 1 || batch.documentIds.length > 25
      || !batch.documentIds.every(id => typeof id === "string")
      || (index < manifest.batches.length - 1 && batch.documentIds.length !== 25)) { return false; }
    assigned.push(...batch.documentIds);
  }
  return assigned.length === ids.length && assigned.every((id, index) => id === ids[index]);
}
