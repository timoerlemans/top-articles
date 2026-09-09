import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveDestinationForRecommendation,
  matchArchiveRecord,
  parseTriageLogs,
  resolveArchiveProvenance,
} from "../scripts/lib/triage-provenance.js";
import type { ArchiveLogRecord, TriageDocument } from "../scripts/lib/triage-provenance.js";

const document = (overrides: Partial<TriageDocument>): TriageDocument => ({
  id: "default-id",
  title: "Default title",
  source: "Default source",
  sourceUrl: "https://example.test/default",
  ...overrides,
});

test("parses only explicit automatic archive evidence and retains its source location", () => {
  const records = parseTriageLogs([{
    path: "/mnt/c/obsidian/Calendar/Logs/2026-09-09 Readwise triage.md",
    text: [
      "| Title | Previous location | Reason | URL |",
      "| --- | --- | --- | --- |",
      "| Automatic | feed | Automatically archived after enrichment | https://read.readwise.io/read/auto-id |",
      "| Explicit move | later | Reviewed: later -> archive | https://example.test/move |",
      "| Manual | feed | Archived after I chose it | https://example.test/manual |",
      "| General mention | feed | Archive contains useful items | https://example.test/general |",
    ].join("\n"),
  }]);

  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => ({
    kind: record.kind,
    documentId: record.documentId,
    sourceUrl: record.sourceUrl,
    originalLocation: record.originalLocation,
    destination: record.destination,
    line: record.line,
  })), [
    {
      kind: "automatic-archive",
      documentId: "auto-id",
      sourceUrl: undefined,
      originalLocation: "feed",
      destination: "archive",
      line: 3,
    },
    {
      kind: "automatic-archive",
      documentId: undefined,
      sourceUrl: "https://example.test/move",
      originalLocation: "later",
      destination: "archive",
      line: 4,
    },
  ]);
  assert.match(records[0]?.evidenceText ?? "", /Automatically archived after enrichment/i);
});

test("matches archive evidence by ID, then exact URL, then unique title and source", () => {
  const documents = [
    document({ id: "by-id", title: "ID document", sourceUrl: "https://example.test/id" }),
    document({ id: "by-url", title: "URL document", sourceUrl: "https://example.test/url" }),
    document({ id: "by-title-source", title: "Shared title", source: "Unique publication", sourceUrl: null }),
  ];
  const base: ArchiveLogRecord = {
    kind: "automatic-archive",
    logPath: "log.md",
    line: 1,
    evidenceText: "Automatically archived",
    originalLocation: "feed",
    destination: "archive",
    date: "2026-09-09",
    triageReasonCode: "automatic-archive",
  };

  const idMatch = matchArchiveRecord({ ...base, documentId: "by-id", sourceUrl: "https://example.test/url" }, documents);
  const urlMatch = matchArchiveRecord({ ...base, sourceUrl: "https://example.test/url", title: "Not the title" }, documents);
  const titleSourceMatch = matchArchiveRecord({ ...base, title: "Shared title", source: "Unique publication" }, documents);

  assert.deepEqual(idMatch, { status: "matched", document: documents[0], matchedBy: "document-id" });
  assert.deepEqual(urlMatch, { status: "matched", document: documents[1], matchedBy: "source-url" });
  assert.deepEqual(titleSourceMatch, { status: "matched", document: documents[2], matchedBy: "title-and-source" });
});

test("rejects ambiguous title and source matches instead of guessing", () => {
  const record: ArchiveLogRecord = {
    kind: "automatic-archive",
    logPath: "log.md",
    line: 1,
    evidenceText: "Automatically archived",
    title: "Duplicate title",
    source: "Same publication",
    originalLocation: "feed",
    destination: "archive",
    date: "2026-09-09",
    triageReasonCode: "automatic-archive",
  };

  const result = matchArchiveRecord(record, [
    document({ id: "one", title: "Duplicate title", source: "Same publication", sourceUrl: null }),
    document({ id: "two", title: "Duplicate title", source: "Same publication", sourceUrl: null }),
  ]);

  assert.deepEqual(result, { status: "rejected", reason: "ambiguous-title-and-source" });
});

test("rejects automatic archive evidence when the same document was restored to later", () => {
  const records = parseTriageLogs([{
    path: "/mnt/c/obsidian/Calendar/Logs/2026-09-09 Readwise triage.md",
    text: [
      "| Title | Previous location | Reason | URL |",
      "| --- | --- | --- | --- |",
      "| Restored document | feed | Automatically archived | https://read.readwise.io/read/restored-id |",
      "| Restored document | archive | Restored to later after review | https://read.readwise.io/read/restored-id |",
    ].join("\n"),
  }]);

  const result = resolveArchiveProvenance(records, [document({ id: "restored-id", title: "Restored document" })]);

  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.rejected.map(({ reason }) => reason), ["restored-to-later"]);
});

test("herkent ook de Nederlandse formulering later teruggezet als herstelbewijs", () => {
  const records = parseTriageLogs([{
    path: "/mnt/c/obsidian/Calendar/Logs/2026-09-09 Readwise triage.md",
    text: [
      "| Automatic | feed | automatisch gearchiveerd | https://read.readwise.io/read/restored-id |",
      "| Restored | archive | later teruggezet na controle | https://read.readwise.io/read/restored-id |",
    ].join("\n"),
  }]);

  const result = resolveArchiveProvenance(records, [document({ id: "restored-id" })]);

  assert.equal(records[1]?.kind, "restored-to-later");
  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.rejected.map(({ reason }) => reason), ["restored-to-later"]);
});

test("maps explicit triage recommendations to their safe destination", () => {
  assert.equal(archiveDestinationForRecommendation("later"), "later");
  assert.equal(archiveDestinationForRecommendation("shortlist"), "later");
  assert.equal(archiveDestinationForRecommendation("must-read"), "later");
  assert.equal(archiveDestinationForRecommendation("archiveren"), "archive");
  assert.equal(archiveDestinationForRecommendation("podcast"), null);
});
