# Live SPHEREx frames for any coordinate

The five challenge targets have real SPHEREx cutouts baked into `public/data/` ahead of time
(`docs/data-format.md`). For any other coordinate the viewer can ask a small web service,
`scripts/live.py`, to fetch real cutouts from NASA's IRSA archive while the user waits. Without the
service the viewer shows a labelled simulation and says why.

## Why a service at all

A web page cannot ask IRSA directly: IRSA's search and cutout services send no CORS headers, so the
browser blocks the answers. IRSA also answers about one request in five with `503 Server busy`, which
needs patient retrying. `scripts/prebake.py` already does all of that; the service imports its
functions (search, plan, download, pack, catalogue queries) and answers in the same file format.

It uses only Python's standard library for the web part (`http.server`), so it needs nothing beyond
`scripts/requirements.txt` (Astropy, NumPy, Requests). A few GET routes did not justify a framework.

## Try it locally

```
uv venv .venv && uv pip install -r scripts/requirements.txt     # once
.venv/bin/python scripts/live.py                                   # http://127.0.0.1:8765/api/
```

Then ask for a patch: `curl 'http://127.0.0.1:8765/api/patch?ra=217.429&dec=-62.680&fov=12'` (Proxima
Centauri), and repeat the same request to watch its status move on.

In the page, the viewer reads the service address from `VITE_LIVE_API` (for example `/api/patch`
through the Vite proxy). Wiring `npm run dev` to start the service and proxy `/api` to port 8765 is
`vite.config.ts`, which lane A does not own (see the integrator notes in the lane A report).

Tests for the service's pure parts and its routes (no network):
`python -m unittest discover -s scripts -p 'test_*.py'`.

## What happens

1. The viewer asks `GET /api/patch?ra=…&dec=…&fov=12`. The service rounds the position to 0.001°
   (3.6″, about half a pixel), finds or starts the job for that patch, and answers with its status.
   It also starts the catalogue query for the patch (below), in parallel. **If a finished patch
   already holds the whole asked field** (a nudge of a few arcminutes, a smaller field, a seeded
   tour stop), it answers with that patch instead, marked `reused: true` (see "Reuse" below).
2. **Search.** One TAP query per release in `prebake.RELEASES`, all at once (the same join of
   `spherex.artifact`, `spherex.plane` and `spherex.observation` as IRSA's SPHEREx cutout notebook,
   with `CONTAINS(POINT(ra, dec), plane.poly)` and the collection name). The old build searched one
   request at a time and spent 144 to 409 s here; one query per release takes about 10 to 30 s.
   **The search has a budget** (`prebake.SEARCH_*`): each try may wait 40 s for an answer, there are
   4 tries (waits of 3, 8 and 15 s between them), and the whole step stops after 180 s. IRSA's TAP
   service sometimes takes a query and never answers; with the general limits (180 s a try, 7
   tries) one search could hang for 20 minutes (seen on 15 November 2026: 1,135 s). While it
   searches, the status says which try it is on and how long it has waited; when the budget runs
   out, the patch fails with "NASA’s search did not answer within 3 min 1 s (4 tries)" and
   `searchTimedOut: true`, and the viewer offers "Ask again". A failed search may be started again
   3 s later (other failures: 30 s).
3. **Plan.** Exposures are grouped into visits (a gap of more than 40 days starts a new one). Each
   exposure's wavelength at the patch centre is estimated from its footprint and the detector's
   wavelength table, and the plan keeps at most 2 exposures per detector per visit, 48 in all, chosen
   so the same colour comes back in every visit (as for the shipped targets). A 48′ field keeps 1
   per detector per visit: its cutouts are 16 times the pixels of a 12′ one (about 3.6 MB each from
   IRSA, 365 KB each to the page), so this halves the downloads.
4. **First look.** One pass fetches the whole plan, but asks first for the oldest and the newest
   visit of each detector, side by side (detector 3 first, as the viewer opens on 2.0 µm). As soon as
   one detector has a picture at both visits (enough to blink), the service writes every frame it
   has of those two visits as `/api/patch/<id>/first/frames.json` and `frames.bin.gz`.
