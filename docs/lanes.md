# Lanes: who owns what

This page is the map for building Sima in parallel (SPEC section 9). It lists every file and its
owner, every mount point in `index.html`, the names the guide and the smoke test use, the
stylesheets, the browser storage keys and the dev ports. Owner of this page: the integrator.

The rules themselves are in `AGENTS.md` and SPEC 9.4. In short: edit only files your lane owns. If
you need a change in another lane's file, write the exact patch under "Requests to other lanes" in
your report.

## Quick start

```
npm install
PORT=5174 npm run dev          # your lane's port (table below)
npm run typecheck && npm test && npm run build && npm run smoke   # before every merge
```

`npm run smoke` needs no setup: it uses the headless Chromium in `~/.cache/ms-playwright`
(build 1243, which `playwright-core` 1.63.0 expects).

`npm run test:py` runs the Python tests with whatever `python` is first on the path, so set up and
activate the checkout's `.venv` first (system Python has no Astropy):

```
uv venv .venv
uv pip install -r scripts/requirements.txt -r scripts/places_requirements.txt
. .venv/bin/activate && npm run test:py          # 68 tests on 14 November 2026
```

### Dev ports

| Lane | Port |
|---|---|
| C. Sky | 5173 |
| D. Frame and bar | 5174 |
| E. Measure and tools | 5175 |
| F. Shell | 5176 |
| G. Places | 5177 |
| H. Guide | 5178 |
| Integrator | 5180 |
| Phase 0 | 5170 |

Lanes A and B have no screen. If you need the page, use 5171 (A) or 5172 (B). The port is strict:
if it is busy, Vite stops instead of taking another one.

### The live service in dev

`npm run dev` uses the live service (`scripts/live.py`, port 8765) if one already runs. Otherwise it
starts one with `.venv/bin/python` and waits up to 10 s for it. The page gets
`VITE_LIVE_API=/api/patch` only if the service listens. If it does not (no `.venv`, Astropy missing),
the dev server log says why and the page gets `VITE_LIVE_API=''`: live fetching is off and the page
must say so (FRM-11), not call a service that is not there.

- Set up Python once per checkout, as above. The service itself needs only
  `scripts/requirements.txt`.
- `SIMA_LIVE=off npm run dev` keeps the service out entirely.
- `VITE_LIVE_API=… npm run dev` (or `npm run build`) points the page at another service.
- Only one service runs on the machine. Whichever dev server started it stops it when it stops;
  the other dev servers then lose it until they restart.

## The lanes

| Lane | Builds | Requirements (SPEC 5) |
|---|---|---|
| **A. Data and service** | Shipped real exposures, the live service, the places catalogue | PLC-1; O-D1 to O-D4 |
| **B. Science core** | Everything in SPEC 7.2: pure functions in `src/core/`, with tests | 7.3 results in tests |
| **C. Sky** | The map, channels, service worker, patch outline, grab and click rules, dots and labels | SKY-1 to 9, FRM-1 to 4, PLC-2, 3, 8 |
| **D. Frame and bar** | Loading patches, painting, six views, playback, date scale, wavelength scale, detector strip | FRM-5 to 12, BAR-1 to 6 |
| **E. Measure and tools** | Measure panel, charts, found list, the four tool tabs, candidates, CSV | MSR-1 to 8, TLS-1 to 8 |
| **F. Shell** | Top row, rail, frame placement and glide, loading cards, keys, Escape order, search box, Share, About, embed | GEN-1 to 7, layout of 4.1 at both sizes |
| **G. Places** | Catalogue reading, search source, chips, lists, cards, tours, saved places | PLC-4 to 7 |
| **H. Guide** | Welcome card, starters, tour, close-up, hints, explanations, tips | GDE-1 to 8 |
| **Integrator** | The build, the shared contracts, the smoke test, merges | 11.1 |

## Every file and its owner

A lane may add new files inside folders it owns. Name them in your report. Files marked *(to
create)* do not exist yet; their lane creates them.

