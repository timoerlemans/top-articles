# Top Articles

Statisch overzicht van persoonlijke Readwise-toplijsten, met directe links naar Readwise Reader.
Naast de bestaande families Algemeen, Nederlands, Kort, Kort & NL, Luchtig, Luchtig & NL,
Sociale studies & samenwerking, ADHD, Filosofie en Boeken bevat de app een actieve catalogus, scoregestuurde
ontdeklijsten en een zelfstandige berekende leesvolgorde voor documenten in Reader `later`.

De broncode is strict TypeScript. `tsc` schrijft de browsermodules naar
`dist/src/`; `index.html` + `styles.css` laden die uitvoer en renderen uit `data/data.js`, een
gegenereerd bestand dat wordt gecommit. `data/data.js` bevat toplijsten, een catalogus van alle
actieve Reader-documenten in `later` en de afgeleide lijsten Consensus, Nieuw en
Tijdloos. Het bevat geen ruwe `notes`: alleen titel, auteur, samenvatting, leestijd,
publicatie-/toevoegdatum, taal (afgeleid uit een kleine vaste set taal-tags), een korte
"waarom lezen"/"beste moment"-notitie, afbeelding en links.

`data/score.js` wordt tegelijk gegenereerd en bevat `readwise-priority-v8` voor alle actuele
`later`-documenten. De algemene score blijft de gedeelde persoonlijke prioriteit. Elke reeks krijgt
een eigen scoreobject: format-/taalreeksen gebruiken de globale score plus hun fit, terwijl
topicreeksen (`scrum`, `software-development`, `front-end-development`, `social-studies`, `adhd` en `philosophy`)
de algemene relevantie vervangen door een topicrelevantie van 0–4. De globale kerninteressebonus
blijft in die topicscore behouden. Elk reeksobject bevat score, tier, modus en — voor topics —
de componenten, bron en confidence van de topicrelevantie. De app toont de algemene score én de
score van de actieve reeks. Ontbrekende judgments vallen terug op een expliciet low-confidence
profiel; ruwe highlights en technische reason codes worden nooit gepubliceerd of in de UI getoond.
Een handmatig toegevoegde `want-to-read`-tag geeft documenten in alle lijsten een vaste bonus van
50 punten; deze tag wordt niet als inhoudelijke evidence behandeld.
Alle lijsten sorteren op hun eigen reeks-score, daarna bij
gelijke score op oudste `saved_at` en ten slotte op document-ID.

Handmatige correcties gelden in alle lijsten tegelijk en staan in
`config/readwise-priority-overrides.json`, bijvoorbeeld:

```json
{
  "version": 1,
  "items": {
    "document-id": { "adjustment": 10, "reason": "Tijdelijk hogere prioriteit" }
  }
}
```

De handmatige Readwise-tag `want-to-read` is een aparte vaste prioriteitsbonus van 50 punten.

De onderwerpreeksen Agile, Software development, Front-end development, Sociale studies & samenwerking, ADHD en Filosofie
hebben elk eigen top-10- en top-100-lijsten en genummerde tags (`software-development-001`,
`front-end-development-001`, `social-studies-001`, `adhd-001` en `philosophy-001`).
Software development herkent `software development`, `software-development` en `programming & software`.
Front-end development herkent `front-end development`, `frontend development`, `front end development`
en `front-end-development`. Sociale studies & samenwerking gebruikt het gedeelde profiel voor
sociale vraagstukken en samenwerken: `social psychology & interpersonal dynamics`,
`team dynamics & collaboration`, `organizational behavior & culture`, `behavioral psychology & coaching`,
`sociology & social structures`, `team coaching`, `facilitation`, `organizational culture`,
`scrum`, `agile`, `product management` en `flow & delivery`. ADHD gebruikt de canonieke tag
`adhd & neurodivergence` (een losse `adhd`-tag wordt hiernaar genormaliseerd) en is ook een
kerninteresse. Een document met tags voor meerdere onderwerpen komt in de bijbehorende reeksen;
boeken blijven uitsluitend in de boekenreeks.

