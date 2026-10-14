# Leesprofielen beoordelen

Bereid heel Later voor met `npm run reading:profiles -- prepare --all-later --fetch-content`.
Inspecteer de snapshot en actuele batches in `.tmp/readwise/reading-profiles/`.
Bij gelijktijdige runs: geef iedere run een eigen `--evidence-dir <pad>` bij prepare,
validate en report. Zo blijven snapshot en beoordelingen aan dezelfde bronnen gekoppeld.
Bestaande actuele geaccepteerde/afgewezen profielen mogen behouden blijven; beoordeel
ontbrekende, verouderde en draft-profielen opnieuw. De voorbereider wijzigt Reader niet.

Per ID: `status`, `confidence`, `rubricVersion: reading-profile-v2`, de drie fingerprints
uit evidence, `judgedBy`, ISO `judgedAt`, `evidenceRefs`, korte eigen `reason`, optionele
`traits`. Accepteer alleen complete traits met medium/high confidence en concrete
brontekst of voldoende volledige inhoudelijke evidence. Ruwe tekst/feedback hoort niet
in config. Titel, tags, huidige rang of “Beste moment” alleen bewijzen geen toegankelijkheid.
Boeken/video of onleesbare/paywall-inhoud: rejected. Ontbrekende tekst/zekerheid: draft;
haal meer broninhoud op voordat je beslist.

- `effort`: 0 moeiteloos; 1 weinig concentratie; 2 aandacht nodig; 3 technisch/abstract;
  4 intensief bestuderen. Lengte is apart en bepaalt deze score niet automatisch.
- `emotionalWeight`: 0 neutraal/opgewekt; 1 mild reflectief; 2 merkbaar belastend;
  3 zwaar; 4 zeer confronterend. Een toegankelijk geschreven oorlogsstuk kan zwaar zijn.
- `tone`: rustig, speels, warm, reflectief, zakelijk of intens.
- Iedere `needFit`: ontspannen, afleiding, herkenning, verkennen, verdieping. 0 geen fit;
  1 zwak; 2 bruikbaar; 3 duidelijk; 4 bijzonder passend. Ontspannen betekent licht lezen,
  afleiding prettig iets anders, herkenning persoonlijke aansluiting, verkennen nieuwe
  perspectieven, verdieping inhoudelijk verder komen. Behoeften kunnen tegelijk passen.
- `activation`: 0 nauwelijks activerend; 1 zacht reflectief; 2 matig stimulerend;
  3 sterk activerend of uitnodigend tot langdurig probleemoplossen; 4 intens activerend.
  Beoordeel de tekst zelfstandig, los van lengte, inspanning, emotioneel gewicht,
  onderwerp en prioriteit. Dit is geen medische claim over slaap.
- `interruptibility`: 0 doorlopende aandacht nodig; 1 lastig hervatten; 2 hervatbaar
  met enige reconstructie; 3 gemakkelijk pauzeren en hervatten dankzij relatief
  zelfstandige delen; 4 bijzonder geschikt voor gefragmenteerd lezen. Een lang
  artikel kan goed onderbreekbaar zijn en een kort betoog juist niet.

Alle ratings zijn integers van 0 tot en met 4. Vul ontbrekende v2-scores nooit aan
uit oude profielen. Tijdens de volledige migratie blijft de veilige v1-publicatie
bruikbaar voor Zelf samenstellen; v1-profielen onderbouwen geen situatiegeschiktheid.
Pas nadat alle huidige Later-documenten een actuele v2-beoordeling hebben (inclusief
gemotiveerde drafts/rejections), publiceert de build het v2-menucontract.

Voor de complete v2-herbeoordeling: `npm run reading:profiles -- prepare --all-later
--fetch-content --migration --evidence-dir .tmp/readwise/reading-profile-v2-migration-2026-10-14`.
De gedateerde snapshot, het hashgebonden `manifest.json` en batches van maximaal 25
blijven lokaal. Alle ID's zijn stabiel gesorteerd; tickets benoemen uitsluitend het
batchnummer. Een rerun behoudt de snapshot en toewijzingen en controleert elk
batchbestand. Verander die bestanden niet tijdens de beoordeling; nieuwe Later-
documenten worden bij de uiteindelijke actualiteitscontrole zichtbaar en vragen
aanvullende evidence, zonder bestaande batches te herschikken.
Na volledige beoordeling én controle tegen actueel Later: voer `validate
--require-all-reviewed --activate-v2` uit met dezelfde evidence-dir. Dit schrijft
alleen de lokale configmarkering `activeRubric: reading-profile-v2`; Reader blijft
ongewijzigd. Na activering blijven toekomstige onbeoordeelde documenten uitgesloten
zonder het volledige menu terug te zetten naar het legacy-contract.

Lees de gebruikersvoorkeuren uit `config/readwise-reading-preferences.md`. Gebruik geen
prioriteitsposities, top-tags of curatiebonus als inhoudelijk bewijs. EvidenceRefs benoemen
bijvoorbeeld `content`, `notes`, `summary`; reason geeft de eigen inhoudelijke motivering.

Valideer met `npm run reading:profiles -- validate --require-all-reviewed` en inspecteer
`report`. Compleet beoordeeld omvat expliciete drafts/rejections, maar die zijn niet
bruikbaar voor menuvoorstellen. Publiceer alleen de objecten beoordeeld in deze run;
vergelijk beide configs per ID met de remote run-start baseline om gelijktijdige wijzigingen
te beschermen. Houd verrijkingscaches beschikbaar tot beide beoordelingen voltooid zijn.
