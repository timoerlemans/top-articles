# Uniform Readwise-prioriteitssysteem

## Doel

Gebruik `readwise-priority-v3` als enige rangscore voor alle app-lijsten en alle beheerde Readwise-reekstags. Alleen Reader `later` wordt gescoord. De build schrijft nooit naar Reader; tagwijzigingen verlopen via een gehashte proefrun en expliciet goedgekeurde synchronisatie.

## Volgorde en correcties

Sorteer overal op eindscore aflopend, daarna `saved_at` oplopend en ten slotte document-ID. Tiers zijn informatieve labels. De zes bestaande scorecomponenten vormen de basisscore. Een getrackte, gehele handmatige correctie met verplichte reden levert de eindscore binnen 0–100 en geldt in alle lijsten.

## Reeksen en lijsten

Beheer `lees`, `video`, `boek`, `dutch`, `short`, `short-dutch`, `luchtig` en `luchtig-nederlands`. Gebruik Readwise `language` als die beschikbaar is en expliciete taaltags als fallback; voer geen tekstheuristiek uit. `light-reading` is het inhoudelijke lidmaatschap voor de luchtig-reeksen.

Top 10 en Top 100 zijn slices van de bijbehorende scorevolgorde. Consensus bevat documenten uit minstens twee familie-top-100's, Nieuw bevat `later`-documenten van maximaal 90 dagen oud en Tijdloos bevat `later`-documenten die minstens drie kalenderjaren geleden zijn gepubliceerd.

## Veiligheid

Een tagplan bevat een bronfingerprint en planhash. Toepassen vereist de exacte hash en een verse broncontrole. Alleen beheerde ordinale tags, afgeleide toplijsttags en expliciete `light-reading`-migraties mogen veranderen. Na toepassing moet een nieuwe live-opvraag nul resterende operaties opleveren.
