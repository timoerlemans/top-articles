import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TOPIC_TAG_TAXONOMY,
  TOPIC_TAG_TAXONOMY_VERSION,
  fallbackTopicRelevanceFor,
  topicTagStrengthFor,
} from "../scripts/lib/priority-topic-taxonomy.js";
import { TOPIC_SEQUENCE_ORDER } from "../scripts/lib/priority-sequences.js";
import type { PriorityDocument } from "../scripts/lib/readwise-priority-v2.js";

function document(tags: Record<string, unknown>): PriorityDocument {
  return {
    id: "topic-doc",
    title: "Een topicdocument",
    summary: "Een samenvatting.",
    category: "article",
    tags,
  };
}

test("topic taxonomy is versioned and contains only ranking topics", () => {
  assert.equal(TOPIC_TAG_TAXONOMY_VERSION, 1);
  assert.deepEqual(TOPIC_SEQUENCE_ORDER, [
    "scrum",
    "software-development",
    "front-end-development",
    "social-studies",
    "adhd",
  ]);
  assert.deepEqual(Object.keys(DEFAULT_TOPIC_TAG_TAXONOMY.topics).sort(), [...TOPIC_SEQUENCE_ORDER].sort());
});

test("Agile core tags receive strong fallback relevance without stacking", () => {
  for (const tag of ["agile", "scrum", "team coaching", "facilitation", "flow & delivery", "psm-ii"]) {
    assert.equal(topicTagStrengthFor(document({ [tag]: {} }), "scrum"), "strong", tag);
    assert.equal(fallbackTopicRelevanceFor(document({ [tag]: {} }), "scrum").relevance, 4, tag);
  }

  const severalCoreTags = fallbackTopicRelevanceFor(document({ agile: {}, facilitation: {}, "team coaching": {} }), "scrum");
  assert.equal(severalCoreTags.relevance, 4);
  assert.deepEqual(severalCoreTags.evidence, ["agile", "facilitation", "team coaching"]);
});

test("broad team and organization tags are light Agile evidence", () => {
  for (const tag of ["team dynamics", "team dynamics & collaboration", "organizational behavior", "organizational behavior & culture"]) {
    assert.equal(topicTagStrengthFor(document({ [tag]: {} }), "scrum"), "light", tag);
    assert.equal(fallbackTopicRelevanceFor(document({ [tag]: {} }), "scrum").relevance, 1, tag);
  }
});

test("non-Agile topic membership tags are strong fallback evidence for their own topic", () => {
  assert.equal(fallbackTopicRelevanceFor(document({ "software development": {} }), "software-development").relevance, 4);
  assert.equal(fallbackTopicRelevanceFor(document({ accessibility: {} }), "front-end-development").relevance, 4);
  assert.equal(fallbackTopicRelevanceFor(document({ "social psychology & interpersonal dynamics": {} }), "social-studies").relevance, 4);
  assert.equal(fallbackTopicRelevanceFor(document({ "adhd & neurodivergence": {} }), "adhd").relevance, 4);
});

test("an unrelated document has neutral low-confidence fallback relevance", () => {
  const result = fallbackTopicRelevanceFor(document({ philosophy: {} }), "scrum");
  assert.equal(result.relevance, 0);
  assert.equal(result.source, "fallback");
  assert.equal(result.confidence, "low");
  assert.deepEqual(result.evidence, []);
});
