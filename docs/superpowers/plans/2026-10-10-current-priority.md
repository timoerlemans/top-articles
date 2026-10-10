# Zelfstandige actuele leesprioriteit

Behoud de bestaande v8-interface en alle huidige output, inclusief foutgevallen.
Historische modellen blijven beschikbaar voor vergelijkingsrapporten.

1. Leg volledige exports, standalone scores en historische rapporten vast met vaste invoer/timestamps.
2. Verplaats gedeelde documentkennis naar priority-document.ts en membership naar priority-membership.ts; behoud historische herexports.
3. Bereken v8 rechtstreeks met voorbereid judgment/kerninteressebewijs, globale/topicregels en definitieve ranking.
4. Valideer v8 rechtstreeks op invarianten én bronherberekening zonder recursieve zelfvalidatie.
5. Test randgevallen en volledige downstream flows; corrigeer CONTEXT.md en architectuurdocumentatie; draai npm run check en onafhankelijke review.

Exact behouden: bonussen, rationale en property order, clippingmomenten, uiteenlopende leestijdregels, descriptor-tagafwijkingen, lege-bronnenvalidatie en historische rapporten.
Geen Reader-mutaties of databuild voor deze refactor.
