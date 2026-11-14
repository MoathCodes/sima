# Sky workspace for SPHEREx: implementation spec

Status: draft 1, 13 November 2026. Written for a team that builds with several AI coding tools.

## 1. What we are building

A web tool where the whole screen is the SPHEREx sky. You move around it like a globe. You drop
small tools ("frames") onto any spot. Each frame shows that spot's real exposures: as a little video,
as a difference, as a spectrum. You can place several frames, link them, save the layout, and share it
as a link.

Beginners open a ready-made layout. Researchers build their own.

One sentence for judges: **a workspace on the real SPHEREx sky, where every frame knows its date and
its colour.**

### Goals

1. Answer the challenge: type coordinates, see that patch's SPHEREx images play like a video.
2. Make the user feel inside the data, with direct, instant controls.
3. Let a researcher arrange, compare, save and share views.
4. Never show anything that the telescope did not see without labelling it.

### Not goals

- Flying through space in 3D past stars. Distances are known for few objects, so it would be invented.
- Finding Planet X. SPHEREx is almost certainly too shallow. The tool can show why.
- Accounts, logins, a database of users.
- A phone-first layout. Phones get the starter layouts with one frame; the full workspace is for
  screens 1024 px wide and up.

## 2. Honesty rules (hard requirements)

Every pull request is checked against these.

| # | Rule |
|---|---|
| H1 | The all-sky map is an average over all dates. It is always labelled "Average of all dates". Nothing in it moves. |
| H2 | Every frame shows its source, release, date and wavelength for the picture on screen. |
| H3 | Simulated or planted objects carry a visible "Pretend" tag. They never appear in measurements, lists or exports of real detections. |
| H4 | A number on screen is either measured from pixels, taken from a named catalogue, or labelled as a model. The label says which. |
| H5 | When something could not be measured, the tool says "not measured" and why. No fallback to a model value. |
| H6 | Flagged pixels, missing exposures and failed downloads stay visible. |
| H7 | No sentence claims a discovery. A detection at a catalogue position says "at the catalogue position". |
| H8 | AI-written code and text are disclosed on the page and in the submission form. |

## 3. Who uses it

| User | Needs | Gets |
|---|---|---|
| Newcomer | See something move in under a minute | A starter layout with one frame already playing and a one-line task |
| Volunteer searcher | Check a coordinate from a list, compare dates, share a find | Search, blink frame, known-or-new check, share link |
| Researcher | Compare detectors and dates side by side, measure, keep a session | Free layout, linked frames, saved workspaces, export |

## 4. Words used in this spec

- **Sky**: the full-screen globe view of the all-sky SPHEREx map.
- **Frame**: a movable window pinned to a sky position. It shows real exposures of that position.
- **Frame type**: what a frame shows (Blink, Two-date, Difference, Spectrum, Brightness, Stack, Info).
- **Patch**: the set of real exposures around one position, in the file format of `docs/data-format.md`.
- **Exposure**: one SPHEREx image from one detector at one time. It has its own wavelength at each sky point.
- **Pass**: a group of exposures taken close in time (SPHEREx returns to a spot about every six months).
- **Place**: a saved sky position with a name.
- **Workspace**: the camera position plus all frames, places and settings. It can be saved and shared.
- **Starter**: a workspace we ship, for newcomers.
- **Pretend object**: an object the user plants in the sandbox layer.

## 5. Screen layout

```
+--------------------------------------------------------------------------------+
| [logo]  [ Search: name, coordinates, or filter…            ]  [Workspaces v] [Share] |
+------+-------------------------------------------------------------------------+
| Tool |                                                                         |
| tray |                 SKY  (full screen, drag to move, wheel to zoom)         |
|      |                                                                         |
| Blink|        +--------------------+      +--------------------+               |
| Two  |        | Frame: Blink  D5   |      | Frame: Spectrum    |               |
| Diff |        | [picture]          |======| [chart]            |   <- linked   |
| Spec |        | 19 Aug 2026 4.1 µm |      | 76 points          |               |
| Brt  |        +--------------------+      +--------------------+               |
| Stack|                                                                         |
| Info |   o Place: Barnard's Star                                               |
|------|                                                                         |
|Places|                                                                         |
|Layers|                                                                         |
+------+-------------------------------------------------------------------------+
| |<  >  >|   Pass 1 ····|···· Pass 2 ···|···· Pass 3      speed  [All colours]  |
|  TIMELINE (real exposure dates of the active frame or linked group)            |
+--------------------------------------------------------------------------------+
| Average of all dates · SPHEREx DR1 all-sky cube · 2.41 µm     [wavelength ----o--] |
+--------------------------------------------------------------------------------+
```

