import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

async function readSkill(name: string): Promise<string> {
  return readFile(join(root, "skills", name, "SKILL.md"), "utf8");
}

test("triage and inbox share the v2 routing contract", async () => {
  const [reference, triage, inbox] = await Promise.all([
    readFile(join(root, "skills", "readwise-reference.md"), "utf8"),
    readSkill("readwise-triage"),
    readSkill("readwise-inbox"),
  ]);

  for (const content of [triage, inbox]) {
    assert.match(content, /V2 (?:triage|inbox|verrijkings)contract/i);
    assert.match(content, /source_status|bronstatus/i);
    assert.match(content, /manifest/i);
    assert.match(content, /partial|incomplete|onvolledig/i);
    assert.match(content, /reader[_-]move[_-]documents|move operation|moveoperatie/i);
    assert.match(content, /target page|doelpagina/i);
  }

  assert.match(triage, /podcasts?.{0,80}(?:archive|archiveer)/is);
  assert.match(triage, /Tier 1.{0,160}(?:archive|archiveer)/is);
  assert.match(triage, /(?:ordinary|gewone|overige).{0,160}(?:later|bewaren)/is);
  assert.match(triage, /interactive|interactieve/i);
  assert.match(triage, /want-to-read/i);
  assert.doesNotMatch(triage, /Tier 2 auto-archive|Tier 2.*archiveer.*zonder/i);
  assert.doesNotMatch(triage, /minstens 2 volledige iteraties|3, bij voorkeur 5|3–5 volledige passes|10\/10/i);
  assert.doesNotMatch(triage, /altijd naar `?later`?, nooit archiveren/i);
  assert.doesNotMatch(triage, /Notitie aanwezig zonder `Waarom lezen:` header.*Overschrijven/is);
  assert.match(inbox, /New|location\s*=\s*new|location=new/i);
  assert.match(inbox, /geen nieuwe verwerkbare|until no new|totdat.*geen.*nieuwe/i);
  assert.match(inbox, /één verantwoordelijke linkpass|one responsible link pass/i);
  assert.doesNotMatch(inbox, /Tier 2 auto-archive candidates|Tier 2.*auto-archive/i);
  assert.match(reference, /podcasts.*Tier 1.*Archive.*overige.*Later/is);
});
