<img src="assets/icon.svg" width="64" height="64" alt="">

# Sima (سيما)

Sima is a web app on the infrared sky of NASA's SPHEREx telescope. The whole sky is the page. Put a
square on any spot, and a card (the frame) plays the real pictures of that spot in date order. Stars
stay still; anything that moves or changes stands out.

سيما, written Sima, is Arabic for "a sign or a mark". Made by team SIMA, in Madinah, for the NASA
Space Apps Challenge 2026, "Planet X and SPHEREx".

The work is AI-assisted: the code and much of the text were written with AI coding assistants,
directed and checked by the team. The About dialog in the app says the same.

## Run it

You need Node 22.18 or newer. Python is needed only for the live service and the data scripts.

```
npm install
npm run dev            # http://localhost:5173 (PORT=… picks another port)
```

Open the page on a desktop screen: it is made for 1366×768 and wider. Under 700 px wide it shows
only a note asking for a computer.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The page with hot reload. Starts the live service too, if Python is set up (below). |
| `npm run build` | The site, in `dist/`. |
| `npm run preview` | Serves `dist/`. |
| `npm run typecheck` | TypeScript, strict. |
| `npm test` | The unit tests (`tests/*.test.ts`), with Node's own test runner. |
| `npm run smoke` | The smoke test: every flow in `tests/smoke/flows/` in headless Chromium at 1900×1030 and 1366×768. Fails on a console error, a page scroll, or two cards that overlap. |
| `npm run test:py` | The Python tests of the data scripts and the service. |
| `npm run format` | Prettier. |

The smoke test uses the Chromium build in `~/.cache/ms-playwright` that `playwright-core` expects;
nothing is downloaded. `SMOKE_SHOTS=1 npm run smoke` keeps a screenshot of every step in
`test-results/smoke/`.

## Data

All data is real and fetched from public sources. Nothing is made up; the one practice simulation
is labelled "Simulated" everywhere.

- **The five test targets** (Barnard's Star, Epsilon Indi B, WISE 0855−0714, RW Aurigae,
  R Draconis): real SPHEREx cutouts in `public/data/<target>/` (about 8 MB), made by
  `scripts/prebake.py` from NASA/IPAC IRSA. Format: `docs/data-format.md`.
- **The all-sky map**: SPHEREx's 102-channel map, read by Aladin Lite straight from IRSA.
- **Places** (stars, clusters, nebulae, galaxies): `src/data/places.json`, made by
  `scripts/build_places.py` from SIMBAD, the IAU star names list, OpenNGC, Wikidata and Wikipedia.
  See `docs/places.md`.
- Every source, its address and its terms are listed in the About dialog and in `docs/SPEC.md`
  section 6.1.

To rebuild data, set up Python first:

```
uv venv .venv
uv pip install -r scripts/requirements.txt -r scripts/places_requirements.txt
```

## The live service (any coordinate)

The five targets open at once. For any other spot, the page asks a small Python service,
`scripts/live.py`, which fetches real cutouts from IRSA while the user waits. A new spot takes
minutes, and the page says so and stays usable meanwhile. Without the service, the frame says
there are no pictures here and why, and offers the five targets and a labelled practice.

- In dev, `npm run dev` starts the service if `.venv` exists, and proxies `/api` to it.
  `SIMA_LIVE=off npm run dev` keeps it out.
- The page finds the service through `VITE_LIVE_API` (for example `/api/patch`).
- Routes, limits and timings: `docs/live-service.md`.

## Catalogue search, the motion handle and the sandbox

- **Catalogue search** (search "catalogue", "fast" or "cold"): asks VizieR, from
  the browser, for Gaia DR3 stars that move fast (proper motion over a cut, up to a 1° circle) or
  CatWISE2020 sources that look cold (W1−W2 over a cut, W2 under 15, up to 0.5°). It tries the CfA
  mirror, then the IDIA one, and says so if both fail, with "Try again". An answer takes 5 to 20
  seconds, sometimes more. Results are catalogue sources, never discoveries: a paged list and marks
  on the sky, each with "Look with the frame".
- **Motion handle** (Measure, Stack view): drag the arrow, or use the arrow keys on it (Shift for
  ten times bigger steps), to try a motion. The stack is redone in the worker as it moves, with
  its signal-to-noise and the two checks (not shifted, opposite). "Snap to catalogue motion" goes
  back.
- **Sandbox** (search "planet x", or About's Planet X section): a pretend planet with a size,
  distance and reflectivity. A simple model gives its brightness in each detector (reflected
  sunlight plus its own glow), its yearly shift, and whether one exposure or a stack would show it
  against the noise measured in the open patch. It is drawn with a "Pretend planet" tag and a
  dashed outline, and never enters a measurement, list, chart or download
  (`tests/sandbox.test.ts` checks this).

## Hosting

The site is static: host `dist/` on any static host.

```
VITE_LIVE_API=https://<service host>/api/patch npm run build
```

Without `VITE_LIVE_API`, the built site has live fetching off and says so. The service needs a
machine with Python, outbound HTTPS and a disk cache; `scripts/Dockerfile.live` and
`scripts/deploy/` (systemd, Caddy, nginx) are ready-made setups, explained in
`docs/live-service.md` under "Hosting". The service is not hosted yet.

## Links and embedding

Share gives a link and an embed code. A link can hold:

| Parameter | Meaning |
|---|---|
| `target` | A test target: `barnard`, `eps-indi-b`, `wise-0855`, `rw-aur`, `r-dra` (or the practice `warm-up`, `planet-x`). |
| `ra`, `dec` | Any spot, in degrees (used when there is no `target`). |
| `fov` | Field size in arcminutes: 3, 6, 12, 24 or 48. |
| `det` | Detector `D1` to `D6`, or `color`. |
| `view` | `flip`, `two`, `diff` (and in Measure `swipe`, `stack`, `trail`). |
| `date` | The picture to start at, `YYYY-MM-DD` (UTC). |
| `pic` | Picture settings from the picture tools. |
| `embed=1` | Only the frame, the bar and Measure, for an iframe. |

A parameter the page does not understand is named in a short note, never ignored silently.

## Keys

Space plays or pauses, ← and → step through the pictures, + and − zoom the sky, / goes to
search, Escape closes the topmost open thing (popover, dialog, list, picture tools, Measure).

## How the code is split

`docs/SPEC.md` is the spec (behaviour), `DESIGN.md` the look, `docs/lanes.md` the map of who owns
which file. In short: `src/core/` science (pure functions), `src/sky/` the sky map, `src/viewer/`
the frame, the bar and Measure, `src/shell/` the cards on the sky, `src/guide/` and `src/explore/`
the guide, `scripts/` the data and the service.

## Licences

Aladin Lite is GPL-3.0. The fonts Archivo and Reem Kufi are under the SIL Open Font License 1.1
(`src/styles/fonts/`). Data terms are listed per source in the About dialog.