- The sky fills the window. Everything else floats over it.
- Tool tray on the left: drag a tool onto the sky to create a frame there.
- Timeline at the bottom: always visible when a frame is active.
- Status strip: what the sky layer is showing (H1).

## 6. Features

Each feature has acceptance checks (AC). "Must" items are the minimum product. "Should" and "Could"
are in build order.

### F1. Sky globe (Must)

Shows the SPHEREx all-sky map as a globe seen from inside.

- Layer: SPHEREx DR1 all-sky cube from IRSA (see 7.1). 102 wavelength channels, about 12.9″ per pixel.
- Drag to move, wheel or pinch to zoom, with inertia. Double-click to zoom in.
- A wavelength slider chooses which of the 102 channels the sky shows. Presets: one per detector band,
  and a three-channel colour mix.
- Other base layers: AllWISE (same IRSA host). The layer name is always shown.
- Coordinate grid and a readout of RA/Dec under the pointer.

AC:
1. Loads the first view in under 3 s on a laptop on broadband.
2. Dragging stays at 30 frames per second or better at 1920×1080.
3. Moving the wavelength slider changes the sky within 500 ms once tiles are cached.
4. The status strip shows "Average of all dates", the release and the wavelength at all times.

### F2. Search and filters (Must: name and coordinates. Should: filters)

- Accepts an object name, or coordinates in decimal degrees or hours-minutes-seconds. Reuse the
  existing parser (`parseCoords`).
- Names resolve through a Sesame name resolver mirror (see 7.4). Our five test targets resolve offline.
- The view glides to the result ("fly-to", 0.8–1.5 s, skippable). Reduced-motion users jump.
- Filters (Should): query a catalogue inside the current view or within a radius. First filters:
  - Gaia DR3: total proper motion above X mas/yr; magnitude range.
  - CatWISE2020: W1−W2 colour above X (cold objects); motion above X.
  Results appear as pins and as a list. Clicking a result flies there.

AC:
1. `17 57 48.5 +04 41 36` and `269.452 4.693` both land on Barnard's Star.
2. `WISE 0855` lands on the corrected position (see 9.6).
3. A filter that returns nothing says so. A catalogue that does not answer says which one, with "Try again".
4. Results are capped (300) with a note when capped.

### F3. Places (Must)

- "Save this place" stores the current centre and zoom with a name.
- Places show as small pins on the sky and in a list. Click to fly there.
- The five challenge targets ship as built-in places.

AC: a saved place survives a reload. Deleting it removes the pin.

### F4. Frames: behaviour common to all types (Must)

- Create: drag a tool from the tray onto the sky. The frame is anchored to the sky position under the drop.
- A frame has a title bar (type, detector, close), a body, and a footer line with source, date and
  wavelength (H2).
- A thin line connects the frame to a ring on the sky showing the exact area it covers.
- Move: drag the title bar. This moves the window, not the anchor. Drag the ring to move the anchor.
- Two modes, toggled per frame: **Pinned to sky** (window follows its anchor as you pan) and
  **Docked** (window stays put on screen, good for side-by-side work).
- Resize from the corner. Minimum 220×220 px.
- Loading states, in order: "Looking for exposures…", "Fetching 6 of 12…", first-look pictures, full set.
  A frame is usable as soon as the first-look set arrives.
