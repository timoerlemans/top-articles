---
name: readwise-triage
description: Triage Reader documents from complete source evidence and route podcasts/Tier 1 to Archive and all other successful documents to Later, with an explicit interactive opt-in.
---

You are triaging documents in the user's Readwise Reader library, one at a time. You fetch full content, summarize it, extract highlights, and route it using the standard automatic flow. Ordinary successfully processed documents go to Later; only an explicitly requested interactive review waits for a per-document decision. Follow this process carefully.

## V2 triagecontract

Read [`../readwise-reference.md`](../readwise-reference.md) first in the repository checkout. When installed separately, locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or `/mnt/c/dev/top-articles`, then read `<repository>/skills/readwise-reference.md`; do not assume the relative link exists. The reference's V2 verrijkingscontract and V2 triageroutering govern this skill. Use the complete available source and record `source_status` (`complete`, `partial`, `missing`, or `error`), targeted rereads, exact highlights, note ownership, per-document metadata/move outcomes, and a resumable manifest. Preserve personal notes and feedback, deduplicate exact highlights, apply the shared target-page/doelpagina link gate, and report incomplete/error outcomes separately from successful triage. Do not use a fixed pass count. The standard route sends podcasts and Tier 1 to Archive and all other successfully processed documents to Later; former Tier 2 is ordinary Later and never an automatic archive route.

**Direct output:** Voordat je ook maar één tool aanroept of vraag stelt, output precies deze regel: `Readwise triage starten...`

## Readwise Access

Check if Readwise MCP tools are available (e.g. `mcp__readwise__reader_list_documents`). If they are, use them throughout. If not, use the equivalent `readwise` CLI commands. The instructions below reference MCP tool names.

## Grote batches: duckdb-fallback

Als de MCP-respons te groot is om direct te verwerken, sla de documentenlijst op via `Write` naar `.tmp/readwise/rw_triage.json` en gebruik `duckdb` om prioriteitsvolgorde te bepalen:

```bash
# Meest recente saves zonder notitie (triage-kandidaten)
duckdb -c "SELECT id, title, author, saved_at FROM read_json_auto('.tmp/readwise/rw_triage.json') WHERE notes IS NULL ORDER BY saved_at DESC LIMIT 10"

# Filter op categorie
duckdb -c "SELECT id, title, category FROM read_json_auto('.tmp/readwise/rw_triage.json') WHERE category = 'article' AND notes IS NULL LIMIT 20"
```

**Werkwijze:** sla op → filter met duckdb → verwerk gefilterde subset één voor één via de normale triageloop hieronder.

---

## Phase 0: Setup

Ask the user which location to triage, unless they already specified one or provided a document ID:

> Which location would you like to triage?
> - **feed (unseen)** — default
> - **inbox** (new/unread)
> - **later**
> - Or paste a specific document ID

When the default is used or the user says "feed", use `location="feed"` with `seen=false`.

## Phase 1: Fetch Document List

Fetch documents from the chosen location:

```
mcp__readwise__reader_list_documents(
  location = <chosen location>,
  seen = false,             # feed only — omit for inbox/later
  limit = 10,
  response_fields = ["title", "author", "category", "word_count", "reading_time", "summary", "saved_at", "site_name", "notes", "tags"]
)
```

Note: `id` is always included automatically — do NOT add it to `response_fields`.

If the user provided a specific document ID, skip this step and go directly to Phase A with that ID.

Give a brief overview before starting:

**{location} · {count} documents to triage**

Then: "Let's work through them one at a time. Starting with the first:"

**Continuation:** When you run out of the current batch of 10 documents, fetch the next 10 and continue seamlessly.

## Gebruikersprofiel (interesses)

Gebruik dit profiel voor "Waarom lezen", "Waarom skippen" en de aanbeveling. Het toverwoord is **toegankelijk + diepgang**: populair-wetenschappelijk is prima, maar het moet altijd een stem hebben — een schrijver die denkt, niet een instituut dat rapporteert.

### Leesstijl
- Voorkeur voor essays die aan het denken zetten, al dan niet met persoonlijke anecdotes of reflecties
- Humor naast diepgang werkt goed
- Onbekende auteur met essayistische, reflectieve schrijfstijl → twijfelgeval, lean toward later als het onderwerp ook maar raakvlak heeft

### Entertainmentwaarde telt ook mee
Een artikel hoeft geen inzicht, les of analytische laag te bieden om `later` te verdienen. Puur vermakelijk — grappig, spannend, meeslepend geschreven — is een geldige eigen reden, **zolang het onderwerp raakt aan een kern- of tweede-laag interesse hieronder**. De toets is niet "leer ik hier iets van?" maar gewoon "wil ik dit lezen?". Denk aan: luchtige pop-cultuurstukken, fandom- of lore-deep-dives, geestige persoonlijke verhalen, speelse besprekingen van games/films/series/boeken zonder diepe these. Buiten de interessegebieden geldt dit niet — entertainment alleen is geen reden om iets te bewaren dat verder nergens raakvlak mee heeft.

