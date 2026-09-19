# Core Interest Prioritization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a versioned core-interest ranking and stacked, evidence-based interest bonus while preserving the existing semantic article score, app explanations, weighted daily mail selection, and safe Readwise tag synchronization.

**Architecture:** Add a focused `core-interest-priority` library that resolves distinct canonical-interest evidence, ranks the fixed manual top-3 plus a deterministic data-derived remainder, and exposes weights and per-article matches. Build `readwise-priority-v7` on top of the validated v6 score so v7 owns the new component and recomputes sequence positions. Migrate all score consumers to v7, then publish the ranking and explanations to browser data and the daily email.

**Tech Stack:** Strict TypeScript, Node's built-in test runner, Zod where existing boundary schemas use it, generated `data/data.js`/`data/score.js`, Readwise CLI integration, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-19-core-interest-prioritization-design.md`

## Global Constraints

- Preserve the existing canonical `DirectDomain` IDs and labels.
- Keep `Agile > ADHD > Filosofie` as the manual anchor order.
- Count each canonical interest at most once per article.
- A single ambiguous evidence unit must not award multiple canonical interests; separate evidence is required for separate domains.
- Stack all independently evidenced interests without a global interest-bonus cap.
- Exclude current Readwise positions, ordinal/top-list tags, highlight count, and highlight provenance from interest ranking and bonus evidence.
- Keep manual document adjustments separate and applicable to every list.
- Keep books exclusive to the book sequence and preserve all existing sequence invariants.
- The build and local priority plan remain tag-read-only until `priority:apply` is explicitly run; the scheduled workflow remains the only automatic Reader-tag mutation.
- The browser contract must accept only the new v7 export once the migration is complete, while tests may continue to validate legacy fixtures where explicitly needed.
- Run TDD for every new behavior: write a failing test, observe the expected failure, implement the minimum, then run the owning test and the full suite.

## Review Focus

- One ambiguous tag maps to multiple vocabularies: it must award only its explicit primary domain unless another independent tag or semantic code supports the other domain. Test this in `test/core-interest-priority.test.ts`.
- Multiple aliases or repeated evidence for one domain: they must deduplicate before scoring. Test this in `test/core-interest-priority.test.ts`.
- A document matches several independently evidenced domains: every distinct domain's configured weight must stack, even when their combined value exceeds a single higher-ranked domain. Test this in `test/readwise-priority-v7.test.ts`.
- A changed manual-order or weight config must invalidate a stale priority plan instead of silently applying it. Test this in `test/priority-tag-plan.test.ts`.
- Generated v7 browser data and the daily email must consume the same ranked interests and match evidence. Test this in `test/generated-priority.test.ts`, `test/priority-ui.test.ts`, and `test/core-interest-email.test.ts`.

## File Map

- Create `config/readwise-core-interest-priorities.json`: versioned manual anchors and initial candidate rank-weight profile.
- Create `scripts/lib/core-interest-priority.ts`: canonical evidence mapping, ranking, weight resolution, and per-document interest matches.
- Create `scripts/lib/readwise-priority-v7.ts`: v7 score/export/validation layer built on v6 content scoring.
- Create `scripts/lib/core-interest-report.ts` and `scripts/core-interest-report.ts`: pure impact-report formatting plus a read-only live-data command.
- Create `test/core-interest-priority.test.ts`, `test/readwise-priority-v7.test.ts`, and `test/core-interest-report.test.ts`.
- Modify `scripts/build-data.ts`, `scripts/priority-cli.ts`, `scripts/lib/priority-tag-plan.ts`, `scripts/lib/priority-report.ts`, and `scripts/lib/archive-plan.ts` to consume v7 and the core-interest config.
- Modify `scripts/lib/core-interest-email.ts` and `scripts/send-core-interest-email.ts` to use weighted interest selection.
- Modify `src/types/browser-data.ts`, `src/app.ts`, `index.html`, and `styles.css` to publish and render the interest ranking and stacked component.
- Modify affected tests, `package.json`, `README.md`, and generated `data/data.js`/`data/score.js` after the live build.

### Task 1: Build the canonical core-interest evidence resolver