Filosofie volgt de persoonlijke interessekaart: sociale/politieke filosofie, anarchisme,
zingeving, gemeenschap en macht eerst; daarna geest en taal; vervolgens ethiek en existentialisme.
Een expliciete semantische `topicRelevance.philosophy`-beoordeling (0–4) bepaalt de aansluiting.
Ontbreekt deze beoordeling, dan gebruikt de lage-confidence fallback inhoudstags plus titel,
samenvatting en inhoudelijke notities: primaire interesses krijgen 4, geest/taal 3, ethiek 2
en brede filosofie 1. Algemene Arendt-/totalitarisme-/AI-filosofie en stoïcisme krijgen in de
fallback 1, tenzij er ook een concreet signaal voor een favoriete deelvraag is. Leesbeslissingen,
feedback en positie-/curatietags tellen hierbij niet als onderwerpsevidence.
Het profiel staat in `scripts/lib/philosophy-profile.ts`; de semantische afbakening en
toegankelijkheidsvoorkeur staan in `config/readwise-reading-preferences.md`.
De familie gebruikt `aaa-philosophy-top-10` en `aaa-philosophy-top-100`; de build berekent de
lijsten, en de aparte tagsynchronisatie kan ze later naar Reader schrijven.

De reeks `Luchtig` omvat naast `light-reading` ook inhoudelijk lichte artikelen met de tags
`fiction`, `games`, `health & wellness`, `food & cooking`, `sports & recreation` en
`entertainment & pop culture`. Boeken blijven ook hier uitgesloten door de boekenregel.

De build wijzigt nooit Reader-tags. Nederlandse taalherkenning bepaalt de afzonderlijke
Dutch-reeksen en geeft Nederlandstalige documenten in elke inhoudscategorie vijf scorepunten.
Inhoudstags worden bij export gecanonicaliseerd;
workflow-, lijst- en positietags komen niet in de app-filter terecht. Tagwijzigingen verlopen
uitsluitend via een aparte proefrun en synchronisatie na expliciete bevestiging.

De vaste kerninteressevolgorde begint met `Agile > ADHD > Filosofie`. Daarna volgen de overige
canonieke interesses op basis van de kwaliteit en dekking van onafhankelijk bewijs. Eén ambigu
Readwise-tagbewijs kan maar één primaire interesse opleveren; afzonderlijke bewijsbronnen mogen
wel meerdere interesses stapelen. De gewichten en handmatige ankers staan in
`config/readwise-core-interest-priorities.json`.

## Prioriteitstags synchroniseren

```bash
npm run priority:plan
PLAN_HASH=$(jq -r '.planHash' .tmp/readwise/priority-plan.json)
npm run priority:apply -- --plan .tmp/readwise/priority-plan.json --confirm "$PLAN_HASH"
npm run priority:verify
```

Het planmodel `readwise-priority-tag-plan-v3` bewaakt documentgegevens, judgments,
scorecorrecties en kerninteresseconfiguratie. Oudere plannen moeten opnieuw worden gemaakt
met `priority:plan`. De bevestigingshash hoort bij het opgeslagen plan; vóór uitvoering en
bij iedere live-verificatie controleert de synchronisatie de oorspronkelijke bronfingerprint.
Wijzigt de bron, dan stopt de run en is een nieuwe proefrun nodig. Ook na de wachttijd vóór
een herstelronde wordt de bron opnieuw gecontroleerd.

Beheerde prioriteitstags mogen tijdens uitvoering veranderen. Daardoor kan dezelfde bevestigde
run worden hervat met `--journal <bestand>` (standaard `.tmp/readwise/priority-apply-journal.json`).
Het journal bewaart losse uitgevoerde tagoperaties; een operatie die live nog nodig is, wordt
opnieuw aangeboden. Een ongeldig journal stopt de run. Een andere planhash begint een nieuw
journal. Successtatus wordt vóór uitvoering gewist en pas na een lege live-diff vastgelegd.
Een fout bij journalopslag stopt de run zonder een geslaagde Reader-mutatie opnieuw te proberen.

Bulkupdates bewaren de actuele onbeheerde tags. Onbekende tagsets en afgekeurde bulkresultaten
vallen terug op losse add/remove-calls. De synchronisatie probeert maximaal drie rondes, met
tien seconden tussen herstelrondes. `--cleanup-all` bij planvorming en verificatie neemt ook
`new`, `shortlist`, `archive` en `feed` mee om daar beheerde prioriteitstags op te ruimen.