- If no real data exists for the spot, the frame says so. It does not fall back to a simulation.
- Each frame has a "…" menu: duplicate, change type, link, copy coordinates, open source file at IRSA.
- Limit: 6 frames open at once (performance and screen space). The seventh asks which to close.

AC:
1. Dropping a Blink tool on Barnard's Star shows real pictures in under 2 s (pre-baked data).
2. Dropping on a fresh spot shows honest progress and first pictures when the service delivers them.
3. With the service off, a frame on a fresh spot says "No live service: real pictures are available for
   the five test targets only."
4. Panning the sky keeps pinned frames attached to their anchors without visible lag.

### F5. Frame types

All types read the same patch. Changing a frame's type does not refetch.

| Type | Shows | Priority |
|---|---|---|
| **Blink** | Exposures of one detector as a little video. Hard cuts, at most 2.5 flips per second. Same-colour filter on by default (see 9.1). | Must |
| **Two-date** | Older date in red, newer in cyan, in one still picture. Default for reduced-motion users. | Must |
| **Spectrum** | Measured flux against wavelength for the selected source. Points appear as exposures play. "Show all at once" button. | Must |
| **Difference** | New minus reference, grey. Shows what changed. | Should |
| **Brightness** | Change over time, one line per detector, each detector compared only with itself. | Should |
| **Stack** | Exposures added along a trial motion. A drag handle sets speed and direction (F9). Always shows the controls beside it: fixed on the sky, motion reversed. | Should |
| **Info** | Table for the picture on screen: exposure id, date, detector, wavelength, release, flags, link to the source file. Plus the catalogue row of a tapped source. | Should |

Shared controls inside image frames: detector strip (D1–D6), stretch, overlay toggles (Gaia, CatWISE,
flags), zoom within the frame.

AC for Blink:
1. On Barnard's Star, the star visibly jumps between passes.
2. Each picture shows "Same colour as the reference (1.76 µm)" or "Different colour: 1.96 vs 2.41 µm".
3. Passes with no same-colour exposure are named as skipped, not silently dropped.

AC for Spectrum:
1. On Epsilon Indi B the water and methane dips are visible after one loop.
2. Saturated or flagged measurements are drawn as lower limits, never as plain points.

### F6. Timeline (Must)

- One timeline at the bottom drives the active frame, or all frames in its link group.
- It shows real exposure dates as ticks, grouped by pass. Drag to scrub. Play, pause, step, speed,
  back-and-forth.
- A moving target leaves a trail of its measured positions in the frame (Should).
- Keyboard: space = play/pause, left/right = step, `[` `]` = previous/next pass.

AC: scrubbing never lands on a pass that has no exposure in the detector on screen.

### F7. Linking and side by side (Must: one link mode. Should: all three)

Borrowed from SAOImage DS9's "lock frames".

- **Link time**: frames step together through dates.
- **Link position**: frames show the same sky area; moving one anchor moves the other.
- **Link detector/colour**: frames switch detector together.
- "Compare" button on a frame: duplicates it docked beside the original with time linked and one
  thing different (the user picks: other detector, other date, other type).
- Linked frames show a small chain icon and a shared colour edge.

AC: with two Blink frames linked in time on the same spot in D2 and D5, stepping one steps both.

### F8. Workspaces (Must: autosave and share link. Should: named workspaces)

- The current workspace autosaves in the browser (`localStorage`, wrapped in try/catch).
- "Share" builds a link that restores the whole workspace: camera, layer, wavelength, frames with
  type, anchor, size, detector, date, link groups, places.
- Named workspaces: save, rename, switch, delete, export/import as a JSON file.
- The simple challenge link still works: `?ra=…&dec=…&fov=…` opens the sky there with one Blink frame.
  `&embed=1` hides the tray and menus (for an iframe).

Link format: `?ra=&dec=&fov=` for the simple case. Full workspace: `#w=<base64url of deflated JSON>`
(schema in 8.4). If the link is over 4,000 characters, offer the JSON file instead.

AC:
1. Opening a share link in a private window restores the same frames on the same places.
2. A corrupt or old link opens the default starter with a plain message.
3. The schema has a version number. Older versions are migrated or refused with a message.

