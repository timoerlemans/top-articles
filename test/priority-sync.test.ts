import assert from "node:assert/strict";
import test from "node:test";
import { createPrioritySync } from "../scripts/lib/priority-sync.js";
import type { PrioritySyncEvent } from "../scripts/lib/priority-sync.js";
import type { ReadwiseDocument } from "../scripts/lib/external-schemas.js";
import type { PriorityJournal } from "../scripts/lib/priority-apply.js";
import type { PriorityJudgmentsConfig } from "../scripts/lib/priority-judgments.js";
import { defaultCoreInterestPriorityConfig } from "../scripts/lib/core-interest-priority.js";

const NOW = "2026-10-10T13:00:00.000Z";
const document = (id: string): ReadwiseDocument => ({ id, title: `Article ${id}`, location: "later", category: "article", saved_at: "2026-01-01", tags: { personal: {} } });
const payloadSchema = (value: unknown): { document_id: string; tags: string[] }[] => {
  assert.ok(Array.isArray(value));
  return value.map((item: unknown) => {
    assert.ok(typeof item === "object" && item !== null && "document_id" in item && typeof item.document_id === "string" && "tags" in item && Array.isArray(item.tags));
    assert.ok(item.tags.every((tag: unknown) => typeof tag === "string"));
    return { document_id: item.document_id, tags: item.tags };
  });
};

function fixture(initial: ReadwiseDocument[] = [document("one")]) {
  const state = {
    documents: structuredClone(initial),
    judgments: { version: 1, items: {} } as PriorityJudgmentsConfig,
    overrides: { version: 1, items: {} },
    coreInterestConfig: defaultCoreInterestPriorityConfig(),
    journal: null as unknown,
    writes: [] as PriorityJournal[],
    events: [] as PrioritySyncEvent[],
    calls: [] as string[][],
    waits: [] as number[],
    reads: 0,
    omitResults: new Set<string>(),
    rejected: new Set<string>(),
    failBulk: false,
    ignoreMutations: false,
    failJournalAfterMutation: false,
    beforeRead: (_count: number) => {},
    onDelay: (_milliseconds: number) => {},
  };
  const readwise = (args: readonly string[]) => {
    state.calls.push([...args]);
    assert.equal(args[0], "reader-list-documents");
    state.beforeRead(++state.reads);
    const location = args[args.indexOf("--location") + 1];
    return Promise.resolve({ stdout: JSON.stringify({ results: state.documents.filter((doc) => doc.location === location), nextPageCursor: null }) });
  };
  const mutate = (args: readonly string[]) => {
    state.calls.push([...args]);
    if (args[0] === "reader-bulk-edit-document-metadata") {
      if (state.failBulk) { throw new Error("bulk unavailable"); }
      const updates = payloadSchema(JSON.parse(args[args.indexOf("--documents") + 1] ?? "null"));
      const results = updates.flatMap((update) => {
        if (state.omitResults.has(update.document_id)) { return []; }
        if (state.rejected.has(update.document_id)) { return [{ id: update.document_id, success: false, error: "rejected" }]; }
        const doc = state.documents.find((doc) => doc.id === update.document_id);
        assert.ok(doc);
        if (!state.ignoreMutations) { doc.tags = Object.fromEntries(update.tags.map((tag) => [tag, {}])); }
        return [{ id: update.document_id, success: true }];
      });
      return Promise.resolve({ stdout: JSON.stringify({ results }) });
    }
    assert.ok(args[0] === "reader-add-tags-to-document" || args[0] === "reader-remove-tags-from-document");
    const doc = state.documents.find((doc) => doc.id === args[args.indexOf("--document-id") + 1]);
    assert.ok(doc);
    const wasArray = Array.isArray(doc.tags);
    let entries: unknown[] = Array.isArray(doc.tags) ? doc.tags.map((entry: unknown) => entry) : Object.keys(typeof doc.tags === "object" && doc.tags !== null ? doc.tags : {});
    const nameOf = (entry: unknown): unknown => typeof entry === "string" ? entry :
      typeof entry === "object" && entry !== null && "name" in entry ? entry.name : undefined;
    for (const tag of (args[args.indexOf("--tag-names") + 1] ?? "").split(",")) {
      if (args[0] === "reader-add-tags-to-document") {
        if (!entries.some((entry) => nameOf(entry) === tag)) { entries.push(tag); }
      } else { entries = entries.filter((entry) => nameOf(entry) !== tag); }
    }
    if (!state.ignoreMutations) { doc.tags = wasArray ? entries : Object.fromEntries(entries.map((tag) => [String(tag), {}])); }
    return Promise.resolve({ stdout: "{}" });
  };
  const mutations = () => state.calls.filter((args) => args[0] !== "reader-list-documents");
  const sync = createPrioritySync({
    readwise,
    mutate,
    loadConfiguration: () => Promise.resolve({ overrides: structuredClone(state.overrides), judgments: structuredClone(state.judgments), coreInterestConfig: structuredClone(state.coreInterestConfig) }),
    journal: {
      read: () => Promise.resolve(structuredClone(state.journal)),
      write: (_path, value) => {
        if (state.failJournalAfterMutation && mutations().length > 0) { throw new Error("journal disk full"); }
        state.journal = structuredClone(value);
        state.writes.push(structuredClone(value));
        return Promise.resolve();
      },
    },
    now: () => NOW,
    delay: (milliseconds) => { state.waits.push(milliseconds); state.onDelay(milliseconds); return Promise.resolve(); },
    onEvent: (event) => { state.events.push(event); },
  });
  const plan = () => sync.plan();
  const firstDocument = () => { const doc = state.documents[0]; assert.ok(doc); return doc; };
  return { state, sync, plan, mutations, firstDocument, apply: async () => { const candidate = await plan(); return sync.apply({ plan: candidate, confirmation: candidate.planHash, journalPath: "journal.json" }); } };
}

