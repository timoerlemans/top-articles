import assert from "node:assert/strict";
import test from "node:test";
import { toCatalogItem } from "../scripts/lib/catalog-item.js";
import type { ReadwiseDocument } from "../scripts/lib/external-schemas.js";

function document(tags: unknown): ReadwiseDocument {
  return {
    id: "catalog-item",
    title: "Een leesbaar voorbeeld",
    author: "Auteur",
    site_name: "Voorbeeldsite",
    summary: "Publieke samenvatting.",
    notes: "Waarom lezen: een praktische uitleg.\nBeste moment: onderweg\n\nFeedback: privéfeedback",
    language: null,
    reading_time: "4 mins",
    word_count: 800,
    published_date: "2026-01-02",
    saved_at: "2026-01-03",
    image_url: "https://example.test/image.png",
    source_url: "https://example.test/source",
    url: "https://read.readwise.io/read/catalog-item",
    category: "article",
    tags,
  };
}

test("catalog classification treats strings, descriptors, and object keys alike", () => {
  const stringItem = toCatalogItem(document(["team collaboration", "dutch"]), 3);
  const descriptorItem = toCatalogItem(document([{ name: "team dynamics & collaboration" }, { key: "nl" }]), 3);
  const objectItem = toCatalogItem(document({ "team dynamics & collaboration": {}, dutch: {} }), 3);

  for (const item of [descriptorItem, objectItem]) {
    assert.deepEqual(item.tags, stringItem.tags);
    assert.deepEqual(item.coreInterests, stringItem.coreInterests);
    assert.equal(item.language, "Nederlands");
    assert.equal(item.readingMinutes, 4);
  }
});

test("explicit language wins over language tags and French is public", () => {
  const item = toCatalogItem({ ...document(["dutch", "french"]), language: "fr" }, null);
  assert.equal(item.language, "Frans");
  assert.equal(item.position, null);
});

test("catalog output keeps public notes but excludes feedback and opaque metadata", () => {
  const metadata: Record<string, unknown> = { hidden: "private" };
  metadata.self = metadata;
  const source = document({ "custom topic": metadata, "team collaboration": {} });
  const item = toCatalogItem(source, null);

  assert.equal(metadata.self, metadata);
  assert.equal(metadata.hidden, "private");
  assert.equal(item.whyRead, "een praktische uitleg.");
  assert.equal(item.bestMoment, "onderweg");
  assert.ok(!JSON.stringify(item).includes("privéfeedback"));
  assert.ok(!JSON.stringify(item).includes("hidden"));
  assert.ok(!("notes" in item));
  assert.ok(!("judgment" in item));
  assert.ok(!("provenance" in item));
  assert.ok(item.tags.includes("custom topic"));
});
