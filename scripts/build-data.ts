#!/usr/bin/env node
// Haalt actuele Reader later-documenten op en schrijft de uniforme appdata.
// Vereist de @readwise/cli, al ingelogd (lokaal) of via `readwise login-with-token` (CI).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { buildPriorityExport } from "./lib/readwise-priority-v3.js";
import type { PriorityExportItem, PriorityOverridesConfig } from "./lib/readwise-priority-v3.js";
import { FAMILY_DEFINITIONS, buildUnifiedLists } from "./lib/unified-lists.js";
import type { RankedUnifiedEntry, UnifiedCatalogEntry } from "./lib/unified-lists.js";
import { parseReadingMinutes } from "./lib/reading-time.js";
import { createReadwiseRequester } from "./lib/readwise-request.js";
import { parseReadwiseDocumentPage } from "./lib/external-schemas.js";
import type { ReadwiseDocument } from "./lib/external-schemas.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OUT_FILE = join(ROOT, "data", "data.js");
const PRIORITY_OUT_FILE = join(ROOT, "data", "score.js");
const OVERRIDES_FILE = join(ROOT, "config", "readwise-priority-overrides.json");

const RESPONSE_FIELDS =
  "title,author,site_name,summary,word_count,reading_time,published_date,saved_at,image_url,source_url,url,category,tags,notes";

// Kleine, vaste set taal-tags — bewust geen volledige taxonomie-tags in de output.
const LANGUAGE_TAG_MAP: Readonly<Record<string, string>> = {
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

async function fetchDocumentsByLocation(location: string): Promise<ReadwiseDocument[]> {
  const results: ReadwiseDocument[] = [];
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
    if (cursor) {
      args.push("--page-cursor", cursor);
    }

    const { stdout } = await runReadwise(args);
    const page = parseReadwiseDocumentPage(JSON.parse(stdout));
    results.push(...page.documents);
    cursor = page.nextPageCursor;
  } while (cursor);

  return results;
}

function tagKeys(doc: ReadwiseDocument): string[] {
  const t = doc.tags;
  if (!t) {
    return [];
  }
  if (Array.isArray(t)) {
    return t.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof t === "object") {
    return Object.keys(t);
  }
  return [];
}

function languageFor(doc: ReadwiseDocument): string | null {
  const language = (doc.language ?? "").toLowerCase().trim();
  if (["nl", "nld", "dut", "dutch", "nederlands"].includes(language)) {return "Nederlands";}
  if (["en", "eng", "english"].includes(language)) {return "Engels";}
  for (const key of tagKeys(doc)) {
    const label = LANGUAGE_TAG_MAP[key.toLowerCase()];
    if (label) {
      return label;
    }
  }
  return null;
}

// Ordinale positietags (lees-0001, dutch-0012, short-dutch-0003, ...) zijn structuur,
// geen interesse-tags — die sluiten we hier uit, net als de aaa-toplijsttags en taal-tags.
const ORDINAL_TAG_PATTERN = /^[a-z]+(?:-[a-z]+)*-\d{3,4}$/i;

// Curatietags (triage-workflow) zijn geen inhoudelijke interesse, dus ook uitgesloten.
const CURATION_TAGS = new Set(["must-read", "shortlist", "short-list"]);
const overridesSchema = z.object({
  version: z.literal(1),
  items: z.record(z.string(), z.object({ adjustment: z.number().optional(), reason: z.string().nullable().optional() })),
});

function interestTagsFor(doc: ReadwiseDocument): string[] {
  const tags: string[] = [];
  for (const key of tagKeys(doc)) {
    if (key.startsWith("aaa-")) {
      continue;
    }
    if (ORDINAL_TAG_PATTERN.test(key)) {
      continue;
    }
    if (LANGUAGE_TAG_MAP[key.toLowerCase()]) {
      continue;
    }
    if (CURATION_TAGS.has(key.toLowerCase())) {
      continue;
    }
    tags.push(key);
  }
  return tags.sort((a, b) => a.localeCompare(b));
}

