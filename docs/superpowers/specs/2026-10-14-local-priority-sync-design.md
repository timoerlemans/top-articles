# Lokale priority-sync en algemene afvloeiing

## Doel

Issue #39 krijgt één lokale onderhoudsroute die de bestaande, bevestigde engines in vaste volgorde uitvoert: betrouwbare auteurstags controleren, actuele priority-tags synchroniseren, niet-beschermde Later-documenten archiveren, beheerde tags buiten Later opruimen en tenslotte de browserdata bouwen. Iedere schrijfstap blijft read-only tot de concrete wijzigingen en exacte planhash expliciet zijn bevestigd.

## Ontwerp

De route wordt een dunne orkestrator rond de bestaande interfaces. `createPrioritySync` blijft eigenaar van ranking, planhash, bronfingerprint, journal, bounded batches en live tagverificatie. `buildArchivePlan`/`applyArchivePlan` blijven eigenaar van bescherming en archivering. `buildArchiveCleanupPlan` blijft eigenaar van tagopruiming. De orchestrator mag alleen doorgaan na een geslaagde eindcontrole van de vorige stap.

De volledige actuele Later-snapshot wordt gedeeld tussen priority-sync en archive-planning. Bescherming is uitsluitend canonieke familie-top-100 of `want-to-read`; must-read, shortlist en afgeleide ontdeklijsten beschermen niet. Archive gebruikt dezelfde bestaande bron- en journalsemantiek, inclusief hervatting wanneer eerder afgeronde documenten niet meer in Later staan, zonder nieuwe wijzigingen te autoriseren.

Tagkennis krijgt één pure gedeelde volledigheidsseam. Een bulkvervanging is alleen toegestaan voor aantoonbaar volledige arrays/objectmaps; ontbrekende, null-, primitieve of deels opaque tagdata valt terug op bekende losse add/remove-operaties. Persoonlijke, curatoriale en opaque tags worden nooit verwijderd of vervangen. Priority-sync en cleanup gebruiken dezelfde seam; hun selectie- en transportadapters blijven apart.

Auteurstagging gebruikt de bestaande betrouwbare-auteurselectie en `want-to-read`-contract. Het toont een afzonderlijk plan met dezelfde expliciete bevestiging en maakt na toepassing een nieuwe actuele priority-snapshot. Build schrijft alleen de twee gegenereerde browserbestanden en nooit Reader.

## Fouten en rapportage

Elke stap rapporteert planpad/hash, concrete aantallen, writes, journal- en verificatiestatus. Een upstreamfout, source conflict, incomplete tagkennis zonder veilige operatie of mislukte live postconditie stopt de keten en verhindert downstream-writes en een finale succesclaim. De route is lokaal; remote dispatch blijft het aparte #40-issue.

## Testgrenzen

Tests bewijzen de tag-seam met volledige en incomplete representaties, gemengde batches, cleanup-behoud, author-plan-herberekening, archive-hervatting en upstream-gates. CLI-fixtures gebruiken geïnjecteerde Reader-grenzen; er wordt geen live onderhoudsrun uitgevoerd.
