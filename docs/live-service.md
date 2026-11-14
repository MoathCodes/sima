# Live SPHEREx frames for any coordinate

The five challenge targets have real SPHEREx cutouts baked into `public/data/` ahead of time
(`docs/data-format.md`). For any other coordinate the viewer can ask a small web service,
`scripts/live.py`, to fetch real cutouts from NASA's IRSA archive while the user waits. Without the
service the viewer shows a labelled simulation and says why.

## Why a service at all

A web page cannot ask IRSA directly: IRSA's search and cutout services send no CORS headers, so the
browser blocks the answers. A cutout also takes 2 to 20 seconds, and about one request in five gets
`503 Server busy`, which needs patient retrying. `scripts/prebake.py` already does all of that; the
service imports its functions (search, plan, download, pack) and answers in the same file format.

It uses only Python's standard library for the web part (`http.server`), so it needs nothing beyond
`scripts/requirements.txt` (Astropy, NumPy, Requests). Three GET routes did not justify a framework.

## Try it locally

```
python -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt   # once
npm run dev
```

`npm run dev` starts the service too (`vite.config.ts`: it runs `scripts/live.py` with `.venv/bin/python`,
or `python3` if there is no `.venv`, unless something already listens on port 8765) and sets
`VITE_LIVE_API=/api/patch`. Vite passes `/api` to the service. To run the service by hand instead:
`python scripts/live.py`.

Then open the page and type a coordinate, for example `217.429 -62.680` (Proxima Centauri), or go to
`/?ra=180&dec=60`. In a build, `VITE_LIVE_API` is empty by default, which turns live fetching off.

Tests for the service's pure parts: `python -m unittest discover -s scripts -p 'test_*.py'`.

## What happens

1. The viewer asks `GET /api/patch?ra=…&dec=…&fov=12`. The service rounds the position to 0.001°
   (3.6″, about half a pixel), finds or starts the job for that patch, and answers with its status.
2. The job searches every release in `prebake.RELEASES`, groups exposures into visits and plans at
   most 2 exposures per detector per visit and 48 in all.
3. **First look.** It fetches one exposure per detector at the oldest and the newest visit (up to 12)
   and writes them as `/api/patch/<id>/first/frames.json` and `frames.bin.gz`.
4. **Full set.** It fetches the rest of the plan (the first-look exposures come from the disk cache)
   and writes `/api/patch/<id>/full/`.
5. The viewer polls the status every 1.5 s and shows the progress in words ("Fetching 6 of 12 real
   exposures from NASA's archive for a first look…"). It shows the first look as soon as it exists,
   then swaps in the full set. The picture is labelled "Real SPHEREx data, fetched live, DR1".
6. If the service is missing, refuses, fails or finds nothing, the viewer shows the simulation and
   the label gives the reason, for example "Simulated frames: the live service did not answer".

Why two steps instead of only a progress bar: the full set takes one to three minutes, and a first
look with two dates is already enough to blink. Progress alone would leave the user with nothing to
look at for minutes.

## Status answer

```
{ "id": "a0414aa3f729076b", "state": "first", "found": 353, "done": 6, "total": 12, "kept": 6,
  "releases": [], "error": "", "warning": "", "first": null, "full": null, "ra": 217.429, "dec": -62.68,
  "fov": 12 }
```

`state` is `queued`, `searching`, `first`, `rest`, `ready`, `empty` (no exposures there) or `failed`.
`done` of `total` counts exposures in the current step; `first` and `full` hold the folder of each
step once it is written. `warning` is set when a release in the list found nothing because IRSA no
longer lists it, for example "spherex_qr2 returned nothing and IRSA no longer lists it; IRSA now
lists: spherex_dr1, …". The same line goes to the service's log. To find out, the service asks IRSA
for its list of SPHEREx collections (one query of about 45 seconds, kept for a day), but only when a
release found nothing.

## Limits and safety

- **No open proxy.** The client sends three numbers. Every IRSA address is built by the service from
  IRSA's own search results. Inputs are checked: RA 0–360, Dec −90–90, field 3, 6 or 12 arcmin.
- **Gentle on IRSA.** At most 8 requests to IRSA at a time for the whole process (a shared semaphore in
  `prebake.get`), busy replies retried with growing waits, at most 2 patches fetched at once and 8
  waiting; more than that gets `503 busy`.
- **Anonymous.** Requests carry a generic User-Agent and nothing about the user or the project.
- **Cache.** Results are kept on disk under the cache folder (default: the system temp folder),
  keyed by the rounded position, field size and release list. A new release gives new keys, so stale
  results are never served as complete. Raw cutouts and wavelength tables are cached too. Delete the
  folder to start over.
- **CORS.** Only origins named with `--allow-origin` (default `http://localhost:5173`) may call it from
  a page. Through the Vite proxy no CORS is needed.

## Timings measured (12 November 2026, before IRSA replaced QR2 with DR1)

| Spot | First look | Full set | Exposures |
|---|---|---|---|
| Proxima Centauri, RA 217.429 Dec −62.680, first run after start | 111 s (12) | 192 s | 36 of 353 found, QR2 + QR3 |
| Empty-looking field, RA 180.000 Dec +60.000 | 33 s (10) | 80 s | 32 of 294 found, QR2 |
| A cached patch | under 2 s | under 2 s | |

The first run is slow mainly because the wavelength table of each detector sits behind a 4 MB PSF
table at the end of every file, so the service downloads one whole file (about 5 MB) per detector and
calibration version. These tables are kept on disk (`wave-D*.npz` in the cache) and reused for every
later patch. Busy replies (about one in five requests) add a few seconds each.

## Hosting

Any machine that can run Python 3.10+ with outgoing HTTPS works: a small virtual machine, a container
platform, or a university server. Nothing here has been deployed.

1. Run `python scripts/live.py --host 0.0.0.0 --port 8765 --allow-origin https://<page origin>
   --cache /var/cache/spherex-live` behind an HTTPS reverse proxy that forwards `/api/`.
2. Build the page with the service address: `VITE_LIVE_API=https://<service host>/api/patch npm run build`.
3. Give the cache folder a few GB: each patch is about 1 MB, raw cutouts about 0.3 MB each, and the
   wavelength tables about 5 MB per detector and calibration while they are first read.

The service keeps running jobs in memory. Finished patches survive a restart; jobs that were running
start again when next asked for.
