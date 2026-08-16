#!/usr/bin/env node
// Haalt actuele Reader later-documenten op en schrijft de uniforme appdata.
// Vereist de @readwise/cli, al ingelogd (lokaal) of via `readwise login-with-token` (CI).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildPriorityExport } from "./lib/readwise-priority-v3.mjs";
import { FAMILY_DEFINITIONS, buildUnifiedLists } from "./lib/unified-lists.mjs";
import { parseReadingMinutes } from "./lib/reading-time.mjs";
import { createReadwiseRequester } from "./lib/readwise-request.mjs";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "data", "data.js");
const PRIORITY_OUT_FILE = join(__dirname, "..", "data", "score.js");
const OVERRIDES_FILE = join(__dirname, "..", "config", "readwise-priority-overrides.json");

const RESPONSE_FIELDS =
  "title,author,site_name,summary,word_count,reading_time,published_date,saved_at,image_url,source_url,url,category,tags,notes";

// Kleine, vaste set taal-tags — bewust geen volledige taxonomie-tags in de output.
const LANGUAGE_TAG_MAP = {
  dutch: "Nederlands",
  nl: "Nederlands",
  nederlands: "Nederlands",
  english: "Engels",
  en: "Engels",
  "lang:en": "Engels",
  french: "Frans",
  fr: "Frans",
};

const runReadwise = createReadwiseRequester({
  exec: (commandArgs) => execFileAsync("readwise", commandArgs),
});

async function fetchDocumentsByLocation(location) {
  const results = [];
  let cursor = null;

  do {
    const args = [
      "reader-list-documents",
      "--location",
      location,
      "--limit",
      "100",
      "--response-fields",
      RESPONSE_FIELDS,
      "--json",
    ];
    if (cursor) args.push("--page-cursor", cursor);

    const { stdout } = await runReadwise(args);
    const parsed = JSON.parse(stdout);
    const page = Array.isArray(parsed) ? parsed : parsed.results ?? [];
    results.push(...page);
    cursor = Array.isArray(parsed) ? null : parsed.nextPageCursor ?? null;
  } while (cursor);

  return results;
}

function tagKeys(doc) {
  const t = doc.tags;
  if (!t) return [];
  return Array.isArray(t) ? t : Object.keys(t);
}

function languageFor(doc) {
  const language = String(doc.language ?? "").toLowerCase().trim();
  if (["nl", "nld", "dut", "dutch", "nederlands"].includes(language)) return "Nederlands";
  if (["en", "eng", "english"].includes(language)) return "Engels";
  for (const key of tagKeys(doc)) {
    const label = LANGUAGE_TAG_MAP[key.toLowerCase()];
    if (label) return label;
  }
  return null;
}

// Ordinale positietags (lees-0001, dutch-0012, short-dutch-0003, ...) zijn structuur,
// geen interesse-tags — die sluiten we hier uit, net als de aaa-toplijsttags en taal-tags.
const ORDINAL_TAG_PATTERN = /^[a-z]+(?:-[a-z]+)*-\d{3,4}$/i;

// Curatietags (triage-workflow) zijn geen inhoudelijke interesse, dus ook uitgesloten.
const CURATION_TAGS = new Set(["must-read", "shortlist", "short-list"]);

function interestTagsFor(doc) {
  const tags = [];
  for (const key of tagKeys(doc)) {
    if (key.startsWith("aaa-")) continue;
    if (ORDINAL_TAG_PATTERN.test(key)) continue;
    if (LANGUAGE_TAG_MAP[key.toLowerCase()]) continue;
    if (CURATION_TAGS.has(key.toLowerCase())) continue;
    tags.push(key);
  }
  return tags.sort((a, b) => a.localeCompare(b));
}

// Notitieformaat is doorgaans:
// "Waarom lezen: <tekst>\nBeste moment: <tekst>\n\n- bullets..."
// We nemen bewust alleen deze twee regels over, niet de volledige triage-notitie.
function parseNote(notes) {
  if (!notes) return { whyRead: null, bestMoment: null };
  const whyMatch = notes.match(/Waarom lezen:\s*([\s\S]*?)\n\s*Beste moment:/i);
  const momentMatch = notes.match(/Beste moment:\s*([^\n]*)/i);
  return {
    whyRead: whyMatch ? whyMatch[1].trim() : null,
    bestMoment: momentMatch ? momentMatch[1].trim() : null,
  };
}

