---
name: readwise-book-study
description: "Hoofdstukgewijze studie van Readwise Reader-boeken met meerdere iteraties: volledige boektekst ophalen, hoofdstukgrenzen bepalen, per hoofdstuk relevante passages/highlights zoeken, Reader-highlights aanmaken of fallback-notities schrijven, en een Nederlandse literatuurnotitie maken met samenvatting per hoofdstuk. Gebruik wanneer de gebruiker vraagt om een boek grondig te verwerken, highlights per hoofdstuk te vinden, meerdere rondes/iteraties door een boek te doen, of een literatuurnotitie met hoofdstuksamenvattingen te schrijven."
---

# Readwise Book Study

## Repository authority

Read [`../readwise-reference.md`](../readwise-reference.md) first in the repository checkout. When this file is installed separately, locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or `/mnt/c/dev/top-articles`, then read `<repository>/skills/readwise-reference.md`; do not assume the relative link exists. Use full book evidence, exact HTML highlight passages, explicit requested iteration counts, and the vault fallback rules; do not move documents or overwrite personal notes without a separate explicit request.

Werk methodisch door een Readwise Reader-boek heen: eerst structuur bepalen, daarna hoofdstuk voor hoofdstuk highlights selecteren, en afsluiten met een literatuurnotitie met samenvattingen per hoofdstuk.

## Direct output

Voordat je tools gebruikt, output precies:

`Boek hoofdstukgewijs verwerken...`

## Scope

Gebruik dit voor boeken, epubs, pdfs of lange Reader-documenten met duidelijke hoofdstukken. Gebruik bij voorkeur samen met `$readwise-cli` of Readwise MCP/app-tools wanneer Reader-content, HTML en highlights nodig zijn.

## Kernregels

- Werk in het Nederlands in Obsidian-notities, tenzij de gebruiker anders vraagt.
- Gebruik `html_content` als gezaghebbende bron voor Reader-highlights.
- Gebruik `content` of volledige markdown/plaintext voor samenvattingen.
- Highlight met exacte `<p>`-elementen uit `html_content`; wijzig geen tekens.
- Bij highlight-errors: niet opnieuw proberen met aangepaste tekst; schrijf fallback in Obsidian.
- Bewerk `_Readwise/` nooit.
- Gebruik uitsluitend `.tmp/readwise/` voor tijdelijke bestanden en ruim ze aan het eind op.
- Verplaats Reader-documenten niet, tenzij de gebruiker daar expliciet om vraagt.

## Workflow

### 1. Voorbereiden

1. Bepaal document-ID, titel, auteur en source URL.
2. Maak `.tmp/readwise/` aan.
3. Haal in parallel op:
   - Reader document details (`content`, metadata)
   - Reader list/get met `html_content`
4. Sla grote responses tijdelijk op in `.tmp/readwise/`.
5. Zoek bestaande fallback- of literatuurnotities voor dit boek om dubbele highlights te vermijden.

### 2. Hoofdstukken bepalen

1. Scan `html_content` en `content` op hoofdstukkoppen.
2. Noteer per hoofdstuk:
   - hoofdstuknummer of titel
   - begin/einde in HTML of tekst
   - korte inhoudelijke kern
3. Als hoofdstukken ontbreken, maak pragmatische segmenten op basis van duidelijke delen, koppen of lengte. Meld deze aanname.

### 3. Highlight-rondes uitvoeren

Voer het aantal gevraagde iteraties uit. Als de gebruiker geen aantal noemt, doe minimaal één volledige hoofdstukronde.

Per ronde:

1. Begin bij hoofdstuk 1.
2. Werk hoofdstuk voor hoofdstuk tot het einde.
3. Selecteer alleen passages die nog niet als highlight/fallback bestaan.
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
6. Leg intern bij welke passage bij welk hoofdstuk en welke ronde hoort.

### 4. Reader-highlights of fallback

Voor elke geselecteerde passage:

1. Maak een Reader-highlight met het exacte `<p>`-fragment.
2. Bij succes: registreer de highlight in je resultaat.
3. Bij error: schrijf fallback naar:

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

Gebruik vaultconventies:

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

<korte synthese van het boek>

## Samenvatting per hoofdstuk

### Hoofdstuk 1 — <titel indien bekend>

<samenvatting>

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
- literatuurnotitie bestaat en heeft samenvatting per hoofdstuk
- frontmatter en `# Related notes` voldoen aan de vaultconventies
- tijdelijke bestanden in `.tmp/readwise/` zijn opgeruimd

Gebruik tellingen waar mogelijk, bijvoorbeeld aantal blockquotes per ronde en aantal hoofdstukheaders.

## Eindrapport

Rapporteer compact:

- boek/titel
- aantal iteraties en hoofdstukken
- aantal highlights direct in Reader
- aantal fallback-highlights en bestandspad
- literatuurnotitiepad
- verificatie-uitkomst

Noem technische Reader-highlight-errors alleen samengevat.
