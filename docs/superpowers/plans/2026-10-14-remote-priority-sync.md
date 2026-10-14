# Remote priority-sync implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the explicit GitHub mode of `readwise-priority-sync` dispatch and follow the complete
Readwise maintenance chain through final publication.

**Spec:** `docs/superpowers/specs/2026-10-14-remote-priority-sync-design.md` and issue #40.

## Tasks

### Task 1: Route stages through priority

- Add a `--through <stage>` limit to the local maintenance route so repository automation can run
  the author and priority stages without locally or remotely applying archive/cleanup/build.
- Add tests for the limit, exact confirmations, and replan behavior.

### Task 2: Loop-free workflow chain

- Update `priority-sync.yml` to use the author/priority route with automatic exact-hash retries.
- Convert the old lees-only archive workflow to the general archive plan/apply/verify engine.
- Trigger cleanup only after general archive success and refresh only after cleanup success.
- Remove child `workflow_dispatch` entries, preserve concurrency/secrets, and carry context artifacts
  across automatic commits and parent/child runs.

### Task 3: Remote skill and run correlation

- Document unique-request dispatch, exact child-run correlation, polling, links, artifacts, partial
  success and no-local-mutation boundaries in the remote skill/reference/README.
- Add fixture-based run-status and workflow-contract tests, including unrelated concurrent runs,
  upstream failure, trigger-cycle prevention and final data consistency.
- Keep `skills:check`/`skills:sync` installability contracts current.

### Task 4: Verify, commit, push and close

- Run the full checks and workflow-contract tests.
- Inspect all diffs and preserve unrelated user changes.
- Push only issue-#40 changes to `main`, verify remote status, then close #40.
