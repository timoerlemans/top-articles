import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { MANAGED_READWISE_SKILLS } from "../scripts/lib/skill-sync.js";

const CLI_PATH = fileURLToPath(new URL("../scripts/skills-cli.js", import.meta.url));

async function makeRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `top-articles-${prefix}-`));
}

async function writeFixture(repositoryRoot: string): Promise<void> {
  const skillRoot = join(repositoryRoot, "skills");
  await mkdir(skillRoot, { recursive: true });
  await writeFile(join(repositoryRoot, "package.json"), JSON.stringify({ name: "top-articles" }), "utf8");
  await writeFile(
    join(skillRoot, "readwise-reference.md"),
    "SEQUENCE_ORDER FAMILY_DEFINITIONS readwise-priority-v8 config/readwise-reading-preferences.md reader-list-documents reader-bulk-edit-document-metadata want-to-read readwise:priority-sync authors -> priority -> archive -> cleanup -> build exacte planhash bronfingerprints geen stille uitzondering V2 verrijkingscontract V2 triageroutering V2 reviewonderhoud bronstatus pipeline-managed Runmanifest doelpagina",
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
      : skill === "readwise-priority-judge"
        ? "semantic-v2 incremental philosophy fallback report"
        : "";
    const routingContract = skill === "readwise-triage"
      ? "V2 triagecontract source_status move_outcome operation_keys doelpagina interactive want-to-read"
      : skill === "readwise-inbox"
        ? "V2 inboxcontract location=new source_status runmanifest doelpagina één verantwoordelijke linkpass"
        : "";
    const maintenanceContract = skill === "readwise-priority-sync"
      ? "readwise:priority-sync authors -> priority -> archive -> cleanup -> build exacte planhash bronfingerprints"
      : skill === "readwise-reorder"
        ? "readwise-priority-sync exacte planhash geen stille uitzondering"
        : "";
    await writeFile(
      join(currentSkillRoot, "SKILL.md"),
      `---\nname: ${skill}\ndescription: Fixture skill\n---\n\nRead <repository>/skills/readwise-reference.md. Use TOP_ARTICLES_REPO or /mnt/c/dev/top-articles.\nreadwise reader-list-documents\n${enrichmentContract} ${routingContract} ${maintenanceContract}\n`,
      "utf8",
    );
    await writeFile(
      join(currentSkillRoot, "agents", "openai.yaml"),
      `interface:\n  display_name: ${skill}\n  short_description: Fixture\n`,
      "utf8",
    );
  }
}

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8" });
}

test("skills:sync dry-run prints diffs and writes neither installation nor baseline", async () => {
  const repositoryRoot = await makeRoot("cli-dry-repo");
  const installRoot = await makeRoot("cli-dry-install");
  const baselinePath = join(await makeRoot("cli-dry-baseline"), "baseline.json");
  await writeFixture(repositoryRoot);

  const result = runCli(["sync", "--repo", repositoryRoot, "--install-dir", installRoot, "--baseline", baselinePath, "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry-run/i);
  assert.match(result.stdout, /readwise-cli\/SKILL\.md/);
  assert.equal(existsSync(baselinePath), false);
  assert.deepEqual(await readdir(installRoot), []);
});

test("skills:sync refuses non-interactive first-install conflicts and --yes applies them", async () => {
  const repositoryRoot = await makeRoot("cli-conflict-repo");
  const installRoot = await makeRoot("cli-conflict-install");
  const baselinePath = join(await makeRoot("cli-conflict-baseline"), "baseline.json");
  await writeFixture(repositoryRoot);
  await mkdir(join(installRoot, "readwise-cli"), { recursive: true });
  await writeFile(join(installRoot, "readwise-cli", "SKILL.md"), "local edit\n", "utf8");

  const refused = runCli(["sync", "--repo", repositoryRoot, "--install-dir", installRoot, "--baseline", baselinePath, "--non-interactive"]);
  assert.equal(refused.status, 0, refused.stderr);
  assert.match(refused.stdout, /conflict/i);
  assert.match(refused.stdout, /skipped/i);
  assert.equal(await readFile(join(installRoot, "readwise-cli", "SKILL.md"), "utf8"), "local edit\n");

  const applied = runCli(["sync", "--repo", repositoryRoot, "--install-dir", installRoot, "--baseline", baselinePath, "--yes"]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /applied/i);
  assert.equal(await readFile(join(installRoot, "readwise-cli", "SKILL.md"), "utf8"), await readFile(join(repositoryRoot, "skills", "readwise-cli", "SKILL.md"), "utf8"));
  assert.equal(existsSync(baselinePath), true);
});

test("skills:check is read-only by default and reports optional installed drift", async () => {
  const repositoryRoot = await makeRoot("cli-check-repo");
  const installRoot = await makeRoot("cli-check-install");
  await writeFixture(repositoryRoot);

  const result = runCli(["check", "--repo", repositoryRoot, "--install-dir", installRoot]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /errors: 0/i);
  assert.match(result.stdout, /install/i);
  assert.equal(existsSync(join(installRoot, ".readwise-skills-baseline.json")), false);

  await mkdir(join(installRoot, "readwise-cli"), { recursive: true });
  await writeFile(join(installRoot, "readwise-cli", "SKILL.md"), "old\n", "utf8");
  const compared = runCli(["check", "--repo", repositoryRoot, "--install-dir", installRoot, "--compare-installed"]);
  assert.equal(compared.status, 0, compared.stderr);
  assert.match(compared.stdout, /drift|wijken/i);
  assert.equal(await readFile(join(installRoot, "readwise-cli", "SKILL.md"), "utf8"), "old\n");
});
