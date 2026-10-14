import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MANAGED_READWISE_SKILLS,
  buildSkillSyncPlan,
  snapshotSkillSource,
  type SkillSnapshot,
} from "./skill-sync.js";

export interface SkillCheckOptions {
  readonly repositoryRoot: string;
  readonly installRoot?: string;
  readonly compareInstalled?: boolean;
}

export interface SkillCheckResult {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly drift: readonly string[];
  readonly checkedSkills: number;
  readonly checkedFiles: number;
}

const KNOWN_CLI_COMMANDS = new Set([
  "login",
  "login-with-token",
  "reader-search-documents",
  "reader-list-documents",
  "reader-get-document-details",
  "reader-get-document-highlights",
  "reader-create-highlight",
  "reader-create-document",
  "reader-move-documents",
  "reader-bulk-edit-document-metadata",
  "reader-list-tags",
  "reader-add-tags-to-document",
  "reader-remove-tags-from-document",
  "reader-add-tags-to-highlight",
  "reader-remove-tags-from-highlight",
  "reader-set-highlight-notes",
  "reader-export-documents",
  "reader-get-export-documents-status",
  "readwise-search-highlights",
  "readwise-list-highlights",
  "readwise-create-highlights",
  "readwise-update-highlight",
  "readwise-delete-highlight",
  "readwise-get-daily-review",
]);

const KNOWN_MCP_OPERATIONS = new Set([
  "reader_search_documents",
  "reader_list_documents",
  "reader_get_document_details",
  "reader_get_document_highlights",
  "reader_create_highlight",
  "reader_create_document",
  "reader_move_documents",
  "reader_bulk_edit_document_metadata",
  "reader_list_tags",
  "reader_add_tags_to_document",
  "reader_remove_tags_from_document",
  "reader_add_tags_to_highlight",
  "reader_remove_tags_from_highlight",
  "reader_set_highlight_notes",
  "reader_export_documents",
  "reader_get_export_documents_status",
]);

const REFERENCE_ANCHORS = [
  "SEQUENCE_ORDER",
  "FAMILY_DEFINITIONS",
  "readwise-priority-v8",
  "config/readwise-reading-preferences.md",
  "want-to-read",
  "reader-bulk-edit-document-metadata",
  "V2 verrijkingscontract",
  "bronstatus",
  "pipeline-managed",
  "Runmanifest",
  "doelpagina",
] as const;

const ENRICHMENT_SKILL_CONTRACTS: Readonly<Record<string, readonly string[]>> = {
  "readwise-enrich": ["V2 verrijkingscontract", "complete available source", "source_status", "run manifest", "ownership-unknown"],
  "readwise-summarize": ["V2 verrijkingscontract", "complete available source", "source_status", "run manifest", "ownership-unknown"],
  "readwise-book-study": ["V2 verrijkingscontract", "complete book evidence", "bronstatus", "manifest", "ownership-unknown"],
};

const OBSOLETE_ENRICHMENT_PATTERNS: Readonly<Record<string, readonly RegExp[]>> = {
  "readwise-enrich": [/tien (?:volledige )?(?:afzonderlijke )?(?:scan)?passes/i, /highlight_passes_completed/i, /scanpass-gate/i],
  "readwise-summarize": [/notes replaces any existing note/i, /skip it silently/i],
  "readwise-book-study": [],
};

function frontmatterValue(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
}

function commandsIn(content: string): { cli: string[]; mcp: string[] } {
  const cli = [...content.matchAll(/(?:^|\n)\s*readwise\s+([a-z][a-z0-9-]*)/gi)].map((match) => match[1] ?? "");
  const mcp = [...content.matchAll(/mcp__readwise__([a-z][a-z0-9_]*)/gi)].map((match) => match[1] ?? "");
  return { cli, mcp };
}