test("plan is read-only; apply preserves personal tags and publishes verified status only after live verification", async () => {
  const f = fixture();
  const plan = await f.plan();
  assert.equal(plan.model, "readwise-priority-tag-plan-v3");
  assert.deepEqual(f.mutations(), []);
  assert.deepEqual(plan.operations.map(({ tag }) => tag), ["aaa-top-10", "aaa-top-100", "lees-0001"]);
  await f.sync.apply({ plan, confirmation: plan.planHash, journalPath: "journal.json" });
  assert.deepEqual(f.state.documents[0]?.tags, { personal: {}, "aaa-top-10": {}, "aaa-top-100": {}, "lees-0001": {} });
  assert.equal(f.state.writes.at(-1)?.verified, true);
  assert.equal(f.state.writes.at(-1)?.completedAt, NOW);
  assert.ok(f.state.writes.slice(0, -1).every((journal) => journal.verified === undefined));
  assert.equal((await f.sync.verify()).operations.length, 0);
});

test("wrong confirmation and damaged plans reject before any Reader request", async () => {
  const f = fixture();
  const plan = await f.plan();
  f.state.calls = [];
  await assert.rejects(f.sync.apply({ plan, confirmation: "wrong", journalPath: "journal" }), /Bevestigingshash/);
  await assert.rejects(f.sync.apply({ plan: { ...plan, operations: [] }, confirmation: plan.planHash, journalPath: "journal" }), /hash/i);
  await assert.rejects(f.sync.apply({ plan: { ...plan, model: "readwise-priority-tag-plan-v2" }, confirmation: plan.planHash, journalPath: "journal" }), /priority:plan/);
  assert.deepEqual(f.state.calls, []);
});

