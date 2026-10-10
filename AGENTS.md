# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Wat dit is

Site met persoonlijke Readwise-toplijsten, met directe links naar Readwise Reader. De broncode is
strict TypeScript; er is geen bundler, maar wel een compilatiestap. Eén `tsconfig.json` compileert
`src/**/*.ts`, `scripts/**/*.ts` en `test/**/*.ts` (rootDir `.`) naar `dist/`. `index.html` +
`styles.css` + de gecompileerde `dist/src/app.js` renderen alles clientside uit twee gegenereerde
en gecommitte databestanden: `data/data.js` (`window.TOP_ARTICLES`) en `data/score.js`
(`window.TOP_ARTICLE_PRIORITY`). Beide bestanden dragen de banner "Automatisch gegenereerd door
scripts/build-data.ts — niet handmatig bewerken." — nooit handmatig aanpassen, altijd via
`npm run build`.

Belangrijkste bronbestanden:
- `src/app.ts` — frontend-entry (nog steeds één grote top-level IIFE qua runtime-structuur), leest
  de twee globals hierboven en rendert de site.
- `src/types/browser-data.ts` — gedeelde types plus runtime parsers/type-guards voor die
  ongetypeerde (`unknown`) globals.
- `src/types/window.d.ts` — ambient uitbreiding van `Window` met `TOP_ARTICLES`/
  `TOP_ARTICLE_PRIORITY`.
- `scripts/*.ts` + `scripts/lib/*.ts` — databuild, scoring/reeksen, tag-synchronisatie.
- `test/*.ts` — tests, draaien tegen de gecompileerde output in `dist/test/`.

Alleen `dist/src/app.js` en `dist/src/types/browser-data.js` zijn getrackt in git (`.gitignore`:
`dist/*` genegeerd, behalve `dist/src/` en `dist/src/**`) — nodig omdat GitHub Pages de site direct
serveert zonder deploy-build. De rest van `dist/` (gecompileerde `scripts/`/`test/`) is
build-output en wordt genegeerd.

## Commando's

```bash
npm run build            # compileert TS, haalt later-documenten op via @readwise/cli, schrijft data/data.js + data/score.js
npm run compile           # tsc — compileert src/, scripts/, test/ naar dist/
npm run typecheck         # tsc --noEmit
npm run lint              # eslint .
npm run check             # lint && typecheck && test — belangrijkste verificatiecommando
npm test                  # compileert eerst, draait dan node --test dist/test/*.test.js
npm run compile && node --test dist/test/priority-tag-plan.test.js   # los testbestand draaien

npm run priority:judge -- prepare --all-later  # volledige evidence snapshot voor v8-migratie
npm run priority:judge -- prepare --top100       # read-only evidence snapshot + batches van max. 25
npm run priority:judge -- validate --require-all --require-topic # strikte v8-migratiepoort
npm run priority:judge -- validate --require-top100 # controleert alle actuele top-100-labels
npm run priority:judge -- report                 # vergelijkt semantische ranking met huidige tags
npm run priority:topic-report                   # read-only v7→v8-topic-impactrapport
npm run priority:plan     # compileert eerst; proefrun: berekent benodigde Readwise-tagwijzigingen, schrijft .tmp/readwise/priority-plan.json
npm run priority:apply    # compileert eerst; past een eerder gegenereerd plan toe na expliciete --confirm <plan-hash>
npm run priority:verify   # compileert eerst; controleert of Readwise-tags al matchen met de berekende reeksen (geen wijzigingen)
```

`npm run build` en `priority:*` vereisen een ingelogde `@readwise/cli` (`readwise login`, of in CI
`readwise login-with-token "$READWISE_TOKEN"`).

Site bekijken: `index.html` direct openen in de browser, geen webserver nodig — `dist/src/app.js`
moet dan wel al gecompileerd zijn (`npm run compile`, of al aanwezig via git, zie hierboven).

## Architectuur

### Databuild (`scripts/build-data.ts`)

Haalt alle Reader-documenten in `later` op, en bouwt per document een schoon item (titel, auteur,
samenvatting, leestijd, datums, taal, "waarom lezen"/"beste moment" uit `notes`, tags). Ruwe
`notes`-tekst en volledige taxonomie-tags komen nooit in de output — alleen de twee geparste
notitieregels en een gefilterde interesse-tagset (structuurtags als `lees-0001`/`dutch-0012`,
taaltags en curatietags als `must-read`/`shortlist` worden eruit gefilterd, zie
`ORDINAL_TAG_PATTERN`/`CURATION_TAGS`/`LANGUAGE_TAG_MAP`).

