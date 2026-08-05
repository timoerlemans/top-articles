#!/usr/bin/env node
// Haalt de acht aaa-toplijsten op uit Readwise Reader en schrijft data.js.
// Vereist de @readwise/cli, al ingelogd (lokaal) of via `readwise login-with-token` (CI).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "data.js");

const RESPONSE_FIELDS =
  "title,author,site_name,summary,word_count,reading_time,published_date,image_url,source_url,url,category,tags";

// Elke familie heeft een top-10 en top-100 tag die beide teruggevoerd worden op
// dezelfde ordinale reeks (bijv. aaa-top-10/aaa-top-100 -> lees-XXXX).
const FAMILIES = [
  { id: "algemeen", label: "Algemeen", sequence: "lees", top10Tag: "aaa-top-10", top100Tag: "aaa-top-100" },
  { id: "nederlands", label: "Nederlands", sequence: "dutch", top10Tag: "aaa-dutch-top-10", top100Tag: "aaa-dutch-top-100" },
  { id: "kort", label: "Kort", sequence: "short", top10Tag: "aaa-short-top-10", top100Tag: "aaa-short-top-100" },
  { id: "kort-nederlands", label: "Kort & NL", sequence: "short-dutch", top10Tag: "aaa-short-dutch-top-10", top100Tag: "aaa-short-dutch-top-100" },
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

function tagKeys(doc) {
  const t = doc.tags;
  if (!t) return [];
  return Array.isArray(t) ? t : Object.keys(t);
}

function ordinalPosition(doc, sequence) {
  const pattern = new RegExp(`^${sequence}-([0-9]{4})$`);
  for (const key of tagKeys(doc)) {
    const match = key.match(pattern);
    if (match) return Number.parseInt(match[1], 10);
  }
  return null;
}

function toItem(doc, position, listId, warnings) {
  const also = [];
  for (const key of tagKeys(doc)) {
    if (ALL_TOPLIST_TAGS.has(key) && key !== listId.tag) {
      also.push(key);
    }
  }

  return {
    position,
    id: doc.id,
    title: doc.title ?? "(zonder titel)",
    author: doc.author ?? null,
    siteName: doc.site_name ?? null,
    category: doc.category ?? null,
    readingTime: doc.reading_time ?? null,
    wordCount: doc.word_count ?? null,
    publishedDate: doc.published_date ?? null,
    imageUrl: doc.image_url ?? null,
    sourceUrl: doc.source_url ?? null,
    readwiseUrl: doc.url ?? null,
    summary: doc.summary ?? null,
    alsoIn: also,
  };
}

async function buildFamily(family, warnings) {
  const [top10Docs, top100Docs] = await Promise.all([
    fetchDocumentsByTag(family.top10Tag),
    fetchDocumentsByTag(family.top100Tag),
  ]);

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
  await writeFile(OUT_FILE, banner + body, "utf8");
  console.log(`\nGeschreven naar ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("Build mislukt:", err);
  process.exit(1);
});