// Notitieformaat is doorgaans:
// "Waarom lezen: <tekst>\nBeste moment: <tekst>\n\n- bullets..."
// We nemen bewust alleen deze twee regels over, niet de volledige triage-notitie.
function parseNote(notes: string | null | undefined): { whyRead: string | null; bestMoment: string | null } {
  if (!notes) {
    return { whyRead: null, bestMoment: null };
  }
  const whyMatch = notes.match(/Waarom lezen:\s*([\s\S]*?)\n\s*Beste moment:/i);
  const momentMatch = notes.match(/Beste moment:\s*([^\n]*)/i);
  return {
    whyRead: whyMatch?.[1]?.trim() ?? null,
    bestMoment: momentMatch?.[1]?.trim() ?? null,
  };
}

interface CatalogItem {
  position: number | null;
  id: string;
  title: string;
  author: string | null;
  siteName: string | null;
  category: string | null;
  language: string | null;
  readingTime: string | null;
  readingMinutes: number | null;
  wordCount: number | null;
  publishedDate: string | null;
  savedDate: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  readwiseUrl: string | null;
  summary: string | null;
  whyRead: string | null;
  bestMoment: string | null;
  tags: string[];
  alsoIn: string[];
}

function toItem(doc: ReadwiseDocument, position: number | null): CatalogItem {
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
  const overrides: PriorityOverridesConfig = overridesSchema.parse(JSON.parse(await readFile(OVERRIDES_FILE, "utf8")));
  const priority = buildPriorityExport(laterDocs, { generatedAt, overrides });
  const baseCatalog = laterDocs.map((doc) => toItem(doc, null));
  type RankedCatalogItem = CatalogItem & UnifiedCatalogEntry & { priority: PriorityExportItem };
  const rankedCatalog: RankedCatalogItem[] = baseCatalog.map((item) => {
    const itemPriority = priority.items[item.id];
    if (!itemPriority) {
      throw new Error(`Prioriteit ontbreekt voor ${item.id}`);
    }
    return { ...item, priority: itemPriority };
  });
  const ranked = buildUnifiedLists(
    rankedCatalog,
    generatedAt,
  );
  const catalogById = new Map(baseCatalog.map((item) => [item.id, item]));
  type PublicItem = CatalogItem & { position: number };
  const publicItems = (items: readonly RankedUnifiedEntry<RankedCatalogItem>[]): PublicItem[] => items.map((entry, index) => {
    const item = catalogById.get(entry.id);
    if (!item) {
      throw new Error(`Catalogusitem ontbreekt voor ${entry.id}`);
    }
    return { ...item, position: index + 1 };
  });
  const families = FAMILY_DEFINITIONS.map((family) => ({
    ...family,
    lists: {
      "top-10": { tag: family.top10Tag, items: publicItems(ranked.families[family.id]["top-10"]) },
      "top-100": { tag: family.top100Tag, items: publicItems(ranked.families[family.id]["top-100"]) },
    },
  }));
  const labels: Readonly<Record<keyof typeof ranked.derived, string>> = { consensus: "Consensus", nieuw: "Nieuw", tijdloos: "Tijdloos" };
  const derivedLists = Object.fromEntries(
    (Object.keys(ranked.derived) as Array<keyof typeof ranked.derived>).map((id) => {
      const items = ranked.derived[id];
      return [id, {
        id,
        label: labels[id],
        items: publicItems(items).map(({ position, ...item }) => ({ id: item.id, title: item.title, position })),
      }];
    }),
  );

  const membershipById = new Map<string, Array<{ familyId: string; size: string; position: number }>>();
  const topTagsById = new Map<string, Set<string>>();
  for (const family of families) {
    for (const [size, list] of Object.entries(family.lists)) {
      for (const item of list.items) {
        const memberships = membershipById.get(item.id) ?? [];
        memberships.push({ familyId: family.id, size, position: item.position });
        membershipById.set(item.id, memberships);
        const topTags = topTagsById.get(item.id) ?? new Set<string>();
        topTags.add(list.tag);
        topTagsById.set(item.id, topTags);
      }
    }
  }
  for (const family of families) {
    for (const list of Object.values(family.lists)) {
      for (const item of list.items) {
        item.alsoIn = [...(topTagsById.get(item.id) ?? [])].filter((tag) => tag !== list.tag);
      }
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

  const banner = `// Automatisch gegenereerd door scripts/build-data.ts — niet handmatig bewerken.\n`;
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

main().catch((error: unknown) => {
  console.error("Build mislukt:", error);
  process.exit(1);
});
