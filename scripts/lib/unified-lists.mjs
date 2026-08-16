export const FAMILY_DEFINITIONS = [
  { id: "algemeen", label: "Algemeen", sequence: "lees", top10Tag: "aaa-top-10", top100Tag: "aaa-top-100" },
  { id: "nederlands", label: "Nederlands", sequence: "dutch", top10Tag: "aaa-dutch-top-10", top100Tag: "aaa-dutch-top-100" },
  { id: "kort", label: "Kort", sequence: "short", top10Tag: "aaa-short-top-10", top100Tag: "aaa-short-top-100" },
  { id: "kort-nederlands", label: "Kort & NL", sequence: "short-dutch", top10Tag: "aaa-short-dutch-top-10", top100Tag: "aaa-short-dutch-top-100" },
  { id: "luchtig", label: "Luchtig", sequence: "luchtig", top10Tag: "aaa-luchtig-top-10", top100Tag: "aaa-luchtig-top-100" },
  { id: "luchtig-nederlands", label: "Luchtig & NL", sequence: "luchtig-nederlands", top10Tag: "aaa-luchtig-nederlands-top-10", top100Tag: "aaa-luchtig-nederlands-top-100" },
  { id: "boeken", label: "Boeken", sequence: "boek", top10Tag: "boek-top-10", top100Tag: "boek-top-100" },
];

const DAY_MS = 86_400_000;

function rank(entries) {
  return [...entries].sort((a, b) =>
    b.priority.score - a.priority.score ||
    Date.parse(a.savedDate ?? "") - Date.parse(b.savedDate ?? "") ||
    a.id.localeCompare(b.id)
  );
}

function withListPositions(entries) {
  return rank(entries).map((entry, index) => ({ ...entry, score: entry.priority.score, position: index + 1 }));
}

export function buildUnifiedLists(catalog, generatedAt) {
  const families = {};
  const top100Memberships = new Map(catalog.map(({ id }) => [id, new Set()]));

  for (const family of FAMILY_DEFINITIONS) {
    const candidates = withListPositions(catalog.filter((entry) => entry.priority.sequences.includes(family.sequence)));
    const top100 = candidates.slice(0, 100);
    top100.forEach(({ id }) => top100Memberships.get(id)?.add(family.id));
    families[family.id] = { "top-10": top100.slice(0, 10), "top-100": top100 };
  }

  const now = Date.parse(generatedAt);
  const recentCutoff = now - 90 * DAY_MS;
  const timelessCutoff = new Date(generatedAt);
  timelessCutoff.setUTCFullYear(timelessCutoff.getUTCFullYear() - 3);

  return {
    families,
    derived: {
      consensus: withListPositions(catalog.filter(({ id }) => (top100Memberships.get(id)?.size ?? 0) >= 2)).slice(0, 25),
      nieuw: withListPositions(catalog.filter((entry) => {
        const saved = Date.parse(entry.savedDate ?? "");
        return Number.isFinite(saved) && saved >= recentCutoff && saved <= now;
      })).slice(0, 25),
      tijdloos: withListPositions(catalog.filter((entry) => {
        const published = Date.parse(entry.publishedDate ?? "");
        return Number.isFinite(published) && published <= timelessCutoff.getTime();
      })).slice(0, 25),
    },
  };
}
