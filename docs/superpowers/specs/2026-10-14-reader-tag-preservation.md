# Behoud van persoonlijke Reader-tags tijdens synchronisatie

## Problem Statement

De repository synchroniseert beheerde prioriteitstags van Reader-documenten en voert daarnaast een archive-cleanup uit. De bulkendpoint voor tagwijzigingen vervangt de volledige tagset van een document. Dat is alleen veilig wanneer de actuele volledige tagset bekend is.

De priority-sync heeft al een volledigheidscontrole en valt bij onbekende tagsets terug op losse add/remove-operaties. De archive-cleanup gebruikt echter nog een decoder die onleesbare of ontbrekende tagwaarden weglaat en kan de daardoor verkleinde set als volledige vervangingsset aanbieden. Daardoor kunnen persoonlijke Reader-tags of andere opaque tags verloren gaan. Dit is een toegelaten datastroomrisico, geen vastgesteld productie-incident, maar de uitvoering moet de invariant afdwingen voordat een mutatie naar Reader gaat.

## Solution

Maak de beoordeling of een actuele Reader-tagset volledig bekend is tot één pure gedeelde seam voor document-tagupdates. Een volledige tagset mag via de bulkroute worden uitgevoerd. Bij ontbrekende, onleesbare of anderszins incomplete tagkennis wordt geen volledige vervanging uitgevoerd; bekende managed removals en toevoegingen gaan via losse add/remove-operaties, zodat persoonlijke en opaque Reader-tags behouden blijven.

De bestaande gedeelde document-tag-executor blijft verantwoordelijk voor bulkuitvoering, fallback, retries, voortgang en het synchronisatiejournal. De priority-sync en archive-cleanup behouden hun eigen selectiebeleid, bevestigingsflow, bronfingerprint en verificatie. Alleen de tagbehoud-invariant wordt gedeeld.

## User Stories

