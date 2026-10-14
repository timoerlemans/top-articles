---
name: readwise-summarize
description: Summarize Readwise Reader documents from complete source evidence and save safe, resumable document notes without overwriting personal text.
---

You are summarizing documents in the user's Readwise Reader library and saving each summary as a document note. Follow this process carefully.

## V2 verrijkingscontract

Read [`../readwise-reference.md`](../readwise-reference.md) first in the repository checkout. When installed separately, locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or `/mnt/c/dev/top-articles`, then read `<repository>/skills/readwise-reference.md`; do not assume the relative link exists. The reference's V2 verrijkingscontract governs this skill. Summaries use the complete available source, record `complete`/`partial`/`missing`/`error` bronstatus, preserve personal notes and `Feedback:` text, replace only `pipeline-managed` text, deduplicate exact highlights, and use confirmed Reader commands only. A generated summary, metadata excerpt, title, or partial body is never evidence that the full source was read. Record actual analysis/write outcomes in a resumable manifest and report incomplete/error results separately.

**Direct output:** Voordat je ook maar één tool aanroept of vraag stelt, output precies deze regel: `Documenten samenvatten...`

## Readwise Access

Check if Readwise MCP tools are available (e.g. `mcp__readwise__reader_list_documents`). If they are, use them throughout. If not, use the equivalent `readwise` CLI commands. The instructions below reference MCP tool names.

## Setup

Ask the user which location to summarize, unless they already specified one or provided a document ID:

> Which location would you like to summarize?
> - **inbox** (new/unread) — default
> - **later**
> - **feed**
> - Or paste a specific document ID

Also ask whether existing notes have an explicitly owned pipeline segment to regenerate. Default is to preserve unknown or personal note text; never interpret that choice as permission to overwrite it.

## Step 1: Fetch Documents

Fetch documents using `mcp__readwise__reader_list_documents` with:

```
location = <chosen location>
limit = 50
response_fields = ["title", "author", "site_name", "summary", "notes", "category"]
```

Note: `id` is always included automatically — do NOT add it to `response_fields`.

If the user provided a specific document ID, fetch only that document using `mcp__readwise__reader_get_document_details`.

## Gebruikersprofiel (interesses)

Gebruik dit profiel om relevantie te bepalen voor de "Waarom lezen" sectie. Het toverwoord is **toegankelijk + diepgang** — essays met een stem, niet droge rapporten.

**Kerninteresses:**
- **AI:** Anthropic-nieuws, modellen, tools, maar ook ethische en maatschappelijke reflectie
- **Filosofie:** sociale/politieke filosofie eerst (macht & structuur, individu vs. gemeenschap/zingeving, politieke theorie — incl. sterke interesse in anarchisme: Kropotkin, Bakunin, Goldman, Graeber, en Frankfurter Schule als toegankelijke intro), dan filosofie van de geest (vrije wil, persoonlijke identiteit) en taalfilosofie, dan ethiek (existentialisme: Camus/Nietzsche/Sartre, klassieke ethiek Kant/utilisme, deugdethiek). Kennisniveau ligt over de hele linie laag (1-2/4) — ook bij vertrouwd ogende onderwerpen geen voorkennis aannemen, toegankelijk instapmateriaal blijft de norm. **Saturatie, actief minder aanbieden:** AI/tech-filosofie en Arendt/totalitarisme/fascisme (alleen bij écht actuele verbanden of diepgaande stukken) — Arendt zelf blijft relevant, o.a. via haar arbeid/werk-onderscheid. Volledige kaart: `Atlas/Notes/Concepts/Filosofische interessekaart.md`.
- **Politieke ideologieën:** socialisme, communisme, fascisme, anarchisme, autoritaire regimes — analytisch
- **Geschiedenis:** West-Europees, post-16e eeuw; cultuur- en ideeëngeschiedenis
- **Sociologie & maatschappij:** sociale structuren, ongelijkheid, urbanisme, Nederlandse samenleving
- **Essay schrijven:** schrijfcraft, het essay als vorm, schrijfprocessen van auteurs
- **Fantasy & sciencefiction:** thematische analyse en lore deep dives
- **Games, films & series als cultuurvorm:** culturele impact, thema's, narratief — geen nieuws
- **PKM & kennisbeheer:** Obsidian, notities, leerstrategieën
- **Ouderschap van zorgintensieve kinderen:** reflectief, emotionele kant
- **Front-end software development:** kerninteresse in webontwikkeling aan de voorkant: HTML, CSS, JavaScript, browser- en UI-architectuur, toegankelijkheid, responsive design, performance, design systems en developer experience. Weeg ook de wisselwerking tussen gebruikerservaring, techniek en product/organisatie mee.

