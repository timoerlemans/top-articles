# Reader Document Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concentreer de negen bestaande Reader-ophaalroutes in één geteste module, met behoud van hun veldselecties en taakgebonden verwerking.

**Architecture:** Eén deep module beheert commando-opbouw, paginering, parsing en cursorbewaking achter een kleine interface. De bestaande executor is de transport-seam, met een CLI-adapter voor productie en een gescripte mock-adapter voor tests. Locatiekeuze over meerdere locaties en feedbackinterpretatie blijven bij de aanroepers; dit geeft locality voor ophaalbeleid en leverage voor alle negen routes.

**Tech Stack:** Strict TypeScript, Node.js ESM, bestaande Zod-parser, `node:test`, bestaande Readwise CLI-executors; geen nieuwe dependencies.

**Spec:** [2026-10-10-reader-document-intake-design.md](../specs/2026-10-10-reader-document-intake-design.md)

## Global Constraints

- Alle negen routes gebruiken dezelfde ophaalmodule; de oude paginalussen en lokale veldstrings zijn verwijderd.
- De bestaande veldsets en hun volgorde blijven exact behouden.
- Veldprofielen: `catalog`, `maintenance`, `judge`, `report`, `feedback`, `archive-cleanup`.
- Locaties: `later`, `new`, `shortlist`, `archive`, `feed`; precies één locatie of document-ID per selectie.
- Bouw `reader-list-documents` met een limiet van 100, `--response-fields` en precies één `--json`.
- Een gedeeltelijke documentset wordt nooit teruggegeven.
- De ingestelde executors, bufferlimieten en retry-instellingen van elke taak blijven behouden.
- Alleen leesfeedback dedupliceert en vult ontbrekende/null locaties aan; overige routes behouden duplicaten en ontbrekende locaties.
- Geen live Reader-opvraag, tagmutatie of `npm run build`; `data/data.js` en `data/score.js` worden niet handmatig bewerkt.
- Bestaande on-gecommitte wijzigingen blijven behouden en worden niet opgenomen in refactorcommits. Bewaar de begin-diff van overlappende bestanden, vooral `scripts/priority-judge.ts`, ter vergelijking; herstel die bestanden niet vanuit git.
- Werk met de actuele werkboom: deze bevat de reeds bestaande filosofiewijzigingen waarop het ontwerp is gebaseerd. Als uitvoering isolatie vereist, moet die toestand behouden blijven.

## Review Focus

1. Reader gebruikt dezelfde cursorwaarde in aparte selecties: cursorbewaking is lokaal per aanroep, zodat een volgende locatie gewoon werkt (Task 1).
2. Een lege tussenpagina of lege vervolgcursor: volg de niet-lege cursor, maar stop bij ontbrekende/null/lege cursor (Task 1).
3. Een array-antwoord bevat dubbele IDs, extra velden en ontbrekende locaties: behoud die inhoud en volgorde; voeg geen globale normalisatie toe (Task 1).
4. Feedback bevat dezelfde ID in `later` en `archive`: de laatste versie wint met de oorspronkelijke invoegvolgorde en een nullish locatiefallback (Task 2).
5. Een echte CLI ontvangt een herhaalde cursor na bruikbare documenten: stop zonder derde cursoropvraag en zonder gedeeltelijk planbestand (Task 2).

## Bestanden en verantwoordelijkheden

| Bestand | Verantwoordelijkheid |
| --- | --- |
| Nieuw: `scripts/lib/readwise-documents.ts` | De gedeelde interface, zes private veldprofielen en volledige documentpaginering |
| Nieuw: `test/readwise-documents.test.ts` | Gedrag via dezelfde ophaalinterface als productie |
| `scripts/build-data.ts` | Roep `catalog` voor `later` op |
| `scripts/priority-cli.ts` | Roep `maintenance` per bestaande locatie op; behoud scheiding later/buiten later |
| `scripts/priority-judge.ts` | Roep `judge` voor `later` op |
| `scripts/archive-cli.ts`, `scripts/archive-lees-cli.ts` | Roep `maintenance` voor `later` op |
| `scripts/archive-cleanup-cli.ts` | Roep `archive-cleanup` voor `archive` op |
| `scripts/core-interest-report.ts`, `scripts/topic-priority-report.ts` | Roep `report` voor `later` op; behoud directe executors |
| `scripts/lib/reading-feedback.ts` | Roep `feedback` op; behoud deduplicatie, locatiefallback en interpretatie |
| `test/reading-feedback.test.ts` | Samengesteld feedbackgedrag over locaties en pagina's |
| `test/archive-cleanup-cli.test.ts` | Samengesteld ophaalgedrag via de gecompileerde CLI en tijdelijke fake Readwise |