for (const changed of ["documents", "judgments", "overrides", "coreInterestConfig"] as const) {
  test(`changed ${changed} rejects before mutations`, async () => {
    const f = fixture();
    const plan = await f.plan();
    if (changed === "documents") { f.firstDocument().summary = "Changed"; }
    if (changed === "judgments") { f.state.judgments = { version: 2, rubricVersion: "semantic-v2", items: {} }; }
    if (changed === "overrides") { f.state.overrides.items = { one: { adjustment: 1, reason: "Changed" } }; }
    if (changed === "coreInterestConfig") { f.state.coreInterestConfig.weightByRank[0] = 99; }
    await assert.rejects(f.sync.apply({ plan, confirmation: plan.planHash, journalPath: "journal" }), /nieuwe proefrun/);
    assert.deepEqual(f.mutations(), []);
  });
}

for (const change of ["document", "judgments"] as const) {
  test(`changed ${change} during verification stops before repair`, async () => {
    const f = fixture();
    f.state.ignoreMutations = true;
    f.state.beforeRead = (count) => {
      if (count !== 3) { return; }
      if (change === "document") { f.firstDocument().summary = "Changed"; }
      else { f.state.judgments = { version: 2, rubricVersion: "semantic-v2", items: {} }; }
    };
    await assert.rejects(f.apply(), /nieuwe proefrun/);
    assert.equal(f.mutations().length, 1);
    assert.equal(f.state.writes.at(-1)?.verified, undefined);
  });
}

test("source drift during repair wait is detected before the next mutation", async () => {
  const f = fixture();
  f.state.ignoreMutations = true;
  f.state.onDelay = () => { f.firstDocument().summary = "Changed while waiting"; };
  await assert.rejects(f.apply(), /nieuwe proefrun/);
  assert.equal(f.mutations().length, 1);
});

test("resumes completed operations, reopens live pending operations and counts progress per round", async () => {
  const f = fixture([document("one"), document("two")]);
  const plan = await f.plan();
  const completed = plan.operations.filter(({ documentId }) => documentId === "one");
  f.firstDocument().tags = { personal: {}, "aaa-top-10": {}, "aaa-top-100": {}, "lees-0001": {} };
  f.state.journal = { planHash: plan.planHash, startedAt: NOW, completed: [...completed, ...plan.operations.filter(({ documentId }) => documentId === "two")], failures: [], verified: true, completedAt: NOW };
  await f.sync.apply({ plan, confirmation: plan.planHash, journalPath: "journal" });
  const batch = f.mutations()[0];
  assert.ok(batch);
  assert.deepEqual(payloadSchema(JSON.parse(batch[batch.indexOf("--documents") + 1] ?? "null")).map(({ document_id }) => document_id), ["two"]);
  const progress = f.state.events.filter((event) => event.type === "progress");
  assert.ok(progress.length > 0);
  assert.ok(progress.every((event) => event.completed <= event.total && event.total === 3));
  assert.equal(f.state.writes[0]?.verified, undefined);
  assert.equal(f.state.writes.at(-1)?.completed.length, 6);
});

test("nonconvergence stops after three rounds and clears old success", async () => {
  const f = fixture();
  const plan = await f.plan();
  f.state.journal = { planHash: plan.planHash, startedAt: NOW, completed: [], failures: [], verified: true, completedAt: NOW };
  f.state.ignoreMutations = true;
  await assert.rejects(f.sync.apply({ plan, confirmation: plan.planHash, journalPath: "journal" }), /Live verificatie/);
  assert.equal(f.mutations().length, 3);
  assert.deepEqual(f.state.waits, [10_000, 10_000]);
  assert.equal(f.state.writes.at(-1)?.verified, undefined);
  assert.equal(f.state.writes.at(-1)?.completedAt, undefined);
});

test("empty live diff verifies without mutations, including an existing journal", async () => {
  const f = fixture([]);
  const plan = await f.plan();
  f.state.journal = { planHash: plan.planHash, startedAt: NOW, completed: [], failures: [] };
  await f.sync.apply({ plan, confirmation: plan.planHash, journalPath: "journal" });
  assert.deepEqual(f.mutations(), []);
  assert.equal(f.state.writes.at(-1)?.verified, true);
});

