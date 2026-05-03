# MANIFEST.md

## Formaal

Prosjektet skal etablere et bakgrunnskorpus for mellomkrigstida og bruke dette til a sammenligne to delkorpus, `pol1` og `pol5`, med ordstatistiske maal for typiskhet og spredning.
Sluttfasen er en app der brukeren selv kan vekte `RN` mot prosentandelen dokumenter ordet forekommer i.

## Hovedoppgave

Foerste milepael er a hente ut omtrent 2800 URN-er fra Nettbiblioteket. Disse URN-ene skal danne grunnlag for et bakgrunnskorpus. Primart onske er et korpus for skjonnlitteratur. Hvis det ikke lar seg gjore pa en god mate, velges et annet relevant bakgrunnskorpus og dette dokumenteres eksplisitt.

## Delkorpus

- `pol1`: definisjon kommer fra prosjektets faglige avgrensning
- `pol5`: definisjon kommer fra prosjektets faglige avgrensning

Begge delkorpus ma dokumenteres med:

- hvilke dokumenter som inngar
- hvilke kriterier som er brukt
- storrelse i dokumenter og tokens
- eventuell filtrering eller normalisering

## Analysemodell

Analysen skal rangere ord etter minst to dimensjoner:

1. Typiskhet:
   maal med `PMI`. `RN` forstas her som samme forhold uten logaritmen, altsa `PMI` i ulogget form.
2. Spredning:
   ordet ma forekomme i en stor nok andel av dokumentene i delkorpuset, for eksempel minst 70 %.

`RN` brukes her som et maal pa distinktivitet mellom delkorpus og bakgrunnskorpus. For at et ord ogsa skal regnes som typisk, ma det i tillegg ha hoy dokumentspredning innen delkorpuset. Dette skal hindre at hoy score drives av ord som bare forekommer i noen fa dokumenter.

## Metodisk motivasjon

Utgangspunktet er at et ord eller en frase kan ha hoy `RN`-score uten a vaere typisk i sterk forstand. Hoy score kan skyldes at uttrykket er skjevt fordelt, selv om det bare finnes i et faall tekster. I dette prosjektet forstas derfor typiskhet som en kombinasjon av:

- distinktivitet mellom delkorpus og bakgrunnskorpus
- bred spredning innen delkorpuset

Dette bygger pa erfaring fra tidligere arbeid med forskjeller mellom kvinne- og mannslitteratur: begge korpus kunne skrive om mye av det samme, men de mest typiske ordene pekte mot ulike semantiske tyngdepunkter. En mulig oppsummering var at "kvinnen er heimen" og "mannen er staten", i den forstand at kvinnelitteraturen i stoerre grad fikk typiske ord knyttet til hjem og familie, mens mannslitteraturen fikk typiske ord knyttet til politikk, stat og internasjonale forhold.

## Appmaal

Appen skal la brukeren:

- justere vekten mellom `RN` og dokumentspredning
- sette terskel for hvor stor andel av dokumentene et ord ma forekomme i
- se hvilke ord som er mest typiske for `pol1` og `pol5` under ulike vekter
- sammenligne resultater uten a matte rekjore hele analyseprosessen manuelt

## Praktiske prinsipper

- Alle datasett og mellomresultater skal kunne regenereres.
- Kode for innhenting, korpusbygging og analyse holdes separert.
- Valg av terskler, filtrering og normalisering skal dokumenteres.
- Resultater skal kunne spores tilbake til URN-lister og korpusdefinisjoner.

## Referanser

- Church, Kenneth Ward og Patrick Hanks. 1990. "Word Association Norms, Mutual Information, and Lexicography." Computational Linguistics 16(1): 22-29.
- Gries, Stefan Th. 2008. "Dispersions and adjusted frequencies in corpora." International Journal of Corpus Linguistics 13(4): 403-437.
- Uri, Helene. 2024. Jeg naken drakk. Oslo: Gyldendal.

## Naermeste neste steg

1. Lage eller hente en forste URN-liste.
2. Definere format for lagring av URN-er og metadata.
3. Avklare hvordan `pol1` og `pol5` skal bygges.
4. Implementere en forste analysepipeline for ordfrekvens, PMI og spredning.
5. Forberede resultatformat som senere kan brukes direkte i appen.
