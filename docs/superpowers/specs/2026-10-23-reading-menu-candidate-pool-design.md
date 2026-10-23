# Leesmenu: bredere kandidaatpool

## Intentie

Een situatie als “in bad” of “tijdens het werk” mag niet suggereren dat er maar één geschikt artikel bestaat. De bestaande, begeleide leesgangen blijven behouden; daaronder worden de overige passende kandidaten zichtbaar gemaakt.

## Doelen

- De gegenereerde Reader-data verversen.
- Eén deterministische kandidaatselectie delen tussen de leesgangen en de aanvullende lijst.
- De bestaande planning, budgetten, leesgeschiedenis en Reader-links behouden.
- Aanvullende kandidaten passief tonen, zonder automatisch lezen of verplaatsen te markeren.
- Een expliciete lege toestand behouden wanneer er echt geen kandidaat is.

## Buiten scope

- De betekenis van leesprofielen of situaties versoepelen.
- De regels voor de begeleide gangen veranderen.
- Live AI-selectie of handmatige wijzigingen aan gegenereerde data.

## Ontwerpbeslissingen

1. Voeg een pure `rankMenuCandidates`-functie toe die de bestaande filters toepast en een stabiel gerangschikte kandidaatpool retourneert.
2. Laat `planMenu` die pool gebruiken en behoud het bestaande `MenuProposal`-contract en de gangregels.
3. Toon kandidaten die niet al in een gang staan onder “Meer passende artikelen”; alleen actuele, volledig geprofileerde kandidaten komen daarin. De aanvullende pool staat per profiel-as maximaal één niveau ruimer dan de begeleide gang, maar behoudt inhoudelijke situatie-eisen, leestijd en boekuitsluiting.
4. Gebruik voor aanvullende kandidaten alleen gewone Reader-links; ze veranderen geen leesstatus.
5. Voltooi en valideer de profielreview voor alle relevante Later-documenten voordat de dataset als oplossing wordt gepubliceerd.
6. Voer `npm run build` uit zodat Reader-data en menu-profielen actueel zijn.

## Verificatie

- Pure tests bewijzen dat de kandidaatpool alle passende documenten bevat terwijl de gangen hun compacte selectie behouden.
- View-tests bewijzen dat aanvullende kandidaten zichtbaar zijn en geen leesstatus wijzigen.
- Compile, lint, typecheck en de gegenereerde-data-controle draaien na de build.
