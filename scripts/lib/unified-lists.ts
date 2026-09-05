import type { PriorityPositions, PrioritySequence } from "./readwise-priority-v3.js";

export interface FamilyDefinition {
  readonly id: string;
  readonly label: string;
  readonly sequence: PrioritySequence;
  readonly top10Tag: string;
  readonly top100Tag: string;
}

export const FAMILY_DEFINITIONS = [
  { id: "algemeen", label: "Algemeen", sequence: "lees", top10Tag: "aaa-top-10", top100Tag: "aaa-top-100" },
  { id: "nederlands", label: "Nederlands", sequence: "dutch", top10Tag: "aaa-dutch-top-10", top100Tag: "aaa-dutch-top-100" },
  { id: "kort", label: "Kort", sequence: "short", top10Tag: "aaa-short-top-10", top100Tag: "aaa-short-top-100" },
  { id: "kort-nederlands", label: "Kort & NL", sequence: "short-dutch", top10Tag: "aaa-short-dutch-top-10", top100Tag: "aaa-short-dutch-top-100" },
  { id: "luchtig", label: "Luchtig", sequence: "luchtig", top10Tag: "aaa-luchtig-top-10", top100Tag: "aaa-luchtig-top-100" },
  { id: "luchtig-nederlands", label: "Luchtig & NL", sequence: "luchtig-nederlands", top10Tag: "aaa-luchtig-nederlands-top-10", top100Tag: "aaa-luchtig-nederlands-top-100" },
  { id: "scrum", label: "Scrum", sequence: "scrum", top10Tag: "aaa-scrum-top-10", top100Tag: "aaa-scrum-top-100" },
  { id: "software-development", label: "Software development", sequence: "software-development", top10Tag: "aaa-software-development-top-10", top100Tag: "aaa-software-development-top-100" },
  { id: "front-end-development", label: "Front-end development", sequence: "front-end-development", top10Tag: "aaa-front-end-development-top-10", top100Tag: "aaa-front-end-development-top-100" },
  { id: "boeken", label: "Boeken", sequence: "boek", top10Tag: "boek-top-10", top100Tag: "boek-top-100" },
  { id: "pdfs", label: "PDF's", sequence: "pdf", top10Tag: "pdf-top-10", top100Tag: "pdf-top-100" },
  { id: "videos", label: "Video's", sequence: "video", top10Tag: "video-top-10", top100Tag: "video-top-100" },
] as const satisfies readonly FamilyDefinition[];

export type FamilyId = (typeof FAMILY_DEFINITIONS)[number]["id"];

export interface UnifiedPriority {
  score: number;
  sequences: readonly PrioritySequence[];
  positions: PriorityPositions;
}

export interface UnifiedCatalogEntry {
  id: string;
  savedDate?: string | null;
  publishedDate?: string | null;
  priority: UnifiedPriority;
  [key: string]: unknown;
}

export type RankedUnifiedEntry<T extends UnifiedCatalogEntry = UnifiedCatalogEntry> =
  Omit<T, "score" | "position"> & { id: string; score: number; position: number };

export interface UnifiedFamilyLists<T extends UnifiedCatalogEntry = UnifiedCatalogEntry> {
  "top-10": RankedUnifiedEntry<T>[];
  "top-100": RankedUnifiedEntry<T>[];
}

export interface UnifiedDerivedLists<T extends UnifiedCatalogEntry = UnifiedCatalogEntry> {
  consensus: RankedUnifiedEntry<T>[];
  nieuw: RankedUnifiedEntry<T>[];
  tijdloos: RankedUnifiedEntry<T>[];
}

export interface UnifiedLists<T extends UnifiedCatalogEntry = UnifiedCatalogEntry> {
  families: Record<FamilyId, UnifiedFamilyLists<T>>;
  derived: UnifiedDerivedLists<T>;
}

const DAY_MS = 86_400_000;

function rank<T extends UnifiedCatalogEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) =>
    b.priority.score - a.priority.score ||
    Date.parse(a.savedDate ?? "") - Date.parse(b.savedDate ?? "") ||
    a.id.localeCompare(b.id)
  );
}

function withListPositions<T extends UnifiedCatalogEntry>(entries: readonly T[]): RankedUnifiedEntry<T>[] {
  return rank(entries).map((entry, index) => (
    { ...entry, score: entry.priority.score, position: index + 1 }
  ));
}

export function buildUnifiedLists<T extends UnifiedCatalogEntry>(
  catalog: readonly T[],
  generatedAt: string,
): UnifiedLists<T> {
  const families: Partial<Record<FamilyId, UnifiedFamilyLists<T>>> = {};
  const top100Memberships = new Map<string, Set<FamilyId>>(
    catalog.map(({ id }): [string, Set<FamilyId>] => [id, new Set<FamilyId>()]),
  );

  for (const family of FAMILY_DEFINITIONS) {
    const candidates = withListPositions(catalog.filter((entry) => entry.priority.sequences.includes(family.sequence)));
    const top100 = candidates.slice(0, 100);
    top100.forEach(({ id }) => {
      top100Memberships.get(id)?.add(family.id);
    });
    families[family.id] = { "top-10": top100.slice(0, 10), "top-100": top100 };
  }

  const now = Date.parse(generatedAt);
  const recentCutoff = now - 90 * DAY_MS;
  const timelessCutoff = new Date(generatedAt);
  timelessCutoff.setUTCFullYear(timelessCutoff.getUTCFullYear() - 3);

  // Ontdek-lijsten zijn filters over niet-boeken — boeken horen strikt alleen
  // in de boeken-familie, niet in Consensus/Nieuw/Tijdloos.
  const nonBookCatalog = catalog.filter((entry) => !entry.priority.sequences.includes("boek"));

  return {
    families: families as Record<FamilyId, UnifiedFamilyLists<T>>,
    derived: {
      consensus: withListPositions(nonBookCatalog.filter(({ id }) => (top100Memberships.get(id)?.size ?? 0) >= 2)).slice(0, 25),
      nieuw: withListPositions(nonBookCatalog.filter((entry) => {
        const saved = Date.parse(entry.savedDate ?? "");
        return Number.isFinite(saved) && saved >= recentCutoff && saved <= now;
      })).slice(0, 25),
      tijdloos: withListPositions(nonBookCatalog.filter((entry) => {
        const published = Date.parse(entry.publishedDate ?? "");
        return Number.isFinite(published) && published <= timelessCutoff.getTime();
      })).slice(0, 25),
    },
  };
}
