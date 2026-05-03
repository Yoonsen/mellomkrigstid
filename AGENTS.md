# AGENTS.md

Dette repoet brukes til å bygge et bakgrunnskorpus og analysere forskjeller mellom delkorpus fra mellomkrigstida.

## Prosjektmål

1. Hente ut omtrent 2800 URN-er fra Nettbiblioteket.
2. Bruke URN-ene til å bygge et bakgrunnskorpus, helst for skjonnlitteratur.
3. Sammenligne to delkorpus, `pol1` og `pol5`.
4. Finne ord som er typiske for det ene eller det andre delkorpuset.
5. Lage en app der brukeren kan vekte `RN` opp mot andelen dokumenter et ord forekommer i.

## Analytisk retning

- Typiskhet skal beregnes med `PMI`.
- `RN` brukes som samme forhold uten logaritmen, det vil si `PMI` i ulogget form.
- Ord skal ikke bare vaere typiske, men ogsa ha tilstrekkelig spredning i delkorpuset.
- Som arbeidsregel skal et ord forekomme i minst 70 % av dokumentene i et delkorpus for a regnes som stabilt/representativt.
- Sluttproduktet skal kunne eksponere bade `RN` og dokumentprosent som justerbare vekter for brukeren.

## Arbeidsprinsipper

- Start enkelt og dokumenter alle antakelser.
- Hold datainnhenting, datavask, korpusbygging og analyse i separate steg.
- Lag sporbare mellomfiler for URN-lister, metadata og delkorpus.
- Ikke bland raadata og avledede data uten tydelig navngivning.
- Foretrekk reproduserbare skript fremfor manuelle steg.

## Forelopig struktur

- `data/urns/` for URN-lister og metadata
- `data/corpus/` for bakgrunnskorpus og delkorpus
- `src/` for kode til innhenting, klargjoring og analyse
- `notebooks/` for utforskende arbeid
- `results/` for tabeller, scorer og figurer
- `app/` for en senere brukerflate for vekting og utforsking av resultater

## Prioritert rekkefolge

1. Fa tak i og lagre en stabil liste med URN-er.
2. Avklare om skjonnlitteratur kan brukes som bakgrunnskorpus.
3. Bygge `pol1` og `pol5` med tydelige inklusjonskriterier.
4. Beregne ordtypiskhet og filtrere pa spredning.
5. Evaluere hvilke ord som faktisk skiller delkorpusene pa en meningsfull mate.
