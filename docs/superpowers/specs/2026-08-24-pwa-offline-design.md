# PWA met betrouwbare offlinemodus

## Doel

Maak de statische Top Articles-site installeerbaar als PWA. Na één succesvol online bezoek moet de laatst volledig werkende versie — inclusief de gegenereerde Readwise-lijsten — zonder netwerkverbinding openen en bruikbaar blijven. Wanneer internet beschikbaar is, wordt een nieuwe versie op de achtergrond voorbereid voor een volgend bezoek.

## Scope

- Voeg een web-appmanifest toe, gekoppeld vanuit `index.html`, met Nederlandse naamgeving, kleuren en vaste rastericonen voor installatie op mobiel en desktop.
- Voeg één root-level service worker toe. Dit pad geeft de worker controle over alle publieke sitebestanden op GitHub Pages.
- Registreer de worker vanuit `src/app.ts` alleen in een veilige HTTP(S)-context. Een lokaal geopende `index.html` blijft dus functioneren zonder registratie- of consolefout.
- Cache de app-shell: `index.html`, `styles.css`, `favicon.svg`, PWA-iconen, `data/data.js`, `data/score.js`, `dist/src/app.js` en `dist/src/types/browser-data.js`.
- Gebruik voor app-shellbestanden cache-first: de volledige eerdere versie opent direct offline. Start bij online gebruik tegelijk een netwerkverversing; een gewijzigde worker gaat pas actief worden wanneer de huidige pagina niet meer door de vorige worker wordt bestuurd. Daardoor is er geen gemengde versie van HTML, frontend en gegenereerde data.
- Cache externe artikelafbeeldingen best-effort in een aparte runtime-cache. Een fout, een CORS-opaque respons of een gemiste afbeelding heeft geen effect op de tekst, filters of lijsten. De cache heeft een begrensde grootte en leeftijd.

## Update- en foutgedrag

- Elke service-workerrevisie gebruikt een nieuwe naam voor de app-shellcache. Bij activering verwijdert de worker uitsluitend zijn verouderde eigen caches; andere origin-caches blijven ongemoeid.
- Installatie faalt atomair wanneer een essentieel lokaal app-shellbestand niet kan worden gecachet: geen deels offline werkende release activeren.
- Navigatieverzoeken gebruiken eerst de gecachte app-shell en vallen online terug op het netwerk. Dat houdt GitHub Pages-fout- en offlinegedrag voorspelbaar.
- Niet-GET-verzoeken worden niet onderschept. Externe navigatie, zoals links naar Readwise, blijft normaal door de browser afgehandeld.

## Bestanden en verantwoordelijkheden

| Bestand | Verantwoordelijkheid |
| --- | --- |
| `index.html` | Manifest koppelen, thema-kleur metadata, iOS-icoonreferentie. |
| `manifest.webmanifest` | Installeerbare app-identiteit, start-URL, standalone-weergave en iconen. |
| `icons/*.png` | Rasterinstallatie-iconen op minimaal 192 en 512 px. |
| `service-worker.js` | Precache, achtergrondverversing, lifecycle en begrensde afbeeldingsruntime-cache. |
| `src/app.ts` | Veilige registratie van de service worker. |
| `test/pwa.test.ts` | Contracttests voor manifest, service-workerstrategie en registratie. |

## Niet in scope

- Geen offline mutaties of synchronisatie met Readwise; de app is uitsluitend een gecachte leesweergave.
- Geen verplichting om elke externe thumbnail offline beschikbaar te maken.
- Geen eigen updatebanner of knop: de stille update wordt beschikbaar bij een volgend bezoek.

## Verificatie

- Tests verifiëren dat het manifest alle installatievelden en lokale iconen bevat.
- Tests verifiëren dat de service worker alle essentiële lokale bestanden precachet, versiegebonden cache-opruiming heeft en afbeeldingen apart begrenst cachet.
- Tests verifiëren dat registratie alleen in een veilige context plaatsvindt.
- `npm run check` blijft groen.
- Handmatig: laad de site eenmaal online via een HTTP-server, schakel netwerk uit en herlaad; de lijsten, filters en bestaande app-shell blijven werken. Controleer tevens installatie via browsermenu en dat een vernieuwde release bij het volgende bezoek zichtbaar is.
