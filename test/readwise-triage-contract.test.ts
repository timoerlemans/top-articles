import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("automatic Readwise routing protects books in every versioned contract", async () => {
  const skillFiles = [
    "skills/readwise-reference.md",
    "skills/readwise-triage/SKILL.md",
    "skills/readwise-inbox/SKILL.md",
  ];

  for (const relativePath of skillFiles) {
    const content = await readFile(join(root, relativePath), "utf8");
    assert.match(content, /Boeken\/EPUB's worden nooit automatisch gearchiveerd/);
    assert.match(content, /routeer ze naar `later`/);
    assert.match(content, /expliciete handmatige opdracht van de gebruiker/);
    assert.match(content, /canonieke `isBook`-detector in/);
    assert.match(content, /scripts\/lib\/priority-document\.ts/);
    assert.match(content, /PDF-uitzondering/);
  }
});
