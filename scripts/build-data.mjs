#!/usr/bin/env node
// Haalt de aaa-toplijsten op uit Readwise Reader en schrijft data.js.
// Vereist de @readwise/cli, al ingelogd (lokaal) of via `readwise login-with-token` (CI).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "data", "data.js");

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

// Elke familie heeft een top-10 en top-100 tag die beide teruggevoerd worden op
// dezelfde ordinale reeks (bijv. aaa-top-10/aaa-top-100 -> lees-XXXX).
const FAMILIES = [
  { id: "algemeen", label: "Algemeen", sequence: "lees", top10Tag: "aaa-top-10", top100Tag: "aaa-top-100" },
  { id: "nederlands", label: "Nederlands", sequence: "dutch", top10Tag: "aaa-dutch-top-10", top100Tag: "aaa-dutch-top-100" },
  { id: "kort", label: "Kort", sequence: "short", top10Tag: "aaa-short-top-10", top100Tag: "aaa-short-top-100" },
  { id: "kort-nederlands", label: "Kort & NL", sequence: "short-dutch", top10Tag: "aaa-short-dutch-top-10", top100Tag: "aaa-short-dutch-top-100" },
  { id: "luchtig", label: "Luchtig", sequence: "luchtig", top10Tag: "aaa-luchtig-top-10", top100Tag: "aaa-luchtig-top-100" },
  { id: "luchtig-nederlands", label: "Luchtig & NL", sequence: "luchtig-nederlands", top10Tag: "aaa-luchtig-nederlands-top-10", top100Tag: "aaa-luchtig-nederlands-top-100" },
  { id: "boeken", label: "Boeken", sequence: "boek", top10Tag: "boek-top-10", top100Tag: "boek-top-100", source: "category" },
];

const ALL_TOPLIST_TAGS = new Set(FAMILIES.flatMap((f) => [f.top10Tag, f.top100Tag]));

async function fetchDocumentsByTag(tag) {
  const results = [];
  let cursor = null;

  do {
    const args = [
      "reader-list-documents",
      "--tag",
      tag,
      "--limit",
      "100",
      "--response-fields",
      RESPONSE_FIELDS,
      "--json",
    ];
    if (cursor) {
      args.push("--page-cursor", cursor);
    }

    const { stdout } = await execFileAsync("readwise", args);
    const parsed = JSON.parse(stdout);
    const page = Array.isArray(parsed) ? parsed : parsed.results ?? [];
    results.push(...page);
    cursor = Array.isArray(parsed) ? null : parsed.nextPageCursor ?? null;
  } while (cursor);

  return results;
}

