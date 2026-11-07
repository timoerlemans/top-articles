# Protect Books from Automatic Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure no automatic Readwise archive route can move a book/EPUB from `later` to `archive`, while preserving explicit manual moves.

**Architecture:** Reuse the existing `isBook(PriorityDocument)` classifier. The archive planner will place books in its protected set, and the archive executor will reject any candidate book before issuing a move. The versioned triage/inbox/reference skills will state the same automatic-routing invariant so operational instructions cannot diverge from runtime behavior.

**Tech Stack:** Strict TypeScript, Node's built-in test runner, Markdown skill contracts, existing Readwise archive-plan/apply modules.

**Spec:** `docs/superpowers/specs/2026-11-07-protect-books-from-auto-archive-design.md`

## Global Constraints

- Automatic archive routes must never move books/EPUBs from `later` to `archive`.
- Explicit manual Reader moves remain allowed.
- Existing `isBook` classification remains the source of truth; do not change PDF handling.
- Do not edit generated `data/data.js` or `data/score.js` manually.
- Preserve plan hashes, source-fingerprint freshness, journals, batching, and archive-cleanup behavior.

## Review Focus

- A book outside every top-100 family and without `want-to-read` must be protected by the plan (Task 1).
- A stale/tampered candidate set containing a book must be rejected before any move call (Task 2).
- A PDF or ordinary article must retain its existing archive behavior (Tasks 1–2).
- Inbox Tier-1 handling must route a book to `later`, not `archive` (Task 3).
- Manual moves and archive tag cleanup must remain outside this automatic guard (Task 3 and verification).

### Task 1: Protect books in archive-plan construction

**Files:**
- Modify: `scripts/lib/archive-plan.ts`
- Test: `test/archive-plan.test.ts`

**Interfaces:**
- Consumes: `isBook(document)` from `scripts/lib/priority-document.ts`.
- Produces: `ArchivePlan.protectedDocumentIds` includes all later books; no book appears in `candidateDocumentIds`.

- [ ] **Step 1: Write the failing test**

  Add a test with an `epub` document that has no top-list tags and no `want-to-read`; assert it is protected, not a candidate. Add a neighboring `pdf` or ordinary note assertion to pin the existing non-book behavior.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm run compile && node --test dist/test/archive-plan.test.js`
  Expected: the new book-protection assertion fails before the implementation.

- [ ] **Step 3: Implement the minimal planner change**

  Import `isBook` and add every later document satisfying `isBook` to the protected ID set before candidates are derived. Keep family membership output unchanged; books need not be assigned to a family to be protected.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `npm run compile && node --test dist/test/archive-plan.test.js`
  Expected: all archive-plan tests pass.

### Task 2: Add an executor-level book guard

**Files:**
- Modify: `scripts/lib/archive-apply.ts`
- Test: `test/archive-apply.test.ts`

**Interfaces:**
- Consumes: `currentDocuments`, `plan.candidateDocumentIds`, and `isBook(document)`.
- Produces: `applyArchivePlan` throws a clear book-protection error before `moveDocuments` is called when a candidate ID resolves to a book.

- [ ] **Step 1: Write the failing test**

  Add a test that supplies a plan-like candidate set containing an EPUB, bypasses freshness with a no-op `assertFresh`, and asserts `applyArchivePlan` rejects without invoking the move callback.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm run compile && node --test dist/test/archive-apply.test.js`
  Expected: the move callback is currently reached or the promise resolves, so the new rejection assertion fails.

- [ ] **Step 3: Implement the guard**

  Import `isBook`, resolve candidate IDs against `currentDocuments`, and throw before journal writes or Reader moves if any candidate is a book. Keep the existing stale-plan check and retry behavior unchanged for non-books.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `npm run compile && node --test dist/test/archive-apply.test.js`
  Expected: all archive-apply tests pass.

### Task 3: Align versioned Readwise routing contracts and tests

**Files:**
- Modify: `skills/readwise-reference.md`
- Modify: `skills/readwise-triage/SKILL.md`
- Modify: `skills/readwise-inbox/SKILL.md`
- Create: `test/readwise-triage-contract.test.ts`

**Interfaces:**
- Consumes: the existing V2 triage/inbox routing contract and `isBook` runtime invariant.
- Produces: explicit operational text that automatic Tier-1/podcast/archive routes never archive books and route them to `later` instead.

- [ ] **Step 1: Write the contract test**

  Read the three versioned skill files and assert each states the automatic book protection, the `later` destination, and that explicit manual moves are not being prohibited.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm run compile && node --test dist/test/readwise-triage-contract.test.js`
  Expected: the new assertions fail because the current contracts still allow generic Tier-1 archive moves.

- [ ] **Step 3: Update the contracts**

  Add one shared routing rule to the reference and corresponding explicit exceptions to triage/inbox: classify books via the canonical book detector; never send them through an automatic Archive move, including Tier 1; route them to Later. State that only an explicit user-requested manual move may archive a book.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `npm run compile && node --test dist/test/readwise-triage-contract.test.js`
  Expected: all contract assertions pass.

### Task 4: Full verification and handoff

**Files:**
- Verify: all files above and the design/plan documents.

- [ ] **Step 1: Run the complete relevant test set**

  Run: `npm run compile && node --test dist/test/archive-plan.test.js dist/test/archive-apply.test.js dist/test/readwise-triage-contract.test.js dist/test/skill-check.test.js`
  Expected: zero failures.

- [ ] **Step 2: Run repository checks relevant to the change**

  Run: `npm run typecheck && git diff --check`
  Expected: exit code 0 and no whitespace errors.

- [ ] **Step 3: Review the diff**

  Confirm no generated browser data changed and that manual move semantics, PDF handling, journals, and cleanup logic are untouched.

- [ ] **Step 4: Commit the implementation**

  Commit message: `fix: bescherm boeken tegen automatische archivering`
