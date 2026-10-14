---
name: readwise-priority-sync
description: Inspect, plan, apply, verify, and explicitly dispatch the canonical Readwise priority synchronization workflow.
---

# Readwise priority sync

Gebruik uitsluitend de actuele prioriteitsmotor uit de geldige `top-articles`-repository. Lees in de repository-checkout eerst [`../readwise-reference.md`](../readwise-reference.md); vanuit een geïnstalleerde kopie lees je `<repository>/skills/readwise-reference.md` nadat je de repository hebt gevonden via de huidige geldige worktree, `TOP_ARTICLES_REPO` of `/mnt/c/dev/top-articles`. Lees daarna de relevante README-secties. `priority:plan` herkent Eleanor Konik en Henrik Karlsson uitsluitend uit betrouwbare auteurmetadata en plant voor Later de idempotente `want-to-read`-tag; de v8-score kent geen aparte auteursbonus.

## Repository vinden

Gebruik in deze volgorde:

1. de huidige geldige worktree wanneer `package.json` de package `top-articles` bevat;
2. de map uit `TOP_ARTICLES_REPO`;
3. de gedocumenteerde standaardlocatie `/mnt/c/dev/top-articles`.

Stop met een concrete foutmelding wanneer geen repository met de priority-CLI bestaat. Kopieer scores of reeksregels nooit naar deze skill.

## Modi

### Inspecteren en plannen

Voer eerst de lokale verificatie uit:

```bash
npm run skills:check
npm test
npm run priority:plan -- --output .tmp/readwise/priority-plan.json
```

Toon aantallen, exacte oude/nieuwe tags, removals, additions, `sourceFingerprint` en `planHash`. Een plan is read-only en verandert geen Reader-tags.

### Lokale onderhoudsroute

Voor de volledige lokale onderhoudsketen gebruik je de gedeelde route. Deze route voert de
stappen altijd in deze volgorde uit: `authors -> priority -> archive -> cleanup -> build`.
Elke Reader-mutatiestap heeft een eigen exacte planhash; een bevestiging voor een eerdere of
andere bron geldt niet. De route archiveert alle niet-beschermde Later-documenten, waarbij alleen
canonieke familie-top-100-lidmaatschappen en de expliciete `want-to-read`-tag bescherming geven.
Consensus, Nieuw, Tijdloos, `must-read` en `shortlist` zijn geen archiefbescherming.

Maak eerst een read-only onderhoudsmanifest:

```bash
npm run readwise:priority-sync -- plan --output .tmp/readwise/maintenance-plan.json
```

Toon de vijf hashes en bevestig daarna alleen de hashes die je daadwerkelijk wilt uitvoeren:

```bash
npm run readwise:priority-sync -- apply \
  --plan .tmp/readwise/maintenance-plan.json \
  --confirm authors=<hash>,priority=<hash>,archive=<hash>,cleanup=<hash>
npm run readwise:priority-sync -- verify \
  --plan .tmp/readwise/maintenance-plan.json
```

De route controleert bronfingerprints opnieuw, gebruikt bestaande journals en bulk/fallback-
adapters, rapporteert elke stap afzonderlijk en stopt vóór downstream-stappen bij een fout.
Na een geslaagde auteurs-, prioriteits- of archiefmutatie worden de volgende stappen opnieuw
gepland; gebruik dan de nieuwe hash uit het onderhoudsrapport. `build` publiceert pas als alle
Reader-stappen live zijn geverifieerd. De rapportage staat standaard in
`.tmp/readwise/maintenance-report.json`. Gebruik `inspect` als alias voor `plan`.

### Toepassen en verifiëren

Wacht op expliciete goedkeuring voor precies de getoonde planhash. Pas alleen daarna toe:

```bash
PLAN_HASH=$(jq -r '.planHash' .tmp/readwise/priority-plan.json)
npm run priority:apply -- --plan .tmp/readwise/priority-plan.json --confirm "$PLAN_HASH"
npm run priority:verify
```

De apply-flow herberekent live vlak vóór uitvoering, gebruikt de source-fingerprint, hervat via het journal en verifieert opnieuw. Bij gewijzigde brondata maak je een nieuw plan; gebruik nooit een oude bevestiging. Controleer dat bulk alleen een volledige tagset krijgt. Bij onbekende tagkennis zijn losse bekende add/remove-operaties verplicht.

### Volledige cleanup

Gebruik `--cleanup-all` alleen op expliciet verzoek. De scope moet in plan, apply en verify gelijk blijven. De lokale onderhoudsroute coördineert de algemene archive- en cleanup-stappen; losse archive-plannen blijven afzonderlijk bevestigd.

### GitHub-workflow dispatch

Start de remote keten uitsluitend wanneer de gebruiker daar expliciet om vraagt:

```bash
gh workflow run priority-sync.yml
gh run list --workflow priority-sync.yml --limit 1
gh run watch <run-id> --exit-status
```

Controleer de uiteindelijke runstatus én de gepubliceerde commit. Een dispatch is niet hetzelfde als een lokale plan/apply/verify en een groene eerste stap bewijst de rest van de keten niet.

## Grenzen

- Deze skill wijzigt geen Reader-tags zonder een exacte bevestigde planhash.
- `npm run build` is geen tag-synchronisatie en schrijft geen Reader-tags.
- `readwise-reorder` is alleen voor handmatige reprioritering; nieuwe-documentpositionering verwijst er alleen expliciet naar.
- Behoud alle niet-beheerde Reader-tags en wijzig geen persoonlijke notities of feedback.