function toItem(doc, position) {
  const { whyRead, bestMoment } = parseNote(doc.notes);

  return {
    position,
    id: doc.id,
    title: doc.title ?? "(zonder titel)",
    author: doc.author ?? null,
    siteName: doc.site_name ?? null,
    category: doc.category ?? null,
    language: languageFor(doc),
    readingTime: doc.reading_time ?? null,
    readingMinutes: parseReadingMinutes(doc.reading_time),
    wordCount: doc.word_count ?? null,
    publishedDate: doc.published_date ?? null,
    savedDate: doc.saved_at ?? null,
    imageUrl: doc.image_url ?? null,
    sourceUrl: doc.source_url ?? null,
    readwiseUrl: doc.url ?? null,
    summary: doc.summary ?? null,
    whyRead,
    bestMoment,
    tags: interestTagsFor(doc),
    alsoIn: [],
  };
}

async function main() {
  const laterDocs = await fetchDocumentsByLocation("later");
  const generatedAt = new Date().toISOString();
  const overrides = JSON.parse(await readFile(OVERRIDES_FILE, "utf8"));
  const priority = buildPriorityExport(laterDocs, { generatedAt, overrides });
  const baseCatalog = laterDocs.map((doc) => toItem(doc, null));
  const ranked = buildUnifiedLists(
    baseCatalog.map((item) => ({ ...item, priority: priority.items[item.id] })),
    generatedAt
  );
  const catalogById = new Map(baseCatalog.map((item) => [item.id, item]));
  const publicItems = (items) => items.map((entry, index) => ({
    ...catalogById.get(entry.id),
    position: index + 1,
  }));
  const families = FAMILY_DEFINITIONS.map((family) => ({
    ...family,
    lists: {
      "top-10": { tag: family.top10Tag, items: publicItems(ranked.families[family.id]["top-10"]) },
      "top-100": { tag: family.top100Tag, items: publicItems(ranked.families[family.id]["top-100"]) },
    },
  }));
  const labels = { consensus: "Consensus", nieuw: "Nieuw", tijdloos: "Tijdloos" };
  const derivedLists = Object.fromEntries(Object.entries(ranked.derived).map(([id, items]) => [id, {
    id,
    label: labels[id],
    items: publicItems(items).map(({ position, ...item }) => ({ id: item.id, title: item.title, position })),
  }]));

  const membershipById = new Map();
  const topTagsById = new Map();
  for (const family of families) {
    for (const [size, list] of Object.entries(family.lists)) {
      for (const item of list.items) {
        const memberships = membershipById.get(item.id) ?? [];
        memberships.push({ familyId: family.id, size, position: item.position });
        membershipById.set(item.id, memberships);
        const topTags = topTagsById.get(item.id) ?? new Set();
        topTags.add(list.tag);
        topTagsById.set(item.id, topTags);
      }
    }
  }
  for (const family of families) {
    for (const list of Object.values(family.lists)) {
      for (const item of list.items) item.alsoIn = [...(topTagsById.get(item.id) ?? [])].filter((tag) => tag !== list.tag);
    }
  }
  const catalogItems = baseCatalog.map((item) => ({
    ...item,
    alsoIn: [...(topTagsById.get(item.id) ?? [])],
    memberships: membershipById.get(item.id) ?? [],
  }));

  const data = {
    generatedAt,
    families,
    catalog: { items: catalogItems },
    derivedLists,
  };

  const counts = families
    .map((f) => `${f.id}: top-10=${f.lists["top-10"].items.length}, top-100=${f.lists["top-100"].items.length}`)
    .join("\n  ");
  console.log(`Toplijsten berekend:\n  ${counts}\n  later-catalogus: ${catalogItems.length}`);

  const banner = `// Automatisch gegenereerd door scripts/build-data.mjs — niet handmatig bewerken.\n`;
  const body = `window.TOP_ARTICLES = ${JSON.stringify(data, null, 2)};\n`;
  const priorityBody = `window.TOP_ARTICLE_PRIORITY = ${JSON.stringify(priority, null, 2)};\n`;
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await Promise.all([
    writeFile(OUT_FILE, banner + body, "utf8"),
    writeFile(PRIORITY_OUT_FILE, banner + priorityBody, "utf8"),
  ]);
  console.log(`\nGeschreven naar ${OUT_FILE}`);
  console.log(`Geschreven naar ${PRIORITY_OUT_FILE} (${Object.keys(priority.items).length} later-documenten)`);
}

main().catch((err) => {
  console.error("Build mislukt:", err);
  process.exit(1);
});
