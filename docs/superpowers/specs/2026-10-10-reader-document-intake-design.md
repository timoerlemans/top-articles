# Reader-documenten ophalen in één module

## Doel en gekozen richting

Negen ophaalroutes herhalen het opvragen van Reader-documenten, paginering en
antwoordvalidatie. Een wijziging in het ophaalcommando moet daardoor op meerdere
plekken gebeuren. Dit ontwerp concentreert die verantwoordelijkheid in één deep
module met een kleine interface, zodat correcties locality hebben en alle
aanroepers leverage krijgen.

De gebruiker heeft gekozen voor het behouden van de huidige veldselecties per
taak, centraal vastgelegd. De refactor richt zich op de bestaande ophaalroutes.

Een alternatief was één brede veldset voor alle taken. Die vraagt onnodige
gegevens op en verandert de invoer van taken die nu minder velden ontvangen.
Alleen de paginalus delen en losse veldstrings bij aanroepers laten staan zou
de huidige verspreiding van veldbeleid behouden. Daarom worden zowel de
paginalus als de bestaande veldprofielen onderdeel van dezelfde implementation.

## Module en interface

Nieuw bestand: `scripts/lib/readwise-documents.ts`.

De module biedt één ophaalfunctie:

```ts
fetchReadwiseDocuments(runReadwise, selection): Promise<ReadwiseDocument[]>
```

`runReadwise` is de bestaande `ReadwiseExecutor<{ stdout: string }>`.
`selection` bevat een veldprofiel en precies één selectie: een Reader-locatie
of een document-ID. Een TypeScript-union voorkomt dat beide selecties tegelijk
worden opgegeven of dat een selectie ontbreekt.

De bekende locaties zijn `later`, `new`, `shortlist`, `archive` en `feed`.
Veldprofielen hebben de namen `catalog`, `maintenance`, `judge`, `report`,
`feedback` en `archive-cleanup`. De module bewaart de bijbehorende veldstrings;
aanroepers kiezen alleen een profiel. Ruwe veldstrings en paginacursors maken
geen deel uit van de interface.

De interface is het test surface: aanroepers en tests gebruiken dezelfde
ophaalroute. De bestaande executor vormt de transport-seam. De productie-adapter
voert het Readwise-commando uit; de mock-adapter levert gescripte antwoorden en
fouten. Daarmee heeft deze seam twee concrete adapters.

De depth zit in het verbergen van commando-opbouw, antwoordvalidatie,
paginering en cursorbewaking. Het module blijft alleen verantwoordelijk voor
ophalen; interpretatie van documenten blijft bij de betreffende taak.

## Veldprofielen en aanroepers

De bestaande veldsets en hun volgorde blijven exact behouden. `id` wordt door
Reader meegeleverd en wordt door de bestaande documentparser gevalideerd.
`language` wordt niet aangevraagd; als Reader het teruggeeft, blijft het aanwezig
in het geparste document.

| Profiel | Bestaande veldselectie |
| --- | --- |
| `catalog` | `title,author,site_name,summary,word_count,reading_time,published_date,saved_at,image_url,source_url,url,category,tags,notes` |
| `maintenance` | `title,author,summary,word_count,reading_time,published_date,saved_at,updated_at,category,location,reading_progress,tags,notes` |
| `judge` | `title,summary,word_count,reading_time,published_date,saved_at,category,tags,notes,location` |
| `report` | `title,author,summary,word_count,reading_time,published_date,saved_at,category,tags,notes,location` |
| `feedback` | `title,author,summary,notes,location,category,word_count,reading_time,published_date,saved_at,tags` |
| `archive-cleanup` | `title,saved_at,category,location,tags` |

| Aanroeper | Profiel | Selectie |
| --- | --- | --- |
| `scripts/build-data.ts` | `catalog` | `later` |
| `scripts/priority-cli.ts` | `maintenance` | Een locatie per aanroep |
| `scripts/priority-judge.ts` | `judge` | `later` |
| `scripts/archive-cli.ts` | `maintenance` | `later` |
| `scripts/archive-lees-cli.ts` | `maintenance` | `later` |
| `scripts/archive-cleanup-cli.ts` | `archive-cleanup` | `archive` |
| `scripts/core-interest-report.ts` | `report` | `later` |
| `scripts/topic-priority-report.ts` | `report` | `later` |
| `scripts/lib/reading-feedback.ts` | `feedback` | `later`, daarna `archive`; bij gerichte feedback alleen document-ID |

Kleine lokale ophaalfuncties vervallen wanneer ze alleen de gedeelde functie
doorgeven. Locatiekeuze mag direct bij het inhoudelijke gebruik staan.

## Ophaalgedrag

1. Bouw `reader-list-documents` met de gekozen locatie of `--id`, een limiet
   van 100, de gekozen `--response-fields` en precies één `--json`.
2. Voer het commando uit via de meegegeven executor.
3. Parse JSON en gebruik `parseReadwiseDocumentPage` voor antwoordvalidatie.
4. Voeg documenten toe in de volgorde waarin Reader ze levert.
5. Volg een niet-lege `nextPageCursor` met `--page-cursor`. Ook een lege pagina
   met een vervolgcursor moet worden gevolgd.
