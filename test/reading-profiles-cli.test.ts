import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fingerprint, profileSourceFingerprint, validateReadingProfiles } from "../scripts/lib/reading-profiles.js";
import type { ProfileEvidence } from "../scripts/lib/reading-profile-migration.js";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../scripts/reading-profiles.js", import.meta.url));
test("migration freezes all documents in stable bounded batches and resumes without reassignment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reading-migration-"));
  try {
    const documents = Array.from({ length: 26 }, (_, i) => ({ id: `fixture-${String(i).padStart(2, "0")}`, title: "Quiet garden", category: "article" })).reverse();
    const preferences = await readFile(fileURLToPath(new URL("../../config/readwise-reading-preferences.md", import.meta.url)), "utf8");
    const config = join(directory, "config.json");
    await writeFile(config, JSON.stringify({ version: 1, items: Object.fromEntries(documents.map(doc => [doc.id, {
      status: "accepted", confidence: "high", rubricVersion: "reading-profile-v1", sourceFingerprint: profileSourceFingerprint(doc),
      preferencesFingerprint: fingerprint(preferences), evidenceFingerprint: fingerprint("old evidence"), judgedAt: "2026-10-14", judgedBy: "Fixture",
      reason: "Reviewed garden text", evidenceRefs: ["content"], traits: { effort: 1, emotionalWeight: 0, tone: "rustig", needFit: { ontspannen: 4, afleiding: 3, herkenning: 2, verkennen: 2, verdieping: 0 } },
    }])) }));
    const page = join(directory, "page.json"); const calls = join(directory, "calls.jsonl");
    await writeFile(page, JSON.stringify({ results: documents, nextPageCursor: null }));
    const executable = join(directory, "readwise");
    await writeFile(executable, ["#!/usr/bin/env node", "const fs=require('node:fs'); const args=process.argv.slice(2);",
      "fs.appendFileSync(process.env.READING_TEST_CALLS,JSON.stringify(args)+'\\n');",
      "if(args[0]==='reader-list-documents') process.stdout.write(fs.readFileSync(process.env.READING_TEST_PAGE));",
      "else if(args[0]==='reader-get-document-details') process.stdout.write(JSON.stringify({id:args[args.indexOf('--document-id')+1],content:'A complete quiet garden report, in independent paragraphs.'}));",
      "else throw new Error('Unexpected operation');", ""].join("\n"));
    await chmod(executable, 0o755);
    const evidenceDir = join(directory, "evidence");
    const args = [cli, "prepare", "--all-later", "--migration", "--fetch-content", "--evidence-dir", evidenceDir, "--config", config];
    const env = { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`, READING_TEST_CALLS: calls, READING_TEST_PAGE: page };
    const first = await exec(process.execPath, args, { env });
    assert.match(first.stdout, /26.*2.*batch/s);
    const snapshotText = await readFile(join(evidenceDir, "snapshot.json"), "utf8");
    const manifestText = await readFile(join(evidenceDir, "manifest.json"), "utf8");
    const snapshot = JSON.parse(snapshotText) as { generatedAt: string; documents: Array<ProfileEvidence & { content: string }> };
    const manifest = JSON.parse(manifestText) as { snapshotHash: string; batches: Array<{ number: number; documentIds: string[] }> };
    const expected = documents.map(doc => doc.id).sort();
    assert.deepEqual(snapshot.documents.map(doc => doc.id), expected);
    assert.ok(Number.isFinite(Date.parse(snapshot.generatedAt)));
    assert.ok(snapshot.documents.every(doc => doc.content.length > 0));
    assert.deepEqual(manifest.batches.map(batch => batch.number), [1, 2]);
    assert.deepEqual(manifest.batches.map(batch => batch.documentIds.length), [25, 1]);
    assert.deepEqual(manifest.batches.flatMap(batch => batch.documentIds), expected);
    assert.equal(manifest.snapshotHash, fingerprint(JSON.stringify(JSON.parse(snapshotText))));
    const activationArgs = [cli, "validate", "--require-all-reviewed", "--activate-v2", "--evidence-dir", evidenceDir, "--config", config];
    const originalConfig = await readFile(config, "utf8");
    await assert.rejects(exec(process.execPath, activationArgs, { env }), /actuele beoordeling/);
    assert.equal(await readFile(config, "utf8"), originalConfig);
    const beforeCalls = await readFile(calls, "utf8");
    await writeFile(page, JSON.stringify({ results: [...documents, { id: "new-arrival", title: "New" }], nextPageCursor: null }));
    await exec(process.execPath, args, { env });
    assert.equal(await readFile(join(evidenceDir, "snapshot.json"), "utf8"), snapshotText);
    assert.equal(await readFile(join(evidenceDir, "manifest.json"), "utf8"), manifestText);
    assert.equal(await readFile(calls, "utf8"), beforeCalls);
    const firstBatchPath = join(evidenceDir, "batch-001.json");
    const firstBatchText = await readFile(firstBatchPath, "utf8");
    await writeFile(firstBatchPath, JSON.stringify({ rubricVersion: "reading-profile-v2", documents: [] }));
    await assert.rejects(exec(process.execPath, args, { env }), /batch|snapshot|manifest|bevroren/i);
    await writeFile(firstBatchPath, firstBatchText);
    const manifestPath = join(evidenceDir, "manifest.json");
    const ordinaryArgs = args.filter(arg => arg !== "--migration");
    await writeFile(manifestPath, "{invalid json");
    await assert.rejects(exec(process.execPath, ordinaryArgs, { env }), /manifest|bevroren/i);
    assert.equal(await readFile(join(evidenceDir, "snapshot.json"), "utf8"), snapshotText);
    await rm(manifestPath);
    await assert.rejects(exec(process.execPath, ordinaryArgs, { env }), /manifest|bevroren/i);
    assert.equal(await readFile(join(evidenceDir, "snapshot.json"), "utf8"), snapshotText);
    await writeFile(manifestPath, manifestText);
    await writeFile(join(evidenceDir, "snapshot.json"), JSON.stringify({ ...snapshot, generatedAt: "2026-10-15" }));
    await assert.rejects(exec(process.execPath, args, { env }), /snapshot|manifest|bevroren/i);
    await writeFile(join(evidenceDir, "snapshot.json"), snapshotText);
    const configValue: unknown = JSON.parse(originalConfig);
    assert.ok(validateReadingProfiles(configValue));
    const reviewed = { ...configValue, items: Object.fromEntries(snapshot.documents.map(doc => {
      const old = configValue.items[doc.id]; assert.ok(old);
      return [doc.id, { ...old, rubricVersion: "reading-profile-v2", sourceFingerprint: doc.sourceFingerprint, evidenceFingerprint: doc.evidenceFingerprint,
        preferencesFingerprint: doc.preferencesFingerprint, traits: { ...old.traits, activation: 1, interruptibility: 3 } }];
    })) };
    await writeFile(config, JSON.stringify(reviewed));
    await exec(process.execPath, activationArgs, { env });
    const activated: unknown = JSON.parse(await readFile(config, "utf8"));
    assert.ok(validateReadingProfiles(activated));
    assert.equal(activated.activeRubric, "reading-profile-v2");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
