# Readwise-prioriteitsexport

> Opgevolgd door `2026-08-16-unified-readwise-priority-design.md`. Dit document beschrijft het historische v2-ontwerp.

## Doel

Exporteer de actuele, expliciete Readwise-prioriteitsscore voor alle documenten in `later` naar `data/score.js`, zonder het bestaande app-scoremodel voor Consensus, Nieuw en Tijdloos te wijzigen.

## Datacontract

`data/score.js` wordt een gegenereerd klassiek browserbestand:

```js
window.TOP_ARTICLE_PRIORITY = {
  generatedAt: "<ISO-8601>",
  model: "readwise-priority-v2",
  scope: "later",
  items: {
    "<document-id>": {
      score: 0,
      tier: "laag",
      components: {
        kerninteresse: 0,
        diepgang: 0,
        persoonlijkeBruikbaarheid: 0,
        leeskans: 0,
        duurzameWaarde: 0,
        aftrek: 0
      },
      sequences: ["lees"],
      positions: { lees: 1 },
      rationale: {}
    }
  }
};
```

De score ligt tussen 0 en 100. De tier is `hoog` (70–100), `midden` (40–69) of `laag` (0–39). `positions` zijn de numerieke waarden van de werkelijke viercijferige Readwise-tags. EPUBs krijgen nooit een `lees`-positie.

## Architectuur

- De bestaande handmatige app-scoreconfiguratie verhuist naar een interne buildmodule. Het bestaande scoregedrag in de app blijft onveranderd.
- Een aparte module implementeert het Readwise-prioriteitsmodel v2: kerninteresse, diepgang, persoonlijke bruikbaarheid, leeskans, duurzame waarde en aftrek.
- De build gebruikt de al opgehaalde documenten in `later`, maakt het prioriteitsobject en schrijft naast `data/data.js` ook `data/score.js`.
- `index.html` laadt `data/score.js` vóór de applicatiecode. Er komt nog geen zichtbare UI-wijziging; de app kan `window.TOP_ARTICLE_PRIORITY` direct gebruiken.

## Validatie en tests

- De build faalt bij een score buiten 0–100, een score/tier die niet overeenkomt, dubbele of niet-doorlopende posities, of een EPUB met een `lees`-positie.
- Tests dekken scoregrenzen, tiergrenzen, EPUB-classificatie en het exportschema.
- Verificatie gebeurt met `npm test` en daarna `npm run build`, zodat de export met de actuele `later`-lijst wordt gegenereerd.

## Buiten scope

- Geen wijzigingen aan tags of volgorde in Readwise Reader.
- Geen vervanging van de bestaande Consensus/Nieuw/Tijdloos-score.
- Geen ontwerp of implementatie van een nieuwe interface voor de score.
