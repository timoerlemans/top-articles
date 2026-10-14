import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

export const MANAGED_READWISE_SKILLS = [
  "readwise-cli",
  "readwise-enrich",
  "readwise-inbox",
  "readwise-priority-judge",
  "readwise-reorder",
  "readwise-summarize",
  "readwise-tag",
  "readwise-triage",
  "readwise-book-study",
  "readwise-priority-sync",
] as const;

export type ManagedReadwiseSkill = (typeof MANAGED_READWISE_SKILLS)[number];

export interface SkillFile {
  readonly relativePath: string;
  readonly content: Buffer;
  readonly sha256: string;
}

export type SkillSnapshot = ReadonlyMap<string, SkillFile>;

export interface SkillBaseline {
  readonly version: 1;
  readonly files: Readonly<Record<string, string>>;
}

export type SkillSyncOperationKind = "create" | "update" | "delete" | "unchanged" | "conflict" | "preserve";

export interface SkillSyncOperation {
  readonly kind: SkillSyncOperationKind;
  readonly relativePath: string;
  readonly source?: SkillFile | undefined;
  readonly installed?: SkillFile | undefined;
  readonly baselineHash?: string | undefined;
  readonly diff: string;
  readonly reason: string;
}

export interface SkillSyncPlan {
  readonly sourceRoot: string;
  readonly installRoot: string;
  readonly baselinePath?: string | undefined;
  readonly source: SkillSnapshot;
  readonly installed: SkillSnapshot;
  readonly baseline: SkillBaseline;
  readonly operations: readonly SkillSyncOperation[];
}

export interface BuildSkillSyncPlanOptions {
  readonly sourceRoot: string;
  readonly installRoot: string;
  readonly baseline?: SkillBaseline;
  readonly baselinePath?: string;
}

export interface ApplySkillSyncOptions {
  readonly dryRun?: boolean;
  readonly confirm?: (operation: SkillSyncOperation) => boolean | Promise<boolean>;
}

export interface SkillSyncReport {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
  readonly conflicted: readonly string[];
  readonly unchanged: readonly string[];
  readonly preserved: readonly string[];
  readonly dryRun: boolean;
}

export interface RepositoryDiscoveryOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly candidates?: readonly string[];
}

const DEFAULT_REPOSITORY_CANDIDATES = [
  "/mnt/c/dev/top-articles",
  join(homedir(), "dev", "top-articles"),
  join(homedir(), "top-articles"),
  join(homedir(), "code", "top-articles"),
] as const;

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/");
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readDirectoryFiles(root: string, current: string, result: Map<string, SkillFile>): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) {
      await readDirectoryFiles(root, absolutePath, result);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const content = await readFile(absolutePath);
    const relativePath = normalizedPath(relative(root, absolutePath));
    result.set(relativePath, {
      relativePath,
      content,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
}

async function snapshotDirectories(root: string, required: boolean): Promise<SkillSnapshot> {
  const result = new Map<string, SkillFile>();
  for (const skill of MANAGED_READWISE_SKILLS) {
    const skillRoot = join(root, skill);
    if (!(await isDirectory(skillRoot))) {
      if (required) {
        throw new Error(`Managed Readwise skill directory ontbreekt: ${skillRoot}`);
      }
      continue;
    }
    await readDirectoryFiles(root, skillRoot, result);
  }
  return result;
}

export async function snapshotSkillSource(sourceRoot: string): Promise<SkillSnapshot> {
  return snapshotDirectories(resolve(sourceRoot), true);
}

async function snapshotInstalledSkills(installRoot: string): Promise<SkillSnapshot> {
  return snapshotDirectories(resolve(installRoot), false);
}

async function readBaseline(path: string | undefined): Promise<SkillBaseline> {
  if (!path || !(await isRegularFile(path))) {
    return { version: 1, files: {} };
  }
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.files)) {
    throw new Error(`Ongeldige Readwise-skillbaseline: ${path}`);
  }
  const files: Record<string, string> = {};
  for (const [filePath, hash] of Object.entries(parsed.files)) {
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`Ongeldige hash in Readwise-skillbaseline: ${filePath}`);
    }
    files[filePath] = hash;
  }
  return { version: 1, files };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lineDiff(relativePath: string, installed: Buffer | undefined, source: Buffer | undefined): string {
  const before = installed?.toString("utf8").split("\n") ?? [];
  const after = source?.toString("utf8").split("\n") ?? [];
  const lines = [`--- ${installed ? `a/${relativePath}` : "/dev/null"}`, `+++ ${source ? `b/${relativePath}` : "/dev/null"}`];
  if (installed) {
    lines.push(...before.filter((line, index) => index < before.length - 1 || line.length > 0).map((line) => `-${line}`));
  }
  if (source) {
    lines.push(...after.filter((line, index) => index < after.length - 1 || line.length > 0).map((line) => `+${line}`));
  }
  return `${lines.join("\n")}\n`;
}

