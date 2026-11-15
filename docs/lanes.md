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

| Lane (v2.0) | Port |
|---|---|
| C. Sky | 5173 |
| DE. Frame, bar, Measure and tools | 5174 (5175 spare) |
| F. Shell, glass, settings and places | 5176 (5177 spare) |
| H. Missions engine | 5178 |
| Integrator | 5180 |
| K. Discover interface | 5181 |
| M. Phone layout and sheet | 5182 |
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

## The lanes (v2.0)

v2.0 (Night Glass, Discover and phones) is built by six lanes plus the integrator. The plan is
`docs/design-v2/BEGINNER-AND-MOBILE.md` section 14, with its eight lanes merged into six: F takes
v1's F and G, DE takes D and E. Lanes A and B (data and science core) keep their files from the
table below and are not active in v2.0. **No file has two owners.** Files marked * are new.

| Lane | Builds | Owns |
|---|---|---|
| **F. Shell, glass, settings, places** | Night Glass tokens and materials, Solid and its fallbacks, the governor, Settings, the view switch, links (`ui=`, `mission=`), top rows, the phone menu, the sandbox reading exports; the places restyle (Raised place card, Discover wording, Arabic text face) | `index.html`, `src/styles/app.css`, `src/styles/shell.css`, `src/styles/fonts/*`, `src/shell/shell.ts`, `src/shell/layout.ts` (desktop card placement), `src/shell/escape.ts`, `src/shell/toast.ts`, `src/shell/icons.ts`, `src/shell/finds.ts`, `src/shell/view.ts`, `src/shell/glass.ts`, `src/shell/settings.ts`*, `src/styles/settings.css`*, `src/shell/sandbox.ts`, `src/viewer/url.ts`, `src/viewer/link.ts`, `src/viewer/share.ts`, `src/viewer/omnibox.ts`, `src/page/*`; from v1's G: `src/shell/places.ts`, `src/shell/objects.ts`, `src/shell/places/*`, `src/data/tours.ts`, `src/styles/places.css`; `tests/link-view.test.ts`, `tests/sandbox.test.ts`, `tests/places.test.ts` |
| **C. Sky** | The globe at full zoom-out (SIN projection, 0.3 s cross-fade both ways), the intro → globe cross-fade, limb glow, mission beacons, labels on Thin chips over bright sky, keep-clear for Discover | `src/sky/*`, `src/styles/sky.css`, `public/sky-tiles-sw.js`, `scripts/seed-tiles.ts`, `tests/sky-*.test.ts`. The intro's files stay with the integrator; C listens for `html[data-intro]` and asks the integrator for a "globe turned" event if needed |
| **DE. Frame, bar, Measure, tools** | Frame and bar in Slate and Regular; the Discover frame (56 px Play, date chips, four views); contract 4 (`trialResult`); the phone frame header and Expert-on-phone compact bar; Measure and the picture tools in Slate; `S.measureOpen`; Measure in the phone column | `src/viewer/*` except lane F's `url.ts`, `link.ts`, `share.ts`, `omnibox.ts`: so `state.ts` (a contract), `load.ts`, `render.ts`, `paint.ts`, `playback.ts`, `frame.ts`, `bar.ts`, `motion.ts`, `scrub.ts`, `strip.ts`, `surround.ts`, `preview.ts`, `chips.ts`*, `detail.ts`, `tools.ts`, `inbox.ts`, `src/viewer/measure/*`, `src/viewer/tools/*`; `src/styles/frame.css`, `src/styles/tools.css`; `tests/state.test.ts`, `tests/surround.test.ts`, `tests/trial-result.test.ts`, `tests/measure.test.ts`, `tests/tools*.test.ts`, `tests/viewer.test.ts` |
| **H. Missions engine** | The three missions' data and pure checks, progress, plain sentences, Planet X's edge search, "Try another object" templates; the guide | `src/explore/*` (incl. `missions.ts`, `progress.ts`, `plain.ts`*, `plan-x.ts`*), `src/guide/*`, `src/styles/guide.css`, `tests/missions.test.ts`*, `tests/progress.test.ts`, `tests/guide.test.ts` |
| **K. Discover interface** | Welcome, home (mission list, skills record, "Try another object"), mission card, success card, coach | `src/discover/*`*, `src/styles/discover.css`* |
| **M. Phone layout and sheet** | Fit and scroll layouts, the sheet, the Back rule, full-height pages | `src/shell/sheet.ts`, `src/shell/phone.ts`* (the phone layout; section 14 calls it `layout.ts`, a name lane F already uses), `src/styles/sheet.css`*, `tests/sheet.test.ts`* |
| **Integrator** | `main.ts` wiring; `workspace.css` on the tokens; smoke flows; the release gate (section 15) | `src/main.ts`, `src/styles/workspace.css`, `src/styles/extras.css`, `src/workspace/*`, `src/intro/*`, `src/styles/intro.css`, `src/shell/bus.ts`, `tests/smoke/*`, `docs/*`, and the build files listed below |

