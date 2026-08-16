# Responsieve navigatie- en filteruitlijning

## Doel

Lijn navigatie, lijstknoppen, zoeken, sortering en filters consequent uit op desktop en mobiel. Desktop houdt de zichtbare tabnavigatie. Mobiel krijgt een toegankelijk, inline uitklapbaar menu met meerdere uitgelijnde regels.

## Desktop vanaf 641 px

- Alle bovenste interfaceonderdelen gebruiken dezelfde gecentreerde container van maximaal 820 px en dezelfde horizontale padding.
- De tabnavigatie blijft zichtbaar en mag over meerdere regels lopen zonder afwijkende linker- of rechterrand.
- Lijstgrootteknoppen en zoek-/filterbediening sluiten aan op dezelfde contentranden.
- Het zoekveld gebruikt de volledige beschikbare breedte.
- Sortering, Taal, Type, Beste moment en Leestijd staan in één raster van vijf gelijke kolommen. Labels, velden en interactieve hoogtes lijnen onderling uit.
- Interessetags blijven daaronder over de volle rasterbreedte staan.

## Mobiel tot en met 640 px

- De zichtbare desktoptabs worden vervangen door één full-width menuknop met hamburgericoon, actieve sectienaam en chevron.
- De knop beheert `aria-expanded` en verwijst via `aria-controls` naar het menu.
- Het geopende menu staat inline in de documentflow en toont de navigatieopties in twee gelijke kolommen en zoveel regels als nodig.
- De actieve optie blijft zichtbaar gemarkeerd. Een keuze navigeert via dezelfde bestaande state/hashflow en klapt het menu daarna dicht.
- Top 10 en Top 100 blijven twee gelijke knoppen naast elkaar.
- De zoek-/filterknop, het zoekveld en alle dropdowns vullen de beschikbare breedte.
- Sorteerknoppen vormen een uitgelijnd tweekolomsraster en lopen niet als ongelijkmatige chips door.
- Interactieve bediening is minimaal 44 px hoog. Veilige schermranden worden overal via dezelfde padding gerespecteerd.

## Technische begrenzing

- Gebruik de bestaande dynamisch gegenereerde navigatie en hash-URL's; introduceer geen nieuwe routes.
- Gebruik één navigatielijst voor desktop en mobiel om dubbele state of dubbele eventhandlers te vermijden. CSS bepaalt de mobiele presentatie; JavaScript beheert alleen open/dicht, actieve tekst en automatisch sluiten.
- Gebruik gedeelde CSS-variabelen voor contentbreedte en horizontale gutter zodat componenten niet opnieuw uiteenlopen.
- Het menu is geen overlay of drawer en vergrendelt scrollen niet.

## Toegankelijkheid

- De mobiele menuknop heeft een beschrijvende toegankelijke naam, `aria-expanded` en `aria-controls`.
- Het menu sluit met Escape en geeft focus terug aan de menuknop.
- Desktoptabs behouden hun bestaande tabrollen en geselecteerde status.
- Focusindicatoren blijven zichtbaar en bediening werkt met toetsenbord en touch.

## Verificatie

- Een DOM-test controleert mobiele menumarkup en ARIA-contract.
- Een gedragstest controleert open/dicht, sluiten na selectie en Escape.
- Een CSS-contracttest controleert gedeelde containerwaarden, het vijfkoloms desktopfilterraster, het mobiele tweekolomsmenu en full-width mobiele velden.
- De volledige bestaande testset moet groen blijven.
- Handmatige controle gebeurt minimaal op 390 px, 640 px, 820 px en een bredere desktopviewport.