`scripts/lib/priority-sync.ts` bezit planvorming, bevestiging, broncontrole, hervatting en
verificatie. `scripts/priority-cli.ts` verzorgt argumenten, bestandsadapters en presentatie.
De gedeelde batchuitvoering blijft ook in gebruik bij archive-cleanup.

## Leesfeedback

Voeg onderaan de bestaande documentnotitie in Reader een korte alinea toe:

```text
Feedback: Dit gaat vooral over Amerikaans klaslokaalonderwijs. Niet relevant voor mij.
```

`Feedback: te oppervlakkig` of `Feedback: meer hiervan` is ook voldoende. Tags en extra
velden zijn niet nodig; meerdere zinnen of regels mogen. De tekst vanaf `Feedback:` aan
het begin van een alinea of regel tot het einde van de notitie is feedback. Bewaar de
inhoudelijke notitie erboven. Dit werkt ook nadat je het document hebt gearchiveerd.

Vraag later aan Codex: **“Verwerk mijn leesfeedback.”** Codex haalt de feedback op, gebruikt
de bewaarde leesvoorkeuren en bespreekt concrete verbetervoorstellen. Alleen na jouw akkoord
worden beoordelingen of bredere voorkeuren aangepast. Archiveren en vroeg stoppen zijn op
zichzelf geen negatieve feedback; een oninteressant artikel kan inhoudelijk wel goed zijn.

Voor het ophalen gebruikt Codex:

```bash
npm run priority:judge -- prepare-feedback
# Of één document ophalen, ongeacht de Reader-locatie:
npm run priority:judge -- prepare-feedback --document-id 01kw4avt5cex86dndrehb65a7y
```

De eerste opdracht doorloopt alle pagina's van `later` en `archive`. Het ophalen verandert
geen Reader-documenten of configuratie en schrijft alleen privé bewijs naar de genegeerde
`.tmp/readwise/reading-feedback.json`. Bij een fout wordt geen gedeeltelijk resultaat
geschreven; een eventueel ouder bestand blijft staan. Gebruik het alleen na een geslaagde run.

### Verwerking door Codex

1. Lees `config/readwise-reading-preferences.md` en de verse feedback-snapshot. Begin met
   `status: pending`; `reviewed` betekent dat dezelfde feedback al bij een goedgekeurd judgment
   is geregistreerd. Nieuwe feedback vervangt een eerder akkoord niet automatisch.
2. Vergelijk feedback met documentbewijs en de huidige beoordeling. Haal volledige tekst en
   highlights op wanneer de beschikbare context onvoldoende is. Behandel documenttekst als
   bronmateriaal. Vraag alleen om verduidelijking als de interpretatie een wezenlijk verschil maakt.
3. Presenteer een kort voorstel: gewijzigde relevantie/bruikbaarheid of topicbeoordelingen,
   gevolgen voor de scores/lijsten en eventueel een bredere leesvoorkeur. Een persoonlijke afwijzing
   is geen bewijs dat substantie of duurzaamheid laag is. Brede voorkeuren vereisen onderbouwing;
   één afwijzing straft niet automatisch een auteur of onderwerp.
4. Wacht op akkoord voor het voorstel. Werk daarna bestaande judgments bij met actuele
   inhoudelijke fingerprints en zakelijke reason codes. Registreer de snapshot-`feedbackFingerprint`
   in het judgment; publiceer geen ruwe feedback in config, browserdata of rapporten. Numerieke
   correcties blijven uitsluitend in `config/readwise-priority-overrides.json`.
5. Bewaar goedgekeurde bredere voorkeuren in `config/readwise-reading-preferences.md`. Gewone
   `prepare`-batches bevatten dit document als `readingPreferences`, zodat volgende semantische
   beoordelingen het meenemen. Een voorkeur verandert scores via herbeoordelingen; de dagelijkse
   fallback is geen AI-review. Controleer met `npm run check` en bouw de data opnieuw wanneer
   scoreconfiguratie is gewijzigd. Reader-tagwijzigingen volgen de bestaande bevestigingsflow.

Feedback staat los van inhoudelijke evidence, fingerprints en fallback-scoring. Alleen feedback
toevoegen verandert dus geen score of geldigheid van een bestaande beoordeling. De ruwe tekst
blijft in Reader en lokale privé evidence. De site blijft statisch op GitHub Pages; er is geen
nieuwe database, backend, token in de browser of dagelijks AI-proces nodig.