### F9. Game-style direct controls (Should)

Each control acts on real data and updates while you drag.

- **Wavelength slider** on the sky and inside image frames: sweep through the colours. A cold brown
  dwarf fades and returns.
- **Motion handle** on a Stack frame: drag an arrow for speed and direction. The stack sharpens when
  the arrow matches the object's motion. A readout shows the signal-to-noise as you drag. A "snap to
  catalogue motion" button exists when the target has one.
- **Fly-to** on every jump.

AC: dragging the motion handle updates the stacked picture at 10 updates per second or better for a
patch of 24 exposures.

### F10. Starters (Must: three)

A starter is a saved workspace plus a one-line task and up to three hints.

| Starter | Layout | Task |
|---|---|---|
| Runaway star | One Blink frame on Barnard's Star, playing | "One dot jumps. Tap it." |
| What is it made of? | Blink + Spectrum linked on Epsilon Indi B | "Watch the dips appear. Those are water and methane." |
| Too faint to see | Blink + Stack on WISE 0855 | "Nothing in any single picture. Add them along its path." |
| A star that breathes (Should) | Blink + Brightness on R Draconis | "Watch it brighten and fade over 18 months." |

AC: a first-time visitor sees the Runaway star starter playing within 3 s, with no clicks.

### F11. Known or new? (Should)

Tapping a source in a frame shows its Gaia or CatWISE row (id, magnitude, motion) and its SPHEREx
measurements. Empty sky says "No Gaia or CatWISE source here" and offers the coordinates to copy.

### F12. Sandbox layer (Could)

- Toggle "Sandbox". Place a pretend object: choose size (Earth radii), distance (AU), reflectivity.
- The tool computes its brightness and its yearly shift, draws it with a "Pretend" tag (H3), and says
  whether one exposure, or a stack of N, would show it.
- Purpose: the honest version of "could SPHEREx see Planet X?", answered by play.

AC: a pretend object never appears in a Spectrum, Brightness or export of real measurements.

### F13. Export (Could)

Per frame: PNG of the picture with its label, CSV of measurements, and the list of source file URLs.

### F14. Accessibility and performance (Must)

- Everything works by keyboard. Frames are focusable; arrow keys nudge the anchor.
- Blink never exceeds 2.5 flips per second (WCAG 2.3.1). Reduced-motion users get Two-date by default
  and no fly-to animation.
- Colour is never the only signal (letters, labels, shapes).
- Budgets: see section 10.

## 7. Data

### 7.1 Sources (all verified reachable on 12–13 November 2026)

| What | Where | Browser can call it? |
|---|---|---|
| All-sky SPHEREx map, 102 channels (HiPS cube, order 5, 512 px PNG tiles) | `https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube` | Yes (CORS `*`) |
| AllWISE all-sky maps (HiPS) | `https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/W2` and siblings | Yes |
| Exposure search (SIA2) | `https://irsa.ipac.caltech.edu/SIA?COLLECTION=…&POS=circle+ra+dec+r&RESPONSEFORMAT=CSV` | **No** (no CORS) |
| Exposure cutouts | Level 2 file URL + `?center=ra,dec&size=deg` | **No** |
| Same files on AWS | `https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/…` | Yes, byte ranges work, but no search |
| Gaia DR3, CatWISE2020 (browser) | VizieR mirror at CfA, `asu-tsv` | Yes, but unreliable |
| Gaia DR3 (server) | ESA Gaia TAP | No CORS; fine from our service |
| CatWISE2020 (server) | IRSA TAP, table `catwise_2020` | No CORS; fine from our service |
| Name resolver | Sesame mirror (`vizier.idia.ac.za/viz-bin/nph-sesame`) | Yes |
| Globe library | Aladin Lite 3.x from jsDelivr | Yes |

Collections today: `spherex_dr1`, `spherex_qr3`, plus `spherex_dr1_deep`, `spherex_qr3_deep` near the
ecliptic poles. `spherex_qr2` was retired on 12 November 2026. Collection names live in one config
block. The service warns loudly when a configured collection disappears.

