---
name: readwise-enrich
description: Tag and summarize Readwise Reader documents from complete source evidence, with targeted rereading, safe note/highlight preservation, and resumable outcomes.
---

You are enriching documents in the user's Readwise Reader library by tagging and summarizing them from complete source evidence. Fetch reusable source material once where possible, process tagging and notes together, and reread only targeted sections when the evidence requires it. Follow this process carefully.

## V2 verrijkingscontract

Read [`../readwise-reference.md`](../readwise-reference.md) first in the repository checkout. When installed separately, locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or `/mnt/c/dev/top-articles`, then read `<repository>/skills/readwise-reference.md`; do not assume the relative link exists. Its V2 verrijkingscontract, evidence, feedback, alias, tag-preservation, preferred-author, and command-discovery rules supersede older duplicated examples in this file. Use the complete available source, record `complete`/`partial`/`missing`/`error` bronstatus per document, and reread only targeted sections when evidence is uncertain. Preserve personal notes and the last `Feedback:` paragraph, replace only `pipeline-managed` note text, deduplicate exact highlights, and retain a run manifest with actual analysis/write outcomes so the work can be resumed. A metadata summary, title, partial body, or fixed pass count is never a substitute for full source evidence.

**Direct output:** Voordat je ook maar één tool aanroept of vraag stelt, output precies deze regel: `Documenten verrijken...`

## Readwise Access

Check if Readwise MCP tools are available (e.g. `mcp__readwise__reader_list_documents`). If they are, use them throughout. If not, use the equivalent `readwise` CLI commands. The instructions below reference MCP tool names.

## Taxonomy

Always pick from this list of tags. Use lowercase exactly as written:

- `learning & meta-learning`
- `behavioral psychology & coaching`
- `adhd & neurodivergence`
- `political philosophy`
- `totalitarianism & fascism`
- `ai ethics & society`
- `philosophy`
- `history`
- `sociology & social structures`
- `economics`
- `technology`
- `science`
- `arts & culture`
- `fiction`
- `games`
- `current affairs & politics`
- `business & startups`
- `professional development`
- `health & wellness`
- `personal growth & life philosophy`
- `environment & sustainability`
- `food & cooking`
- `sports & recreation`
- `entertainment & pop culture`
- `research papers & academia`
- `professional documents`
- `software development`
- `front-end software development`
- `scrum`
- `agile`

If no category fits, create a fitting custom lowercase tag (e.g. `linguistics`, `urban planning`).

## Grote batches: duckdb-fallback

Als een MCP-batch te groot is om direct in context te verwerken (>50 documenten of context-overload), sla de respons op als tijdelijk JSON-bestand via `Write` naar `.tmp/readwise/rw_docs.json` en gebruik `duckdb` voor filtering:

```bash
# Welke documenten hebben nog geen notitie?
duckdb -c "SELECT id, title, author FROM read_json_auto('.tmp/readwise/rw_docs.json') WHERE notes IS NULL OR notes = '' LIMIT 20"

# Hoeveel per locatie?
duckdb -c "SELECT location, COUNT(*) as n FROM read_json_auto('.tmp/readwise/rw_docs.json') GROUP BY location"

# Top tags in de batch
duckdb -c "SELECT unnest(tags) as tag, COUNT(*) as n FROM read_json_auto('.tmp/readwise/rw_docs.json') GROUP BY tag ORDER BY n DESC LIMIT 10"
```

**Werkwijze bij grote batch:** sla op → filter met duckdb → verwerk de gefilterde subset via de normale stappen hieronder. Gebruik python3 alleen als duckdb de JSON-structuur niet kan parsen.

---

## Setup

Ask the user which location to enrich, unless already specified:

> Which location would you like to enrich?
> - **feed (unseen)** — default
> - **feed (all seen)**
> - **inbox** (new/unread)
> - **later**
> - **all locations (unenriched only)** — scans `later` and `feed` for documents with no note
> - Or paste a specific document ID

Also ask whether an existing note has an explicitly `pipeline-managed` segment that may be regenerated. Default is to preserve unknown or personal notes and report `ownership-unknown`; this is not permission to overwrite them. Tags are handled separately under the shared tag-preservation contract.

## Step 1: Fetch Documents

### Standard mode (single location)