6. Houd de ontvangen vervolgcursors per aanroep bij. Een herhaalde cursor,
   inclusief een cyclus over meerdere cursors, veroorzaakt een fout voordat
   dezelfde cursor opnieuw wordt opgevraagd.
7. Lever de verzamelde documenten pas op nadat alle pagina's zijn verwerkt.

De parser blijft zowel een losse documentarray als een object met `results`
accepteren. Een ontbrekende, null of lege vervolgcursor beëindigt de paginering.
Extra documentvelden blijven behouden zoals de bestaande parser ze bewaart.

Een transportfout, ongeldige JSON, ongeldig document of herhaalde cursor laat de
hele ophaalaanroep falen. Een gedeeltelijke documentset wordt nooit teruggegeven.
Cursorfouten krijgen een duidelijke melding over de herhaalde paginacursor,
zonder documentinhoud of transportcredentials in de melding.

Cursorbewaking wordt bij alle ophaalroutes actief. Dit is de expliciete
gedragsverbetering: een defecte paginastroom eindigt met een fout in plaats van
een onbegrensde reeks ophaalcommando's.

## Gedrag dat bij de aanroepers blijft

`priority-cli.ts` bepaalt welke locaties nodig zijn. Bij volledige opschoning
blijft de volgorde `later`, `new`, `shortlist`, `archive`, `feed`; documenten uit
`later` blijven gescheiden van documenten buiten die locatie.

Leesfeedback blijft documenten over pagina's en locaties dedupliceren met de
bestaande Map: de laatste versie wint en de oorspronkelijke invoegvolgorde blijft
behouden. Een ontbrekende of null locatie wordt daar aangevuld met de opgevraagde
locatie. Bij selectie op document-ID is er geen locatiefallback. Andere
aanroepers behouden duplicaten en vullen locaties niet aan.

`readwise-request.ts` blijft pacing en retries beheren. De ingestelde executors,
bufferlimieten en retry-instellingen van elke taak blijven behouden. De twee
impactrapporten behouden hun directe executor. Alleen het toevoegen van `--json`
verhuist daar van de executor naar de gedeelde ophaalmodule, zodat het argument
precies eenmaal voorkomt.

Highlights ophalen, documenten beoordelen, scoreberekening, tagmutaties,
journals, archiveringsbeslissingen en het schrijven van browserdata blijven bij
hun bestaande modules. Dit ontwerp heeft geen live Reader-mutaties nodig.

## Tests en verificatie

Nieuw testbestand: `test/readwise-documents.test.ts`. Tests gebruiken de
interface met een gescripte executor en controleren opgeleverde documenten,
opgevraagde selecties en waar nodig het uitblijven van volgende commando's.

- Meerdere pagina's, inclusief een lege tussenpagina met vervolgcursor.
- Array-antwoorden en objectantwoorden zonder vervolgcursor.
- Selectie op locatie en selectie op document-ID zonder locatiefilter.
- Alle zes profielen behouden hun bestaande velden; `language` ontbreekt en
  `--json` komt precies eenmaal voor.
- Documentvolgorde, duplicaten, extra velden en ontbrekende locaties blijven
  behouden; invoer wordt niet door de ophaalmodule genormaliseerd.
- Direct herhaalde cursors en cycli over meerdere cursors stoppen zonder een
  herhaalde aanvraag.
- Transportfouten, ongeldige JSON en ongeldige documenten na een succesvolle
  eerste pagina leveren een fout op, geen gedeeltelijk resultaat.

De bestaande tests voor leesfeedback blijven het samengestelde gedrag toetsen:
locaties, ID-selectie, privacy van feedback en foutpropagatie. Vul ze gericht aan
voor deduplicatie en locatiefallback als die uitkomsten nog geen dekking hebben.
Parser- en requestertests blijven hun eigen verantwoordelijkheid toetsen.

Gebruik daarnaast de bestaande tijdelijke `readwise`-executable uit
`test/archive-cleanup-cli.test.ts` voor een test met meerdere pagina's via de
werkelijke CLI. Controleer dat de uiteindelijke planinhoud documenten van alle
pagina's bevat. De bestaande test voor een leeg opschoonplan blijft geldig.

Voer na implementatie eerst de betrokken tests uit en daarna `npm run check`.
Voor deze refactor is geen databuild of live Reader-opvraag nodig. Als de
verificatie een fout in bestaande, afzonderlijke wijzigingen aantreft, rapporteer
die met bewijs en houd de refactor gericht op documentophalen.

## Aanvaardingscriteria

Alle negen routes gebruiken dezelfde ophaalmodule; de oude paginalussen en lokale
veldstrings zijn verwijderd. De veldselecties en taakgebonden verwerking blijven
behouden. Cursorbewaking werkt voor iedere route. Nieuwe tests oefenen de deep
module via zijn interface; bestaande samengestelde tests blijven hun gedrag
verifiëren. De gekozen module geeft locality voor ophaalbeleid en leverage aan
alle aanroepers, zonder extra shallow doorgeefmodules.