5. **Full set.** The same pass keeps going and writes `/api/patch/<id>/full/` when the plan is done.
6. The viewer polls the status every 1.5 s and shows the progress in words ("Fetching 6 of 12 real
   exposures from NASA's archive for a first look…"). It shows the first look as soon as it exists,
   then swaps in the full set. The picture is labelled "Real SPHEREx data, fetched live, DR1".
7. If the service is missing, refuses, fails or finds nothing, the viewer shows the simulation and
   the label gives the reason, for example "Simulated frames: the live service did not answer".

Why two steps instead of only a progress bar: the full set takes a minute or more, and a first look
with two dates is already enough to blink.

What makes the first look fast:

- **One TAP query per release**, in parallel, instead of many searches one after another.
- **Cutouts stop early.** A cutout file carries a 4 MB PSF table after the four images the viewer
  needs, so each download stops as soon as IMAGE, FLAGS, VARIANCE and ZODI have arrived (about 100 KB
  for a 6′ cutout, 400 KB for 12′).
- **Wavelength tables by byte range.** The table (`WCS-WAVE`) is the last 5,760 bytes of every Level 2
  file. IRSA serves byte ranges, so the service reads the last 11,520 bytes of one full file per
  detector and calibration version (about 1 s) instead of a whole 5 MB cutout. Tables are kept on
  disk (`wave/wave-D*.npz` in the cache) and reused for every later patch.
- At most 8 requests at a time, shared by everything the process does.

## Routes

| Route | Answer |
|---|---|
| `GET /api/patch?ra=<deg>&dec=<deg>&fov=<3\|6\|12\|24\|48>` | Status of the patch (starts it if new). `fov` defaults to 12. `400` with `{"error": …}` on bad input; `503 {"error": "busy"}` when 8 patches already wait. |
| `GET /api/patch/<id>` | Status of a known patch, `404` if unknown. |
| `GET /api/patch/<id>/first/frames.json`, `…/frames.bin.gz` | First look, same format as `public/data/<key>/` (`404` until written). |
| `GET /api/patch/<id>/full/frames.json`, `…/frames.bin.gz` | Full set, same format. |
| `GET /api/patch/<id>/catalog.json` | Gaia DR3 and CatWISE2020 sources in the patch (below). `202 {"state": "pending"}` while the query runs, `502 {"state": "failed", "error": …}` if both the primary service and the fallback failed. |
| `GET /api/health` | `{"ok": true, "releases": [...], "fovs": [3, 6, 12, 24, 48], "counts": {...}}` |

`frames.bin.gz` is sent as `application/octet-stream` without `Content-Encoding`, so the browser does
not unpack it; the loader unpacks it (and reads it as is if a proxy already unpacked it). A step's
files and `catalog.json` never change once written (a new release list gives new ids), so they are
sent with `Cache-Control: public, max-age=31536000, immutable`; status answers with `no-store`.

A patch's `frames.json` is exactly the format of `docs/data-format.md`, with these differences:

- `catalogue` is the patch centre with no motion (`pmra`, `pmdec` 0, `parallax` null, `ep` 2016.0),
  and `from` says so: "Patch centre asked for in the viewer (a position, not a catalogue object)",
  or, for a seeded patch, "Patch centre chosen ahead of time for a tour stop or a listed place (a
  position, not a catalogue object)".
- No `neighbours` block: the catalogue for the whole patch is in `catalog.json` instead.
- An extra `live` block: `id`, `step` (`first` or `full`), `fetched` (UTC), `found` (exposures the
  search found), `windows`, and `ahead` (true when the seed job fetched it, not a page). The page
  says "fetched live" only when `ahead` is false and `fetched` is less than an hour old; otherwise
  it gives the date, for example "Real SPHEREx data, fetched 15 Nov 2026" (`src/viewer/seed.ts`).

## Status answer

Proxima Centauri, 39 s after the first request:

