import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

async function readSkill(name: string): Promise<string> {
  return readFile(join(root, "skills", name, "SKILL.md"), "utf8");
}

test("enrichment skills share the v2 source, privacy, ownership, and resume contract", async () => {
  const [reference, enrich, summarize, bookStudy] = await Promise.all([
    readFile(join(root, "skills", "readwise-reference.md"), "utf8"),
    readSkill("readwise-enrich"),
    readSkill("readwise-summarize"),
    readSkill("readwise-book-study"),
  ]);

  for (const content of [enrich, summarize, bookStudy]) {
    assert.match(content, /V2 verrijkingscontract/i);
    assert.match(content, /complete available source|volledige beschikbare bron/i);
    assert.match(content, /personal notes|persoonlijke notities/i);
    assert.match(content, /Feedback:/i);
    assert.match(content, /ownership|eigendom/i);
    assert.match(content, /manifest/i);
    assert.match(content, /resume|hervat/i);
  }

  assert.match(reference, /V2 verrijkingscontract/i);
  assert.match(reference, /source status|bronstatus/i);
  assert.match(reference, /pipeline-managed|pipeline-beheerd/i);
  assert.match(reference, /actual analysis\/write outcomes|feitelijke analyse-\/schrijfuitkomsten/i);
  assert.match(reference, /target page|doelpagina/i);

  for (const content of [enrich, summarize, bookStudy]) {
    assert.doesNotMatch(content, /tien (?:volledige )?(?:afzonderlijke )?(?:scan)?passes/i);
    assert.doesNotMatch(content, /highlight_passes_completed|scanpass-gate/i);
    assert.doesNotMatch(content, /notes replaces any existing note/i);
    assert.doesNotMatch(content, /skip it silently/i);
  }
});