Fetch using `mcp__readwise__reader_list_documents`:

```
location = <chosen location>
seen = false          # for "feed unseen" only — omit otherwise
limit = 50
response_fields = ["title", "author", "site_name", "summary", "tags", "notes", "category"]
```

Note: `id` is always included automatically — do NOT add it to `response_fields`.

For a specific document ID: use `mcp__readwise__reader_get_document_details` and process that single document.

### All locations (unenriched only) mode

When the user selects **"all locations (unenriched only)"**, perform a scan-first approach:

**Phase 1 — Scan all locations for unenriched documents:**

For each location in order: `later`, `feed`:

```
mcp__readwise__reader_list_documents(
  location = <location>,
  limit = 50,
  page_cursor = <cursor if paginating>,
  response_fields = ["title", "notes", "tags", "category", "author", "site_name", "summary"]
)
```

Paginate through all pages. Collect only documents where `notes` is `null` or empty string. Keep track of which location each document came from (needed for the tracker in Step 4).

Report a brief scan summary before proceeding:
> Scan complete: found **{n}** unenriched documents across `later` ({x}), `feed` ({y}).

**Phase 2 — Enrich collected documents:**

Proceed with Step 2 for each collected document, fetching full content via `reader_get_document_details`. Process one document at a time: after each document is analyzed, immediately apply the update (Step 3) and update the tracker (Step 4) before moving to the next document.

## Gebruikersprofiel (interesses)

Gebruik dit profiel om relevantie en raakvlakken te bepalen voor de "Waarom lezen" sectie. Het toverwoord is **toegankelijk + diepgang**: populair-wetenschappelijk is prima, academisch mag, maar het moet altijd een stem hebben — een schrijver die denkt, niet een instituut dat rapporteert.

### Leesstijl
- Voorkeur voor **essays** die aan het denken zetten, al dan niet gecombineerd met persoonlijke anecdotes of reflecties
- Humor naast diepgang werkt goed (Lubach, Casually Explained-stijl)
- Onbekende auteur met essayistische, reflectieve schrijfstijl → twijfelgeval, bewaren als het onderwerp ook maar raakvlak heeft

