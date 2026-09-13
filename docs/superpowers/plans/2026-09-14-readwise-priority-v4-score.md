# Readwise Priority v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bucketed, capped Readwise priority score with a linear explicit-core-interest score while preserving the other useful signals, then regenerate, publish, and synchronize the result.

**Architecture:** Keep `scorePriorityDocument` as the deep external seam for scoring one Reader document. Move the implementation behind that seam to explicit tag-based core-interest counting (`20 × count`), remove the upper score clamp, and expose the new semantics as `readwise-priority-v4`; the wrapper, export validator, browser parser, and UI consume the same contract.

**Tech Stack:** Strict TypeScript, Node test runner, ESLint, generated JavaScript browser data, Readwise CLI, GitHub Actions via `gh`.

**Spec:** `docs/superpowers/specs/2026-09-13-readwise-priority-v4-score-design.md`

## Global Constraints

- Kerninteresses are exclusively the explicit canonical Readwise tags also shown as `coreInterests`.
- Every core interest contributes exactly 20 points; the component has no upper bound.
- Existing supplementary components remain additive, including `curatie` (`shortlist` +10 and `must-read` +20, highest value wins).
- Base and final scores have no upper bound and retain a lower bound of 0.
- Tiers remain `laag` below 40, `midden` from 40 through 69, and `hoog` from 70 upward.
- The priority model identifier is `readwise-priority-v4`; v3 browser data must be rejected.
- `data/data.js` and `data/score.js` are generated only by `npm run build`.
- The priority build never changes Reader tags; tag changes happen only in the explicitly dispatched priority-sync workflow.

## File Map

- `scripts/lib/readwise-priority-v2.ts`: calculates the base score, components, rationales, and tag-derived domains.
- `scripts/lib/readwise-priority-v3.ts`: applies manual corrections, v4 model identity, tiers, exports, and export validation.
- `test/readwise-priority-v2.test.ts`: base scoring behavior and component contracts.
- `test/readwise-priority-v3.test.ts`: corrected scores, export ordering, model identity, and validation.
- `src/types/browser-data.ts`: runtime browser-data parser and generated model type.
- `src/app.ts`, `index.html`, `test/priority-ui.test.ts`, `test/score-script.test.ts`: score display and browser contract.
- `README.md`, `AGENTS.md`, `CLAUDE.md`: current score-system documentation.
- `data/data.js`, `data/score.js`, `dist/src/app.js`: generated/served artifacts rebuilt at the end.

### Task 1: Make explicit core-interest count linear

**Files:**
- Modify: `scripts/lib/readwise-priority-v2.ts:32-43,247-401`
- Test: `test/readwise-priority-v2.test.ts:27-290`

**Interfaces:**
- Consumes: `matchedDomainsFromTags(doc): DirectDomain[]` and the existing `PriorityDocument`.
- Produces: `scorePriorityDocument(doc): PriorityScoreResult` with `components.kerninteresse = 20 * matchedDomainsFromTags(doc).length`.

- [ ] **Step 1: Add the failing linear-count test.**

```ts
test("kent expliciete kerninteresses lineair met twintig punten per interesse", () => {
  const coreTags = ["philosophy", "history", "sociology", "writing", "games"];

  for (let count = 0; count <= coreTags.length; count++) {
    const tags = Object.fromEntries(coreTags.slice(0, count).map((tag) => [tag, {}]));
    const result = scorePriorityDocument(document({ tags }));

    assert.equal(result.components.kerninteresse, count * 20, `verwacht ${count} kerninteresses`);
  }
});
```

- [ ] **Step 2: Run the focused test and confirm the red failure.**

Run: `npm run compile && node --test dist/test/readwise-priority-v2.test.js`

Expected: the new test fails because the current implementation returns bucket values `0`, `30`, and `45` instead of `0`, `20`, `40`, `60`, `80`, and `100`.

- [ ] **Step 3: Add the failing tag-only test.**