Cube tiles: frame 0 is `Norder{k}/Dir{d}/Npix{n}.png`; frame i is `Npix{n}_{i}.png`, i = 1…101.

### 7.2 Patch format

Unchanged from the practice build. Full definition: `docs/data-format.md`. In short, per patch:

- `frames.json`: target or centre, release list, flag bit names, bad-flag list, optional `neighbours`,
  and one entry per exposure (id, detector, MJD, release, source URL, width, height, wavelength at the
  centre, bandwidth, local tangent-plane WCS, zodiacal level, noise, pass window, byte offset).
- `frames.bin.gz`: per exposure, 32-bit flags then 16-bit float pixels, zodiacal model subtracted.

Rules that produced good data (keep them):

- Centre cutouts on the proper-motion-corrected position for the exposure date.
- Choose exposures so the same wavelength comes back in every pass (9.1).
- Keep the first ~135 KB of a cutout (image, flags, variance, zodi); the wavelength table comes from a
  per-detector, per-release cache.
- Retry `503 Server busy` with growing waits. At most 3 requests to IRSA at a time.

### 7.3 Patch service API

One small service. It reuses the download and packing functions of the pre-bake script.

```
GET /api/patch?ra=<deg>&dec=<deg>&fov=<3|6|12>
  200 { id, state: queued|searching|first|rest|done|failed, found, ready, total,
        releases: [...], warning?, error?, first?: {json, bin}, full?: {json, bin} }
  400 { error }            bad input
  503 { error: "busy" }    queue full

GET /api/patch/<id>/<first|full>/frames.json
GET /api/patch/<id>/<first|full>/frames.bin.gz
```

- Inputs are three numbers only. The service never fetches a URL given by a client.
- Position is rounded to 0.001°. Cache key = rounded position + field size + release list.
- First look: one exposure per detector at the oldest and newest pass that have one (up to 12).
- New in this spec (Should): `GET /api/neighbours?ra=&dec=&r=` returning Gaia and CatWISE rows in the
  `neighbours` shape, so the browser does not depend on the unreliable VizieR mirror.
- New in this spec (Could): `GET /api/search?…` proxying the catalogue filters of F2.

Measured: first look 30–110 s for a new spot, about 4 s from cache. Pre-baked targets load in under 2 s.

### 7.4 Pre-baked content

Ship real patches for the five challenge targets (about 8 MB today). Add any patch a starter needs.
Starters must never depend on the live service.

## 8. Architecture and stack

### 8.1 Decisions

| Area | Choice | Why | Rejected |
|---|---|---|---|
| Language | TypeScript, strict | Caught real bugs in the practice build | Plain JavaScript |
| Build | Vite | Already works, fast | — |
| UI | **React 18 + Zustand** | A workspace of draggable, linked, saved frames is state-heavy. Plain DOM got hard to extend. Every AI coding tool writes React well, which matters for a mixed-tool team. | Plain DOM (current), Svelte or Solid (fewer people and tools know them) |
| Sky globe | **Aladin Lite 3** | Draws HiPS maps as a globe with pan, zoom, catalogue overlays. Named in the challenge text. | Writing a HiPS renderer (days of work), CesiumJS or three.js (not built for sky maps) |
| Frame pictures | Canvas 2D, existing paint code | Works, tested | WebGL per frame (not needed at these sizes) |
| Stacking and measuring | Pure TypeScript in `core/`, in a Web Worker | Keeps drags smooth | Doing it on the main thread |
| Charts | Hand-drawn Canvas/SVG, as now | Small, exact control of labels | A chart library |
| Service | Python, reusing the pre-bake functions | FITS and WCS handling already correct there (Astropy) | Rewriting FITS reading in JavaScript |
| Hosting | Static site on any static host; service on any small container host | No lock-in | — |
| Tests | `node --test` for `core/`, Playwright for three end-to-end flows | Already in use | — |

Two things to prove in the first hour (see 12, risk R1):

