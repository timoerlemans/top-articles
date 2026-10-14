import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join, resolve } from "node:path";
import {
  MANAGED_READWISE_SKILLS,
  applySkillSyncPlan,
  buildSkillSyncPlan,
  defaultSkillInstallRoot,
  discoverRepositoryRoot,
  type SkillSyncOperation,
} from "./lib/skill-sync.js";
import { checkSkillRepository } from "./lib/skill-check.js";

type Command = "sync" | "check";

interface CliOptions {
  readonly command: Command;
  readonly repo?: string | undefined;
  readonly installDir?: string | undefined;
  readonly baseline?: string | undefined;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly nonInteractive: boolean;
  readonly compareInstalled: boolean;
}

function usage(): string {
  return [
    "Gebruik:",
    "  npm run skills:sync -- [--dry-run] [--repo PAD] [--install-dir PAD] [--baseline PAD] [--yes] [--non-interactive]",
    "  npm run skills:check -- [--repo PAD] [--install-dir PAD] [--compare-installed]",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliOptions {
  const command = argv[0] === "check" ? "check" : argv[0] === "sync" || argv[0] === undefined ? "sync" : undefined;
  if (!command) {
    throw new Error(`Onbekend skills-commando: ${argv[0]}\n${usage()}`);
  }
  let repo: string | undefined;
  let installDir: string | undefined;
  let baseline: string | undefined;
  let dryRun = false;
  let yes = false;
  let nonInteractive = false;
  let compareInstalled = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--yes") {
      yes = true;
    } else if (argument === "--non-interactive") {
      nonInteractive = true;
    } else if (argument === "--compare-installed") {
      compareInstalled = true;
    } else if (argument === "--repo" || argument === "--install-dir" || argument === "--baseline") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} vereist een pad.\n${usage()}`);
      }
      if (argument === "--repo") {
        repo = value;
      }
      if (argument === "--install-dir") {
        installDir = value;
      }
      if (argument === "--baseline") {
        baseline = value;
      }
      index += 1;
    } else {
      throw new Error(`Onbekende optie: ${argument}\n${usage()}`);
    }
  }
  if (command === "check" && (dryRun || yes || nonInteractive)) {
    throw new Error("--dry-run, --yes en --non-interactive horen alleen bij skills:sync.");
  }
  if (command === "check" && baseline) {
    throw new Error("--baseline hoort alleen bij skills:sync.");
  }
  return { command, repo, installDir, baseline, dryRun, yes, nonInteractive, compareInstalled };
}

function repositoryRootFor(options: CliOptions): string {
  const cwd = options.repo ? resolve(options.repo) : process.cwd();
  return discoverRepositoryRoot({ cwd, env: { ...process.env, ...(options.repo ? { TOP_ARTICLES_REPO: options.repo } : {}) } });
}

function printOperation(operation: SkillSyncOperation, prefix = ""): void {
  if (operation.kind === "unchanged") {
    return;
  }
  console.log(`${prefix}${operation.kind}: ${operation.relativePath} — ${operation.reason}`);
  if (operation.diff) {
    console.log(operation.diff);
  }
}

async function confirmConflict(operation: SkillSyncOperation, options: CliOptions): Promise<boolean> {
  if (options.yes) {
    return true;
  }
  if (options.nonInteractive || !stdin.isTTY || !stdout.isTTY) {
    return false;
  }
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await readline.question(`Conflict ${operation.relativePath} vervangen? [y/N] `);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    readline.close();
  }
}

async function runSync(options: CliOptions): Promise<void> {
  const repositoryRoot = repositoryRootFor(options);
  const installRoot = resolve(options.installDir ?? defaultSkillInstallRoot());
  const baselinePath = resolve(options.baseline ?? join(installRoot, ".readwise-skills-baseline.json"));
  const plan = await buildSkillSyncPlan({
    sourceRoot: join(repositoryRoot, "skills"),
    installRoot,
    baselinePath,
  });
  console.log(`Readwise skills sync — ${MANAGED_READWISE_SKILLS.length} beheerde skills`);
  console.log(`repository: ${repositoryRoot}`);
  console.log(`installatie: ${installRoot}`);
  console.log(`baseline: ${baselinePath}`);
  if (options.dryRun) {
    console.log("MODUS: dry-run (geen bestanden of baseline worden geschreven)");
  }
  for (const operation of plan.operations) {
    printOperation(operation, options.dryRun ? "[dry-run] " : "");
  }
  const report = await applySkillSyncPlan(plan, {
    dryRun: options.dryRun,
    confirm: (operation) => confirmConflict(operation, options),
  });
  console.log(`applied: ${report.applied.length}`);
  console.log(`skipped: ${report.skipped.length}`);
  console.log(`conflicted: ${report.conflicted.length}`);
  console.log(`unchanged: ${report.unchanged.length}`);
  console.log(`preserved: ${report.preserved.length}`);
  if (report.applied.length > 0) {
    console.log(`applied files: ${report.applied.join(", ")}`);
  }
  if (report.skipped.length > 0) {
    console.log(`skipped files: ${report.skipped.join(", ")}`);
  }
}

async function runCheck(options: CliOptions): Promise<number> {
  const repositoryRoot = repositoryRootFor(options);
  const installRoot = options.installDir ? resolve(options.installDir) : defaultSkillInstallRoot();
  const result = await checkSkillRepository({
    repositoryRoot,
    installRoot,
    compareInstalled: options.compareInstalled,
  });
  for (const error of result.errors) {
    console.error(`ERROR: ${error}`);
  }
  for (const warning of result.warnings) {
    console.log(`WARNING: ${warning}`);
  }
  console.log(`skills: ${result.checkedSkills}; files: ${result.checkedFiles}; errors: ${result.errors.length}; warnings: ${result.warnings.length}; drift: ${result.drift.length}`);
  return result.errors.length > 0 ? 1 : 0;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "check") {
    return runCheck(options);
  }
  await runSync(options);
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
