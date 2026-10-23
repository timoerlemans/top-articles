# Readwise-leesprioriteit

Persoonlijke leesprioriteit, toplijsten en leesmenu's voor documenten in Readwise Reader.

## Taal

**Reader-document**:
Een opgeslagen leesbron in Readwise Reader, zoals een artikel, boek, PDF of video.
Een Reader-document heeft een eigen identiteit, ongeacht de lijsten waarin het voorkomt.

**Kort**:
Een leesstuk met een leestijd van minder dan vijf minuten.

**Luchtig**:
Een leesstuk dat als ontspannen wordt ervaren door de combinatie van onderwerp,
gemakkelijke leesbaarheid en geringe emotionele zwaarte.

**Leesmenu**:
Een aanbod van één, twee of drie passende gangen uit artikelen, nieuwsbrieven en
leesbare PDF's in Later. Een ontbrekende gang wordt overgeslagen; iedere gang
behoudt haar eigen betekenis en één gang kan een complete leessessie zijn.
De gangen passen bij hetzelfde leesmoment en hoeven niet hetzelfde onderwerp te hebben.
Onder de gangen staan maximaal 25 overige kandidaten uit dezelfde actuele v2-profielpool.
Deze aanvullende lijst mag per situatie maximaal één niveau ruimer zijn voor inspanning,
emotioneel gewicht, activering en onderbreekbaarheid, maar gebruikt geen onbeoordeelde
catalogusitems als fallback.

**Voorgerecht**:
Een kort, luchtig leesstuk dat helpt om aan een leessessie te beginnen.

**Hoofdgerecht**:
Een leesstuk voor verdere verkenning of verdieping, passend bij de beschikbare
leesenergie. Een hoofdgerecht hoeft geen zwaar leeswerk te zijn.

**Nagerecht**:
Een kort, toegankelijk leesstuk om een leessessie prettig af te ronden.

**Leesmoment**:
De combinatie van situatie, stemming, leesenergie, leesbehoefte en leesbudget
bij het kiezen van een leesstuk.

**Situatie**:
De herkenbare omstandigheid waarin iemand leest, zoals in bed voor het slapen.
Zij bepaalt inhoudelijke geschiktheid naast de zelf gekozen instellingen;
Zelf samenstellen betekent lezen zonder extra situatie-eisen.

**Stemming**:
De emotionele toestand tijdens een leesmoment. Eenzelfde stemming kan samengaan
met verschillende leesbehoeften.

**Leesbehoefte**:
De gewenste ervaring tijdens het lezen, zoals ontspanning, afleiding, herkenning,
nieuwsgierig verkennen of verdieping.

**Leesenergie**:
De beschikbare mentale energie voor concentratie en inspanning tijdens het lezen.

**Leesbudget**:
De totale tijd die iemand voor een leessessie beschikbaar heeft of wil investeren.
Nieuwe voorstellen passen binnen de tijd die na bevestigde leesvoortgang nog over is.
Bij een latere budgetverlaging blijft eerder bevestigde leestijd behouden, ook als
die het nieuwe budget overschrijdt. Zolang er geen tijd over is, volgen geen nieuwe gangen.

**Leesvoortgang**:
De gangen die de lezer tijdens een leessessie zelf als gelezen heeft bevestigd.
Een leesstuk openen of om een ander voorstel vragen is geen leesvoortgang.

**Gelezenmarkering**:
De vastlegging dat de lezer een leesstuk als gelezen heeft bevestigd, ook buiten
de oorspronkelijke leessessie. Na archivering kan deze markering vervallen.

**Leesprofiel**:
Een inhoudelijke inschatting van de benodigde concentratie, emotionele zwaarte,
toon en passende leesbehoeften van een leesstuk.

**Wisselverzoek**:
De wens om tijdens het huidige leesmoment een ander voorstel te krijgen.
Een wisselverzoek is geen oordeel over de blijvende leeswaarde van een leesstuk.

**Locatie**:
De plek van een Reader-document binnen Reader, zoals `later` of `archive`.
Een locatie is iets anders dan een tag of een prioriteitsreeks.

**Later**:
De Reader-bewaarlijst voor later lezen. De persoonlijke prioriteitsreeksen en
toplijsten worden bepaald over de Reader-documenten in deze locatie.

**Archive**:
De verzameling gearchiveerde Reader-documenten. Archiveren zegt op zichzelf niets
over de waardering van een document of over het volledig uitlezen ervan.

**Leesprioriteit**:
De persoonlijke waarde van het lezen van een Reader-document. De algemene
leesprioriteit geldt over onderwerpen heen.

**Prioriteitsreeks**:
Een geordende selectie van Reader-documenten op basis van onderwerp, formaat,
taal of leestijd. Een document kan in meerdere reeksen voorkomen; boeken horen
uitsluitend in de boek-reeks.

**Reeksscore**:
De leesprioriteit van een Reader-document binnen een specifieke prioriteitsreeks.
Bij een onderwerpgerichte reeks vervangt de relevantie voor dat onderwerp de
algemene relevantie.

**Kerninteresse**:
Een persoonlijk interessegebied waarvoor inhoudelijk bewijs de leesprioriteit
van een Reader-document verhoogt. Meerdere onafhankelijk onderbouwde
kerninteresses kunnen tegelijk bijdragen.

**Beoordelingsevidence**:
Het geselecteerde bronmateriaal en de herkomstgegevens voor een inhoudelijke
beoordeling van een Reader-document, waaronder titel, samenvatting, inhoudelijke
notities en highlights. Persoonlijke leesfeedback staat hiervan apart.

**Beoordelingsbatch**:
Een groep Reader-documenten met hun beoordelingsevidence, de geldende leesvoorkeuren
en beoordelingsinstructies, bestemd voor een semantische beoordeling.

**Prioriteitstags**:
De beheerde Reader-tags die posities en toplijstlidmaatschap van een document weergeven,
plus de tag voor luchtig lezen. Synchronisatie bewaart overige Reader-tags.

**Synchronisatieplan**:
Een proefrun met de benodigde prioriteitstagwijzigingen en een bevestigingshash.
Het plan legt vast op welke documentgegevens en score-invoer de wijzigingen berusten.

**Synchronisatiejournal**:
Het voortgangsregister van een bevestigd synchronisatieplan. Het bewaart uitgevoerde
tagoperaties en fouten, zodat een onderbroken run hervat kan worden. Succes betekent
dat een actuele controle geen resterende tagwijzigingen vindt.
