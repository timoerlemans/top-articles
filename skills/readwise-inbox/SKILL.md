---
name: readwise-inbox
description: Use when the user wants to fully process the Readwise inbox unattended — enrich and triage every inbox document in one run, with triage decisions applied automatically instead of asked per document. Triggers — "clear the inbox", "process inbox autonomously/automatisch", "enrich and triage inbox", "run the inbox pipeline", "ruim de inbox op zonder te vragen".
---

# Readwise Inbox

## Repository v2 contract

Read [`../readwise-reference.md`](../readwise-reference.md) before invoking the sub-skills. Full-source coverage and evidence-based targeted rereading replace any legacy fixed `10/10` pass requirement below; a document is complete only when its actual source, result, and errors are recorded. Preserve personal notes/feedback and non-content tags, and do not route a failed or incomplete document as successfully processed.

## Overview

Chains **readwise-enrich** and **readwise-triage** against `location=inbox` in one unattended run. Enrich tags and summarizes every inbox document first; triage then classifies and moves each one automatically, using the same recommendation logic triage always uses, but without waiting for a per-document user decision.

**REQUIRED SUB-SKILLS:** readwise-enrich, readwise-triage. This skill only overrides their location choice (Step 0) and, for triage, the decision-wait (Phase G). Every other rule in both sub-skills — taxonomy, note format, beschermregels, auto-archive tiers, podcast handling, linked-article extraction, logging — applies unmodified.

## When to Use

- User asks to run enrich + triage on the inbox back-to-back
- User says "autonomous"/"autonoom", "automatisch", "zonder te vragen" together with inbox processing
- **Not** for `feed` or `later` — this skill is inbox-only. For other locations, or if the user wants to review triage picks interactively, invoke readwise-enrich / readwise-triage directly instead.

## Direct output

Before any tool call: output exactly `Inbox-pipeline starten...`

## Step 1: Enrich (unmodified, location fixed)

Invoke readwise-enrich with location pre-set to `inbox` — do **not** ask its Phase 0 location question. Overwrite mode = skip (its default) unless the user specified otherwise. Run its Steps 1–7 exactly as documented and let it finish completely before Step 2.

**Brondekking is een harde poort:** voor ieder document dat deze pipeline wil doorgeven, moet `readwise-enrich` de volledige beschikbare bron, de feitelijke notitie/highlight-uitkomst en fouten of onzekerheden hebben geregistreerd. Bij ontbrekende bron of een mislukte write: markeer het document onvoltooid en **triage of verplaats het document niet**. Een vast aantal scanpasses is geen vervanging voor bewijs; dit geldt ook voor podcasts en documenten met bestaande notities.

## Step 2: Autonomous Triage (location fixed, Phase G overridden)

Invoke readwise-triage with location pre-set to `inbox` — do not ask its Phase 0 location question either. Run Phases 1 through F exactly as documented (fetch, auto-archive pre-filter, background processing, presentation). Then override **Phase G** ("Act on User's Decision"): instead of waiting for input, act immediately on the `recommendation` value from Phase B / the background agent, using this mapping:

| recommendation | Action (same mechanics as normal Phase G) |
|---|---|
| `archiveren` | Beschermregel-check, then move to `archive` |
| `later` | Move to / keep in `later` |
| `shortlist` | Move to/keep in `later`, tag `shortlist` |
| `must-read` | Move to/keep in `later`, tag `must-read` |

Replace Phase F's closing question with a one-line auto-action note instead of presenting choices to the user:

`↳ Autonoom: {actie} (aanbeveling: {recommendation}).`

Everything else in readwise-triage is unchanged by "autonomous":
- Podcasts and Tier 2 auto-archive candidates already auto-act in the normal flow — no change needed there.
- Beschermregels (Eleanor Konik, Henrik Karlsson) still force `later` regardless of recommendation.
- Paywall/Tier-1 auto-archive still short-circuits a document with no recommendation to map — its normal auto-archive path applies unchanged, no mapping needed.
- Phase H (linked articles) still runs exactly as documented.

**Geen automatische reorder:** noch deze skill, noch readwise-triage roept `readwise-reorder` aan voor nieuw naar `later` verplaatste documenten. Wil de gebruiker dat die alsnog een `lees-`/`boek-`-positie krijgen, dan is dat een losse, expliciete vervolgstap (`readwise-reorder`, Modus B) — nooit stilzwijgend meelopen in deze pipeline.

**Autonomous removes the wait for user confirmation. It does not remove any safety check, beschermregel, or tagging rule** — those exist independent of who makes the move-decision.

## Step 3: Combined Report

After both phases finish, report one summary instead of the two separate skills' own summaries:

**Inbox klaar — {n} verrijkt, {m} getriaged**
- Verrijkt: {x} met notitie, {y} overgeslagen
- Brondekking: {z}/{n} documenten volledig verwerkt; onvolledige/foutieve documenten apart gerapporteerd
- Getriaged: {a} gearchiveerd, {b} naar later, {c} shortlist, {d} must-read
- ↳ {totaal aantal links toegevoegd aan inbox over beide fases}

Both sub-skills still write their own Obsidian-lognotities (enrich log + triage log) — don't duplicate that content here, just summarize counts.

## Common Mistakes

- Asking the location question for either sub-skill — it's fixed to `inbox`, never ask.
- Treating "autonomous" as license to skip beschermregels, the paywall check, or podcast/Tier-2 handling — only the *user-confirmation wait* in Phase G is removed, nothing else.
- Presenting Phase F's normal multiple-choice question ("Archive / Later / Shortlist / ...") — replace it with the one-line auto-action note instead.
- Running triage before enrich finishes — enrich must complete first so triage sees up-to-date notes/tags (e.g. `light-reading`) when scoring `later` vs `archiveren`.
- Een document triagen zonder bevestigde brondekking en write-resultaat — een gedeeltelijke enrich is niet voldoende voor autonome verplaatsing.
- Re-adding an automatic call to `readwise-reorder` at the end of Step 2 or Step 3 — that call was deliberately removed; reorder only ever runs as an explicit, separate step the user asks for.
