# Leesmenu Session Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the leesmenu-sessiemodule the single source of truth for the visible menu, current gang, session actions, confirmed reading time, and remaining proposals.

**Architecture:** Extend the existing pure sessie-interface with the complete current proposal list. `refreshSession` recomputes that list from the current catalog, profiles, scores, read markers, temporary exclusions, course, and confirmed minutes; the current proposal is the first item in that same list. The browseradapter renders only the session result and keeps browser storage and durable read markers at its existing boundary.

**Tech Stack:** Strict TypeScript, Node's built-in test runner, existing deterministic menu planner, local/session storage adapters.

**Spec:** GitHub issue #5, `docs/superpowers/specs/leesmenu.md`, and `docs/adr/0001-vooraf-beoordeelde-leesprofielen.md`.

## Global Constraints

- The visible menu and session actions must use one authoritative session result; the browseradapter must not independently plan a second menu.
- Recalculate after replace, read confirmation, skip, reading-moment changes, read-marker changes, and restoration against current input.
- Preserve confirmed articles and confirmed minutes when the reading moment changes or the budget is lowered.
- A budget lower than confirmed reading time is valid; do not truncate confirmed time or replace the chosen budget with the default.
- When confirmed time meets or exceeds the budget, expose no remaining proposals; a later budget increase may expose matching later courses.
- Opening a Reader link, replacing, skipping, or stopping without explicit confirmation must not create a read marker.
- Preserve v1 stored-session compatibility, existing storage keys, invalid-data rejection, and safe read-history reconciliation.
- Preserve existing reading-profile, priority, appetizer, energy, mood, tie-breaker, accessibility, and no-live-AI policies.

## Review Focus

- A restored session whose confirmed minutes exceed its current budget remains valid, shows no proposals, and can produce a later dessert after the budget is raised.
- A v1 stored session with stale derived proposals is rebuilt from current catalog and read-marker input rather than trusting the stored proposal.
- A concurrent read-marker change makes the current card and all visible cards come from the same refreshed session result, including working current-card actions.
- An empty appetizer remains an explicit empty menu rather than silently falling back to a heavier course, while a later-course refresh keeps its current course semantics.
- Finished sessions expose no stale proposals or actions and can be replaced by a new session without carrying temporary exclusions or confirmed progress.

---

### Task 1: Make the session own the complete current menu

**Files:**
- Modify: `src/reading-menu.ts`
- Test: `test/reading-menu.test.ts`

**Interfaces:**
- Consumes: existing `MenuInputs`, `ReadingMoment`, `MenuProposal`, `planMenu`, and `MenuAction` contracts.
- Produces: `MenuSession.proposals: MenuProposal[]`, containing the complete current menu in display order; `MenuSession.proposal` remains the first/current proposal or `null`.

- [ ] **Step 1: Write the failing tests**

  Add behavior tests that:

  - assert a new session exposes the same three ordered proposals as the existing planner and identifies the first one as current;
  - assert refreshing after a read-marker change rebuilds both the full proposal list and the current proposal from the same input;
  - assert a session with 8 confirmed minutes and a 5-minute budget preserves its completion history, exposes no proposals, and exposes the 2-minute dessert after its budget is raised to 10 minutes;
  - assert stopping or finishing clears the session's proposals as well as its current proposal.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `npm run compile && node --test dist/test/reading-menu.test.js`

  Expected: FAIL because the session does not yet expose or maintain a complete proposal list, while the existing planner tests continue to pass.

- [ ] **Step 3: Implement the authoritative session projection**

  Add `proposals` to `MenuSession`. Make `startSession` and `refreshSession` populate it from one `planMenu` call and derive `proposal` from its first entry. Ensure finished states return an empty proposal list. Keep transitions validating the supplied proposal ID against the current proposal, then refresh the complete list after replace, read-next, and skip-main.

- [ ] **Step 4: Run the focused tests to verify they pass**

  Run: `npm run compile && node --test dist/test/reading-menu.test.js`

  Expected: PASS for all menu-planner and session-authority tests.

- [ ] **Step 5: Commit**

  ```bash
  git add src/reading-menu.ts test/reading-menu.test.ts
  git commit -m "refactor: make reading menu session authoritative"
  ```

### Task 2: Restore valid over-budget sessions safely

**Files:**
- Modify: `src/reading-storage.ts`
- Test: `test/reading-menu.test.ts`

**Interfaces:**
- Consumes: `MenuSession.proposals` from Task 1 and the existing v1 stored-session shape.
- Produces: `parseSession` that accepts finite confirmed-time totals above the chosen budget, rejects non-finite totals and malformed entries, and returns a session whose derived proposals are empty until `refreshSession` rebuilds them.

