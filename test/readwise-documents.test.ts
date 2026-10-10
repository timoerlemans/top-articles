import assert from "node:assert/strict";
import test from "node:test";

import { fetchReadwiseDocuments } from "../scripts/lib/readwise-documents.js";
import type { ReadwiseDocumentProfile } from "../scripts/lib/readwise-documents.js";
import type { ReadwiseExecutor } from "../scripts/lib/readwise-request.js";

function scriptedReader(pages: readonly unknown[]): {
  run: ReadwiseExecutor<{ stdout: string }>;
  calls: string[][];
} {
  const calls: string[][] = [];
  return {
    calls,
    run: (args) => {
      assert.ok(calls.length < pages.length, "unexpected extra request");
      const page = pages[calls.length];
      calls.push([...args]);
      return page instanceof Error
        ? Promise.reject(page)
        : Promise.resolve({ stdout: typeof page === "string" ? page : JSON.stringify(page) });
    },
  };
}

test("volgt ook een lege tussenpagina met vervolgcursor", async () => {
  const pages = [
    { results: [{ id: "one" }], nextPageCursor: "page-2" },
    { results: [], nextPageCursor: "page-3" },
    { results: [{ id: "two" }], nextPageCursor: null },
  ];
  const calls: string[][] = [];
  const documents = await fetchReadwiseDocuments((args) => {
    calls.push([...args]);
    const page = pages.shift();
    assert.ok(page, "unexpected extra request");
    return Promise.resolve({ stdout: JSON.stringify(page) });
  }, { profile: "catalog", location: "later" });
  assert.deepEqual(documents.map(({ id }) => id), ["one", "two"]);
  assert.equal(calls.length, 3);
  assert.ok(calls[1]?.includes("page-2"));
  assert.ok(calls[2]?.includes("page-3"));
});

for (const [name, cursors] of [
  ["stopt bij dezelfde cursor", ["a", "a"]],
  ["stopt bij cursorcyclus", ["a", "b", "a"]],
] as const) {
  test(name, async () => {
    const reader = scriptedReader(cursors.map((cursor) => ({ results: [], nextPageCursor: cursor })));
    await assert.rejects(fetchReadwiseDocuments(reader.run, { profile: "catalog", location: "later" }), /paginacursor/i);
    assert.equal(reader.calls.length, cursors.length);
  });
}

test("cursorbewaking reset per selectie", async () => {
  const reader = scriptedReader([
    { results: [{ id: "later-one" }], nextPageCursor: "shared" },
    { results: [{ id: "later-two" }] },
    { results: [{ id: "archive-one" }], nextPageCursor: "shared" },
    { results: [{ id: "archive-two" }] },
  ]);
  const later = await fetchReadwiseDocuments(reader.run, { profile: "maintenance", location: "later" });
  const archive = await fetchReadwiseDocuments(reader.run, { profile: "maintenance", location: "archive" });
  assert.deepEqual(later.map(({ id }) => id), ["later-one", "later-two"]);
  assert.deepEqual(archive.map(({ id }) => id), ["archive-one", "archive-two"]);
  assert.equal(reader.calls.length, 4);
});

test("bewaart arraydocumenten zonder normalisatie", async () => {
  const input = [{ id: "same", language: "nl", extra: "kept" }, { id: "same", title: "last", location: null }];
  const reader = scriptedReader([input]);
  const documents = await fetchReadwiseDocuments(reader.run, { profile: "catalog", location: "later" });
  assert.deepEqual(documents, input);
  assert.equal(reader.calls.length, 1);
  assert.equal(Object.hasOwn(documents[0] ?? {}, "location"), false);
});

for (const page of [
  { results: [{ id: "one" }] },
  { results: [{ id: "one" }], nextPageCursor: null },
  { results: [{ id: "one" }], nextPageCursor: "" },
]) {
  test(`stopt bij ontbrekende of lege cursor: ${JSON.stringify(page)}`, async () => {
    const reader = scriptedReader([page]);
    assert.deepEqual(await fetchReadwiseDocuments(reader.run, { profile: "catalog", location: "later" }), [{ id: "one" }]);
    assert.equal(reader.calls.length, 1);
  });
}

