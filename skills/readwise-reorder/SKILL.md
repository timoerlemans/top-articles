---
name: readwise-reorder
description: Use when reprioritizing, synchronizing, cleaning up, or verifying personal Readwise Reader order tags and derived top-list tags, including requests to move a document or topic higher or lower.
---

# Readwise Reorder

## Scope in the current repository

Read [`../readwise-reference.md`](../readwise-reference.md) in the repository checkout. When installed separately, locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or `/mnt/c/dev/top-articles`, then read `<repository>/skills/readwise-reference.md`; do not assume the relative link exists. This skill is limited to explicit manual reprioritization and positioning of a newly requested document. Full priority synchronization, cleanup, and remote workflow dispatch belong to `readwise-priority-sync`; do not duplicate or reimplement their score/tag logic here.

Gebruik altijd de prioriteitsmotor uit `top-articles`. Bereken nooit zelf scores, tiers, posities of toplijsten in deze skill.

## Canonieke repository vinden

Gebruik in deze volgorde:

1. de huidige worktree wanneer `package.json` de package `top-articles` bevat;
2. de map uit `TOP_ARTICLES_REPO`;
3. `/mnt/c/dev/top-articles`.

Stop met een concrete foutmelding wanneer geen geldige repository met `scripts/priority-cli.ts` bestaat. Kopieer de scorelogica nooit naar een tijdelijk script of naar deze skill.

## Beheerde tags

- Ordinaal: `lees-XXXX`, `video-XXX`, `boek-XXX`, `dutch-XXX`, `short-XXX`, `short-dutch-XXX`, `luchtig-XXX`, `luchtig-nederlands-XXX`, `scrum-XXX`.
- Afgeleid: alle top-10/top-100-tags die de CLI voor de appfamilies plant, inclusief de bestaande `boek-top-10`/`boek-top-100` en `aaa-scrum-top-10`/`aaa-scrum-top-100`.
- Lidmaatschap: `light-reading`, wordt automatisch gezet door zowel de `readwise-enrich`- als de `readwise-triage`-skill bij `Beste moment: ontspannen` (triage kent bovendien een entertainmentwaarde-uitzondering: puur vermakelijke content zonder leerwaarde kan alsnog naar `later` gaan als het onderwerp raakt aan een interessegebied — zie die skill). Binnen deze skill blijft handmatig beheer (correcties, eenmalige backfills) via expliciet verzoek mogelijk.

Raak geen andere tags of metadata aan. Ieder document in `later` krijgt een gewenste scorepositie, ongeacht `reading_progress`. De CLI ruimt beheerde volgorde- en toplijsttags buiten `later` op.

## Harde veiligheidsregels

- Voer geen Readwise-schrijfactie uit vóór de gebruiker de volledige proefrun en exacte planhash expliciet heeft goedgekeurd.
- Gebruik voor volgorde- en toplijsttags uitsluitend `priority:plan`, `priority:apply` en `priority:verify` uit de canonieke repository.
- Een GitHub-build of `npm run build` mag nooit Reader-tags wijzigen.
- Behandel `data/score.js` niet als invoer: actuele Reader-documenten plus de getrackte overrideconfig zijn de bron.
- Vertrouw voor de eindstatus uitsluitend op `priority:verify`, dat Reader opnieuw ophaalt.

## Modus S: volledige synchronisatie of opschoning

1. Ga naar de canonieke repository en draai `npm test`.
2. Maak een proefrun:

```bash
npm run priority:plan -- --output .tmp/readwise/priority-plan.json
```

Voeg bij een expliciete volledige opschoning van uitgestroomde documenten `--cleanup-all` toe. Dit leest ook archive/feed/new en duurt daardoor aanzienlijk langer; gebruik het niet voor een gewone synchronisatie.

3. Toon vóór akkoord:
   - aantal geraakte documenten, toevoegingen, verwijderingen en totaaloperaties;
   - wijzigingen per reeks/toplijst;
   - eerste tien documenten met oude en nieuwe tags;
   - alle `light-reading`-migraties;
   - het planpad en de volledige bevestigingshash.
4. Wacht op expliciet akkoord voor exact deze hash. Een algemeen eerder akkoord of akkoord op een ander plan telt niet.
5. Pas het goedgekeurde plan toe. De CLI leest de scope uit het opgeslagen plan:

```bash
npm run priority:apply -- --plan .tmp/readwise/priority-plan.json --confirm <plan-hash>
```

6. Draai `npm run priority:verify` (met `-- --cleanup-all` na een volledige opschoning) en daarna `npm run build`. Meld aantallen en of gewenste en actuele posities exact gelijk zijn.