1. Als eigenaar van Reader-documenten wil ik dat persoonlijke Reader-tags behouden blijven wanneer prioriteitstags worden gesynchroniseerd, zodat mijn eigen categorisering niet verdwijnt.
2. Als eigenaar van Reader-documenten wil ik dat persoonlijke Reader-tags behouden blijven wanneer archive-cleanup beheerde tags verwijdert, zodat opruimen alleen de bedoelde tags wijzigt.
3. Als gebruiker wil ik dat de bulkroute alleen wordt gebruikt wanneer de volledige actuele tagset betrouwbaar bekend is, zodat een bulkvervanging geen niet-ingelezen tags kan overschrijven.
4. Als gebruiker wil ik dat een ontbrekende `tags`-waarde als onbekende tagset wordt behandeld, zodat ontbrekende Reader-data niet als een lege tagset wordt geïnterpreteerd.
5. Als gebruiker wil ik dat `null` en primitieve tagrepresentaties als incomplete kennis gelden, zodat alleen aantoonbaar veilige data naar de bulkroute gaat.
6. Als gebruiker wil ik dat een array met één onleesbaar tagitem als geheel incomplete kennis geldt, zodat de overige leesbare items niet ten onrechte de volledige tagset representeren.
7. Als gebruiker wil ik dat een array met uitsluitend geldige strings of geldige `name`/`key`-objecten als volledig bekend geldt, zodat normale Reader-responses efficiënt via bulk kunnen worden uitgevoerd.
8. Als gebruiker wil ik dat een lege array of lege object-map als volledig bekende lege tagset geldt, zodat documenten zonder tags correct via bulk kunnen worden bijgewerkt.
9. Als gebruiker wil ik dat bekende managed priority-tags bij incomplete tagkennis nog steeds afzonderlijk kunnen worden verwijderd, zodat archive-cleanup niet onnodig stopt.
10. Als gebruiker wil ik dat toevoegingen bij incomplete tagkennis afzonderlijk worden uitgevoerd, zodat nieuwe prioriteitstags worden toegevoegd zonder onbekende tags te vervangen.
11. Als gebruiker wil ik dat een gemengde batch complete en incomplete documenten veilig verwerkt, zodat complete documenten bulk kunnen gebruiken en incomplete documenten automatisch fallback krijgen.
12. Als gebruiker wil ik dat een door Reader afgekeurde bulkmutatie per document terugvalt op losse operaties, zodat één afgekeurd document de overige veilige wijzigingen niet blokkeert.
13. Als gebruiker wil ik dat een onbereikbare bulkendpoint de rest van de run naar losse operaties laat terugvallen, zodat de synchronisatie haar veilige voortgang kan vervolgen.
14. Als gebruiker wil ik dat retries en het synchronisatiejournal dezelfde operationele betekenis behouden, zodat een onderbroken run hervatbaar blijft zonder geslaagde Reader-mutaties onnodig opnieuw uit te voeren.
15. Als gebruiker wil ik dat verificatie pas succesvol is nadat de actuele Reader-status geen resterende beheerde tagwijzigingen bevat, zodat een succesvolle mutatie niet ten onrechte als afgerond wordt gemarkeerd.
16. Als maintainer wil ik één gedeelde pure volledigheidsbeoordeling gebruiken in priority-sync en archive-cleanup, zodat de tagbehoud-invariant niet opnieuw in callers kan divergeren.
17. Als maintainer wil ik dat transportadapters caller-specifiek geïnjecteerd blijven, zodat de bestaande workflows hun eigen Reader-requester, presentatie en testfixtures behouden.
18. Als maintainer wil ik dat een bulkadapter faalt wanneer hij toch een incomplete tagset ontvangt, zodat toekomstig verkeerd gebruik fail-closed is en nooit stilzwijgend als lege volledige tagset wordt uitgevoerd.
19. Als maintainer wil ik dat bestaande synchronisatieplannen, bevestigingshashes, bronfingerprints en journals compatibel blijven, zodat bestaande operationele workflows niet opnieuw ontworpen hoeven te worden.
20. Als maintainer wil ik dat de wijziging geen generiek framework voor alle Reader-workflows introduceert, zodat de oplossing beperkt blijft tot het bewezen tagbehoudprobleem.

## Implementation Decisions

- De gedeelde seam is een pure beoordeling van actuele tagkennis die een volledige lijst met oorspronkelijke schrijfwijzen of een onbekend-resultaat oplevert.
- Een ontbrekende, `null`-achtige, primitieve of deels onleesbare tagrepresentatie is incomplete kennis.
- Een lege array en een lege object-map zijn volledig bekende lege tagsets.
- In een array zijn alleen strings en objecten met een niet-lege string in `name` of `key` leesbaar. Eén onleesbaar item maakt de hele array incompleet.
- Object-maps worden gelezen via hun tagkeys. De bestaande betekenis van geldige Reader-objectmaps blijft behouden.
- De pure volledigheidsbeoordeling wordt gedeeld door priority-sync en archive-cleanup naast de bestaande document-tagupdatebouw.
- De bestaande gedeelde executor blijft de hoogste uitvoeringsseam voor batchindeling, bulkmutaties, per-document fallback, retries, journaling en voortgang.
- Caller-specifieke mutation adapters blijven bestaan. Ze leveren alleen Reader-transport en output parsing aan de gedeelde executor.
- Een update met volledige tagkennis mag naar de bulkendpoint, die de volledige eindtagset ontvangt inclusief niet-beheerde tags.
- Een update met incomplete tagkennis mag niet naar de bulkendpoint. De bekende add/remove-operaties worden afzonderlijk uitgevoerd.
- De bulkadapters falen expliciet wanneer ze een update zonder volledige tagset ontvangen. Zij gebruiken nooit een lege array als veiligheidsfallback.
- Bekende managed priority-tagverwijderingen blijven toegestaan bij incomplete tagkennis; onbekende en persoonlijke tags worden niet geïnterpreteerd of verwijderd.
- De volledigheidsbeoordeling wordt toegepast op de live apply-snapshot vlak vóór mutatie, niet als nieuwe planvoorwaarde.
- Planselectie, bevestigingshash, source fingerprint, hervatting, verificatie en journal-schema veranderen niet.
- De bestaande operationele journalvelden blijven leidend; er komt geen apart persistent fallback-reason-schema.
- CLI-presentatie mag niet suggereren dat iedere wijziging via bulk wordt uitgevoerd, maar nieuwe persistente fallbackstatistieken vallen buiten scope.
- De wijziging introduceert geen nieuwe Reader-API, database, cachebeleid, archive-selectiebeleid of leesprofielbeleid.
- De bestaande ADR over vooraf beoordeelde leesprofielen blijft ongewijzigd en wordt niet door deze taguitvoeringswijziging heropend.

