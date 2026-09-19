# Ontwerp: prioritering van kerninteresses

## Status

Conversational design goedgekeurd in gesprek op 19 september 2026. Deze geschreven spec
moet nog worden gereviewd; de implementatie start pas nadat ook een afzonderlijk
uitvoeringsplan is goedgekeurd.

## Doel

De app moet twee verschillende vragen kunnen beantwoorden:

1. Welke van Timo's kerninteresses zijn het belangrijkst?
2. Hoeveel kerninteresses raakt een artikel, en hoe moet dat de artikelprioriteit beïnvloeden?

De bestaande inhoudelijke beoordeling blijft bestaan. De nieuwe kerninteressebijdrage wordt
zichtbaar en afzonderlijk van relevantie, substantie, duurzaamheid en bruikbaarheid berekend.

## Besloten uitgangspunten

- De bestaande canonieke kerninteresses blijven de hoofdcategorieën.
- De vaste handmatige top-3 is `Agile > ADHD > Filosofie`.
- De overige canonieke kerninteresses worden datagedreven gerangschikt.
- Fijnmazige semantische signalen, zoals `political philosophy`, `AI-ethics` en `teamcoaching`,
  worden als subonderwerpen aan hoofdcategorieën gekoppeld.
- Alle afzonderlijk bewezen kerninteresses stapelen in de score.
- Een combinatie van meerdere lager gerangschikte interesses mag één hoger gerangschikte interesse
  overtreffen.
- Een hoofdcategorie telt per artikel maximaal één keer.
- Eén ambigue bron of tag mag niet automatisch meerdere hoofdcategorieën opleveren. Twee
  hoofdcategorieën tellen alleen wanneer er afzonderlijke evidence voor beide is.
- Huidige Readwise-posities, ordinale/toplijsttags, highlight-aantallen en highlight-provenance
  zijn geen bewijs voor interesseprioriteit.
- De bestaande Readwise-volgorde- en toplijsttags blijven het enige synchronisatiedoel; er komen
  geen nieuwe interesseprioriteitstags in Readwise.

## Begrippenmodel

### Canonieke interesses

De bestaande `DirectDomain`-set blijft de bron voor hoofdcategorieën:

- AI & ethiek
- Filosofie
- Ideologie
- Geschiedenis
- Sociologie
- Schrijven
- Speculatieve fictie
- Cultuur, games & film
- PKM
- Zorg & ouderschap
- ADHD
- Agile

De interne IDs blijven stabiel. Presentatielabels blijven centraal gedefinieerd, zodat scoring,
browserdata en de dagelijkse kerninteresse-mail dezelfde naamgeving gebruiken.

### Evidence-eenheden

Een artikel krijgt per hoofdcategorie een verzameling gededupliceerde evidence-eenheden. Een
evidence-eenheid kan afkomstig zijn uit:

- een expliciete, niet-ambigue canonieke Readwise-inhoudstag;
- een geaccepteerde semantische interest-code uit de inhoudsbeoordeling;
- een afzonderlijk subonderwerp dat in een mapping expliciet aan de hoofdcategorie is gekoppeld.

Een bronwaarde wordt eerst genormaliseerd en daarna maximaal één keer gebruikt. Aliassen van
dezelfde tag leveren dus geen extra bijdrage. Een ambigue tag krijgt een expliciete primaire
mapping; een andere hoofdcategorie kan pas meetellen via een andere tag of een ander geaccepteerd
semantisch signaal. Deze regel voorkomt dat één `political philosophy`-tag zowel Filosofie als
Ideologie beloont.

De resolver levert per match niet alleen een boolean op, maar ook de leesbare evidence-referenties.
Die referenties worden in de app gebruikt om de score uit te leggen.

De mapping tussen canonieke domeinen, Readwise-tags en semantische reason-codes wordt expliciet,
versioneerd en getest vastgelegd in de prioriteitslaag. Een mappingwijziging is daarmee een
bewuste wijziging van het scoremodel, geen stilzwijgende wijziging in de browser.

## Rangschikking van kerninteresses

### Handmatige ankers

De prioriteitsconfiguratie bevat de vaste handmatige ankers:

Deze configuratie wordt opgeslagen als `config/readwise-core-interest-priorities.json`.

```json
{
  "version": 1,
  "manualOrder": ["agile", "adhd", "filosofie"]
}
```

De drie genoemde interesses worden uit de datagedreven restset verwijderd en behouden altijd hun
onderlinge volgorde.

### Datagedreven restvolgorde

De overige interesses worden gerangschikt met een onafhankelijke evidence-score. Die gebruikt:

1. unieke artikelen met afzonderlijke evidence voor het domein;
2. de semantische inhoudskwaliteit van die artikelen;
3. een beperkte dekkingsterm, zodat een domein met meer verschillende relevante artikelen zichtbaar
   blijft zonder dat alleen volume de rangorde bepaalt.

De inhoudskwaliteit wordt berekend uit de bestaande semantische ratings voor relevantie,
substantie, duurzaamheid en bruikbaarheid. De nieuwe interessebonus, huidige posities, curation-
signalen en highlight-volume worden uitgesloten om een cirkelredenering te voorkomen.

De uiteindelijke volgorde is:

1. de drie handmatige ankers in hun vaste volgorde;
2. de overige domeinen op evidence-score;
3. een stabiele domein-ID als laatste tie-breaker.

De rangorde en de onderliggende statistieken worden in `data/score.js` gepubliceerd, zodat de
browser kan uitleggen waarom een interesse hoog staat.

### Gewichten

De rangorde wordt omgezet in positieve, gehele gewichten. De gewichtentabel is versioneerd en
wordt niet impliciet uit de actuele artikelposities afgeleid. Het impactrapport toont de gebruikte
gewichten en de scoreverschuiving per artikel voordat de nieuwe versie wordt geactiveerd.

De eerste kandidaat-gewichtschaal wordt als configuratievoorstel gegenereerd. Activatie vereist
goedkeuring van het impactrapport; daarna wordt de gekozen tabel vastgelegd in de
prioriteitsconfiguratie. Zo blijft de keuze controleerbaar zonder de domeinrangschikking of de
artikeldata als verborgen configuratie te gebruiken.

## Nieuwe artikelscore

Voor een artikel met afzonderlijk bewezen kerninteresses wordt de nieuwe component berekend als:

```text
kerninteressebonus = som van het gewicht van iedere gematchte hoofdcategorie
```

Voorbeeld:

```text
Agile       +20
ADHD        +16
Filosofie   +12
----------------
Totaal      +48
```

Er is geen stapelplafond. Wel telt iedere hoofdcategorie slechts één keer en worden ambigue
evidence-eenheden volgens de afzonderlijke-evidence-regel behandeld.

De nieuwe component wordt toegevoegd aan de bestaande basisscore. Reeks-fitcorrecties blijven
per reeks werken zoals nu. Handmatige documentcorrecties blijven als aparte correctie gelden en
blijven in alle lijsten van toepassing.

Omdat het publieke scorecontract en de componenten veranderen, wordt dit een nieuwe
versioneerde prioriteitsmodelversie. De export bevat per document minimaal:

- `coreInterestBonus`;
- de gematchte hoofdcategorieën;
- per match het gewicht en de leesbare evidence-referenties;
- de gerangschikte kerninteresses met hun gewicht en evidence-statistieken.

## App-weergave

De prioriteitsweergave krijgt een eigen blok voor de kerninteresseprioriteit met:

- de volledige rangorde van hoofdcategorieën;
- gewicht per interesse;
- compacte evidence-statistieken;
- een korte uitleg dat de eerste drie handmatig zijn vastgelegd en de rest datagedreven is.

De score-uitklapper van een artikel toont een aparte component:

```text
Kerninteresses                         +48
Agile                                  +20
  Evidence: teamcoaching en scrum
ADHD                                   +16
  Evidence: ADHD & neurodivergentie
Filosofie                              +12
  Evidence: filosofie en politieke filosofie
```

De bestaande technische reason codes blijven verborgen. De uitleg gebruikt dezelfde Nederlandse
labels en evidence-mapping als de kerninteresse-ranglijst.

## Dagelijkse kerninteresse-mail

De bestaande willekeurige interessekeuze wordt vervangen door een gewogen keuze op basis van de
nieuwe kerninteresserangorde. Dit behoudt variatie, maar maakt de hoogste interesses vaker
zichtbaar. De artikelkeuze binnen een gekozen interesse blijft gebaseerd op de bestaande
prioriteit en positievoorwaarden.

## Impactrapport en uitrol

Voor activatie wordt een read-only rapport gemaakt dat ten minste toont:

- de volledige nieuwe kerninteresserangorde;
- handmatige versus datagedreven rangordedeelname;
- gekozen kandidaatgewichten;
- per reeks het aantal stijgers, dalers, nieuwe top-100-artikelen en uitstromers;
- scoreverschillen en kerninteressebijdragen voor de grootste verschuivingen;
- artikelen waarbij ambigue signalen vóór en na de afzonderlijke-evidence-regel anders worden
  behandeld.

De uitrol verloopt in deze volgorde:

1. read-only evidence- en impactrapport;
2. review en goedkeuring van de gewichtentabel;
3. implementatie van de nieuwe modelversie en tests;
4. opnieuw genereren van browserdata;
5. controle van de app en de dagelijkse mail;
6. nieuw `priority:plan` voor de bestaande Readwise-volgordetags;
7. expliciete synchronisatie en live verificatie van dat plan.

Een gewone build blijft Readwise-tags niet wijzigen. De bestaande geplande GitHub-synchronisatie
blijft de enige automatische tagmutatie nadat de nieuwe modelversie is gedeployed.

## Teststrategie

Er komen tests voor:

- stabiele canonieke mapping en Nederlandse labels;
- deduplicatie van aliassen en tags;
- afzonderlijke behandeling van ambigue tags;
- meerdere onafhankelijke matches binnen één artikel;
- stapeling over meerdere hoofdcategorieën;
- rangschikking met vaste handmatige top-3 en datagedreven restvolgorde;
- gewichtsberekening en scorecomponenten;
- v7-exportvalidatie en browsercontracten;
- impactrapporten en regressies in alle bestaande reeksen;
- gewogen kerninteressekeuze voor de dagelijkse mail.

De volledige verificatie blijft `npm run check`. Voor Readwise blijft `priority:verify` de bron
voor de live-eindstatus.
