# Prioriteitstagsynchronisatie verdiepen

## Doel en besluiten

Eén module bezit plan/apply/verify, inclusief configuratievalidatie, bronbewaking,
hervatten, live eindtagsets, herstelrondes en eindverificatie. De CLI bezit argumenten,
paden en presentatie. De bestaande documentintake en v8-scoring blijven in gebruik.

- Interface: `createPrioritySync(dependencies)` met `plan(options)`,
  `apply({ plan, confirmation, journalPath })` en `verify(options)`.
- Adapters: Readwise-executors, ruwe configuratie, journalopslag; tijd/wachttijden
  en getypeerde voortgangsevents zijn injecteerbaar.
- Planmodel v3 bewaakt ook judgments. Oude plannen moeten opnieuw worden gemaakt.
- Iedere live-verificatie bewaakt de oorspronkelijke bronfingerprint. Bronwijziging
  stopt de run vóór herstel; beheerde tagwijzigingen laten hervatten toe.
- Behoud drie rondes, tien seconden tussen herstelrondes, batches van vijftig,
  bestaande retries en fallback. Onbekende tagsets gebruiken losse mutaties.
- Behoud operationele journals. Ongeldige journals stoppen; een andere planhash
  begint een nieuw journal. Verwijder successtatus vóór uitvoering en publiceer
  die uitsluitend na een lege einddiff. Voortgang telt alleen rondeoperaties.
- Een journalwrite-fout valt buiten de mutatieretry; deze correctie geldt ook voor
  archive-cleanup, die zijn eigen workflow behoudt.

## Taken

1. RED→GREEN: judgments in deterministische v3-bronfingerprint en journalwrite-fouten.
2. Workflowtests en synchronisatiemodule; dunne CLI; generieke reconcile verwijderen.
3. README en domeintermen bijwerken; alleen tagplanvelden in baselinefixture vernieuwen.
4. `npm run check` en één onafhankelijke review; relevante bevindingen oplossen.

## Tests en acceptatie

Geen echte Reader-mutaties. Gescripte transportadapter met echte planners/validators:
hash/integriteit en gewijzigde bron weigeren; drift tijdens herstel; hervatten en
oude successtatus; onbekende/onbeheerde tags; bulkafwijzing/ontbrekende resultaten;
fallback/retries; drie mislukte rondes; journalwrite-fout; lege live-diff. Een CLI-
smoketest controleert argumenten, foutuitvoer en exitcode. Bestaande archive-cleanup-
tests blijven groen. Eindacceptatie: `npm run check` slaagt.
