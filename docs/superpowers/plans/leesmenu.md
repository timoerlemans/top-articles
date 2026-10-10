# Implementatieplan leesmenu

Bron: ../specs/leesmenu.md en ../../adr/0001-vooraf-beoordeelde-leesprofielen.md.

1. Voeg gedeelde actuele leestijdpolicy toe, behoud historische adapters en test grenswaarden.
2. Bouw versiecontract, private fingerprints/evidence en reading:profiles prepare/validate/report. Publiceer uitsluitend actuele geaccepteerde profielen via readingMenu in TOP_ARTICLES.
3. Bouw pure deterministische menuplanner, sessietransities en gevalideerde lokale opslag. Test budget, vervanging, lezen, hervatten en veilige pruning.
4. Maak leesmenu de standaardroute met toegankelijk formulier en gangacties; behoud lijstfilters/deeplinks. Voeg offline runtimebestanden toe.
5. Integreer profielbeoordeling en cachelevensduur in readwise-inbox/priority-judge. Beoordeel huidige Later-documenten inhoudelijk, zonder triage of Reader-wijzigingen.
6. Genereer publieke data via npm run build, voer npm run check uit en controleer browser/offline gedrag. Laat een verse reviewer de implementatie beoordelen en verwerk bevindingen.

Acceptatie: kort <5; geen ontbrekende-evidence fallback; budget wordt nooit overschreden; openen is geen lezen; lezen en tijdelijk wisselen zijn afzonderlijke acties; verdwijnen uit Later ruimt uitsluitend op bij een nieuwere volledige consistente dataset.
