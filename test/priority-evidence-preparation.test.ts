import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { preparePriorityEvidence } from "../scripts/lib/priority-judge.js";
import type { ReadwiseDocument } from "../scripts/lib/external-schemas.js";
import type { ReadwiseExecutor } from "../scripts/lib/readwise-request.js";

const TIMESTAMP = "2026-10-10T12:00:00.000Z";
const PREFERENCES = "Lees toegankelijke filosofie met inhoudelijke diepgang.";

function reader(documents: readonly ReadwiseDocument[], highlightResponse: unknown = ["Een inhoudelijk inzicht."]): {
  runReadwise: ReadwiseExecutor<{ stdout: string }>;
  calls: string[][];
} {
  const calls: string[][] = [];
  return {
    calls,
    runReadwise: (args) => {
      calls.push([...args]);
      if (args[0] === "reader-list-documents") {
        return Promise.resolve({ stdout: JSON.stringify({ results: documents }) });
      }
      assert.equal(args[0], "reader-get-document-highlights");
      return Promise.resolve({ stdout: JSON.stringify(highlightResponse) });
    },
  };
}

async function withCache(check: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "top-articles-evidence-"));
  try {
    await check(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("beoordelingsevidence gebruikt dezelfde top-100-selectie voor highlights, snapshot en batches", async () => {
  await withCache(async (cacheDirectory) => {
    const selected = [
      { id: "string", tags: [" AAA-TOP-100 "] },
      { id: "name", tags: [{ name: "aaa-dutch-top-100" }] },
      { id: "key", tags: [{ key: "aaa-philosophy-top-100" }] },
      { id: "map", tags: { "aaa-short-top-100": {} } },
    ];
    const transport = reader([...selected, { id: "outside", tags: ["aaa-top-10", "lees-0001"] }]);
    const progress: Array<{ completed: number; total: number }> = [];
    const result = await preparePriorityEvidence({
      runReadwise: transport.runReadwise,
      now: () => {
        assert.equal(progress.length, 4, "timestamp wordt na highlightophaling bepaald");
        return TIMESTAMP;
      },
      onProgress: (event) => { progress.push(event); },
    }, { selection: "top100", readingPreferences: PREFERENCES, cacheDirectory, batchSize: 2 });

    assert.deepEqual(Object.keys(result.snapshot.documents), ["string", "name", "key", "map"]);
    assert.deepEqual(transport.calls.slice(1).map((args) => args[args.indexOf("--document-id") + 1]), ["string", "name", "key", "map"]);
    assert.ok(Object.values(result.snapshot.documents).every((entry) => entry.highlights[0]?.text === "Een inhoudelijk inzicht."));
    assert.equal(result.snapshot.generatedAt, TIMESTAMP);
    assert.equal(result.snapshot.scope, "later");
    assert.equal(result.snapshot.selection, "top100");
    assert.deepEqual(result.batches.map((batch) => batch.documents.map((entry) => entry.documentId)), [["string", "name"], ["key", "map"]]);
    assert.ok(result.batches.every((batch) => batch.version === 1 && batch.rubricVersion === "semantic-v2" && batch.selection === "top100" && batch.readingPreferences === PREFERENCES));
    assert.match(result.batches[0]?.instruction ?? "", /philosophy.*readingPreferences/);
    assert.deepEqual(progress, [1, 2, 3, 4].map((completed) => ({ completed, total: 4 })));
    const listArgs = transport.calls[0];
    assert.ok(listArgs);
    assert.equal(listArgs[listArgs.indexOf("--location") + 1], "later");
  });
});

test("all-later verwerkt ook documenten zonder toplijsttags en gebruikt standaard batches van 25", async () => {
  await withCache(async (cacheDirectory) => {
    const documents = Array.from({ length: 26 }, (_, index) => ({ id: `doc-${String(index)}`, tags: ["philosophy"] }));
    const transport = reader(documents);
    const result = await preparePriorityEvidence({ runReadwise: transport.runReadwise, now: () => TIMESTAMP }, {
      selection: "all-later", readingPreferences: PREFERENCES, cacheDirectory,
    });
    assert.deepEqual(Object.keys(result.snapshot.documents), documents.map((doc) => doc.id));
    assert.deepEqual(result.batches.map((batch) => batch.documents.length), [25, 1]);
    assert.ok(result.batches.every((batch) => batch.selection === "all-later"));
    assert.equal(transport.calls.length, 27);
  });
});

test("lege selecties leveren een lege snapshot en geen batches of voortgang", async () => {
  await withCache(async (cacheDirectory) => {
    for (const documents of [[], [{ id: "outside", tags: ["aaa-top-10"] }]]) {
      const transport = reader(documents);
      const progress: unknown[] = [];
      const result = await preparePriorityEvidence({ runReadwise: transport.runReadwise, onProgress: (event) => { progress.push(event); } }, {
        selection: "top100", readingPreferences: PREFERENCES, cacheDirectory,
      });
      assert.deepEqual(result.snapshot.documents, {});
      assert.deepEqual(result.batches, []);
      assert.deepEqual(progress, []);
      assert.equal(transport.calls.length, 1);
      assert.ok(Number.isFinite(Date.parse(result.snapshot.generatedAt)));
    }
  });
});

test("cachevoorkeur bewaart bestandsselectie, provenance en deduplicatie zonder live highlights toe te voegen", async () => {
  await withCache(async (cacheDirectory) => {
    await mkdir(join(cacheDirectory, "nested"));
    await writeFile(join(cacheDirectory, "nested", "enrich-result.json"), JSON.stringify({
      document_id: "cached",
      highlights_created: ["Een gecachet inzicht.", { text: "Een gecachet inzicht." }],
      highlights: [{ id: "h2", text: "Een tweede inzicht.", pipeline: "user" }],
    }));
    await writeFile(join(cacheDirectory, "triage-result.json"), JSON.stringify({ document_id: "cached", highlights: [{ text: "Een gecachet inzicht.", pipeline: "readwise-enrich" }] }));
    await writeFile(join(cacheDirectory, "other.json"), JSON.stringify({ document_id: "missing", highlights: ["Niet geselecteerde bestandsnaam."] }));
    await writeFile(join(cacheDirectory, "highlight-result.txt"), JSON.stringify({ document_id: "missing", highlights: ["Verkeerde extensie."] }));
    await writeFile(join(cacheDirectory, "prefetch-broken.json"), "{broken");
    await writeFile(join(cacheDirectory, "prefetch-no-id.json"), JSON.stringify({ highlights: ["Geen document-ID."] }));
    const transport = reader([{ id: "cached" }, { id: "missing" }]);
    const result = await preparePriorityEvidence({ runReadwise: transport.runReadwise }, {
      selection: "all-later", readingPreferences: PREFERENCES, cacheDirectory,
    });
    assert.equal(transport.calls.length, 2);
    assert.equal(transport.calls[1]?.[2], "missing");
    const cached = result.snapshot.documents.cached;
    assert.ok(cached);
    assert.deepEqual(cached.highlights.map(({ text }) => text), ["Een gecachet inzicht.", "Een tweede inzicht."]);
    assert.deepEqual(cached.highlights.map(({ provenance }) => provenance), ["readwise-enrich", "user"]);
    assert.equal(result.snapshot.documents.missing?.highlights[0]?.text, "Een inhoudelijk inzicht.");
  });
});

test("cache-only, refresh en beide flags samen behouden hun bestaande betekenis", async () => {
  await withCache(async (cacheDirectory) => {
    await writeFile(join(cacheDirectory, "enrich-result.json"), JSON.stringify({ document_id: "cached", highlights: ["Gecachet inzicht."] }));
    for (const scenario of [
      { cacheOnly: true, refreshHighlights: false, calls: 1, cached: "Gecachet inzicht.", missing: undefined },
      { cacheOnly: false, refreshHighlights: true, calls: 3, cached: "Een inhoudelijk inzicht.", missing: "Een inhoudelijk inzicht." },
      { cacheOnly: true, refreshHighlights: true, calls: 1, cached: undefined, missing: undefined },
    ]) {
      const transport = reader([{ id: "cached" }, { id: "missing" }]);
      const result = await preparePriorityEvidence({ runReadwise: transport.runReadwise }, {
        selection: "all-later", readingPreferences: PREFERENCES, cacheDirectory,
        cacheOnly: scenario.cacheOnly, refreshHighlights: scenario.refreshHighlights,
      });
      assert.equal(transport.calls.length, scenario.calls);
      assert.equal(result.snapshot.documents.cached?.highlights[0]?.text, scenario.cached);
      assert.equal(result.snapshot.documents.missing?.highlights[0]?.text, scenario.missing);
    }
  });
});

test("ontbrekende en beschadigde cache vallen terug op live highlights; een niet-lege ruwe cache blijft leidend", async () => {
  await withCache(async (cacheDirectory) => {
    for (const cache of [join(cacheDirectory, "missing"), cacheDirectory]) {
      await writeFile(join(cacheDirectory, "enrich-broken.json"), "geen JSON");
      const transport = reader([{ id: "doc" }]);
      const result = await preparePriorityEvidence({ runReadwise: transport.runReadwise }, {
        selection: "all-later", readingPreferences: PREFERENCES, cacheDirectory: cache,
      });
      assert.equal(transport.calls.length, 2);
      assert.equal(result.snapshot.documents.doc?.highlights.length, 1);
    }
    await writeFile(join(cacheDirectory, "highlight-empty.json"), JSON.stringify({ document_id: "doc", highlights: [{ text: "" }] }));
    const transport = reader([{ id: "doc" }]);
    const result = await preparePriorityEvidence({ runReadwise: transport.runReadwise }, {
      selection: "all-later", readingPreferences: PREFERENCES, cacheDirectory,
    });
    assert.equal(transport.calls.length, 1);
    assert.deepEqual(result.snapshot.documents.doc?.highlights, []);
  });
});

test("highlights accepteren arrays en highlights-objecten; onbekende antwoordvormen blijven leeg", async () => {
  await withCache(async (cacheDirectory) => {
    for (const scenario of [
      { response: ["Inzicht."], texts: ["Inzicht."] },
      { response: { highlights: [{ text: "Inzicht." }] }, texts: ["Inzicht."] },
      { response: { results: ["Niet ondersteund."] }, texts: [] },
      { response: null, texts: [] },
    ]) {
      const transport = reader([{ id: "doc" }], scenario.response);
      const result = await preparePriorityEvidence({ runReadwise: transport.runReadwise }, {
        selection: "all-later", readingPreferences: PREFERENCES, cacheDirectory,
      });
      assert.deepEqual(result.snapshot.documents.doc?.highlights.map(({ text }) => text), scenario.texts);
    }
  });
});

test("ongeldige batchgrootte wordt vóór Reader-opvragen afgewezen", async () => {
  for (const batchSize of [0, -1, 1.5, NaN, Infinity]) {
    const transport = reader([{ id: "doc" }]);
    await assert.rejects(preparePriorityEvidence({ runReadwise: transport.runReadwise }, {
      selection: "all-later", readingPreferences: PREFERENCES, cacheDirectory: "/ongebruikt", batchSize,
    }), /Batchgrootte moet positief zijn/);
    assert.deepEqual(transport.calls, []);
  }
});

test("document- en highlightfouten breken de hele voorbereiding af", async () => {
  await withCache(async (cacheDirectory) => {
    const failure = new Error("Reader niet beschikbaar");
    for (const stage of ["documents", "highlights"]) {
      const runReadwise: ReadwiseExecutor<{ stdout: string }> = (args) => {
        if (stage === "documents" || args[0] === "reader-get-document-highlights") {throw failure;}
        return Promise.resolve({ stdout: JSON.stringify([{ id: "doc" }]) });
      };
      await assert.rejects(preparePriorityEvidence({ runReadwise }, {
        selection: "all-later", readingPreferences: PREFERENCES, cacheDirectory,
      }), (error: unknown) => error === failure);
    }
    for (const malformedDocuments of [true, false]) {
      const runReadwise: ReadwiseExecutor<{ stdout: string }> = (args) => Promise.resolve({
        stdout: malformedDocuments || args[0] === "reader-get-document-highlights" ? "{broken" : JSON.stringify([{ id: "doc" }]),
      });
      await assert.rejects(preparePriorityEvidence({ runReadwise }, {
        selection: "all-later", readingPreferences: PREFERENCES, cacheDirectory,
      }), SyntaxError);
    }
  });
});

test("dubbele document-IDs behouden de laatste evidence en bestaande voortgangsvolgorde", async () => {
  await withCache(async (cacheDirectory) => {
    const transport = reader([{ id: "duplicate", title: "Eerste" }, { id: "other" }, { id: "duplicate", title: "Laatste" }]);
    const progress: unknown[] = [];
    const result = await preparePriorityEvidence({ runReadwise: transport.runReadwise, onProgress: (event) => { progress.push(event); } }, {
      selection: "all-later", readingPreferences: PREFERENCES, cacheDirectory,
    });
    assert.deepEqual(Object.keys(result.snapshot.documents), ["duplicate", "other"]);
    assert.equal(result.snapshot.documents.duplicate?.title, "Laatste");
    assert.deepEqual(result.batches[0]?.documents.map(({ documentId }) => documentId), ["duplicate", "other"]);
    assert.deepEqual(progress, [1, 2, 3].map((completed) => ({ completed, total: 3 })));
    assert.equal(transport.calls.length, 4);
  });
});

test("voorbereiding behoudt bekende fingerprints en houdt leesfeedback buiten inhoudelijke evidence", async () => {
  await withCache(async (cacheDirectory) => {
    const doc = {
      id: "privacy", title: "Toegankelijke filosofie", summary: "Een inhoudelijk essay.",
      notes: "Waarom lezen: duurzaam inzicht.\nBeste moment: rustig", category: "article",
      tags: { philosophy: {}, "aaa-top-100": {}, "lees-0001": {}, "must-read": {} },
    };
    for (const notes of [doc.notes, `${doc.notes}\n\nFeedback: Persoonlijke leeservaring.`]) {
      const transport = reader([{ ...doc, notes }], [
        { id: "h1", text: "Een inzicht.", pipeline: "user" },
        { id: "h2", text: "Een inzicht.", pipeline: "readwise-enrich" },
      ]);
      const result = await preparePriorityEvidence({ runReadwise: transport.runReadwise }, {
        selection: "top100", readingPreferences: PREFERENCES, cacheDirectory,
      });
      const evidence = result.snapshot.documents.privacy;
      assert.ok(evidence);
      assert.equal(evidence.notes, doc.notes);
      assert.equal(evidence.sourceFingerprint, "753417ce384b93286b989dd1518113a052e1dfdf33b73dc69dbfab00c7c823fe");
      assert.equal(evidence.evidenceFingerprint, "4b65c74a34b4c079e44a536e11b9e58c9632d15b269c620a2aa4ecff851a4363");
      assert.deepEqual(evidence.contentTags, ["philosophy"]);
      assert.deepEqual(evidence.curationSignals, ["must-read"]);
      assert.deepEqual(evidence.positionTagsExcluded, ["aaa-top-100", "lees-0001"]);
      assert.deepEqual(evidence.highlights, [{ stableRef: "h1", text: "Een inzicht.", note: null, tags: [], provenance: "user" }]);
      assert.doesNotMatch(JSON.stringify(result), /Persoonlijke leeservaring/);
    }
  });
});
