import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MANAGED_READWISE_SKILLS } from "../scripts/lib/skill-sync.js";
import { checkSkillRepository } from "../scripts/lib/skill-check.js";

async function makeFixtureRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `top-articles-${prefix}-`));
}

async function writeCheckFixture(root: string): Promise<void> {
  const skillRoot = join(root, "skills");
  await mkdir(skillRoot, { recursive: true });
  await writeFile(
    join(skillRoot, "readwise-reference.md"),
    "SEQUENCE_ORDER FAMILY_DEFINITIONS readwise-priority-v8 config/readwise-reading-preferences.md reader-list-documents reader-bulk-edit-document-metadata want-to-read V2 verrijkingscontract bronstatus pipeline-managed Runmanifest doelpagina",
    "utf8",
  );
  for (const skill of MANAGED_READWISE_SKILLS) {
    const currentSkillRoot = join(skillRoot, skill);
    await mkdir(join(currentSkillRoot, "agents"), { recursive: true });
    const enrichmentContract = skill === "readwise-enrich"
      ? "V2 verrijkingscontract complete available source source_status run manifest ownership-unknown"
      : skill === "readwise-summarize"
        ? "V2 verrijkingscontract complete available source source_status run manifest ownership-unknown"
        : skill === "readwise-book-study"
          ? "V2 verrijkingscontract complete book evidence bronstatus manifest ownership-unknown"
          : "";
    await writeFile(
      join(currentSkillRoot, "SKILL.md"),
      `---\nname: ${skill}\ndescription: Valid fixture\n---\n\nRead <repository>/skills/readwise-reference.md. Use TOP_ARTICLES_REPO or /mnt/c/dev/top-articles.\nreadwise reader-list-documents reader-bulk-edit-document-metadata\n${enrichmentContract}\n`,
      "utf8",
    );
    await writeFile(
      join(currentSkillRoot, "agents", "openai.yaml"),
      `interface:\n  display_name: ${skill}\n  short_description: Valid fixture\n`,
      "utf8",
    );
  }
}

test("skill check validates all managed metadata, central contracts, and known commands", async () => {
  const skillRoot = await makeFixtureRoot("check-source");
  await writeCheckFixture(skillRoot);

  const result = await checkSkillRepository({ repositoryRoot: skillRoot, installRoot: join(skillRoot, "not-installed") });
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => warning.includes("install")));
  assert.equal(result.checkedSkills, 10);
  assert.ok(result.checkedFiles > 10);
});

test("skill check reports invalid metadata and drift without writing", async () => {
  const skillRoot = await makeFixtureRoot("check-invalid");
  const installRoot = await makeFixtureRoot("check-install");
  await writeCheckFixture(skillRoot);
  await writeFile(join(skillRoot, "skills", "readwise-cli", "SKILL.md"), "no frontmatter\nreadwise unknown-command\n", "utf8");
  await mkdir(join(installRoot, "readwise-cli"), { recursive: true });
  await writeFile(join(installRoot, "readwise-cli", "SKILL.md"), "installed old\n", "utf8");

  const result = await checkSkillRepository({ repositoryRoot: skillRoot, installRoot, compareInstalled: true });
  assert.ok(result.errors.some((error) => error.includes("readwise-cli")));
  assert.ok(result.errors.some((error) => error.includes("unknown-command")));
  assert.ok(result.drift.some((path) => path === "readwise-cli/SKILL.md"));
  await assert.rejects(stat(join(installRoot, ".readwise-skills-baseline.json")));
  assert.equal(await readFile(join(installRoot, "readwise-cli", "SKILL.md"), "utf8"), "installed old\n");
});
