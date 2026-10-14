# Lokale priority-sync en algemene afvloeiing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bouw de lokale, bevestigbare onderhoudsketen uit issue #39 met veilige tagpreservatie, actuele Later-bescherming, algemene archivering, cleanup en finale build.

**Architecture:** Een dunne lokale orchestrator hergebruikt de bestaande priority-sync-, archive- en build-engines. Eén pure tag-completeness seam bepaalt of bulk veilig is; onbekende tagdata gebruikt losse bekende operaties. Iedere stap heeft een eigen plan/hash/journal/verificatie en blokkeert de volgende stap bij fouten.

**Tech Stack:** Strict TypeScript, Node 24, bestaande `node:test`, ESLint, geen nieuwe dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-local-priority-sync-design.md` en issue #39.

## Global Constraints

- Reader-writes vereisen per stap de concrete wijzigingen en exacte relevante planhash.
- Bestaande engines behouden fingerprints, journals, bounded batches, retries, fallback en live verification.
- Bescherming is alleen canonieke familie-top-100 of `want-to-read`.
- Incomplete tagdata mag nooit via volledige bulkvervanging worden geschreven.
- Upstreamfailure stopt downstream-writes en de finale succesclaim.
- Geen remote dispatch; dat hoort bij #40.
- Bestaande gebruikerswijzigingen blijven buiten de commit.

## Review Focus

- Opaque tagdescriptor naast een beheerde tag: cleanup behoudt opaque/personal data en gebruikt add/remove.
- Gemengde complete/incomplete batch: alleen complete documenten gaan via bulk.
- Hervatting nadat eerder gearchiveerde documenten uit Later verdwenen zijn: journalvoortgang wordt hergebruikt zonder nieuwe kandidaten.
- Priority-sync source conflict na auteurstagging: oude hash wordt ongeldig en een nieuwe snapshot is verplicht.
- Archive-, cleanup- of buildfailure na succesvolle upstreamstap: rapport blijft gedeeltelijk en claimt geen volledige keten.

## Taken

### Task 1: Shared tag-completeness seam

**Files:** Create `scripts/lib/reader-tag-set.ts`; modify `scripts/lib/priority-sync.ts`, `scripts/archive-cleanup-cli.ts`; test `test/reader-tag-set.test.ts`, `test/archive-cleanup-cli.test.ts`, `test/priority-sync.test.ts`.

- [ ] Schrijf failing tests voor ontbrekende/null/primitieve tags, lege/volledige arrays en maps, opaque array-items, en gemengde bulk/fallback-batches.
- [ ] Implementeer pure `completeReaderTagSet(value): string[] | null`; gebruik haar in beide bulkadapters en laat incomplete documenten alleen losse bekende operaties uitvoeren.
- [ ] Run gerichte tests, daarna `npm run check`.

### Task 2: Lokale maintenance orchestration

**Files:** Create `scripts/lib/readwise-maintenance.ts` en `scripts/readwise-priority-sync.ts`; tests `test/readwise-maintenance.test.ts`, `test/readwise-priority-sync-cli.test.ts`; modify `package.json`.

- [ ] Schrijf failing tests voor vaste volgorde, hashbevestiging, upstream-gates, rapportstatus en finale buildadapter.
- [ ] Implementeer geïnjecteerde interfaces voor author plan/apply/verify, priority plan/apply/verify, archive plan/apply/verify, cleanup plan/apply/verify en build; plan/apply/verify blijven afzonderlijk aanroepbaar en writes krijgen concrete confirmation hashes.
- [ ] Voeg lokale CLI `maintenance`/`inspect`-route toe met read-only standaard en expliciete `--confirm <step>=<hash>` voor writes.
- [ ] Run gerichte CLI-tests.

### Task 3: Skill- en documentcontract

**Files:** Modify `skills/readwise-priority-sync/SKILL.md`, `skills/readwise-reorder/SKILL.md`, `skills/readwise-reference.md`, `README.md`, `AGENTS.md`, `scripts/lib/skill-check.ts` en fixtures.

- [ ] Documenteer lokale route, author-tagging, algemene Later-afvloeiing, exacte hashconfirmaties, rapporten en geen remote dispatch.
- [ ] Verwijder tegenstrijdige automatische uitzonderingen uit reorder en voeg contractankers/tests toe.
- [ ] Run `npm run skills:check`.

### Task 4: Workflow/data integrity

**Files:** Modify `.github/workflows/priority-sync.yml`, bestaande archive/refresh-docs indien nodig; tests voor actuele finale data en workflow-gates.

- [ ] Laat de lokale route build pas uitvoeren na geverifieerde eerdere stappen; behoud bestaande remote workflowgrenzen.
- [ ] Pin final data-set consistency en error reporting zonder data handmatig te wijzigen.
- [ ] Run `npm run check`, inspecteer `git diff --check`, commit en push alleen issue-#39-bestanden.
