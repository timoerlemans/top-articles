---
name: readwise-reorder
description: Use for explicit manual Readwise priority corrections when a document or topic should rank higher or lower.
---

# Readwise Reorder

## Scope in the current repository

Read [`../readwise-reference.md`](../readwise-reference.md) in the repository checkout. When installed separately, locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or `/mnt/c/dev/top-articles`, then read `<repository>/skills/readwise-reference.md`; do not assume the relative link exists. This skill is limited to an explicit manual score correction. Full priority synchronization, cleanup, new-document positioning, and remote workflow dispatch belong to `readwise-priority-sync`; do not duplicate or reimplement their score/tag logic here.

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

Raak geen andere tags of metadata aan. Deze skill schrijft geen directe positie-, toplijst- of
inhoudstags; de canonieke priority-engine voert de berekende gevolgen van de override uit.

## Harde veiligheidsregels

- Voer geen Readwise-schrijfactie uit vóór de gebruiker de volledige proefrun en exacte planhash expliciet heeft goedgekeurd.
- Gebruik voor de gevolgen van een override uitsluitend `priority:plan`, `priority:apply` en
  `priority:verify` uit de canonieke repository.
- Een GitHub-build of `npm run build` mag nooit Reader-tags wijzigen.
- Behandel `data/score.js` niet als invoer: actuele Reader-documenten plus de getrackte overrideconfig zijn de bron.
- Vertrouw voor de eindstatus uitsluitend op `priority:verify`, dat Reader opnieuw ophaalt.

## Modus: document of onderwerp hoger/lager

Een handmatige voorkeur is altijd een scorecorrectie die in alle lijsten geldt. Verplaats nooit rechtstreeks één ordinale tag.

1. Match het document of onderwerp uitsluitend binnen `later`. Toon grensgevallen bij een onderwerpmatch.
2. Lees `config/readwise-priority-overrides.json`.
3. Gebruik bij een vaag verzoek standaard `+10` voor hoger of `-10` voor lager, cumulatief met de bestaande correctie. Een expliciete gehele correctie van de gebruiker gaat voor. Leg een niet-lege reden vast.
4. Maak een tijdelijke overrideconfig en genereer daarmee een proefrun via `priority:plan --overrides <tijdelijk-bestand>`. Toon per geraakt document basis-, oude eind- en nieuwe eindscore plus posities in alle toepasselijke lijsten.
5. Een exacte positie is alleen geldig wanneer een gehele correctie met eindscore 0–100 die positie werkelijk oplevert. Rapporteer anders de dichtst bereikbare positie en wijzig niets.
6. Na expliciet akkoord: werk de getrackte overrideconfig bij, pas exact het getoonde plan toe
   met zijn hash en draai `priority:verify`. Er is geen stille uitzondering voor de mechanische
   herpositionering; meld een upstream- of verificatiefout expliciet.

## Andere verzoeken

Nieuwe documenten positioneren, volledige synchronisatie, cleanup, inhoudelijk lidmaatschap en
remote dispatch horen niet bij deze skill. Verwijs voor positionering en de volledige lokale
keten naar `readwise-priority-sync`; content-tagging hoort bij de verrijkings- of triageskill.

## Rapport

Rapporteer compact:

`Prioriteitscorrectie toegepast — {documenten} documenten, {toevoegingen} tags toegevoegd, {verwijderingen} tags verwijderd; live verificatie: volledig gelijk.`

Noem scorecorrecties met reden apart. Noem geweigerde of verouderde plannen expliciet en claim nooit synchronisatie zonder geslaagde live verificatie.
