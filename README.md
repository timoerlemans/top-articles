# Top Articles

Statisch overzicht van persoonlijke Readwise-toplijsten, met directe links naar Readwise Reader.
Naast de bestaande families Algemeen, Nederlands, Kort, Kort & NL, Luchtig, Luchtig & NL en
Boeken bevat de app een actieve catalogus, scoregestuurde ontdeklijsten en een zelfstandige
berekende leesvolgorde voor documenten in Reader `later`.

De broncode is strict TypeScript. `tsc` schrijft de browsermodules naar
`dist/src/`; `index.html` + `styles.css` laden die uitvoer en renderen uit `data/data.js`, een
gegenereerd bestand dat wordt gecommit. `data/data.js` bevat toplijsten, een catalogus van alle
actieve Reader-documenten in `later` en de afgeleide lijsten Consensus, Nieuw en
Tijdloos. Het bevat geen ruwe `notes`: alleen titel, auteur, samenvatting, leestijd,
publicatie-/toevoegdatum, taal (afgeleid uit een kleine vaste set taal-tags), een korte
"waarom lezen"/"beste moment"-notitie, afbeelding en links.

`data/score.js` wordt tegelijk gegenereerd en bevat `readwise-priority-v3` voor alle actuele
`later`-documenten. Per document staan daarin de basis- en eindscore van 0–100, tier, zes
scorecomponenten, een eventuele handmatige correctie, mensleesbare redenen, reeksindeling en
gewenste plus actuele positie per reeks. Alle lijsten sorteren op hoogste eindscore, daarna bij
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

De onderwerpreeksen Software development en Front-end development hebben elk eigen top-10- en
top-100-lijsten en genummerde tags (`software-development-001` en `front-end-development-001`).
Software development herkent `software development`, `software-development` en `programming & software`.
Front-end development herkent `front-end development`, `frontend development`, `front end development`
en `front-end-development`. Een document met tags voor beide onderwerpen komt in beide reeksen;
boeken blijven uitsluitend in de boekenreeks.

De build wijzigt nooit Reader-tags. Nederlandse taalherkenning bepaalt alleen de afzonderlijke
Dutch-reeksen en levert geen scorepunten op. Tagwijzigingen verlopen uitsluitend via een aparte
proefrun en synchronisatie na expliciete bevestiging.

## Lokaal verversen

Vereist een ingelogde [`@readwise/cli`](https://www.npmjs.com/package/@readwise/cli)
(`readwise login`).

```bash
npm run build   # haalt actuele later-data op en schrijft data/data.js + data/score.js
npm run check   # lint, strict typecheck en tests
```

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