### Kerninteresses (altijd relevant)
- **AI:** Anthropic-nieuws, nieuwe modellen en tools, maar ook ethische en maatschappelijke reflectie op AI
- **Filosofie:** sociale/politieke filosofie eerst (macht & structuur, individu vs. gemeenschap/zingeving, politieke theorie — incl. sterke interesse in anarchisme: Kropotkin, Bakunin, Goldman, Graeber, en Frankfurter Schule als toegankelijke intro), dan filosofie van de geest (vrije wil, persoonlijke identiteit) en taalfilosofie, dan ethiek (existentialisme: Camus/Nietzsche/Sartre, klassieke ethiek Kant/utilisme, deugdethiek). Kennisniveau ligt over de hele linie laag (1-2/4) — ook bij vertrouwd ogende onderwerpen geen voorkennis aannemen, toegankelijk instapmateriaal blijft de norm. **Saturatie, actief minder aanbieden:** AI/tech-filosofie en Arendt/totalitarisme/fascisme (alleen bij écht actuele verbanden of diepgaande stukken) — Arendt zelf blijft relevant, o.a. via haar arbeid/werk-onderscheid. Volledige kaart: `Atlas/Notes/Concepts/Filosofische interessekaart.md`.
- **Politieke ideologieën:** socialisme, communisme, fascisme, anarchisme, autoritaire regimes — analytisch, niet als nieuws
- **Geschiedenis:** West-Europees, post-16e eeuw; ook cultuur- en ideeëngeschiedenis
- **Sociologie & maatschappij:** sociale structuren, ongelijkheid, urbanisme, Nederlandse samenleving
- **Essay schrijven:** schrijfcraft, het essay als vorm, schrijfprocessen van auteurs
- **Fantasy & sciencefiction:** thematische analyse, besprekingen, lore deep dives — niet per se reviews
- **Games, films & series als cultuurvorm:** culturele impact, thema's, narratief, maar ook luchtige besprekingen en fandom-deep-dives puur om het plezier — geen kale gaming- of filmnieuwsblurbs (releasedata, verkoopcijfers, castingnieuws zonder inhoud)
- **PKM & kennisbeheer:** Obsidian, notities, leerstrategieën, zelfgestuurd leren
- **Ouderschap van zorgintensieve kinderen:** reflectief, emotionele kant
- **Front-end software development:** kerninteresse in webontwikkeling aan de voorkant: HTML, CSS, JavaScript, browser- en UI-architectuur, toegankelijkheid, responsive design, performance, design systems en developer experience. Weeg ook de wisselwerking tussen gebruikerservaring, techniek en product/organisatie mee.
- **Agile werken (breed, niet alleen scrum):** scrum, kanban, lean, agile coaching, servant leadership, teamdynamiek, sprintplanning, retrospectives, agile transformaties & organisatieverandering (leiderschap), product management/product owner-onderwerpen (PM's, roadmapping, prioriteren), velocity & flow-metrics (cycle time, throughput, burndown/burnup, DORA), OKR's, scaled agile (SAFe, LeSS, Spotify-model), psychologische veiligheid & high-performing teams — beroepsmatig relevant (gebruiker is Scrum Master)

### Tweede laag (later als kwaliteit hoog is)
- Geografie & kartografie (nieuwsgierig-educatief, niet droog)
- Wetenschap & technologie (verwonderend en toegankelijk)
- Software development (bredere interesse in softwareontwikkeling, programmeerconcepten, software-architectuur en developer tooling; front-end software development heeft prioriteit)
- Nederlandse politiek & cultuur (dieper dan dagelijks nieuws)

### Sneller archiveren
- Waan van de dag, politiek nieuws zonder analytische laag
- Oppervlakkige zelfhulp of productiviteitstips zonder substantie
- Kale gaming- of filmnieuwsblurbs zonder inhoud (wél culturele analyse én vermakelijke deep-dives bewaren, zie Entertainmentwaarde hierboven)
- Tooltips/tutorials zonder diepgang
- Droge academische teksten zonder persoonlijke stem
- Ook bewaren als er concreet iets van te leren valt dat toepasbaar is in het leven, mits meer dan oppervlakkige zelfhulp of generieke productiviteitstips
- Ook bewaren als het puur entertainment biedt binnen een interessegebied — zie Entertainmentwaarde hierboven

### Geografische context (weeg mee in aanbeveling)
- **Gebruiker is Nederlands**, woont in Nederland, leest en schrijft in het Nederlands
- **Nederlandstalige artikelen**: verhoog de aanbeveling een halve trede — leesbaarheid en culturele herkenbaarheid zijn direct een pluspunt
- **Artikelen over de Nederlandse situatie** (politiek, samenleving, arbeidsmarkt, zorg, cultuur): verhoog de aanbeveling een halve trede ten opzichte van vergelijkbare buitenlandse content
- **Specifiek Amerikaans-gerichte content**: verlaag de aanbeveling een halve trede als de context uitsluitend Amerikaans is (bijv. US belastingstelsel, US gezondheidszorg, US verkiezingen zonder analytische laag) — tenzij het ideeën of inzichten bevat die universeel toepasbaar zijn
- "Een halve trede" betekent: bij twijfel tussen two opties, kies dan de hogere/lagere op basis van dit criterium

## Controle vóór elk archiveer-besluit

- Konik en Karlsson hebben geen absolute triage-uitzondering. Een podcast, exacte URL-duplicaat of ander aantoonbaar Tier 1-document van deze auteurs volgt dezelfde Archive-route; een regulier Later-document wordt door `want-to-read` in de prioriteitsflow beschermd.
- Controleer vóór een move dat de actuele metadata en het manifest dezelfde document-ID, bronstatus en bestemming tonen. Bij twijfel, ontbrekende bron of onzekere ownership: niet verplaatsen en de onzekerheid rapporteren.

## Phase 2: Tier 1 pre-filter en standaardrouting

Before entering the triage loop, scan **all** documents from Phase 1 using their `title`, `summary`, `category`, `source_url`, and readable metadata only — **no content fetch needed**. Identify only safe Tier 1 candidates before enrichment. All other documents continue through complete-source triage and default to Later after successful processing.

### Duplicaatdetectie (vóór Tier 1/2)

Controleer voor elk document of de URL al elders in de Readwise-library staat:

```
mcp__readwise__reader_search_documents(q="{source_url}", limit=5)
```

Als de resultaten een document bevatten met een **ander ID maar dezelfde URL** → markeer als **duplicaat**. Behandel duplicaten als Tier 1: direct archiveren, geen enrichment — de andere kopie blijft bewaard.

Rapporteer: `X duplicaten direct gearchiveerd: [titles] (al aanwezig in library als [locatie])`

### Tier 1: Direct archiveren — geen bronafhankelijke enrichment

Documenten **zonder zelfstandige leesbare inhoud of al aanwezig**:
- **Duplicaten** — URL al aanwezig in library onder ander document-ID (zie Duplicaatdetectie hierboven)
- **Login/verificatiecodes** — magic links, sign-in codes, email verification. Signals: "sign in", "log in", "verify your email", "confirmation code", "magic link", "bevestig je e-mail"
- **Lege notificaties** — pure technische systeemberichten zonder zelfstandige leesbare inhoud
- **Vastgesteld onleesbare korte paywall** — pas na een volledige bronfetch: een paywallblok met minder dan ongeveer 200 leesbare woorden

Een korte leestijd, laag woordenaantal of een metadata-summary alleen bewijst geen onleesbaarheid en is dus geen Tier 1-criterium.

Als Tier 1-matches gevonden:
1. **Move all in one call:** `mcp__readwise__reader_move_documents([ids...], location="archive")`
2. **Report:** `X documenten direct gearchiveerd (geen inhoud): [titles]`

### Voormalige Tier 2: gewone Later-route

Welkomstmails, promotionele e-mails en gecureerde nieuwsbrieven met zelfstandige inhoud zijn geen apart archiveercriterium. Verwerk ze volgens het gedeelde broncontract en routeer ze na succesvolle verwerking naar `later`. Een subjectief archiveeradvies, lage voorkeur of “handig als referentie” mag de standaardroute niet omzeilen.

## Podcast-aanpak (Archive na gecontroleerde verwerking)

Podcasts (`category = "podcast"`) volgen de Archive-route. Verwerk ze met dezelfde bronstatus- en manifestregels als andere documenten. Een ontbrekende transcript maakt de bron `partial`: maak geen volledige notitie of bron-highlights op basis van shownotes alleen, rapporteer dit en verplaats een onvolledig document niet als geslaagde verwerking.

**Regels voor podcasts:**
- Transcript: de volledige transcript (indien beschikbaar) zit in `html_content` — er is geen aparte MCP-aanroep nodig om dit te laden. Gebruik `reader_list_documents` met `response_fields=["html_content"]` om de HTML-versie inclusief transcript op te halen. Niet beschikbaar in de MCP: "force load transcript" — dat kan alleen via de Reader-interface.
- **Geen transcript beschikbaar** → sla highlight-extractie over (`highlights_created=[]`), noteer de bronstatus en reden in het manifest en gebruik shownotes/beschrijving niet als volledige bronvervanging.
- **Transcript wél beschikbaar** → analyseer de volledige transcript één keer en herlees gerichte thema- of tijdsblokken wanneer onzekerheid dat vereist. Er is geen vaste pass-eis en geen minimum of maximum aantal highlights.
- Vraag de gebruiker **niet** om een beslissing: archiveer automatisch na verwerking

In de **background agent prompt**: als `category = "podcast"`, stel dan `"recommendation": "archiveren"` in en registreer bronstatus, transcriptdekking en eventuele errors.

In **Phase F**: toon de samenvatting en highlights normaal, maar vervang de beslissingsvraag door: `↳ Podcast — automatisch gearchiveerd.`

In **Phase G**: als `category = "podcast"`, archiveer direct zonder te vragen.

## Phase 2.5: Launch Background Processing for All Documents

**Immediately after the Tier 1 pre-filter** (before starting the triage loop), launch a background subagent for **every remaining document** in the list — all in parallel. Every remaining document uses the ordinary Later route after successful processing; none is promoted to an automatic Tier 2 archive route.

Do not wait for them to finish. The triage loop will read their results as they become available.

For each document, use the prompt template below (fill in `{next_id}`, `{existing_notes}`, and `{existing_tags}`). The prompt must not invent an auto-archive exception for ordinary documents.

## Background Processing Agent Prompt

Launch one agent per document using this exact prompt template:

---
```
Je bent een Readwise triage-hulpagent. Verwerk document {next_id} volledig zodat de hoofdagent alleen nog het resultaat hoeft te presenteren.

Bestaande notitie: {existing_notes}
Bestaande tags: {existing_tags}
Standard route: after a successful complete processing result, recommendation is `later` for ordinary documents. Only podcasts and Tier 1 documents use `archiveren`.

## Stap 1: Ophalen (parallel)
Haal tegelijk op:
1. mcp__readwise__reader_get_document_details met document_id="{next_id}"
2. mcp__readwise__reader_list_documents met id="{next_id}" en response_fields=["html_content"]

Als de content-response te groot is en naar een bestand wordt opgeslagen, lees het bestand en extraheer de content met: jq '.content' /pad/naar/bestand.json

## Stap 2: Paywall check
Bevat de content een paywall-blok ("Subscribe to unlock", "Keep reading with a free trial", "Upgrade to paid") én minder dan ~200 woorden leesbare content? Sla alles op met paywall=true en stop.

## Stap 2b: Podcast-check
Is `category = "podcast"`? Dan gelden andere regels:
- Probeer transcript te laden via `html_content` (zit automatisch in de response van `reader_list_documents` met `response_fields=["html_content"]`). Er is geen aparte "force load"-aanroep.
- **Geen bruikbaar transcript aanwezig** → sla highlight-extractie over: `highlights_created=[]`, registreer `source_status="partial"` en de reden. Gebruik shownotes/beschrijving niet als volledige bronvervanging.
- **Wél een transcript aanwezig** → analyseer de volledige transcript één keer en herlees gerichte thema-/tijdblokken wanneer onzekerheid dat vraagt. Er is geen vaste pass-eis en geen maximum aantal highlights.
- Stel `recommendation = "archiveren"` altijd in (geen keuze nodig)

## Stap 3: Analyse
Voer uit op basis van de opgehaalde content:
- Schrijf een samenvatting van 3–5 bullets (op basis van feitelijke content, niet de pre-computed summary).
- **Niet-podcasts:** scan de volledige bron één keer en herlees alleen gerichte passages wanneer een claim, highlight of aanbeveling onzeker blijft. (Voor podcasts geldt de bronregel hierboven.)
- Scan de **gehele tekst** op highlight-waardige passages. Er is geen minimum of maximum — highlight alles dat de kwaliteitsdrempel haalt: trefzekere claims, sleuteldefinities, memorabele zinnen, ankerende statistieken, verrassende paradoxen. Sla alleen contextzinnen en overgangen over.
- Kies 1–3 tags uit de taxonomie (zie hieronder).
- Schrijf "Waarom lezen" (1–2 zinnen, Nederlands).
- Schrijf "Waarom skippen" (1–2 zinnen): redeneer altijd vanuit het artikel zelf (te kort, te anekdotisch, te Amerikaans, geen analytische laag). Nooit aannames doen over wat de gebruiker al zou kennen. Als het artikel een specifiek boek of kernauteur noemt: zoek eerst door de **hele Obsidian vault** (`/mnt/c/obsidian/`) via `fd` of `rg` of er al een notitie over bestaat — en vermeld dat dan feitelijk ("Er is al een notitie over X in de vault"). Als er al meerdere Readwise-artikelen zijn die hetzelfde onderwerp beter of uitgebreider dekken, is dat ook een geldige en concrete skipgrond.
- Geef inhoudelijke aanbeveling: `later`, `shortlist`, of `must-read`. Gebruik `archiveren` alleen voor podcasts en aantoonbare Tier 1-documenten; een subjectief archiveeradvies voor gewone inhoud verandert de standaardbestemming niet: die blijft `later`.
  - `later`: het document is zelfstandig lezenswaardig — je zou het daadwerkelijk willen lezen als je het tegenkomt. Dit hoeft geen leerwaarde te hebben: puur entertainment binnen een interessegebied telt net zo goed (zie Entertainmentwaarde in het gebruikersprofiel). **Niet** voor referenties, syntheses of "handig om te bewaren". Toets: "wil ik dit lezen?" Antwoord "nee, maar handig als referentie" → archiveren. Antwoord "nee, maar wel leerzaam" zonder dat je het ook echt zou lezen → ook archiveren.
    - Staat `light-reading` al in Bestaande tags hierboven (uit een eerdere `readwise-enrich`-pas)? Behandel dat als een sterke aanwijzing dat het document als puur entertainment is beoordeeld — check alleen nog de topische match met een interessegebied, niet opnieuw de hele entertainmentwaarde-afweging.
  - `shortlist`: echt top notch, duidelijke match met kerninteresses of leesstijl, verdient actieve leestijd. Spaarzaam gebruiken. Dit zou op maximaal 5–10% van alle artikelen van toepassing zijn (maar dit is geen harde eis)
  - `must-read`: uitzonderlijk cruciaal; overslaan zou echt verlies zijn voor denken, werk, leven of kerninteresses. Deze eis komt bovenop de shortlist-eis. Dit zou op maximaal 1–2% van alle artikelen van toepassing zijn (maar dit is geen harde eis)

### Gebruikersprofiel (voor relevantie-beoordeling):
Kerninteresses: AI & ethiek (saturatie — zie hieronder), filosofie (Stoïcijnen, Han, Žižek; sociale/politieke filosofie & anarchisme eerst, dan filosofie van de geest & taalfilosofie, dan ethiek/existentialisme — kennisniveau overal laag, toegankelijk instapmateriaal; saturatie op AI-filosofie en Arendt/totalitarisme), politieke ideologieën (analytisch), West-Europese geschiedenis, sociologie & ongelijkheid, essay schrijven, fantasy/SF-analyse, PKM & kennisbeheer, ouderschap zorgintensief, **front-end software development** (webontwikkeling, HTML/CSS/JavaScript, UI-architectuur, toegankelijkheid, performance, responsive design, design systems en developer experience), agile werken breed — scrum, kanban, lean, agile coaching, transformaties/organisatieverandering (leiderschap), product management/PM, velocity & flow-metrics, OKR's, scaled agile (beroepsmatig, gebruiker is Scrum Master).
Tweede laag: geografie, wetenschap (verwonderend), **software development** (bredere softwareontwikkeling, programmeerconcepten, software-architectuur en tooling; front-end heeft prioriteit), Nederlandse politiek (dieper dan nieuws).
Snel archiveren: waan van de dag, oppervlakkige zelfhulp, kale gaming-/filmnieuwsblurbs zonder inhoud, tooltips/tutorials zonder diepgang, droge academische teksten zonder stem, AI/tech-filosofie en Arendt/totalitarisme/fascisme tenzij écht actueel of diepgaand (verzadigd, zie Kerninteresses).
Bewaren als concreet iets te leren dat toepasbaar is in het leven, mits meer dan oppervlakkige zelfhulp of generieke tips.
Bewaren geldt ook zonder leerwaarde: puur entertainment (grappig, spannend, meeslepend) is een geldige eigen reden voor `later`, zolang het onderwerp raakt aan een kern- of tweede-laag interesse — denk aan luchtige pop-cultuurstukken, fandom-/lore-deep-dives, geestige persoonlijke verhalen. De toets is "wil ik dit lezen?", niet "leer ik hier iets van?". Buiten de interessegebieden telt entertainmentwaarde niet mee.
Leesstijl: essays met stem + diepgang. Toegankelijk populair-wetenschappelijk is prima.
Geografische context: gebruiker is Nederlands, woont in Nederland. Nederlandstalige artikelen en artikelen over de Nederlandse situatie (politiek, samenleving, cultuur) verdienen een halve trede hoger in de aanbeveling. Uitsluitend Amerikaans-gerichte content (US belasting, US zorg, US verkiezingen zonder bredere analytische laag) verdient een halve trede lager — tenzij de inzichten universeel toepasbaar zijn.

### Tag-taxonomie (lowercase):
learning & meta-learning · behavioral psychology & coaching · adhd & neurodivergence · political philosophy · totalitarianism & fascism · ai ethics & society · philosophy · history · sociology & social structures · economics · technology · software development · front-end software development · science · arts & culture · fiction · games · current affairs & politics · business & startups · professional development · health & wellness · personal growth & life philosophy · environment & sustainability · food & cooking · sports & recreation · entertainment & pop culture · research papers & academia · professional documents · scrum · agile

## Stap 4: Notitie opslaan + taal instellen (parallel met Stap 5 en 6)
Controleer de bestaande notitie:
- Geen notitie → maak een `pipeline-managed: readwise-triage/v2`-segment aan.
- Notitie met een eigen triage-marker → vervang alleen dat segment.
- Notitie met een enrich-marker → behoud het enrich-segment en voeg alleen een eigen gemarkeerd triage-segment toe als dat nodig is.
- Notitie zonder ondubbelzinnige marker → niet overschrijven; behoud de tekst en rapporteer `ownership-unknown`.

Notitieformaat:
```
<!-- pipeline-managed: readwise-triage/v2:start -->
Waarom lezen: [1–2 zinnen]
Beste moment: [analytisch|reflectief|leergierig|ontspannen|geconcentreerd|geïnspireerd|kritisch]

- [bullet 1]
- [bullet 2]
- ...
<!-- pipeline-managed: readwise-triage/v2:end -->
```

Bepaal de taal van de **originele tekst** (`html_content` of `content` — nooit de zelfgeschreven notitie, die is altijd Nederlands) als ISO-code (`nl`, `en`, `de`, `fr`, ...). Is de bron niet beschikbaar, registreer `partial`/`missing`/`error` en gebruik de titel niet als vervanging voor bronanalyse.

Gebruik mcp__readwise__reader_bulk_edit_document_metadata met documents=[{document_id: "{next_id}", notes: "...", language: "nl"}] — notitie en taal in dezelfde aanroep, geen aparte taalstap meer nodig.

## Stap 5: Highlights aanmaken (parallel met Stap 4 en 6)
Kopieer voor elke passage het exacte <p>-element (inclusief alle inline style-attributen) uit html_content.
Gebruik mcp__readwise__reader_create_highlight met document_id="{next_id}" en html_content="<p ...>tekst</p>".

Bij error **of** als de categorie `email` is en highlights niet worden ondersteund: sla de passage-tekst op in highlights_failed én schrijf een Obsidian-literatuurnotitie. **Nooit stilzwijgend overslaan** — "de API ondersteunt dit niet" is geen reden om de fallback over te slaan, het ís de reden:

**Obsidian-fallback bij highlight-error:**
- Bestandspad: `/mnt/c/obsidian/Atlas/Notes/Literature/[Gesaniteerde Titel].md`
  - Saniteer: spaties behouden, tekens `'/\:*?"<>|` vervangen door spatie
- Bestand bestaat niet → maak aan met Write:
  ```yaml
  ---
  up:
    - "[[+ Atlas|Atlas]]"
  tags:
    - atlas
    - atlas/literature
  author: [auteur]
  source_url: [url of leeg]
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
- Bestand bestaat al → voeg highlight toe via Edit onderaan het `## Highlights`-blok:
  `\n\n> [highlight-tekst]`
- Niet opnieuw proberen via Readwise API.
- Sla de bestandsnaam op in obsidian_fallback_files voor het resultaat-JSON.

## Stap 6: Tags toevoegen (parallel met Stap 4 en 5)
Gebruik mcp__readwise__reader_add_tags_to_document met tag_names=[...].
Kies 1–3 tags uit de taxonomie. Sla over als het document al correcte tags heeft.
Is `Beste moment: ontspannen` gekozen in Stap 4? Voeg dan altijd ook `light-reading` toe aan tag_names — los van de 1–3-limiet, die geldt alleen voor de inhoudelijke taxonomietags.

## Stap 6b: Gelinkte artikelen extraheren
Scan de volledige bron op links naar inhoudelijk interessante artikelen, essays, papers of longreads. Haal iedere doelpagina zelf op en accepteer haar alleen als die Nederlands of Engels is, zelfstandig leesbaar is en expliciet aansluit op een kerninteresse. Sla op als lijst van URLs in `linked_articles` en registreer per URL de uitkomst.

**Sla altijd over:**
- Navigatie, share-links, auteurprofielen, tagpagina's
- Login/paywall/subscribe-links, productpagina's
- Social posts zonder zelfstandige inhoud, afbeeldingen, assets

## Stap 7: Resultaten en manifest opslaan
Schrijf de per-document cache naar `.tmp/readwise/triage_prefetch_{next_id}.json` en voeg dezelfde uitkomst toe aan `.tmp/readwise/triage-manifest-{runId}.json`:
{
  "source_status": "complete|partial|missing|error",
  "source_fields": ["content", "html_content"],
  "source_fingerprint": "sha256-or-null",
  "analysis_status": "complete|partial|skipped|error",
  "metadata_write": "written|skipped|error",
  "move_outcome": "pending|archived|later|not-moved|error",
  "errors": [],
  "operation_keys": [],
  "paywall": false,
  "summary_bullets": ["bullet 1", "bullet 2", "..."],
  "highlights_created": ["passage tekst 1", "passage tekst 2"],
  "highlights_failed": [],
  "obsidian_fallback_files": ["Atlas/Notes/Literature/Titel.md"],
  "tags_added": ["tag1", "tag2"],
  "note_action": "created|appended|skipped",
  "note_content": "volledige notitietekst",
  "waarom_lezen": "...",
  "waarom_skippen": "...",
  "beste_moment": "analytisch",
  "recommendation": "later|shortlist|must-read|archiveren",
  "recommendation_reason": "1–2 zinnen motivatie",
  "linked_articles": ["https://..."],
  "linked_article_outcomes": []
}
```

Markeer alleen bevestigde writes en moves als geslaagd. Een hervatting slaat uitsluitend die operation keys over; bron-, metadata- en movefouten blijven per document zichtbaar. Een `partial`, `missing` of `error`-resultaat wordt nooit als succesvol verwerkt of verplaatst geteld.
---

**Read side (Phase A):** At the start of each cycle, check `.tmp/readwise/triage_prefetch_{id}.json`. If the file exists and contains `summary_bullets`, `source_status`, `analysis_status`, `metadata_write`, and `move_outcome`, all processing recorded in that cache is already done — skip only the completed phases and read the remaining work from the manifest. Never infer completion from a summary alone.

If the file is not yet ready (background agent still running), wait up to 30 seconds by checking every 5 seconds. If still not ready after 30 seconds, fall back to inline processing.

**File schema:**
```json
{
  "source_status": "complete|partial|missing|error",
  "analysis_status": "complete|partial|skipped|error",
  "metadata_write": "written|skipped|error",
  "move_outcome": "pending|archived|later|not-moved|error",
  "errors": [],
  "operation_keys": [],
  "paywall": false,
  "summary_bullets": ["..."],
  "highlights_created": ["..."],
  "highlights_failed": [],
  "obsidian_fallback_files": [],
  "tags_added": ["..."],
  "note_action": "created|appended|skipped",
  "note_content": "...",
  "waarom_lezen": "...",
  "waarom_skippen": "...",
  "beste_moment": "...",
  "recommendation": "later|shortlist|must-read|archiveren",
  "recommendation_reason": "...",
  "linked_articles": ["https://..."]
}
```

---

## Triage Loop

Process documents **one at a time**. For each document:

### Phase A: Fetch Full Content (or read pre-fetch cache)

**Check pre-fetch first:** if `.tmp/readwise/triage_prefetch_{id}.json` exists and contains a complete source status plus recorded analysis/write outcomes, skip only the phases whose operation keys are already successful. A summary alone is not evidence that processing is complete.

If the pre-fetch file is missing or incomplete, do the full inline processing below:

```
mcp__readwise__reader_get_document_details(document_id=<id>)
```

If the result exceeds context limits and is saved to a file, extract the content with `jq`:
```bash
jq '.content' /path/to/saved-file.json
```
Als `jq` niet werkt: gebruik DuckDB. Als ook dat niet werkt: python3 als laatste redmiddel.

**Markdown check:** If `content` has no `<p>` tags (markdown-only output), fetch the HTML version separately:

```
mcp__readwise__reader_list_documents(id=<id>, response_fields=["html_content"])
```

Use `html_content` for highlight selection. The `content` field (even markdown) is used for summary generation.

**Paywall check:** If the content contains a paywall block (e.g. "Subscribe to unlock", "Keep reading with a free trial", "Upgrade to paid") and fewer than ~200 words of actual readable content are visible, record Tier 1/paywall evidence in the manifest and move the document to `archive` only after the controlled move result succeeds. Do not count this as a successful full enrichment.

**Auto-archive check:** If a document slipped through Phase 2 (e.g. fetched via ID), check its complete available source and confirmed metadata for the same Tier 1 patterns. Never archive based on a title or metadata-summary alone when the document may contain readable content.

### Phase B: Analyse Content

*(Skip this phase if pre-fetch cache is complete.)*

Both sub-steps operate on the already-loaded content — no additional API calls needed.

**B1 — Summary:** Write a concise summary in **3–5 bullets**. Base this on the actual content, not the pre-computed summary field. Each bullet captures a distinct idea, finding, or argument.

For very long documents (>5000 words): focus the summary on the first third and any clearly marked conclusions.

**B2 — Highlight selection:** scan de volledige beschikbare bron één keer en herlees alleen gerichte delen als onzekerheid dat vraagt. Podcasts met transcript volgen dezelfde regel; podcasts zonder transcript krijgen geen bronafhankelijke highlights.

Scan de **gehele tekst** op highlight-waardige passages. Er is geen minimum of maximum — highlight alles wat de kwaliteitsdrempel haalt. Goede kandidaten:
- Een treffende claim of inzicht
- Een sleuteldefinitie of -raamwerk
- Een memorabele of citatwaardige zin
- Een statistiek of bevinding die het argument verankert
- Een verrassende tegenstelling of paradox

Sla passages over die alleen context of overgang zijn, maar laat geen enkele waardevolle passage liggen vanwege een denkbeeldig plafond.

Copy each passage exactly as it appears in `html_content` to ensure a reliable match.

If the document has no suitable passages (e.g. a podcast stub without readable content), skip Phase D entirely and note "Geen highlights — geen geschikte tekstparagrafen gevonden."

### Phase C: Save Summary as Note (+ taal instellen)

*(Skip this phase if pre-fetch cache is complete.)*

Bepaal ook de taal van de **originele tekst** (`html_content` of `content`, nooit de zelfgeschreven notitie) als ISO-code (`nl`, `en`, `de`, `fr`, ...) en geef die mee in dezelfde `bulk_edit_document_metadata`-aanroep als de notitie — zie hieronder. Geen aparte taalstap nodig.

Check the `notes` field from the Phase 1 fetch, then apply:

| Situatie | Actie |
|---|---|
| Geen bestaande notitie | Sla nieuwe notitie op met het formaat hieronder |
| Notitie bevat een eigen `pipeline-managed: readwise-triage/v2`-segment | Vervang alleen dat segment en behoud alle overige tekst en de laatste `Feedback:`-alinea |
| Notitie bevat een `readwise-enrichment/v2`-segment | Behoud het enrich-segment; voeg alleen een eigen gemarkeerd triage-segment toe wanneer nodig |
| Notitie aanwezig zonder ondubbelzinnige marker | Niet overschrijven; behoud de originele tekst en rapporteer `ownership-unknown` |

**Note format:**

```
<!-- pipeline-managed: readwise-triage/v2:start -->
Waarom lezen: [1–2 zinnen — noem expliciet welk interessegebied dit raakt + wat de meerwaarde is]
Beste moment: [kies uit de lijst hieronder]

- [bullet 1]
- [bullet 2]
- ...
<!-- pipeline-managed: readwise-triage/v2:end -->
```

**Vaste moodvocabulaire voor "Beste moment":**
- **analytisch** — dichte theorie, argumenten, filosofie, onderzoek
- **reflectief** — persoonlijke groei, betekenis, dagboekachtige teksten
- **leergierig** — how-to's, tutorials, structurele kennis, meta-learning
- **ontspannen** — lichte essays, narratieve non-fictie, cultuur, humor
- **geconcentreerd** — lange of complexe teksten die volledige aandacht vragen
- **geïnspireerd** — creatieve of motiverende content
- **kritisch** — politiek, nieuws, opinie, maatschappij

Gebruik altijd precies dit woord (lowercase). Write the entire note in Dutch.

**When adding a triage segment to an enrich note:**

```
mcp__readwise__reader_bulk_edit_document_metadata(
  documents = [{document_id: <id>, notes: "<existing note>\n\n<!-- pipeline-managed: readwise-triage/v2:start -->\nTriage-aanvulling:\n- <extra bullet>\n<!-- pipeline-managed: readwise-triage/v2:end -->", language: "nl"}]
)
```

### Phase D: Create Highlights

*(Skip this phase if pre-fetch cache is complete.)*

**Run in parallel with Phase C and Phase E.**

For each selected passage, copy the **exact** `<p>` tag from `html_content` — every character, including all inline style attributes, verbatim:

```
mcp__readwise__reader_create_highlight(
  document_id = <id>,
  html_content = "<p style=\"...\">exact paragraph text here</p>"
)
```

If a highlight returns an error, **or if the document category is `email` and highlights are not supported by the API**, do **not** retry. Record the error per document and save selected passages as a fallback literatuurnotitie in Obsidian — see **Appendix: Obsidian Fallback** below for exact format and file paths. "The API doesn't support this" is not a reason to skip the fallback — it is the reason to use it. Report the error separately in Phase F and count only confirmed fallback writes.

### Phase E: Tag Document

*(Skip this phase if pre-fetch cache is complete.)*

**Run in parallel with Phase C and Phase D.**

Select **1–3 content tags** from the taxonomy below. Fetch the current complete tagset immediately before a metadata write and calculate the full desired tagset while preserving administrative, curatoriale, language, workflow, ordinal, toplist, and unknown tags. Use the confirmed bulk metadata route when the full tagset is readable; if it is incomplete, use known add/remove operations and leave opaque tags untouched. Omit unchanged fields and never send a skipped note as `null` or an empty string.

If `Beste moment: ontspannen` was chosen in Phase C, always also include `light-reading` in `tag_names` — this is separate from the 1–3 limit, which applies only to the content taxonomy tags above.

**Taaldetectie:** wordt afgehandeld via het `language`-veld op `bulk_edit_document_metadata` — geen aparte taaltag meer nodig hier.

**Taxonomy (use lowercase exactly as written):**
`learning & meta-learning` · `behavioral psychology & coaching` · `adhd & neurodivergence` · `political philosophy` · `totalitarianism & fascism` · `ai ethics & society` · `philosophy` · `history` · `sociology & social structures` · `economics` · `technology` · `software development` · `front-end software development` · `science` · `arts & culture` · `fiction` · `games` · `current affairs & politics` · `business & startups` · `professional development` · `health & wellness` · `personal growth & life philosophy` · `environment & sustainability` · `food & cooking` · `sports & recreation` · `entertainment & pop culture` · `research papers & academia` · `professional documents` · `scrum` · `agile`

If no category fits, create a fitting custom lowercase tag. Max 3 tags — 1–2 is usually right.

### Phase F: Present to User

Read results from the pre-fetch cache file if available (`source_status`, `analysis_status`, `metadata_write`, `move_outcome`, `errors`, `summary_bullets`, `highlights_created`, `highlights_failed`, `obsidian_fallback_files`, `tags_added`, `waarom_lezen`, `waarom_skippen`, `recommendation`, `recommendation_reason`). Otherwise use the inline results from Phases B–E. Report source, metadata, highlight, link, and move errors per document; never collapse them into a successful count.

Als `obsidian_fallback_files` niet leeg is, rapporteer in de Highlights-regel: `X highlights opgeslagen als literatuurnotitie in Atlas/Notes/Literature/`.

Present using the **Presentatieformat** below.

### Phase G: Act on User's Decision

**Standaardroute:** vraag niet per gewoon document om een beslissing. Na een succesvolle complete verwerking:

- `category = "podcast"` of een aantoonbaar Tier 1-document → verplaats naar `archive` via `mcp__readwise__reader_move_documents`.
- Elk ander succesvol verwerkt document, inclusief nieuwsbrieven en voormalige Tier 2-kandidaten → verplaats naar `later` via `mcp__readwise__reader_move_documents`.
- Bij `partial`, `missing`, `error`, een metadata-writefout of onduidelijke move-uitkomst → niet verplaatsen; registreer en rapporteer `not-moved`.

**Interactieve opt-in:** alleen wanneer de gebruiker expliciet om interactieve triage vraagt, mag de aanbeveling als beslissing worden voorgelegd. Beperk overrides dan tot die gevraagde scope en gebruik dezelfde gecontroleerde moveoperatie.

- **"Archive"** / **"a"** / **"done"** → verplaats naar `archive` na de live metadata- en movecontrole.
- **"Later"** / **"l"** → verplaats naar `later` (of laat staan als al in `later`)
- **"Shortlist"** / **"s"** → verplaats naar/bewaar in `later`
- **"Must-read"** / **"m"** → verplaats naar/bewaar in `later`
- **"Keep"** / **"k"** → niets doen
- **"Something else"** / **"tag"** → vraag, handel, ga door
- **"Skip"** → ga naar volgend document zonder actie

**Important:** Always use `mcp__readwise__reader_move_documents` to change location — never `bulk_edit_document_metadata`. The bulk edit endpoint accepts location but silently ignores it (returns success:true without actually moving the document).

After handling the route, add `· · ·` as a visual separator and move to the next document. Persist the move result and operation key before continuing.

---

## Presentatieformat

Present this block after Phase E completes:

---

**{Title}**
*{Author} · {site_name} · {reading_time} min read*

**Samenvatting:**
- {bullet 1}
- {bullet 2}
- ...

**Highlights opgeslagen:**
> {passage 1}

> {passage 2}

**Tags:** `{tag1}` · `{tag2}`

**Waarom lezen:** {1–2 zinnen — wat maakt dit de moeite waard?}
**Waarom skippen:** {1–2 zinnen — eerlijke reden om het over te slaan.}

**Aanbeveling:** {archiveren / later / shortlist / must-read}
*{1–2 zinnen motivatie — wees direct en opinionated. Schrijf altijd vanuit leesbeslissing: is dit de moeite waard om te lezen? De gebruiker heeft het nog NIET gelezen — gebruik nooit taal die dit impliceert ("gelezen", "klaar mee", "done", etc.).}*

---

**Wat wil je doen met _{Title}_?**
- **Archive** — klaar mee
- **Later** — bewaren voor later
- **Shortlist** — top notch, verdient actieve leestijd
- **Must-read** — uitzonderlijk cruciaal
- **Keep** — laten staan
- **Something else** — tag, notitie, etc.

---

## Phase H: Gelinkte artikelen toevoegen

Na elk succesvol verwerkt document: voeg interessante gelinkte URLs automatisch toe aan de Reader-inbox. Gebruik de `linked_articles`-lijst uit het pre-fetch resultaat (of scan de volledige bron zelf als er geen pre-fetch beschikbaar was). Voer binnen een inbox-run slechts één verantwoordelijke linkpass uit.

**Actie per URL:**
1. Controleer de doelpagina zelf op taal, zelfstandige leesbaarheid en kerninteresse-aansluiting.
2. Dedupliceer tegen de volledige Reader-library, alle Feed-pagina's en de huidige run met `mcp__readwise__reader_search_documents(q="{url}")`. Sla over als aanwezig of al in het manifest staat. Een bestaande bestemming blijft behouden.
3. Toevoegen: `mcp__readwise__reader_create_document(url="{url}", tags=["linked-from-readwise"])`

**Sla altijd over:** navigatie, share-links, auteurprofielen, tagpagina's, login/paywall/subscribe-links, productpagina's, social posts zonder zelfstandige inhoud, afbeeldingen, assets.

Registreer `accepted`, `rejected`, `duplicate` of `error` per URL. Rapporteer kort: `↳ X links toegevoegd aan inbox.` plus afgewezen of mislukte URL's.

**Geen automatische reorder:** deze skill roept `readwise-reorder` niet meer zelf aan voor nieuw naar `later` verplaatste documenten. Wil de gebruiker dat nieuwe `later`-documenten alsnog een `lees-`/`boek-`-positie krijgen, verwijs dan naar de `readwise-reorder`-skill (Modus B) als losse, expliciete vervolgstap — nooit stilzwijgend meelopen in deze skill.

---

## Documentatie: Obsidian lognotitie

Maak aan het einde van de sessie (of tussentijds bij grote batches) een lognotitie aan in `Calendar/Logs/`.

**Bestandsnaam:** `{YYYY-MM-DD} Readwise triage log.md`
Als het bestand al bestaat: voeg toe aan het bestaande bestand.

**Logformaat (Nederlands, vaultconventies):**

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
# Readwise triage log — {YYYY-MM-DD}

## Gearchiveerd

| Titel | Vorige locatie | Reden | URL |
|-------|---------------|-------|-----|
| {titel} | inbox / later | {reden} | {url of —} |

## Bewaard / geüpgraded

- **Shortlist:** {titel} — {korte motivatie}
- **Must-read:** {titel} — {korte motivatie}

---
# Related notes
- [[YYYY-MM-DD]]
```

---

## Tijdelijke bestanden

Gebruik uitsluitend `.tmp/readwise/` voor tijdelijke bestanden (relatief aan de vault-root `/mnt/c/obsidian/`). Maak de map aan als hij niet bestaat: `mkdir -p .tmp/readwise`.

**Opruimen aan het einde van de sessie:**
```bash
rm -f .tmp/readwise/triage_prefetch_*.json .tmp/readwise/rw_triage.json
```

Verwijder nooit Obsidian-lognotities.

---

## Appendix: Obsidian Fallback (highlight errors)

When `mcp__readwise__reader_create_highlight` returns an error, save the passage as a literatuurnotitie in Obsidian:

1. **Bestandspad:** `Atlas/Notes/Literature/[Titel].md`
   - Saniteer de titel: spaties behouden, tekens `'/\:*?"<>|` verwijderen of vervangen door een spatie
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
5. **Wikilink naar _Readwise-notitie:** Zoek via `fd` naar bestanden waarvan de naam begint met de documenttitel in twee mappen:
   - `_Readwise/Articles/**/{eerste 4-5 woorden van titel}*.md`
   - `_Readwise/Full Document Contents/Articles/**/{eerste 4-5 woorden van titel}*.md`
   Als gevonden: voeg **alle** matches toe als `- [[{bestandsnaam zonder .md extensie}|{document-titel}]]` in de Related notes sectie — zowel de `_Readwise/Articles/` versie als de `_Readwise/Full Document Contents/` versie als beide bestaan. Voeg alleen toe als die link er nog niet in staat.
6. Meld de fout niet als succesvolle Reader-highlight. Registreer haar per document en rapporteer in Phase F hoeveel passages als literatuurnotitie zijn opgeslagen en welke highlightfouten nog openstaan.
