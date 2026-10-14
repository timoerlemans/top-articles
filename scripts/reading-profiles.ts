#!/usr/bin/env node
import { isBook } from "./lib/priority-document.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchReadwiseDocuments } from "./lib/readwise-documents.js";
import { createReadwiseRequester } from "./lib/readwise-request.js";
import { buildPriorityEvidence } from "./lib/priority-judgments.js";
import { PROFILE_RUBRIC, fingerprint, profileNeedsSource, profileSourceFingerprint, validateReadingProfiles } from "./lib/reading-profiles.js";
import type { ReadingProfilesConfig } from "./lib/reading-profiles.js";
import { record } from "../src/reading-profiles.js";
import { createMigration, validMigration } from "./lib/reading-profile-migration.js";
import type { ProfileEvidence, MigrationManifest } from "./lib/reading-profile-migration.js";

const root = resolve(import.meta.dirname, "../..");
const defaultDirectory = resolve(root, ".tmp/readwise/reading-profiles");
const defaultConfigPath = resolve(root, "config/readwise-reading-profiles.json");
const preferencesPath = resolve(root, "config/readwise-reading-preferences.md");
const exec = promisify(execFile);
const run = createReadwiseRequester({ exec: (args) => exec("readwise", args, { maxBuffer: 32 * 1024 * 1024 }) });
async function json(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")) as unknown; }
async function optionalJson(path: string): Promise<unknown> { try { return await json(path); } catch { return null; } }
async function existingJson(path: string): Promise<{ value: unknown } | null> {
  try { return { value: await json(path) }; }
  catch (error: unknown) {
    if (record(error) && error.code === "ENOENT") { return null; }
    throw new Error(`Bevroren snapshot/manifest onleesbaar: ${path}`, { cause: error });
  }
}
async function main(): Promise<void> {
  const [command, ...rawFlags] = process.argv.slice(2);
  const flags = [...rawFlags];
  const configIndex = flags.indexOf("--config");
  const selectedConfig = configIndex >= 0 ? flags[configIndex + 1] : undefined;
  if (configIndex >= 0 && (!selectedConfig || selectedConfig.startsWith("--"))) { throw new Error("--config vereist een pad"); }
  if (configIndex >= 0) { flags.splice(configIndex, 2); }
  const configPath = selectedConfig ? resolve(root, selectedConfig) : defaultConfigPath;
  const directoryIndex = flags.indexOf("--evidence-dir");
  const selectedDirectory = directoryIndex >= 0 ? flags[directoryIndex + 1] : undefined;
  if (directoryIndex >= 0 && (!selectedDirectory || selectedDirectory.startsWith("--"))) { throw new Error("--evidence-dir vereist een pad"); }
  if (directoryIndex >= 0) { flags.splice(directoryIndex, 2); }
  const migration = flags.includes("--migration");
  const directory = selectedDirectory ? resolve(root, selectedDirectory) : migration ? `${defaultDirectory}-v2-migration` : defaultDirectory;
  if (!command || !["prepare", "validate", "report"].includes(command) || flags.some((flag) => !["--all-later", "--require-all-reviewed", "--fetch-content", "--migration", "--activate-v2"].includes(flag))) {
    throw new Error("Gebruik reading:profiles -- prepare --all-later [--fetch-content] [--migration] | validate --require-all-reviewed | report");
  }
  if (flags.includes("--activate-v2") && (command !== "validate" || !flags.includes("--require-all-reviewed"))) { throw new Error("V2 activeren vereist validate --require-all-reviewed"); }
  const value = await json(configPath);
  if (!validateReadingProfiles(value)) { throw new Error("Ongeldige leesprofielenconfig"); }
  const config: ReadingProfilesConfig = value;
  const preferences = await readFile(preferencesPath, "utf8");
  const existingManifest = await existingJson(resolve(directory, "manifest.json"));
  const manifest = existingManifest?.value ?? null;
  if (existingManifest !== null) {
    const frozen = await json(resolve(directory, "snapshot.json"));
    if (!validMigration(frozen, manifest) || frozen.preferencesFingerprint !== fingerprint(preferences)) { throw new Error("Bevroren snapshot of manifest ongeldig/veranderd"); }
    for (let offset = 0; offset < frozen.documents.length; offset += 25) {
      const batch = await json(resolve(directory, `batch-${String(offset / 25 + 1).padStart(3, "0")}.json`));
      if (!record(batch) || batch.rubricVersion !== PROFILE_RUBRIC || JSON.stringify(batch.documents) !== JSON.stringify(frozen.documents.slice(offset, offset + 25))) {
        throw new Error("Bevroren batch wijkt af van snapshot/manifest");
      }
    }
    if (command === "prepare") {
      console.log(`${frozen.documents.length} documenten, ${Math.ceil(frozen.documents.length / 25)} batches; bestaande bevroren snapshot behouden.`);
      return;
    }
  }
  if (command !== "prepare") {
    const snapshot = await json(resolve(directory, "snapshot.json"));
    if (!record(snapshot) || (snapshot.version !== 1 && snapshot.version !== 2) || snapshot.scope !== "later" || snapshot.complete !== true || !Array.isArray(snapshot.documents) || snapshot.preferencesFingerprint !== fingerprint(preferences)
      || (snapshot.version === 2 && !validMigration(snapshot, manifest))) { throw new Error("Bereid eerst actuele evidence voor met geldig snapshot/manifest"); }
    const counts = { accepted: 0, draft: 0, rejected: 0, missing: 0, stale: 0 };
    for (const evidence of snapshot.documents) {
      if (!record(evidence) || typeof evidence.id !== "string") { throw new Error("Ongeldige snapshot"); }
      const profile = config.items[evidence.id];
      if (!profile) { counts.missing++; }
      else if (profile.rubricVersion !== PROFILE_RUBRIC || profile.sourceFingerprint !== evidence.sourceFingerprint || profile.preferencesFingerprint !== fingerprint(preferences) || profile.evidenceFingerprint !== evidence.evidenceFingerprint) { counts.stale++; }
      else { counts[profile.status]++; }
    }
    console.log(JSON.stringify(counts, null, 2));
    if (flags.includes("--require-all-reviewed") && (counts.missing || counts.stale)) { throw new Error("Niet alle huidige documenten hebben een actuele beoordeling"); }
    if (flags.includes("--activate-v2")) {
      if (snapshot.version !== 2 || !validMigration(snapshot, manifest)) { throw new Error("V2 activeren vereist een complete bevroren migratiesnapshot"); }
      await writeFile(configPath, JSON.stringify({ ...config, activeRubric: PROFILE_RUBRIC }, null, 2) + "\n");
      console.log("V2-migratie geactiveerd; nieuwe ontbrekende beoordelingen verlagen het browsercontract niet.");
    }
    return;
  }
  const existingSnapshot = await existingJson(resolve(directory, "snapshot.json"));
  if (existingSnapshot !== null && (migration || (record(existingSnapshot.value) && existingSnapshot.value.version === 2))) {
    throw new Error("Bevroren snapshot bestaat zonder geldig manifest; behoud bestaande evidence");
  }
  const documents = (await fetchReadwiseDocuments(run, { profile: "catalog", location: "later" })).sort((a, b) => a.id.localeCompare(b.id));
  await mkdir(directory, { recursive: true });
  const evidence: ProfileEvidence[] = [];
  for (const [index, doc] of documents.entries()) {
    const current = config.items[doc.id];
    const prior = await optionalJson(resolve(directory, `source-${doc.id}.json`))
      ?? await optionalJson(resolve(defaultDirectory, `source-${doc.id}.json`));
    const cache = await optionalJson(resolve(root, `.tmp/readwise/enrich_prefetch_${doc.id}.json`));
    let content: string | null = record(prior) && prior.sourceFingerprint === profileSourceFingerprint(doc) && typeof prior.content === "string" ? prior.content : null;
    if (!content && record(cache) && cache.sourceFingerprint === profileSourceFingerprint(doc) && typeof cache.full_content === "string") { content = cache.full_content; }
    let contentError: string | null = null;
    if (!content && flags.includes("--fetch-content") && ["article", "email", "rss", "pdf"].includes(doc.category ?? "") && !isBook(doc) && (migration || profileNeedsSource(current, doc, preferences))) {
      try {
        const details: unknown = JSON.parse((await run(["reader-get-document-details", "--document-id", doc.id, "--json"])).stdout);
        if (record(details) && details.id === doc.id && typeof details.content === "string") { content = details.content; }
        if (content) { await writeFile(resolve(directory, `source-${doc.id}.json`), JSON.stringify({ sourceFingerprint: profileSourceFingerprint(doc), content })); }
      } catch (error) { contentError = error instanceof Error ? error.message : String(error); }
    }
    // Category/book exclusions are decided from metadata; body changes cannot change that outcome.
    if (!["article", "email", "rss", "pdf"].includes(doc.category ?? "") || isBook(doc)) { content = null; }
    const base = buildPriorityEvidence(doc);
    const sourceFingerprint = profileSourceFingerprint(doc);
    const evidenceFingerprint = fingerprint(JSON.stringify({ sourceFingerprint, summary: base.summary, notes: base.notes, content }));
    evidence.push({ id: doc.id, category: doc.category, readingTime: doc.reading_time, title: doc.title, summary: base.summary, notes: base.notes, contentTags: base.contentTags, content, contentError, sourceFingerprint, evidenceFingerprint, preferencesFingerprint: fingerprint(preferences) });
    if ((index + 1) % 25 === 0) { console.log(`Evidence ${index + 1}/${documents.length}`); }
  }
  const pending = evidence.filter((doc) => {
    const profile = config.items[doc.id];
    return migration || !profile || profile.sourceFingerprint !== doc.sourceFingerprint || profile.evidenceFingerprint !== doc.evidenceFingerprint || profile.preferencesFingerprint !== doc.preferencesFingerprint || profile.rubricVersion !== PROFILE_RUBRIC || profile.status === "draft";
  });
  const generatedAt = new Date().toISOString();
  let frozenManifest: MigrationManifest | null = null;
  if (migration) {
    const { snapshot, manifest: createdManifest } = createMigration(evidence, preferences, generatedAt);
    await writeFile(resolve(directory, "snapshot.json"), JSON.stringify(snapshot, null, 2), { flag: "wx" });
    frozenManifest = createdManifest;
    console.log(`${evidence.length} documenten, ${createdManifest.batches.length} batches; vaste lokale migratie-indeling.`);
    if (createdManifest.batches.length > 21) { console.log(`Extra beoordeling nodig: ${createdManifest.batches.length - 21} batches boven de 21 bestaande tickets.`); }
  } else {
    await writeFile(resolve(directory, "snapshot.json"), JSON.stringify({ version: 1, scope: "later", complete: true, generatedAt, preferencesFingerprint: fingerprint(preferences), documents: evidence }, null, 2));
  }
  for (let offset = 0; offset < pending.length; offset += 25) {
    await writeFile(resolve(directory, `batch-${String(offset / 25 + 1).padStart(3, "0")}.json`), JSON.stringify({ rubricVersion: PROFILE_RUBRIC, readingPreferences: preferences, instruction: "Beoordeel inspanning, emotioneel gewicht, toon, iedere behoeftefit, activation en interruptibility uit inhoudelijke brontekst. Alle ratings integer 0–4, zelfstandig beoordeeld; zie docs/reading-profiles.md voor ankers. Geen rang/curatie als bewijs. Ontbrekende zekerheid: draft/rejected. Bewaar uitsluitend fingerprints en evidenceRefs in config, geen brontekst.", documents: pending.slice(offset, offset + 25) }, null, 2), migration ? { flag: "wx" } : {});
  }
  if (frozenManifest) { await writeFile(resolve(directory, "manifest.json"), JSON.stringify(frozenManifest, null, 2), { flag: "wx" }); }
  console.log(`${documents.length} Later-documenten; ${pending.length} te beoordelen. Evidence blijft lokaal in ${directory}`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
