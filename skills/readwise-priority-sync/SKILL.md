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

Start de remote keten uitsluitend wanneer de gebruiker daar expliciet om vraagt. Gewone inspectie,
`skills:check`, lokale planning of lokale skillruns dispatchen nooit een workflow. Dispatch alleen
de root-workflow; de overige workflows worden native gestart door een geslaagde `workflow_run`:
`priority-sync -> general archive -> archive cleanup -> refresh/publication`.

```bash
REQUEST_ID="manual-$(date -u +%Y%m%dT%H%M%SZ)-$$"
gh workflow run priority-sync.yml --ref main --field request_id="$REQUEST_ID"
ROOT_RUN_ID=$(until gh run list --workflow priority-sync.yml --event workflow_dispatch --branch main --limit 20 \
  --json databaseId,displayTitle,createdAt \
  --jq --arg id "$REQUEST_ID" 'map(select(.displayTitle | contains($id))) | sort_by(.createdAt) | last | .databaseId // empty' \
  | grep -E '^[0-9]+$'; do sleep 5; done)
gh run watch "$ROOT_RUN_ID" --exit-status
```

Volg daarna steeds de exacte child-run waarvan de `displayTitle` de vorige run-ID bevat; kies nooit
een willekeurige recente succesvolle run:

```bash
PARENT_RUN_ID="$ROOT_RUN_ID"
for WORKFLOW in archive-lees.yml archive-cleanup.yml refresh.yml; do
  CHILD_RUN_ID=$(until gh run list --workflow "$WORKFLOW" --event workflow_run --limit 50 \
    --json databaseId,displayTitle,createdAt \
    --jq --arg parent "$PARENT_RUN_ID" 'map(select(.displayTitle | contains($parent))) | sort_by(.createdAt) | last | .databaseId // empty' \
    | grep -E '^[0-9]+$'; do sleep 5; done)
  gh run watch "$CHILD_RUN_ID" --exit-status
  PARENT_RUN_ID="$CHILD_RUN_ID"
done
```

Download per run het artifact `readwise-maintenance-{root|archive|cleanup|refresh}-<run-id>`
en lees `maintenance-run.json`, het plan/journal en de run-URL. Rapporteer per stap run-ID,
link, status, gerelateerde parent-ID, gebruikte checkout-SHA en document-/operatieaantallen.
Een root-success met archive-, cleanup- of refresh-failure is gedeeltelijk succes; een queued,
in-progress of ontbrekende child blijft expliciet onvoltooid. Claim de gehele keten pas na een
geslaagde refresh/publicatie en controle van de actuele `data/data.js`/`data/score.js`-integriteit.
De workflowcontext-artifacts verwerken automatische repository-commits; een branch-tip of
willekeurige recente run is geen vervanging. De remote route gebruikt de automatische
planbevestiging binnen GitHub Actions en verleent geen impliciete lokale mutatie-autorisatie.

## Grenzen

- Deze skill wijzigt geen Reader-tags zonder een exacte bevestigde planhash.
- `npm run build` is geen tag-synchronisatie en schrijft geen Reader-tags.
- `readwise-reorder` is alleen voor handmatige reprioritering; nieuwe-documentpositionering verwijst er alleen expliciet naar.
- Behoud alle niet-beheerde Reader-tags en wijzig geen persoonlijke notities of feedback.
