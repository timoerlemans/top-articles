# Readwise Skills Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repository the reproducible source for the ten managed Readwise skills and provide safe, testable `skills:sync` and `skills:check` workflows.

**Architecture:** Repository skill folders contain the complete managed skill documents and agent metadata, while a central reference points skills to existing repository contracts. A pure sync module discovers the canonical repository, compares per-file hashes with an installation baseline, produces dry-run diffs, and applies only confirmed updates. A read-only checker validates source metadata, known commands, central contracts, and optional installed drift.

**Tech Stack:** Strict TypeScript, Node.js built-ins, `node:test`, existing `tsc`/ESLint; no new dependencies.

**Spec:** GitHub issue #34, “Readwise-tag reproduceerbaar installeren en skill-drift controleren”.

## Global Constraints

- Manage exactly the nine existing Readwise skills plus `readwise-priority-sync`; preserve unrelated local skills and files.
- Use repository code, README, AGENTS.md, CONTEXT.md, schemas, and approved reading preferences as the authority; do not duplicate scoring logic in skill text.
- `skills:sync --dry-run` writes neither installed files nor the installation baseline.
- Conflicts are per managed file; non-interactive or unconfirmed conflicts remain untouched and are reported.
- Tagging preserves administrative, curation, and position tags; the maximum of three applies only to content tags.
- No live Reader writes, global installation, or generated data changes in tests.

## Review Focus

- First installation with a pre-existing local skill file: the file remains untouched until explicit confirmation.
- A locally edited file after a prior sync: repository changes show a diff and cannot silently overwrite it.
- A removed repository file: an installed file is removed only when it still matches the recorded baseline.
- Incomplete or primitive Reader tag representations: skill guidance must use add/remove or fail closed, never replace with an incomplete full set.
- Running from the vault or another checkout: repository discovery must resolve the valid worktree, `TOP_ARTICLES_REPO`, or the documented default without relying on a relative install path.

### Task 1: Add red contract tests for discovery, sync, and checking

**Files:**
- Create: `test/skill-sync.test.ts`
- Create: `test/skill-check.test.ts`

**Interfaces:** Tests define the expected pure interfaces for repository discovery, file snapshots, dry-run planning, conflict decisions, baseline persistence, and source checking. Tests use temporary directories and injected paths/confirmers.

- [ ] **Step 1: Write tests for complete managed-file snapshots and repository discovery.** Assert all ten managed skill names are discovered, nested resources and `agents/openai.yaml` are included, current worktree wins, `TOP_ARTICLES_REPO` is used when supplied, and an invalid candidate produces an actionable error.
- [ ] **Step 2: Write tests for dry-run and baseline-aware conflict classification.** Cover missing files, identical files, clean updates, local edits after a baseline, first-install conflicts, safe repository deletions, and locally modified deletions. Assert dry-run produces proposed diffs but no target or baseline writes.
- [ ] **Step 3: Write tests for explicit conflict decisions and report accounting.** Assert only confirmed files are written, skipped conflicts remain byte-identical, unmanaged directories/files remain, and the baseline records exactly applied source hashes.
- [ ] **Step 4: Write tests for source checks and optional installed drift.** Assert required metadata/resources, central reference anchors, known command vocabulary, and warnings for a missing installation. Assert `skills:check` performs no writes.
- [ ] **Step 5: Run the focused tests and verify they fail for missing interfaces.** Run `npm run compile && node --test dist/test/skill-sync.test.js dist/test/skill-check.test.js`; expected failure is missing modules/exports, not a passing stub.

### Task 2: Add the managed repository skill source and central reference

**Files:**
- Create: `skills/readwise-cli/SKILL.md`, `skills/readwise-enrich/SKILL.md`, `skills/readwise-inbox/SKILL.md`, `skills/readwise-priority-judge/SKILL.md`, `skills/readwise-reorder/SKILL.md`, `skills/readwise-summarize/SKILL.md`, `skills/readwise-tag/SKILL.md`, `skills/readwise-triage/SKILL.md`, `skills/readwise-book-study/SKILL.md`, `skills/readwise-priority-sync/SKILL.md`
- Create: `skills/readwise-reference.md`
- Create: `skills/readwise-*/agents/openai.yaml`

