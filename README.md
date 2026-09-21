# Top Articles

Statisch overzicht van persoonlijke Readwise-toplijsten, met directe links naar Readwise Reader.
Naast de bestaande families Algemeen, Nederlands, Kort, Kort & NL, Luchtig, Luchtig & NL,
Sociale studies & samenwerking, ADHD en Boeken bevat de app een actieve catalogus, scoregestuurde
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
topicreeksen (`scrum`, `software-development`, `front-end-development`, `social-studies` en `adhd`)
de algemene relevantie vervangen door een topicrelevantie van 0–4. De globale kerninteressebonus
blijft in die topicscore behouden. Elk reeksobject bevat score, tier, modus en — voor topics —
de componenten, bron en confidence van de topicrelevantie. De app toont de algemene score én de
score van de actieve reeks. Ontbrekende judgments vallen terug op een expliciet low-confidence
profiel; ruwe highlights en technische reason codes worden nooit gepubliceerd of in de UI getoond.
Een handmatig toegevoegde `want-to-read`-tag geeft documenten in alle lijsten een vaste bonus van
25 punten; deze tag wordt niet als inhoudelijke evidence behandeld.
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

De handmatige Readwise-tag `want-to-read` is een aparte vaste prioriteitsbonus van 25 punten.

De onderwerpreeksen Agile, Software development, Front-end development, Sociale studies & samenwerking en ADHD
hebben elk eigen top-10- en top-100-lijsten en genummerde tags (`software-development-001`,
`front-end-development-001`, `social-studies-001` en `adhd-001`).
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

## Lokaal verversen

Vereist een ingelogde [`@readwise/cli`](https://www.npmjs.com/package/@readwise/cli)
(`readwise login`).

```bash
npm run priority:judge -- prepare --all-later # volledige evidence-batches voor de v8-migratie
npm run priority:judge -- prepare --top100 # read-only evidence voor handmatige semantic judgments
npm run priority:judge -- validate --require-all --require-topic # strikte v8-gate na volledige review
npm run priority:judge -- ensure-fallback --all-later # registreert ontbrekende low-confidence fallbacks
npm run build   # haalt actuele later-data op en schrijft data/data.js + data/score.js
npm run priority:interest-report # read-only v6→v7-impactrapport in .tmp/readwise/
npm run priority:topic-report # read-only v7→v8-topic-impactrapport in .tmp/readwise/
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
plan/apply/verify-flow ieder uur uit.

Open daarna `index.html` direct in de browser (geen webserver nodig).

## Automatisch verversen

`.github/workflows/refresh.yml` draait dagelijks en bij handmatige trigger
(`gh workflow run refresh.yml`). Vereist een repo-secret `READWISE_TOKEN`
(token ophalen via https://readwise.io/access_token):

```bash
gh secret set READWISE_TOKEN
```

## Publiceren op GitHub Pages

Zet Pages aan op branch `main`, map `/` (root) — er is geen deploy-build nodig.