**Files:**
- Create: `config/readwise-core-interest-priorities.json`
- Create: `scripts/lib/core-interest-priority.ts`
- Create: `test/core-interest-priority.test.ts`

**Interfaces:**
- Consumes: `DirectDomain`/`DIRECT_DOMAIN_TAGS` from `scripts/lib/readwise-priority-v2.ts`, `PriorityDocument`, `ContentJudgment`, and the existing `judgmentFor`/content-tag normalization.
- Produces:
  - `CoreInterestPriorityConfig` with `version: 1`, `manualOrder: DirectDomain[]`, and a positive `weightByRank: number[]`.
  - `CoreInterestEvidence` with `kind: "readwise-tag" | "semantic-signal"`, `source: string`, and `label: string`.
  - `CoreInterestMatch` with `interest: DirectDomain`, `evidence: CoreInterestEvidence[]`, and `qualityScore: number`.
  - `CoreInterestPriorityEntry` with `interest`, `label`, `rank`, `weight`, `source: "manual" | "derived"`, `evidenceDocumentCount`, and `evidenceScore`.
  - `CoreInterestPriority` with `version`, `order`, `entries`, `weights`, and `generatedAt`.
  - `resolveCoreInterestMatches(doc, judgment): CoreInterestMatch[]`.
  - `buildCoreInterestPriority(documents, judgments, config, generatedAt): CoreInterestPriority`.
  - `coreInterestBonus(matches, priority): { bonus: number; matches: Array<CoreInterestMatch & { weight: number }> }`.

- [ ] **Step 1: Write failing tests for evidence deduplication and the ambiguous-tag rule.**

  Add fixtures with these exact expectations:

  ```typescript
  const oneAmbiguousTag = document({ tags: { "political philosophy": {} } });
  assert.deepEqual(resolveCoreInterestMatches(oneAmbiguousTag, semanticJudgment(oneAmbiguousTag)), [
    { interest: "filosofie", evidence: [{ kind: "readwise-tag", source: "political philosophy", label: "politieke filosofie" }], qualityScore: 0 },
  ]);

  const twoIndependentSignals = document({ tags: { philosophy: {}, "political ideologies": {} } });
  assert.deepEqual(
    resolveCoreInterestMatches(twoIndependentSignals, semanticJudgment(twoIndependentSignals)).map(({ interest }) => interest),
    ["filosofie", "ideologie"],
  );

  const duplicateAliases = document({ tags: { philosophy: {}, "critical thinking & epistemology": {} } });
  assert.equal(resolveCoreInterestMatches(duplicateAliases, semanticJudgment(duplicateAliases)).filter(({ interest }) => interest === "filosofie").length, 1);
  ```

- [ ] **Step 2: Run the focused test and verify it fails because the resolver does not exist.**

  Run: `npm run compile && node --test dist/test/core-interest-priority.test.js`

  Expected: compile/test failure identifying the missing `core-interest-priority` implementation or exported resolver.

- [ ] **Step 3: Implement the normalized, explicit evidence mapping.**

  Keep the existing `DirectDomain` IDs. Define an explicit primary mapping for every overlapping vocabulary token, including `political philosophy`, and a semantic-signal mapping for the accepted `interest:*` codes. Normalize aliases before matching, deduplicate evidence by `(kind, normalized source)`, and only emit a domain when it has its own evidence unit. Use `judgmentFor` to ignore stale judgments and use the accepted judgment's `reasonCodes` for semantic evidence.

  Compute per-document `qualityScore` as the existing semantic content quality without the new interest bonus:

  ```typescript
  qualityScore = judgment.relevance * 10
    + judgment.substance * 8
    + judgment.durability * 5
    + judgment.usefulness * 5;
  ```

- [ ] **Step 4: Add failing tests for manual anchors, derived ordering, and rank weights.**

  Assert that `agile`, `adhd`, and `filosofie` always occupy ranks 1–3 in that order, that the remaining domains are sorted by the deterministic evidence score, that a tie uses the domain ID, and that invalid configs reject duplicate/unknown manual IDs or non-positive weights.