### Scoring & reeksen (`scripts/lib/readwise-priority-v8.ts`)

- De huidige scorelogica is model `readwise-priority-v8`: de algemene score wordt rechtstreeks
  berekend, terwijl topicreeksen (`scrum`, `software-development`,
  `front-end-development`, `social-studies`, `adhd`, `philosophy`) een eigen scoreobject krijgen. Daarin vervangt
  topicrelevantie (0–4) de algemene relevantie; de kerninteressebonus blijft behouden. Positie- en
  toplijsttags zijn geen inhoudelijk bewijs; ontbrekende of verouderde judgments vallen terug op een
  expliciet als low-confidence gemarkeerde deterministische fallback.
- Voorkeursauteurs Henrik Karlsson en Eleanor Konik geven 50 bonuspunten; anders geldt
  `must-read` (+30) of `shortlist`/`short-list` (+20), zonder onderlinge stapeling.
  `want-to-read` geeft daarbovenop 50 punten in globale en topicreeksscores. Deze signalen
  tellen niet als inhoudelijk bewijs. Triage-aanbevelingen, highlight-aantallen,
  gegenereerde provenance en huidige posities geven geen scorebonus. De evidence-laag dedupliceert highlighttekst en houdt ruwe highlights buiten config
  en browserdata.
- De v8-bestandslaag voegt toe: handmatige correcties uit
  `config/readwise-priority-overrides.json` (`{ version: 1, items: { "<doc-id>": { adjustment, reason } } }`,
  reden verplicht bij niet-nul adjustment), tier-indeling (hoog ≥70, midden ≥40, laag <40), en
  `sequencesForDocument` — bepaalt in welke van de `SEQUENCE_ORDER`-reeksen (video, boek, pdf,
  lees, dutch, short, short-dutch, luchtig, luchtig-nederlands, scrum, software-development,
  front-end-development, social-studies, adhd, philosophy) een document hoort.
  De `scrum`-reeks is, net als `luchtig`, topic-gebaseerd: een document met de tag `scrum` of
  `agile` hoort erin (boeken uitgezonderd); de sterke Agile-taxonomie bevat daarnaast `team coaching`,
  `facilitation`, `flow & delivery` en `psm-ii`. Brede tags als `team dynamics` geven hoogstens een
  lichte relevance-bijdrage en creëren geen Agile-membership. De overige topicreeksen gebruiken hun
  eigen membership-tags. De `adhd`-reeks is topic-gebaseerd op de canonieke tag
  `adhd & neurodivergence` (een losse `adhd`-tag wordt eerst genormaliseerd), eveneens met boeken
  uitgezonderd.
  **Boeken/EPUB's horen strikt alleen in de `boek`-reeks**, nooit gecombineerd met andere reeksen
  — dit wordt hard afgedwongen in `validatePriorityExport`.
- De v8-module bereidt judgments en kerninteressebewijs voor, bepaalt gewichten, berekent
  globale/topicscores en rangschikt de definitieve reeksscores. Zij gebruikt geen historische
  prioriteitsmodellen. `priority-document.ts` bezit gedeelde documentkennis en types;
  `priority-membership.ts` bezit reeksindeling en actuele posities uit tags. Historische modules
  blijven beschikbaar voor de v6→v8- en v7→v8-vergelijkingsrapporten.
- `buildPriorityExport` valideert rechtstreeks de v8-structuur en invarianten, waaronder
  componentrekenen, tiers, books-only en doorlopende posities. Daarnaast vergelijkt de validator
  met een herberekening vanuit meegeleverde brondocumenten. Deze herberekening gebruikt dezelfde
  rekenregels en controleert bronconsistentie; vaste gedragstests controleren het scorebeleid.
  Een lege bronnenarray slaat de bronvergelijking over.

### Uniforme lijsten (`scripts/lib/unified-lists.ts`)

`FAMILY_DEFINITIONS` koppelt elke reeks aan een "familie" (Algemeen, Nederlands, Kort, Kort & NL,
Luchtig, Luchtig & NL, Agile, Software development, Front-end development, Sociale studies & samenwerking,
ADHD, Boeken, PDF's, Video's) met bijbehorende Readwise-toplijsttags (`aaa-top-10`/`aaa-top-100` etc.).
`buildUnifiedLists` sorteert elke familie op de eigen reeks-score (bij
gelijkspel: oudste `saved_at`, dan document-ID) en berekent drie afgeleide ontdeklijsten over
niet-boeken: Consensus (≥2 familie-top-100-lidmaatschappen), Nieuw (saved_at binnen 90 dagen),
Tijdloos (published_date ouder dan 3 jaar) — elk gelimiteerd tot 25 items.