### Kerninteresses (altijd relevant)
- **AI:** Anthropic-nieuws, nieuwe modellen en tools, maar ook ethische en maatschappelijke reflectie op AI
- **Filosofie:** sociale/politieke filosofie eerst (macht & structuur, individu vs. gemeenschap/zingeving, politieke theorie — incl. sterke interesse in anarchisme: Kropotkin, Bakunin, Goldman, Graeber, en Frankfurter Schule als toegankelijke intro), dan filosofie van de geest (vrije wil, persoonlijke identiteit) en taalfilosofie, dan ethiek (existentialisme: Camus/Nietzsche/Sartre, klassieke ethiek Kant/utilisme, deugdethiek). Kennisniveau ligt over de hele linie laag (1-2/4) — ook bij vertrouwd ogende onderwerpen geen voorkennis aannemen, toegankelijk instapmateriaal blijft de norm. **Saturatie, actief minder aanbieden:** AI/tech-filosofie en Arendt/totalitarisme/fascisme (alleen bij écht actuele verbanden of diepgaande stukken) — Arendt zelf blijft relevant, o.a. via haar arbeid/werk-onderscheid. Volledige kaart: `Atlas/Notes/Concepts/Filosofische interessekaart.md`.
- **Politieke ideologieën:** socialisme, communisme, fascisme, anarchisme, autoritaire regimes — analytisch, niet als nieuws
- **Geschiedenis:** West-Europees, post-16e eeuw; ook cultuurgeschiedenis en ideeëngeschiedenis
- **Sociologie & maatschappij:** sociale structuren, ongelijkheid, urbanisme (Not Just Bikes-stijl: fietssteden, ruimtelijke ordening), Nederlandse samenleving
- **Essay schrijven:** schrijfcraft, het essay als vorm, schrijfprocessen van auteurs
- **Fantasy & sciencefiction:** thematische analyse, besprekingen, lore deep dives — niet per se reviews
- **Games, films & series als cultuurvorm:** culturele impact, thema's, narratief (Nerdstalgic/Thomas Flight-stijl — geen gaming- of filmnieuws)
- **PKM & kennisbeheer:** Obsidian, notities, leerstrategieën, zelfgestuurd leren (Linking Your Thinking, Bryan Jenks, Nicole van der Hoeven)
- **Ouderschap van zorgintensieve kinderen:** reflectief, emotionele kant — niet praktische how-to's
- **Front-end software development:** kerninteresse in webontwikkeling aan de voorkant: HTML, CSS, JavaScript, browser- en UI-architectuur, toegankelijkheid, responsive design, performance, design systems en developer experience. Weeg ook de wisselwerking tussen gebruikerservaring, techniek en product/organisatie mee.
- **Agile werken (breed, niet alleen scrum):** scrum, kanban, lean, agile coaching, servant leadership, teamdynamiek, sprintplanning, retrospectives, agile transformaties & organisatieverandering (leiderschap), product management/product owner-onderwerpen (PM's, roadmapping, prioriteren), velocity & flow-metrics (cycle time, throughput, burndown/burnup, DORA), OKR's, scaled agile (SAFe, LeSS, Spotify-model), psychologische veiligheid & high-performing teams — beroepsmatig relevant (gebruiker is Scrum Master)

### Tweede laag (bewaren als kwaliteit hoog is)
- **Geografie & kartografie:** nieuwsgierig-educatief (Map Men-stijl), niet droog
- **Wetenschap & technologie:** verwonderend en toegankelijk (Veritasium/Tom Scott-stijl)
- **Software development:** bredere interesse in softwareontwikkeling, programmeerconcepten, software-architectuur en developer tooling; front-end software development heeft prioriteit als kerninteresse. Tutorials zonder diepgang blijven minder relevant.
- **Nederlandse politiek & cultuur:** dieper dan dagelijks nieuws, analyserend

### Niet relevant / sneller archiveren
- Waan van de dag, politiek nieuws zonder analytische laag
- Oppervlakkige zelfhulp of productiviteitstips zonder substantie
- Gaming- of filmnieuws (wél culturele analyse)
- Tooltips/tutorials zonder diepgang
- Droge academische teksten zonder persoonlijke stem
- Ook bewaren als er concreet iets van te leren valt dat toepasbaar is in het leven, mits meer dan oppervlakkige zelfhulp of generieke productiviteitstips

### Geografische context (weeg mee in Waarom lezen)
- **Gebruiker is Nederlands**, woont in Nederland, leest en schrijft in het Nederlands
- **Nederlandstalige artikelen**: verhoog de relevantieomschrijving in "Waarom lezen" een halve trede — leesbaarheid en culturele herkenbaarheid zijn direct een pluspunt
- **Artikelen over de Nederlandse situatie** (politiek, samenleving, arbeidsmarkt, zorg, cultuur): benadruk de Nederlandse relevantie expliciet in "Waarom lezen"
- **Specifiek Amerikaans-gerichte content**: verlaag de urgentie in "Waarom lezen" als de context uitsluitend Amerikaans is — tenzij de inzichten universeel toepasbaar zijn

## Step 1b: Auto-filter (before the loop)

Before entering the per-document loop, scan the metadata from Step 1 to identify documents that should be skipped entirely (no tag, no note, no API fetches). Base this on `title`, `category`, and `summary` only — no content fetch needed.

**Skip entirely (collect IDs, log at end):**
- Receipts, payment confirmations, order updates
- Verification codes, magic links, login emails
- Follow/like notifications with no content
- Pure promotional emails (webinar reminders, discount announcements, "last chance" offers)

Collect the IDs of skipped documents in a `skipped_ids` list. Do **not** process them further. Report in Step 5: `X documenten overgeslagen (geen relevante inhoud)`.

**Continue** with the remaining documents in the Step 2 loop.

---

## Podcast-aanpak

Podcasts (`category = "podcast"`) volgen dezelfde bronstatusregels. Als een volledige transcript beschikbaar is, kunnen notitie, highlights en tags worden verwerkt. Bij alleen shownotes of een beschrijving is de bron `partial`: maak geen volledige notitie of bron-highlights, pas alleen expliciet veilige deeluitkomsten toe en rapporteer het document apart in Step 5. Na complete verwerking rapporteer je podcasts apart met de melding dat ze gearchiveerd kunnen worden (de gebruiker luistert ze in een andere app).

**Regels voor podcasts:**
- Scan de gehele tekst op highlights — geen minimum of maximum; shownotes, citaten, kernargumenten
- Transcript: de volledige transcript (indien beschikbaar) zit in `html_content`. Niet beschikbaar via MCP: registreer `partial` en gebruik shownotes/beschrijving niet als vervanging voor volledige bronanalyse.
- Rapporteer in Step 5: `X podcasts verrijkt — klaar om te archiveren`

---

## Pre-fetch Pipeline (background subagent)

Om wachttijd te minimaliseren wordt de content van het volgende document al opgehaald terwijl het huidige wordt verwerkt.

**Vóór de loop:** start een background subagent voor de pre-fetch van doc[0].

**Aan het begin van elke iteratie:**
1. Lees pre-fetch resultaat van `.tmp/readwise/enrich_prefetch_{id}.json`.
2. Als er een volgend document (doc[i+1]) bestaat: start **direct** een background subagent voor de pre-fetch van doc[i+1] — parallel met de analyse van het huidige document.
3. Verwerk het huidige document met de pre-fetched content (zie Step 2b/2c hieronder).

**Template voor de subagent-prompt** (gebruik exact):

```
Fetch and cache Readwise document content for enrichment pipeline.

Document ID: {id}

Perform these two API calls IN PARALLEL:
1. mcp__readwise__reader_list_documents with id="{id}" and response_fields=["html_content"]
2. mcp__readwise__reader_get_document_details with document_id="{id}"

Save results to .tmp/readwise/enrich_prefetch_{id}.json as JSON:
{"html_content": "...", "full_content": "..."}

If either call fails, save null for that field. No retries. No analysis.
```

**Fallback:** Als `.tmp/readwise/enrich_prefetch_{id}.json` niet beschikbaar is (subagent nog bezig of gefaald): haal de content direct op via de normale methode in Step 2b/2c.

---

## Step 2: Classify and Summarize (per document)

For each document, determine **both** within the same processing turn when the reusable source is already available. **Run steps 2b and 2c as parallel API calls in the same turn** — they are independent of each other and can be dispatched simultaneously.

### 2a. Tags (1–3)
Use `title` + `author` + `site_name` + `summary` to pick the best tags from the taxonomy.
- If document already has correct taxonomy tags: keep them (include in the update).
- If tags are vague, wrong, or missing: replace with better ones.
- Prefer specificity. Max 3 tags, 1–2 is usually right.
- Extra, buiten de 1–3-limiet: als 2c uitkomt op `Beste moment: ontspannen`, voeg dan ook `light-reading` toe (zie 2c hieronder).

**Taaldetectie:** bepaal de taal van de **originele tekst** (`html_content` of `content` — nooit de `summary` of `notes`, die zijn altijd Nederlands door het enrich-proces) als ISO-code (`nl`, `en`, `de`, `fr`, ...). Is content niet beschikbaar: gebruik de titel als proxy. Geef dit mee als `language` in dezelfde `bulk_edit_document_metadata`-aanroep als Stap 3 (notes + tags) — geen aparte taaltag meer nodig.

### 2b. Highlights and source coverage

Always use `html_content` as the authoritative source for highlight selection — do **not** rely on the `content` field from `get_document_details`, which may return markdown.

Leg vóór de selectie vast of `html_content` de volledige bruikbare bron bevat. Registreer per document `source_status` (`complete`, `partial`, `missing` of `error`), de gebruikte bronvelden en eventuele gerichte herlezingen. Analyseer een complete bron één keer inhoudelijk en herlees alleen het hoofdstuk, argument of passagegebied dat extra zekerheid vraagt. Er is geen minimum aantal highlights en geen vaste pass-teller; voeg nooit opvul-highlights toe.

**Check pre-fetch first:** if `.tmp/readwise/enrich_prefetch_{id}.json` exists and `html_content` is not null, use that value directly. Otherwise fetch:

```
mcp__readwise__reader_list_documents(id=<id>, response_fields=["html_content"])
```

Scan de **gehele tekst** op highlight-waardige passages. Er is geen minimum of maximum — highlight alles dat de kwaliteitsdrempel haalt. Goede kandidaten: trefzekere claims, sleuteldefinities, memorabele zinnen, ankerende statistieken, verrassende paradoxen. Sla alleen contextzinnen en overgangen over. Kopieer elke passage exact zoals hij in `html_content` staat.

Als er geen geschikte passages zijn: registreer `highlights: []` met die reden. Is de originele bron niet beschikbaar of slechts gedeeltelijk, maak dan geen bronafhankelijke highlightselectie en rapporteer het document als `partial`, `missing` of `error`; verzin geen tekst en retry niet met een andere bron. Tags mogen alleen als aparte gedeeltelijke uitkomst worden toegepast wanneer de live tagset compleet genoeg is.

### 2c. Note (summary)
Never use the pre-computed `summary` field as the source for the note — it is too brief.

**Check pre-fetch first:** if `.tmp/readwise/enrich_prefetch_{id}.json` exists and `full_content` is not null, use that value directly. Otherwise call `mcp__readwise__reader_get_document_details` to retrieve the full content.

If the result exceeds context limits and is saved to a file, extract the content with `jq` — single-document JSON, not tabular:
```bash
jq '.content' /path/to/saved-file.json
```
Als `jq` niet werkt: gebruik DuckDB. Als ook dat niet werkt: python3 als laatste redmiddel.

- **If full content is available:** summarize from the actual text.
- **If content is partial, empty, or unavailable:** do not write a source-based note; mark the document `partial`, `missing`, or `error`, preserve the existing note, and report the concrete reason. Safe tag-only work may remain a separate partial outcome.

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

**`light-reading`-tag:** is `Beste moment: ontspannen` gekozen? Voeg dan altijd ook `light-reading` toe aan de tags in Stap 3 — los van de 1–3-limiet uit 2a, die geldt alleen voor de inhoudelijke taxonomietags. Dit markeert het document als vermakelijk zodat `readwise-triage` het later kan herkennen als geldige `later`-kandidaat, ook zonder leerwaarde of analytische laag.

**Content summary by document type:**
- **Articles / essays:** 3–5 bullets, each capturing a distinct idea or argument. Start each with a key concept.
- **Newsletters / roundups:** 2–3 sentence prose covering the main theme and 1–2 highlights.
- **Podcasts / videos:** 2–4 bullets on main topics.
- **Receipts / notifications / verification codes:** skip entirely (no tag, no note).

Write the entire note in **Dutch** unless the source is English and content is highly technical. "Waarom lezen" en "Beste moment" zijn altijd in het Nederlands.

### 2d. Skip conditions
Skip the entire document (no tag, no note) if:
- It is a receipt, payment confirmation, or verification code
- It is a follow/like notification with no content

Skip only the note (still tag) if:
- Document has an existing note without an explicit `pipeline-managed` segment; preserve it and report `ownership-unknown`
- No content is available after fetching details

## Step 3: Apply Immediately (per document)

After completing Step 2 for a single document, call `mcp__readwise__reader_bulk_edit_document_metadata` for that document or for a bounded batch of at most 50 documents. Do not wait for unrelated documents when a resumable per-document outcome is safer. Run highlight creation only after the source candidate list is recorded, and record metadata and highlight outcomes independently in the run manifest.

Use `bulk_edit_document_metadata` even for a single document when the live tagset is complete — it is the only endpoint that can update both `tags` and `notes` together. If the live tagset is missing or incomplete, update the known tag changes with separate add/remove calls and do not send `tags` in a bulk replacement. The API rate limit is 20 calls/minute, so batch and resume deliberately.

```
documents = [
  { document_id: <id>, tags: ["<all preserved and canonical tags>"], notes: "<pipeline-owned note plus preserved feedback>", language: "nl" }
  // tags includes "light-reading" too if Beste moment: ontspannen (see 2c)
]
```

For documents where only tags are updated (note skipped), omit the `notes` field entirely — do not pass `null` or empty string. Always include `language` when it could be determined in Step 2a.

**Important:** `tags` and `notes` both replace existing values. Include every current non-content tag in a full desired tagset, and replace only the explicitly `pipeline-managed` note segment while preserving personal text plus the final `Feedback:` paragraph. If ownership of existing note text is unknown, omit `notes` entirely; retain the original and report `ownership-unknown`. An omitted note must never be sent as `null` or an empty string.

### Step 3b: Create Highlights (parallel with Step 3)

If the document has highlight candidates from Step 2b, call `mcp__readwise__reader_create_highlight` with the **exact** `<p>` tag (including all style attributes, verbatim):

```
mcp__readwise__reader_create_highlight(
  document_id = <id>,
  html_content = "<p style=\"...\">exact paragraph text here</p>"
)
```

If a highlight returns an error, record the per-document error in the manifest and do **not** retry with modified text. If the exact source passage is still available, save it as a fallback note in Obsidian:

1. **Bestandspad:** `Atlas/Notes/Literature/[Gesaniteerde Titel].md`
   - Saniteer de titel: spaties behouden, tekens `'/\:*?"<>|` vervangen door spatie
2. **Bestand bestaat niet:** maak aan met `Write` met onderstaande frontmatter + het highlight als blockquote onder `## Highlights`
3. **Bestand bestaat al** (bijv. tweede highlight van hetzelfde document, of tweede run): voeg het highlight toe via `Edit` onderaan het `## Highlights`-blok
4. **Frontmatter:**
   ```yaml
   ---
   up:
     - "[[+ Atlas|Atlas]]"
   tags:
     - atlas
     - atlas/literature
   author: <auteur>
   source_url: <url van het document, of leeg als niet beschikbaar>
   creation_date: YYYY-MM-DD
   modified_date: YYYY-MM-DD
   ---
   # [Titel]

   Bron: [auteur] · [url of site_name]

   ## Highlights

   > [highlight-tekst]

   ---
   # Related notes
   - [[YYYY-MM-DD]]
   ```
5. **Wikilink naar _Readwise-notitie:** Zoek in twee mappen met twee verschillende methoden:

   **Full Document Contents** — `fd` op document-ID (exact, geen heuristiek):
   ```bash
   fd "{document_id}" "_Readwise/Full Document Contents/Articles/"
   ```
   Het Reader document-ID staat letterlijk in de bestandsnaam.

   **Articles** — `rg` op source-URL in frontmatter:
   ```bash
   rg "url: {source_url}" "_Readwise/Articles/" -l
   ```
   De originele bron-URL staat in het `url:`-veld van elk `_Readwise/Articles/`-bestand.

   Als gevonden: voeg **alle** matches toe als `- [[{pad zonder .md}|{document-titel}]]` in de Related notes sectie. Voeg alleen toe als die link er nog niet in staat. Als een zoekopdracht niets oplevert: laat die regel weg.
6. Meld de fout niet als succesvolle Reader-highlight. Registreer haar per document in het manifest en vermeld in het eindoverzicht hoeveel passages als literatuurnotitie zijn opgeslagen, plus welke documenten een highlightfout hadden.

## Step 4: Write the run manifest and update the tracker

Before reporting or moving on, write `.tmp/readwise/enrich-manifest-{runId}.json`. It must contain the requested scope and complete paginated document-ID set, `generatedAt`, source fields/fingerprints, and one result per document with `source_status`, targeted rereads, analysis status, metadata-write outcome, highlight successes/errors, fallback path, ownership uncertainty, and stable operation keys. A successful metadata or highlight write is the only reason to mark that operation complete; a resumed run skips only those completed operation keys and verifies live metadata before another full-tagset write. Keep the manifest when anything is partial or failed.

Report `complete`, `partial`, `skipped`, and `error` separately. Never call a document successfully enriched when its source, analysis, metadata write, or requested highlight/fallback outcome is incomplete.

After processing **all** documents in the batch, run the tracker once with all eligible IDs together:

```bash
python3 /mnt/c/obsidian/.claude/scripts/enrich_tracker.py --mark-done <id1> <id2> <id3> ...
```

**Eligibility rules (same as before):**
- Only include documents that received a note (had content, weren't skipped entirely)
- Skip IDs from `feed` — the tracker only covers `later`
- Skip IDs from `inbox` (`new`) — not tracked
- For **"all locations (unenriched only)"** mode: only include IDs from `later`

Collect eligible IDs during the loop. Run the tracker once at the end with all of them.

## Step 5: Report Results

Present a compact summary after each batch:

**Verplichte eindcontrole vóór dit rapport:** controleer het interne verwerkingsregister. Voor ieder document dat als verrijkt wordt gemeld moeten volledige brondekking, gerichte herlezing waar nodig, de feitelijke highlights/notitie-uitkomst en eventuele fouten zijn vastgelegd. Een vaste pass-teller is geen kwaliteitsbewijs; rapporteer de gebruikte dekking en onzekerheden expliciet:

| Titel | Brondekking/herlezing | Highlights opgeslagen |
|-------|------------|-----------------------|
| {title} | volledig / gericht / onvolledig | {n} |

Als bron of verwerking onvolledig is, mag je het document niet als succesvol verrijkt of klaar om te archiveren rapporteren. Leg de resterende concrete actie of fout vast en hervat vanaf de tracker; verzin geen extra passes om een teller te vullen.

**Enriched {n} documents — {m} skipped**

| Titel | Tags | Notitie (preview) |
|-------|------|-------------------|
| {title} | `tag1`, `tag2` | {first 80 chars}… |
| ... | ... | ... |

Skipped:
- {title} — {reason}

If `nextPageCursor` is available, offer to continue with the next batch.

## Step 6: Gelinkte artikelen toevoegen

Na het verwerken van de volledige batch: scan de volledige bron van elk succesvol verwerkt document op links naar inhoudelijk interessante artikelen, essays, papers of longreads. Haal elke doelpagina zelf op en laat die alleen toe wanneer de pagina Nederlands of Engels is, zelfstandig leesbaar is en expliciet aansluit op een kerninteresse. Voeg geen link toe op basis van alleen de anchor-tekst, titel of een metadata-excerpt.

**Actie per URL:**
1. Dedupliceer tegen de volledige Reader-bibliotheek, een volledige Feed-snapshot en de huidige run met `mcp__readwise__reader_search_documents(q="{url}")`. Sla over als aanwezig of al in het runmanifest staat. Een bestaande bestemming blijft ongewijzigd.
2. Toevoegen: `mcp__readwise__reader_create_document(url="{url}", tags=["linked-from-readwise"])`

Registreer per URL `accepted`, `rejected`, `duplicate` of `error` in het runmanifest en vermeld fouten of afgewezen pagina's apart in het eindrapport.

**Sla altijd over:** navigatie, share-links, auteurprofielen, tagpagina's, login/paywall/subscribe-links, productpagina's, social posts zonder zelfstandige inhoud, afbeeldingen, assets.

Rapporteer in het eindoverzicht: `↳ X links toegevoegd aan inbox.`

## Step 7: Obsidian lognotitie

Maak aan het einde van de sessie een lognotitie aan in `Calendar/Logs/`.

**Bestandsnaam:** `{YYYY-MM-DD} Readwise enrich log.md`
Als het bestand al bestaat: voeg toe aan het bestaande bestand.

```yaml
---
up:
  - "[[+ Calendar|Calendar]]"
tags:
  - calendar
  - calendar/logs
creation_date: YYYY-MM-DD
modified_date: YYYY-MM-DD
---
# Readwise enrich log — {YYYY-MM-DD}

## Verrijkt

| Titel | Tags | Locatie |
|-------|------|---------|
| {titel} | `tag1`, `tag2` | later / feed |

## Overgeslagen

- {titel} — {reden}

---
# Related notes
- [[YYYY-MM-DD]]
```

## Tijdelijke bestanden

Gebruik uitsluitend `.tmp/readwise/` voor tijdelijke bestanden (relatief aan de vault-root `/mnt/c/obsidian/`). Maak de map aan als hij niet bestaat: `mkdir -p .tmp/readwise`.

**Opruimen na de sessie:**
```bash
rm -f .tmp/readwise/enrich_prefetch_*.json .tmp/readwise/rw_docs.json
```

---

## Notes

- Always fetch full content via `reader_get_document_details` — never use the pre-computed `summary` field as source for the note, even if it exists. It is too brief.
- Do not make separate calls for tagging and noting — always combine into one `bulk_edit_document_metadata` call per document.
- Keep notes concise — goal is quick recall, not re-reading.
- Do not start notes with "Dit artikel bespreekt..." — go straight to the content.
- `professional documents`: one-sentence summary of purpose + key numbers/dates if present.
- `research papers & academia`: actual academic papers only, not formal writing in general.
