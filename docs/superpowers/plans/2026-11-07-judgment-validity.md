# Judgment validity implementation plan

> Execute inline using superpowers:executing-plans.

**Goal:** Concentrate judgment validity while preserving scoring behavior.
**Architecture:** Deepen priority-judgments with a discriminated context and validity result. Existing scoring, evidence reporting and source review become adapters.
**Tech Stack:** Strict TypeScript, node:test.
**Spec:** docs/superpowers/specs/2026-11-07-judgment-validity-design.md

## Constraints
Preserve legacy fingerprints, optional snapshot context, reporting precedence and exact score behavior. No Reader writes.

## Review focus
Legacy snapshots; automated fallbacks before context checks; inherited rubric; incomplete topics; changed or unavailable source.

## Task 1: Shared validity policy and adapters
- [x] Add regression tests for all three contexts and route agreement; observe red.
- [x] Add evaluateJudgmentValidity to priority-judgments.ts; context owns proof requirements.
- [x] Route judgmentFor, sourceJudgmentIsCurrent and evidence coverage/validation through it; retain report accounting.
- [x] Run focused tests, then npm run check.
- [x] Document policy; review final diff for behavior changes.

## Verification record

- Red: compilation rejected the new tests because evaluateJudgmentValidity did not exist.
- Focused scoring, validity, evidence and review tests passed after implementation.
- Lint and typecheck passed. The sandbox test run encountered Node subprocess EPERM; the full npm test run outside the sandbox passed 593 tests, zero failures.
- Independent final review found no actionable compatibility or correctness issues.
- Exact existing score fixtures passed; no generated data or Reader tags were changed.
