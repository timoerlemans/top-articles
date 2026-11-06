# Reader-documentclassificatie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pas bestaande classificatieregels consequent toe voor actuele Reader-documenten, zodat aliassen en ondersteunde tagrepresentaties dezelfde inhoudelijke classificatie geven.

**Architecture:** Eén pure module classificeert een document inclusief actuele judgment-resolutie, topicrelevantie en kerninteressebewijs. V8 en openbare catalogusprojectie gebruiken deze interface; bestaande historische exports blijven op hun oorspronkelijke interpretatie. Kleine gedeelde berekeningen krijgen expliciete taginvoer en originele fingerprintinput, zonder terugimports naar de classifier.

**Tech Stack:** Strict TypeScript, ES modules/NodeNext, Node 24, `node:test`, bestaande `tsc`/ESLint; geen nieuwe dependencies.

**Spec:** [Consistente actuele Reader-documentclassificatie](../specs/2026-10-14-reader-document-classification-design.md).

**GitHub issue:** [#41 — Consistente Reader-documentclassificatie](https://github.com/timoerlemans/top-articles/issues/41).

## Global Constraints

- Bestaande classificatieregels consequent toepassen, zonder nieuwe taxonomie of scoregewichten.
- Actueel Kort: positieve leestijd `< 5`; historische `< 10` blijft ongewijzigd.
- `readwise-priority-v8`, browsercontracts en bestaande score-/curatie-/auteursgewichten blijven gelijk; #35 is afzonderlijk werk.
- Bron- en evidencefingerprints en hun legacy-matching blijven exact behouden voor dezelfde originele invoer.
- Historische v2/v3/v5/v6/v7-uitvoer blijft gelijk; v8 mag geen historische scoringmodule nodig hebben.
- Geaccepteerde actuele semantische ratings, inclusief `0`, blijven leidend; operationele fallback is geen semantisch label.
- Geen Reader-opvraag, mutatie, e-mail of `npm run build` voor deze implementatie; gegenereerde data niet handmatig wijzigen.
- Kansen 2 en 4 blijven bij #39; geen gedeelde uitvoerings- of Archive-levenslooprefactor in dit plan.

## Review Focus

- Aliasuitbreiding naar meerdere tags: geen extra onafhankelijke bonus voor dezelfde kerninteresse; originele bewijsbron blijft herkenbaar (taak 2/3).
- Een geaccepteerde operationele fallback met oude topicratings: actuele fallback herberekenen zonder een echte semantische nulrating te overschrijven (taak 2/3).
- Gemengde/onleesbare descriptors en cyclische objectmetadata: tolerante classificatie zonder invoermutatie of impliciete volledigheidsclaim (taak 2/4).
- Tegenstrijdige video/boek-markers en dubbele positietags: bestaande exportfouten niet door normalisatie laten verdwijnen (taak 3).
- Oud onderhoudsplan bij ongewijzigde documentgegevens: beleidswijziging vereist een nieuw plan, terwijl judgment/sourcehashes gelijk blijven (taak 5).

## Bestanden en eigenaarschap

| Bestand | Verantwoordelijkheid |
|---|---|
| Nieuw `scripts/lib/reader-document-classification.ts` | Actuele interpretatie en drie entrypoints uit de spec; geen gewichten, ranking of I/O. |
| `priority-judgments.ts`, `priority-topic-taxonomy.ts`, `philosophy-profile.ts`, `core-interest-priority.ts` onder `scripts/lib/` | Gedeelde pure berekeningen met expliciete invoer; bestaande legacy-exports behouden. |
| `scripts/lib/priority-membership.ts` | Actuele ingang delegeren; historische membership en originele positievalidatie behouden. |
| `scripts/lib/readwise-priority-v8.ts` | Voorbereide classificatie consumeren, scorebeleid behouden. |
| `scripts/lib/priority-judge.ts` | Nieuwe operationele beoordelingen met actuele classificatie voorbereiden. |
| Nieuw `scripts/lib/catalog-item.ts`, `scripts/build-data.ts` | Bestaande veilige itemprojectie concentreren en uit build aanroepen. |
| `scripts/lib/priority-tag-plan.ts`, `archive-plan.ts`, `archive-lees-plan.ts` | Classificatiebeleid toevoegen aan bestaande planbronhashes. |
| `test/reader-document-classification.test.ts`, `test/catalog-item.test.ts`, bestaande contracttests | Test surface: classificatie, actuele uitvoer, openbare items, historische uitvoer en hashes. |
| `CONTEXT.md`, `README.md` | Domeinbenaming en architectuur/documentatie bij afronding. |

## Taak 1: Leg historische uitvoer en bronmatching vast

**Files:** Create `test/reader-document-classification-history.test.ts` en `test/fixtures/reader-document-classification-history.json`; gebruik bestaande tests/fixtures zonder hun verwachte waarden te vervangen.

**Interfaces:** Consumes bestaande `scorePriorityDocument` uit v2 en `buildPriorityExport` uit v3/v5/v6/v7; `judgmentSourceFingerprint`, `buildPriorityEvidence`, `judgmentMatchesSource`. Produces een vaste historische fixture en contracttests; geen nieuwe runtime-interface.

- [ ] **Stap 1: Leg exacte historische verwachtingen vast vóór runtimewijzigingen.** Gebruik vaste `generatedAt: "2026-10-14T00:00:00.000Z"`, bestaande baseline-documenten plus afzonderlijke documenten met `team collaboration`, zijn canonieke tag, `agile & scrum`, mixed descriptors, politieke filosofie en `4.5 min`/`5 min`. Bewaar v2-scores, volledige exports van v3/v5/v6/v7, source/evidencehashes en historische kerninteressebewijzen. Bewaar daarnaast oude tag-, algemene Archive- en lees-Archiveplannen voor een afzonderlijk neutraal document met ongewijzigde classificatie, dezelfde vaste datum en lege overrides/judgments; die dienen in taak 5 als beleidsmigratieregressie. Leg fixtures vast vanuit de ongewijzigde werkende code; de actuele testcase mag zijn verwachtingen niet zelf genereren.
- [ ] **Stap 2: Schrijf karakterisatietests.** Assert volledige serialized historische uitvoer, vaste fingerprints en behoud van accepted source-matching, ook met appended Feedback en bestaande legacy-want-to-read-hashes. Alias en canonieke tag mogen verschillende bronhashes hebben.
- [ ] **Stap 3: Verifieer de karakterisatie.** Run `npm run compile && node --test dist/test/reader-document-classification-history.test.js dist/test/current-priority.test.js dist/test/reading-time-policy.test.js`. Verwacht: PASS vóór de refactor. Dit is bewust karakterisatie, geen kunstmatige red-green voor ongewijzigd gedrag.
- [ ] **Stap 4: Commit uitsluitend deze guardrails.** `git add test/reader-document-classification-history.test.ts test/fixtures/reader-document-classification-history.json`; commit `test: leg historische documentclassificatie vast`.

## Taak 2: Bouw de deep module en behoud legacy-berekeningen

**Files:** Create `scripts/lib/reader-document-classification.ts`, `test/reader-document-classification.test.ts`; modify de vier berekeningsmodules uit de bestandstabel; preserve `priority-document.ts`, `readwise-tags.ts` en alle historische scoringmodules.

**Interfaces:** Produces exact `ReaderDocumentClassification`, `ReaderClassificationOptions`, `classifyReaderDocument`, `automatedReaderFallbackJudgment` en `readerClassificationFingerprintInput` uit de spec. Interne seams voor hergebruik:

```ts
// priority-judgments.ts
export interface ReaderFallbackTagContext {
  allTags: readonly string[];
  contentTags: readonly string[];
  domains: readonly DirectDomain[];
}
export function fallbackJudgmentFromTagContext(
  original: PriorityDocument, tags: ReaderFallbackTagContext,
): ContentJudgment;

// priority-topic-taxonomy.ts; generieke tagsterkteberekening
export function fallbackTopicRelevanceFromTags(
  topic: TopicSequence, tags: readonly string[],
  taxonomy?: TopicTagTaxonomy,
): TopicRelevanceFallback;

// philosophy-profile.ts; eigen filosofiepolicy blijft leidend
export function philosophyRelevanceFromTags(
  original: PriorityDocument, canonicalTags: readonly string[],
): { relevance: PhilosophyRating; evidence: string[] };

// core-interest-priority.ts
export interface CoreInterestTagSignal {
  source: string;
  canonicalTags: readonly string[];
}
export function resolveCoreInterestMatchesFromSignals(
  signals: readonly CoreInterestTagSignal[], judgment: ContentJudgment,
): CoreInterestMatch[];
```

Deze seams blijven implementation-details van de samengestelde classificatie;
actuele callers gebruiken uitsluitend de drie entrypoints. Oude exports geven
hun oorspronkelijke interpretatie door: legacy core-interest-signalen hebben
`canonicalTags: [source]`. Geen helper importeert de classifier.

- [ ] **Stap 1: Schrijf de failing contracttests.** Gebruik één artikel-ID met vaste inhoud en `saved_at`; varieer uitsluitend tags. Assert dezelfde sequences, topicratings, belangen en taal voor strings, descriptors en objectkeys. Assert alias/canoniek social-studies-relevantie 4; brede teamtags Scrum-relevantie 1 zonder Scrum-membership; sterke Agile-tags relevantie 4; onbekende inhoudstags behouden; alias plus canoniek geeft geen extra match/bonus. Voor bewijsvergelijking behoud je de oorspronkelijke `source`, geen eis dat verschillende ruwe tags identieke bewijslabels hebben.
- [ ] **Stap 2: Voeg onafhankelijke policygevallen toe.** Assert books-only en PDF-exceptie, `4.5 min` versus `5 min`, ongeldige/nul/negatieve leestijd, expliciete taal boven tags en Nederlands boven Engelse fallbacktags. Assert meervoudige `tagDomains` versus primaire scoretoewijzing voor `political philosophy` en `anarchism`; behoud filosofie 4/3/2/1, saturation, specifieke inhoudssignalen en Feedback-uitsluiting. `front-end software development` krijgt geen nieuw membership.
- [ ] **Stap 3: Voeg judgment- en invoerfouten toe.** Voor accepted semantic ratings assert expliciete topicwaarde 0; missing/stale/draft/rejected geeft actuele low-confidence fallback. Voor accepted `AUTOMATED_FALLBACK_JUDGER` met oude social-studies-rating 0 assert recomputatie naar 4 met fallbackbron. Assert `name: null, key: "scrum"` telt; `name: 7, key: "scrum"` telt niet. Assert onleesbare entries/cyclische metadata worden niet doorlopen, input blijft gelijk en vaste source/evidencehashes veranderen niet.
- [ ] **Stap 4: Run red.** `npm run compile && node --test dist/test/reader-document-classification.test.js`; bij ontbrekende exports kan compilatie eerst falen. Voeg dan uitsluitend lege getypeerde entrypoints toe zodat de bedoelde gedragsasserties rood worden. Verklaar elke fout voordat implementation begint.
- [ ] **Stap 5: Implementeer interpretatie en interne berekeningen.** Decodeer originele namen één keer; normaliseer zoals bestaande judgment/documentkennis (NFKD, diacritics, apostrofs, lowercase, whitespace). Gebruik bestaande aliases voor canonieke betekenis. Houd originele bronsignalen en metadatarollen intern apart; filter originele én canonieke systeemtags uit inhoudelijk bewijs. Verplaats bestaand rekenwerk naar bovenstaande interne seams, met gelijkblijvende legacy-invoer en oorspronkelijke sourcehashinput. De classifier bezit actuele membershipregels, judgmentkeuze en topic/core-resultaten; geen clone met canonieke tags door `judgmentFor`/fingerprintfuncties sturen.
- [ ] **Stap 6: Implementeer operationele provenance en beleidsinvoer.** `automatedReaderFallbackJudgment` gebruikt oorspronkelijke evidence, vaste/injecteerbare `judgedAt`, bestaande rubric/status/provenancevelden en actuele deterministische ratings. `readerClassificationFingerprintInput` retourneert `version: 1`, daadwerkelijke alias-/membership-/topicregels, `coreInterestFingerprintInput()`, kortegrens 5 en expliciete versies voor decoder, fallback en filosofiepolicy. Houd die input JSON-serialiseerbaar en deterministisch; elke niet-tabelmatige policywijziging vereist een versie-update.
- [ ] **Stap 7: Run green en legacy-check.** `npm run compile && node --test dist/test/reader-document-classification.test.js dist/test/reader-document-classification-history.test.js dist/test/priority-evidence.test.js dist/test/priority-topic-taxonomy.test.js dist/test/core-interest-priority.test.js dist/test/philosophy-priority.test.js`. Verwacht PASS; bestaande legacy-uitvoer wijzigt niet.
- [ ] **Stap 8: Commit de module en berekeningen.** Stage alleen taakbestanden; commit `refactor: verdiep actuele Reader-documentclassificatie`.

## Taak 3: Laat actuele scoring en fallbacks dezelfde classificatie gebruiken

**Files:** Modify `scripts/lib/readwise-priority-v8.ts`, `priority-membership.ts`, `priority-judge.ts`; tests `readwise-priority-v8.test.ts`, `priority-judge.test.ts`, `current-priority.test.ts`, `reading-time-policy.test.ts`; eventuele expliciet verklaarde updates in `test/fixtures/current-priority-baseline.json`.

**Interfaces:** Consumes `classifyReaderDocument(doc, { judgments })` eenmaal per voorbereid document en `automatedReaderFallbackJudgment(doc, judgedAt)`. Existing public v8 exports en signatures blijven gelijk. Actuele `sequencesForDocument(doc): PrioritySequence[]` retourneert een arraykopie van classificatie; historische ingang blijft zelfstandig.

- [ ] **Stap 1: Schrijf red integrationtests.** Assert alias/canoniek dezelfde v8-core-interest-bonus en social-studies-topicrating/score geven. Controleer zowel ontbrekende beoordelingen als oude operationele fallbacks. Een actuele accepted semantische topicrating 0 blijft 0. Test alias plus canoniek zonder stapeling en een document met meerdere onafhankelijke interesses met behoud van bestaande stapeling.
- [ ] **Stap 2: Pin bestaande fouten en policy.** Assert v8 afwijzing van `category: video` plus `book`, dubbele ID's, ongeldige saved_at en meerdere originele positietags. Behoud bestaande curatoriale descriptorquirks en standalone/export-foutgevallen; normaliseer die niet als neveneffect. Behoud de test die historische scoringmodules blokkeert.
- [ ] **Stap 3: Verifieer red.** `npm run compile && node --test dist/test/readwise-priority-v8.test.js dist/test/priority-judge.test.js dist/test/current-priority.test.js`.
- [ ] **Stap 4: Integreer de voorbereide classificatie.** Voeg `classification: ReaderDocumentClassification` toe aan private `PreparedDocument`. Gebruik haar judgment, matches, taal/leestijd, topics en sequences voor actuele besluiten. `sequenceScore` krijgt voorbereide classificatie in plaats van opnieuw topicinterpretatie uit het raw document. Behoud bestaande scorecomponenten, curation, ranking en clipping. Laat `actualPositionsForDocument` raw invoer scannen; voeg zo nodig de bestaande contradictoire video/book-afwijzing expliciet toe vóór exportconstructie.
- [ ] **Stap 5: Verbind actuele membership en operationele voorbereiding.** Laat alleen huidige `sequencesForDocument` delegeren; classifier roept deze ingang niet terug aan. Laat `ensureMissingFallbacks` nieuw ontbrekende records met de actuele operationele functie maken. Bewaar bestaande selectie/hergebruik/rapportage: geen automatische configmigratie of herbeoordeling van alle records.
- [ ] **Stap 6: Audit baselineverschillen per veld.** Vaste bronhashes en historische kanten mogen niet veranderen. Verklaar gewijzigde actuele ratings, kerninteressebewijzen en daarvan afgeleide posities afzonderlijk. Bewaar expliciete canonieke verwachtingen in tests; vervang niet de volledige baseline met een nieuw berekend object zonder diff-audit. Door de scorecorrectie gewijzigde downstreamplannen worden hier eveneens per veld verklaard; taak 5 voegt daarna afzonderlijk classificatiepolicy aan de planhashinput toe.
- [ ] **Stap 7: Run green.** `npm run compile && node --test dist/test/reader-document-classification-history.test.js dist/test/readwise-priority-v8.test.js dist/test/current-priority.test.js dist/test/priority-judge.test.js dist/test/priority-judge-cli.test.js dist/test/reading-time-policy.test.js dist/test/unified-lists.test.js dist/test/philosophy-priority.test.js`. Verklaarde downstream-baselineupdates behoren tot deze taak; geen onverklaarde failing tests achterlaten.
- [ ] **Stap 8: Commit.** `refactor: gebruik classificatie in actuele leesprioriteit`.

## Taak 4: Verbind veilige openbare catalogusprojectie

**Files:** Create `scripts/lib/catalog-item.ts`, `test/catalog-item.test.ts`; modify `scripts/build-data.ts`.

**Interfaces:** Export `CatalogItem` (bestaande velden uit build-data) en `toCatalogItem(document: ReadwiseDocument, position: number | null): CatalogItem`. Deze implementation classificeert zelf en projecteert bestaande openbare velden; de build kent de interpretatieregels niet.

- [ ] **Stap 1: Schrijf red projectietests.** Voor `[{ name: "dutch" }, { key: "team collaboration" }]` assert Nederlands, canonieke interesse-tag en bestaande tagDomains. Vergelijk strings/objectkeys met hetzelfde resultaat; pin titels, auteur, Readwise-link, leestijd, datums, positie en openbare notitieregels volgens bestaande toItem-output.
- [ ] **Stap 2: Test privacy en rollen.** Assert raw notes/laatste Feedback/brontekst/judgmentprovenance ontbreken; curatoriale, taal-, workflow-, positie- en top-tags staan niet in `tags`. `whyRead` en `bestMoment` blijven de bestaande toegestane projectie. Onbekende inhoudstags blijven behouden. Een onleesbare descriptor levert geen verzonnen inhoudstag; input blijft gelijk.
- [ ] **Stap 3: Verifieer red.** `npm run compile && node --test dist/test/catalog-item.test.js`; gebruik dezelfde ontbrekende-exportstrategie als taak 2.
- [ ] **Stap 4: Verplaats bestaande projectie en verbind de build.** Verplaats `CatalogItem` en `toItem`-sanitization naar de nieuwe module; gebruik classifier voor language, readingMinutes, interestTags en tagDomains, met arraykopieën waar nodig. Verwijder lokale tagKeys/languageFor/interestTagsFor en hun taalmap uit build-data. Geen verandering aan ophalen, configvalidatie, lijsten, banner, bestandsnamen of generatiecoherentiebeleid.
- [ ] **Stap 5: Verifieer green offline.** `npm run compile && node --test dist/test/catalog-item.test.js dist/test/reader-document-classification.test.js dist/test/generated-priority.test.js dist/test/reading-profiles.test.js dist/test/reading-time-policy.test.js`. Tests importeren de projectiemodule; de CLI-main wordt niet gestart. De bestaande gecommitteerde data blijven valide zonder vernieuwing.
- [ ] **Stap 6: Commit.** `refactor: centraliseer veilige catalogusclassificatie`.

## Taak 5: Bewaak classificatiebeleid in onderhoudsplannen en rond af

**Files:** Modify `scripts/lib/priority-tag-plan.ts`, `archive-plan.ts`, `archive-lees-plan.ts`; tests `priority-tag-plan.test.ts`, `priority-sync.test.ts`, `archive-plan.test.ts`, `archive-lees-plan.test.ts`, `current-priority.test.ts`; audit bijbehorende planbaseline. Update `README.md` met de nieuwe actuele module en verwachte hashvernieuwing; CONTEXT.md heeft de domeinterm al.

**Interfaces:** Consumes `readerClassificationFingerprintInput(): Record<string, unknown>`. Voeg `readerClassification` toe aan de bestaande hashinput naast documenten/config/coreInterestMapping; planmodel en bevestigingsinterface blijven gelijk. `archive-cleanup` gebruikt geen ranking en krijgt deze policyinput niet.

- [ ] **Stap 1: Schrijf red policyhash-tests.** Gebruik de oude neutrale fixtureplannen uit taak 1 met exact dezelfde documenten/config/datum; bouw nieuwe tag-, Archive- en lees-Archiveplannen. Assert ongewijzigde operaties/beschermde ID's maar gewijzigde sourceFingerprint/planHash. Oefen bestaande Archive-freshnesschecks en priority-sync met de oude bevestigde plannen: verwacht afwijzing vóór Reader-mutaties, met een stateful fixture. Een nieuw actueel bevestigd plan blijft bruikbaar. Bouw tweemaal met dezelfde invoer: hashes zijn deterministisch. Geen spiegeltest die uitsluitend de implementatie van SHA-256 of private hashinput nabouwt.
- [ ] **Stap 2: Pin onveranderde bronmatching.** Assert `judgmentSourceFingerprint`, evidencehash en accepted legacy-source-matching nog exact de waarden uit taak 1 hebben. Alleen onderhoudsplanbronhashes omvatten classificatiepolicy.
- [ ] **Stap 3: Verifieer red.** `npm run compile && node --test dist/test/priority-tag-plan.test.js dist/test/priority-sync.test.js dist/test/archive-plan.test.js dist/test/archive-lees-plan.test.js dist/test/current-priority.test.js`.
- [ ] **Stap 4: Voeg policyinvoer toe en audit baselines.** Nieuwe hashinput voor alle drie rankingafhankelijke plannen; behouden ruwe source serialization. Pas alleen verklaarde planhash/sourceFingerprint-baselinevelden en eerder geaudit actuele gevolgen aan. README benoemt de module, historische isolatie en dat oude plannen opnieuw voorbereid/bevestigd moeten worden. Er wordt nu geen plan toegepast.
- [ ] **Stap 5: Verifieer green en volledige checks.** Run betrokken tests en vervolgens `npm run check`. Verwacht exit 0; controleer eventuele tracked `dist/src`-output uit compile en commit uitsluitend werkelijk gewijzigde browseroutput. Geen `data/data.js`, `data/score.js` of configwijzigingen door tests.
- [ ] **Stap 6: Controleer deletion test en scope.** Actuele callers reconstrueren membership/topic/core-interesse/public-language-regels niet meer. Duplicatie die uitsluitend voor historische policy overblijft is benoemd en getest. Geen back-import naar classifier, nieuw framework, policyuitbreiding of #39/#35-implementatie. Historische contracttests en actuele invarianten slagen.
- [ ] **Stap 7: Commit en review de volledige wijziging.** `refactor: bewaak classificatiebeleid in onderhoudsplannen`. Review testoppervlak, historische isolatie, raw fingerprints, operationele fallbackherberekening en verklaarde baselineverschillen voordat integratie plaatsvindt.

## Uitvoeringsadvies

Voer de vijf taken achtereenvolgens uit: zij delen dezelfde interface en
historische guardrails. Native uitvoering past goed bij deze samenhang;
een onafhankelijke review van de volledige wijziging is nuttig vóór integratie.
Dit plan voert de implementatie, publicatie of onderhoudsketen nog niet uit.
