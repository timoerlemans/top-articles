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

### Toepassen en verifiëren

Wacht op expliciete goedkeuring voor precies de getoonde planhash. Pas alleen daarna toe:

```bash
PLAN_HASH=$(jq -r '.planHash' .tmp/readwise/priority-plan.json)
npm run priority:apply -- --plan .tmp/readwise/priority-plan.json --confirm "$PLAN_HASH"
npm run priority:verify
```

De apply-flow herberekent live vlak vóór uitvoering, gebruikt de source-fingerprint, hervat via het journal en verifieert opnieuw. Bij gewijzigde brondata maak je een nieuw plan; gebruik nooit een oude bevestiging. Controleer dat bulk alleen een volledige tagset krijgt. Bij onbekende tagkennis zijn losse bekende add/remove-operaties verplicht.

### Volledige cleanup

Gebruik `--cleanup-all` alleen op expliciet verzoek. De scope moet in plan, apply en verify gelijk blijven. Archive-plannen en de refresh-keten blijven afzonderlijke bevestigde stappen.

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