`scripts/lib/external-schemas.ts` en `scripts/lib/readwise-request.ts` worden gebruikt zonder hun verantwoordelijkheden te wijzigen. Geen extra doorgeefmodule voor iedere aanroeper.

---

### Task 1: Gedeelde ophaalmodule met volledige paginering

**Files:**

- Create: `scripts/lib/readwise-documents.ts`
- Create: `test/readwise-documents.test.ts`

**Interfaces:**

- Consumes: `ReadwiseExecutor<T> = (args: readonly string[]) => Promise<T>` uit `scripts/lib/readwise-request.ts`.
- Consumes: `parseReadwiseDocumentPage(input: unknown): { documents: ReadwiseDocument[]; nextPageCursor: string | null }` en `ReadwiseDocument` uit `scripts/lib/external-schemas.ts`.
- Produces: de volgende exports; de veldtabel zelf blijft private.

```ts
export type ReadwiseDocumentLocation = "later" | "new" | "shortlist" | "archive" | "feed";
export type ReadwiseDocumentProfile = "catalog" | "maintenance" | "judge" | "report" | "feedback" | "archive-cleanup";
export type ReadwiseDocumentSelection = { profile: ReadwiseDocumentProfile } & (
  | { location: ReadwiseDocumentLocation; documentId?: never }
  | { documentId: string; location?: never }
);
export function fetchReadwiseDocuments(
  runReadwise: ReadwiseExecutor<{ stdout: string }>,
  selection: ReadwiseDocumentSelection,
): Promise<ReadwiseDocument[]>;
```

- [ ] **Step 1: Schrijf de eerste test voor meerdere pagina's.**

Importeer de toekomstige ophaalfunctie en gebruik dit concrete scenario:

```ts
test("volgt ook een lege tussenpagina met vervolgcursor", async () => {
  const pages = [
    { results: [{ id: "one" }], nextPageCursor: "page-2" },
    { results: [], nextPageCursor: "page-3" },
    { results: [{ id: "two" }], nextPageCursor: null },
  ];
  const calls: string[][] = [];
  const documents = await fetchReadwiseDocuments((args) => {
    calls.push([...args]);
    const page = pages.shift();
    assert.ok(page, "unexpected extra request");
    return Promise.resolve({ stdout: JSON.stringify(page) });
  }, { profile: "catalog", location: "later" });
  assert.deepEqual(documents.map(({ id }) => id), ["one", "two"]);
  assert.equal(calls.length, 3);
  assert.ok(calls[1]?.includes("page-2"));
  assert.ok(calls[2]?.includes("page-3"));
});
```

- [ ] **Step 2: Controleer de eerste RED.**

Run: `npm run compile`. Verwacht een fout voor het ontbrekende `readwise-documents`-module. Als andere compilefouten bestaan, leg die afzonderlijk vast. Maak daarna uitsluitend de genoemde types en een ophaalfunctie die voorlopig `[]` retourneert, compileer en run `node --test dist/test/readwise-documents.test.js`. Verwacht een assertion failure voor de ontbrekende documenten. Dit bevestigt het daadwerkelijke gedrag dat moet worden geïmplementeerd.

- [ ] **Step 3: Implementeer volledige paginering.**

Gebruik de zes exacte veldstrings uit de spec. Bouw argumenten en parse iedere pagina via de bestaande parser; verzamel de documenten zonder normalisatie. Laat JSON- en schemafouten propagateren. Stop op ontbrekende/null/lege cursor en volg ook een lege pagina met niet-lege cursor.

- [ ] **Step 4: Controleer GREEN voor paginering.**

Run: `npm run compile` en daarna `node --test dist/test/readwise-documents.test.js`. Verwacht nul failures.

- [ ] **Step 5: Voeg cursorgedrag toe als RED → GREEN.**

Test `stopt bij dezelfde cursor` met antwoorden `a`, `a`: `assert.rejects(..., /paginacursor/i)` en `assert.equal(calls.length, 2)`. Test `stopt bij cursorcyclus` met `a`, `b`, `a`: dezelfde fout en precies drie aanvragen. Laat de mock een eventuele extra aanvraag direct afkeuren zodat de tests niet blijven draaien. Run eerst om de verwachte failures te zien, voeg daarna een Set van ontvangen vervolgcursors toe binnen de ophaalfunctie en run opnieuw. Controleer de cursor voordat die opnieuw wordt aangevraagd.

- [ ] **Step 6: Toets de overige interface-uitkomsten.**

Voeg deze benoemde gevallen toe; gebruik parameterisatie waar de verwachtingen gelijk zijn:

| Testnaam | Input en exacte assertions |
| --- | --- |
| `cursorbewaking reset per selectie` | Twee opeenvolgende aanroepen voor `later` en `archive`, elk met cursor `shared`, elk twee pagina's; beide leveren hun eigen documenten en er zijn vier aanvragen |
| `bewaart arraydocumenten zonder normalisatie` | Array met dubbele ID, `language: "nl"`, extra veld en ontbrekende locatie; `assert.deepEqual(result, input)` en volgorde/dubbele ID blijven intact |
| `stopt bij ontbrekende of lege cursor` | Objectantwoorden met ontbrekende cursor, null en `""`; steeds één aanvraag |
| `selecteert document-ID zonder locatie` | `{ profile: "feedback", documentId: "target" }`; exact `--id target`, geen `--location`, geen eerste `--page-cursor` |
| `gebruikt exact het gekozen veldprofiel` | Alle zes profielen; vergelijk `--response-fields` met onafhankelijke vaste strings uit de spec, geen `language`, limiet `100`, precies één `--json` |
| `selecteert iedere bestaande locatie` | Alle vijf locaties met `maintenance`; `--location` is exact de gekozen locatie |
| `propagatie van transportfout na eerste pagina` | Geldige pagina met vervolgcursor, daarna dezelfde Error; `assert.rejects` met die Error en precies twee aanvragen |
| `weigert ongeldige vervolgpagina` | Geldige eerste pagina, daarna ongeldige JSON of `{ results: [{ id: "" }] }`; de Promise reject en levert geen gedeeltelijk resultaat |

Controleer dat de type-union in de geëxporteerde interface precies één selectie vereist. Voeg geen runtimeframework of apart testbestand met alleen typemirrors toe.

- [ ] **Step 7: Verifieer de deep module en commit uitsluitend deze taak.**

Run: `npm run compile` en daarna `node --test dist/test/readwise-documents.test.js dist/test/external-schemas.test.js dist/test/readwise-request.test.js`. Verwacht nul failures. Run `git diff --check`. Stage alleen `scripts/lib/readwise-documents.ts` en `test/readwise-documents.test.ts`; commit met `refactor: centraliseer Reader-documentpaginering`.

### Task 2: Migreer negen routes en verifieer samengesteld gedrag

**Files:**

- Modify: alle negen aanroepers in de bestandentabel hierboven.
- Modify: `test/reading-feedback.test.ts`
- Modify: `test/archive-cleanup-cli.test.ts`

**Interfaces:**

- Consumes: `fetchReadwiseDocuments(runReadwise: ReadwiseExecutor<{ stdout: string }>, selection: ReadwiseDocumentSelection): Promise<ReadwiseDocument[]>` uit Task 1.
- Preserves: `prepareReadingFeedback(runReadwise, judgments, readingPreferences, documentId?): Promise<ReadingFeedbackReview>` en alle bestaande CLI-commando's.
- Produces: alle negen ophaalroutes gebruiken de Task 1-interface en hebben geen eigen documentpaginalus of veldstring meer.

- [ ] **Step 1: Schrijf een CLI-regressietest die ontbrekende cursorbewaking aantoont.**

Breid de tijdelijke fake `readwise` in `test/archive-cleanup-cli.test.ts` uit met een scenario dat bij de eerste aanvraag `{ results: [{ id: "first", location: "archive", tags: { "lees-0001": {} } }], nextPageCursor: "again" }` geeft en bij de tweede aanvraag `{ results: [], nextPageCursor: "again" }`. Laat latere aanvragen een lege afgeronde pagina teruggeven zodat de huidige CLI geen oneindige lus maakt.

Testnaam: `herhaalde paginacursor schrijft geen gedeeltelijk cleanup-plan`. Assertions: `assert.notEqual(result.code, 0)`, `assert.match(result.stderr, /paginacursor/i)`, precies twee gelogde aanvragen en `assert.rejects(readFile(planPath, "utf8"), { code: "ENOENT" })`. Gebruik tijdelijke bestanden en ruim ze in `finally` op.

- [ ] **Step 2: Controleer RED via de echte CLI.**

Run: `npm run compile` en daarna `node --test --test-name-pattern='herhaalde paginacursor' dist/test/archive-cleanup-cli.test.js`. Verwacht een failure: de huidige CLI vraagt een derde pagina op en schrijft een gedeeltelijk plan in plaats van een cursorfout te geven.

- [ ] **Step 3: Migreer de acht entry scripts.**

Vervang de parserimport door de Task 1-import, verwijder lokale `RESPONSE_FIELDS` en de lokale `fetchLater`/`fetchArchive`/`fetchLocation`/`fetchDocumentsByLocation`-functies. Vervang hun aanroepen direct door de gezamenlijke ophaalfunctie met het profiel en de selectie uit de spec-tabel. Behoud `ReadwiseDocument`-typeimports waar ze nog worden gebruikt.

