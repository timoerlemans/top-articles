# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Scoring & reeksen (`scripts/lib/readwise-priority-v2.ts` + `-v3.ts`)

- v2 bevat de basisscorelogica (`scorePriorityDocument`, zes componenten, Nederlands-detectie).
- v3 wrapt v2 en voegt toe: handmatige correcties uit
  `config/readwise-priority-overrides.json` (`{ version: 1, items: { "<doc-id>": { adjustment, reason } } }`,
  reden verplicht bij niet-nul adjustment), tier-indeling (hoog ≥70, midden ≥40, laag <40), en
  `sequencesForDocument` — bepaalt in welke van de `SEQUENCE_ORDER`-reeksen (video, boek, pdf,
  lees, dutch, short, short-dutch, luchtig, luchtig-nederlands, scrum) een document hoort.
  De `scrum`-reeks is, net als `luchtig`, topic-gebaseerd: een document met de tag `scrum` of
  `agile` hoort erin (boeken uitgezonderd).
  **Boeken/EPUB's horen strikt alleen in de `boek`-reeks**, nooit gecombineerd met andere reeksen
  — dit wordt hard afgedwongen in `validatePriorityExport`.
- `buildPriorityExport` berekent per document score + reeksen + positie-per-reeks, en valideert
  zichzelf tegen een onafhankelijk herberekende `buildExpected` (dus scorelogica wijzigen zonder de
  validatie mee te laten lopen, faalt de eigen output-check).

### Uniforme lijsten (`scripts/lib/unified-lists.ts`)

`FAMILY_DEFINITIONS` koppelt elke reeks aan een "familie" (Algemeen, Nederlands, Kort, Kort & NL,
Luchtig, Luchtig & NL, Boeken, PDF's, Video's) met bijbehorende Readwise-toplijsttags
(`aaa-top-10`/`aaa-top-100` etc.). `buildUnifiedLists` sorteert elke familie op score (bij
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

### Frontend (`src/app.ts`, `index.html`, `styles.css`)

`src/app.ts` is qua runtime-structuur nog steeds één grote top-level IIFE zonder framework, nu als
strict TypeScript, gecompileerd door `tsc` zonder bundler-stap. `index.html` laadt eerst
`data/score.js` en `data/data.js` (de gegenereerde globals), en pas daarna `dist/src/app.js` als
`<script type="module">`. `app.ts` valideert die twee ongetypeerde globals bij het laden via de
parsers/type-guards in `src/types/browser-data.ts` (`parseTopArticles`/`parseTopArticlePriority`,
met een modelversie-check op `readwise-priority-v3`/scope `later`), en rendert daarna families,
catalogus, ontdeklijsten en filters/sortering direct in de DOM. Filterstatus wordt gepersisteerd
als URL-queryparams (niet gewist bij navigatie). `styles.css` staat hier los van en heeft geen
relatie met de TS-compilatie.

## Data-integriteit

- `config/readwise-priority-overrides.json` is de enige plek voor handmatige scorecorrecties —
  wijzigingen hier gelden in alle lijsten tegelijk (algemene score, niet per familie).
- Nederlandse taalherkenning bepaalt alleen de Dutch-reeksen; ze levert geen scorepunten op.
- `data/data.js` en `data/score.js` worden zowel lokaal (`npm run build`) als dagelijks via
  `.github/workflows/refresh.yml` gegenereerd en direct gecommit — verwacht regelmatig
  "chore: ververs Readwise-data"-commits in de geschiedenis die geen inhoudelijke code wijzigen.
- Test `test/generated-priority.test.ts` controleert dat de huidige `data/data.js` en
  `data/score.js` intern consistent zijn (zelfde `generatedAt`, dezelfde documentset, geldige
  sortering) — deze faalt als de twee bestanden los van elkaar zijn bewerkt.