Stylesheets: each lane styles only its own classes in its own stylesheet, on the `--v2-*` tokens
in `app.css`. `backdrop-filter` is written only in `app.css` (GLS-1).

**The logo is undecided.** Keep today's wordmark (سيما, then Sima) until the team picks one.

**Requests between lanes** follow AGENTS.md: write the exact patch in your report.

## Night Glass materials (v2.0, for every lane)

Lane F switched the whole app to Night Glass (DESIGN-v2.md). What that means for your files:

- **The v1 token names still work and are now Night.** `--card` is the opaque Night tint, `--card-2`,
  `--card-3`, `--card-4` are white 7%, 12% and 18% fills, `--ink`, `--ink-2`, `--ink-3` are
  `on-glass`, `-2` and `-3`, `--rule` is white 10%, and `--good`, `--warn`, `--bad` and their
  `-soft` fills are the Night values. New: `--on-action-soft` (text on `--action-soft`), `--path`,
  `--skill`, `--lift-1`, `--lift-2`. The `--v2-*` names are the same values.
- **Never ultramarine or magenta text on glass.** `color: var(--action)` fails 4.5:1 on Night. Use
  `--ink` (with an underline for a link, as `.link` does) or `--on-action-soft` on `--action-soft`.
- **Pick a material by job and give your element one class** (they are in app.css, "Materials"):

  | Class | Material | For |
  |---|---|---|
  | `.glass-thin` | Thin | Chips, labels and tags on the sky |
  | `.glass` | Regular | Chrome that stays (top row, rail, bar, the mission list). Every `.card` is Regular unless listed below |
  | `.glass-raised` | Raised | What opens: popovers, menus, the mission, success, welcome and coach cards, toasts, tooltips |
  | `.slate` | Slate (opaque) | Anything holding a picture or chart, and reading panels: the frame, Measure, tools, dialogs, the phone sheet |
  | `.well` (`.well.chart`) | Well | The opaque black (or `st-bg`) box a picture or chart sits in, with its 1 px inner line |

  These mount points already have their material, so their lane need not add a class:
  Regular: `#wordmark`, `#search`, `#actions`, `#view-switch`, `#rail`, `#bar`, `#discover-list`,
  `#sky-loading`, `#frame-show`. Raised: `.popover`, `.tooltip`, toasts, `#places-list`,
  `#place-card`, `#finds`, `#sandbox`, `#welcome`, `#mission`, `#mission-success`, `#coach`,
  `#settings`, `#sky-click`, `#tip`, `#places-menu`, `#guide-menu`. Slate: `.card.panel`,
  `.dialog`, `#frame`, `#measure`, `#tools`, `#sheet`, `.wf`.
- **The material sets the background and the shadow.** The rules weigh nothing (`:where`), so
  your own `background` or `box-shadow` on that element wins and the element stops being glass.
  Leave them off. If a shared class gives your element a background (a `.btn` chip), write
  `background: var(--mat-bg)` to take the material back. To change only the tint, set
  `--mat-tint` on the element.
- **Never write `backdrop-filter`** outside app.css (GLS-1, tested). Never fade, filter, mask or clip
  a parent of a glass element: fade the glass element itself (GLS-4, smoke). Never put a picture
  or chart under or inside glass (GLS-6, smoke).