- [ ] **Step 5: Implement deterministic interest ranking and stacked bonus resolution.**

  For each non-anchored domain, aggregate only unique documents with independent evidence. Rank by the sum of the ten highest `qualityScore` values plus `2 * min(uniqueEvidenceDocumentCount, 10)`; ties use the stable domain ID. Assign `weightByRank[rank - 1]` and reject a missing rank weight. The initial config must contain twelve descending positive weights beginning with `[20, 16, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2]` so the impact report has a concrete baseline.

  `coreInterestBonus` must sum every distinct matched domain's weight and preserve each match's evidence for later UI/report use.

- [ ] **Step 6: Run the focused resolver tests and verify they pass.**

  Run: `npm run compile && node --test dist/test/core-interest-priority.test.js`

  Expected: all resolver, deduplication, ambiguity, ranking, config-validation, and stacking tests pass.

- [ ] **Step 7: Commit the resolver as an independently testable unit.**

  ```bash
  git add config/readwise-core-interest-priorities.json scripts/lib/core-interest-priority.ts test/core-interest-priority.test.ts
  git commit -m "feat: add core interest evidence ranking"
  ```

### Task 2: Add the v7 score/export model

**Files:**
- Create: `scripts/lib/readwise-priority-v7.ts`
- Create: `test/readwise-priority-v7.test.ts`

**Interfaces:**
- Consumes: `scorePriorityDocument` and v6 types from `scripts/lib/readwise-priority-v6.ts`, sequence comparison/tie-break behavior from the existing v5/v6 implementation, and Task 1's `CoreInterestPriority` APIs.
- Produces: v7 `PriorityComponents` with `kerninteresse`, v7 `PriorityScoreResult` with `coreInterestMatches`, v7 `PriorityExport` with top-level `coreInterestPriority`, and `buildPriorityExport`/`validatePriorityExport` compatible with the existing tag-plan consumer shape.

- [ ] **Step 1: Write failing v7 tests for score stacking and sequence positions.**

  Create a labeled fixture whose independent evidence matches Agile, ADHD, and Filosofie. Assert that `components.kerninteresse` equals the sum of the three configured weights, `score` equals the v6 score plus that bonus, and the same bonus is used in `sequenceScores`. Create a second fixture with one Agile match and assert that the three-match article scores higher even when its v6 content score is equal.

- [ ] **Step 2: Run the focused v7 test and verify it fails before the v7 module exists.**

  Run: `npm run compile && node --test dist/test/readwise-priority-v7.test.js`

  Expected: compile/test failure for the missing v7 module or exports.

- [ ] **Step 3: Implement v7 by reusing v6 document scoring and recomputing positions.**

  Score every document with v6 first, resolve the shared core-interest ranking once, add `kerninteresse` to `baseScore`, `score`, `components`, and `rationale`, preserve the document adjustment fields, and recompute all sequence scores/positions with the existing saved-date and document-ID tie-break. Do not call v6's final export builder after changing scores, because that would leave stale positions.

  Set `PRIORITY_MODEL = "readwise-priority-v7"`, validate all v7 item fields and top-level interest metadata, and retain the existing book-only and contiguous-position invariants. The v7 validator must independently rebuild the expected output from source documents, overrides, judgments, and the core-interest config.

- [ ] **Step 4: Add failing tests for v7 validation and unchanged non-interest behavior.**

  Assert that a tampered `coreInterestBonus`, item position, or top-level interest ranking is rejected. Assert that a document with no core-interest evidence has `kerninteresse: 0` and otherwise matches the v6 score components and adjustment.

- [ ] **Step 5: Implement v7 validation and export metadata.**

  Include `coreInterestPriority` at the top level and per-document `coreInterestMatches` with interest, weight, and evidence. Keep technical reason codes out of browser-facing rationale strings; the structured evidence is the source for the UI.

- [ ] **Step 6: Run the focused v7 tests and the existing priority tests.**

  Run: `npm run compile && node --test dist/test/readwise-priority-v7.test.js dist/test/readwise-priority-v6.test.js dist/test/priority-tag-plan.test.js`

  Expected: all new v7 tests pass; v6 unit tests remain green as a historical compatibility suite; tag-plan tests pass against the current v6 consumer until Task 3 migrates them.

- [ ] **Step 7: Commit the v7 score model.**

  ```bash
  git add scripts/lib/readwise-priority-v7.ts test/readwise-priority-v7.test.ts
  git commit -m "feat: add stacked core interest priority score"
  ```

