# Uitvoeringsplan: bredere kandidaatpool in het leesmenu

## Stap 1: gedeelde kandidaatpool

- Voeg `rankMenuCandidates` toe in `src/reading-menu.ts`.
- Refactor `planMenu` zodat het dezelfde pool gebruikt.
- Voeg een test toe in `test/reading-menu.test.ts` waarin meerdere geldige “tijdens het werk”-kandidaten beschikbaar zijn, terwijl de gangen compact blijven.
- Draai de gerichte test rood, implementeer de functie, draai hem groen.

## Stap 2: aanvullende kandidaten in de UI

- Gebruik de kandidaatpool in `src/reading-menu-view.ts`.
- Render voorstellen die niet in een gang staan onder “Meer passende artikelen”; gebruik alleen volledig geprofileerde near-matches met dezelfde inhoudelijke situatie-eisen.
- Houd de links passief en voeg minimale styling toe in `styles.css`.
- Voeg een view-test toe voor zichtbaarheid en het ontbreken van leesstatusmutaties.

## Stap 3: actuele data en verificatie

- Draai `npm run build` met de ingelogde Readwise CLI.
- Controleer alle tien situaties en reproduceer dat aanvullende kandidaten alleen uit actuele profielen komen.
- Draai compile, gerichte tests, lint, typecheck en de gegenereerde-data-test.

## Afronding

- Inspecteer de diff en rapporteer gewijzigde bestanden, testresultaten en eventuele bestaande worktree-wijzigingen.
