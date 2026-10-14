---
name: readwise-book-study
description: "Hoofdstukgewijze studie van Readwise Reader-boeken met meerdere iteraties: volledige boektekst ophalen, hoofdstukgrenzen bepalen, per hoofdstuk relevante passages/highlights zoeken, Reader-highlights aanmaken of fallback-notities schrijven, en een Nederlandse literatuurnotitie maken met samenvatting per hoofdstuk. Gebruik wanneer de gebruiker vraagt om een boek grondig te verwerken, highlights per hoofdstuk te vinden, meerdere rondes/iteraties door een boek te doen, of een literatuurnotitie met hoofdstuksamenvattingen te schrijven."
---

# Readwise Book Study

## V2 verrijkingscontract

Read [`../readwise-reference.md`](../readwise-reference.md) first in the repository checkout. When this file is installed separately, locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or `/mnt/c/dev/top-articles`, then read `<repository>/skills/readwise-reference.md`; do not assume the relative link exists. The reference's V2 verrijkingscontract governs this skill. Use complete book evidence, record `complete`/`partial`/`missing`/`error` bronstatus, exact HTML highlight passages, explicit requested iteration counts, and the vault fallback rules. Replace only `pipeline-managed` note sections; preserve personal notes, unknown-owned text, the last `Feedback:` paragraph, and all existing highlights. Record actual analysis/write outcomes in a resumable manifest and report incomplete/error results separately. Do not move documents or overwrite personal notes without a separate explicit request.

Werk methodisch door een Readwise Reader-boek heen: eerst structuur bepalen, daarna hoofdstuk voor hoofdstuk highlights selecteren, en afsluiten met een literatuurnotitie met samenvattingen per hoofdstuk.

## Direct output

Voordat je tools gebruikt, output precies:

`Boek hoofdstukgewijs verwerken...`

## Scope

Gebruik dit voor boeken, epubs, pdfs of lange Reader-documenten met duidelijke hoofdstukken. Gebruik bij voorkeur samen met `$readwise-cli` of Readwise MCP/app-tools wanneer Reader-content, HTML en highlights nodig zijn.

## Kernregels

- Werk in het Nederlands in Obsidian-notities, tenzij de gebruiker anders vraagt.
- Gebruik `html_content` als gezaghebbende bron voor Reader-highlights.
- Gebruik alleen complete `content` of volledige markdown/plaintext voor samenvattingen; een metadata-summary of afgekapt body-resultaat is geen bronbewijs.
- Highlight met exacte `<p>`-elementen uit `html_content`; wijzig geen tekens.
- Dedupliceer tegen bestaande Reader-highlights, bestaande fallbackpassages en de huidige runregistratie.
- Bij highlight-errors: registreer de fout per document, probeer niet opnieuw met aangepaste tekst, en schrijf alleen de exacte passage als fallback in Obsidian wanneer dat veilig kan.
- Bij ontbrekende bron: geen verzonnen hoofdstukgrenzen, samenvatting of highlight; rapporteer `partial`, `missing` of `error`.
- Bewerk `_Readwise/` nooit.
- Gebruik uitsluitend `.tmp/readwise/` voor tijdelijke bestanden. Ruim broncache pas op nadat het manifest de uitkomst heeft vastgelegd; behoud het manifest zolang iets gedeeltelijk of foutief is.
- Verplaats Reader-documenten niet, tenzij de gebruiker daar expliciet om vraagt.

## Workflow

### 1. Voorbereiden

1. Bepaal document-ID, titel, auteur en source URL.
2. Maak `.tmp/readwise/` aan.
3. Haal in parallel de volledige beschikbare bron op:
   - Reader document details (`content`, metadata)
   - Reader list/get met `html_content`
4. Leg bronvelden, status en fingerprint vast in `.tmp/readwise/book-study-manifest-{runId}.json`.
5. Zoek bestaande fallback- of literatuurnotities voor dit boek om dubbele highlights te vermijden; onbekend eigendom blijft behouden.

### 2. Hoofdstukken bepalen

1. Scan de complete `html_content` en `content` op hoofdstukkoppen.
2. Noteer per hoofdstuk:
   - hoofdstuknummer of titel
   - begin/einde in HTML of tekst
   - korte inhoudelijke kern
3. Als hoofdstukken ontbreken, maak pragmatische segmenten op basis van duidelijke delen, koppen of lengte. Meld deze aanname in het manifest en eindrapport; presenteer een incomplete bron niet als volledige hoofdstukstructuur.

### 3. Highlight-rondes uitvoeren

Voer exact het aantal door de gebruiker gevraagde iteraties uit. Als de gebruiker geen aantal noemt, doe minimaal één volledige hoofdstukronde en registreer die expliciet. Een oude vaste pass-eis mag een expliciet gevraagd aantal nooit vervangen.

Per ronde:

