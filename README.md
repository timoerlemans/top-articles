# Top Articles

Statisch overzicht van mijn persoonlijke Readwise-toplijsten (`aaa-top-10`, `aaa-top-100`,
`aaa-dutch-top-10`, `aaa-dutch-top-100`, `aaa-short-top-10`, `aaa-short-top-100`,
`aaa-short-dutch-top-10`, `aaa-short-dutch-top-100`), met directe links naar Readwise Reader.

Geen framework of bundler: `index.html` + `styles.css` + `app.js` renderen uit `data.js`, een
gegenereerd bestand dat wordt gecommit. `data.js` bevat bewust geen `notes` of taxonomie-tags —
alleen titel, auteur, samenvatting, leestijd, publicatiedatum, afbeelding en links.

## Lokaal verversen

Vereist een ingelogde [`@readwise/cli`](https://www.npmjs.com/package/@readwise/cli)
(`readwise login`).

```bash
npm run build   # haalt de acht toplijsten op en schrijft data.js
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
