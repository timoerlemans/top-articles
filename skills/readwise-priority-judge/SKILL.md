---
name: readwise-priority-judge
description: Use when explicitly reviewing or reprioritizing current Readwise Later documents through a full-source semantic review, or resuming its local review run.
---

# Readwise priority judge

Locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or
`/mnt/c/dev/top-articles`. Resolve the following paths from that repository when installed
separately; do not assume relative links exist in the installed skill directory.
The installed copy reads `<repository>/skills/readwise-reference.md` and
`<repository>/docs/priority-review.md` from that discovered checkout.

Before preparing evidence or judging a document, read the complete canonical
[priority-review contract](../../docs/priority-review.md), the
[operational reference](../readwise-reference.md), and the current
[reading preferences](../../config/readwise-reading-preferences.md).

Follow that contract for preparation, private review attempts, incremental reuse, confidence,
local import and coverage reporting. Review all current Later documents across categories and
priority levels. Every explicit Later review is also a publication job: establish the remote
baseline before judging, produce isolated proposed configs, pass both validators, merge only the
run-produced IDs, commit/push the isolated result, and verify the remote SHA. If those gates cannot
be completed, stop the semantic review before accepting partial work and report it as blocked;
never finish with only a local config or a merely prepared evidence snapshot. Codex supplies semantic judgments; scripts retrieve sources, validate and rank.
The contract defines `full-source-v1` provenance with backward-compatible `semantic-v2` judgments,
all six topics including `philosophy`, and the stop rule for reusable medium judgments.
An operational fallback never counts as a completed semantic review.

Work autonomously through the local run without approval per batch. Reading-profile migration
is optional scope; reach its separate rubric through the contract only when included. Preserve
unrelated edits. Report coverage and unresolved source/review problems before claiming completion.
Reader mutations and publication follow their separate existing routes in the contract.
