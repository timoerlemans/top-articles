# Beoordeling `awesome-cli-apps` voor top-articles

Datum: 2026-10-15

## Vraag

Welke CLI-apps uit [awesome-cli-apps](https://raw.githubusercontent.com/agarrharr/awesome-cli-apps/refs/heads/master/readme.md) sluiten aan op de workflow van deze repository?

## Lokale workflow als beoordelingskader

De repository heeft al:

- een strict-TypeScript-project met `npm run compile`, `typecheck`, `lint` en `check`;
- een Readwise CLI-integratie voor ophalen, tag-plannen, expliciet toepassen en verifiëren;
- JSON-plannen, journals, evidence-snapshots en reports onder `.tmp/readwise/`;
- dagelijkse GitHub Actions-ketens voor priority-sync, archivering, cleanup en publiceren;
- statische GitHub Pages-publicatie met gegenereerde browserdata;
- een bestaande shell-/CI-conventie met `jq` voor JSON-inspectie en `set -euo pipefail` in workflows.

Bronnen: [AGENTS.md](../../AGENTS.md), [README.md](../../README.md), [package.json](../../package.json), [.github/workflows](../../.github/workflows).

## Shortlist

| Tool | Match | Advies | Waarom |
|---|---|---|---|
| `yq` | Hoog | Gebruiken als shell-/CI-hulpmiddel | De workflow bevat meerdere YAML-workflows; `yq` verwerkt YAML en kan ook JSON, XML, CSV, TOML en HCL lezen. Het is lokaal al geïnstalleerd. Gebruik het vooral voor read-only inspectie en assertions op `.github/workflows/*.yml`; laat structurele workflow-edits bij voorkeur door een code-review lopen. |
| `visidata` | Middel-hoog | Optioneel installeren voor handmatige analyse | Evidence- en reportbestanden zijn JSON/tabulaire data. VisiData is een terminal-spreadsheet voor data discovery/arrangement en kan handig zijn voor exploratie van grote snapshots, maar hoort niet in de geautomatiseerde build. De GPL-3.0-licentie en de interactieve aard maken dit een persoonlijke analystool, geen projectdependency. |
| `gh` | Middel-hoog | Blijven gebruiken als operationele CLI | De repo draait op GitHub Actions met chained workflow-runs en artifacts. `gh` biedt onder meer `run list/view/watch/download`, workflow-bediening en repo/PR-commando's. Dit is vooral nuttig voor diagnose van een mislukte maintenance-keten en artifact-downloads; niet voor automatische mutaties zonder expliciete bevestiging. Het is lokaal al geïnstalleerd. |
| `ast-grep` | Middel | Alleen bij structurele refactors | De frontend en scripts zijn TypeScript; `ast-grep` doet structurele code-search, linting en rewriting. Dat kan nuttig zijn bij brede API-/importrefactors, maar er is geen terugkerende lacune die installatie nu rechtvaardigt. |
| `pageres-cli` | Middel | Alleen voor een latere visual-regressionstap | De site is statisch en wordt op GitHub Pages gepubliceerd. Screenshots kunnen nuttig zijn voor handmatige responsive checks, maar zonder browser-baseline en diffbeleid creëert dit vooral nieuwe onderhoudslast. |

## Interessant maar niet aanbevelen voor deze repository

- `just`: een tweede command runner naast de al duidelijke `npm run`-interface zou de bron van waarheid verdubbelen. Alleen overwegen als npm-scripts later aantoonbaar te beperkt worden.
- `lazygit`, `tig` en `git-extras`: goede persoonlijke Git-ergonomie, maar geen verbetering van de Readwise- of publicatieketen. Omdat deze repo expliciete plan/apply/verify- en commit/push-grenzen gebruikt, moet een interactieve Git-laag die grenzen niet verbergen.
- `fzf`, `fd`, `bat`, `eza`, `zoxide`: prima shell-productiviteit en al deels aanwezig, maar geen repository-integratie nodig.
- `notesmd-cli`, `nb` en `rucola`: raken notities/Obsidian, niet de bron-van-waarheid in Readwise. Ze zouden naast de bestaande Obsidian-skills een tweede beheerpad introduceren.
- `serve`, `chokidar-cli` en `entr`: beperkt nut omdat de site direct geopend kan worden en TypeScript zelf al watch-functionaliteit heeft; een lokale server/watch-loop is geen huidige bottleneck.
- AI-agenttools uit de lijst zoals `agent-of-empires`, `agent-deck`, `greywall` en `toktrack`: niet passend als projectdependency; de huidige Codex-/skills-/worktreeworkflow levert al de agentcoördinatie en guardrails.

## Conclusie

Er is geen tool uit de lijst die nu als npm-dependency of nieuw projectcommando moet worden toegevoegd.

De beste directe opbrengst is:

1. `yq` behouden als lokale/CI-inspectietool voor GitHub Actions-YAML; niet naast `jq` vervangen, want `jq` blijft de juiste tool voor de JSON-plannen, journals en summaries.
2. `gh` gebruiken voor operationele observatie van workflow-runs, artifacts en eventueel PR’s.
3. `visidata` alleen installeren als handmatige analyse van grote Readwise-evidencebestanden terugkerend wordt.
4. `ast-grep` bewaren voor een concrete structurele TypeScript-refactor.

De lijst levert dus vooral losse hulpmiddelen op, geen ontbrekende bouwsteen voor de kernflow. De grootste waarde zit in het combineren van bestaande tools met de huidige read-only plan-, hash-confirmatie- en verify-contracten.

## Primaire bronnen voor de kandidaten

- [awesome-cli-apps catalogus](https://raw.githubusercontent.com/agarrharr/awesome-cli-apps/refs/heads/master/readme.md)
- [`yq` officiële repository/documentatie](https://github.com/mikefarah/yq)
- [VisiData officiële repository](https://github.com/saulpw/visidata)
- [GitHub CLI officiële manual](https://cli.github.com/manual/)
- [`ast-grep` officiële repository](https://github.com/ast-grep/ast-grep)
- [`pageres-cli` officiële repository](https://github.com/sindresorhus/pageres-cli)
- [`just` officiële repository](https://github.com/casey/just)
- [`notesmd-cli` officiële repository](https://github.com/Yakitrak/notesmd-cli)

## Tweede lijst: `the-book-of-secret-knowledge`

Deze lijst is veel breder: naast CLI-tools bevat hij manuals, webtools, security- en
networkingmateriaal. De beste aanvullingen voor deze repository zijn:

| Tool | Match | Advies | Waarom |
|---|---|---|---|
| `ShellCheck` | Hoog | Persoonlijk gebruiken; later eventueel CI | De GitHub Actions bevatten veel inline Bash met `set -euo pipefail`, `jq`, loops en retrylogica. ShellCheck is statische analyse voor Bash/sh en kan in build/test-suites met exitcodes worden opgenomen. Inline YAML-blokken moeten daarvoor wel eerst apart geëxtraheerd worden; voeg daarom niet blind een globale check toe. Het staat lokaal al geïnstalleerd. |
| `Hurl` | Middel-hoog | Leuke kandidaat voor expliciete HTTP-contracttests | Hurl beschrijft HTTP-requests en assertions in tekstbestanden en ondersteunt chaining, captures en JSON. Dat zou later kunnen testen dat de gepubliceerde Pages-site, PWA-assets en eventueel een veilige publieke health-endpoint correct reageren. Voor Readwise- of Resend-API’s mogen geen tokens in fixtures terechtkomen. |
| `Lighthouse` | Middel-hoog | Periodiek/CI, niet bij elke `npm run check` | De site is statisch en Lighthouse rapporteert performance en web best practices via een Node CLI. Dit past bij een aparte publicatie- of maandelijkse performancecheck; het is te zwaar en netwerkafhankelijk voor de snelle lokale TypeScript-check. Het overlapt bovendien met onze bestaande web-perf-capaciteit. |
| `htrace.sh` | Middel | Handmatig bij netwerkproblemen | Een HTTP/HTTPS-troubleshooting-wrapper kan helpen bij diagnose van GitHub Pages-, Readwise- of Resend-connectiviteit. De installatie gebruikt extra security/network-tools en kan systeembestanden wijzigen, dus niet als projectdependency of CI-stap opnemen. |
| `Trivy` | Laag-middel | Alleen bij een expliciete security-gate | Trivy scant repositories, dependencies, secrets en misconfigurations, maar deze repo heeft geen containers of infrastructuurlaag. Een latere read-only filesystem-scan kan nuttig zijn, mits `.tmp` en lokale secrets zorgvuldig uitgesloten worden. |

De lijst bevat ook goede naslagwerken: ShellCheck-documentatie, Lighthouse, HTTP/TLS-kennis en
de security-/networkinghoofdstukken zijn waarschijnlijk waardevoller dan het installeren van de
meeste genoemde tools. De massascanners, privilege-escalatietools en packet-injectiontools zijn
geen onderdeel van onze normale workflow en horen niet in deze repository.

Bronnen: [de volledige lijst](https://raw.githubusercontent.com/trimstray/the-book-of-secret-knowledge/refs/heads/master/README.md),
[ShellCheck](https://github.com/koalaman/shellcheck), [Hurl](https://hurl.dev/),
[Lighthouse](https://github.com/GoogleChrome/lighthouse), [htrace.sh](https://github.com/trimstray/htrace.sh)
en [Trivy](https://github.com/aquasecurity/trivy).
