---
name: readwise-inbox
description: Use when the user wants to fully process the Readwise inbox unattended — enrich and triage every inbox document in one run, with triage decisions applied automatically instead of asked per document. Triggers — "clear the inbox", "process inbox autonomously/automatisch", "enrich and triage inbox", "run the inbox pipeline", "ruim de inbox op zonder te vragen".
---

# Readwise Inbox

## V2 inboxcontract

Read [`../readwise-reference.md`](../readwise-reference.md) before invoking the sub-skills in the repository checkout. When installed separately, locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or `/mnt/c/dev/top-articles`, then read `<repository>/skills/readwise-reference.md`; do not assume the relative link exists. The reference's V2 verrijkingscontract and V2 triageroutering govern this pipeline, including the strict target-page/doelpagina gate. Full-source coverage and evidence-based targeted rereading replace any legacy fixed pass requirement; a document is complete only when its actual source, result, errors, metadata write, and move outcome are recorded in the manifest. Preserve personal notes/feedback and non-content tags, and do not route a failed or incomplete document as successfully processed.

## Overview

Chains **readwise-enrich** and **readwise-triage** against Reader's `location=new` (the user-facing Inbox) in one unattended run. Enrich tags and summarizes every fresh New document first; triage then routes podcasts and Tier 1 to Archive and every other successfully processed document to Later, without waiting for a per-document user decision.

**REQUIRED SUB-SKILLS:** readwise-enrich, readwise-triage. This skill fixes both sub-skills to `location=new` and uses the standard automatic route. Every other rule in both sub-skills — taxonomy, note format, source/manifest contract, podcast handling, linked-article extraction, logging, and controlled moves — applies unmodified.

## When to Use

- User asks to run enrich + triage on the inbox back-to-back
- User says "autonomous"/"autonoom", "automatisch", "zonder te vragen" together with inbox processing
- **Not** for `feed` or `later` — this skill is inbox-only. For other locations, or if the user wants to review triage picks interactively, invoke readwise-enrich / readwise-triage directly instead.

## Direct output

Before any tool call: output exactly `Inbox-pipeline starten...`

## Step 1: Enrich (unmodified, location fixed)

Invoke readwise-enrich with Reader location pre-set to `new` (the user-facing Inbox) — do **not** ask its Phase 0 location question. Preserve unknown or personal notes by default. Run its Steps 1–7 exactly as documented and let it finish completely before Step 2.

**Brondekking is een harde poort:** voor ieder document dat deze pipeline wil doorgeven, moet `readwise-enrich` de volledige beschikbare bron, de feitelijke notitie/highlight-uitkomst en fouten of onzekerheden hebben geregistreerd. Bij ontbrekende bron of een mislukte write: markeer het document onvoltooid en **triage of verplaats het document niet**. Een vast aantal scanpasses is geen vervanging voor bewijs; dit geldt ook voor podcasts en documenten met bestaande notities.

Maak van `new` een verse, volledige gepagineerde snapshot. Verwerk die snapshot, haal daarna opnieuw alle New-pagina's op en herhaal totdat er geen nieuwe verwerkbare ID's meer overblijven. Een lege tussenpagina of één lege fetch is geen bewijs dat Inbox klaar is. Bewaar `source_status`, snapshot, provenance, broncache, één verantwoordelijke linkpass en move-uitkomsten in hetzelfde runmanifest; skips en fouten blijven zichtbaar.

## Step 2: Autonomous Triage (location fixed, Phase G overridden)

Invoke readwise-triage with Reader location pre-set to `new` — do not ask its Phase 0 location question either. Run Phases 1 through F exactly as documented (fetch, Tier 1 pre-filter, background processing, manifest/reporting). Then apply the shared standard route without waiting for input:

| result | Action |
|---|---|
| podcast or Tier 1 | Move to `archive` with the controlled Reader-move operation |
| other complete success | Move to `later` with the controlled Reader-move operation |
| partial, missing, error, or failed write | Do not move; keep manifest/provenance visible |

Replace Phase F's closing question with a one-line auto-action note instead of presenting choices to the user:

`↳ Autonoom: {actie} (aanbeveling: {recommendation}).`

Everything else in readwise-triage remains active:
- Former Tier 2 candidates are ordinary Later documents, never an automatic archive class.
- Konik/Karlsson have no absolute triage protection; their regular Later documents are protected by the automatic `want-to-read` priority flow.
- Paywall/Tier 1 handling uses the controlled Reader move and records its result; incomplete or failed work is not counted as successful.
- Phase H (linked articles) uses the strict target-page gate and full library/Feed/run deduplication.

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

- Asking the location question for either sub-skill — both are fixed to Reader location `new`, never ask.
- Treating "autonomous" as license to skip the source/manifest contract, paywall check, or controlled move result — only the *user-confirmation wait* is removed, nothing else.
- Presenting Phase F's normal multiple-choice question ("Archive / Later / Shortlist / ...") — replace it with the one-line auto-action note instead.
- Running triage before enrich finishes — enrich must complete first so triage sees up-to-date notes/tags (e.g. `light-reading`) and confirmed write outcomes.
- Een document triagen zonder bevestigde brondekking en write-resultaat — een gedeeltelijke enrich is niet voldoende voor autonome verplaatsing.
- Re-adding an automatic call to `readwise-reorder` at the end of Step 2 or Step 3 — that call was deliberately removed; reorder only ever runs as an explicit, separate step the user asks for.
