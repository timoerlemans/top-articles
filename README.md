# Top Articles

Statisch overzicht van persoonlijke Readwise-toplijsten, met directe links naar Readwise Reader.
Naast de bestaande families Algemeen, Nederlands, Kort, Kort & NL, Luchtig, Luchtig & NL en
Boeken bevat de app een actieve catalogus en scoregestuurde ontdeklijsten.

Geen framework of bundler: `index.html` + `styles.css` + `app.js` renderen uit `data/data.js`, een
gegenereerd bestand dat wordt gecommit. `data/data.js` bevat toplijsten, een catalogus van alle
actieve Reader-documenten (`new` en `later`) en de afgeleide lijsten Consensus, Nieuw en
Tijdloos. Het bevat geen ruwe `notes`: alleen titel, auteur, samenvatting, leestijd,
publicatie-/toevoegdatum, taal (afgeleid uit een kleine vaste set taal-tags), een korte
"waarom lezen"/"beste moment"-notitie, afbeelding en links.

`data/score.js` is bewust **niet gegenereerd**. Daar staan de standaardgewichten en optionele
correcties per document-ID en lijst. Een correctie is lijstspecifiek, bijvoorbeeld:

```js
overrides: {
  "document-id": {
    "algemeen:top-100": { adjustment: 15 },
    consensus: { adjustment: 20 },
    nieuw: { exclude: true },
  },
}
```

De app hersorteert bestaande lijsten op score, maar toont altijd de oorspronkelijke
Readwise-positie. Scoring wijzigt nooit Reader-tags, ordinale posities of andere Reader-metadata.

## Lokaal verversen

Vereist een ingelogde [`@readwise/cli`](https://www.npmjs.com/package/@readwise/cli)
(`readwise login`).

```bash
npm run build   # haalt toplijsten + actieve catalogus op en schrijft data/data.js
npm test        # controleert scorelogica en gegenereerde datastructuur
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
