# Semantische priority-review

Dit is het canonieke contract voor de lokale Codex-review van **alle actuele Later-documenten**.
Codex leest de bronnen en geeft het semantische oordeel. TypeScript haalt bronnen op, controleert
herkomst, schema en dekking, verwerkt lokale judgments en berekent deterministisch v8-scores en
rangschikking. Scripts genereren geen AI-scores en bewijzen geen inhoudelijk begrip.

Lees vóór beoordeling de [operationele referentie](../skills/readwise-reference.md) en de volledige
actuele [leesvoorkeuren](../config/readwise-reading-preferences.md). Die sturen persoonlijke
aansluiting; geringe aansluiting verlaagt niet vanzelf de inhoudelijke kwaliteit. Nieuwe voorkeuren
uit feedback vereisen de afzonderlijke [leesfeedbackroute](../README.md#leesfeedback).

## Route en scope

Een actuele Later-review is een publicatiejob, geen read-only rapportage. De run krijgt vóór de
eerste inhoudelijke beoordeling een remote run-start-SHA en beide configbaselines. Alleen een run
die alle eigen geproduceerde priority- en profielobjecten valideert mag naar de publicatiefase.
Een ontbrekende/stale bron maakt de review niet “bijna klaar”: los het bronprobleem eerst op of
stop de review zonder accepted partials te importeren.

Werk vanuit de repository, met een eigen private runmap onder `.tmp/readwise/`:

```bash
npm run priority:judge -- prepare-review --all-later --run-dir PAD
npm run priority:judge -- fetch-review-sources --run-dir PAD
npm run priority:judge -- review-status --run-dir PAD
npm run priority:judge -- import-review --run-dir PAD
```

1. `prepare-review` haalt gepagineerd heel actueel Later op, bewaart de run-startbaseline en maakt
   een bronmanifest en reviewwerkvoorraad. Alle categorieën en prioriteitsniveaus tellen mee,
   inclusief boeken en video's; huidige top-100-lidmaatschappen beperken de scope niet.
2. Codex beoordeelt de geselecteerde documenten en bewaart pogingen in de runmap. Werk lokaal
   autonoom door zonder toestemming per batch. De opdracht autoriseert deze volledige review.
   Als de bulkroute lege bodies geeft, vult `fetch-review-sources` de bronmap vanuit passende
   private caches en detailophaling aan en schrijft batches op tekstomvang in `source-batches/`.
   Een cache bewijst geen volledigheid; import vergelijkt opnieuw met de actuele bron.
3. `review-status` toont dekking, hergebruik, resterend werk en bron-/reviewproblemen. Controleer
   voor afronding opnieuw tegen actueel Later; nieuwe of gewijzigde documenten vragen aanvullende
   evidence. Een oude snapshot alleen bewijst geen actuele dekking.
4. `import-review` valideert en verwerkt uitsluitend lokale accepted judgments uit deze run.
   Het is een tussenstap voor het opbouwen van `proposed/`, geen eindstatus. Behoud andere lokale
   edits; vergelijk per ID met de baseline en stop de conflicterende import bij een gelijktijdig
   gewijzigd oordeel voor hetzelfde ID.

5. Publiceer dezelfde run direct na de validators via de geïsoleerde `review:publish`-route. Maak
   daarna een schone tijdelijke worktree vanaf de opnieuw gecontroleerde remote tip, commit alleen
   de twee reviewconfiguraties, push `HEAD:main` en verifieer de remote SHA. De review is pas klaar
   nadat die verificatie geslaagd is; evidence, import of een geschreven outputdirectory zijn geen
   publicatie.

Na een onderbreking bewaart `review-status` de actuele ID-selectie in `live-selection.json`.
Hervat de nog actieve open IDs; bewaar het werk voor vertrokken documenten als historie.
Bij een bewust tot actueel Later beperkte import kan `import-review --exclude-departed`
deze vertrokken IDs uitsluiten. `import-scope.json` legt die uitsluiting vast; de standaardimport
stopt nog steeds wanneer een beoordeeld document niet meer in Later staat. Nieuwe IDs vragen
een aanvullende snapshot en eigen bronreview vóór een claim van volledige actuele dekking.

Wanneer een bestaande bron of inhoudelijke metadata verandert, voer na `review-status` gericht
`refresh-review-sources --run-dir PAD --stale` uit (of `--document-id ID` voor één bron).
De oude bron/context/poging blijft in `history/`; de nieuwe metadata staat in `contexts/`.
De oorspronkelijke ID-snapshot en publicatiebaseline blijven intact. Codex leest en beoordeelt
de gewijzigde bron opnieuw vóór import; alleen fingerprints vervangen is geen herbeoordeling.
`applied.json` registreert welke compacte judgments deze run lokaal heeft verwerkt. Een eigen
latere bewijsverbetering kan daarmee veilig worden verwerkt; latere gebruikerswijzigingen voor
hetzelfde ID blijven een conflict. De originele baseline blijft de grens voor remote publicatie.

Leesprofielmigratie is een **optionele, afzonderlijk opgenomen scope**, geen voorwaarde voor
priority-review. Volg alleen bij die scope [reading-profiles.md](reading-profiles.md); behoud anders
de bestaande profieledits. Bewaar private bronnen tot alle opgenomen beoordelingen en rapportages
klaar zijn. Publicatie volgt de bestaande geïsoleerde merge-/publicatieroute uit de operationele
referentie. Reader-mutaties volgen de bestaande plan-/bevestigingsroute; de lokale review verleent
daarvoor geen toestemming.

## Bronstandaard en hergebruik

De standaard voor nieuwe review en hergebruik is `full-source-v1`. De judgmentconfig blijft
achterwaarts compatibel met versie 2 en rubric `semantic-v2`; de bronstandaard is aanvullende
reviewprovenance, geen vervanging van die rubric. Zie de bestaande
[judgmenttypes en validator](../scripts/lib/priority-judgments.ts).

Een herbruikbaar oordeel is semantisch `accepted`, medium/high, compleet voor alle dimensies en
topics, en aantoonbaar volgens `full-source-v1` beoordeeld. Vergelijk bronmetadata, contenthash,
evidencefingerprint en actuele voorkeurenfingerprint met de reviewprovenance. Een oud
`semantic-v2`-label of alleen ongewijzigde titel/metadata is onvoldoende. Ontbrekende provenance,
gewijzigde inhoud/voorkeuren, stale records en incomplete ratings vragen review. Een operationele
`automated-fallback-v1` telt ook met status `accepted` nooit als semantische dekking.

Leg privaat vast welke bronvariant en velden zijn opgehaald, met document-ID, metadatafingerprint,
contenthash, ophaalstatus en controleerbare bronindeling. Beschikbaarheid is mechanisch;
**Codex beoordeelt daarnaast of de bron inhoudelijk volledig is en volledig gelezen werd**.
Een niet-lege response of downloadstatus `complete` bewijst dat laatste niet.

| Vorm | Vereiste bronlezing |
| --- | --- |
| Artikel | Alle relevante bodysecties, inclusief inhoudelijke noten, tabellen en afbeeldingen. Titel, samenvatting, highlights en verrijkingsnotities vervangen de body niet. |
| PDF | Alle relevante pagina's, inclusief figuren/tabellen die het betoog dragen; controleer tekstextractie op ontbrekende pagina's of inhoud. |
| EPUB/boek | De volledige boektekst, met alle inhoudelijke hoofdstukken en relevante noten; excerpt, inhoudsopgave of losse highlights volstaan niet. |
| Video | Het volledige transcript volstaat wanneer ontbrekend visueel materiaal het oordeel niet belemmert. Beoordeel dit expliciet; inhoudelijk noodzakelijke demonstraties of slides moeten ook beschikbaar en bekeken zijn. |

Registreer tekorten als `partial`, `missing` of `error`, met oorzaak en gevolgen voor de beoordeling.
Een afgeronde download met ontbrekende hoofdstukken blijft inhoudelijk onvolledig. Bewaar de cache
en haal ontbrekende bron read-only op waar mogelijk; verzin geen vervangende tekst.

Batch op een expliciet tekst-/contextbudget, met ruimte voor analyse en output. Alleen een limiet
van 25 documenten beschermt dat budget niet. Lees lange werken in geordende chunks met stabiele
offsets; registreer gelezen bereiken en ontbrekende delen. Rond pas af als alle relevante delen
gelezen zijn. Herlees gericht bij een open vraag; een vast aantal passes is geen kwaliteitscriterium.

## Oordeel en private reviewpoging

Beoordeel eerst onafhankelijk van huidige rang, positie-/toplijsttags, curatie en eerdere scores
of judgments. Houd deze signalen buiten de eerste inhoudelijke beoordeling; vergelijk hun impact
pas daarna. Metadata en inhoudstags helpen oriënteren, maar bronpassages dragen het oordeel.
Highlightaantallen, gegenereerde provenance en triage-aanbevelingen leveren geen inhoudelijk bewijs.

Leg per private poging minimaal vast:

- Identiteit, reviewer, tijd, bronstandaard, rubric en bron-/evidence-/voorkeurenfingerprints.
- De centrale thesis in eigen woorden; per dimensie een eigen reason met specifieke bronoffsetrefs.
  Verwijs naar de gehashte bron en controleerbare bereiken: tekstoffsets, PDF-pagina plus bereik,
  EPUB-hoofdstuk plus bereik of transcripttijdcodes. Motiveer ook lage/afwezige aansluiting.
- Bronbeschikbaarheid én Codex' volledigheidsoordeel, met een concrete reden waarom de gelezen
  inhoud het hele werk dekt of welke delen ontbreken. Bij video: de betekenis van ontbrekende beelden.
- Onzekerheden afzonderlijk onder `source`, `interpretation` en `personalFit`, met impact op het
  oordeel en eventuele gerichte herlezing. Noteer expliciet wanneer een categorie geen onzekerheid bevat.
- Scores voor zover onderbouwd, confidence, status en reden voor accepteren, draft of afwijzen.
  Laat onbeoordeelbare dimensies in een private draft open; vul ze niet met schijnscores of nullen.

De private poging draagt de uitgebreide onderbouwing. Importeer alleen een valide accepted object
volgens het bestaande configschema, met compacte eigen motivering en verwijzingen. Volledige bron,
ruwe highlights, feedback en private pogingen blijven in Reader of `.tmp/readwise/`; kopieer ze
niet naar config, browserdata of publieke rapporten.

### Aanvullende volledige tekst bij een onvolledige Reader-extractie

Als de oorspronkelijke tekst read-only beschikbaar is, mag Codex die toevoegen aan de private
poging onder `additionalSources`. Elke bron krijgt een uniek `id`, de HTTP(S)-ophaal-URL in
`sourceUrl`, `fetchedAt`, de exacte tekst in `content`, haar SHA-256 in `contentHash` en volledige
gelezen UTF-16-`readRanges`. Verander de tekst niet na het vastleggen van hash en offsets.
Motiveer in `completenessReason` waarom deze bron bij het opgeslagen werk hoort, welke lacune
zij oplost en of editie/versie of context de beoordeling nog begrenzen. Een extra bron is geen
bewijs van volledigheid zonder daadwerkelijke volledige lezing en inhoudelijke controle.

Een passage blijft standaard verwijzen naar de Reader-bron. Voeg voor een aanvullende bron
`sourceId` aan de passage toe; `start` en `end` gelden dan voor díé volledige tekst. De validator
controleert unieke bron-IDs, hashes, volledige gelezen bereiken en de brongebonden passagegrenzen.
Behoud de oorspronkelijke Reader-bron en haar hash; metadata, voorkeuren en de actuele Reader-body
blijven ook bij import vereist en gecontroleerd. Aanvullende teksten zijn bevroren bronversies van
hun ophaaltijd; import claimt niet dat hun websites opnieuw zijn opgehaald. Alleen hun hashes en de
assessmenthash mogen naar config. Tekst, URLs en uitgebreide onderbouwing blijven privé.

## Rubric en confidence

Confidence beschrijft de zekerheid over deze leesprioriteitsbeoordeling. Het is geen keurmerk
dat alle beweringen van de auteur waar zijn. Beoordeel zichtbare onderbouwing en beperkingen;
twijfel over dragende claims kan de substantierating of confidence begrenzen.

Alle ratings zijn integers. Geef de vier globale ratings elk **0–4**: `relevance` (persoonlijke
aansluiting), `substance` (inhoudelijke diepgang/onderbouwing), `durability` (blijvende waarde) en
`usefulness` (bruikbaarheid voor werk, interesses of begrip). Kalibreer 0 als afwezig, 1 als gering,
2 als gedeeltelijk, 3 als duidelijk en 4 als sterk; onderbouw elke dimensie afzonderlijk.

Geef ook **alle zes** `topicRelevance`-ratings, elk **0–4**: `scrum`, `software-development`,
`front-end-development`, `social-studies`, `adhd` en `philosophy`. Gebruik de persoonlijke
filosofische afbakening uit de actuele voorkeuren; een algemene tag of denkersnaam bewijst geen
hoge aansluiting. Geef onderbouwde toepasselijke `sequenceFit`-waarden **−2–2**: van duidelijke
mismatch via neutraal (0) tot sterke fit. Rating of fit creëert geen reeksleden; de
[membershipregels](../scripts/lib/priority-membership.ts) blijven bepalend, met boeken uitsluitend
in de boekreeks. De [v8-motor](../scripts/lib/readwise-priority-v8.ts) berekent de gewogen scores.

| Confidence/status | Beslissingsregel |
| --- | --- |
| `high`, `accepted` | Volledige bronlezing volgens bovenstaande vormvereisten, specifieke passageonderbouwing per dimensie en geen materiële onzekerheid in bron, interpretatie of persoonlijke fit. |
| `medium`, `accepted` | Volledige bronlezing en complete, voldoende onderbouwde ratings, met expliciet begrensde onzekerheid over interpretatie of persoonlijke fit. Volledige lezing verplicht niet tot high. |
| `draft` | Onvolledige bronlezing, ontbrekend bewijs of onzekerheid die een complete acceptabele beoordeling verhindert; beschrijf wat nog nodig is. |
| `rejected` | Een gemotiveerd onbruikbare reviewpoging; behoud reden en provenance. Lage inhoudelijke waarde is op zichzelf geen reden voor rejection: een lage rating kan goed onderbouwd accepted zijn. |

**Stopregel:** hergebruik een geldig medium-oordeel. Herhaal de review niet om high te bereiken;
heropen alleen bij nieuwe inhoud, gewijzigde voorkeuren, een concrete fout of nieuwe relevante evidence.

## Gedeeld geldigheidsbeleid

`evaluateJudgmentValidity` in `scripts/lib/priority-judgments.ts` bepaalt geldigheid
op drie expliciete bewijsniveaus. De bestaande score- en reviewroutes gebruiken deze
beslissing en behouden hun eigen rapportage:

- `operational`: een gevalideerd accepted oordeel met passende documentmetadata blijft
  bruikbaar voor scoring, ook zonder nieuwe reviewprovenance.
- `evidence`: controleert daarnaast de beoordelingsevidence en de voorkeuren en rubric
  die de snapshot opgeeft. Legacy snapshots zonder die context blijven ondersteund;
  de rubric van de configuratie geldt wanneer het oordeel geen eigen rubric vermeldt.
- `full-source`: vereist de actuele voorkeuren, volledige bronprovenance en contenthash,
  medium/high confidence en alle topics. Dit bepaalt hergebruik voor volledige bronreview.

Ontbrekende topics blijven afzonderlijk rapporteerbaar: een evidence-oordeel kan accepted
zijn terwijl aanvullende topicbeoordeling nodig is. Een automatisch fallbackoordeel is
operationeel bruikbaar maar telt niet als semantisch herbruikbare beoordeling.
Het verschil tussen deze niveaus is bewust; een bronfout of ontbrekende nieuwe provenance
mag op zichzelf geen operationele rangwijziging veroorzaken.

## Accepted behouden en dekking rapporteren

Bewaar draft/rejected pogingen naast een bestaand accepted oordeel. Een nieuwe mislukte poging
overschrijft dat oordeel niet. Een oud accepted blijft operationeel bruikbaar zolang de bestaande
metadata-matching geldig is. Het geldt zonder nieuwe provenance niet als gecontroleerd volgens
`full-source-v1`. Een bronfout mag geen nieuwe fake scores, impliciete
verwijdering of onbedoelde fallback/rangwijziging veroorzaken. Houd die import tegen en rapporteer
het probleem; houd bestaand operationeel fallbackgedrag afzonderlijk zichtbaar.

Rapporteer de totale actuele Later-ID-set en afzonderlijk hergebruikte en nieuw accepted beoordelingen
(medium/high), targeted/open, draft, rejected, missing, stale, fallbacks, incomplete topics en
bronstatussen. Deze categorieën kunnen overlappen; specificeer hun betekenis per ID. Administratief
alle IDs afgehandeld, ook met draft/rejected, betekent niet dat alle documenten bruikbaar semantisch
beoordeeld zijn. Claim volledige bruikbare dekking pas als elk actueel Later-ID een geldig compleet
accepted oordeel heeft. Geef overige uitkomsten en blokkades expliciet aan.

## Synthetische kalibratieankers — GEEN echte beoordelingen

Deze drie verzonnen gevallen illustreren de beslisgrens; het zijn geen bronreviews, configobjecten
of te importeren scores.

| Geval | Voorbeeld van onderbouwing | Uitkomst |
| --- | --- | --- |
| Fictief artikel over facilitation | Hele body gelezen; offsets 120–640 dragen de thesis, 900–1600 de methode en 1800–2200 de beperkingen. Elke rating is aan zulke passages gekoppeld; persoonlijke aansluiting is duidelijk en er rest geen materiële onzekerheid. | `high`/`accepted` is mogelijk; lengte of onderwerp alleen rechtvaardigt dit niet. |
| Fictieve filosofische video | Volledig transcript gelezen, inclusief tegenargumenten op 18:00–24:00; beelden voegen alleen decor toe. De thesis en alle dimensies zijn onderbouwd, maar de aansluiting bij de persoonlijke geest-/taalvragen blijft begrensd onzeker. | `medium`/`accepted`; noteer `personalFit`, hergebruik zonder jacht op high. |
| Fictieve PDF met extractiegaten | Alleen pagina's 1–3 en 9 beschikbaar; de methode en resultaten op 4–8 ontbreken. Een stellige samenvatting in metadata lost het gat niet op. | `partial`/`draft`; ontbrekende ratings blijven open en een bestaand accepted wordt niet overschreven. |
