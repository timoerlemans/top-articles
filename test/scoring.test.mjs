import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDerivedLists,
  parseReadingMinutes,
  scoreExistingList,
  validateScoreConfig,
} from "../scripts/lib/scoring.mjs";

const scoreConfig = {
  defaults: {
    existing: { positionWeight: 1 },
    derived: { consensusTop10Bonus: 100, consensusFamilyWeight: 10 },
  },
  overrides: {
    beta: { "algemeen:top-10": { adjustment: 20 } },
    excluded: { nieuw: { exclude: true } },
    forced: { nieuw: { include: true, adjustment: 2 } },
  },
};

test("leestijd accepteert minuten en uren", () => {
  assert.equal(parseReadingMinutes("8 mins"), 8);
  assert.equal(parseReadingMinutes("1 hr 52 mins"), 112);
  assert.equal(parseReadingMinutes(null), null);
});

test("bestaande lijst hersorteert op score met Readwise-positie als tie-breaker", () => {
  const result = scoreExistingList(
    [
      { id: "alpha", title: "Alpha", position: 1 },
      { id: "beta", title: "Beta", position: 2 },
      { id: "gamma", title: "Gamma", position: 3 },
    ],
    "algemeen:top-10",
    scoreConfig
  );

  assert.deepEqual(result.map((item) => item.id), ["beta", "alpha", "gamma"]);
  assert.deepEqual(result.map((item) => item.scorePosition), [1, 2, 3]);
  assert.equal(result[0].originalPosition, 2);
  assert.equal(result[0].scoreBreakdown.override, 20);
});

test("afgeleide lijsten respecteren kwaliteitsdrempel en lijstspecifieke overrides", () => {
  const generatedAt = "2026-08-15T00:00:00.000Z";
  const catalog = [
    {
      id: "ranked",
      title: "Ranked",
      savedDate: "2026-08-10T00:00:00.000Z",
      publishedDate: "2010-01-01",
      memberships: [{ familyId: "algemeen", size: "top-10", position: 2 }],
    },
    {
      id: "fresh",
      title: "Fresh",
      savedDate: "2026-08-14T00:00:00.000Z",
      publishedDate: "2026-08-01",
      memberships: [],
    },
    {
      id: "excluded",
      title: "Excluded",
      savedDate: "2026-08-13T00:00:00.000Z",
      publishedDate: "2026-08-01",
      memberships: [],
    },
    {
      id: "forced",
      title: "Forced",
      savedDate: "2025-01-01T00:00:00.000Z",
      publishedDate: "2026-08-01",
      memberships: [],
    },
  ];

  const lists = buildDerivedLists(catalog, scoreConfig, generatedAt);

  assert.deepEqual(lists.consensus.items.map((item) => item.id), ["ranked"]);
  assert.equal("originalPosition" in lists.consensus.items[0], false);
  assert.deepEqual(lists.nieuw.items.map((item) => item.id), ["forced", "fresh", "ranked"]);
  assert.equal(lists.nieuw.items[0].score, 2);
  assert.equal(lists.nieuw.items[0].forceIncluded, true);
  assert.deepEqual(lists.tijdloos.items.map((item) => item.id), ["ranked"]);
});

test("scoreconfiguratie weigert onbekende lijsten en waarschuwt voor oude document-ID's", () => {
  assert.throws(
    () => validateScoreConfig({ overrides: { alpha: { onbekend: { adjustment: 1 } } } }, ["algemeen:top-10"], ["alpha"]),
    /onbekende lijst/i
  );
  assert.deepEqual(
    validateScoreConfig({ overrides: { verdwenen: { "algemeen:top-10": { adjustment: 1 } } } }, ["algemeen:top-10"], ["alpha"]),
    ["Scoreoverride voor onbekend document verdwenen"]
  );
});

test("scoreconfiguratie waarschuwt bij niet-toepasbare overrides", () => {
  const warnings = validateScoreConfig(
    {
      overrides: {
        active: { "algemeen:top-100": { adjustment: 1 } },
        archived: { consensus: { include: true } },
      },
    },
    ["algemeen:top-10", "algemeen:top-100"],
    ["active", "archived"],
    {
      activeDocumentIds: new Set(["active"]),
      listMemberships: new Map([["active", new Set(["algemeen:top-10"])]]),
    }
  );

  assert.deepEqual(warnings, [
    "Scoreoverride voor active hoort niet bij algemeen:top-100",
    "Scoreoverride voor inactief document archived in consensus wordt niet toegepast",
  ]);
});