| Owner | Files |
|---|---|
| **A** | `scripts/prebake.py`, `scripts/live.py`, `scripts/build_places.py`, `scripts/test_*.py`, `scripts/requirements.txt`, `scripts/places_requirements.txt`, `scripts/Dockerfile.live`, `scripts/.dockerignore`, `scripts/deploy/*`, `public/data/**`, `src/data/places.json`, `src/data/schema.ts`, `docs/data-format.md`, `docs/live-service.md`, `docs/places.md` |
| **B** | `src/core/*.ts` (every file; `types.ts` is a contract, see below), `tests/data-contract.test.ts`, the core tests it adds (`tests/<area>.test.ts`) |
| **C** | `src/sky/sky.ts`, `src/sky/markers.ts`, `src/styles/sky.css`, `public/sky-tiles-sw.js` *(to create)*, `public/sky-seed/` *(to create)*, `scripts/seed-tiles.ts` *(to create; `npm run seed:sky` runs it)* |
| **D** | `src/viewer/state.ts` (a contract), `src/viewer/load.ts`, `src/viewer/render.ts`, `src/viewer/playback.ts`, `src/viewer/frame.ts`, `src/viewer/bar.ts`, any other new file in `src/viewer/` (such as `paint.ts`, `scrub.ts`), `src/styles/frame.css`, `tests/state.test.ts` |
| **E** | `src/viewer/detail.ts`, `src/viewer/tools.ts`, `src/viewer/inbox.ts` *(to create: "Found in this patch" and the candidate list)*, `src/styles/tools.css` |
| **F** | `index.html`, `src/styles/app.css`, `src/styles/shell.css`, `src/styles/fonts/*`, `src/shell/shell.ts`, `src/shell/icons.ts`, `src/viewer/omnibox.ts`, `src/viewer/url.ts`, `src/viewer/share.ts` *(to create; Share is in `shell.ts` for now)*, `src/page/` *(to create, if wanted)* |
| **G** | `src/shell/places.ts`, `src/shell/objects.ts` *(to create, if wanted)*, `src/data/tours.ts` *(to create)*, `src/styles/places.css` |
| **H** | `src/guide/*`, `src/explore/*`, `src/styles/guide.css` |
| **Integrator** | `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `src/main.ts`, `src/env.d.ts`, `src/shell/bus.ts` (a contract), `tests/bus.test.ts`, `tests/smoke/run.ts`, `tests/smoke/smoke.ts`, `tests/smoke/flows/0-skeleton.ts`, `.gitignore`, `.prettierrc.json`, `.prettierignore`, `README.md`, `PRODUCT.md`, `assets/icon.svg`, `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, `docs/SPEC.md`, `docs/SPEC-v1-workspace-plan.md`, `docs/tools.md`, `docs/spec-img/*`, `docs/lanes.md` |

`docs/tools.md` describes lanes B and E's work. Send changes to it as a patch in your report.

### The contracts

These files are shared promises. A lane may change their insides freely, but their exported shapes
change only with the integrator's agreement (AGENTS.md rule 7). Adding an optional field is fine
if you say so in your report.

| File | Owner | What it fixes |
|---|---|---|
| `src/core/types.ts` | B | Data types. The file-format types match `public/data/*/frames.json` and the live service field for field; `tests/data-contract.test.ts` checks it. |
| `src/shell/bus.ts` | Integrator | The five messages between the sky half and the frame half (SPEC 8.3). |
| `src/viewer/state.ts` | D | `S`, the frame half's one state object, and who writes each field. |
| The exports in SPEC 8.4 | Each module's owner | Signatures are fixed; each has JSDoc with units and behaviour. |

## The bus (SPEC 8.3)

The sky half (`src/sky`, `src/shell`) and the frame half (`src/viewer`, `src/core`) talk only
through `src/shell/bus.ts`. Units: degrees, arcminutes (field size), µm, MJD, detectors 1 to 6.