In `priority-cli.ts` behoud je de bestaande locatievolgorde en `fetchLibrary`-uitkomst met aparte `later`/`outside`-documenten. In beide rapporten verwijder je uitsluitend het extra toevoegen van `--json` in hun directe executors; behoud het directe uitvoeren en de bufferlimiet van 64 MiB. Laat alle andere executorinstellingen gelijk.

- [ ] **Step 4: Controleer GREEN voor de CLI-regressie.**

Run dezelfde commando's als Step 2. Verwacht nul failures, precies twee aanvragen en geen planbestand. De bestaande tests voor een leeg cleanup-plan moeten ook blijven slagen.

- [ ] **Step 5: Borg feedbackgedrag en migreer de negende route.**

Voeg test `feedback bewaart laatste versie en oorspronkelijke ID-volgorde` toe: pagina's bevatten `one`, daarna `two`, daarna een nieuwe `one` in `archive`; assert IDs `["one", "two"]`, feedback/evidence van de laatste `one` en `location: "archive"` bij een ontbrekende/null locatie. Een expliciete locatie blijft behouden; een gerichte ID-opvraag zonder locatie krijgt geen verzonnen locatie.

Run de feedbacktests eerst als karakterisatietests. Migreer daarna de buitenste lus in `reading-feedback.ts`: bij een document-ID haal je dat ID op met `feedback`; anders achtereenvolgens `later` en `archive`. Geef elke teruggegeven documentversie aan de bestaande Map met dezelfde `doc.location ?? location`-regel. Verwijder de lokale paginalus, cursor-Set, parserimport en veldstring. Behoud verwerking van notities, fingerprints, judgments en evidence.

- [ ] **Step 6: Voeg een CLI-test voor complete meerpaginaresultaten toe.**

Testnaam: `cleanup-plan bevat documenten van alle pagina's`. Fake antwoorden: eerste pagina `one` met `lees-0001` en vervolgcursor `next`; tweede pagina `two` met `aaa-top-10` en geen cursor. Parse het geschreven plan met `validateArchiveCleanupPlan` uit `scripts/lib/archive-cleanup.ts` voor typering; assert `summary.documents === 2` en `operations` zijn exact `[{ action: "remove", documentId: "one", tag: "lees-0001" }, { action: "remove", documentId: "two", tag: "aaa-top-10" }]`. Assert twee read-only lijstcommando's, tweede met `--page-cursor next`, en precies één JSON-argument per commando. Voeg geen test toe die de implementatietekst van aanroepers matcht.

- [ ] **Step 7: Verifieer de migratie gericht en volledig.**

Run: `npm run compile` en daarna `node --test dist/test/readwise-documents.test.js dist/test/reading-feedback.test.js dist/test/archive-cleanup-cli.test.js dist/test/archive-cleanup.test.js`. Verwacht nul failures.

Controleer met `rg -n 'parseReadwiseDocumentPage|RESPONSE_FIELDS|page-cursor'` op de negen gewijzigde aanroepers dat hun lokale documentophaalbeleid is verdwenen. Beoordeel de diff: juiste profiel per route, dezelfde executors, behoud feedback-Map en geen wijzigingen in scorelogica of mutatiecommando's.

Run `npm run check`. Verwacht lint, typecheck en alle tests succesvol. Bij bestaande failures: bewijs de herkomst met de vastgelegde begin-diff en rapporteer de beperking; herstel geen afzonderlijke wijzigingen om de check groen te maken.

- [ ] **Step 8: Commit de refactor zonder bestaande wijzigingen mee te nemen.**

Run `git diff --check`. Stage de acht overige aanroepers en twee gewijzigde testbestanden expliciet; stage in `scripts/priority-judge.ts` alleen de refactorhunks met `git add -p`. De al bestaande wijzigingen aan `TOPIC_SEQUENCE_ORDER` en filosofie-instructies blijven buiten de commit. Controleer `git diff --cached`, commit met `refactor: gebruik gedeelde Reader-documentophaalroute` en controleer de resterende werkboom tegen de beginstatus.

## Afronding en review

Een onafhankelijke reviewer controleert de negen aansluitingen, cursorfouten, veldprofielen, executors en testuitkomsten tegen de spec en de refactordiff. Bij native uitvoering gebeurt die review na beide taken. Publicatie of live Reader-synchronisatie hoort niet bij dit plan.

Rapporteer de gewijzigde module, het verdwijnen van de negen paginalussen, de daadwerkelijk uitgevoerde checks en eventuele bestaande failures. Geef geen passing-claim zonder verse verificatie-output.