**Interfaces:** Skill text references `skills/readwise-reference.md` and the existing repository contracts; the sync/check modules treat the ten directories as the managed source map.

- [ ] **Step 1: Copy the current nine source skills into versioned repository folders and add agent metadata.** Preserve existing useful resources while incorporating the current v2 profiles, evidence/fallback rules, full-source/target-page gates, deduplication, resumability, feedback preservation, and no-live-write safety contracts.
- [ ] **Step 2: Add `readwise-priority-sync` with inspect, local plan/apply/verify, and explicitly requested workflow-dispatch modes.** Require the canonical priority engine and exact plan confirmation; keep `readwise-reorder` limited to manual reprioritization and referrals.
- [ ] **Step 3: Add the central operational reference.** Link taxonomy, family/sequence definitions, score and tag contracts, judgment/profile schemas, API command discovery, README/AGENTS/CONTEXT, and `config/readwise-reading-preferences.md` without copying a second scoring engine or changing personal preferences.
- [ ] **Step 4: Update tag and enrichment guidance.** Make canonical alias normalization explicit, preserve all non-content tags, limit three only to content tags, and require inspection of each document's result.

### Task 3: Implement pure skill snapshot, sync, and check modules

**Files:**
- Create: `scripts/lib/skill-sync.ts`
- Create: `scripts/lib/skill-check.ts`

**Interfaces:** Export typed functions for `MANAGED_READWISE_SKILLS`, `discoverRepositoryRoot`, `snapshotSkillSource`, `buildSkillSyncPlan`, `applySkillSyncPlan`, and `checkSkillRepository`. Keep filesystem operations injectable through explicit paths and no shell-dependent writes.

- [ ] **Step 1: Implement repository and installation discovery.** Resolve a valid current Git worktree, then `TOP_ARTICLES_REPO`, then documented standard paths; reject repositories without `package.json` and the managed skill source.
- [ ] **Step 2: Implement deterministic recursive snapshots and per-file SHA-256 hashes.** Preserve relative paths and binary-safe bytes; classify source/installed files against the previous baseline, including safe deletions.
- [ ] **Step 3: Implement dry-run planning and unified text diffs.** Ensure planning is pure with respect to target and baseline paths and reports exact added, updated, deleted, unchanged, conflicted, and skipped files.
- [ ] **Step 4: Implement confirmed application and baseline persistence.** Apply only safe files or explicitly confirmed conflicts, preserve unmanaged content, write atomically, and update the baseline only for resulting source state.
- [ ] **Step 5: Implement read-only source checks and optional installed drift checks.** Validate skill frontmatter, agent metadata, required reference anchors, known CLI/MCP command names, and absent/changed installed files without changing anything.
- [ ] **Step 6: Re-run the focused tests and verify green.** Run the two focused compiled test files and inspect the exact report assertions.

### Task 4: Wire CLI commands, documentation, and final verification

**Files:**
- Create: `scripts/skills-cli.ts`
- Modify: `package.json`, `README.md`, `AGENTS.md`
- Test: `test/skill-sync-cli.test.ts`

**Interfaces:** CLI supports `skills:sync [--dry-run] [--repo] [--install-dir] [--baseline] [--yes] [--non-interactive]` and `skills:check [--repo] [--install-dir] [--compare-installed]`; default check excludes machine-dependent installation comparison.

- [ ] **Step 1: Write CLI subprocess tests.** Assert dry-run output includes diffs and no writes, non-interactive conflicts are refused, explicit input/`--yes` applies selected conflicts, and check returns warnings/errors with no writes.
- [ ] **Step 2: Implement the CLI and npm scripts.** Use readline only for interactive conflicts, fail clearly on invalid discovery, and report applied/skipped/conflicted files exactly.
- [ ] **Step 3: Document invocation from Top Articles and the vault.** Add examples for discovery overrides, dry-run, conflict confirmation, optional installed comparison, and the separate scenario-review limitation.
- [ ] **Step 4: Run focused tests, then `npm run check`.** Confirm no generated browser data or unrelated user files changed.
- [ ] **Step 5: Commit only issue #34 files, push `main`, re-read GitHub issue/subissue status, and close #34 only after all acceptance criteria are evidenced.**