```ts
test("kent tekstsignalen niet als kerninteresse", () => {
  const result = scorePriorityDocument(document({
    title: "Artificial intelligence and political philosophy",
    summary: "A concise analysis of history and sociology.",
    notes: "Waarom lezen: bruikbaar voor mijn werk",
    tags: {},
  }));

  assert.equal(result.components.kerninteresse, 0);
});
```

- [ ] **Step 4: Run the tag-only test and confirm the red failure.**

Run: `npm run compile && node --test dist/test/readwise-priority-v2.test.js`

Expected: the new test fails because the current implementation infers domains and an adjacent-topic score from free text.

- [ ] **Step 5: Implement the minimal base-score change.**

In `scorePriorityDocument`, replace the scored-domain source with `matchedDomainsFromTags(doc)`, remove the `hasAdjacent` branch from `kerninteresse`, and retain the existing text heuristics only for non-core components. Replace the capped helper with a floor-only helper and sum `components.kerninteresse` without an upper bound:

```ts
const domains = matchedDomainsFromTags(doc);

let kerninteresse = domains.length * 20;
if (domains.length > 0) {
  rationale.kerninteresse.push(`${domains.length} expliciete kerninteresse${domains.length === 1 ? "" : "s"}: ${domains.join(", ")}.`);
}

function floorScore(score: number): number {
  return Math.max(0, score);
}
```

Use `floorScore` for the base sum and keep the existing `curatie` logic unchanged.

- [ ] **Step 6: Update existing base-score snapshots and rationales.**

Change expectations that relied on the old `0/30/45` buckets or free-text core matching. Keep assertions for depth, usefulness, reading chance, durable value, language, curation, and deductions where those signals remain in scope. Add `curatie: 0` to zero-curation component snapshots.

- [ ] **Step 7: Run the focused base-score suite green.**

Run: `npm run compile && node --test dist/test/readwise-priority-v2.test.js`

Expected: all tests in `readwise-priority-v2.test.ts` pass, including the six count cases and tag-only behavior.

### Task 2: Remove the ceiling and publish the v4 export contract

**Files:**
- Modify: `scripts/lib/readwise-priority-v3.ts:18-20,100-115,188-190,226-243,394-417`
- Modify: `src/types/browser-data.ts:33-86`
- Test: `test/readwise-priority-v3.test.ts:29-260`
- Test: `test/priority-ui.test.ts:70-105`
- Test: `test/score-script.test.ts:18-30`

**Interfaces:**
- Consumes: `PriorityScoreResult` from Task 1 and `PriorityOverride`.
- Produces: `PRIORITY_MODEL = "readwise-priority-v4"`, `PriorityExport` with non-negative integer scores above 100 allowed, and a browser parser that accepts only v4.

- [ ] **Step 1: Add a failing v4/high-score export test.**

```ts
test("behoudt scores boven 100 en valideert model v4", () => {
  const result = buildPriorityExport([document({
    id: "five-core-interests",
    tags: { philosophy: {}, history: {}, sociology: {}, writing: {}, games: {} },
  })], { generatedAt: "2026-09-14T00:00:00.000Z" });
  const item = result.items["five-core-interests"];

  assert.ok(item);
  assert.equal(result.model, "readwise-priority-v4");
  assert.equal(item.components.kerninteresse, 100);
  assert.ok(item.baseScore > 100);
  assert.ok(item.score > 100);
  assert.equal(validatePriorityExport(result), true);
});
```

- [ ] **Step 2: Run the focused v3/export suite and confirm the red failure.**

Run: `npm run compile && node --test dist/test/readwise-priority-v3.test.js dist/test/score-script.test.js`

Expected: the new test fails because the export is still identified as v3 and the validator still rejects `baseScore > 100`.

- [ ] **Step 3: Add a failing floor test for a large negative override.**

```ts
test("laat een negatieve correctie de eindscore niet onder nul brengen", () => {
  const result = scorePriorityDocument(document({
    tags: { philosophy: {}, history: {}, sociology: {}, writing: {}, games: {} },
  }), { adjustment: -500, reason: "Test van de ondergrens" });

  assert.equal(result.score, 0);
});
```

- [ ] **Step 4: Run the floor test and confirm the red failure.**