function operationFor(
  relativePath: string,
  source: SkillFile | undefined,
  installed: SkillFile | undefined,
  baselineHash: string | undefined,
): SkillSyncOperation {
  if (source && !installed) {
    return { kind: "create", relativePath, source, baselineHash, diff: lineDiff(relativePath, undefined, source.content), reason: "Bestand ontbreekt lokaal." };
  }
  if (!source && installed && baselineHash && installed.sha256 === baselineHash) {
    return { kind: "delete", relativePath, installed, baselineHash, diff: lineDiff(relativePath, installed.content, undefined), reason: "Bestand is uit de repository verwijderd en lokaal ongewijzigd." };
  }
  if (!source && installed) {
    return {
      kind: baselineHash ? "conflict" : "preserve",
      relativePath,
      installed,
      baselineHash,
      diff: baselineHash ? lineDiff(relativePath, installed.content, undefined) : "",
      reason: baselineHash ? "Lokaal verwijderd bestand wijkt af van de laatste baseline." : "Onbekend lokaal bestand blijft behouden.",
    };
  }
  if (!source || !installed) {
    return { kind: "unchanged", relativePath, source, installed, baselineHash, diff: "", reason: "Geen wijziging." };
  }
  if (source.sha256 === installed.sha256) {
    return { kind: "unchanged", relativePath, source, installed, baselineHash, diff: "", reason: "Lokale kopie is gelijk aan de repository." };
  }
  if (!baselineHash || installed.sha256 !== baselineHash) {
    return {
      kind: "conflict",
      relativePath,
      source,
      installed,
      baselineHash,
      diff: lineDiff(relativePath, installed.content, source.content),
      reason: baselineHash ? "Lokaal bestand is gewijzigd sinds de laatste synchronisatie." : "Bestaand lokaal bestand botst met een eerste installatie.",
    };
  }
  return { kind: "update", relativePath, source, installed, baselineHash, diff: lineDiff(relativePath, installed.content, source.content), reason: "Lokale kopie is schoon bijgewerkt vanuit de repository." };
}

export async function buildSkillSyncPlan(options: BuildSkillSyncPlanOptions): Promise<SkillSyncPlan> {
  const sourceRoot = resolve(options.sourceRoot);
  const installRoot = resolve(options.installRoot);
  const baseline = options.baseline ?? (await readBaseline(options.baselinePath));
  const [source, installed] = await Promise.all([snapshotSkillSource(sourceRoot), snapshotInstalledSkills(installRoot)]);
  const paths = new Set([...source.keys(), ...installed.keys(), ...Object.keys(baseline.files)]);
  const operations = [...paths]
    .sort((left, right) => left.localeCompare(right))
    .map((relativePath) => operationFor(relativePath, source.get(relativePath), installed.get(relativePath), baseline.files[relativePath]));
  return { sourceRoot, installRoot, baselinePath: options.baselinePath, source, installed, baseline, operations };
}

async function writeAtomically(path: string, content: Buffer | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, path);
}

export async function applySkillSyncPlan(plan: SkillSyncPlan, options: ApplySkillSyncOptions = {}): Promise<SkillSyncReport> {
  const applied: string[] = [];
  const skipped: string[] = [];
  const conflicted: string[] = [];
  const unchanged: string[] = [];
  const preserved: string[] = [];
  const nextBaseline: Record<string, string> = { ...plan.baseline.files };
  for (const operation of plan.operations) {
    if (operation.kind === "unchanged") {
      unchanged.push(operation.relativePath);
      if (operation.source) {
        nextBaseline[operation.relativePath] = operation.source.sha256;
      }
      continue;
    }
    if (operation.kind === "preserve") {
      preserved.push(operation.relativePath);
      continue;
    }
    if (options.dryRun) {
      if (operation.kind === "conflict") {
        conflicted.push(operation.relativePath);
      }
      continue;
    }
    let allowed = operation.kind !== "conflict";
    if (operation.kind === "conflict") {
      allowed = (await options.confirm?.(operation)) ?? false;
    }
    if (!allowed) {
      skipped.push(operation.relativePath);
      if (operation.kind === "conflict") {
        conflicted.push(operation.relativePath);
      }
      continue;
    }
    const target = join(plan.installRoot, operation.relativePath);
    if (operation.kind === "delete") {
      await rm(target, { force: true });
      delete nextBaseline[operation.relativePath];
    } else if (operation.source) {
      await writeAtomically(target, operation.source.content);
      nextBaseline[operation.relativePath] = operation.source.sha256;
    }
    applied.push(operation.relativePath);
  }
  if (!options.dryRun && plan.baselinePath) {
    await writeAtomically(plan.baselinePath, `${JSON.stringify({ version: 1, files: nextBaseline }, null, 2)}\n`);
  }
  return { applied, skipped, conflicted, unchanged, preserved, dryRun: options.dryRun === true };
}

function repositoryLooksValid(path: string): boolean {
  try {
    const packageJson = JSON.parse(requireFile(path, "package.json")) as unknown;
    return isRecord(packageJson) && packageJson.name === "top-articles";
  } catch {
    return false;
  }
}

function requireFile(root: string, fileName: string): string {
  return readFileSync(join(root, fileName), "utf8");
}

function gitRoot(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export function discoverRepositoryRoot(options: RepositoryDiscoveryOptions = {}): string {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const currentGitRoot = gitRoot(cwd);
  if (currentGitRoot && repositoryLooksValid(currentGitRoot)) {
    return resolve(currentGitRoot);
  }
  if (repositoryLooksValid(cwd)) {
    return cwd;
  }
  const explicit = env.TOP_ARTICLES_REPO;
  const candidates = [explicit, ...(options.candidates ?? DEFAULT_REPOSITORY_CANDIDATES)].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (repositoryLooksValid(resolved)) {
      return resolved;
    }
  }
  throw new Error(`Geen geldige top-articles-repository gevonden. Gebruik TOP_ARTICLES_REPO of --repo; gecontroleerd vanaf ${cwd}.`);
}
