import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SKILLS_ROOT = "/home/timoerlemans/.codex/skills";
const SKILL_NAMES = ["readwise-enrich", "readwise-triage", "readwise-inbox"] as const;

test("Readwise-skills behandelen ADHD als kerninteresse en topicreeks", async () => {
  const skills = await Promise.all(SKILL_NAMES.map(async (name) => [
    name,
    await readFile(`${SKILLS_ROOT}/${name}/SKILL.md`, "utf8"),
  ] as const));

  for (const [name, content] of skills) {
    assert.match(content, /ADHD[\s\S]{0,300}kerninteresse/i, `${name}: ADHD ontbreekt in het kerninteresseprofiel`);
    assert.match(content, /adhd & neurodivergence/, `${name}: canonieke ADHD-tag ontbreekt`);
    assert.match(content, /adhd[ -]reeks/i, `${name}: ADHD-reeks ontbreekt`);
    assert.match(content, /adhd-001/, `${name}: ADHD-ordinale tag ontbreekt`);
    assert.match(content, /aaa-adhd-top-10/, `${name}: ADHD-toplijsttag ontbreekt`);
    assert.match(content, /boek(?:en)?[^\n]{0,100}alleen[^\n]{0,100}boek/i, `${name}: boekenregel ontbreekt`);
  }
});