1. Aladin Lite can show the IRSA cube and switch its wavelength channel fast.
2. We can read the screen position of a sky coordinate on every camera move, to keep frames attached.
   Expected calls, to verify against the Aladin Lite 3 documentation: `aladin.world2pix(ra, dec)`,
   `aladin.pix2world(x, y)`, `aladin.gotoRaDec`, an animated go-to, `aladin.setFoV`, and
   position/zoom change events.

Fallback if (1) fails: load the 102 channels as separate image layers built from the cube's tile URLs.
Fallback if (2) fails: frames are docked only, with the ring drawn through Aladin's own overlay API.

### 8.2 Layers

```
src/
  core/        pure science, no page access, fully tested   (carried over)
    astro, math, wcs, patch (decode), blink (gain match), colour (same-colour), measure (centroid,
    aperture, neighbours), fit (motion), stack, catalog (parse, proper motion), sandbox (brightness model)
  data/        fetching and caching: patches, service client, catalogues, name resolver
  state/       Zustand stores: workspace, frames, places, timeline, settings; schema + migrations
  sky/         Aladin Lite wrapper: camera, layers, wavelength, sky<->screen, pins, rings
  frames/      Frame shell + one folder per frame type
  ui/          tool tray, search, timeline, workspace menu, share dialog, status strip
  starters/    shipped workspaces as JSON + task text
  workers/     stack and measure workers
scripts/       prebake.py, live.py (service), tests
public/data/   pre-baked patches
docs/          SPEC.md, data-format.md, live-service.md
```

Rule: `core/` never imports from anywhere else. `sky/` is the only place that touches Aladin Lite.

### 8.3 What carries over from the practice build

| Keep as is | Adapt | Drop |
|---|---|---|
| `core/` science (patch decode, WCS, same-colour match, centroid, neighbour rule, motion fit, stack, catalogue parsing) and its tests | Paint code becomes the body of image frames; charts become Spectrum and Brightness frames; URL code becomes workspace serialisation | Page shell, Explore game panel, plain-DOM controls, the simulation as a default |
| `scripts/prebake.py`, `scripts/live.py`, pre-baked data | Explore missions become starters | — |

### 8.4 State model

```ts
type FrameType = 'blink' | 'two' | 'diff' | 'spectrum' | 'brightness' | 'stack' | 'info';

interface Camera { ra: number; dec: number; fov: number }        // degrees

interface SkyLayer {
  survey: 'spherex-cube' | 'allwise-w1' | 'allwise-w2';
  channel?: number;                                               // 0..101 for the cube
}

interface FrameState {
  id: string;
  type: FrameType;
  anchor: { ra: number; dec: number };                            // where it looks
  size: 3 | 6 | 12;                                               // patch width, arcminutes
  mode: 'pinned' | 'docked';
  box: { x: number; y: number; w: number; h: number };            // window, CSS px (docked: screen; pinned: offset from anchor)
  det: 0 | 1 | 2 | 3 | 4 | 5 | 'colour';
  step: number;                                                   // index into the frame's playable steps
  sameColour: boolean;
  ref?: number;                                                   // reference step
  select?: { ra: number; dec: number; cat?: 'gaia' | 'catwise'; id?: string };  // tapped source
  motion?: { pmra: number; pmdec: number };                       // Stack frames, mas/yr
  overlays: { gaia: boolean; catwise: boolean; flags: boolean };
  link?: string;                                                  // link group id
}

interface LinkGroup { id: string; time: boolean; position: boolean; detector: boolean }

interface Place { id: string; name: string; ra: number; dec: number; fov: number }

interface Workspace {
  v: 1;                                                           // schema version
  name: string;
  camera: Camera;
  layer: SkyLayer;
  frames: FrameState[];
  links: LinkGroup[];
  places: Place[];
  playing: boolean;
  speed: 'slow' | 'normal' | 'fast';
  sandbox?: PretendObject[];
}

interface PretendObject { id: string; ra: number; dec: number; radiusEarth: number; distAU: number; albedo: number }
```

- Patches are not part of the workspace. They are fetched by anchor and size, and cached in memory
  by patch id (and in the browser cache by URL).