test("selecteert document-ID zonder locatie", async () => {
  const reader = scriptedReader([{ results: [{ id: "target" }], nextPageCursor: "next" }, [{ id: "target-two" }]]);
  assert.deepEqual(await fetchReadwiseDocuments(reader.run, { profile: "feedback", documentId: "target" }), [{ id: "target" }, { id: "target-two" }]);
  assert.equal(reader.calls.length, 2);
  for (const call of reader.calls) {
    assert.equal(call[call.indexOf("--id") + 1], "target");
    assert.equal(call.includes("--location"), false);
  }
  assert.equal(reader.calls[0]?.includes("--page-cursor"), false);
  assert.ok(reader.calls[1]?.includes("next"));
});

const fieldProfiles: readonly [ReadwiseDocumentProfile, string][] = [
  ["catalog", "title,author,site_name,summary,word_count,reading_time,published_date,saved_at,image_url,source_url,url,category,tags,notes"],
  ["maintenance", "title,author,summary,word_count,reading_time,published_date,saved_at,updated_at,category,location,reading_progress,tags,notes"],
  ["judge", "title,summary,word_count,reading_time,published_date,saved_at,category,tags,notes,location"],
  ["report", "title,author,summary,word_count,reading_time,published_date,saved_at,category,tags,notes,location"],
  ["feedback", "title,author,summary,notes,location,category,word_count,reading_time,published_date,saved_at,tags"],
  ["archive-cleanup", "title,saved_at,category,location,tags"],
];

for (const [profile, expectedFields] of fieldProfiles) {
  test(`gebruikt exact het gekozen veldprofiel: ${profile}`, async () => {
    const reader = scriptedReader([{ results: [{ id: "one" }] }]);
    assert.deepEqual(await fetchReadwiseDocuments(reader.run, { profile, location: "later" }), [{ id: "one" }]);
    const call = reader.calls[0];
    assert.ok(call);
    assert.equal(call[0], "reader-list-documents");
    assert.equal(call[call.indexOf("--response-fields") + 1], expectedFields);
    assert.equal(expectedFields.split(",").includes("language"), false);
    assert.equal(call[call.indexOf("--limit") + 1], "100");
    assert.equal(call.filter((argument) => argument === "--json").length, 1);
  });
}

for (const location of ["later", "new", "shortlist", "archive", "feed"] as const) {
  test(`selecteert de bestaande locatie: ${location}`, async () => {
    const reader = scriptedReader([[{ id: "one" }]]);
    assert.deepEqual(await fetchReadwiseDocuments(reader.run, { profile: "maintenance", location }), [{ id: "one" }]);
    const call = reader.calls[0];
    assert.ok(call);
    assert.equal(call[call.indexOf("--location") + 1], location);
    assert.equal(call.includes("--id"), false);
  });
}

test("propagatie van transportfout na eerste pagina", async () => {
  const error = new Error("Reader unavailable");
  const reader = scriptedReader([{ results: [{ id: "one" }], nextPageCursor: "next" }, error]);
  await assert.rejects(fetchReadwiseDocuments(reader.run, { profile: "catalog", location: "later" }), (failure) => failure === error);
  assert.equal(reader.calls.length, 2);
});

for (const [name, page] of [
  ["ongeldige JSON", "{"],
  ["ongeldig document", { results: [{ id: "" }] }],
] as const) {
  test(`weigert ongeldige vervolgpagina: ${name}`, async () => {
    const reader = scriptedReader([{ results: [{ id: "one" }], nextPageCursor: "next" }, page]);
    await assert.rejects(fetchReadwiseDocuments(reader.run, { profile: "catalog", location: "later" }));
    assert.equal(reader.calls.length, 2);
  });
}