### Task 3: Migrate generation, tag planning, reports, and archive protection to v7

**Files:**
- Modify: `scripts/build-data.ts`
- Modify: `scripts/priority-cli.ts`
- Modify: `scripts/lib/priority-tag-plan.ts`
- Modify: `scripts/lib/priority-report.ts`
- Modify: `scripts/lib/archive-plan.ts`
- Test: `test/priority-tag-plan.test.ts`, `test/priority-report.test.ts`, `test/archive-plan.test.ts`, `test/generated-priority.test.ts`, `test/score-script.test.ts`

**Interfaces:**
- Consumes: v7 exports and `config/readwise-core-interest-priorities.json`.
- Produces: all generated data, tag plans, archive plans, and comparison reports use `readwise-priority-v7`; tag-plan source fingerprints include the core-interest config so a changed mapping/order/weight invalidates a stale plan.

- [ ] **Step 1: Write failing migration assertions.**

  Update tests to expect `readwise-priority-v7`, assert that generated priority data contains top-level core-interest ranking and item matches, and add a plan-freshness test that changes the core-interest config and expects `priority:apply`/fresh-plan validation to reject the old fingerprint.

- [ ] **Step 2: Run the migration tests and verify they fail against v6 imports/contracts.**

  Run: `npm run compile && node --test dist/test/priority-tag-plan.test.js dist/test/priority-report.test.js dist/test/archive-plan.test.js dist/test/generated-priority.test.js dist/test/score-script.test.js`

  Expected: failures on the old model string or missing v7 metadata.

- [ ] **Step 3: Migrate all score consumers to v7.**

  Load and validate the new config in `build-data.ts`, `priority-cli.ts`, `priority-tag-plan.ts`, `priority-report.ts`, and `archive-plan.ts`. Pass the same config into every v7 build. Update archive/tag plan model types and validators.

- [ ] **Step 4: Include core-interest configuration in tag/archive source fingerprints.**

  Hash the normalized config/mapping input alongside documents and overrides. A plan created before a core-interest config change must fail the existing live source-fingerprint check rather than silently applying stale positions.

- [ ] **Step 5: Run the migrated focused tests.**

  Run: `npm run compile && node --test dist/test/priority-tag-plan.test.js dist/test/priority-report.test.js dist/test/archive-plan.test.js dist/test/generated-priority.test.js dist/test/score-script.test.js`

  Expected: all listed tests pass with v7 contracts and stale-config protection.

- [ ] **Step 6: Commit the pipeline migration.**

  ```bash
  git add scripts/build-data.ts scripts/priority-cli.ts scripts/lib/priority-tag-plan.ts scripts/lib/priority-report.ts scripts/lib/archive-plan.ts test/priority-tag-plan.test.ts test/priority-report.test.ts test/archive-plan.test.ts test/generated-priority.test.ts test/score-script.test.ts
  git commit -m "refactor: route priority consumers through v7"
  ```

### Task 4: Add the read-only interest impact report