Bij gewijzigde brondata weigert `priority:apply` het plan. Maak dan een nieuwe proefrun en vraag opnieuw akkoord. Bij een onderbreking: bewaar het journal, maak een nieuwe proefrun en pas uitsluitend het resterende nieuwe plan toe.

## Modus A: document of onderwerp hoger/lager

Een handmatige voorkeur is altijd een scorecorrectie die in alle lijsten geldt. Verplaats nooit rechtstreeks één ordinale tag.

1. Match het document of onderwerp uitsluitend binnen `later`. Toon grensgevallen bij een onderwerpmatch.
2. Lees `config/readwise-priority-overrides.json`.
3. Gebruik bij een vaag verzoek standaard `+10` voor hoger of `-10` voor lager, cumulatief met de bestaande correctie. Een expliciete gehele correctie van de gebruiker gaat voor. Leg een niet-lege reden vast.
4. Maak een tijdelijke overrideconfig en genereer daarmee een proefrun via `priority:plan --overrides <tijdelijk-bestand>`. Toon per geraakt document basis-, oude eind- en nieuwe eindscore plus posities in alle toepasselijke lijsten.
5. Een exacte positie is alleen geldig wanneer een gehele correctie met eindscore 0–100 die positie werkelijk oplevert. Rapporteer anders de dichtst bereikbare positie en wijzig niets.
6. Na expliciet akkoord: werk de getrackte overrideconfig bij, pas exact het getoonde tagplan toe met zijn hash en verifieer volgens Modus S.

## Modus B: nieuwe documenten inpassen in leesvolgorde

Voor documenten die zojuist (bijv. via `readwise-triage` Fase I) naar `later` zijn verplaatst en nog geen ordinale positietag hebben. Uitsluitend positionering — geen scorecorrecties, geen toplijst-oordeel, geen tekstuele beoordeling.

1. Maak een proefrun over de volledige `later`-set (de CLI herberekent altijd alles voor consistentie):

```bash
npm run priority:plan -- --output .tmp/readwise/priority-plan.json
```

2. Filter het resultaat tot de operaties die de meegegeven document-ID's raken.
3. Toon de volledige proefrun en wacht altijd op expliciete goedkeuring voor exact de getoonde planhash. Ook een uitsluitend mechanische toewijzing krijgt geen stille uitzondering:

```bash
npm run priority:apply -- --plan .tmp/readwise/priority-plan.json --confirm <plan-hash>
```

Bevat het plan onverwachte operaties buiten de meegegeven ID's (bijv. omdat de brondata is gewijzigd sinds de laatste synchronisatie), maak dan eerst een nieuw plan en vraag opnieuw akkoord. De volledige onderhoudsketen en alle downstream-mutaties lopen via `readwise-priority-sync`.

4. Draai `npm run priority:verify`. Bij een afwijking: meld dit expliciet, herhaal niet automatisch.
5. Rapporteer compact: `↳ X nieuwe documenten ingepast — {titel} → {nieuwe tag}, ...`

## Modus L: luchtig-lidmaatschap

De scoring-engine bepaalt luchtig-lidmaatschap op basis van `light-reading` én een curated set lichte onderwerptags (`arts & culture`, `fiction`, `games`, `food & cooking`, `sports & recreation`, `entertainment & pop culture`) — beide tellen automatisch mee, geen handmatige actie nodig zolang een document een van deze tags al heeft. `light-reading` blijft het instrument voor handmatige correcties buiten deze onderwerptags om. `luchtig-nederlands` volgt automatisch uit luchtig-lidmaatschap plus de Readwise-property `language`, met expliciete `dutch`/`nederlands`/`nl`-tags als fallback. Gebruik geen tekstanalyse voor taal.

Toon toevoegen/verwijderen van `light-reading` apart en vraag akkoord. Genereer daarna een nieuw synchronisatieplan; een plan van vóór deze inhoudstagwijziging is ongeldig.

## Modus SC: scrum-lidmaatschap

De scoring-engine bepaalt scrum-lidmaatschap uitsluitend op basis van de tags `scrum` en `agile` — automatisch, geen handmatige actie nodig. Boeken/EPUB's blijven ook met deze tags strikt in de `boek`-reeks. Content-tagwijzigingen (`scrum`/`agile` toevoegen of verwijderen) verlopen via `readwise-enrich`/`readwise-triage`, niet via deze skill; genereer na zo'n wijziging een nieuw synchronisatieplan.

## Rapport

Rapporteer compact:

`Leesvolgorde gesynchroniseerd — {documenten} documenten, {toevoegingen} tags toegevoegd, {verwijderingen} tags verwijderd; live verificatie: volledig gelijk.`

Noem scorecorrecties met reden apart. Noem geweigerde of verouderde plannen expliciet en claim nooit synchronisatie zonder geslaagde live verificatie.