**Tweede laag:**
- **Software development:** bredere interesse in softwareontwikkeling, programmeerconcepten, software-architectuur en developer tooling; front-end software development heeft prioriteit als kerninteresse.

## Step 1b: Auto-filter (before the loop)

Before entering the per-document loop, scan the metadata from Step 1 to skip documents without fetching their content. Use `title`, `category`, `summary`, and `notes` only.

**Skip entirely:**
- Receipts, payment confirmations, order updates
- Verification codes, magic links, login emails
- Follow/like notifications with no content
- Documents that already have a note AND the user chose "skip existing"

Collect skipped IDs. Report in Step 4: `X documenten overgeslagen`.

**Continue** with the remaining documents only.

---

## Step 2: Fetch Full Content, Generate Summaries and Highlights

For each document, **dispatch the full-content fetch and the HTML fetch in the same turn — they are independent API calls and can run in parallel:**

- `mcp__readwise__reader_get_document_details(document_id=<id>)` — for summary generation
- `mcp__readwise__reader_list_documents(id=<id>, response_fields=["html_content"])` — for highlight selection

Wait for both before proceeding with Step 2 / 2b below.

Always use the full content as the source for the note — never the pre-computed `summary` field.

If the result exceeds context limits and is saved to a file, extract the complete content with `jq`:
```bash
jq '.content' /path/to/saved-file.json
```
Als `jq` niet werkt: gebruik DuckDB. Als ook dat niet werkt: python3 als laatste redmiddel.

- **If full content is available:** summarize from the actual text and mark the source `complete`.
- **If content is partial, empty, or unavailable:** do not write a source-based note. Mark the document `partial`, `missing`, or `error`, preserve the existing note, and report the concrete missing source or fetch error.

**Note format — every note starts with a leesbeslissing, followed by the content summary:**

```
<!-- pipeline-managed: readwise-enrichment/v2:start -->
Waarom lezen: [1–2 zinnen — noem expliciet welk interessegebied dit raakt (bijv. "Raakt je interesse in filosofie / AI / leren") + wat de meerwaarde is]
Beste moment: [kies uit de lijst hieronder]

[content summary hier]
<!-- pipeline-managed: readwise-enrichment/v2:end -->
```

**Vaste moodvocabulaire voor "Beste moment" (kies het meest passende):**
- **analytisch** — dichte theorie, argumenten, filosofie, onderzoek
- **reflectief** — persoonlijke groei, betekenis, dagboekachtige teksten
- **leergierig** — how-to's, tutorials, structurele kennis, meta-learning
- **ontspannen** — lichte essays, narratieve non-fictie, cultuur, humor
- **geconcentreerd** — lange of complexe teksten die volledige aandacht vragen
- **geïnspireerd** — creatieve of motiverende content
- **kritisch** — politiek, nieuws, opinie, maatschappij

Gebruik altijd precies dit woord (lowercase) zodat gesuggereerde artikelen later op mood gefilterd kunnen worden.

**Content summary — choose based on document type:**

- **Articles / essays:** 3–5 bullet points, each capturing a distinct idea, argument, or finding. Start each bullet with a verb or key concept.
- **Newsletters / roundups:** 2–3 sentence prose summary covering the main theme and 1–2 highlights.
- **Podcasts / videos:** 2–4 bullets on main topics discussed.
- **Receipts / notifications / verification codes:** skip — not worth summarizing.