```
{ "id": "6d32669fdcdddebf", "state": "first", "found": 379, "done": 6, "total": 12, "kept": 6,
  "releases": [], "error": "", "warning": "", "first": null, "full": null,
  "catalog": "/api/patch/6d32669fdcdddebf/catalog.json", "catalogError": "",
  "ra": 217.429, "dec": -62.68, "fov": 12, "searched": ["spherex_dr1", "spherex_qr3"] }
```

`state` is `queued`, `searching`, `first`, `rest`, `ready`, `empty` (no exposures there) or `failed`.
`first` lasts until the first look is written, `rest` until the full set is. `done` of `total`
counts the exposures of the whole plan fetched so far, `kept` how many of them were usable; `first`
and `full` hold the folder of each step once it is written; `releases` the collections the kept
frames came from; `catalog` the address of `catalog.json` once written. `warning` is set when a release
in the list found nothing because IRSA no longer lists it, for example "spherex_qr2 returned nothing
and IRSA no longer lists it; IRSA now lists: spherex_dr1, …". The same line goes to the service's log.
To find out, the service asks IRSA for its list of SPHEREx collections (one query of about 15 seconds,
kept for a day), but only when a release found nothing.

`retrying` is `true` while the patch is searching or fetching and some request to NASA's archive
waited to be asked again in the last 20 s (a busy reply such as HTTP 503, a gateway error or a
dropped connection). The viewer then says "NASA's archive is busy, so the service is asking again"
in its loading words, so a long wait has a reason on screen. It is `false` (or absent) once the
patch is finished.

The search step adds `searchTry` (the try under way, the later of the two releases), `searchTries`
(4), `searchElapsed` (seconds waited so far, while searching; 0 otherwise), `searchBudget` (180)
and `searchTimedOut` (true when the patch failed because the search did not answer in time). The
viewer turns them into "NASA’s search has not answered for 1 min 40 s (try 3 of 4)" after 20 s or
from the second try.

`ahead` is true for a patch the seed job fetched. `reused` is true when the answer comes from a
finished patch that holds the asked field: `id`, `ra`, `dec` and `fov` are then that patch's own,
and the page cuts its pictures around the spot it asked for (as it does for a pan).

(SPEC 6.3 sketches the same answer with the names swapped: state `done` and count `ready`. This file
is what the service sends.)

## Who goes first, and stopping work nobody watches

Plan: `docs/research/prediction.md`, option 1.

- **Watched.** A patch is watched while a page asked for its status in the last 5 s (the page asks
  every 1.5 s, so no new message is needed). Status reads by id and repeated `?ra=&dec=` requests
  both count.
- **Request slots by priority.** All 8 request slots of the process (`prebake._Gate`) go to watched
  work first, then predicted work (not built), then seed work and patches nobody watches. That
  lower work holds at most 4 slots at once and starts nothing for 5 s after any busy reply.
- **Pausing.** A patch that loses its watcher finishes the cutouts already under way, then pauses
  (`fetch_plan(keep_going=…)`). If its first look is not written yet it may start up to 4 more
  cutouts first. What it fetched stays on disk (searches for 12 hours, cutouts for good), so when it
  is asked again it is queued again and carries on quickly. A queued patch nobody watches is set
  aside the same way. The page never sees a `paused` state: asking wakes it, so it answers `queued`.
- **Queue order.** Two patches run at once: watched before seed, oldest first in each. Seed work
  does not count towards the 8 waiting patches that give `503 busy`.

## Reuse: a finished patch that holds the field

Plan: `docs/research/prediction.md`, option 2. The service keeps an index of the finished patches
on disk (centre and field; read again every minute, so patches the seed job writes are found too).
A request is answered from one when its cutouts hold the whole asked field: along each axis,
offset + asked field ÷ 2 ≤ (cutout side − 0.6′) ÷ 2. The narrowest such patch wins, then the
nearest. A patch is used only up to two steps wider than asked (at least 12′), so a 6′ field never
downloads a 48′ patch's 6 MB. A 12′ patch then serves a 6′ field within 3′ of its centre and a 3′
field within 4.5′.

The pictures are real exposures of that sky, cut from a slightly larger download; `frames.json`
keeps its own centre and fetch date, and the label shows that date when it is not fresh.

