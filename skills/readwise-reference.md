# Readwise operationele referentie

Deze referentie is de gemeenschappelijke ingang voor de beheerde Readwise-skills. De repositorycode blijft de bron van waarheid; deze pagina beschrijft waar een skill moet kijken en welke veiligheidsgrenzen niet mogen divergeren.

## Canonieke bronnen

- Domeintermen: [`CONTEXT.md`](../CONTEXT.md) en [`AGENTS.md`](../AGENTS.md).
- Publieke site, leesfeedback en operationele flows: [`README.md`](../README.md).
- Taxonomie, aliasnormalisatie en systeemtags: [`scripts/lib/readwise-tags.ts`](../scripts/lib/readwise-tags.ts).
- Reeksen en leden: [`scripts/lib/priority-sequences.ts`](../scripts/lib/priority-sequences.ts), [`scripts/lib/priority-membership.ts`](../scripts/lib/priority-membership.ts) en `SEQUENCE_ORDER`.
- Familie/toplijstcontracten: [`scripts/lib/unified-lists.ts`](../scripts/lib/unified-lists.ts) en `FAMILY_DEFINITIONS`.
- Actuele scoreberekening: [`scripts/lib/readwise-priority-v8.ts`](../scripts/lib/readwise-priority-v8.ts), model `readwise-priority-v8`.
- Judgments en leesprofielen: [`scripts/lib/priority-judge.ts`](../scripts/lib/priority-judge.ts), [`config/readwise-priority-judgments.json`](../config/readwise-priority-judgments.json), [`config/readwise-reading-profiles.json`](../config/readwise-reading-profiles.json) en de voorkeuren in [`config/readwise-reading-preferences.md`](../config/readwise-reading-preferences.md).
- Reader-tagplanning en veilige uitvoering: [`scripts/lib/priority-tag-plan.ts`](../scripts/lib/priority-tag-plan.ts), [`scripts/lib/priority-sync.ts`](../scripts/lib/priority-sync.ts), [`scripts/lib/priority-batch.ts`](../scripts/lib/priority-batch.ts) en de archiveplannen.

Lees de relevante bron vóór een inhoudelijke beoordeling. Kopieer scoregewichten, reeksregels, voorkeuren of schemas niet naar een skill: verwijs hiernaar en gebruik de bestaande CLI.

## Reader-API en commandodiscovery

Controleer beschikbare Reader-tools eerst met het aangetoonde MCP-toolaanbod. Als dat ontbreekt, controleer de geïnstalleerde CLI met:

```bash
readwise --help
readwise reader-list-documents --help
readwise reader-bulk-edit-document-metadata --help
```

Gebruik alleen commando's die door `readwise --help` of deze repository zijn bevestigd. Verzin geen Reader-opties, veldnamen of endpointsemantiek. De volledige lijst met door de checker herkende commando's staat in `scripts/lib/skill-check.ts`.

## Tagcontract

Een inhoudelijke taggingrun normaliseert bekende aliases via `readwise-tags.ts` en vervangt alleen inhoudstags. Administratieve tags, curatoriale tags, taal-tags, workflowtags en positie-/toplijsttags blijven behouden. De grens van maximaal drie geldt uitsluitend voor nieuwe inhoudstags. Bereken bij een bulkmetadata-update de volledige actuele tagset uit de live response; wanneer de tagset ontbreekt, `null`, primitief of deels onleesbaar is, mag geen volledige vervanging plaatsvinden. Gebruik dan afzonderlijke bekende add/remove-operaties en behoud onbekende tags.

`must-read`, `shortlist` en `want-to-read` zijn geen inhoudelijke evidence. `want-to-read` is wel een expliciete prioriteitsbonus en bescherming tegen afvloeiing uit Later. Boeken horen alleen in de boekreeks. Voor actuele prioriteit gebruikt een skill uitsluitend de v8-motor; historische modules zijn alleen voor historische rapporten.

## Bron, evidence en feedback

Een samenvatting, highlightselectie of triagebesluit is gebaseerd op de volledige beschikbare bron. Herlees gericht wanneer bewijs of onzekerheid dat vraagt; een vast aantal passes is geen kwaliteitsbewijs. Dedupliceer highlights tegen bestaande Reader-highlights en de runregistratie, schrijf exacte bronpassages en maak fouten zichtbaar/resumable. Houd persoonlijke notities en de laatste `Feedback:`-alinea intact; ruwe feedback en ruwe highlights blijven privé in Reader of `.tmp/readwise/`.

Nieuwe links krijgen dezelfde toelatingspoort: controleer de doelpagina zelf op taal, zelfstandige leesbaarheid en expliciete kerninteresse-aansluiting. Dedupliceer tegen Reader, Feed en de huidige run vóór het aanmaken.

## Verificatie

`npm run skills:check` is read-only en controleert metadata, resources, bekende commando's en canonieke contracten. De optionele installatievergelijking (`--compare-installed`) hoort niet bij `npm run check`, omdat die machineafhankelijk is. Scenario's voor dry-run, no-op, conflicten, eerste installatie, tagbehoud en hervatting staan in de tests; tekstcontrole alleen bewijst niet alle semantische runtime-eigenschappen.
