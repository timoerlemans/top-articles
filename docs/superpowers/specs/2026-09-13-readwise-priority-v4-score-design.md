# Readwise-prioriteitsscore v4

## Doel

Maak de prioriteitsscore begrijpelijker en beter schaalbaar door het aantal expliciete
kerninteresses lineair te waarderen. Een document met vijf kerninteresses krijgt daarmee
100 kerninteressepunten. De score wordt niet langer afgekapt op 100, zodat aanvullende
signalen zichtbaar waarde kunnen toevoegen.

## Beslissingen

- Kerninteresses zijn uitsluitend de expliciete, canonieke Readwise-tags die ook als
  `coreInterests` in de catalogus worden getoond. Titel, samenvatting en notities kunnen geen
  extra kerninteresse opleveren.
- Elke kerninteresse is 20 punten: `kerninteresse = aantal × 20`. De component heeft geen
  bovengrens; als de taxonomie later meer dan vijf kerninteresses oplevert, blijft de score
  lineair doorlopen.
- De bestaande aanvullende componenten blijven behouden: diepgang, persoonlijke bruikbaarheid,
  leeskans, onderscheidende duurzame waarde, Nederlandse taal, curatie en aftrek.
- De bestaande curatiewaarden blijven gelden: `shortlist` is +10 en `must-read` is +20. Bij
  beide tags telt alleen `must-read`.
- De basisscore en eindscore hebben geen bovengrens. De ondergrens blijft 0, zodat een document
  geen negatieve leesprioriteit krijgt. Handmatige correcties blijven gehele getallen met een
  verplichte reden bij een niet-nulcorrectie.
- Tiers blijven informatieve labels met dezelfde grenzen: laag <40, midden 40–69, hoog ≥70.
  De hoge tier heeft dus geen bovengrens.
- De model-id wordt `readwise-priority-v4`. Oude v3-browserdata wordt niet als v4-data
  geaccepteerd.

## Architectuur en datastroom

De externe interface blijft `scorePriorityDocument`: één Reader-document plus een optionele
handmatige correctie levert score, tier, componenten en rationale. De scoremodule berekent
kerninteresses via dezelfde tag-gebaseerde canonicalisatie als de catalogus. De v3-wrapper wordt
v4-logica: hij voegt correcties toe, bepaalt tiers en bouwt de reeksen en posities zoals voorheen.

`buildPriorityExport` blijft de enige maker van `data/score.js` en valideert de export tegen een
onafhankelijk opnieuw berekende verwachting. De bestaande uniforme lijsten blijven alleen de
score gebruiken voor hun sortering; door de nieuwe schaal veranderen hun posities automatisch.
De gegenereerde `data/data.js`, `data/score.js` en getrackte frontend-build worden opnieuw
gemaakt via `npm run build`.

## Contractwijzigingen

- `PriorityComponents` en het browsercontract krijgen de lineaire `kerninteresse`-semantiek.
- `baseScore` en `score` blijven gehele, eindige, niet-negatieve getallen maar mogen groter dan
  100 zijn.
- Validatie controleert de ondergrens, tier en de optelling met de handmatige correctie, zonder
  een bovengrenscontrole.
- Frontendteksten beschrijven een onbegrensde score en tonen niet langer `score/100`.

## Teststrategie

- Test expliciet 0, 1, 2, 3, 4 en 5 kerninteresses op respectievelijk 0, 20, 40, 60, 80 en
  100 punten.
- Test dat alleen expliciete tags meetellen en tekstsignalen geen kerninteresse toevoegen.
- Test dat scores boven 100 behouden blijven en dat een negatieve handmatige correctie niet onder
  0 uitkomt.
- Test tiergrenzen met scores boven 100 en de nieuwe v4-modelvalidatie.
- Test dat bestaande aanvullende componenten, curatie, sortering, reeksen en gegenereerde
  data-invarianties blijven werken.
- Voer `npm run check` en daarna `npm run build` uit; de gegenereerde bestanden moeten dezelfde
  `generatedAt` en documentset hebben.

## Buiten scope

- Geen wijziging van de taxonomie zelf of van Readwise-tags tijdens de build.
- Geen aparte score per familie of reeks.
- Geen lexicografische rangschikking waarbij het aantal kerninteresses alle andere signalen
  volledig overschrijft.
