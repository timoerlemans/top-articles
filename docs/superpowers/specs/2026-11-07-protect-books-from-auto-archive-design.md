# Ontwerp: boeken beschermen tegen automatische archivering

## Intentie

Boeken/EPUB's mogen nooit door een automatische Readwise-route van `later` naar
`archive` worden verplaatst. Een expliciete handmatige opdracht van de gebruiker
mag zo'n move nog wel uitvoeren.

## Gekozen aanpak

De bescherming wordt op alle automatische toegangspunten afgedwongen:

1. `buildArchivePlan` markeert ieder boek als beschermd, onafhankelijk van
   toplijstlidmaatschap of `want-to-read`.
2. `applyArchivePlan` controleert vlak vóór de eerste move dat geen kandidaat een
   boek is. Daardoor blokkeren ook een oud of gemanipuleerd plan en een gewijzigde
   live metadata-set de automatische move.
3. De versioneerbare `readwise-triage`- en `readwise-inbox`-contracten beschrijven
   boeken expliciet als `later`-bestemming voor automatische routing, ook wanneer
   een Tier-1-signaal aanwezig is. De runtime archive-flow blijft de technische
   laatste verdedigingslinie.

## Doelen

- Geen automatische archiefkandidaat voor een boek/EPUB.
- Duidelijke regressietests voor planopbouw en uitvoeringsguard.
- Geen wijziging aan handmatige moves, archive-cleanup van tags, PDF-routing of
  de gegenereerde browserdata.

## Niet-doelen

- Bestaande boeken uit `archive` terugplaatsen.
- Handmatige Reader-opdrachten blokkeren.
- De definitie van `isBook` wijzigen; de bestaande classificatie blijft de bron
  van waarheid (`epub` of `book`/`books`-tag, met de bestaande PDF-uitzondering).

## Verificatie

- Archive-plan-test: een boek zonder top-100- of `want-to-read`-signaal is
  beschermd en geen kandidaat.
- Apply-test: een kandidaatset die een boek bevat wordt geweigerd vóór een
  Reader-move.
- Skill-contracttest: de automatische route documenteert boeken als beschermd.
- `npm run compile`, gerichte tests en `git diff --check`.
