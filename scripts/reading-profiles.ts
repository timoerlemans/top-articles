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

const root = resolve(import.meta.dirname, "../..");
const defaultDirectory = resolve(root, ".tmp/readwise/reading-profiles");
const configPath = resolve(root, "config/readwise-reading-profiles.json");
const preferencesPath = resolve(root, "config/readwise-reading-preferences.md");
const exec = promisify(execFile);
const run = createReadwiseRequester({ exec: (args) => exec("readwise", args, { maxBuffer: 32 * 1024 * 1024 }) });
async function json(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")) as unknown; }
async function optionalJson(path: string): Promise<unknown> { try { return await json(path); } catch { return null; } }
async function main(): Promise<void> {
  const [command, ...rawFlags] = process.argv.slice(2);
  const flags = [...rawFlags];
  const directoryIndex = flags.indexOf("--evidence-dir");
  const selectedDirectory = directoryIndex >= 0 ? flags[directoryIndex + 1] : undefined;
  if (directoryIndex >= 0 && (!selectedDirectory || selectedDirectory.startsWith("--"))) { throw new Error("--evidence-dir vereist een pad"); }
  if (directoryIndex >= 0) { flags.splice(directoryIndex, 2); }
  const directory = selectedDirectory ? resolve(root, selectedDirectory) : defaultDirectory;
  if (!command || !["prepare", "validate", "report"].includes(command) || flags.some((flag) => !["--all-later", "--require-all-reviewed", "--fetch-content"].includes(flag))) {
    throw new Error("Gebruik reading:profiles -- prepare --all-later [--fetch-content] | validate --require-all-reviewed | report");
  }
  const value = await json(configPath);
  if (!validateReadingProfiles(value)) { throw new Error("Ongeldige leesprofielenconfig"); }
  const config: ReadingProfilesConfig = value;
  const preferences = await readFile(preferencesPath, "utf8");
  if (command !== "prepare") {
    const snapshot = await json(resolve(directory, "snapshot.json"));
    if (!record(snapshot) || snapshot.version !== 1 || snapshot.scope !== "later" || snapshot.complete !== true || !Array.isArray(snapshot.documents) || snapshot.preferencesFingerprint !== fingerprint(preferences)) { throw new Error("Bereid eerst actuele evidence voor"); }
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
    return;
  }
  const documents = await fetchReadwiseDocuments(run, { profile: "catalog", location: "later" });
  await mkdir(directory, { recursive: true });
  const evidence = [];
  for (const [index, doc] of documents.entries()) {
    const current = config.items[doc.id];
    const prior = await optionalJson(resolve(directory, `source-${doc.id}.json`))
      ?? await optionalJson(resolve(defaultDirectory, `source-${doc.id}.json`));
    const cache = await optionalJson(resolve(root, `.tmp/readwise/enrich_prefetch_${doc.id}.json`));
    let content: string | null = record(prior) && prior.sourceFingerprint === profileSourceFingerprint(doc) && typeof prior.content === "string" ? prior.content : null;
    if (!content && record(cache) && typeof cache.full_content === "string") { content = cache.full_content; }
    let contentError: string | null = null;
    if (!content && flags.includes("--fetch-content") && ["article", "email", "rss", "pdf"].includes(doc.category ?? "") && !isBook(doc) && profileNeedsSource(current, doc, preferences)) {
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
    return !profile || profile.sourceFingerprint !== doc.sourceFingerprint || profile.evidenceFingerprint !== doc.evidenceFingerprint || profile.preferencesFingerprint !== doc.preferencesFingerprint || profile.rubricVersion !== PROFILE_RUBRIC || profile.status === "draft";
  });
  const generatedAt = new Date().toISOString();
  await writeFile(resolve(directory, "snapshot.json"), JSON.stringify({ version: 1, scope: "later", complete: true, generatedAt, preferencesFingerprint: fingerprint(preferences), documents: evidence }, null, 2));
  for (let offset = 0; offset < pending.length; offset += 25) {
    await writeFile(resolve(directory, `batch-${String(offset / 25 + 1).padStart(3, "0")}.json`), JSON.stringify({ rubricVersion: PROFILE_RUBRIC, readingPreferences: preferences, instruction: "Beoordeel inspanning, emotioneel gewicht, toon en iedere behoeftefit 0–4 uit de tekst. Geen rang/curatie als bewijs. Ontbrekende zekerheid: draft/rejected. Bewaar uitsluitend fingerprints en evidenceRefs in config, geen brontekst.", documents: pending.slice(offset, offset + 25) }, null, 2));
  }
  console.log(`${documents.length} Later-documenten; ${pending.length} te beoordelen. Evidence blijft lokaal in ${directory}`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