**Files:**
- Create: `scripts/lib/core-interest-report.ts`
- Create: `scripts/core-interest-report.ts`
- Create: `test/core-interest-report.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: current live `later` documents, v6/v7 score results, core-interest rankings, and `FAMILY_DEFINITIONS`.
- Produces: deterministic JSON/Markdown report with interest order, weights, score deltas, per-sequence entries/exits, and largest movers; it never calls a Readwise mutation command.

- [ ] **Step 1: Write failing pure report tests.**

  Use two in-memory exports with three documents and assert that the report lists manual/derived interest ranks, stacked bonuses, score deltas, and sequence entries/exits in stable order. Assert that the Markdown contains no current-position-derived interest score claim.

- [ ] **Step 2: Run the focused report test and observe the expected missing-module failure.**

  Run: `npm run compile && node --test dist/test/core-interest-report.test.js`

  Expected: failure because the report module does not yet exist.

- [ ] **Step 3: Implement pure report generation.**

  Compare v6 base/current results with v7 candidates, summarize the full core-interest ranking and candidate weights, calculate per-sequence top-100 entry/exit sets, and sort all output deterministically by sequence, score delta, and document ID. Include the rule that Readwise positions are comparison output only, never interest evidence.

- [ ] **Step 4: Implement the CLI wrapper.**

  Fetch `later` documents read-only through the existing requester pattern, load judgments/overrides/core-interest config, build v6 and v7 exports, write `.tmp/readwise/core-interest-impact.json` and `.tmp/readwise/core-interest-impact.md`, and print paths plus summary counts. Add `priority:interest-report` to `package.json`.

- [ ] **Step 5: Run the report tests and commit.**

  Run: `npm run compile && node --test dist/test/core-interest-report.test.js`

  Expected: all report assertions pass.

  ```bash
  git add scripts/lib/core-interest-report.ts scripts/core-interest-report.ts test/core-interest-report.test.ts package.json
  git commit -m "feat: add core interest impact report"
  ```

### Task 5: Publish and render v7 core-interest data in the app

**Files:**
- Modify: `src/types/browser-data.ts`
- Modify: `src/app.ts`
- Modify: `index.html`
- Modify: `styles.css`
- Test: `test/priority-ui.test.ts`, `test/generated-priority.test.ts`

**Interfaces:**
- Consumes: v7 `coreInterestPriority`, item `coreInterestMatches`, and existing article catalog `coreInterests`.
- Produces: a browser-safe typed contract and readable UI; technical reason codes never appear in the rendered score explanation.

- [ ] **Step 1: Write failing browser-contract and source/UI tests.**

  Add a v7 fixture requiring top-level interest entries, item `coreInterestBonus`, and per-match evidence. Add source assertions for the `Kerninteresses` ranking block, stacked `kerninteresse` component, manual/derived labels, and an article explanation that lists every matched interest and its weight.

- [ ] **Step 2: Run the focused UI tests and observe failure against the v6 contract.**

  Run: `npm run compile && node --test dist/test/priority-ui.test.js dist/test/generated-priority.test.js`

  Expected: failure on the missing v7 model/fields and UI strings.

- [ ] **Step 3: Extend browser types and runtime parsers.**

  Import `DirectDomain` from the canonical model, define browser-safe `CoreInterestPriorityEntry`, `CoreInterestPriority`, `CoreInterestMatch`, and add `kerninteresse`/`coreInterestMatches` to `PriorityItem`. Accept only `readwise-priority-v7` for the current contract and validate all structured numeric/string fields.

- [ ] **Step 4: Add the dynamic core-interest ranking panel.**

  Add a dedicated `id="core-interest-priorities"` container in `index.html` inside the priority view. In `src/app.ts`, render rank, label, weight, manual/derived source, document coverage, and evidence score from `TOP_ARTICLE_PRIORITY.coreInterestPriority`. Keep the panel hidden when priority data is unavailable.

- [ ] **Step 5: Add the stacked article explanation.**

  Extend the existing priority accordion with a `Kerninteresses` component. Show the total bonus and one line per structured match, use Dutch labels/evidence, hide zero components, and preserve the readable position/synchronization wording already introduced in the previous UI change. Do not reconstruct or print raw `reasonCodes`.

- [ ] **Step 6: Style the panel and component for desktop/mobile.**

  Add focused classes for ranking rows, weight badges, evidence text, and stacked component lines. Ensure the existing responsive layout and dark-mode variables remain valid.

- [ ] **Step 7: Run focused browser tests and commit.**

  Run: `npm run compile && node --test dist/test/priority-ui.test.js dist/test/generated-priority.test.js`

  Expected: all browser contract, generated-data, and readable-UI assertions pass.

  ```bash
  git add src/types/browser-data.ts src/app.ts index.html styles.css test/priority-ui.test.ts test/generated-priority.test.ts
  git commit -m "feat: show core interest priorities in the app"
  ```

### Task 6: Use the same priority in the daily core-interest email

**Files:**
- Modify: `scripts/lib/core-interest-email.ts`
- Modify: `scripts/send-core-interest-email.ts`
- Test: `test/core-interest-email.test.ts`

**Interfaces:**
- Consumes: v7 top-level `CoreInterestPriority` and article matches.
- Produces: deterministic weighted interest selection that preserves daily variation and uses the existing candidate/position constraints.

- [ ] **Step 1: Write failing tests for weighted selection.**

  Assert that a fixed random value selects from the configured weighted ranges, that an article with multiple interests is eligible for each independently, that an interest with no eligible article is removed before weighting, and that the same date/random seed remains deterministic.

- [ ] **Step 2: Run the focused email tests and verify the old uniform selection fails the new expectations.**

  Run: `npm run compile && node --test dist/test/core-interest-email.test.js`

  Expected: failure because selection currently chooses uniformly over available interests and does not consume v7 weights.

- [ ] **Step 3: Implement weighted selection and update the sender schema.**

  Add the ranked interest priority to `CoreInterestCandidate`/selection input, weight only interests with eligible candidates, preserve deterministic random selection, and keep the selected article's existing best-position and under-15-minute constraints. Extend the generated score schema to validate the top-level v7 priority metadata.

- [ ] **Step 4: Run focused email tests and commit.**

  Run: `npm run compile && node --test dist/test/core-interest-email.test.js`

  Expected: all weighted-selection and regression tests pass.

  ```bash
  git add scripts/lib/core-interest-email.ts scripts/send-core-interest-email.ts test/core-interest-email.test.ts
  git commit -m "feat: weight daily core interest email selection"
  ```

### Task 7: Generate live data, update documentation, and verify the complete feature

**Files:**
- Modify: `README.md`
- Modify: `test/score-script.test.ts`, `test/generated-priority.test.ts`, and any migration tests exposed by the live v7 export.
- Generate: `data/data.js`, `data/score.js`, `dist/src/app.js`, `dist/src/types/browser-data.js` via the existing build/compile commands.

**Interfaces:**
- Consumes: all prior task outputs plus the authenticated Readwise `later` library and accepted judgment config.
- Produces: committed browser data, an impact report, and a verified v7 build ready for the existing scheduled workflows.

- [ ] **Step 1: Update README score/model documentation.**

  Document v7, `config/readwise-core-interest-priorities.json`, the stacked evidence rule, `npm run priority:interest-report`, and the fact that ordinary builds do not mutate Reader tags.

- [ ] **Step 2: Run the read-only interest impact report.**

  Run: `npm run priority:interest-report`

  Expected: `.tmp/readwise/core-interest-impact.json` and `.tmp/readwise/core-interest-impact.md` are written without any Reader mutation command; the report starts with Agile, ADHD, and Filosofie in that order and includes the candidate weight table.

- [ ] **Step 3: Review the generated impact report internally and lock the initial weights.**

  Confirm the report has no unresolved evidence collisions, that every canonical interest appears exactly once, and that score/sequence deltas are finite. If a weight or mapping correction is needed, update the versioned config/mapping, add a failing regression test first, rerun the report, and record the decision in the execution ledger.

- [ ] **Step 4: Run the live build.**

  Run: `npm run build`

  Expected: the authenticated Readwise `later` fetch completes, `data/data.js` and `data/score.js` contain the same `generatedAt`, both expose v7, all catalog articles have consistent `coreInterests`, and no Reader write command runs.

- [ ] **Step 5: Run the full verification suite.**

  Run: `npm run check`

  Expected: lint, strict typecheck, and all tests pass with zero failures.

- [ ] **Step 6: Run live priority verification without applying tags.**

  Run: `npm run priority:plan -- --output .tmp/readwise/core-interest-priority-plan.json`

  Expected: a read-only plan is written with the new v7 positions and a summary of pending tag operations; no Reader write command runs. If the plan has zero operations, also run `npm run priority:verify`. Do not run `priority:apply` in this task without a separate explicit plan-hash approval.

- [ ] **Step 7: Commit the generated data and documentation.**

  ```bash
  git add README.md data/data.js data/score.js dist/src/app.js dist/src/types/browser-data.js test/score-script.test.ts test/generated-priority.test.ts
  git commit -m "feat: activate core interest priority model"
  ```

- [ ] **Step 8: Final verification and handoff.**

  Run: `git status --short --branch && git log -1 --oneline --decorate`

  Expected: only intentionally committed changes remain, the branch is clean, and the final commit contains the v7 app data/model. Report the impact report paths, test count, current Reader verification status, and explicitly state whether tag application was performed.