test("corrupt journals reject; different plan hash starts a fresh journal", async () => {
  const f = fixture();
  const plan = await f.plan();
  f.state.journal = { planHash: plan.planHash, completed: "corrupt" };
  await assert.rejects(f.sync.apply({ plan, confirmation: plan.planHash, journalPath: "journal" }), /journal/i);
  assert.deepEqual(f.mutations(), []);
  f.state.journal = { planHash: "old", startedAt: NOW, completed: [], failures: [], verified: true };
  await f.sync.apply({ plan, confirmation: plan.planHash, journalPath: "journal" });
  assert.equal(f.state.writes.at(-1)?.planHash, plan.planHash);
});

for (const mode of ["rejected", "missing", "unavailable"] as const) {
  test(`bulk ${mode} falls back to per-document tag calls`, async () => {
    const f = fixture();
    if (mode === "rejected") { f.state.rejected.add("one"); }
    if (mode === "missing") { f.state.omitResults.add("one"); }
    if (mode === "unavailable") { f.state.failBulk = true; }
    await f.apply();
    assert.deepEqual(f.state.documents[0]?.tags, { personal: {}, "aaa-top-10": {}, "aaa-top-100": {}, "lees-0001": {} });
    assert.equal(f.state.writes.at(-1)?.verified, true);
    assert.ok(f.mutations().some((args) => args[0] === "reader-add-tags-to-document"));
    if (mode === "unavailable") { assert.deepEqual(f.state.waits, [1_000, 2_000, 4_000]); }
  });
}

test("unknown tagset uses add/remove instead of replacing all tags", async () => {
  const doc = document("one");
  delete doc.tags;
  const f = fixture([doc]);
  await f.apply();
  assert.ok(f.mutations().every((args) => args[0] !== "reader-bulk-edit-document-metadata"));
  assert.equal(f.state.writes.at(-1)?.verified, true);
});

test("journal persistence failure stops after the successful mutation", async () => {
  const f = fixture();
  f.state.failJournalAfterMutation = true;
  await assert.rejects(f.apply(), /journal disk full/);
  assert.equal(f.mutations().length, 1);
  assert.equal(f.state.writes.at(-1)?.verified, undefined);
});

test("all-location cleanup removes only managed tags outside later", async () => {
  const archived = { ...document("archived"), location: "archive", tags: { personal: {}, "lees-0042": {}, "aaa-top-10": {} } };
  const f = fixture([archived]);
  const plan = await f.sync.plan({ cleanupAll: true });
  assert.equal(plan.scope, "all-locations");
  await f.sync.apply({ plan, confirmation: plan.planHash, journalPath: "journal" });
  assert.deepEqual(f.state.documents[0]?.tags, { personal: {} });
});

for (const scenario of ["legacy", "topic", "book", "archive"] as const) {
  test(`light-reading ${scenario} tag migration does not invalidate its own source`, async () => {
    const doc = document("light");
    doc.tags = scenario === "topic" ? { "health & wellness": {} } : { personal: {}, "light-reading": {}, "luchtig-004": {} };
    if (scenario === "book") { doc.category = "epub"; }
    if (scenario === "archive") { doc.location = "archive"; }
    const f = fixture([doc]);
    const plan = await f.sync.plan({ cleanupAll: scenario === "archive" });
    await f.sync.apply({ plan, confirmation: plan.planHash, journalPath: "journal" });
    assert.equal(f.state.writes.at(-1)?.verified, true);
    assert.equal(f.mutations().length, 1);
  });
}

for (const opaque of [{ unsupported: "custom-tag" }, { name: "" }, {}]) {
  test(`incomplete tag array ${JSON.stringify(opaque)} preserves opaque entries with additive fallback`, async () => {
    const original = [{ name: "personal" }, opaque];
    const doc = { ...document("one"), tags: original };
    const f = fixture([doc]);
    await f.apply();
    assert.deepEqual(f.mutations().map((args) => args[0]), ["reader-add-tags-to-document"]);
    assert.deepEqual(f.firstDocument().tags, [...original, "aaa-top-10", "aaa-top-100", "lees-0001"]);
    assert.equal(f.state.writes.at(-1)?.verified, true);
  });
}
