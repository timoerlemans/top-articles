import assert from "node:assert/strict";
import test from "node:test";

import { buildUnifiedLists } from "../scripts/lib/unified-lists.mjs";

function item(id, score, overrides = {}) {
  return {
    id,
    title: id,
    savedDate: "2026-08-01T00:00:00.000Z",
    publishedDate: "2020-01-01T00:00:00.000Z",
    ...overrides,
    priority: { score, sequences: ["lees"], positions: { lees: 1 }, ...(overrides.priority ?? {}) },
  };
}

test("leidt familie-toplijsten af van dezelfde scorevolgorde", () => {
  const catalog = [item("low", 70), item("high", 80), item("middle", 75)];
  const lists = buildUnifiedLists(catalog, "2026-08-16T10:00:00.000Z");

  assert.deepEqual(lists.families.algemeen["top-10"].map(({ id }) => id), ["high", "middle", "low"]);
  assert.deepEqual(lists.families.algemeen["top-100"].map(({ id }) => id), ["high", "middle", "low"]);
});

test("bouwt Consensus, Nieuw en Tijdloos als filters zonder eigen score", () => {
  const catalog = [
    item("consensus", 60, { priority: { score: 60, sequences: ["lees", "short"], positions: { lees: 2, short: 1 } } }),
    item("recent", 90, { savedDate: "2026-08-10", publishedDate: "2025-01-01" }),
    item("old", 80, { savedDate: "2020-01-01", publishedDate: "2022-01-01" }),
    item("too-new-for-tijdloos", 100, { savedDate: "2020-01-01", publishedDate: "2024-01-01" }),
  ];
  const lists = buildUnifiedLists(catalog, "2026-08-16T10:00:00.000Z");

  assert.deepEqual(lists.derived.consensus.map(({ id }) => id), ["consensus"]);
  assert.deepEqual(lists.derived.nieuw.map(({ id }) => id), ["recent", "consensus"]);
  assert.deepEqual(lists.derived.tijdloos.map(({ id }) => id), ["old", "consensus"]);
  assert.equal(lists.derived.nieuw.every((entry) => entry.score === entry.priority.score), true);
});
