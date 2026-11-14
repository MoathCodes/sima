# Places catalogue

Run from the repository root:

```sh
uv venv .venv
uv pip install --python .venv/bin/python -r scripts/places_requirements.txt
.venv/bin/python scripts/build_places.py
.venv/bin/python -m unittest discover -s scripts -p test_build_places.py
.venv/bin/python scripts/test_build_places.py --live
```

The builder downloads public data into `~/.cache/sima-rebuild/places`.
Each raw response has a matching request record. Reusing that cache gives the
same output. To refresh, move the cache aside and rerun. Requests are serial,
at least 1.2 seconds apart, with bounded retries and the generic User-Agent
`sima-sky-viewer/1.0`. Failed downloads stop the build; missing Wikipedia
articles leave the text absent. There is no invented replacement data.

## Fields

The TypeScript contract is `src/data/schema.ts`. JSON contains a version,
coordinate frame, 15 kind labels, a source dictionary and a places array.

- `id`: SIMBAD object number, with shared keys for the five challenge targets.
- `simbad`: identifier for looking up the original record.
- `names`: optional common name, Arabic label, transliteration and meaning;
  catalogue names are always present. The UI can use the first catalogue name
  when there is no common name. Lead unnamed cards with `kinds[place.kind]`.
- `ra`, `dec`: degrees, ICRS/J2000, taken from SIMBAD. These are not positions
  propagated to a particular exposure date.
- `kind`: one of 15 broad groups. Galaxy shape comes from OpenNGC's Hubble
  classification, not a SIMBAD activity class such as LINER. Lenticular,
  irregular and unclassified galaxies use the general galaxy group and keep
  their original `morphology` code.
- `tier`: editorial dot visibility from 0 (widest view) to 4 (closest).
  It is not a scientific measurement. Messier objects, common names and the
  challenge targets rank ahead of unnamed catalogue entries.
- `magnitude`: a finite catalogue value between −5 and 30, with its V or K
  band. Magnitudes from different bands must not be presented as equivalent.
- `size`: major and optional minor angular axes, in arcminutes.
- `distance`: median (`ly`), minimum (`low`) and maximum (`high`) of positive
  SIMBAD distance entries converted to light-years. `measurements` counts
  entries, including different papers that repeat a value. `disagree` means
  (high − low) / median > 0.30. This range is not an error bar. No distance is
  inferred from a remembered value or substituted from Wikipedia.
- `properMotion`: SIMBAD motion in milliarcseconds per year; RA includes
  cos(dec). `inSpherex` suggests a date comparison only when the catalogue
  motion supports it. It never promises detection or states a pixel measurement.
- `text`: the first two sentences of a Simple English Wikipedia introduction,
  where an exact-title page exists.
- `sources`: per-fact lists of indices into the top-level source dictionary.
  Every referenced entry supplies a source name and URL. `position` covers both
  coordinates; `names` covers common and catalogue names. Arabic, transliteration
  and meaning each have their own attribution. Tier is an editorial choice.
  Resolve these indices when showing the sources on a card.

Missing optional fields mean there is no shipped fact. Leave the corresponding
row out. Search all values in `names`; normalise whitespace for catalogue
numbers, so “m104” matches “M 104”. Typo handling belongs to the search lane.

## Public sources and terms

- [SIMBAD, CDS](https://simbad.harvard.edu/simbad/) supplies positions,
  identifiers, object classes, photometry, proper motions and listed distances
  through TAP. Acknowledge CDS and the underlying papers. The
  [CDS acknowledgement page](https://cds.unistra.fr/help/acknowledgement/)
  gives the requested credit. This research has made use of the SIMBAD database,
  operated at CDS, Strasbourg, France. No blanket CC licence is asserted here.
  The [CDS service notice](https://cds.unistra.fr/) says the main service is
  degraded and the Harvard mirror contains data ingested through 2026-10-14.
- [IAU WGSN](https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt) supplies
  official star names. Its header requests attribution and says IAU products
  use Creative Commons Attribution. This file is dated 2022-04-04; later
  official names are a known coverage gap.
- [Wikipedia's Arabic star names list](https://en.wikipedia.org/wiki/List_of_Arabic_star_names)
  supplies Arabic names, transliterations and meanings. Credit the page and its
  contributors. Text is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  The table includes historical names; they are matched to the WGSN common name.
- [OpenNGC](https://github.com/mattiaverga/OpenNGC) supplies NGC/IC aliases,
  common names, angular sizes, magnitudes and galaxy shapes.
  Its database is CC BY-SA 4.0. Credit Mattia Verga and contributors; retain
  attribution and share-alike terms when redistributing adapted database content.
- [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing) supplies Arabic
  labels through the exact entity linked by the article. Structured entity data
  is CC0. No fuzzy name match is used.
- [Simple English Wikipedia](https://simple.wikipedia.org/) supplies short
  introductions. Each text links to its article and names CC BY-SA 4.0. These
  excerpts have references removed and are shortened; their adaptation remains
  CC BY-SA 4.0. Article history links identify the contributors.

Keep these credits and licence links in the app's About page as well as source
links on cards (integration work for the UI owner).

## Checks and limits

The unit suite checks the median rule, mixed units, absent values, invalid
magnitudes, galaxy shapes, Arabic row spans, the 15 kinds, target keys,
per-fact attribution and the three required search terms. The separate live
check uses a fixed random seed and queries SIMBAD by main identifier for 30
positions. Its request differs from the build requests.

Sombrero currently has 16 listed distances: median 36.76 million light-years,
minimum 28.02 million, maximum 70.78 million. Studies disagree. The earlier
31–45 million range is not substituted for the current data.

Only sourced introductions and derivable observing notes are shipped. Many
cards therefore have neither. This is intentional under H9. A future build can
extend text coverage without filling gaps from memory.

Manual data review on 2026-11-14 covered 30 records: all five challenge targets;
Pollux, Fomalhaut, Arcturus, Beehive, Hercules Globular Cluster, Mairan's Nebula,
M78, Pipe Nebula, Dumbbell Nebula, Crab Nebula, Triangulum, M87, M82, Achernar,
Andromeda, Regulus, Sombrero, Black Eye, Sunflower, Spica, Antares, Altair,
Capella, Ring Nebula and Vega. Positions and SIMBAD classes were re-queried;
magnitudes, angular sizes and galaxy shapes were compared with downloaded
OpenNGC rows where available. Names, text and source links were read directly.
This found and removed the unrelated beekeeping introduction and its Arabic
label. It also corrected the variable-star mapping: Be stars and young stellar
objects do not imply variability; explicit beta Cepheid and other variable
classes do. The tests retain those checks.

This was a card-data review. Visual card layout needs the places UI lane.
The checkout has no `package.json`, so npm typecheck, test and build commands
cannot run here. No files outside this lane were added to work around that.
