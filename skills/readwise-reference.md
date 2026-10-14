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

`must-read`, `shortlist` en `want-to-read` zijn geen inhoudelijke evidence. `want-to-read` is wel een expliciete prioriteitsbonus en bescherming tegen afvloeiing uit Later. De enige automatische voorkeursauteurs zijn Eleanor Konik en Henrik Karlsson, herkend uitsluitend uit betrouwbare `author`-metadata na Unicode-/spatie-normalisatie; een titelvermelding telt niet. `priority:plan` plant voor zulke Later-documenten idempotent de toevoeging van `want-to-read` vóór de ranking en afvloeiing. De score kent geen aparte auteursbonus: alleen de tag geeft +50. Boeken horen alleen in de boekreeks. Voor actuele prioriteit gebruikt een skill uitsluitend de v8-motor; historische modules zijn alleen voor historische rapporten.

## Lokale onderhoudsroute

De canonicale lokale route is `npm run readwise:priority-sync`. Een read-only `plan`/`inspect`
maakt één onderhoudsmanifest; `apply` voert alleen stappen uit met de exacte bevestiging
`<stage>=<planHash>` en schrijft per stap een rapport; `verify` doet een nieuwe live controle.
De vaste volgorde is `authors -> priority -> archive -> cleanup -> build`. Na iedere geslaagde
Reader-mutatie worden de volgende stappen opnieuw gepland, omdat hun bronfingerprint en hash
kunnen zijn veranderd. Bij een upstream-fout worden downstream-stappen niet uitgevoerd.

De algemene archive-stap beschermt uitsluitend canonieke familie-top-100-lidmaatschappen en de
expliciete `want-to-read`-tag. Afgeleide ontdeklijsten (`Consensus`, `Nieuw`, `Tijdloos`) en
curatietags (`must-read`, `shortlist`) beschermen niet. Cleanup verwijdert alleen beheerde
ordinale/toplijsttags en behoudt inhouds-, curatoriale en `want-to-read`-tags. Journals,
bronfingerprints, bounded batches en losse add/remove-fallbacks blijven de bron van waarheid voor
hervatting en tagbehoud.

## Remote onderhoudsketen

De GitHub-route start alleen op expliciet verzoek via `gh workflow run priority-sync.yml` met een
unieke `request_id`. De native vervolgstappen zijn loopvrij via `workflow_run`: de geslaagde root-run start algemene
archivering, die start archive-cleanup, die start de finale refresh/publicatie. Iedere child-run
neemt de exacte parent-run-ID op in de `displayTitle` en publiceert `maintenance-run.json` met de
gerelateerde commit-SHA; automatische commits worden dus meegenomen zonder een willekeurige
branch-tip te kiezen. De skill volgt deze parent-child-correlatie en behandelt een ontbrekende,
lopende of mislukte vervolgstap als onvoltooid/gedeeltelijk succes. Een lokale inspectie of skillrun
dispatcht nooit de remote workflow en remote automatische bevestiging verleent geen lokale
mutatie-autorisatie.

## V2 verrijkingscontract: bron, evidence, privacy en hervatting

Dit contract geldt voor `readwise-enrich`, `readwise-summarize`, `readwise-book-study` en elke andere skill die Reader-inhoud analyseert. Een skill mag dit contract niet vervangen door oudere voorbeelden of een vaste pass-teller.

### Bronstatus en analyse

- Haal voor elk document de volledige beschikbare bron op, inclusief de bronvariant die voor highlights nodig is (`html_content` wanneer Reader die levert). De Reader-metadata-samenvatting, titel, shownotes of een afgekapt/partieel body-resultaat zijn nooit bewijs dat de volledige bron is gelezen.
- Leg per document een bronstatus vast: `complete`, `partial`, `missing` of `error`, met de gebruikte velden, een bronfingerprint en eventuele gerichte herlezingen. Bij `partial`, `missing` of `error` mag de uitkomst niet als succesvol volledig verrijkt worden gepresenteerd. Tags of andere veilige deeluitkomsten mogen alleen expliciet als gedeeltelijk worden gemeld.
- Doe één volledige inhoudelijke analyse wanneer de bron compleet is en herlees alleen gericht wanneer een claim, highlight, hoofdstukgrens of onzekerheid dat nodig maakt. Een vast aantal volledige passes is geen kwaliteitsbewijs. Verzin geen broninhoud en retry geen mislukte bronophaling met een andere, gefabriceerde tekst.
- Haal de gevraagde locatie volledig en gepagineerd op. Respecteer API-batchlimieten (maximaal 50 metadata-items per bulkcall), maar rapporteer altijd per document: bronstatus, analyse-uitkomst, metadata-write, highlight-writes en fouten. `complete`, `partial`, `skipped` en `error` blijven afzonderlijke uitkomsten.

### Eigendom en privacy