### Tag-synchronisatie (`scripts/priority-cli.ts` + `scripts/lib/priority-tag-plan.ts`)

Aparte, expliciete flow om Readwise-tags te laten matchen met de berekende reeksen/toplijsten —
**de build zelf wijzigt nooit Reader-tags**. Werkwijze: `priority:plan` genereert een plan met een
`planHash`; `priority:apply --plan <bestand> --confirm <planHash>` voert de tag-operaties pas uit
na expliciete hash-bevestiging, herberekent het live-plan vlak voor uitvoering
(`sourceFingerprint`-check om tussentijdse wijzigingen te detecteren), en verifieert na afloop dat
er geen tagoperaties meer resteren. Voortgang wordt weggeschreven naar een journal in
`.tmp/readwise/`.

Uitvoering gebeurt gebundeld (`scripts/lib/priority-batch.ts` + `applyPriorityDocumentUpdates`):
per batch van maximaal 50 documenten één `reader-bulk-edit-document-metadata`-call die de
**volledige** tagset zet — die endpoint vervangt alle tags, dus de eindtagset wordt berekend als
`(huidige tags − verwijderingen) ∪ toevoegingen` uit de tags die de live-fetch net ophaalde.
Documenten die de bulkroute afkeurt (`success: false`), documenten zonder bekende tagset, en de
hele run zodra de bulk-endpoint blijft falen, vallen terug op losse
`reader-add-tags-to-document`/`reader-remove-tags-from-document`-calls per document (tags
gebundeld via een comma-gescheiden `--tag-names`). Het journal blijft op operatieniveau, zodat
oudere journals gewoon hervat kunnen worden.

### Frontend (`src/app.ts`, `index.html`, `styles.css`)

`src/app.ts` is qua runtime-structuur nog steeds één grote top-level IIFE zonder framework, nu als
strict TypeScript, gecompileerd door `tsc` zonder bundler-stap. `index.html` laadt eerst
`data/score.js` en `data/data.js` (de gegenereerde globals), en pas daarna `dist/src/app.js` als
`<script type="module">`. `app.ts` valideert die twee ongetypeerde globals bij het laden via de
parsers/type-guards in `src/types/browser-data.ts` (`parseTopArticles`/`parseTopArticlePriority`,
met een modelversie-check op `readwise-priority-v8`/scope `later`), en rendert daarna families,
catalogus, ontdeklijsten en filters/sortering direct in de DOM. Filterstatus wordt gepersisteerd
als URL-queryparams (niet gewist bij navigatie). `styles.css` staat hier los van en heeft geen
relatie met de TS-compilatie.

## Leesfeedback

Bij "verwerk mijn leesfeedback" of een verzoek om Reader-feedback te beoordelen: volg
`README.md` → "Leesfeedback". `priority:judge prepare-feedback` haalt de laatste alinea
`Feedback: <natuurlijke taal>` op uit `later` én `archive`; de snapshot blijft in `.tmp/readwise/`.
Lees `config/readwise-reading-preferences.md` bij elke semantische beoordeling. Bespreek
wijzigingsvoorstellen vóór toepassing; ruwe feedback hoort alleen in Reader en lokale evidence.
Feedbacktekst staat apart van inhoudelijke fingerprints en fallback-scoring.

## Data-integriteit

- `config/readwise-priority-overrides.json` is de enige plek voor expliciete numerieke
  scorecorrecties — wijzigingen hier gelden in alle lijsten tegelijk (algemene score, niet per
  familie). De handmatige `want-to-read`-tag voegt daar los een vaste bonus van 50 punten aan toe.
- Nederlandse taalherkenning bepaalt de Dutch-reeksen en geeft Nederlandstalige documenten vijf
  scorepunten.
- `data/data.js` en `data/score.js` worden zowel lokaal (`npm run build`) als dagelijks via
  `.github/workflows/refresh.yml` gegenereerd en direct gecommit — verwacht regelmatig
  "chore: ververs Readwise-data"-commits in de geschiedenis die geen inhoudelijke code wijzigen.
- Test `test/generated-priority.test.ts` controleert dat de huidige `data/data.js` en
  `data/score.js` intern consistent zijn (zelfde `generatedAt`, dezelfde documentset, geldige
  sortering) — deze faalt als de twee bestanden los van elkaar zijn bewerkt.