- Serialisation: `JSON.stringify` → deflate → base64url, in the URL fragment. Round-trip tested.

### 8.5 Data flow for a dropped frame

1. Drop → `frames.add({type, anchor})`.
2. `data/patches.get(anchor, size)`: pre-baked manifest match within the patch? Use it. Else ask the
   service; poll status every 1.5 s; deliver first look, then full.
3. `core/patch.decode` → build playable steps for the frame's detector (same-colour filter, empty
   passes removed).
4. Frame body renders from the patch and the frame's state. Timeline reads the same steps.
5. Measurements (centroid, spectrum points, stack) run in a worker and are cached per patch + source.

## 9. Science rules carried over

These cost time to learn. Do not relearn them.

1. **Every exposure has its own wavelength at each sky point.** Blink compares same-colour exposures:
   wavelengths within half a channel width (`bw`/2). Choose exposures at download time so partners
   exist (26% → 85% matches in practice).
2. **Brightness is compared per detector, never across wavelengths.**
3. **Bright stars overload the detector.** Their cores are flagged. Position comes from a profile fit
   to the clean pixels around the core. Brightness comes from a ring outside the core and is labelled
   "from the outer glow".
4. **Bad pixels**: use the flag names in each file's header (two header styles exist). Treat as bad:
   TRANSIENT, OVERFLOW, SUR_ERROR, NONFUNC, MISSING_DATA, HOT, COLD, NONLINEAR, PERSIST, OUTLIER,
   DICHROIC, SATELLITE_HALO, and the rest of the list in `prebake.py`. SOURCE is not bad.
5. **Zodiacal light** is subtracted before storing; its level is kept for display.
6. **Catalogue positions need the right epoch.** WISE 0855: RA 133.787082, Dec −7.244433 at 2014.0,
   motion −8118, +680 mas/yr, parallax 449 mas (Luhman & Esplin 2016). The position in the challenge
   text is the 2010 one.
7. **Neighbours**: skip an exposure when a listed Gaia or CatWISE source within 12.3″ is bright enough
   to matter. Rule and format in `docs/data-format.md`.
8. **Parallax cannot be measured** from three or four passes six months apart. Fit it, show the
   catalogue value.
9. **Stacking**: a simple aperture does not separate "along the motion" from "fixed" when the object
   moved about one pixel. A claim needs the joint fit with neighbours and a null at short wavelengths.
   Always show the controls.
10. **Pixels are 6.15″.** Motions under about 4″ a year do not show as a jump in 1.5 years.

Reference results to reproduce (DR1 + QR3, 13 November 2026):

| Target | Result |
|---|---|
| Barnard's Star | 10.39 ± 0.25″/yr measured; catalogue 10.39 |
| Epsilon Indi B | 4.57 ± 0.09″/yr; catalogue 4.68; water and methane dips in the spectrum |
| WISE 0855 | Not seen in single exposures; stack 15.6σ (D5, 12 exposures), 7.2σ (D6, 11), null at 0.7–2.4 µm |
| R Draconis | 18 months; up to 0.98 mag change in D6 |
| RW Aurigae | Up to 0.82 mag change |

## 10. Performance budgets

| Thing | Budget |
|---|---|
| First paint of the sky | 3 s |
| Starter playing (pre-baked) | 3 s from page open |
| Pan and zoom | 30 fps or better with 4 frames open |
| Frame step (blink) | under 50 ms |
| Wavelength slider on the sky | under 500 ms per change, cached tiles |
| Motion-handle stack update | under 100 ms for 24 exposures |
| JavaScript shipped, gzipped, without Aladin Lite | under 300 KB |
| Pre-baked data in the repo | under 12 MB |

## 11. Build order

### Lanes (one owner each; files do not overlap)

| Lane | Owns | Depends on |
|---|---|---|
| A. Sky | `sky/`, layers, wavelength slider, fly-to, pins, rings | Aladin Lite spike |
| B. Frames | `frames/`, `ui/timeline`, Blink, Two-date, linking | Patch format (exists) |
| C. Science | `core/`, `workers/`, Spectrum, Brightness, Stack | Patch format (exists) |
| D. Data | `scripts/`, `data/`, pre-bake, service, catalogues | — |
| E. Shell and pitch | `state/` schema, workspaces, share, starters, page text, demo video | State model (8.4) |