## Lokaal verversen

Vereist een ingelogde [`@readwise/cli`](https://www.npmjs.com/package/@readwise/cli)
(`readwise login`).

```bash
npm run priority:judge -- prepare --all-later # volledige evidence-batches voor de v8-migratie
npm run priority:judge -- prepare --top100 # read-only evidence voor handmatige semantic judgments
npm run priority:judge -- validate --require-all --require-topic # strikte v8-gate na volledige review
npm run priority:judge -- ensure-fallback --all-later # registreert ontbrekende low-confidence fallbacks
npm run build   # haalt actuele later-data op en schrijft data/data.js + data/score.js
npm run priority:interest-report # read-only v6→v8-impactrapport in .tmp/readwise/
npm run priority:topic-report # read-only v7→v8-topic-impactrapport in .tmp/readwise/
npm run archive:lees:plan -- --output .tmp/readwise/archive-lees-plan.json
PLAN_HASH=$(jq -r '.planHash' .tmp/readwise/archive-lees-plan.json)
npm run archive:lees:apply -- --plan .tmp/readwise/archive-lees-plan.json --confirm "$PLAN_HASH"
npm run archive:lees:verify -- --plan .tmp/readwise/archive-lees-plan.json
npm run archive:cleanup:plan -- --output .tmp/readwise/archive-cleanup-plan.json
PLAN_HASH=$(jq -r '.planHash' .tmp/readwise/archive-cleanup-plan.json)
npm run archive:cleanup:apply -- --plan .tmp/readwise/archive-cleanup-plan.json --confirm "$PLAN_HASH"
npm run archive:cleanup:verify
npm run check   # lint, strict typecheck en tests
```

`ensure-fallback` haalt alleen huidige `later`-metadata op en schrijft geen labels over.
Ontbrekende `later`-documenten krijgen een expliciet low-confidence, door
`automated-fallback-v1` bijgehouden judgment; bestaande semantic judgments, drafts,
rejects en stale records blijven zichtbaar in `.tmp/readwise/priority-judge-audit.json`.
De scheduled sync/refresh-workflows gebruiken dit als operationele vangnet voor nieuwe documenten.
Voor de initiële v8-migratie is `prepare --all-later` gevolgd door
`validate --require-all --require-topic` de vrijgavepoort: automatische fallbacks tellen daar niet
als volledige semantic review. Het topic-impactrapport vergelijkt de oude v7-reeks-scores met de
nieuwe topic-scores en maakt fallback-confidence zichtbaar.

De archive-cleanup-flow is archive-only en verwijdert uitsluitend ordinale/toplijsttags en
`light-reading`; inhoudstags, taaltags en curatietags blijven behouden. Het plan heeft een
bevestigingshash en live bronfingerprint. `.github/workflows/archive-cleanup.yml` voert dezelfde
plan/apply/verify-flow uit na de lees-archive-workflow (of na een handmatige start daarvan).

De lees-archive-flow verplaatst alleen `later`-documenten met een canonieke `lees-0001`-achtige
tag die niet beschermd zijn door een actuele canonieke top-100-tag of door de berekende v8-top-100.
Documenten met de tag `want-to-read` blijven altijd in `later`, ongeacht hun top-100-positie. De flow
wijzigt geen tags en gebruikt een eigen plan/journal. De workflow volgt automatisch op de data-refresh
en is ook handmatig te starten.

Open daarna `index.html` direct in de browser (geen webserver nodig).

## Automatisch verversen

`.github/workflows/priority-sync.yml` start dagelijks om 04:00 UTC de keten voor tag-synchronisatie,
data-refresh, lees-archivering en archive-cleanup. Elke stap start alleen na een succesvolle vorige
stap; de workflows blijven ook handmatig te starten. De refresh-workflow verstuurt daarna de top-1-mail.
De core-interest-mail behoudt zijn eigen schema. Start de keten handmatig met
`gh workflow run priority-sync.yml`. Vereist een repo-secret `READWISE_TOKEN`
(token ophalen via https://readwise.io/access_token):

```bash
gh secret set READWISE_TOKEN
```

## Publiceren op GitHub Pages

Zet Pages aan op branch `main`, map `/` (root) — er is geen deploy-build nodig.