| Message | Sent by | Heard by | Holds |
|---|---|---|---|
| `aim` | C (patch dropped, "Move the frame here"), F (`openPlace`, used by G) | D (`frame.ts` loads the spot) | `ra`, `dec`, optional `fov`, optional `target` |
| `patch` | D, at every change and loading step | C (draws the square: solid, dashed, dotted) | `ra`, `dec`, `fov`, `source`, `label`, `target` |
| `start` | H (`openStarter`); others call `openStarter` | H (`game.ts` sets the task and loads) | `starter` |
| `band` | D (wavelength scale, detector strip), anyone who wants a detector | D | `det` |
| `shown` | D, whenever the picture or the wavelength changes | C (sky channel, sky note) | `lam` (null in Color), `mjd`, `det` |

`on(type, fn, { replay: true })` hands a late listener the last message of its type. Use it for
`patch`, `band` and `shown`. A message with a value out of range (a unit mix-up) is reported with
`console.error`, so the smoke test catches it.

## Who writes which field of `S`

Everyone may read `S`. Write a field only if your lane is named. Assign whole values
(`S.pic = { ...S.pic, invert: true }`); `watch(keys, fn)` hears batched changes.

| Fields | Written by |
|---|---|
| `ra`, `dec`, `fov`, `target`, `label`, `source`, `set`, `field`, `load` | D (`load.ts`). Others call `aimAt` or `loadTarget`. |
| `groups`, `epoch`, `ref`, `playing`, `loop`, `speed` | D. Others call `play`, `pause`, `step`, `setEpoch`. |
| `level` | H (`setLevel`). |
| `mode` | D; H's tour may switch it; F's `url.ts` sets it from a link. |
| `det`, `lam`, `color`, `sameColour`, `swipe` | D. Others emit `band`. |
| `pic` | E; F's `url.ts` from a link. Read the settings in force with `pic()`. |
| `picLinked` | F (`url.ts`). |
| `original` | E. |
| `selected` | E; H's game may set it. |
| `tools` | D (the frame's sliders button); E (its close button). |
| `toolsTab`, `measureTab`, `allNumbers` | E. E saves and restores `allNumbers` inside `sima-guide`. |
| `embed` | F (`url.ts`). |

## The exported functions (SPEC 8.4), and a few more

| Module | Owner | Others may call |
|---|---|---|
| `core/*` | B | The pure functions of SPEC 7.2; `core/targets.ts` `TARGETS`, `targetByKey` |
| `sky/sky.ts` | C | `startSky`, `setLayer`, `flyTo`, `camera`, `toScreen`, `toWorld`, `outline`, `onSkyClick`, `onPointer`, `onZoom`, `grabbable`, `grid`, `retry` |
| `sky/markers.ts` | C | `setDots`, `showGroups`, `setHover`, `setChosen`, `keepClear`, `pick`, `inView`, `onRest` |
| `viewer/state.ts` | D | `S`, `watch`, `FOVS`, `Mode`, `Level`, `VIEWS`, `SPEEDS`, `pic()`, `nearestFov`, `emptyPasses` |
| `viewer/load.ts` | D | `loadTarget(id)`, `aimAt(ra, dec, fov)` |
| `viewer/render.ts` | D | `draw()`, `drawHooks`, `hud()`, `exif()`, `onTap` (taps on the picture) |
| `viewer/playback.ts` | D | `play`, `pause`, `step`, `setEpoch` |
| `viewer/detail.ts` | E | `detail(sel)`, `selectTab(tab)` |
| `viewer/omnibox.ts` | F | `addSearchSource(source)` |
| `viewer/url.ts` | F | `readLink`, `linkFor` |
| `shell/shell.ts` | F | `frameRect`, `openPlace`, `hideFrame`, `flyFree`, `greet`, `skyReady` |
| `shell/icons.ts` | F | `icon(name)`. Ask F for a new icon rather than drawing your own. |
| `explore/game.ts` | H | `setLevel`, `openStarter`, `revealTarget`, `pointOut`, `STARTERS` |
| `guide/index.ts` | H | `startGuide()` |

Each part's `start…()` function is called once by `src/main.ts` (integrator). A part that throws
while starting is reported and the others still start.

## Mount points (`index.html`)

Only lane F edits `index.html`. A lane that needs a new mount point asks lane F. The lane named
fills the element and styles what is inside it; lane F (app.css, "Page skeleton") places it.

| Id | Filled by | What |
|---|---|---|
| `sky` | C | The sky map. Fills the window. |
| `sky-marks` | C | Drawn on the sky: patch outline, tether, dots, labels, pins. Pointer events pass through. |
| `sky-note` | C | Bottom left: what the map is (H1), which channel, what was filled in. |
| `sky-coords` | C | Bottom right: the pointer's coordinates. |
| `sky-click` | C | "Move the frame here" at the clicked spot (FRM-3). |
| `top-left` | F | Holds `wordmark`, `search`, `search-results`, `chips`. |
| `wordmark` | F | سيما then Sima. |
| `search` | F | The search field. |
| `search-results` | F | Suggestions (manual popover). Lane G's results come through `addSearchSource`. |
| `chips` | G | Stars, Nearby, Changing, Clusters, Nebulae, Galaxies, Tours, Surprise me. |
| `actions` | F | Guide, Places, Share, About. |
| `sky-loading` | F | The sky's loading card, top centre. Lane C reports through `skyReady()`. |
| `rail` | F | Zoom in, zoom out, sky map, coordinate grid. |
| `sky-layers` | F | The sky map chooser (popover). |
| `frame` | F places it; D fills it | The frame card. |
| `frame-head` | D | Name, source line, field size, tools button, Measure, close. |
| `frame-task` | H | The task and Hint. |
| `frame-load` | D | The loading line; keeps its height (O-I5). |
| `frame-pic` | D | The picture: canvas, date badge, scale bar, north and east. |
| `pic-tools` | E | Over the picture: "Original" and the "Processed:" label (H8). |
| `frame-cover` | D | The busy cover over the sky map's preview. |
| `frame-views` | D | Flip, Two dates, Difference (and Swipe, Stack, Trail in Measure). |
| `frame-exif` | D | The one data line (FRM-10, H2). |
| `frame-explain` | D | In Measure: what the view shows. |
| `frame-legend` | E | Legends for what the tools draw on the picture. |
| `frame-grip` | F | The size corner, bottom left. |
| `measure` | E | Measure, beside the frame. Lane E puts an empty `#detectors` in it for lane D's strip. |
| `tools` | E | The picture tools. |
| `bar` | D | Play controls, date scale, loop and speed, wavelength scale. |
| `places-menu` | G | The Places menu (popover). |
| `places-list` | G | A list of one kind, or the tours. |
| `place-card` | G | One place's card. |
| `welcome` | H | The welcome card. |
| `guide-menu` | H | The Guide menu (popover). |
| `tour` | H | The tour's dimmer, ring and step card. |
| `tip` | H | A one-time tip. It is a card: it never covers another card. |
| `explain` | H | "Explain the screen" labels. |
| `share`, `about` | F | Dialogs, opened with `showModal()`. |
| `toasts` | F | Short messages above the bar. |
| `tooltip` | F | The one tooltip, for every element with `data-tip`. |
| `narrow-note` | F | "Open it on a computer" under 700 px (O-W3). |

### Attributes every lane keeps

| Attribute | Meaning |
|---|---|
| `data-card="name"` | A card floating on the sky. No two visible cards may overlap and none may leave the window: the smoke test checks. Lane C keeps sky labels clear of every visible `[data-card]`. |
| `data-overlay="name"` | A popover, dialog, tip, tour or toast that may sit over cards. Not checked for overlap. |
| `data-escape="N"` | Escape closes the visible one with the highest N by clicking the `[data-close]` button inside it: 50 small cards (click card, tip, explain), 30 lists and cards, 20 tools, 10 Measure (GEN-1). Native popovers and modal dialogs close on Escape by themselves, first. A part that handles Escape itself calls `preventDefault()`. |
| `data-close` | The button Escape presses in a `[data-escape]` element. |
| `data-guide="name"` | A stable name the guide and the smoke test use to find a part. Keep it when you rebuild the part. |
| `data-scroll` | The one element of a card that may scroll inside (a long list). |
| `data-tip`, `data-tip-pos` | Tooltip text, and `right` (rail) or `above` (bar); below by default. Every icon button has one. |

`<html>` gets `data-started` once every part has started, `data-ready` once their start promises
settled (the smoke test waits for it), and `data-embed` with `embed=1`.

### `data-guide` names

Names in `index.html` are listed with the mount points above. Names inside parts:

| Owner | Names |
|---|---|
| C | `move-frame-here` |
| D | `play`, `dates`, `wavelength`, `wavelength-handle`, `measure` (the frame's Measure button), `tools-button`, `fov-smaller`, `fov-larger`, `frame-hide`, `view-flip`, `view-swipe`, `view-two`, `view-diff`, `view-stack`, `view-trail` |
| E | `original`, `all-numbers`, `chart`, `detectors`, `tools-tab-picture`, `tools-tab-clean`, `tools-tab-find`, `tools-tab-layers` |
| F | `guide-button`, `places-button`, `share-button`, `about-button`, `zoom-in`, `zoom-out`, `sky-map-button`, `grid-button`, `sky-map-spherex`, `sky-map-wise-w1`, `sky-map-wise-w2` |
| G | `chip-stars`, `chip-nearby`, `chip-changing`, `chip-clusters`, `chip-nebulae`, `chip-galaxies`, `chip-tours`, `chip-surprise-me` |
| H | `starter-runaway`, `starter-made-of`, `starter-too-faint`, `welcome-own`, `hint` |

To add a name, add it in your own part and list it in your report.

## Stylesheets

Each lane styles only its own classes, in its own stylesheet. Colours, sizes, radii, shadows,
stacking layers and motion come from the tokens in `app.css`; never type them by hand. The shared
components (`.btn`, `.btn.primary`, `.btn.quiet`, `.btn.text`, `.link`, `.icon-btn`, `.play-btn`,
`.seg`, `.tabs`, `.switch`, `.card`, `.popover`, `.menu-item`, `.dialog`, `.tooltip`, `.pill`,
`.window`, `.window-badge`, `.field`, `.kbd`, `.term`, `.group-label`, `.appear`) are used as they
are; ask lane F to change one. All stylesheets are imported by `src/main.ts`.

| Stylesheet | Owner |
|---|---|
| `src/styles/app.css` | F: tokens, fonts, base, shared components, page skeleton |
| `src/styles/shell.css` | F |
| `src/styles/sky.css` | C |
| `src/styles/frame.css` | D |
| `src/styles/tools.css` | E |
| `src/styles/places.css` | G |
| `src/styles/guide.css` | H |

## Browser storage (SPEC 8.5)

Wrap every read and write in `try`; storage can be blocked.

| Key | Holds | Owner |
|---|---|---|
| `b102-level` | Explore or Measure | H |
| `frame-box` | The frame's position and size | F |
| `sky-places` | Saved places | G |
| `sima-guide` | Tour progress, seen tips, "all numbers" | H (E writes `allNumbers`). Always merge into this entry, never overwrite it |
| `sima.tools` | Picture settings, threshold, list filter and order | E |

## Links (SPEC 8.5)

`ra`, `dec` (degrees), `fov` (arcminutes), `det` (`D1` to `D6`, or `color`), `view` (a `Mode`),
`target`, `date` (YYYY-MM-DD, UTC), `pic` (`core/picture.ts` `encodePic`), `embed=1`. Lane F's
`url.ts` reads and writes them. A parameter it does not understand is named in a note.

## The smoke test

`npm run smoke` runs every flow in `tests/smoke/flows/` at 1900×1030 and 1366×768. After loading and
after every step it fails on any console error, any page scroll, or any two visible `[data-card]`
elements overlapping or leaving the window. `tests/smoke/smoke.ts` explains the rest.

- **Add a flow:** make `tests/smoke/flows/<lane>-<name>.ts` (for example `d-frame.ts`) exporting
  `flows: Flow[]`. Find parts by `data-guide` name (`pressStep('play')`). Never edit another lane's
  flow file.
- **Run some:** `npm run smoke -- measure` runs flows whose name contains "measure".
- **See it:** `SMOKE_SHOTS=1 npm run smoke` saves a screenshot of every step in
  `test-results/smoke/`. A failed step is always saved.
- The demo flow of SPEC 9.6 is in `0-skeleton.ts`. When your lane builds a missing step (the tour
  ringing Play, tapping the mover, "10.39″/yr"), ask the integrator to add it there.

## What phase 0 left fake

Every function whose JSDoc says **PHASE 0 STUB** returns a fixed fake value or does a crude job
(`grep -rn "PHASE 0 STUB" src`). What a visitor sees:

- **Sky (C):** a drawn star field, named "Placeholder sky (phase 0)" in the sky note; no Aladin.
- **Frame (D):** 18 made-up pictures labelled "Placeholder" on the picture, in the title, the
  source line and the data line. Source `simulated`, so the square is dashed amber. The real
  Barnard's Star files are in `public/data/barnard/` and wait for lane B's decoder.
- **Core (B):** every function returns a fixed fake value. `formatDate` says "Jun 2026" for any date
  and `formatCoords` says "12h 34m 56.00s +12° 34′ 56.0″" for any position, on purpose, so fakes
  are easy to spot. `TARGETS` already carries the real catalogue values from each `frames.json`.
- **Measure and tools (E):** "Not measured yet" with a Placeholder pill; tabs that switch.
- **Places (G):** the real catalogue (2,931 places) as dots, search, lists and cards, with simple
  rules: substring search, first 60 of a kind, no facts table, no tours.
- **Guide (H):** the welcome card and the task line work; the tours, hints and tips do not.
- **Shell (F):** no frame dragging or sizing, no glide, placeholder Share and About, only the `/`
  and Escape keys.

## Things every lane should know

- **Live data:** `docs/live-service.md` is what the service sends. SPEC 6.3 sketches older names
  (`done` for the finished state); `LiveStatus` in `types.ts` follows the service: `ready`, `empty`.
- **Chips give way to cards.** At 1366, and at 1900 with Measure open, the frame reaches the chips
  row. `shell.ts` gives the chips row the room left of the nearest card, and chips that do not fit
  are clipped away, as in `docs/spec-img/20-1366-measure-all.jpg`. The clipped chips can still take
  keyboard focus: lane G should offer them another way (a "More" menu) and lane F may change the
  rule.
- **The tools panel hangs under the chips row** (top 112 px, as in `spec-img/06`), left of the
  frame.
- **Known collisions the flows do not cover yet:** at 1366 with Measure open, the places list and
  place card (left 74 to 434 px) reach the frame (from 426 px) and the tools panel. Lanes F and G
  settle it (a narrower list, or opening a list closes the tools).
- **Measure's width** is DESIGN's `clamp(380px, 40vw, 760px)` at all times. The old build's calm
  Measure was narrower (about 380 to 440 px). Lanes E and F decide.
- **The frame's height:** phase 0 sizes the picture as `min(480px, 100vh − 440px)` so the frame
  clears the bar at 1366×768 (`--frame-picture` in app.css). Lane F replaces this with the user's
  remembered box.
- **Honesty:** never show a NaN or a fake number as data. `TARGETS[…].kind` is empty for four
  targets and `period` is null for all five until lane B fetches them from a named catalogue; the UI
  leaves an empty fact out (H9).