Run: `npm run compile && node --test dist/test/readwise-priority-v3.test.js`

Expected: the test fails because the wrapper still uses the old capped helper and score contract.

- [ ] **Step 5: Implement v4 identity and uncapped validation.**

Change `PRIORITY_MODEL` and every browser/test fixture from v3 to v4. Replace the wrapper clamp with a floor-only calculation:

```ts
function floorScore(score: number): number {
  return Math.max(0, score);
}

const score = floorScore(baseScore + adjustment);
```

In `validatePriorityExport`, require finite non-negative integer `baseScore` and `score`, remove both `> 100` checks, and verify `score === floorScore(baseScore + adjustment)`. Require all current component keys, including `curatie`, in a v4 export. Keep tier thresholds unchanged.

- [ ] **Step 6: Update v3/export and browser contract tests.**

Change the expected model to v4, add assertions that v3 is rejected and v4 is accepted, and update the score fixture in `test/priority-ui.test.ts`. Ensure `src/types/browser-data.ts` uses the v4 literal in both `TopArticlePriority` and `isTopArticlePriority`.

- [ ] **Step 7: Run the focused export and browser suites green.**

Run: `npm run compile && node --test dist/test/readwise-priority-v2.test.js dist/test/readwise-priority-v3.test.js dist/test/priority-ui.test.js dist/test/score-script.test.js`

Expected: all focused score, export, browser, and model-version tests pass.

### Task 3: Update the visible score explanation and repository documentation

**Files:**
- Modify: `src/app.ts:144-155,934-948`
- Modify: `index.html:47-59`
- Modify: `README.md:16-17`
- Modify: `AGENTS.md:64-70,119-120`
- Modify: `CLAUDE.md:64-70,129-130`
- Test: `test/priority-ui.test.ts:12-20,120-160`

**Interfaces:**
- Consumes: v4 `PriorityItem` values from the browser parser.
- Produces: UI copy and agent documentation that describe the same uncapped score semantics.

- [ ] **Step 1: Add failing UI assertions for uncapped scores.**

Extend the page-source tests to require text matching an unbounded/uncapped score explanation and to reject the old literal `0–100` and `Prioriteitsscore …/100` wording.

- [ ] **Step 2: Run the focused UI suite and confirm the red failure.**

Run: `npm run compile && node --test dist/test/priority-ui.test.js`

Expected: the new assertions fail against the current `0–100` explanation and `/100` summary.

- [ ] **Step 3: Update the frontend and docs.**

Add `curatie` to the existing component display order if needed, change the breakdown summary from `Prioriteitsscore ${priority.score}/100` to `Prioriteitsscore ${priority.score}`, and describe the score as ascending without a ceiling. Describe tiers as `laag <40`, `midden 40–69`, and `hoog ≥70`. Update README, AGENTS, and CLAUDE so they reference v4, the linear core-interest rule, and scores above 100.

- [ ] **Step 4: Run the focused UI suite green.**

Run: `npm run compile && node --test dist/test/priority-ui.test.js`

Expected: the page copy, generated app source, and browser contract assertions pass.

### Task 4: Regenerate and verify all derived artifacts

**Files:**
- Modify through build only: `data/data.js`, `data/score.js`, `dist/src/app.js`
- Verify: `test/generated-priority.test.ts`, `test/unified-lists.test.ts`, `test/core-interest-email.test.ts`

**Interfaces:**
- Consumes: v4 scoring and export modules from Tasks 1–3 plus current Reader `later` data.
- Produces: synchronized generated browser data with one `generatedAt`, identical document sets, v4 model, and recomputed list positions.

- [ ] **Step 1: Run repository checks before fetching live data.**

Run: `npm run check`

Expected: lint, typecheck, and all existing tests pass against the source implementation.

- [ ] **Step 2: Rebuild generated data using the canonical build.**

Run: `npm run build`

Expected: the build fetches Reader `later`, writes both generated files, and reports the active catalog count without validation errors.

- [ ] **Step 3: Verify the generated v4 export numerically.**

Run:

```bash
node --input-type=module -e 'import { readFile } from "node:fs/promises"; import vm from "node:vm"; const load = async (path, name) => { const context = { window: {} }; vm.runInNewContext(await readFile(path, "utf8"), context); return context.window[name]; }; const data = await load("data/data.js", "TOP_ARTICLES"); const priority = await load("data/score.js", "TOP_ARTICLE_PRIORITY"); const scores = Object.values(priority.items).map((item) => item.score); if (priority.model !== "readwise-priority-v4") throw new Error("geen v4-model"); if (data.generatedAt !== priority.generatedAt) throw new Error("generatedAt verschilt"); if (Object.keys(priority.items).length !== data.catalog.items.length) throw new Error("documentset verschilt"); if (Math.max(...scores) <= 100) throw new Error("geen score boven 100 gevonden"); console.log(JSON.stringify({ generatedAt: data.generatedAt, documents: scores.length, maximumScore: Math.max(...scores) }));'
```

Expected: the command prints the shared timestamp, document count, and a maximum score above 100.

- [ ] **Step 4: Run repository checks again after generation.**

Run: `npm run check`

Expected: all tests, including generated-data consistency and list ordering, pass with the new artifacts.

- [ ] **Step 5: Review the generated diff and commit the implementation.**

Run:

```bash
git diff --check
git status --short
git add AGENTS.md CLAUDE.md README.md data/data.js data/score.js dist/src/app.js index.html scripts/lib/readwise-priority-v2.ts scripts/lib/readwise-priority-v3.ts src/app.ts src/types/browser-data.ts test/priority-ui.test.ts test/readwise-priority-v2.test.ts test/readwise-priority-v3.test.ts test/score-script.test.ts docs/superpowers/plans/2026-09-14-readwise-priority-v4-score.md
git commit -m "feat: herontwerp prioriteitsscore als lineair model"
```

Expected: only the v4 score implementation, tests, docs, and build-generated artifacts are committed.

### Task 5: Publish and run the approved workflows in sequence

**Files:**
- No source changes; operate on GitHub ref `main` and the configured Readwise/GitHub Actions integrations.

**Interfaces:**
- Consumes: the pushed v4 commit and GitHub workflow dispatch contracts in `.github/workflows/priority-sync.yml`, `.github/workflows/refresh.yml`, and `.github/workflows/core-interest-email.yml`.
- Produces: successful tag synchronization, refreshed generated data, and completed email workflow runs.

- [ ] **Step 1: Push the implementation and verify the remote ref.**

Run: `git push origin main`

Then run: `git status --short && git log -1 --oneline --decorate`

Expected: push succeeds without force, `main` is clean, and `origin/main` contains the implementation commit. If `main` moved remotely, fetch and rebase the unpushed local commit, rerun `npm run check`, and push again without force.

- [ ] **Step 2: Dispatch and monitor priority synchronization.**

Run: `gh workflow run priority-sync.yml --ref main`

Capture the returned run URL/ID, then run: `gh run watch <priority-run-id> --exit-status`

Expected: the run completes successfully, including plan generation, tag application, and post-apply verification.

- [ ] **Step 3: Dispatch and monitor the refresh workflow only after sync success.**

Run: `gh workflow run refresh.yml --ref main`

Capture the returned run URL/ID, then run: `gh run watch <refresh-run-id> --exit-status`

Expected: the workflow checks the repo, rebuilds v4 data, commits/pushes generated changes if needed, and completes its configured top-1 email step successfully.

- [ ] **Step 4: Dispatch and monitor the core-interest email workflow after refresh success.**

Run: `gh workflow run core-interest-email.yml --ref main --field force=true`

Capture the returned run URL/ID, then run: `gh run watch <email-run-id> --exit-status`

Expected: the workflow compiles the pushed v4 code and completes the forced email send successfully, even outside the Europe/Amsterdam schedule window.

- [ ] **Step 5: Audit all required end states.**

Run: `git fetch origin main && git status --short && git rev-list --left-right --count main...origin/main`

Expected: the worktree is clean, local and remote `main` agree, priority-sync, refresh, and email runs each have a terminal `success` conclusion, and no required workflow remains pending or failed.
