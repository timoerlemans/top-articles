# Leesprofielen beoordelen

Bereid heel Later voor met `npm run reading:profiles -- prepare --all-later --fetch-content`.
Inspecteer de snapshot en actuele batches in `.tmp/readwise/reading-profiles/`.
Bij gelijktijdige runs: geef iedere run een eigen `--evidence-dir <pad>` bij prepare,
validate en report. Zo blijven snapshot en beoordelingen aan dezelfde bronnen gekoppeld.
Bestaande actuele geaccepteerde/afgewezen profielen mogen behouden blijven; beoordeel
ontbrekende, verouderde en draft-profielen opnieuw. De voorbereider wijzigt Reader niet.

Per ID: `status`, `confidence`, `rubricVersion: reading-profile-v1`, de drie fingerprints
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

Lees de gebruikersvoorkeuren uit `config/readwise-reading-preferences.md`. Gebruik geen
prioriteitsposities, top-tags of curatiebonus als inhoudelijk bewijs. EvidenceRefs benoemen
bijvoorbeeld `content`, `notes`, `summary`; reason geeft de eigen inhoudelijke motivering.

Valideer met `npm run reading:profiles -- validate --require-all-reviewed` en inspecteer
`report`. Compleet beoordeeld omvat expliciete drafts/rejections, maar die zijn niet
bruikbaar voor menuvoorstellen. Publiceer alleen de objecten beoordeeld in deze run;
vergelijk beide configs per ID met de remote run-start baseline om gelijktijdige wijzigingen
te beschermen. Houd verrijkingscaches beschikbaar tot beide beoordelingen voltooid zijn.