## Seed: tour stops and top places fetched ahead

Plan: `docs/research/prediction.md`, option 3. `scripts/seed_live.py` fetches every tour stop
(`src/data/tours.ts`) and every tier 0 and 1 place (`src/data/places.json`), less the five shipped
targets: 156 spots on 15 November 2026. Each is fetched at 12′, or at the place's own field when
it is wider (96 at 12′, 34 at 24′, 26 at 48′), so each also serves smaller fields and nudges near it.

```
.venv/bin/python scripts/seed_live.py --list            # the spots (no network)
.venv/bin/python scripts/seed_live.py                   # fetch them all (hours; run at IRSA's night)
.venv/bin/python scripts/seed_live.py --limit 3         # or a few; --only id,id; --max-fov 12
.venv/bin/python scripts/seed_live.py --export          # write seed-out/ from what is fetched
```

It runs the live service's own code in its own process, as seed work: one spot at a time, at most
4 requests at a time, holding back after busy replies. Give it the live service's cache
(`--cache`, or `SIMA_CACHE`) and a running service answers those spots at once (it reads new
finished patches from disk within a minute). Spots already held are skipped. Run it again after a
new data release (new releases give new ids).

**The static seed.** `--export [DIR]` (default `seed-out/`, ignored by git, never in `public/`)
copies each patch that holds a spot to `DIR/<id>/full/frames.json` and `frames.bin.gz` (plus
`DIR/<id>/catalog.json`), and writes `DIR/index.json`:

```
{ "version": 1, "made": "2026-11-15T05:00:00Z", "releases": ["spherex_dr1", "spherex_qr3"],
  "patches": [ { "id": "…", "ra": 83.822, "dec": -5.391, "fov": 48, "size": 0.81,
                 "fetched": "2026-11-15T04:12:09Z", "frames": 18, "found": 375, "places": ["m42"] }, … ] }
```

Upload the folder to any static host and build the page with its address in `VITE_SEED_BASE`
(no trailing slash needed). The page then reads `index.json` once and opens a seeded spot from the
host before it asks the live service, in the main frame and in workspace frames. **It works with
no live service at all**: the tour stops still show real pictures. Without `VITE_SEED_BASE` the
page behaves as before. The label gives the real fetch date ("Real data, fetched 15 Nov 2026"),
never "fetched live".

Google Cloud Storage:

```
gcloud storage buckets create gs://<bucket> --location=<region> --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://<bucket> --member=allUsers --role=roles/storage.objectViewer
gcloud storage rsync -r seed-out gs://<bucket>/seed
gcloud storage objects update "gs://<bucket>/seed/**/frames.*" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update gs://<bucket>/seed/index.json --cache-control="public, max-age=300"
# CORS, only if the page is on another origin: cors.json =
#   [{"origin": ["https://<page origin>"], "method": ["GET"], "maxAgeSeconds": 3600}]
gcloud storage buckets update gs://<bucket> --cors-file=cors.json
VITE_SEED_BASE=https://storage.googleapis.com/<bucket>/seed npm run build
```

Azure Blob Storage:

```
az storage account create -n <account> -g <group> --sku Standard_LRS --allow-blob-public-access true
az storage container create --account-name <account> -n seed --public-access blob
az storage blob upload-batch --account-name <account> -d seed -s seed-out --overwrite \
    --content-cache-control "public, max-age=31536000, immutable"
az storage blob upload --account-name <account> -c seed -n index.json -f seed-out/index.json --overwrite \
    --content-cache-control "public, max-age=300"
az storage cors add --account-name <account> --services b --methods GET --origins https://<page origin> \
    --allowed-headers '*' --max-age 3600
VITE_SEED_BASE=https://<account>.blob.core.windows.net/seed npm run build
```

