# Per-topic priority scores v8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the global-plus-fit ranking of topical Readwise sequences with independent topic scores while preserving global, format, language, tag-sync, and generated-data invariants.

**Architecture:** Keep the current v7 global score as the shared personal-priority score. Add a versioned topic-taxonomy and per-topic semantic relevance, then publish v8 per-sequence score records containing score, tier, mode, and topic breakdown. Keep membership separate from ranking.

**Tech Stack:** Strict TypeScript, Node test runner, generated browser data, Readwise CLI workflows.

**Spec:** Design agreed in conversation on 2026-09-20; this plan is the persisted implementation handoff.

## Global Constraints

- Topic sequences are `scrum`, `software-development`, `front-end-development`, `social-studies`, and `adhd`.
- Topic relevance is 0–4 and replaces, rather than stacks with, general relevance.
- The global core-interest bonus remains in topic scores.
- Agile membership remains narrow; strong tags are `agile`, `scrum`, `team coaching`, `facilitation`, `flow & delivery`, and `psm-ii`.
- Fallback tag strengths are strong=4, medium=2, light=1; explicit topic judgments are authoritative.
- Current later documents require a complete re-review before v8 activation; post-migration new documents may use low-confidence fallback.
- Builds never mutate Reader tags; tag synchronization remains plan/apply/verify.

## Review Focus

- Old numeric `sequenceScores` consumers must read the new per-sequence score object — covered by unified-list, tag-plan, report, and browser-contract tests.
- Agile tags used for membership must all receive the intended fallback strength — covered by taxonomy tests for `facilitation`, `flow & delivery`, and `psm-ii`.
- Broad team tags must not silently create Agile membership — covered by sequence-classification tests.
- A missing topic judgment must be distinguishable from an accepted semantic rating — covered by fallback/confidence tests.
- Generated `data.js` and `score.js` must remain synchronized under v8 — covered by generated-data and full-build verification.

### Task 1: Topic judgment and taxonomy

Add `TopicSequence`, optional `topicRelevance`, validation, fallback resolution, and a versioned tag-taxonomy module/config. Preserve old `sequenceFit` for non-topic sequences.

Tests: `test/priority-topic-taxonomy.test.ts`, `test/priority-evidence.test.ts`.

### Task 2: v8 scorer and export

Create `scripts/lib/readwise-priority-v8.ts`, calculate global and topic scores, publish per-sequence score records, recompute positions, validate independently, and update score/report callers.

Tests: `test/readwise-priority-v8.test.ts`, existing priority/report regressions.

### Task 3: Lists, tag planning, browser contract, and UI

Update unified lists, tag plans, generated-data helpers, browser parsers, `src/app.ts`, `dist/src`, and UI tests for object-valued sequence scores and dual score display.

### Task 4: Migration tooling and documentation

Add full-later judgment preparation/validation, update fallback behavior for new documents, add v7→v8 impact reporting, update workflows/docs, run the full local checks and authenticated data build.

### Task 5: Release verification

Review the complete diff, commit, push, dispatch workflows in dependency order, inspect their runs, and only then report completion.
