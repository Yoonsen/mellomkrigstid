# Mellomkrigstid

Dette prosjektet bygger et bakgrunnskorpus for mellomkrigstida og sammenligner to delkorpus, `pol1` og `pol5`, for a finne hvilke ord som er mest typiske for det ene og det andre.

Foerste milepael er a hente ut omtrent 2800 URN-er fra Nettbiblioteket. Disse skal brukes til a bygge et bakgrunnskorpus, helst for skjonnlitteratur. Hvis det ikke lar seg gjore pa en god mate, velges et annet relevant bakgrunnskorpus og dette dokumenteres.

## Metode

Prosjektet skiller mellom:

- `RN`: et maal pa distinktivitet mellom delkorpus og bakgrunnskorpus
- dokumentspredning: hvor stor andel av dokumentene i delkorpuset et ord forekommer i

I dette prosjektet forstas typiskhet som en kombinasjon av disse to. Et ord er ikke typisk bare fordi det har hoy `RN`, men fordi det bade skiller seg ut og er bredt fordelt i delkorpuset.

Vi bruker `PMI` som log-transformert versjon av samme forhold, og `RN` som den uloggede varianten. Som arbeidsregel skal et ord forekomme i minst 70 % av dokumentene i et delkorpus for a regnes som stabilt nok til videre analyse.

## Hvorfor dette er nyttig

Et ord eller en frase kan ha hoy forskjellsskare uten a vaere typisk i sterk forstand. Hoye scorer kan drives av noen fa tekster. Ved a kombinere forskjell og spredning far vi et maal som ligger naermere det vi faktisk er ute etter: ord som er karakteristiske for et delkorpus som helhet.

Denne tankegangen bygger ogsa pa tidligere erfaringer fra sammenligning av kvinne- og mannslitteratur, der begge korpus skrev om mye av det samme, men der de mest typiske ordene samlet seg rundt ulike semantiske tyngdepunkter, for eksempel hjem og familie pa den ene siden og politikk, stat og internasjonale forhold pa den andre.

## Sluttmaal

Maalet er a lage en app der brukeren kan:

- vekte `RN` mot dokumentspredning
- velge terskel for hvor stor andel av dokumentene et ord ma forekomme i
- se hvilke ord som blir mest typiske for `pol1` og `pol5` under ulike vekter

## Naermeste neste steg

- hente eller lage en forste URN-liste
- definere hvordan URN-er og metadata skal lagres
- avklare hvordan `pol1` og `pol5` skal bygges
- implementere en forste analysepipeline

## Referanser

- Church, Kenneth Ward og Patrick Hanks. 1990. "Word Association Norms, Mutual Information, and Lexicography." Computational Linguistics 16(1): 22-29.
- Gries, Stefan Th. 2008. "Dispersions and adjusted frequencies in corpora." International Journal of Corpus Linguistics 13(4): 403-437.
- Uri, Helene. 2024. Jeg naken drakk. Oslo: Gyldendal.