- Een pipeline-notitie markeert zijn beheerde tekst met een expliciete marker, bijvoorbeeld `<!-- pipeline-managed: readwise-enrichment/v2:start -->` en `<!-- pipeline-managed: readwise-enrichment/v2:end -->`. Bij herverrijking mag alleen het gemarkeerde pipeline-segment worden vervangen. Persoonlijke tekst, onbekend eigendom en de laatste `Feedback:`-alinea worden behouden; ontbrekende of onduidelijke eigendomsmarkers betekenen `ownership-unknown`, dus bewaren en rapporteren voor beoordeling.
- Gebruik `splitReadingFeedback` voor de scheiding tussen inhoudsnotitie en feedback. Ruwe feedback, volledige bron, ruwe highlights, highlight-foutteksten en manifestdetails blijven in Reader of `.tmp/readwise/`; ze komen niet in browserdata, scoreconfiguratie, leesprofielconfiguratie of publieke rapporten.
- Reader-highlights worden nooit herschreven of verwijderd. Selecteer passages exact uit de bron en dedupliceer op stabiele Reader-ID plus genormaliseerde brontekst/notitie tegen bestaande highlights én de huidige runregistratie. Een highlightfout wordt per document geregistreerd; retry nooit met aangepaste of verzonnen tekst. Een bruikbare fallback mag de passage bewaren, maar overschrijft geen bestaande fallback.

### Runmanifest en hervatting

Elke batch schrijft een manifest in `.tmp/readwise/` met minimaal `version`, `runId`, `scope`, `generatedAt`, de volledige document-ID-set, de gebruikte bronvelden/fingerprints en per document de feitelijke analyse-/schrijfuitkomsten. Registreer afzonderlijk bronstatus, gerichte herlezingen, analyse, metadata-write, highlight-successes, highlight-errors, fallbackpad en eventuele onzekerheden. Gebruik stabiele operationele sleutels voor metadata- en highlight-writes.

Een hervatting leest dit manifest, slaat alleen aantoonbaar geslaagde writes over en controleert opnieuw de live metadata vóór een volledige tagset-write. Stuur ongewijzigde velden niet mee; een overgeslagen note geeft geen `null` of lege note door en wist geen bestaande tekst. Bij ontbrekende of onbetrouwbare tagsets behoudt de flow onbekende tags met losse bekende add/remove-operaties. Een onvolledig manifest of een gedeeltelijk resultaat wordt nooit als klaar gemarkeerd.

### Gelinkte artikelen

Nieuwe links krijgen dezelfde toelatingspoort: haal de doelpagina zelf op en controleer dat die Nederlands of Engels is, zelfstandig leesbaar is en expliciet aansluit op een kerninteresse. Dedupe tegen de bibliotheek, een complete Feed-snapshot en de huidige run vóór `reader-create-document`. Een bestaande bestemming wordt nooit vervangen; afwijzingen, fouten en aangemaakte links staan per URL in het manifest.

### V2 triageroutering

De standaardroute van standalone triage en de inbox-pipeline is automatisch en vraagt geen beslissing per gewoon document: podcasts en aantoonbare Tier 1-documenten gaan naar `Archive`; overige succesvol verwerkte gewone documenten, nieuwsbrieven en voormalige Tier 2-kandidaten gaan naar `Later`. Een expliciet interactieve triagevraag mag deze standaardroute alleen binnen de door de gebruiker gevraagde interactieve scope vervangen. Eleanor Konik en Henrik Karlsson zijn geen absolute archiveeruitzondering; hun reguliere Later-documenten worden via `want-to-read` beschermd door de prioriteitsflow.

### V2 reviewonderhoud

Een reviewrun haalt altijd een volledige actuele snapshot van `later` op voor dekking en actualiteit. Bestaande actuele semantische `semantic-v2`-judgments en complete `reading-profile-v2`-profielen worden hergebruikt; ontbrekende, stale, operationele fallback- en herbeoordeelbare draft-records worden gericht geselecteerd. Een fallback met status `accepted` is geen semantische review. Expliciete `draft`- en `rejected`-uitkomsten blijven afzonderlijk zichtbaar en tellen niet als bruikbare menuvoorstellen. De actuele topicset bevat ook `philosophy`.

Bewaar broncache en runmanifest totdat zowel priority-judgments als leesprofielen zijn beoordeeld en gerapporteerd. Publiceer uitsluitend gevalideerde objecten die deze run produceerde: vergelijk elk config-ID met de run-start/remote baseline, behoud niet-gerelateerde gelijktijdige edits, en stop bij een conflict. Schrijf eerst naar een geïsoleerde tijdelijke worktree/outputmap; commit en push naar remote zijn een afzonderlijke expliciete bevestigingsstap. Ruwe broninhoud en leesfeedback blijven privé.

## Verificatie

`npm run skills:check` is read-only en controleert metadata, resources, bekende commando's en canonieke contracten. De optionele installatievergelijking (`--compare-installed`) hoort niet bij `npm run check`, omdat die machineafhankelijk is. Scenario's voor dry-run, no-op, conflicten, eerste installatie, tagbehoud en hervatting staan in de tests; tekstcontrole alleen bewijst niet alle semantische runtime-eigenschappen.