- **Glass or Solid** is `html[data-glass="glass" | "solid"]`, set once by `shell/glass.ts`. Read it
  with `glassLevel()` and `onGlass()`; never read the media queries yourself. Solid is the default
  on phones and on software renderers (the smoke browser is one: flows that need glass choose it in
  Settings, `panels-glass`).
- **Arabic names** go in a `<bdi lang="ar" dir="rtl">` (lane F's `arabicSpan` in
  `shell/places/state.ts`), at 14 px or more; `:lang(ar)` sets the Arabic text face.

## The lanes (v1, for reference)

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
| **Integrator** | The build, the shared contracts, the smoke test, merges; the workspace (extra frames) | 11.1; SPEC 10 O-V1 to O-V4 |

## Every file and its owner

For v2.0 the table "The lanes (v2.0)" above wins where the two differ. This table is v1's.

A lane may add new files inside folders it owns. Name them in your report. Files marked *(to
create)* do not exist yet; their lane creates them.

| Owner | Files |
|---|---|
| **A** | `scripts/prebake.py`, `scripts/live.py`, `scripts/build_places.py`, `scripts/test_*.py`, `scripts/requirements.txt`, `scripts/places_requirements.txt`, `scripts/Dockerfile.live`, `scripts/.dockerignore`, `scripts/deploy/*`, `public/data/**`, `src/data/places.json`, `src/data/schema.ts`, `docs/data-format.md`, `docs/live-service.md`, `docs/places.md` |
| **B** | `src/core/*.ts` (every file; `types.ts` is a contract, see below), `tests/data-contract.test.ts`, the core tests it adds (`tests/<area>.test.ts`) |
| **C** | `src/sky/sky.ts`, `src/sky/markers.ts`, `src/styles/sky.css`, `public/sky-tiles-sw.js` *(to create)*, `public/sky-seed/` *(to create)*, `scripts/seed-tiles.ts` *(to create; `npm run seed:sky` runs it)* |
| **D** | `src/viewer/state.ts` (a contract), `src/viewer/load.ts`, `src/viewer/render.ts`, `src/viewer/playback.ts`, `src/viewer/frame.ts`, `src/viewer/bar.ts`, any other new file in `src/viewer/` (such as `paint.ts`, `scrub.ts`), `src/styles/frame.css`, `tests/state.test.ts`, `tests/surround.test.ts`, `tests/smoke/flows/d-field.ts` |
| **E** | `src/viewer/detail.ts`, `src/viewer/tools.ts`, `src/viewer/inbox.ts` *(to create: "Found in this patch" and the candidate list)*, `src/styles/tools.css` |
| **F** | `index.html`, `src/styles/app.css`, `src/styles/shell.css`, `src/styles/fonts/*`, `src/shell/shell.ts`, `src/shell/icons.ts`, `src/viewer/omnibox.ts`, `src/viewer/url.ts`, `src/viewer/share.ts` *(to create; Share is in `shell.ts` for now)*, `src/page/` *(to create, if wanted)* |
| **G** | `src/shell/places.ts`, `src/shell/objects.ts` *(to create, if wanted)*, `src/data/tours.ts` *(to create)*, `src/styles/places.css` |
| **H** | `src/guide/*`, `src/explore/*`, `src/styles/guide.css` |
| **Integrator** | `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `src/main.ts`, `src/env.d.ts`, `src/shell/bus.ts` (a contract), `tests/bus.test.ts`, `tests/smoke/run.ts`, `tests/smoke/smoke.ts`, `tests/smoke/flows/0-skeleton.ts`, `tests/smoke/flows/w-workspace.ts`, `src/workspace/*` (the workspace: `index.ts`, `schema.ts`, `patches.ts`, `frames.ts`, `card.ts`, `menu.ts`, `place.ts`, `tray.ts`, `store.ts`), `src/styles/workspace.css`, `tests/workspace.test.ts`, `.gitignore`, `.prettierrc.json`, `.prettierignore`, `README.md`, `PRODUCT.md`, `assets/icon.svg`, `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, `docs/SPEC.md`, `docs/SPEC-v1-workspace-plan.md`, `docs/tools.md`, `docs/spec-img/*`, `docs/lanes.md` |
| **Intro** (integrator) | `src/intro/*` (`intro.ts`, `scene.ts`, `render.ts`, `worker.ts`, `sphere.ts`, `wanted.ts`), `src/styles/intro.css`, `tests/intro.test.ts`, `tests/smoke/flows/intro.ts`; small hooks in `index.html` (the early check), `src/main.ts`, `src/page/about.ts` ("Play the intro"), `src/viewer/url.ts` (`intro` is a known parameter) and `src/sky/sky.ts` (`introZoom`) |

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
| `sky/sky.ts` (workspace) | C | `setRings(rings)` draws each extra frame's square, number tag and line to its window; `onRingDrop(fn)` hears a ring dropped somewhere else |
| `core/work.ts` (workspace) | B | `keepPatch(key, field, set)` gives the worker another patch to keep (up to eight); `stack(…, { field })` stacks on that field |
| `workspace/index.ts` | Integrator | `startWorkspace(plain)`. Not started with `embed=1`. |
| `guide/index.ts` | H | `startGuide()` |
| `viewer/motion.ts` (v2.0) | DE | `trialResult()`, `TrialResult`, `pickTrialResult` (its pure decision), `setTrial`, `trialMotion` |
| `shell/view.ts` (v2.0) | F | `getView`, `setView`, `onView`, `View`, `rememberedView`, `startView` (main.ts) |
| `shell/glass.ts` (v2.0) | F | `glassLevel`, `onGlass`, `GlassLevel`, `startGlass` (main.ts) |
| `shell/sheet.ts` (v2.0) | M | `openSheet`, `back`, `closeSheet`, `layout`, `onLayout`, `SheetHeight`, `LayoutKind`, `Layout`, `SheetOptions` |
| `shell/sandbox.ts` (v2.0) | F | `sandboxState`, `onSandbox`, `openSandbox({ under })`, `SandboxReading` |
| `viewer/link.ts` (v2.0) | F | `readLink`, `viewFor`, `Link` (also re-exported by `url.ts`) |
| `explore/progress.ts` (v2.0) | H | `progress`, `onProgress`, `startMission`, `leaveMission`, `stepDone`, `resetProgress`, `Progress`, `StepState` |
| `explore/missions.ts` (v2.0) | H | `MissionId`, `MISSION_IDS`, `isMissionId`, `CheckState`, `CheckResult`, `CheckInputs`, `Check`, `keyCheck`, `Mission`, `MISSIONS` |
| `explore/game.ts` (v2.0) | H | `StarterId` gains `ghost` (`too-faint` is its old name); `starterOf(id)` |

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
| `phone-menu` (v2.0) | F | The phone menu under 700 px: Find, Settings, Share, About. (`narrow-note` is gone.) |
| `view-switch` (v2.0) | F | Discover \| Expert, in the top row. Empty and hidden in step 0. |
| `discover-list` (v2.0) | K | Discover's mission list, "Try another object", the skills record. |
| `mission` (v2.0) | K | The mission card. Escape 30. |
| `mission-success` (v2.0) | K | The success card. Escape 30. |
| `coach` (v2.0) | K | The coach card. Escape 50. |
| `settings` (v2.0) | F | Settings: Panels, the motion line, Reset my progress. Escape 30. |
| `sheet` (v2.0) | M | The phone sheet (Slate, peek and half). The Back rule is Escape 30. |
| `workspace` | Integrator | The tool tray (popover) opened from the rail's last button: frame types, Compare, saved workspaces, files. |
| `frames` | Integrator | Holds the extra frames (`.wf`, each a `[data-card]`), their shared menu `#wf-menu` and the "Six frames are open" dialog. |

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
| F | `guide-button`, `places-button`, `share-button`, `about-button`, `zoom-in`, `zoom-out`, `sky-map-button`, `grid-button`, `sky-map-spherex`, `sky-map-wise-w1`, `sky-map-wise-w2`; v2.0: `view-switch`, `view-discover`, `view-expert`, `settings-button`, `settings`, `settings-back`, `panels-glass`, `panels-solid`, `panels-try-glass`, `settings-reset`, `settings-reset-yes`, `phone-menu`, `phone-menu-list`, `phone-find`, `phone-settings`, `phone-share`, `phone-about`, `find-back` |
| G | `chip-stars`, `chip-nearby`, `chip-changing`, `chip-clusters`, `chip-nebulae`, `chip-galaxies`, `chip-tours`, `chip-surprise-me` |
| Intro | `intro`, `intro-skip`, `play-intro` (in About) |
| H | `starter-runaway`, `starter-made-of`, `starter-ghost` (was `starter-too-faint`), `welcome-own`, `hint` |
| Integrator (workspace) | `workspace-button`, `workspace-tray`, `tool-blink`, `tool-two`, `tool-diff`, `tool-spectrum`, `tool-brightness`, `tool-stack`, `tool-info`, `compare-main`, `workspace-name`, `workspace-save`, `workspace-open`, `workspace-export`, `workspace-import`, `share-workspace`; in a frame: `wf-head`, `wf-menu`, `wf-compare`, `wf-close`, `wf-play`, `wf-next`, `wf-exif`; in its menu: `wf-type-<type>`, `wf-link-main`, `wf-link-<frame id>`, `wf-make-main`, `compare-det`, `compare-date`, `compare-type` |

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
| `src/styles/intro.css` | Intro |
| `src/styles/workspace.css` | Integrator (workspace) |

## Browser storage (SPEC 8.5)

Wrap every read and write in `try`; storage can be blocked.

| Key | Holds | Owner |
|---|---|---|
| `b102-level` | Explore or Measure. v2.0: read once by `shell/view.ts` to migrate to `sima-view` | H |
| `sima-view` | v2.0: the view, `discover` or `expert` | F |
| `sima-missions` | v2.0: mission progress. Reset clears only this key; never in a link | H |
| `sima-panels` | v2.0: the visitor's Panels choice, `glass` or `solid` | F |
| `sima-panels-auto` | v2.0: `solid` when the governor found the sky slow with glass on ("Try glass again" clears it) | F |
| `frame-box` | The frame's position and size | F |
| `sky-places` | Saved places | G |
| `sima-guide` | Tour progress, seen tips, "all numbers" | H (E writes `allNumbers`). Always merge into this entry, never overwrite it |
| `sima.tools` | Picture settings, threshold, list filter and order | E |
| `sima-intro` | The opening intro has played in this browser (the smoke runner presets it) | Intro |
| `sima-workspace` | The workspace now (autosave): extra frames and links come back on a plain visit | Integrator (workspace) |
| `sima-workspaces` | Named workspaces (save, rename, open, delete) | Integrator (workspace) |

## Links (SPEC 8.5)

`ra`, `dec` (degrees), `fov` (arcminutes), `det` (`D1` to `D6`, or `color`), `view` (a `Mode`),
`target`, `date` (YYYY-MM-DD, UTC), `pic` (`core/picture.ts` `encodePic`), `embed=1`. Lane F's
`url.ts` reads and writes them. A parameter it does not understand is named in a note.

v2.0 adds `ui=discover|expert` and `mission=runaway|ghost|planet-x` (read in `viewer/link.ts`). The
view a link opens (`viewFor`): `ui` wins; else Expert settings in the link (`view`, `pic`, `det`,
`date`, `#w=`) mean Expert; else the remembered view. Progress is never in a link.

A shared workspace adds `#w=` after them: the workspace as JSON with a schema version, deflated and
base64url-encoded (`workspace/schema.ts`). The page reads it once and removes it from the address.
A damaged or too-new one opens the usual view with a plain message. Share offers the JSON file
instead when the link would pass 4,000 characters.

## The smoke test

`npm run smoke` runs every flow in `tests/smoke/flows/` at 1900×1030 and 1366×768. After loading and
after every step it fails on any console error, any page scroll, or any two visible `[data-card]`
elements overlapping or leaving the window. `tests/smoke/smoke.ts` explains the rest.

- **Add a flow:** make `tests/smoke/flows/<lane>-<name>.ts` (for example `d-frame.ts`) exporting
  `flows: Flow[]`. Find parts by `data-guide` name (`pressStep('play')`). Never edit another lane's
  flow file.
- **Run some:** `npm run smoke -- measure` runs flows whose name contains "measure".
  `npm run smoke -- --only=g` runs lane G's flows (a lane letter, or `integrator`). Runs go up to
  three at a time in one browser, fewer when the machine is busy; `--workers=N` (or
  `SMOKE_WORKERS=N`) sets it.
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
