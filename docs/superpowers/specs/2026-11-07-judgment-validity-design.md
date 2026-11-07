# Geldigheid van beoordelingen

Goedgekeurd: één geldigheidsbeleid met behoud van operationele scoring en legacy-ondersteuning.

Het bestaande module `priority-judgments.ts` krijgt één beslissingsinterface met expliciete context voor operationele scoring, beoordelingsevidence of volledige bronreview. Het bezit al validatie, fingerprints en fallbackkennis; deze verdieping vermijdt een extra module en cyclische imports. De bestaande routes blijven adapters voor hun eigen rapportage.

Alternatieven: overal volledige bronreview verplichten verandert rangschikking en vereist ontbrekende broncontext; alleen verspreide helpers toevoegen concentreert het beleid onvoldoende. Daarom concentreren we de beslissingen in het bestaande module.

Bewaar bestaande statusvolgorde, legacy fingerprints, optionele snapshotvelden en rubric-erfenis. Operationele scoring blijft een metadata-match gebruiken; evidencehergebruik vraagt de opgegeven snapshotcontext; volledige bronreview vraagt ook volledige actuele bronprovenance, medium/high en alle topics. Bronfouten veranderen operationele scores niet.

Toets door metadata, evidence, voorkeuren, rubric, topics en bron afzonderlijk te veranderen. Controleer adapters tegen dezelfde beslissing en behoud de bestaande exacte scorefixtures. Geen Reader-mutaties of nieuwe afhankelijkheden.