async function checkSkillMetadata(
  sourceRoot: string,
  skill: string,
  errors: string[],
): Promise<number> {
  const skillRoot = join(sourceRoot, skill);
  const skillPath = join(skillRoot, "SKILL.md");
  const metadataPath = join(skillRoot, "agents", "openai.yaml");
  let content: string;
  try {
    content = await readFile(skillPath, "utf8");
  } catch {
    errors.push(`${skill}: SKILL.md ontbreekt.`);
    return 0;
  }
  if (!content.startsWith("---\n") || !content.includes("\n---\n")) {
    errors.push(`${skill}: SKILL.md mist geldige frontmatter.`);
  }
  if (frontmatterValue(content, "name") !== skill) {
    errors.push(`${skill}: frontmatter name komt niet overeen met de mapnaam.`);
  }
  if (!frontmatterValue(content, "description")) {
    errors.push(`${skill}: frontmatter description ontbreekt.`);
  }
  if (!content.includes("<repository>/skills/readwise-reference.md")) {
    errors.push(`${skill}: geïnstalleerde kopie verwijst niet expliciet naar de centrale repository-reference.`);
  }
  if (!content.includes("TOP_ARTICLES_REPO") || !content.includes("/mnt/c/dev/top-articles")) {
    errors.push(`${skill}: repository-discovery via worktree, TOP_ARTICLES_REPO en standaardlocatie ontbreekt.`);
  }
  for (const anchor of ENRICHMENT_SKILL_CONTRACTS[skill] ?? []) {
    if (!content.includes(anchor)) {
      errors.push(`${skill}: V2-verrijkingscontract mist: ${anchor}.`);
    }
  }
  for (const pattern of OBSOLETE_ENRICHMENT_PATTERNS[skill] ?? []) {
    if (pattern.test(content)) {
      errors.push(`${skill}: verouderde verrijkingsinstructie gevonden: ${pattern.source}.`);
    }
  }
  try {
    const metadata = await readFile(metadataPath, "utf8");
    if (!/^interface:\s*$/m.test(metadata) || !/^\s+display_name:\s*\S+/m.test(metadata) || !/^\s+short_description:\s*\S+/m.test(metadata)) {
      errors.push(`${skill}: agents/openai.yaml mist interface metadata.`);
    }
  } catch {
    errors.push(`${skill}: agents/openai.yaml ontbreekt.`);
  }
  const commands = commandsIn(content);
  for (const command of commands.cli) {
    if (!KNOWN_CLI_COMMANDS.has(command)) {
      errors.push(`${skill}: onbekend readwise-CLI-commando: ${command}.`);
    }
  }
  for (const operation of commands.mcp) {
    if (!KNOWN_MCP_OPERATIONS.has(operation)) {
      errors.push(`${skill}: onbekende Readwise MCP-operatie: ${operation}.`);
    }
  }
  return 2;
}

function compareInstalled(source: SkillSnapshot, installed: SkillSnapshot): string[] {
  const drift: string[] = [];
  for (const [relativePath, sourceFile] of source) {
    if (installed.get(relativePath)?.sha256 !== sourceFile.sha256) {
      drift.push(relativePath);
    }
  }
  return drift.sort((left, right) => left.localeCompare(right));
}

export async function checkSkillRepository(options: SkillCheckOptions): Promise<SkillCheckResult> {
  const sourceRoot = join(options.repositoryRoot, "skills");
  const errors: string[] = [];
  const warnings: string[] = [];
  const drift: string[] = [];
  const checkedSkills = MANAGED_READWISE_SKILLS.length;
  let checkedFiles = 0;

  let sourceSnapshot: SkillSnapshot | undefined;
  try {
    sourceSnapshot = await snapshotSkillSource(sourceRoot);
    checkedFiles = sourceSnapshot.size;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Managed Readwise-skillbron kon niet worden gelezen.");
  }

  for (const skill of MANAGED_READWISE_SKILLS) {
    checkedFiles += await checkSkillMetadata(sourceRoot, skill, errors);
  }

  let reference: string;
  try {
    reference = await readFile(join(sourceRoot, "readwise-reference.md"), "utf8");
  } catch {
    reference = "";
    errors.push("readwise-reference.md ontbreekt.");
  }
  for (const anchor of REFERENCE_ANCHORS) {
    if (!reference.includes(anchor)) {
      errors.push(`readwise-reference.md mist canoniek contract: ${anchor}.`);
    }
  }

  if (options.compareInstalled) {
    if (!options.installRoot) {
      errors.push("--compare-installed vereist een installatielocatie.");
    } else {
      if (sourceSnapshot) {
        const plan = await buildSkillSyncPlan({ sourceRoot, installRoot: options.installRoot });
        drift.push(...compareInstalled(plan.source, plan.installed));
      }
      if (drift.length > 0) {
        warnings.push(`${drift.length} geïnstalleerde skillbestanden wijken af van de repository.`);
      }
    }
  } else if (options.installRoot) {
    warnings.push(`Installatievergelijking niet uitgevoerd; gebruik --compare-installed voor ${options.installRoot}.`);
  }
  if (options.installRoot && !options.compareInstalled) {
    try {
      await readFile(join(options.installRoot, "readwise-cli", "SKILL.md"), "utf8");
    } catch {
      warnings.push(`Readwise-skillinstallatie ontbreekt of is niet leesbaar: ${options.installRoot}.`);
    }
  }

  return { errors, warnings, drift, checkedSkills, checkedFiles };
}