// Er bestaat geen aaa-boek-top-10/-100 kopjestag in Readwise (alleen de losse
// boek-XXXX reeks) — daarom halen we boeken op via categorie (pdf/epub) i.p.v. tag,
// conform de readwise-reorder skill die diezelfde categorieën aan de boek-reeks koppelt.
async function fetchDocumentsByCategory(category) {
  const results = [];
  let cursor = null;

  do {
    const args = [
      "reader-list-documents",
      "--category",
      category,
      "--limit",
      "100",
      "--response-fields",
      RESPONSE_FIELDS,
      "--json",
    ];
    if (cursor) {
      args.push("--page-cursor", cursor);
    }

    const { stdout } = await execFileAsync("readwise", args);
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

function ordinalPosition(doc, sequence) {
  const digits = sequence.startsWith("luchtig") ? 3 : 4;
  const pattern = new RegExp(`^${sequence}-([0-9]{${digits}})$`);
  for (const key of tagKeys(doc)) {
    const match = key.match(pattern);
    if (match) return Number.parseInt(match[1], 10);
  }
  return null;
}

function languageFor(doc) {
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

function toItem(doc, position, listId, warnings) {
  const also = [];
  for (const key of tagKeys(doc)) {
    if (ALL_TOPLIST_TAGS.has(key) && key !== listId.tag) {
      also.push(key);
    }
  }

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
    alsoIn: also,
  };
}

async function buildFamily(family, warnings) {
  let top10Docs, top100Docs;

  if (family.source === "category") {
    const [pdfDocs, epubDocs] = await Promise.all([
      fetchDocumentsByCategory("pdf"),
      fetchDocumentsByCategory("epub"),
    ]);
    const seen = new Set();
    const numbered = [];
    for (const doc of [...pdfDocs, ...epubDocs]) {
      if (seen.has(doc.id)) continue;
      if (ordinalPosition(doc, family.sequence) === null) continue;
      seen.add(doc.id);
      numbered.push(doc);
    }
    numbered.sort((a, b) => ordinalPosition(a, family.sequence) - ordinalPosition(b, family.sequence));
    top100Docs = numbered.slice(0, 100);
    top10Docs = numbered.slice(0, 10);
  } else {
    [top10Docs, top100Docs] = await Promise.all([
      fetchDocumentsByTag(family.top10Tag),
      fetchDocumentsByTag(family.top100Tag),
    ]);
  }

  const lists = {
    "top-10": buildList(family, family.top10Tag, top10Docs, warnings),
    "top-100": buildList(family, family.top100Tag, top100Docs, warnings),
  };

  // Sanity check: top-10 moet een deelverzameling zijn van top-100.
  const top100Ids = new Set(lists["top-100"].items.map((i) => i.id));
  for (const item of lists["top-10"].items) {
    if (!top100Ids.has(item.id)) {
      warnings.push(
        `[${family.id}] "${item.title}" (${family.top10Tag}) staat niet in ${family.top100Tag}.`
      );
    }
  }

  return { id: family.id, label: family.label, sequence: family.sequence, lists };
}

function buildList(family, tag, docs, warnings) {
  const withPosition = [];
  const seenPositions = new Map();

  for (const doc of docs) {
    const position = ordinalPosition(doc, family.sequence);
    if (position === null) {
      warnings.push(
        `[${family.id}] document "${doc.title}" (${doc.id}) heeft tag ${tag} maar geen ${family.sequence}-XXXX tag; achteraan geplaatst.`
      );
      withPosition.push({ doc, position: Number.POSITIVE_INFINITY });
      continue;
    }
    if (seenPositions.has(position)) {
      warnings.push(
        `[${family.id}] dubbele positie ${family.sequence}-${String(position).padStart(4, "0")}: "${seenPositions.get(position)}" en "${doc.title}".`
      );
    }
    seenPositions.set(position, doc.title);
    withPosition.push({ doc, position });
  }

  withPosition.sort((a, b) => a.position - b.position);

  const positions = withPosition
    .map((w) => w.position)
    .filter((p) => Number.isFinite(p));
  for (let i = 0; i < positions.length - 1; i++) {
    if (positions[i + 1] - positions[i] > 1) {
      warnings.push(
        `[${family.id}] gat in de reeks tussen ${family.sequence}-${String(positions[i]).padStart(4, "0")} en ${family.sequence}-${String(positions[i + 1]).padStart(4, "0")} binnen ${tag}.`
      );
    }
  }

  const items = withPosition.map((w, idx) =>
    toItem(w.doc, Number.isFinite(w.position) ? w.position : idx + 1, { tag }, warnings)
  );

  return { tag, items };
}

async function main() {
  const warnings = [];
  const families = [];

  for (const family of FAMILIES) {
    families.push(await buildFamily(family, warnings));
  }

  const data = {
    generatedAt: new Date().toISOString(),
    families,
  };

  const counts = families
    .map((f) => `${f.id}: top-10=${f.lists["top-10"].items.length}, top-100=${f.lists["top-100"].items.length}`)
    .join("\n  ");
  console.log(`Toplijsten opgehaald:\n  ${counts}`);

  if (warnings.length > 0) {
    console.warn(`\n${warnings.length} waarschuwing(en):`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }

  const banner = `// Automatisch gegenereerd door scripts/build-data.mjs — niet handmatig bewerken.\n`;
  const body = `window.TOP_ARTICLES = ${JSON.stringify(data, null, 2)};\n`;
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, banner + body, "utf8");
  console.log(`\nGeschreven naar ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("Build mislukt:", err);
  process.exit(1);
});