One integrator merges every few hours and runs typecheck, tests, build.

### Milestones

| # | Milestone | Proves | Must be done by |
|---|---|---|---|
| M0 | Spike: Aladin Lite shows the IRSA cube; a DOM box follows a sky point while panning | The globe approach works | Hour 1 |
| M1 | Sky + search + one Blink frame on Barnard's Star from pre-baked data | The challenge's core ask | Half of day 1 |
| M2 | Timeline, Two-date, Spectrum; three starters | Something a newcomer and a judge can use | End of day 1 |
| M3 | Linking, Compare, autosave, share link | It is a workspace | Morning of day 2 |
| M4 | One of: motion-handle Stack, Brightness, live service for any coordinate | The standout | Midday day 2 |
| M5 | Freeze. Page text, AI disclosure, 30-second video, submission form | Presentation score | Afternoon day 2 |

Cut line: if M0 fails by hour 2, switch to the fallback in 8.1 or to a flat "big picture" page without
a globe. If M3 slips, ship M2 plus the share link only.

### Definition of done for any task

- Typecheck, tests and build pass.
- Checked in a browser at 1366×768 with no console errors.
- No honesty rule (section 2) is broken.
- New numbers on screen have a stated source.

## 12. Risks and open questions

| # | Risk | Likelihood | What we do |
|---|---|---|---|
| R1 | Aladin Lite cannot switch cube channels fast, or does not expose sky-to-screen on every move | Medium | M0 spike first; fallbacks in 8.1 |
| R2 | IRSA is slow or busy during the demo | High | Starters use pre-baked data only; live frames show honest progress |
| R3 | The catalogue mirror is down | High | Service endpoint for neighbours (7.3); "Try again"; session cache |
| R4 | The archive retires a release again | Medium | One config block; loud warning; re-bake takes about 10 minutes |
| R5 | A draggable workspace eats the weekend | High | Must/Should/Could tiers; frames are docked-only until M3 if needed |
| R6 | Share links get too long | Low | Deflate; JSON file fallback |
| R7 | Rules: work before the hackathon, and AI use | — | Ask the Local Lead; disclose AI use (H8) |

Open questions for the team:

1. Is the first screen a starter, or an empty sky with a "Start here" card?
2. Do phones get the workspace at all, or only starters?
3. Where is the service hosted, and who pays?
4. Which standout for M4?

## 13. How this answers the challenge

| Challenge item | Where |
|---|---|
| Enter RA and Dec, see images like a little video | F2 + Blink frame (F5), simple link in F8 |
| Easy to update with new releases | One config block, loud warning (7.1) |
| Creative use of the 102 bands; per-detector; spectra on the fly | Wavelength slider (F1, F9), same-colour blink, Spectrum frame |
| Add or subtract images from different times | Two-date, Difference, Stack frames |
| Choose the field of view | Globe zoom; frame size 3, 6 or 12 arcminutes |
| Overlay Gaia or WISE | Catalogue overlays in frames; AllWISE base layer (F1) |
| Coordinates in the URL, embeddable | F8 |
| Metadata such as flags | Info frame, flags overlay |
| Use tools like Astropy and Aladin | Astropy in the service; Aladin Lite for the globe |

## 14. Sources

- Challenge: https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/
- Judging guide: https://www.spaceappschallenge.org/resources/judging-awards-guide
- SPHEREx at IRSA: https://irsa.ipac.caltech.edu/Missions/spherex.html
- Data products: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products
- Data access: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access
- Cutout tool: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html
- All-sky cube properties: https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/properties
- Explanatory Supplement: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp_QR.pdf
- Luhman & Esplin 2016: https://arxiv.org/abs/1605.06655
- Aladin Lite: https://cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.js (documentation at the CDS site, which was down on 12 November)
