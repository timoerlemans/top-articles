# PWA-offlinemodus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maak Top Articles installeerbaar en bruikbaar met de laatst werkende lijstgegevens zonder internetverbinding.

**Architecture:** Een root-level service worker beheert een versiegebonden precache van de lokale app-shell en ververst die parallel met online requests. Een webmanifest en rastericonen bieden installatie. Externe thumbnails krijgen een aparte, begrensde runtime-cache; registratie gebeurt alleen in veilige HTTP(S)-contexten.

**Tech Stack:** Statische HTML/CSS/JavaScript, strict TypeScript, Node test runner, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-24-pwa-offline-design.md`

## Global Constraints

- Cache precies `index.html`, `styles.css`, `favicon.svg`, beide PWA-iconen, `data/data.js`, `data/score.js`, `dist/src/app.js` en `dist/src/types/browser-data.js`.
- Cache-first levert de oude complete versie direct; netwerk ververst alleen achter de schermen.
- Installatie is atomair en `skipWaiting` blijft afwezig.
- Alleen GET-requests worden onderschept; externe thumbnails zijn afzonderlijk en begrensd gecachet.
- Lokaal openen van `index.html` geeft geen service-workerregistratie.

---

### Task 1: Installeerbare metadata en assets

**Files:**
- Create: `manifest.webmanifest`, `icons/icon-192.png`, `icons/icon-512.png`
- Modify: `index.html:3-12`
- Test: `test/pwa.test.ts`

**Produces:** Manifest met `name: "Top Articles"`, `display: "standalone"`, `start_url: "."`, Nederlandse taal, kleuren en twee lokale PNG-iconen.

- [ ] Schrijf een test die manifestvelden, iconpaden en HTML-koppelingen leest.
- [ ] Draai `npm run compile && node --test dist/test/pwa.test.js`; de test moet falen omdat manifest/icoonpaden ontbreken.
- [ ] Voeg manifest, twee geldige PNG-iconen, `theme-color`, manifest-link en Apple-touch-iconlink toe.
- [ ] Draai dezelfde test en controleer dat die slaagt.
- [ ] Commit met `git add index.html manifest.webmanifest icons test/pwa.test.ts && git commit -m "feat: add PWA manifest and icons"`.

### Task 2: Offline shell en afbeeldingscache

**Files:**
- Create: `service-worker.js`
- Modify: `test/pwa.test.ts`

**Produces:** Een worker met `APP_SHELL_CACHE`, `IMAGE_CACHE`, `APP_SHELL_URLS`, atomair `cache.addAll`, cleanup van uitsluitend eigen oude caches en cache-first background revalidation.

- [ ] Schrijf tests die alle vereiste shellpaden, `cache.addAll`, GET-guard, afwezigheid van `skipWaiting`, apart `destination === "image"`-pad en limieten van 60 entries/30 dagen verifiëren.
- [ ] Draai `npm run compile && node --test dist/test/pwa.test.js`; de tests moeten falen omdat de worker ontbreekt.
- [ ] Implementeer de root-level worker met scope-relatieve URLs. Gebruik cache-first met `event.waitUntil` voor online shellrevalidatie. Cache alleen succesvolle externe afbeeldingsresponses en trim de afbeeldingscache op leeftijd en maximaal 60 items.
- [ ] Draai de PWA-test opnieuw en controleer dat die slaagt.
- [ ] Commit met `git add service-worker.js test/pwa.test.ts && git commit -m "feat: cache app shell offline"`.

### Task 3: Veilige registratie en integratieverificatie

**Files:**
- Modify: `src/app.ts:1-16`, `dist/src/app.js`
- Modify: `test/pwa.test.ts`

**Produces:** `registerServiceWorker(): void`, éénmaal tijdens startup aangeroepen. De functie registreert `"service-worker.js"` alleen bij `window.isSecureContext` én wanneer `"serviceWorker" in navigator` waar is; registratiefouten blijven niet-onafgevangen.

- [ ] Schrijf een test die de gecompileerde frontend op dit registratiecontract controleert.
- [ ] Draai `npm run compile && node --test dist/test/pwa.test.js`; de test moet falen omdat registratie afwezig is.
- [ ] Voeg de minimale registratiefunctie vóór de bestaande startup-IIFE toe, compileer en commit de getrackte browseroutput.
- [ ] Draai `npm run check`; lint, typecheck en alle tests moeten slagen.
- [ ] Controleer handmatig via een lokale HTTP-server: laad eenmaal online, schakel netwerk uit en herlaad; installeerbaarheid en list/filters moeten werken.
- [ ] Commit met `git add src/app.ts dist/src/app.js test/pwa.test.ts && git commit -m "feat: register PWA service worker"`.
