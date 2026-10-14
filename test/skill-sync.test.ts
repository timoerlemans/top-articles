import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";
import {
  MANAGED_READWISE_SKILLS,
  applySkillSyncPlan,
  buildSkillSyncPlan,
  discoverRepositoryRoot,
  snapshotSkillSource,
  type SkillBaseline,
} from "../scripts/lib/skill-sync.js";

async function makeFixtureRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `top-articles-${prefix}-`));
}

async function writeSkillFixture(root: string, version: string): Promise<void> {
  for (const skill of MANAGED_READWISE_SKILLS) {
    const skillRoot = join(root, skill);
    await mkdir(join(skillRoot, "agents"), { recursive: true });
    await writeFile(
      join(skillRoot, "SKILL.md"),
      `---\nname: ${skill}\ndescription: Fixture skill\n---\n\nreadwise reader-list-documents ${version}\n`,
      "utf8",
    );
    await writeFile(
      join(skillRoot, "agents", "openai.yaml"),
      `interface:\n  display_name: ${skill}\n  short_description: Fixture\n`,
      "utf8",
    );
  }
  await mkdir(join(root, "readwise-cli", "resources"), { recursive: true });
  await writeFile(join(root, "readwise-cli", "resources", "fixture.md"), "resource\n", "utf8");
}

test("managed skill snapshot includes all ten folders and nested resources", async () => {
  const sourceRoot = await makeFixtureRoot("skill-source");
  await writeSkillFixture(sourceRoot, "v1");

  const snapshot = await snapshotSkillSource(sourceRoot);
  const paths = [...snapshot.keys()];

  assert.equal(MANAGED_READWISE_SKILLS.length, 10);
  assert.equal(new Set(paths.map((path) => path.split("/")[0])).size, 10);
  assert.ok(paths.includes("readwise-cli/SKILL.md"));
  assert.ok(paths.includes("readwise-cli/agents/openai.yaml"));
  assert.ok(paths.includes("readwise-cli/resources/fixture.md"));
  assert.ok([...snapshot.values()].every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
});

test("repository discovery prefers a valid current worktree and then an explicit repository", async () => {
  const repositoryRoot = process.cwd();
  assert.equal(
    discoverRepositoryRoot({ cwd: repositoryRoot, env: { TOP_ARTICLES_REPO: "/does/not/exist" } }),
    repositoryRoot,
  );

  const explicitRoot = await makeFixtureRoot("explicit-repo");
  await mkdir(join(explicitRoot, "skills"), { recursive: true });
  await writeFile(join(explicitRoot, "package.json"), JSON.stringify({ name: "top-articles" }), "utf8");
  await mkdir(join(explicitRoot, "skills", "readwise-cli"), { recursive: true });
  assert.equal(
    discoverRepositoryRoot({ cwd: "/tmp", env: { TOP_ARTICLES_REPO: explicitRoot } }),
    explicitRoot,
  );
});

test("dry-run classifies creates, clean updates, local conflicts, and safe deletions without writing", async () => {
  const sourceRoot = await makeFixtureRoot("source");
  const installRoot = await makeFixtureRoot("install");
  const baselinePath = join(await makeFixtureRoot("baseline"), "baseline.json");
  await writeSkillFixture(sourceRoot, "new");
  await mkdir(join(installRoot, "readwise-cli"), { recursive: true });
  await writeFile(join(installRoot, "readwise-cli", "SKILL.md"), "old\n", "utf8");
  await writeFile(join(installRoot, "unmanaged.txt"), "keep\n", "utf8");

  const baseline: SkillBaseline = {
    version: 1,
    files: { "readwise-cli/SKILL.md": "old-baseline-hash" },
  };
  const plan = await buildSkillSyncPlan({ sourceRoot, installRoot, baselinePath, baseline });
  const operations = new Map(plan.operations.map((operation) => [operation.relativePath, operation]));

  assert.equal(operations.get("readwise-cli/SKILL.md")?.kind, "conflict");
  assert.equal(operations.get("readwise-cli/agents/openai.yaml")?.kind, "create");
  assert.ok((operations.get("readwise-cli/SKILL.md")?.diff ?? "").includes("old"));
  assert.equal(await readFile(join(installRoot, "unmanaged.txt"), "utf8"), "keep\n");

  const report = await applySkillSyncPlan(plan, { dryRun: true, confirm: () => true });
  assert.deepEqual(report.applied, []);
  await assert.rejects(stat(baselinePath));
  assert.equal(await readFile(join(installRoot, "readwise-cli", "SKILL.md"), "utf8"), "old\n");
});

test("apply updates only confirmed conflicts and persists the applied source baseline", async () => {
  const sourceRoot = await makeFixtureRoot("source-apply");
  const installRoot = await makeFixtureRoot("install-apply");
  const baselinePath = join(await makeFixtureRoot("baseline-apply"), "baseline.json");
  await writeSkillFixture(sourceRoot, "new");
  await mkdir(join(installRoot, "readwise-cli"), { recursive: true });
  await writeFile(join(installRoot, "readwise-cli", "SKILL.md"), "local edit\n", "utf8");
  await writeFile(join(installRoot, "unmanaged.txt"), "keep\n", "utf8");

  const plan = await buildSkillSyncPlan({
    sourceRoot,
    installRoot,
    baselinePath,
    baseline: { version: 1, files: { "readwise-cli/SKILL.md": "previous" } },
  });
  const report = await applySkillSyncPlan(plan, {
    confirm: (operation) => operation.relativePath === "readwise-cli/SKILL.md",
  });

  assert.ok(report.applied.includes("readwise-cli/SKILL.md"));
  assert.equal(report.conflicted.length, 0);
  assert.equal(await readFile(join(installRoot, "readwise-cli", "SKILL.md"), "utf8"), await readFile(join(sourceRoot, "readwise-cli", "SKILL.md"), "utf8"));
  assert.equal(await readFile(join(installRoot, "unmanaged.txt"), "utf8"), "keep\n");
  const savedBaseline = JSON.parse(await readFile(baselinePath, "utf8")) as SkillBaseline;
  assert.equal(savedBaseline.files["readwise-cli/SKILL.md"], plan.source.get("readwise-cli/SKILL.md")?.sha256);
});

test("safe repository deletion is applied while a locally changed deletion remains conflicted", async () => {
  const sourceRoot = await makeFixtureRoot("source-delete");
  const installRoot = await makeFixtureRoot("install-delete");
  await writeSkillFixture(sourceRoot, "v1");
  await writeSkillFixture(installRoot, "v1");
  await mkdir(join(installRoot, "readwise-cli"), { recursive: true });
  await writeFile(join(installRoot, "readwise-cli", "removed.md"), "same\n", "utf8");
  await writeFile(join(installRoot, "readwise-cli", "local.md"), "local\n", "utf8");
  const snapshot = await snapshotSkillSource(installRoot);
  const baseline: SkillBaseline = {
    version: 1,
    files: {
      [relative(installRoot, join(installRoot, "readwise-cli", "removed.md"))]: snapshot.get("readwise-cli/removed.md")?.sha256 ?? "",
      [relative(installRoot, join(installRoot, "readwise-cli", "local.md"))]: "old-hash",
    },
  };

  const plan = await buildSkillSyncPlan({ sourceRoot, installRoot, baseline });
  const operations = new Map(plan.operations.map((operation) => [operation.relativePath, operation]));
  assert.equal(operations.get("readwise-cli/removed.md")?.kind, "delete");
  assert.equal(operations.get("readwise-cli/local.md")?.kind, "conflict");
});