Write the entire note in **Dutch** unless the source is English and the content is highly technical (then English is fine). "Waarom lezen" en "Beste moment" zijn altijd in het Nederlands.

**Skip conditions (do not generate a note):**
- Document is a receipt, payment confirmation, or verification code
- Complete source content is unavailable or the fetch returned only a partial body
- Existing note ownership is unknown or personal; preserve it and report the document for review

### 2b. Identify Highlights (1–2 passages per document when justified)

Use the complete `html_content` already fetched in parallel at the start of Step 2. Record the source status and any targeted reread in the manifest; do not treat the metadata summary or a partial HTML response as sufficient.

Select **1–2 passages** worth highlighting. Rules:
1. The passage must appear inside a `<p>` tag in the html_content.
2. The `<p>` tag must contain **no `<a href>` links** — these fail consistently. Skip them.
3. **For email newsletters (category: email):** only paragraphs with ASCII-clean text match. Curly quotes (`'`, `"`, `—`) cause failures. Prefer short, plain-text paragraphs.

Good candidates: striking claims, key definitions, memorable sentences, anchoring statistics.

Store the exact `<p>` tag (with all style attributes, verbatim) for use in Step 3b.

If no eligible paragraphs exist: record `highlights: []` with that reason. Deduplicate against existing Reader-highlights and the current run before creating anything. If a highlight call errors, record the per-document error and do not retry with modified text; use the exact passage for a fallback only when that fallback is available and does not overwrite existing content.

## Step 3: Apply Notes in Bulk (+ highlights in parallel)

Collect all `(document_id, note_text)` pairs, then apply in batches of up to 50. **Run highlight creation calls in parallel with this bulk call.**

```
mcp__readwise__reader_bulk_edit_document_metadata(
  documents = [
    { document_id: <id>, notes: "<note text>" },
    ...
  ]
)
```

**Important:** a notes write replaces the submitted value. Submit it only when the live note contains an explicitly `pipeline-managed` segment that can be replaced safely. Preserve personal text, unknown-owned text, and the final `Feedback:` paragraph; if ownership is unknown, omit `notes` and report `ownership-unknown`. A skipped note must not be sent as `null` or an empty string.

### Step 3b: Create Highlights (parallel with Step 3)

For each document with highlight candidates from Step 2b, call `mcp__readwise__reader_create_highlight` with the **exact** `<p>` tag (including all style attributes, verbatim):

```
mcp__readwise__reader_create_highlight(
  document_id = <id>,
  html_content = "<p style=\"...\">exact paragraph text here</p>"
)
```

If a highlight returns an error, record it in the run manifest and report it separately. Do **not** retry with modified text.

## Step 4: Write the run manifest and report results

Before reporting, write `.tmp/readwise/summarize-manifest-{runId}.json` with the requested paginated document set, source fields/fingerprints, and one result per document. Record `source_status`, targeted rereads, analysis status, note-write outcome, highlight successes/errors, fallback path, ownership uncertainty, and stable operation keys. A resumed run skips only operation keys with a confirmed successful write; all other outcomes remain actionable. Keep partial and error results separate from successful summaries.

After processing, present a compact summary:

**Summarizing complete — {n} noted, {m} skipped**

| Titel | Notitie (preview) |
|-------|-------------------|
| {title} | {first 80 chars of note}… |
| ... | ... |

Skipped documents (reason):
- {title} — {reason: already had note / no content / receipt/notification}

If there are more documents beyond the current batch, offer to continue with the next page using the `nextPageCursor`.

## Notes

- Keep notes concise — the goal is quick recall, not re-reading.
- Do not include meta-commentary like "This article discusses..." — go straight to the content.
- For feed items, bullet points are almost always better than prose.
- Never summarize documents that are clearly administrative (receipts, codes, follow notifications).
- `professional documents` like contracts or specs: one-sentence summary of purpose + key numbers/dates if present.