- [ ] **Step 1: Write the failing tests**

  Add tests that:

  - parse a v1 session with an 8-minute completion history and a 5-minute budget successfully, retaining the budget and completed entries;
  - reject a session whose finite entries sum to a non-finite total;
  - accept a parsed session with stale/missing stored proposal data while leaving derived proposals to be rebuilt by `refreshSession`.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `npm run compile && node --test dist/test/reading-menu.test.js`

  Expected: FAIL because `parseSession` currently rejects completed time above the budget and does not initialize the new session projection.

- [ ] **Step 3: Implement the storage boundary change**

  Keep the existing v1 validation and storage keys. Replace the `completed <= budget` invariant with an explicit finite-total check, preserve all valid completed entries and the chosen budget, ignore persisted derived proposals, and initialize the in-memory proposal list empty for immediate refresh against current inputs.

- [ ] **Step 4: Run the focused tests to verify they pass**

  Run: `npm run compile && node --test dist/test/reading-menu.test.js`

  Expected: PASS for the storage regression tests and all existing menu tests.

- [ ] **Step 5: Commit**

  ```bash
  git add src/reading-storage.ts test/reading-menu.test.ts
  git commit -m "fix: restore reading sessions below confirmed budget"
  ```

### Task 3: Render the session result and cover browser regressions

**Files:**
- Modify: `src/reading-menu-view.ts`
- Test: `test/reading-menu-view.test.ts`

**Interfaces:**
- Consumes: `MenuSession.proposals` and `MenuSession.proposal` from Task 1, plus the restored-session behavior from Task 2.
- Produces: a browseradapter that renders the active session's proposal list directly and never calls `planMenu` independently.

- [ ] **Step 1: Write the failing browser regression tests**

  Add integration-style tests using the existing memory storage and DOM seam that:

  - seed a read marker for the current top appetizer, choose “Opnieuw beschikbaar”, and assert the newly visible appetizer is the current card with its replace/read/stop actions attached;
  - confirm an 8-minute session, lower the saved budget to 5 minutes, remount from the same session storage, and assert the 8 confirmed minutes and 5-minute budget remain with no course cards;
  - raise that restored budget to 10 minutes and assert the 2-minute dessert becomes visible with actions attached to the current card;
  - assert a finished session renders no stale course actions and “Nieuw leesmoment” starts a clean session.

- [ ] **Step 2: Run the focused browser tests to verify they fail**

  Run: `npm run compile && node --test dist/test/reading-menu-view.test.js`

  Expected: FAIL because the adapter currently calls `planMenu` separately from the session and the storage parser still rejects the over-budget restored session.

- [ ] **Step 3: Render only the authoritative session output**

  Remove the adapter's independent `planMenu` call. Render `active.proposals`, determine the current card from `active.proposal`, and use the session's confirmed minutes for status. Keep storage synchronization, durable read-marker updates, browser links, focus behavior, and existing accessible labels unchanged.

- [ ] **Step 4: Run the focused browser tests to verify they pass**

  Run: `npm run compile && node --test dist/test/reading-menu-view.test.js`

  Expected: PASS for all browseradapter and existing accessibility/action tests.

- [ ] **Step 5: Commit**

  ```bash
  git add src/reading-menu-view.ts test/reading-menu-view.test.ts
  git commit -m "fix: render reading menu from session state"
  ```

### Task 4: Verify the complete change

**Files:**
- No product files; verification only.

**Interfaces:**
- Consumes: all implementation commits above.
- Produces: verified TypeScript, lint, focused tests, and full test results.

- [ ] **Step 1: Compile and run the focused leesmenu suite**

  Run: `npm run compile && node --test dist/test/reading-menu.test.js dist/test/reading-menu-view.test.js`

  Expected: PASS with zero failures.

- [ ] **Step 2: Run project checks**

  Run: `npm run check`

  Expected: lint, typecheck, compilation, and the complete test suite pass. If a pre-existing unrelated test or local prototype issue blocks the full command, record its exact name and output without changing unrelated files.

- [ ] **Step 3: Inspect the final diff and status**

  Run: `git diff HEAD~3..HEAD -- src/reading-menu.ts src/reading-storage.ts src/reading-menu-view.ts test/reading-menu.test.ts test/reading-menu-view.test.ts` and `git status --short`

  Expected: only the issue #5 implementation and its tests are in the implementation commits; the pre-existing dirty configuration/frontend/prototype files remain untouched.

