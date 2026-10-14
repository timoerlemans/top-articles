---
name: readwise-priority-judge
description: Use when explicitly reviewing or reprioritizing Readwise documents in `later` using semantic evidence from metadata, notes, and highlights.
---

# Readwise priority judge

## Repository authority

Read [`../readwise-reference.md`](../readwise-reference.md), `README.md`, and `config/readwise-reading-preferences.md` before preparing or reviewing evidence in the repository checkout. When installed separately, locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or `/mnt/c/dev/top-articles`, then read `<repository>/skills/readwise-reference.md`; do not assume the relative link exists. Use the current v8 contracts and profile schema from the repository; stored automatic fallbacks are operational defaults, not semantic reviews.

Use this skill for an explicit semantic review of documents in the current Readwise `later` collection. Readwise enrichment, triage, and scheduled fallback creation provide evidence or operational defaults; they do not count as a semantic review.

## Prepare the evidence

Run a read-only evidence preparation for all documents in `later`:

```bash
npm run priority:judge -- prepare --all-later
```

This writes an ignored evidence snapshot and batches of at most 25 documents under `.tmp/readwise/`. Highlights are deduplicated, position and toplist tags are excluded from semantic evidence, and raw highlight text stays out of the judgment config and public browser data.

Read the evidence for each document. Use title, summary, notes, content tags, and relevant highlight text as evidence. Do not infer a judgment from current positions, ordinal or top-list tags, highlight count, generated provenance, or curation signals such as `must-read`, `shortlist`, and `want-to-read`. Content tags can provide evidence, but they do not replace reading the document evidence.

## Review and record judgments

Judge every document independently of its current ranking. Use the current version-2 judgment schema and `semantic-v2` rubric. Record the four content ratings (`relevance`, `substance`, `durability`, and `usefulness`) on a 0–4 scale, applicable `sequenceFit` values on a -2–2 scale, and a 0–4 `topicRelevance` for each of `scrum`, `software-development`, `front-end-development`, `social-studies`, and `adhd`.

Record evidence fingerprints and specific evidence references, confidence, reason codes, review status, reviewer, and review time. Use `draft` or `rejected` when evidence does not support an accepted judgment; do not fill missing topic ratings with guesses. Never copy raw highlight text into `config/readwise-priority-judgments.json`.

Update `config/readwise-priority-judgments.json` only as part of the requested local semantic review. Automated low-confidence fallback judgments are operational defaults, not completed semantic reviews.

## Validate and inspect the impact

After reviewing the full `later` collection, run:

```bash
npm run priority:judge -- validate --require-all --require-topic
npm run priority:judge -- report
```

Use `prepare --top100` and `validate --require-top100 --require-topic` only when the user explicitly limits the review to current top-100 members. Report that result as a top-100-only review, not as a complete review of `later`.

Resolve missing, stale, rejected, or incomplete-topic judgments before treating the review as complete. Inspect rank movements, top-list entries and exits, rank correlation, confidence, and curation conflicts in the report. Keep the report as a comparison with current tags, not as evidence for the judgments.

## Leesmenu profiles (after priority review)

The complete Later review also maintains `config/readwise-reading-profiles.json`.
Read `/mnt/c/dev/top-articles/docs/reading-profiles.md` for its authoritative rubric and
schema. Prepare `npm run reading:profiles -- prepare --all-later --fetch-content` and
inspect the private snapshot/batches (maximum 25 documents). Retain enrichment full-content
caches through this assessment; retrieve missing content read-only when concentration,
emotional weight, tone or need fit cannot be supported by existing evidence.

Review missing, stale and draft profiles independently of score/rank/curation. Record
supported complete medium/high-confidence traits as accepted; record explicit draft or
rejected status with the evidence fingerprints and reason when support is insufficient
or content is ineligible. Never invent accessibility from a short duration or title alone.
Only current accepted profiles become menu candidates. Preserve unrelated local entries
and track exact per-ID objects produced during this run separately from earlier edits.

Run `npm run reading:profiles -- validate --require-all-reviewed` and
`npm run reading:profiles -- report`. Report accepted/draft/rejected/missing/stale counts
separately from priority judgment validation. Complete coverage can include explicit
non-accepted outcomes; those do not count as usable menu profiles. The inbox router owns
publication and source-cache cleanup after BOTH semantic assessments finish.

## Safety contract

This skill may update local judgment and reading-profile configs when the user requests a semantic review. It does not add, remove, or reorder Readwise tags, move documents, create highlights, or archive documents. A Readwise tag-sync run remains a separate explicit workflow after the report has been reviewed.