Any other host works the same way (a CDN, the page's own host under a path such as `/seed`).
`frames.bin.gz` must be served without `Content-Encoding: gzip` (store it as
`application/octet-stream`; both commands above do). Expected size: about 1 MB per 12′ patch,
3.7 MB per 24′, 6.5 MB per 48′: roughly 400 MB for all 156 spots, or about 100 MB with `--max-fov 12`.

The catalogue tool reads a seeded patch's `catalog.json` from the seed first
(`src/viewer/tools/catalogue.ts`), and asks the live service only when the seed has none.

## Counters

`/api/health` adds `counts`: requests answered from a patch already held (`cached`), from a covering
patch (`reused`), new patches started for pages (`started`) and for the seed (`seeded`), patches
paused and woken again (`paused`, `resumed`). The same line ends each patch's log line, with how
long it waited in the queue (`wait=`). No positions or visitor details are counted.

## Catalogue for a patch: `catalog.json` (O-D4)

Live-fetched spots get the same two catalogues as the shipped targets, so stars can be marked and
neighbours checked there too.

An answer for Proxima Centauri (first rows of each catalogue; Proxima is the first Gaia row):

```
{ "id": "6d32669fdcdddebf", "ra": 217.429, "dec": -62.68, "fov": 12, "radius": 0.14975,
  "generated": "2026-11-14T09:32:41Z",
  "from": { "gaia": "ESA Gaia archive TAP (gaiadr3.gaia_source)", "catwise": "IRSA TAP (catwise_2020)" },
  "capped": { "gaia": true, "catwise": true }, "limit": 5000,
  "rows": [ { "cat": "gaia", "id": "Gaia DR3 5853498713190525696", "ra": 217.3923215, "dec": -62.6760751,
              "ep": 2016.0, "pmra": -3781.741, "pmdec": 769.465, "mag": 8.985 },
            …
            { "cat": "catwise", "id": "CWISE J143034.49-624351.5", "ra": 217.6439139, "dec": -62.7309868,
              "ep": 2015.4018, "pmra": 29.28, "pmdec": 54.95, "mag": 5.798 }, … ] }
```

- Which sources: every Gaia DR3 and CatWISE2020 source in a circle that holds the whole square patch
  plus 30″ (`radius`, degrees), brightest first, at most `limit` per catalogue. `capped` says when a
  catalogue reached the limit (crowded fields near the Galactic plane); then the faintest are missing.
- Each row has the fields of `Neighbour` in `docs/data-format.md`: `cat` (`gaia` or `catwise`), `id`
  (`Gaia DR3 …` or `CWISE J…`), `ra`, `dec` in degrees at decimal year `ep` (Gaia 2016.0; CatWISE
  `ra_pm`, `dec_pm` at MJD 57170 = 2015.4018), `pmra` (times cos dec) and `pmdec` in mas/yr (CatWISE's
  arcsec/yr times 1000; 0 where the catalogue gives none), and `mag` (Gaia G; CatWISE W1, or W2 when
  W1 is empty). Rows with no magnitude are left out. No `target` flag: a patch has no target.
- `from` names the service that answered each catalogue. The fallback for each is VizieR at CfA
  (`I/355/gaiadr3`, `II/365/catwise`). On 2026-11-14 that mirror answered CatWISE queries with column
  definitions and no rows, even where IRSA lists sources; an empty fallback answer therefore counts as a
  failure (`catalogError`), never as "no sources here".
- The query runs once per patch and is kept with the patch on disk.

## Limits and safety

- **No open proxy.** The client sends three numbers. Every IRSA address is built by the service from
  IRSA's own search results. Inputs are checked: RA 0–360 (360 is 0), Dec −90–90, field 3, 6, 12,
  24 or 48 arcmin; each a plain decimal number of at most 32 characters, given once. Only GET is answered; ids
  in paths must be 16 lowercase hex digits and file names one of the four above.
- **Gentle on IRSA.** At most 8 requests to outside services at a time for the whole process (a shared
  semaphore in `prebake.fetch`), busy replies and dropped connections retried with growing waits (2,
  4, 8, 15, 30, 60 s, plus a little jitter), at most 2 patches fetched at once and 8 waiting; more than
  that gets `503 busy`.
- **Anonymous.** Requests carry the generic User-Agent `sima-sky-viewer/1.0` and nothing about the user
  or the project.
- **Cache.** Results are kept on disk under the cache folder (default `~/.cache/sima-rebuild/irsa`,
  or `--cache`, or `SIMA_CACHE`): patches in `live/<id>/`, keyed by the rounded position, field size
  and release list. A new release gives new keys, so stale results are never served as complete.
  Searches are reused for 12 hours, raw cutouts and wavelength tables for good. An empty spot is
  searched again after 12 hours; a failed one when next asked, 30 s after it failed. Delete the folder
  to start over.
- **CORS.** Only origins named with `--allow-origin` (repeatable; or `SIMA_ALLOW_ORIGIN`, comma
  separated; default `http://localhost:5173`) get an `Access-Control-Allow-Origin` header. Through a
  same-origin proxy no CORS is needed.

## Timings measured

Measured on 14 November 2026 with the Docker image below, on a fresh, empty cache volume, polling
every 1.5 s as the viewer does. "First look" and "Full set" count from the first request. "Search"
is the service's own log where it was kept, otherwise the time the poller first saw the next step.

| Spot | Search | First look | Full set | Exposures |
|---|---|---|---|---|
| **Run 1** (09:32–09:37 UTC) | | | | |
| Proxima Centauri, RA 217.429 Dec −62.680, 12′, first patch after start (empty cache) | 19.5 s | 78 s (12) | 134 s | 36 of 379 found, DR1 + QR3 |
| Empty-looking field, RA 180.000 Dec +60.000, 12′ | under 11 s | 24 s (10) | 60 s | 32 of 296 found |
| Orion Nebula, RA 83.822 Dec −5.391, 6′ | under 17 s | 50 s (12) | 78 s | 36 of 375 found |
| A cached patch (Proxima again) | | under 0.01 s | under 0.01 s | |
| **Run 2** (09:37–09:53 UTC, capped first-look retries, IRSA much busier) | | | | |
| Luhman 16, RA 162.329 Dec −53.319, 12′, first patch after start (empty cache) | 21 s | 77 s (12) | 143 s | 36 of 449 found |
| M51, RA 202.470 Dec +47.195, 12′ | 25 s | 183 s (12) | 515 s | 36 of 413 found |
| Near the south Galactic pole, RA 12.000 Dec −27.000, 6′ | 15 s | 87 s (12) | 311 s | 36 of 363 found |
| A cached patch (Luhman 16 again) | | under 0.01 s | under 0.01 s | |

What this shows:

- **The search is fixed.** One TAP query per release takes 25 s or less (10 to 25 s here), against 144
  to 409 s in the old build (O-D1).
- **The first look meets the 60 s target when IRSA is calm** (24 s and 50 s in run 1), **not when IRSA
  is busy.** In run 2 IRSA answered "503 busy" 250 times for about 150 cutouts (8 to 28 times a
  minute), and 4 cutouts were still refused after 7 tries (their backups were used). Each cutout then
  waits on retries, and nothing on our side can shorten that without asking IRSA harder. During part of
  run 2 a second patch (another lane's page, through the same service) ran at the same time.
- **The first patch on an empty cache** spends about 7 s more reading the wavelength tables (about
  24 byte-range reads of 11 KB). They stay on disk, so every later patch skips this.
- In run 1 one exposure that got four busy replies in a row waited 33 s and alone held the first look
  from 53 s to 78 s, because the first look waited for all 12 exposures. Since 14 November 2026 the
  first look waits only for one detector's oldest and newest picture, so one busy exposure no longer
  holds it up, and every request uses the same growing waits (`prebake.RETRY_WAITS`).

Open question for the team: whether IRSA limits busy replies per client. If it does, 4 requests at a
time might give the same speed with fewer refusals. Not tested, to avoid loading IRSA further.

### Wider fields (24′ and 48′)

The viewer asks for a wider patch when the field outgrows the exposures on hand (a larger field
size, or a pan): see "Fields wider than the exposures" in `src/viewer/surround.ts` and `load.ts`.
For a shipped target it asks around the target's own centre. Measured on 15 November 2026 (search
answers already cached; IRSA answering busy now and then):

| Spot | Field | First look | Full set | Exposures | `frames.bin.gz` |
|---|---|---|---|---|---|
| Barnard's Star | 24′ | 3 to 5 s | 32 to 35 s | 36 | 3.6 MB |
| Barnard's Star | 48′ | 7 to 9 s | 55 to 59 s | 18 | 6.2 MB |
| WISE 0855−0714 | 12′ | 2 s | 47 s | 36 | 1.1 MB |
| WISE 0855−0714 | 24′ | 5 s | 39 s | 36 | 3.8 MB |
| WISE 0855−0714 | 48′ | 12 s | 50 s | 18 | 6.6 MB |

(Times after the search. The WISE 0855 searches themselves took 905 and 1,135 s that morning,
before the search budget above existed; now such a search stops after 180 s.)

## Hosting

Nothing is deployed yet (SPEC 12, risk 2: the team picks the host). Any machine that runs Python
3.10+ or Docker, with outgoing HTTPS, works: a small virtual machine, a container platform, or a
university server. The service needs about 100 MB of memory and a cache folder of a few GB (each
patch is about 1 MB, a raw 12′ cutout about 0.4 MB). Three ways, each one command away:

**1. Docker** (`scripts/Dockerfile.live`, build context `scripts/`):

```
docker build -f scripts/Dockerfile.live -t sima-live scripts/
docker run -d --name sima-live --restart unless-stopped -p 8765:8765 \
    -v sima-live-cache:/cache -e SIMA_ALLOW_ORIGIN=https://<page origin> sima-live
curl http://127.0.0.1:8765/api/health
```

The image is `python:3.12-slim` plus `requirements.txt`, `prebake.py` and `live.py`, running as a
non-root user, listening on 0.0.0.0:8765, with the cache in the volume `/cache` and a health check on
`/api/health`. Settings come from `SIMA_HOST`, `SIMA_PORT`, `SIMA_CACHE` and `SIMA_ALLOW_ORIGIN`
(comma separated). Most container platforms (Fly.io, Railway, Google Cloud Run with a volume,
Render) take this Dockerfile as is; give the cache a persistent volume.

**2. systemd on a plain server** (`scripts/deploy/sima-live.service`, steps in its header):

```
sudo cp scripts/deploy/sima-live.service /etc/systemd/system/ && sudo systemctl enable --now sima-live
```

It runs `.venv/bin/python scripts/live.py --host 127.0.0.1 --port 8765 --cache /var/cache/sima-live
--allow-origin https://<page origin>` as user `sima`, restarts on failure, and may write only its cache.

**3. By hand:** `python scripts/live.py --host 0.0.0.0 --port 8765 --allow-origin https://<page origin>
--cache /var/cache/sima-live`.

In each case put HTTPS in front, forwarding `/api/` to port 8765: `scripts/deploy/Caddyfile` (Caddy
gets the certificate itself) or `scripts/deploy/nginx.conf`. Leave response compression off for
`/api/`: `frames.bin.gz` is already gzip. Then build the page with the service address:
`VITE_LIVE_API=https://<service host>/api/patch npm run build`.

The service keeps running jobs in memory. Finished patches survive a restart; jobs that were running
start again when next asked for.

**Tested on 14 November 2026** on the build machine (Docker 29.9.2):

- `docker build -f scripts/Dockerfile.live -t sima-live scripts/` built the image in 77 s.
- `docker run -d --name sima-live-test -p 127.0.0.1:8765:8765 -v sima-live-test-cache:/cache -e
  SIMA_ALLOW_ORIGIN=http://localhost:5173 sima-live` answered `/api/health` within a second
  (`{"ok": true, "releases": ["spherex_dr1", "spherex_qr3"], "fovs": [3, 6, 12]}`), sent
  `Access-Control-Allow-Origin: http://localhost:5173` only to that origin, refused `ra=500` with 400,
  and served every timing above from inside the container.
- The by-hand command (`python scripts/live.py --host 0.0.0.0 --port 8767 --allow-origin
  https://sima.example --cache <folder>`) answered `/api/health` with the CORS header and the
  preflight `OPTIONS` with 204.
- The systemd unit and the two proxy files are samples. They were not run here (no root on the build
  machine).