## Testing Decisions

- Tests beschermen extern gedrag en de veiligheid van de uitvoeringsseam; ze testen niet de exacte private decompositie van callers.
- De pure tagvolledigheidsbeoordeling wordt getest met ontbrekende waarden, `null`, primitieve waarden, lege arrays, lege object-maps, geldige string/object-arrays en arrays met opaque of lege items.
- De document-tagupdatebouw wordt getest op het verschil tussen een volledige eindtagset en `null` bij onbekende actuele tags.
- De priority-sync-regressietests blijven bewijzen dat persoonlijke tags behouden blijven en dat onbekende tagsets add/remove gebruiken.
- De archive-cleanup-workflow krijgt een subprocess-integratietest met een incomplete actuele tagresponse. Die test bewijst dat bekende managed tags worden verwijderd, dat persoonlijke en opaque tags behouden blijven en dat geen bulkvervanging wordt verstuurd.
- Een gemengde batchtest bewijst dat complete documenten bulk gebruiken terwijl incomplete documenten in dezelfde run via fallback worden uitgevoerd.
- Tests bewijzen dat de bulkadapter fail-closed is wanneer een incomplete update toch wordt aangeboden.
- Bestaande tests voor bulkafwijzing, onvolledige bulkrespons, endpointfouten, retries, journalherstel en live verificatie blijven ongewijzigd geldig.
- De relevante gerichte tests worden eerst uitgevoerd; daarna worden compile, lint, typecheck en de volledige testsuite via de bestaande projectcommando's uitgevoerd.

## Out of Scope

- Het wijzigen van de selectie of inhoud van archive-cleanup-plannen.
- Het wijzigen van prioriteitsscores, documentclassificatie, kerninteresses of prioriteitsreeks-lidmaatschap.
- Het wijzigen van planhashes, bronfingerprints, bevestigingsflows, journal-schema's of hervatsemantiek.
- Het samenvoegen van caller-specifieke Reader-transportadapters tot een generiek framework.
- Het vastleggen van nieuwe persistente fallbackstatistieken.
- Het repareren of normaliseren van de externe Reader-tagdata zelf.
- Het wijzigen van leesprofielen, leesmenu's, gelezenmarkeringen of de architectuurbeslissing uit ADR-0001.
- Het wijzigen van de gegenereerde browserdata of de GitHub Pages-publicatieflow.

## Further Notes

De safety-invariant is: een volledige tagset mag vervangen worden; een incomplete tagset mag alleen met expliciete losse add/remove-operaties worden bewerkt. De archive-cleanup blijft uitsluitend beheerde prioriteitstags opruimen. Een opaque tagwaarde is geen bewijs dat een tag verwijderd of vervangen mag worden.

De spec is bedoeld als implementatiecontract voor één beperkte wijziging. Na implementatie moeten de bestaande `priority-sync`- en archive-cleanup-workflows hun huidige plan/apply/verify-levensloop behouden, terwijl persoonlijke Reader-tags aantoonbaar niet meer door een onveilige volledige vervanging kunnen verdwijnen.
