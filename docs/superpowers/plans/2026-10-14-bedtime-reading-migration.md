# Bedtime reading and profile migration — implementation plan (#8)

> Execute inline with test-driven development and an independent final review. The user authorized implementation, commits and pushes to main for each issue, followed by closure before the next issue.

**Goal:** Deliver the complete bedtime flow and a fixed local assessment snapshot without invalidating the existing production menu.

**Spec:** GitHub issues #8 and its parent #6. Complete reassessment and final dataset publication belong to the subsequent batch tickets and #32.

**Architecture:** Keep the pure session authoritative. A shared situation definition drives defaults, selection and matching. Profile rubric v2 and browser menu version 2 require both new ratings. Continue serving a strictly projected legacy v1 menu while the complete Later document set has not yet been reviewed under v2; legacy traits never gain invented ratings or qualify for a situation.

**Constraints:** Bedtime defaults to 10 minutes, low energy, ontspannen and no mood. Activation must be ≤1; need fit precedes calm/warm tone and low activation, then mood and existing priority ties. Changes retain confirmed time, current remaining course and exclusions. Old sessions restore with no situation. No Reader mutations, no raw evidence/IDs in GitHub, no partial v2 release dataset.

## Tasks

1. Profile contract and publication (`src/reading-profiles.ts`, `scripts/lib/reading-profiles.ts`, existing contract tests): write failing v2 validation/publication/parser tests; require integer activation/interruptibility 0–4; preserve explicit legacy contract; publish v2 only after complete current v2 review; verify private evidence is projected out.
2. Fixed migration snapshot (`scripts/reading-profiles.ts`, `scripts/lib/reading-profile-migration.ts`, workflow tests, `docs/reading-profiles.md`): test stable ID sorting, batches ≤25, exact coverage, snapshot hash binding and safe resume. Prepare all Later, including accepted profiles. Store complete dated snapshot and manifest locally; refuse changes to frozen assignment. Update rubric instructions and report counts without publishing identities.
3. Bedtime controls and session behavior (`src/reading-situations.ts`, `src/reading-menu.ts`, `src/reading-storage.ts`, `src/reading-menu-view.ts`, CSS, service-worker cache, mounted-menu tests): write failing end-to-end fixture tests for defaults, hard activation boundary, calm work, soft ranking, collapsed adjustment controls, preserved expansion, situation changes after read/replace, effective settings summary, legacy restoration and malformed IDs. Implement canonical bedtime definition, strict matching, accessible controls and storage compatibility.
4. Run `npm run check`, inspect desktop/mobile and keyboard behavior, prepare the real migration snapshot, verify exact manifest coverage and an actual source-backed v2 example through the public/parser/menu route. Independently review the complete diff. Commit with `(#8)`, push main, verify remote and close #8 only after all acceptance criteria are proven.

## Review focus

- Mixed old/new profiles retain usable legacy production data; incomplete review cannot silently publish an empty v2 menu.
- Old sessions and stale derived proposals preserve progress without trusting stored IDs or fabricated ratings.
- Switching during an exhausted session does not reset course, confirmations or exclusions, and completed sessions stay completed.
- Frozen snapshots and batch assignments survive reruns and cannot be silently replaced as Later changes.
- Activation evidence is independent of length, effort, topic tags and current priority; every course obeys the situation.