1. Begin bij hoofdstuk 1.
2. Werk hoofdstuk voor hoofdstuk tot het einde.
3. Selecteer alleen passages die nog niet als Reader-highlight, fallback of geslaagde operatie in het manifest bestaan.
4. Geef prioriteit aan:
   - centrale claims
   - definities of begrippen
   - argumentatieve wendingen
   - memorabele zinnen
   - ankerende voorbeelden of cijfers
   - passages die de kern van het hoofdstuk dragen
5. Vermijd:
   - overgangszinnen
   - herhaling van al gekozen passages
   - louter context zonder zelfstandig inzicht
6. Leg in het manifest vast welke passage bij welk hoofdstuk en welke ronde hoort, plus de analyse-, Reader-write- en fallback-uitkomst.

### 4. Reader-highlights of fallback

Voor elke geselecteerde passage:

1. Maak een Reader-highlight met het exacte `<p>`-fragment.
2. Bij succes: registreer de highlight in het manifest en resultaat.
3. Bij error: registreer de fout en schrijf alleen de exacte passage als fallback naar:

`Atlas/Notes/Sources/[Titel] - Highlights.md`

Gebruik dit formaat bij nieuwe fallback-notities:

```yaml
---
up:
  - "[[+ Atlas|Atlas]]"
tags:
  - atlas
  - atlas/sources
source_url: <reader/source URL>
author: <auteur>
creation_date: YYYY-MM-DD
modified_date: YYYY-MM-DD
---
# <Titel> — Highlights

Bron: <auteur> · <url>

## Highlights

### Ronde 1

#### Hoofdstuk 1

> <highlight>

---
# Related notes
- [[YYYY-MM-DD]]
```

Bij bestaande fallback-notities:

- update `modified_date`
- voeg nieuwe rondes onderaan toe
- label per ronde en hoofdstuk (`## Vierde hoofdstuksronde`, `### Hoofdstuk 3`, etc.)
- behoud bestaande highlights en links

### 5. Literatuurnotitie schrijven

Maak of update een Nederlandse literatuurnotitie:

`Atlas/Notes/Literature/Books/[Titel] ([Auteur]).md`

Gebruik vaultconventies. Schrijf alleen binnen een bestaande `pipeline-managed` sectie; als de bestaande notitie geen ondubbelzinnige eigendomsmarker heeft, behoud haar ongewijzigd en rapporteer `ownership-unknown` in plaats van haar te overschrijven.

```yaml
---
up:
  - "[[+ Atlas|Atlas]]"
tags:
  - atlas
  - atlas/literature
  - books
author: <auteur>
source_url: <reader/source URL>
creation_date: YYYY-MM-DD
modified_date: YYYY-MM-DD
---
# <Titel>

## Kern

<!-- pipeline-managed: readwise-enrichment/v2:start -->
<korte synthese van het boek>

## Samenvatting per hoofdstuk

### Hoofdstuk 1 — <titel indien bekend>

<samenvatting>
<!-- pipeline-managed: readwise-enrichment/v2:end -->

---
# Related notes
- [[<fallback highlight note>|Highlights]]
```

Per hoofdstuk:

- vat de argumentatieve functie samen, niet alleen de gebeurtenissen
- noem kernbegrippen en voorbeelden
- verbind hoofdstukken wanneer het boek een doorlopend argument heeft
- houd het compact genoeg voor herlezing

### 6. Verifiëren

Controleer vóór afronden:

- aantal gevraagde iteraties is uitgevoerd
- elke iteratie is hoofdstuk voor hoofdstuk gedaan
- elke ronde bevat het verwachte aantal hoofdstukken of een expliciete reden voor afwijking
- nieuwe passages zijn niet duidelijk duplicaat van bestaande highlights
- Reader-highlights of fallback-notitie bevatten alle geselecteerde passages
- literatuurnotitie is aangemaakt of de beheerde sectie is bijgewerkt; bij onbekend eigendom is dat expliciet als `ownership-unknown` gemeld
- frontmatter en `# Related notes` voldoen aan de vaultconventies
- het runmanifest bevat de feitelijke bron-, analyse-, Reader-write- en fallback-uitkomsten

Gebruik tellingen waar mogelijk, bijvoorbeeld aantal blockquotes per ronde en aantal hoofdstukheaders.

Ruim alleen tijdelijke broncache op nadat het runmanifest de feitelijke uitkomst heeft vastgelegd. Behoud het manifest zolang een document, highlight, fallback of literatuurnotitie gedeeltelijk of foutief is, zodat een hervatting geslaagde writes niet opnieuw uitvoert.

## Eindrapport

Rapporteer compact:

- boek/titel
- aantal iteraties en hoofdstukken
- aantal highlights direct in Reader
- aantal fallback-highlights en bestandspad
- literatuurnotitiepad
- verificatie-uitkomst

Noem technische Reader-highlight-errors alleen samengevat.
