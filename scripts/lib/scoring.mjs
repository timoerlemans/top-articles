const DAY_MS = 24 * 60 * 60 * 1000;
const DERIVED_LISTS = {
  consensus: { label: "Consensus" },
  nieuw: { label: "Nieuw" },
  tijdloos: { label: "Tijdloos" },
};

export function validateScoreConfig(
  config,
  existingListKeys,
  documentIds,
  { activeDocumentIds = new Set(documentIds), listMemberships = new Map() } = {}
) {
  const knownLists = new Set([...existingListKeys, ...Object.keys(DERIVED_LISTS)]);
  const knownDocuments = new Set(documentIds);
  const warnings = [];

  for (const [documentId, overrides] of Object.entries(config?.overrides ?? {})) {
    if (!knownDocuments.has(documentId)) {
      warnings.push(`Scoreoverride voor onbekend document ${documentId}`);
    }
    for (const [listKey, override] of Object.entries(overrides ?? {})) {
      if (!knownLists.has(listKey)) {
        throw new Error(`Scoreconfiguratie bevat onbekende lijst: ${listKey}`);
      }
      if (override.include && override.exclude) {
        throw new Error(`Scoreoverride voor ${documentId} in ${listKey} kan niet tegelijk include en exclude zijn`);
      }
      if (override.adjustment !== undefined && !Number.isFinite(override.adjustment)) {
        throw new Error(`Scoreoverride voor ${documentId} in ${listKey} moet een numerieke adjustment hebben`);
      }
      if (knownDocuments.has(documentId) && existingListKeys.includes(listKey) && !listMemberships.get(documentId)?.has(listKey)) {
        warnings.push(`Scoreoverride voor ${documentId} hoort niet bij ${listKey}`);
      }
      if (knownDocuments.has(documentId) && Object.hasOwn(DERIVED_LISTS, listKey) && !activeDocumentIds.has(documentId)) {
        warnings.push(`Scoreoverride voor inactief document ${documentId} in ${listKey} wordt niet toegepast`);
      }
    }
  }
  return warnings;
}

export function parseReadingMinutes(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const hours = value.match(/(\d+)\s*(?:hours?|hrs?|uur)/i);
  const minutes = value.match(/(\d+)\s*(?:minutes?|mins?|min)\b/i);
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  return total > 0 ? total : null;
}

function overrideFor(config, id, listKey) {
  return config?.overrides?.[id]?.[listKey] ?? {};
}

function compareScored(a, b) {
  const positionA = a.originalPosition ?? a.tiePosition ?? Number.POSITIVE_INFINITY;
  const positionB = b.originalPosition ?? b.tiePosition ?? Number.POSITIVE_INFINITY;
  return (
    Number(Boolean(b.forceIncluded)) - Number(Boolean(a.forceIncluded)) ||
    b.score - a.score ||
    positionA - positionB ||
    (a.title ?? "").localeCompare(b.title ?? "", "nl")
  );
}

export function scoreExistingList(items, listKey, config) {
  const positionWeight = config?.defaults?.existing?.positionWeight ?? 1;
  const size = items.length;
  const scored = items.map((item) => {
    const override = overrideFor(config, item.id, listKey);
    const base = (size - item.position + 1) * positionWeight;
    const adjustment = override.adjustment ?? 0;
    return {
      ...item,
      originalPosition: item.position,
      score: base + adjustment,
      scoreBreakdown: { base, override: adjustment, total: base + adjustment },
    };
  });

  scored.sort(compareScored);
  return scored.map((item, index) => ({ ...item, scorePosition: index + 1 }));
}

function timestamp(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function publishedBeforeYearsAgo(item, generatedAt, years) {
  const published = timestamp(item.publishedDate);
  if (!Number.isFinite(published)) return false;
  const cutoff = new Date(generatedAt);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return published <= cutoff.getTime();
}

function consensusBase(item, config) {
  const top10Bonus = config?.defaults?.derived?.consensusTop10Bonus ?? 100;
  const familyWeight = config?.defaults?.derived?.consensusFamilyWeight ?? 10;
  const bestByFamily = new Map();
  for (const membership of item.memberships ?? []) {
    const previous = bestByFamily.get(membership.familyId);
    if (!previous || membership.position < previous.position || membership.size === "top-10") {
      bestByFamily.set(membership.familyId, membership);
    }
  }

  let base = 0;
  for (const membership of bestByFamily.values()) {
    base += Math.max(0, 101 - membership.position) * familyWeight;
    if (membership.size === "top-10") base += top10Bonus;
  }
  return base;
}

function scoredDerivedItem(item, listKey, base, config, tiePosition) {
  const override = overrideFor(config, item.id, listKey);
  const adjustment = override.adjustment ?? 0;
  const score = base + adjustment;
  return {
    id: item.id,
    title: item.title,
    tiePosition,
    score,
    forceIncluded: Boolean(override.include),
    scoreBreakdown: { base, override: adjustment, total: score },
  };
}

function buildDerivedList(id, candidates, config, scoreFor) {
  const items = candidates
    .filter((item) => !overrideFor(config, item.id, id).exclude)
    .map((item, index) => scoredDerivedItem(item, id, scoreFor(item), config, index + 1));
  items.sort(compareScored);
  return {
    id,
    label: DERIVED_LISTS[id].label,
    items: items.slice(0, 25).map(({ tiePosition, ...item }, index) => ({ ...item, scorePosition: index + 1 })),
  };
}

export function buildDerivedLists(catalog, config, generatedAt) {
  const recentCutoff = timestamp(generatedAt) - 90 * DAY_MS;
  const withOverride = (listKey) =>
    catalog.filter((item) => overrideFor(config, item.id, listKey).include);
  const unique = (items) => [...new Map(items.map((item) => [item.id, item])).values()];
  const curated = catalog.filter((item) => (item.memberships ?? []).length > 0);

  return {
    consensus: buildDerivedList(
      "consensus",
      unique([...curated, ...withOverride("consensus")]),
      config,
      (item) => consensusBase(item, config)
    ),
    nieuw: buildDerivedList(
      "nieuw",
      unique([
        ...catalog.filter((item) => timestamp(item.savedDate) >= recentCutoff),
        ...withOverride("nieuw"),
      ]),
      config,
      (item) => Math.max(0, (timestamp(item.savedDate) - recentCutoff) / DAY_MS)
    ),
    tijdloos: buildDerivedList(
      "tijdloos",
      unique([
        ...curated.filter((item) => publishedBeforeYearsAgo(item, generatedAt, 10)),
        ...withOverride("tijdloos"),
      ]),
      config,
      (item) => consensusBase(item, config) + (timestamp(generatedAt) - timestamp(item.publishedDate)) / (365.25 * DAY_MS)
    ),
  };
}
