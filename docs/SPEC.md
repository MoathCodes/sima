# Sima (سيما): build spec

Final spec for building the app again from an empty folder, in parallel, and getting the same result.
Written 14 November 2026 from the working build on branch `typescript`.

- **Sections 1 to 8** say what the finished app is. This is the target.
- **Section 9** is the plan for building it in parallel: eight lanes that do not share files.
- **Section 10** is the open work: everything the working build still gets wrong. Build the
  behaviour written there, not the behaviour of the old build.
- **Section 11** is how we know it is done.

## 0. How to read this

### The spec is five documents, plus one appendix

| Document | What it fixes | Status |
|---|---|---|
| `docs/SPEC.md` (this file) | What the app does, how the code is split, the build plan, the open work | Final |
| `DESIGN.md` | The look: colours, type, sizes, spacing, every component, motion, interaction rules | Final. Binding, word for word |
| `docs/tools.md` | Every picture tool and algorithm: what it computes, its limits, its wording | Final for what is built |
| `docs/data-format.md` | The file format of a patch of real exposures | Final |
| `docs/live-service.md` | The small service that fetches any coordinate | Final |
| `docs/SPEC-v1-workspace-plan.md` | The first draft: the many-frame workspace vision | Kept for section 10 only. Not binding |

Where two documents disagree, this file wins on behaviour and `DESIGN.md` wins on looks.

### The working build is the reference

The pictures in this spec are screenshots of the working build at 1900×1030 (and three at 1366×768).
When the words leave a detail open, match the picture. When the picture shows something that section
10 lists as wrong, follow section 10.

"The same result" means:

1. Every screen in section 4 looks and behaves as written.
2. Every requirement in section 5 passes its check.
3. The five reference results in section 7.3 come out within their error bars.
4. The checks in section 11 pass.

### Rules that came from the hackathon

- The work is disclosed as AI-assisted, on the About page and in the submission form.
- The demo is a 30-second video or seven slides. Section 9.6 says which flow to film.
- Desktop first: 1900×1030 and 1366×768 must both work. Phones are not designed.

---

## 1. The product on one page

**Name.** سيما, written Sima. It is Arabic for "a sign or a mark". The team is SIMA, in Madinah.

**What it is.** A workspace on the infrared sky of NASA's SPHEREx telescope, in the spirit of Google
Earth. The whole sky is the page. The user travels over it, puts a square (the *patch*) on any spot,
and a card (the *frame*) plays the real exposures of that spot in date order. Stars stay still.
Anything that moves or changes stands out.

**Why it is different.** Other sky browsers show one averaged map. Sima shows the same spot on
separate dates, at any of SPHEREx's 102 wavelengths, and says on screen where every pixel came from.

**Who it is for.**

- Newcomers first: students, judges and visitors with no astronomy training. They must see something
  real in under a minute and never feel lost.
- Scientists and keen amateurs, one click away: the Measure panel and the picture tools.

**Success.**

- A first-time visitor finds the moving star in the first frame with the tour's help.
- A scientist reaches the measurement behind it in one click, and trusts it.
- Nothing on screen claims more than the data supports.

**The challenge it answers.** NASA Space Apps 2026, "Planet X and SPHEREx": blink SPHEREx images of
one field taken at different times, at any coordinate, to find things that move or change. The five
test targets are Barnard's Star, Epsilon Indi B, WISE 0855−0714, RW Aurigae and R Draconis.

### 1.1 The challenge and its sites

| Site | Address |
|---|---|
| Challenge page (details) | https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=details |
| Challenge page (resources) | https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources |
| Challenge page (teams) | https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=teams |
| NASA Space Apps | https://www.spaceappschallenge.org/ |

The challenge in its own words: create a public-facing web tool to display images of the sky from
the SPHEREx mission, making it easy for anyone to quickly see how they change over time.

The resources page says more resources may be added before the hackathon begins. Read it again on
the day. This list was read on 13 November 2026.

### 1.2 NASA Data & Resources (the challenge's own list: treat as required)

| Resource | Address | How Sima uses it |
|---|---|---|
| NASA/IPAC Infrared Science Archive: SPHEREx resources | https://irsa.ipac.caltech.edu/Missions/spherex.html | The source of every SPHEREx pixel: the all-sky map and the exposures |
| SPHEREx Tutorial Notebooks | https://caltech-ipac.github.io/irsa-tutorials/spherex/ | The cutout address form in `prebake.py` matches notebook 2. Its TAP search is the fix for O-D1 |
| WiseView | http://byw.tools/wiseview | The model the challenge names. Sima's flip-book and its choice of field size follow the same idea |
| Gaia Mission Data (use Data Release 3) | https://archive.stsci.edu/missions-and-data/gaia | Gaia DR3 is the star catalogue in the overlays, the change search and the motion checks. Sima reads DR3 from ESA's archive and from VizieR, not from this page |

### 1.3 Space Agency Partner Resources (optional)

All four are from the Canadian Space Agency. Sima does not use them today. They are about NEOSSat, a
different telescope.

| Resource | Address |
|---|---|
| NEOSSat: Observing Asteroids, Space Debris and Exoplanets | https://www.asc-csa.gc.ca/eng/satellites/neossat/ |
| Canadian Astronomy Data Centre (CADC) | https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/ |
| NEOSSat Data Tutorial | https://github.com/asc-csa/NEOSSAT_Tutorial |
| NEOSSat Dataset | https://data.asc-csa.gc.ca/dataset/neossat |

One possible use, not planned: a place card for a known asteroid could link to its NEOSSat images.

NASA's note on the page: NASA does not endorse non-U.S. Government sites, and participants must
follow the data-use terms of each such site. Section 6.1 lists every outside site Sima uses.

### 1.4 How the work is judged

Five criteria: impact, creativity, validity, relevance to the challenge, and presentation.

| Criterion | What Sima offers |
|---|---|
| Impact | Anyone can check any spot of the sky for change, with a guide that needs no training |
| Creativity | The whole sky as the workspace; one wavelength scale for map and frame; methods borrowed from radiology, weather loops and transient surveys (7.4) |
| Validity | Real measurements that match the catalogue (7.3); honesty rules; tests; stated limits |
| Relevance | Every one of the eight considerations below is answered |
| Presentation | The demo flow in 9.6; the design in `DESIGN.md` |

### 1.5 The challenge's eight considerations

| Consideration | Requirement | State |
|---|---|---|
| Easy to update with new data | `prebake.py` release list; live service | Done for shipped targets; service not hosted (O-D2) |
| Creative use of the 102 bands | BAR-4, BAR-5, MSR-3 (spectrum), SKY-2 | Done |
| Add or subtract images taken at different times | FRM-7 (Difference, Two dates, Stack), TLS-2 | Done |
| Let users choose the field of view | FRM-6 | Done |
| Overlays from Gaia and WISE | Layers tab, TLS-3 | Done on shipped targets; not on live spots (O-D4) |
| Coordinates in the URL, for embedding | GEN-2, GEN-3 | Done |
| Show metadata such as contamination flags | MSR-3 (Exposure), pixel flags layer, TLS-6 | Done |
| Use tools like Astropy and Aladin | Astropy in the scripts; Aladin Lite for the sky | Done |

---

## 2. Honesty rules

These are hard requirements. Every change is checked against them.

| # | Rule |
|---|---|
| H1 | The all-sky map is an average of a year of dates. It always carries the note "Average of all dates: moving objects are blurred or shifted here". |
| H2 | Every picture in the frame shows its source, release, date and wavelength. |
| H3 | Simulated data says "Simulated" first, has a dashed outline, and never appears in measurements, lists or exports of real detections. |
| H4 | A number is measured from pixels, taken from a named catalogue, or labelled as a model. The label says which. |
| H5 | When something could not be measured, the app says "not measured" and why. It never falls back to a model value. |
| H6 | Flagged pixels, missing exposures and failed downloads stay visible. |
| H7 | No sentence claims a discovery. Finds are "candidates to check". |
| H8 | Anything processed (cleaned, combined, stacked, smoothed) says so on the picture, and the original is one press away. |
| H9 | Facts about a place come from a named public source, shown on its card. A missing fact is left out, never guessed. |
| H10 | AI-written code and text are disclosed on the About page. |

---

## 3. Words used here

| Word | Meaning |
|---|---|
| Sky | The all-sky SPHEREx map that fills the window. |
| Patch | The square on the sky that the frame is looking at. |
| Frame | The card that shows the real exposures of the patch. |
| Picture | One image in the frame: one exposure, or one group of exposures blended. |
| Visit / pass | SPHEREx sees a spot a few times within days (a visit), about every six months (a pass). |
| Detector | One of six wavelength bands, D1 to D6, from 0.75 to 5.0 µm. |
| Explore | The default level. Simple controls, lettered dates. |
| Measure | The expert level. Opens the Measure panel and the picture tools. |
| Place | A well-known object in the catalogue of 2,289 places. |
| Candidate | A spot the change search lists. Never called a discovery. |
| Live fetch | Getting real exposures for a spot that is not one of the five shipped targets. |

---

## 4. The screens

Each picture below is the reference for that state.

### 4.1 First visit

![First visit](spec-img/01-first-visit.jpg)

- The sky fills the window. Cards float on it. The page never scrolls.
- **Top left:** wordmark (سيما then Sima), search field, and under it a row of chips: Stars, Nearby,
  Changing, Clusters, Nebulae, Galaxies, Tours, Surprise me.
- **Top right:** Guide, Places, Share, About.
- **Left edge:** sky zoom in and out, sky map chooser, coordinate grid.
- **Right:** the frame, already loaded with Barnard's Star and playing.
- **Bottom:** one bar with play controls, the date scale and the wavelength scale.
- **Bottom corners:** the sky note (left) and the pointer's coordinates (right).
- **Welcome card:** heading "Watch the sky change", one sentence, three starting points and
  "Or explore the sky on my own". The first starting point is the only filled button.

### 4.2 The workspace

![Workspace](spec-img/02-workspace.jpg)

- The magenta square on the sky is the patch. A dotted line ties it to the frame.
- The frame shows: the place name, a source line ("Real data"), field size (− 6′ +), Measure, close.
  Under it a short task ("Runaway star. One dot jumps. Tap it.") with a Hint button.
- The picture has a date badge (letter, month, one plain line), a scale bar and a north/east mark.
- Under the picture: Flip, Two dates, Difference. Then one line saying exactly what data this is.
- The bar: previous, Play/Pause (the one round filled button), next, lettered date stops A, B, C on a
  ruled date scale, loop style, speed, then the wavelength scale with its six detector colours.

### 4.3 Two dates and Difference

![Two dates](spec-img/04-two-dates.jpg)
![Difference](spec-img/03-difference.jpg)

- **Two dates:** the earlier date in red and the later in cyan, in one still picture.
- **Difference:** this date minus the typical sky. White is where something is on this date. Dark is
  where it usually sits. A mover shows as a white and dark pair.

### 4.4 A click on the sky, and a new spot loading

![A click on the sky](spec-img/22-click-sky.jpg)
![Loading a new spot](spec-img/17-loading-new-spot.jpg)

- A click on empty sky does not move anything. It shows a small card at that spot with its
  coordinates and "Move the frame here" (first picture, lower left).
- Dragging the square moves the frame at once.
- While a new spot loads, the square is dashed and labelled "loading". The frame says what it is
  doing ("Searching NASA's archive…"), that it can take minutes, and that the sky still works.
- When the count is known the bar fills to match ("Fetching 9 of 12").
- Under the cover the frame shows the sky map's own picture of the spot, tagged "Preview from the sky
  map (all dates averaged)".
- The card at the top centre reports sky map loading with a percentage.

### 4.5 Search and a place card

![Search](spec-img/09-search.jpg)
![Place card](spec-img/10-place-card.jpg)

- Search takes a name (English or Arabic), a meaning ("shepherd"), a catalogue number or coordinates.
- A place card shows: name, kind in plain words, Arabic name where there is one, two buttons
  ("Look with the frame", "Zoom to it"), a short text with its source, a facts table (how far,
  brightness, size, other names), an "In SPHEREx" note on what to look for, and the fact sources.

### 4.6 Lists, tours and dots on the sky

![Stars list](spec-img/13-places-list.jpg)
![Tours](spec-img/21-tours.jpg)
![Wide sky with dots](spec-img/14-sky-wide-dots.jpg)

- A chip opens a list of that kind, best known first, with sub-filters and a
  "Whole sky / In this view" switch.
- Tours are themed lists of stops with one note each, with Play and Pause.
- Places show as dots on the sky. The best known show at the widest view; more appear as the user
  zooms in, like cities then towns on a map. Labels never overlap each other or the cards.
- The last two pictures were taken while the wide map was still loading ("Loading more sky · 43%"):
  the sharp diamond is loaded, the soft grey around it is the shipped low-resolution sky. The
  finished state is sharp everywhere. See O-I15.

### 4.7 Measure

![Measure](spec-img/05-measure.jpg)

- Pressing Measure switches to the expert level. The frame glides left and the Measure panel opens
  beside it.
- The frame gains six views (Flip, Swipe, Two dates, Difference, Stack, Trail), a full date badge,
  catalogue circles, and the picture tools button.
- The bar shows every visit as a dot, names the passes, and shows a counter (6 / 12).
- The Measure panel opens calm: the object, **one headline number** with a status pill
  ("10.39″/yr, matches catalogue"), one chart, one paragraph, and "Show all the numbers".
- Every dotted-underlined term explains itself on hover or focus.

![Measure with all numbers, 1366 wide](spec-img/20-1366-measure-all.jpg)

- The speech bubble in this picture is a one-time tip. It should not cover the frame (O-G7).
- "Show all the numbers" adds chart tabs (Spectrum, Brightness, Folded, Path, Cutouts, Exposure), a
  stats column, the six detector thumbnails and "Found in this patch".

### 4.8 Picture tools

![Picture tab](spec-img/06-tools-picture.jpg)
![Clean up tab](spec-img/07-tools-clean.jpg)
![Find changes tab](spec-img/07-tools-find.jpg)
![Layers tab](spec-img/07-tools-ov.jpg)

Four tabs in one panel beside the frame. `docs/tools.md` defines each control.

- **Picture:** black and white limits with a live histogram, stretch, colour map.
- **Clean up:** background removal, sigma clipping, combine each pass, median filter, smoothing.
  Each is a switch, each is labelled as processing, and "Original" is one press away.
- **Find changes:** a threshold slider, a status line, a ranked list of candidates with honest
  labels, marks on the picture, a CSV download.
- **Layers:** Gaia, AllWISE, predicted path, pixel flags, names.

### 4.9 The guide

![Guide menu](spec-img/08-guide-menu.jpg)
![Tour step](spec-img/12-tour-step4.jpg)

- Guide opens a menu: "Take the 3-minute tour", "Tour the numbers" (3 steps through Measure),
  "Explain the screen" (point at anything to see what it is), "What changes look like", and a
  checklist of eight things to try, each with "Show me".
- The tour dims the page, rings the one control it is talking about, and waits for the user to do
  the action. It has a progress line, Back, Skip step and End tour.

### 4.10 Places, Share, and 1366 wide

![Places panel](spec-img/16-places-panel.jpg)
![Share](spec-img/15-share.jpg)
![1366 workspace](spec-img/18-1366-workspace.jpg)
![1366 Measure](spec-img/19-1366-measure.jpg)

---

## 5. Requirements

Each line is one requirement with a check. IDs are used in sections 9 and 10.

### 5.1 Sky (SKY)

| ID | Requirement | Check |
|---|---|---|
| SKY-1 | The SPHEREx all-sky map is a globe (orthographic, like Aladin Lite's SIN view). From a few arcminutes to a wide view it fills the window; zooming out further shows the whole globe as a disc of sky with dark space round it, about 88% of the window's shorter side at most. The zoom is one smooth motion, with no jump and no change of projection; dragging turns the globe. The globe is always real sky (shipped tiles first), never black or empty. | Wheel from 3′ out to the globe and back in one motion; the globe is filled at every step; no dot or label on its far side. |
| SKY-2 | The wavelength scale sets the map's channel (102 channels; 50 and 51 do not exist and are skipped). The change is a 0.26 s cross-fade, never a cut to grey. | Slide from 0.75 to 5.0 µm. |
| SKY-3 | Drag pans. The wheel zooms toward the pointer. Double-click zooms in 2×. + and − zoom. | The point under the pointer stays put. |
| SKY-4 | The sky map chooser offers SPHEREx, AllWISE 3.4 µm and AllWISE 4.6 µm. | Each loads. |
| SKY-5 | A coordinate grid can be switched on. | Toggle works. |
| SKY-6 | The sky note always says what the map is (H1), which channel, and what was filled in. | Present at every zoom. One line, not cut off (see O-I6). |
| SKY-7 | Failed tiles retry. Tiles that stay missing offer Retry. | Block a tile; Retry appears. |
| SKY-8 | A service worker serves shipped low-resolution tiles first, so the first sky appears without waiting for NASA's archive. | Offline first paint shows the sky. |
| SKY-9 | If the browser drops the drawing surface, the sky note says so and asks to reload. | Simulate context loss. |

### 5.2 Patch and frame (FRM)

| ID | Requirement | Check |
|---|---|---|
| FRM-1 | The patch is a square on the sky: solid magenta for real data, dashed amber for simulated, dotted grey for none, dashed pale for loading. | Four states visible. |
| FRM-2 | The patch can be grabbed anywhere inside it. The sky does not move while it is dragged. | Drag from centre, edge, over the pin. |
| FRM-3 | A click on the sky shows "Move the frame here". Nothing else changes until that is pressed. | Loaded pictures stay. |
| FRM-4 | The sky never moves by itself after the user has panned, zoomed or searched. | Pan during a live load; camera unchanged when pictures arrive. |
| FRM-5 | The frame can be dragged by its header and sized from its bottom-left corner. It can be hidden and shown again. Its box is remembered. | Reload keeps it. |
| FRM-6 | Field size steps: 3, 6, 12, 24, 48 arcminutes, by buttons or by the wheel over the picture. | Sky stays still. |
| FRM-7 | Views in Explore: Flip, Two dates, Difference. In Measure also Swipe, Stack, Trail. | Each draws. |
| FRM-8 | Pictures swap with hard cuts, never faster than 2.5 a second. With reduced motion the frame shows a still Two dates picture. | Check both. |
| FRM-9 | The picture shows a date badge, a scale bar, north and east. In Measure the badge adds time, pass, detector, wavelength and whether the colour matches the reference. | See 4.7. |
| FRM-10 | The line under the views states source, release, dates, exposure count and detector range (H2). | Present on every picture. |
| FRM-11 | With no real pictures the frame says so, explains why, lists the five test targets, and offers a labelled practice simulation. | Open `?ra=10&dec=20` without the service. |
| FRM-12 | Dragging inside the picture pans the field (see O-I7). | Drag moves the patch by the same sky offset. |

### 5.3 The bar (BAR)

| ID | Requirement | Check |
|---|---|---|
| BAR-1 | Previous, Play/Pause, Next. Space and the arrow keys do the same anywhere on the page. | Not while typing. |
| BAR-2 | The date scale is ruled by month. Explore shows lettered stops per group of dates. Measure shows one dot per visit, pass names and a counter. | See 4.2 and 4.7. |
| BAR-3 | Loop style (forward, or forward then back) and three speeds (0.6×, 1×, 1.5×). | Cycle them. |
| BAR-4 | One wavelength scale drives both the sky map channel and the frame's detector. | Move it; both follow. |
| BAR-5 | "Same wavelength only" plays only exposures whose wavelength matches the reference. | Shown only where it applies. |
| BAR-6 | While a place loads, the parts of the bar that need pictures are dimmed and not pressable. | See 4.4. |

### 5.4 Measure (MSR)

| ID | Requirement | Check |
|---|---|---|
| MSR-1 | Opens calm: object, one headline number with a status pill, one chart that fits that number, one paragraph. | For a mover the chart is Path, not an empty Spectrum (see O-G4). |
| MSR-2 | "Show all the numbers" reveals tabs, stats, detector strip and found list. The choice is remembered. | Reload keeps it. |
| MSR-3 | Charts: Spectrum (102 channels, builds as pictures play, "Show all at once"), Brightness (error bars, visit averages, "did it change?" test), Folded (periodic stars), Path, Cutouts, Exposure details. | Each target in 7.3. |
| MSR-4 | Every statistic has a plain explanation in place (hover or focus). | No bare χ², p or "degrees of freedom" (see O-G5). |
| MSR-5 | With nothing selected, the panel shows "The picture on screen" details, not an empty chart. | Open Measure on a live spot. |
| MSR-6 | With no pictures it says "Nothing to measure here" and shows nothing from the last place. | H5. |
| MSR-7 | CSV export of the chart's data, with errors. | File opens. |
| MSR-8 | Fits at 1366×768 with no inner scroll (see O-I8). | scrollHeight = clientHeight. |

### 5.5 Picture tools (TLS)

Full definitions in `docs/tools.md`.

| ID | Requirement | Check |
|---|---|---|
| TLS-1 | Limits (auto presets and custom black/white with clamping), stretch, colour maps, live histogram. | Values in force are the values shown. |
| TLS-2 | Clean-up steps, each a switch, each labelled as processing on the picture (H8). "Original" and the `\` key show the raw picture. | Press and hold. |
| TLS-3 | Change search: difference pictures for things that appear or fade, position fits for stars that creep. Known stars are matched against Gaia and CatWISE. | Barnard's Star is found and labelled Known. |
| TLS-4 | Candidate labels: Known, Possible, Weak (as expected from noise), Not confirmed, Ruled out, Rejected. The status line says how many noise alone would give. | R Draconis D3 at 3×. |
| TLS-5 | Triage keys step through candidates; each opens cutouts, a chart and "Open in Measure". | Keys work. |
| TLS-6 | The value under the pointer (expert): µJy, times the noise, flags, RA, Dec, pixel. | Hover the picture. |
| TLS-7 | Settings are remembered, reset by "Reset all", and carried in share links (`pic=`). | Round trip a link. |
| TLS-8 | No task blocks the page for more than 100 ms. Heavy work is chunked now; a Web Worker is open work (O-T1). | Long-task log. |

### 5.6 Guide (GDE)

| ID | Requirement | Check |
|---|---|---|
| GDE-1 | A guided first run on real pictures of Barnard's Star: 8 steps, one idea each, the user does each action. | Finish with no astronomy knowledge. |
| GDE-2 | The tour rings exactly the control it names and follows it through moves and resizes. | Ring never drifts. |
| GDE-3 | Skip step, Back, End tour, resume after reload, replay from Guide. | All five. |
| GDE-4 | A close-up shows where the change is, with rings, and says where the rings come from. | H4. |
| GDE-5 | Hint, Another hint, Look closer, Show me: each gives a little more. Show me points; the user still taps (see O-G2). | Step 5. |
| GDE-6 | "Explain the screen" labels each part in plain words. | Guide menu. |
| GDE-7 | A second short tour covers the numbers in Measure (3 steps). | Guide menu. |
| GDE-8 | One-time tips never cover the control they point at, and never pile up (see O-G7). | First Measure open. |

### 5.7 Places (PLC)

| ID | Requirement | Check |
|---|---|---|
| PLC-1 | A catalogue of at least 2,289 real places of 15 kinds, each with its sources (H9). Rebuilt by `scripts/build_places.py`. | Positions match SIMBAD to 1″ on a sample of 30. |
| PLC-2 | Dots appear by importance with zoom (tiers 0 to 4). With a kind chip on, all dots of that kind show at any zoom. | Brown dwarfs at 70°. |
| PLC-3 | Labels do not collide with each other or with any card. | Wide and narrow views. |
| PLC-4 | Search by English name, Arabic name, transliteration, meaning, catalogue number, with small typos. | "shepherd", "الدبران", "m104". |
| PLC-5 | Cards as in 4.5. Distances are the middle of the listed measurements; disagreement over 30% is stated. | Sombrero: about 37 million light-years, 28 to 71 (16 SIMBAD measurements, read 14 November 2026; studies disagree). |
| PLC-6 | Seven tours with Play and Pause, and "Surprise me". | Each stop is found. |
| PLC-7 | Saved places: the user names where the sky is now; it is kept in the browser. | Reload keeps it. |
| PLC-8 | Drawing the dots takes under 4 ms a frame. | Profile while panning. |

### 5.8 Search, share, about, loading (GEN)

| ID | Requirement | Check |
|---|---|---|
| GEN-1 | `/` focuses search. Escape closes the topmost open thing. | Order: popover, dialog, list, tools, Measure. |
| GEN-2 | Share gives a link and an embed code. The link restores patch, field size, detector, view, date and picture settings. | Open in a new window. |
| GEN-3 | `embed=1` shows only the frame, the bar and Measure in the page flow. | In an iframe. |
| GEN-4 | Loading always says what, how far, and what works meanwhile. A loader appears only if the wait lasts (0.25 to 0.3 s). | Never a blank or frozen screen. |
| GEN-5 | Panels fade and settle; the frame glides when Measure opens; one movement at a time. Reduced motion keeps only fades. | No jumps (see O-I5). |
| GEN-6 | About explains use, method, the five targets, Planet X, the challenge points, limits, AI use and sources. | Dialog opens from the top right. |
| GEN-7 | No console errors. No page scroll at 1900×1030 or 1366×768. | Automated. |

---

## 6. Data

### 6.1 Sources, with addresses

| What | Address | Browser can call it? |
|---|---|---|
| All-sky SPHEREx map, 102 channels (HiPS cube, order 5, 512 px tiles) | https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube | Yes |
| AllWISE all-sky maps (HiPS) | https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/W1 and `/W2` | Yes |
| Exposure search (SIA2) | https://irsa.ipac.caltech.edu/SIA `?COLLECTION=…&POS=circle+ra+dec+r` | No. From our service only |
| Exposure cutouts | The Level 2 file address + `?center=ra,dec&size=deg` | No. From our service only |
| CatWISE2020 and exposure tables (TAP) | https://irsa.ipac.caltech.edu/TAP/sync | No. From our service only |
| Gaia DR3 (TAP) | https://gea.esac.esa.int/tap-server/tap | No. From our scripts only |
| Gaia DR3, CatWISE2020 for overlays | https://vizier.cfa.harvard.edu/viz-bin/asu-tsv | Yes, but not always up |
| Place positions and facts | https://simbad.cds.unistra.fr/simbad/ | Build time only |
| Star names | IAU Working Group on Star Names list, https://www.pas.rochester.edu/~emamajek/WGSN/ | Build time only |
| Arabic star names | https://en.wikipedia.org/wiki/List_of_Arabic_star_names | Build time only |
| Messier, NGC and IC objects | https://github.com/mattiaverga/OpenNGC | Build time only |
| Arabic labels, short texts | https://www.wikidata.org and Simple English Wikipedia | Build time only |
| Sky library | Aladin Lite 3.8.2, https://aladin.cds.unistra.fr/AladinLite/ (npm package `aladin-lite`, bundled) | n/a |
| Fonts | Archivo, Aref Ruqaa, Cairo (SIL OFL), in `src/styles/fonts/` | n/a |

The exact addresses are in `scripts/prebake.py`, `scripts/build_places.py`, `src/core/catalog.ts` and
`src/sky/sky.ts`. Check them there before relying on this table.

Collections: `spherex_dr1`, `spherex_qr3`, and the `_deep` variants near the ecliptic poles. The names
live in one list in `scripts/prebake.py`. The script warns when a listed collection has been retired.

Cube tiles: channel 0 is `Norder{k}/Dir{d}/Npix{n}.png`; channel i is `Npix{n}_{i}.png`. The service
worker (`public/sky-tiles-sw.js`) presents each channel as an ordinary 2D HiPS.

### 6.2 Shipped with the app

| What | Where | Size |
|---|---|---|
| Real exposures of the five test targets | `public/data/<target>/frames.json`, `frames.bin.gz` | 8 MB |
| Low-resolution sky, 100 channels, one 1728×1856 image each | `public/sky-seed/allsky/` | 8 MB |
| Seamless base tiles for the default channel | `public/sky-seed/` | 5 MB |
| The places catalogue | `src/data/places.json` | 1 MB |

The low-resolution sky images are built by `npm run seed:sky allsky`. Each of the 12 base faces is
smoothed first, and the WebP is written with `-quality 80 -define webp:filter-strength=0`. Without
that last setting the encoder's loop filter draws visible lines along tile borders.

### 6.3 The live service

`scripts/live.py`, defined in `docs/live-service.md`.

```
GET /api/patch?ra=<deg>&dec=<deg>&fov=<3|6|12|24|48>
  200 { id, state: queued|searching|first|rest|done|failed, found, ready, total, … }
GET /api/patch/<id>/<first|full>/frames.json
GET /api/patch/<id>/<first|full>/frames.bin.gz
```

- Inputs are three numbers. The service never fetches a URL given by a client.
- At most 48 exposures a patch and at most 8 requests to NASA's archive at a time.
- First look: one exposure per detector at the oldest and newest pass (up to 12), then the rest.
- Measured on 13 November 2026: a new spot takes 160 to 430 s. The search step takes most of it
  (144 to 409 s) and runs one request at a time. See O-D1.

### 6.4 Privacy

Requests to outside services carry no name, email or project name. Automated clients use a generic
User-Agent.

---

## 7. Science

### 7.1 Rules that cost time to learn

1. **Every exposure has its own wavelength at each sky point.** Blink compares exposures whose
   wavelengths are within half a channel width. Exposures are chosen at download time so partners
   exist.
2. **Brightness is compared per detector, never across wavelengths.**
3. **Bright stars overload the detector.** Their cores are flagged. Position comes from a profile fit
   to the clean pixels around the core. Brightness comes from a ring outside the core and is labelled
   "from the outer glow".
4. **Bad pixels** use the flag names in each file's header. SOURCE is not bad. The list is in
   `scripts/prebake.py`.
5. **Zodiacal light** is subtracted before storing. Its level is kept for display.
6. **Catalogue positions need the right epoch.** WISE 0855: RA 133.787082, Dec −7.244433 at 2014.0,
   motion −8118, +680 mas/yr, parallax 449 mas.
7. **Neighbours:** an exposure is skipped when a listed Gaia or CatWISE source within 12.3″ is bright
   enough to matter. The neighbour is named.
8. **Parallax cannot be measured** from three or four passes six months apart. It is fitted but only
   the catalogue value is shown, and the app says so.
9. **Stacking** a faint mover: a simple aperture does not separate "along the motion" from "fixed"
   when the object moved about one pixel. Always show the two controls.
10. **Pixels are 6.15″.** Motions under about 4″ a year do not show as a jump in 1.5 years.
11. **Difference** is each date minus the median of all dates.
12. **Visit averages:** when exposures inside one visit scatter more than their error bars, the
    averages' errors are widened to match, and the note says by how much.

### 7.2 Algorithms

All in `src/core/`, pure functions with no page access, each with tests. `docs/tools.md` gives the
maths and the limits of each.

| File | Does |
|---|---|
| `real.ts` | Decodes shipped frames, flag masks, sky-to-pixel mapping, centroids, forced photometry, the outer-glow method, same-colour matching |
| `blink.ts` | Brightness matching between pictures; one picture per group |
| `fit.ts`, `movers.ts` | Motion fits, light curves, finding sources that creep |
| `stack.ts` | Stacking along a catalogue motion, with the two controls |
| `detect.ts` | The change search: difference spots, linking, known-star matching, vetting, ranking |
| `stats.ts` | χ² tests, weighted means, line fits, spot photometry, channel spectrum |
| `filters.ts` | Sigma clipping, Gaussian smoothing, median filter, background subtraction, combining |
| `display.ts`, `picture.ts` | Limits, stretches, colour maps, histogram; encoding picture settings into a link |
| `catalog.ts` | Gaia and CatWISE rows, moved to the date of the picture |
| `field.ts`, `frames.ts`, `instrument.ts`, `schedule.ts` | The labelled practice simulation |
| `astro.ts`, `math.ts`, `csv.ts` | Coordinates, dates, random numbers, CSV |

### 7.3 Results to reproduce

| Target | Result |
|---|---|
| Barnard's Star | 10.39 ± 0.25″/yr measured from 69 of 72 exposures; catalogue 10.39 |
| Epsilon Indi B | 4.57 ± 0.09″/yr; catalogue 4.68; water and methane dips in the spectrum |
| WISE 0855−0714 | Not seen in single exposures; stack 15.6σ in D5, 7.2σ in D6, nothing at 0.7 to 2.4 µm |
| R Draconis | 18 months of monthly pictures; up to 0.98 mag change in D6 |
| RW Aurigae | Up to 0.82 mag change |

### 7.4 Methods borrowed from fields that compare images for a living

The idea behind the whole app: other fields solved this already, so take their answers.

| Method | Borrowed from | Where |
|---|---|---|
| Hard cuts, back-and-forth loop, pause at the ends, speed cap | Weather loop viewers, WCAG | `viewer/playback.ts` |
| Brightness matching between pictures | Radiology, ensemble photometry | `core/blink.ts` |
| One combined picture per pass | Backyard Worlds, WiseView | `core/schedule.ts`, `core/blink.ts` |
| A letter and a coloured edge per date | Eye clinics, photo editors | `viewer/render.ts`, `viewer/scrub.ts` |
| Two dates in one red and cyan picture | Remote sensing | `viewer/paint.ts` |
| New, reference and difference cutouts | Transient surveys | `viewer/paint.ts`, `viewer/detail.ts` |
| Ghost-trail reveal of a mover | Sports broadcasts | `viewer/render.ts` |
| Warm-up on a known answer | Zooniverse | `explore/game.ts` |
| Folded brightness curve | Variable-star observers | `viewer/detail.ts` |
| Limits, histogram, "Original" one press away | DS9, Lightroom | `viewer/tools.ts`, `core/display.ts` |
| Dots by importance with zoom; click asks before moving | Google Maps, Google Earth | `sky/markers.ts`, `shell/shell.ts` |
| Spotlight tour where the user does each step | Figma, Photoshop tutorials | `guide/` |

---

## 8. Architecture

### 8.1 Stack

- Vite 8, TypeScript (strict), plain DOM and Canvas 2D. No framework.
- One runtime dependency: `aladin-lite` 3.8.2, for the sky.
- Tests: `node --test tests/*.test.ts` (108 tests today). Python tests beside the scripts.
- Python 3 with Astropy for `prebake.py`, `live.py` and `build_places.py`.

Commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`, `npm run seed:sky`.

### 8.2 Folders

```
index.html              the page skeleton: every mount point, no logic
src/main.ts             imports the styles and starts each part
src/core/               science, pure functions            (lane B)
src/sky/                the sky map, marks and dots on it   (lane C)
src/viewer/             the frame, the bar, Measure, tools  (lanes D and E)
src/shell/              cards on the sky, placement, places (lanes F and G)
src/guide/, explore/    tour, tips, explanations, starters  (lane H)
src/data/               places.json, tours.ts               (lane G)
src/styles/             app.css, shell.css, tools.css, places.css, guide.css, fonts/
public/data/            shipped real exposures              (lane A)
public/sky-seed/        shipped low-resolution sky          (lane A)
public/sky-tiles-sw.js  service worker for sky tiles        (lane C)
scripts/                prebake.py, live.py, build_places.py, seed-tiles.ts (lane A)
tests/                  one test file per area
docs/                   this spec and its four companions
```

### 8.3 The two halves and the line between them

The page has two halves that only talk through a small message bus (`src/shell/bus.ts`).

- **The sky half:** `src/sky`, `src/shell`. It knows about the map, the patch, cards and places.
- **The frame half:** `src/viewer`, `src/core`. It knows about exposures, pictures and measurements.

```ts
interface BusEvents {
  aim:   { ra: number; dec: number; fov?: number; target?: string | null };  // sky → frame
  patch: { ra: number; dec: number; fov: number;
           source: 'real' | 'live' | 'simulated' | 'none' | 'loading';
           label: string; target: string | null };                            // frame → sky
  start: { starter: string };                                                 // page → frame
  band:  { det: number };                                                     // bar → frame
  shown: { lam: number | null; mjd: number | null; det: number };             // frame → sky
}
```

Units: degrees for positions, arcminutes for field size, micrometres for wavelength, MJD for dates.
Nothing else crosses the line. The guide is the one exception: it may read any part to point at it,
but only through the functions listed in 8.4.

### 8.4 Contracts between lanes

These signatures are fixed in phase 0 (section 9.2). A lane may change its insides freely.

| Module | Owner | What others may call |
|---|---|---|
| `core/types.ts` | B | `Target`, `RealSet`, `RealFrame`, `Field`, `Frame`, `Group`, `Measurement`, `MotionFit` |
| `core/*` | B | The exported pure functions listed in 7.2 |
| `sky/sky.ts` | C | `startSky`, `setLayer`, `flyTo`, `camera`, `toScreen`, `toWorld`, `outline`, `onSkyClick`, `onPointer`, `onZoom`, `grabbable`, `grid`, `retry` |
| `sky/markers.ts` | C | `setDots`, `showGroups`, `setHover`, `setChosen`, `keepClear`, `pick`, `inView`, `onRest` |
| `viewer/state.ts` | D | `S` (the one state object), `FOVS`, `Mode`, `Level`, `pic()` |
| `viewer/load.ts` | D | `loadTarget(id)`, `aimAt(ra, dec, fov)` |
| `viewer/render.ts` | D | `draw()`, `drawHooks` (others add overlays to the picture here), `hud`, `exif` |
| `viewer/playback.ts` | D | `play`, `pause`, `step`, `setEpoch` |
| `viewer/detail.ts` | E | `detail()`, `selectTab(tab)` |
| `viewer/omnibox.ts` | F | `addSearchSource(source)` (lane G plugs places in here) |
| `shell/shell.ts` | F | `frameRect`, `openPlace`, `hideFrame`, `flyFree`, `greet`, `skyReady` |
| `explore/game.ts` | H | `setLevel`, `openStarter`, `revealTarget`, `pointOut` |
| `guide/index.ts` | H | `startGuide()` |

**v2.0 contracts** (`docs/design-v2/BEGINNER-AND-MOBILE.md` section 13; fixed in v2.0 step 0, with
stubs merged; lanes in `docs/lanes.md`). No new bus messages.

| Module | Owner | What others may call |
|---|---|---|
| `shell/view.ts` | F | `getView(): View`, `setView(v: View): void`, `onView(fn: (v: View) => void): () => void`, `type View = 'discover' \| 'expert'`. Sets `html[data-view]`, writes `sima-view` (migrating `b102-level`), and calls `setLevel('explore')` for Discover, `setLevel('measure')` for Expert |
| `viewer/state.ts` | DE | `S.measureOpen?: boolean` (written by DE's Measure): in Expert the Measure button opens and closes the panel without leaving the Measure level. Undefined until used |
| `explore/game.ts` | H | `StarterId` gains `'ghost'`; `'too-faint'` stays as its old name for old links (`starterOf(id)` resolves it). `openStarter` through the `start` message stays the one way in |
| `viewer/state.ts`, `viewer/motion.ts` | DE | `VIEWS.explore` is `['flip', 'two', 'diff', 'stack']`. The motion handle works at either level. `trialResult(): { key: string; motion: Motion; atCatalogue: boolean; result: StackResult } \| null`: null while the newest stack is being made or when the one on hand is for an older key; at the catalogue motion, the ordinary stack's result. The mission starts the arrow with `setTrial({ pmra: 0, pmdec: 0 })` |
| `explore/progress.ts` | H | `progress(): Progress`, `onProgress(fn): () => void`, `startMission(id)`, `leaveMission()`, `stepDone(id, step, state: 'done' \| 'unavailable')`, `resetProgress()`. In `sima-missions`; in memory when storage is blocked |
| `explore/missions.ts` | H | `MissionId`, `MISSION_IDS`; each check is a pure `Check = (inputs: CheckInputs) => CheckResult` with `CheckResult = { state: 'waiting' \| 'checking' \| 'done' \| 'unavailable' \| 'failed'; reason: string }`; inputs carry `key` and `keyNow`, and an old key is rejected (`keyCheck`) |
| `shell/sandbox.ts` | F | `sandboxState(): { planet; verdict; patchKey } \| null`, `onSandbox(fn): () => void`, `openSandbox({ under })` |
| `shell/sheet.ts` | M | `openSheet(el, { height: 'peek' \| 'half', label, back? })`, `back(): boolean`, `closeSheet()`, `layout(): { kind: 'desktop' \| 'phone-fit' \| 'phone-scroll'; pic; sheetH }`, `onLayout(fn): () => void` |
| `viewer/link.ts` (re-exported by `url.ts`) | F | `readLink` reads `ui=discover\|expert` and `mission=runaway\|ghost\|planet-x`; `viewFor(link, hash, remembered)`: `ui` wins; else Expert settings in the link (`view`, `pic`, `det`, `date`, `#w=`) mean Expert; else the remembered view |
| `shell/glass.ts` | F | `glassLevel(): 'glass' \| 'solid'`, `onGlass(fn): () => void`. Sets `html[data-glass]`; no other lane reads the media queries |

### 8.5 What is remembered, and what is in a link

| Browser key | Holds | Owner |
|---|---|---|
| `b102-level` | Explore or Measure (v2.0: read once to migrate to `sima-view`) | H |
| `sima-view` | v2.0: Discover or Expert | F |
| `sima-missions` | v2.0: mission progress (never in a link) | H |
| `sima-panels` | v2.0: the visitor's Panels choice, Glass or Solid | F |
| `frame-box` | The frame's position and size | F |
| `sky-places` | Saved places | G |
| `sima-guide` | Tour progress, seen tips, "all numbers" | H |
| `sima.tools` | Picture settings, threshold, list filter and order | E |

Link parameters: `ra`, `dec`, `fov`, `det` (D1 to D6 or `color`), `view`, `target`, `date`, `pic`
(picture settings), `embed`; v2.0 adds `ui` and `mission` (8.4, `viewer/link.ts`). A parameter that is not understood is named in a note, never ignored
silently.

---

## 9. Building it in parallel

### 9.1 Why eight lanes

The working build was made by four agents in one folder. They collided in `index.html`, the two main
stylesheets and `shell.ts`, and covered each other's panels more than once. So this plan gives every
lane its own files, its own stylesheet and its own mount point. Shared files are written once, in
phase 0, and then have one owner.

### 9.2 Phase 0: contracts (one person, about 90 minutes, before anyone else starts)

Phase 0 produces a page that runs with fake data in every slot.

1. Scaffold: Vite, TypeScript strict, test runner, Prettier, folders as in 8.2.
2. `src/styles/app.css` tokens: every colour, size, radius and shadow from `DESIGN.md`, the fonts,
   and the base components (button, icon button, segmented control, tabs, switch, card, popover).
3. `index.html` with every mount point from the working build's `index.html`, empty.
4. `core/types.ts`, `shell/bus.ts`, `viewer/state.ts` (the shape of `S`), copied as contracts.
5. A stub for every module in 8.4: the right signatures, returning fixed fake values.
6. Fixtures: `public/data/barnard/` (one real target), 40 rows of `places.json`.
7. One smoke test that loads the page headless and fails on any console error or page scroll.

After phase 0, every lane can run the page and see its own part with everyone else's part faked.

### 9.3 The lanes

| Lane | Builds | Owns | Needs from others | Done when |
|---|---|---|---|---|
| **A. Data and service** | `prebake.py`, `live.py`, `build_places.py`, `seed-tiles.ts`, their tests, the shipped data | `scripts/`, `public/data/`, `public/sky-seed/`, `src/data/places.json` | Nothing | Five targets baked; service answers any coordinate; places rebuilt; PLC-1 |
| **B. Science core** | Everything in 7.2 | `src/core/`, `tests/` for core | Fixtures from phase 0 | Results in 7.3 reproduced in tests |
| **C. Sky** | The map, channels, service worker, patch outline, grab and click rules, dots and labels | `src/sky/`, `public/sky-tiles-sw.js` | Tokens | SKY-1 to 9, FRM-1 to 4, PLC-2, 3, 8 with fake dots |
| **D. Frame and bar** | Loading patches, painting, six views, playback, date scale, wavelength scale, detector strip | `src/viewer/` except `detail.ts`, `inbox.ts`, `tools.ts`, `omnibox.ts`, `share.ts` | B (stubs first), bus | FRM-5 to 12, BAR-1 to 6 on the Barnard fixture |
| **E. Measure and tools** | Measure panel, charts, found list, the four tool tabs, candidates, CSV | `viewer/detail.ts`, `inbox.ts`, `tools.ts`, `styles/tools.css` | B, D's `S` and `drawHooks` | MSR-1 to 8, TLS-1 to 8 |
| **F. Shell** | Top row, rail, frame placement and glide, loading cards, keys, Escape order, search box, Share, About, embed mode | `index.html`, `styles/app.css`, `styles/shell.css`, `shell/shell.ts`, `viewer/omnibox.ts`, `viewer/share.ts`, `viewer/url.ts`, `page/` | C's camera functions, bus | GEN-1 to 7, layout of 4.1 at both sizes |
| **G. Places** | Catalogue reading, search source, chips, lists, cards, tours, saved places | `shell/objects.ts`, `shell/places.ts`, `data/tours.ts`, `styles/places.css` | A's `places.json`, C's markers, F's `addSearchSource` | PLC-4 to 7 |
| **H. Guide** | Welcome card, starters, tour, close-up, hints, explanations, tips | `src/guide/`, `src/explore/`, `styles/guide.css` | Everything, read-only, through 8.4 | GDE-1 to 8 |

Lanes A and B have no screen. They can finish first and then help review.

### 9.4 Rules that keep lanes apart

1. One owner per file. To change another lane's file, ask its owner or send a patch.
2. Each lane styles only its own classes in its own stylesheet. Tokens come from `app.css`.
3. Nobody but lane F edits `index.html` after phase 0. A lane that needs a new mount point asks F.
4. A lane that draws on the picture registers a `drawHooks` function. It does not edit `render.ts`.
5. Things that float on the sky must be added to lane C's keep-clear list, so labels avoid them.
6. Every card that can open has a place in the Escape order and the stacking order in `DESIGN.md`.
7. A contract in 8.4 changes only by telling every lane that calls it.

### 9.5 Order of work

| Step | What exists at the end | Who |
|---|---|---|
| 0 | The page runs with fakes in every slot | One person |
| 1 | **Walking skeleton:** real sky, real patch, Barnard's Star plays in the frame, the bar works | A, B, C, D, F |
| 2 | Measure and tools on real data; places and dots; search; the tour on the skeleton | All |
| 3 | Fakes removed. Loading states, motion, Escape order, 1366 layout. Section 10 items | All |
| 4 | Review against section 11. Fix. Film the demo | All |

Integrate at the end of every step, not only at the end. The smoke test from phase 0 runs on every
merge.

### 9.6 The demo flow

Thirty seconds: open the page; press "Runaway star"; the tour rings Play; the pictures flip;
Difference shows the white and dark pair; tap it; "10.39″/yr, matches catalogue"; zoom the sky out
to the dots; search "سهيل"; fly there.

### 9.7 Several people, several AI tools

The team has several people, each with a different AI coding tool. The lanes are built for that.

- **One lane, one person, one AI tool, one branch.** Nobody shares a branch or a working folder.
  (Four agents in one folder is what caused the collisions in the working build.)
- **Give each AI tool the same four things:** this spec, `DESIGN.md`, the lane's row in 9.3 and the
  contracts in 8.4. Paste the lane's requirement IDs as its task list.
- **Tell each AI tool the rules in 9.4** in its instructions file, plus the honesty rules.
- **The person reviews, the tool writes.** Read every diff before merging. Run the smoke test.
- **Spend the strongest tool where judgement matters:** phase 0, lane B (science) and reviews. Use
  cheaper or faster tools for lanes with clear checks.
- **Review with a different tool than the one that built it,** and make the reviewer use the real
  app and compare with other products (11.3). A tool reviewing its own work agrees with itself.
- **Merge small and often.** Each lane merges to the shared branch at the end of every step in 9.5.
- **One person owns integration.** That person owns `index.html` with lane F and settles any clash.

---

## 10. Open work

The working build does not yet meet this spec in the places below. Build the fixed behaviour.

Scores from independent reviewers when the loops stopped (out of 10; the target is 9):

| Area | Last score | Round reviewed | Built after that, not reviewed |
|---|---|---|---|
| Interface | 6.0 | 3 | Round 4, cut off part way |
| Guide | 7.6 | 4 | Round 5, cut off part way |
| Tools | 7.8 | 3 | Round 4, complete |
| Places | 7.3 | 2 | Round 3, complete |

The round-4 interface work added "Move the frame here" (FRM-3), the sky-map preview while loading
and gap filling on the map. Those are in the build and in the pictures, but nobody has reviewed them.

### Interface (lanes C, D, F)

| ID | Problem | Wanted |
|---|---|---|
| O-I1 | The sky flew back to the patch when its pictures arrived, undoing the user's pan. A fix is in the build, not verified. | FRM-4 |
| O-I2 | One stray click on the sky threw away the loaded patch. Fixed by FRM-3 in the build, not verified. | FRM-3 |
| O-I3 | A new spot showed a black picture for minutes. The sky-map preview is in the build, not verified. | 4.4 |
| O-I4 | At the default zoom the map looks like coarse blocks with holes at star centres. Softening and gap filling are in the build, not verified. | A first view that looks like sky; the note says what was filled |
| O-I5 | The frame grows by about 23 px when the "Fetching N of 36" line goes away. | Reserve the line's height |
| O-I6 | The sky note becomes one very long line and is cut off at 1366. | Two short facts at most; the rest on hover |
| O-I7 | Dragging inside the picture does nothing. | FRM-12 |
| O-I8 | Measure scrolls by 6 px at 1366×768. | MSR-8 |
| O-I9 | Sky labels slide under the top cards. | Rule 5 in 9.4 |
| O-I10 | A coordinates title wraps to two lines in the frame at 1366. | One line; full value in the tooltip |
| O-I11 | While a spot loads, the task line is cut off by the top of the picture (visible in 4.4). | The line fits or is hidden |
| O-I12 | Escape does not always close an open places list. | GEN-1 |
| O-I13 | A few faint dotted lines remain along base-tile borders at the widest zoom. | None visible |
| O-I15 | Zoomed far out, the sharp map stopped at 43% for over 30 s in a headless test, leaving most of the view on the soft low-resolution sky (pictures in 4.6). Not checked on a real GPU. | The whole view sharpens within 10 s on a normal connection, or the card says why not |
| O-I14 | Motion looks steppy in headless tests while the sky draws. Not checked on a real GPU since round 2. | Check on real hardware |

### Guide (lane H)

| ID | Problem | Wanted |
|---|---|---|
| O-G1 | In the numbers tour, the hover card of the headline number covers the first letters of the tour card. | The two never overlap |
| O-G2 | "Show me" in the find step marks the star as found for the user. | It rings the star; the user taps |
| O-G3 | During the find step the user cannot pause or pick a date, because the dimmer covers the bar. | Play, next and the date scale stay live |
| O-G4 | Outside the tour, calm Measure opens on a half-empty Spectrum for a moving star. | MSR-1 |
| O-G5 | "Show all the numbers" shows χ², degrees of freedom and p with no explanation, and the Gaia circles have no legend in view. | MSR-4 |
| O-G6 | Skip step on "Press Measure" leads to a confusing "Measure closed" card. | Skipping opens Measure, or jumps past the Measure steps |
| O-G7 | One-time tips pile up, and the mover tip shows on a star that only changes brightness. | One tip at a time, chosen by the kind of target |
| O-G8 | Enter can skip a task step by accident, because focus lands on Skip step. | Focus goes to the card |
| O-G9 | "Pick up the tour?" comes back after the user chose End tour. | End tour is final |
| O-G10 | "The tour lives here" covers the frame title at 1366. | Show it after the first action, or anchor it elsewhere |
| O-G11 | Small wording slips: the rings are catalogue predictions, not "where it was"; the practice star shows a real-looking exposure ID. | Match the caption; mark the ID as simulated |
| O-G12 | The Planet X practice dot is a single pixel and hard to see. | Raise its contrast in the close-up only, labelled |

### Tools (lanes B, E)

| ID | Problem | Wanted |
|---|---|---|
| O-T1 | The change search runs on the page's own thread, in 25 ms slices. On a busy machine it took 25 s. | A Web Worker; TLS-8 |
| O-T2 | Spots 53 to 72″ from saturated Barnard's Star are tagged but still "Possible". | Demote to "Weak: in a bright star's glow" |
| O-T3 | At 1366 the status line scrolls out of view while a candidate is open. | It stays pinned |
| O-T4 | The pointer shows one pixel only. | Region statistics for a dragged box (Could) |
| O-T5 | Stacking WISE 0855 blocks the page briefly. | Move to the same worker as O-T1 |
| O-T6 | Round 4 fixes (light-curve error bars, Weak and Not confirmed labels, threshold in links) have not been reviewed. | Review |

### Places (lanes A, G)

| ID | Problem | Wanted |
|---|---|---|
| O-P1 | Round 3 fixes (galaxy kinds, middle-value distances, bad magnitudes, common names, chip dots at wide views) have not been reviewed. | Review; spot-check 30 cards |
| O-P2 | Tours have no picture per stop. | One small sky-map cutout per stop |
| O-P3 | Brown dwarfs and fast stars mostly show catalogue names. | A plain kind line leads the card when there is no common name |
| O-P4 | Some famous objects have no distance because SIMBAD lists none. | Leave it out (H9). Do not fill from memory |
| O-P5 | The 1900-wide layout of lists and cards was not fully looked at. | Check every list and card |

### Data and service (lane A)

| ID | Problem | Wanted |
|---|---|---|
| O-D1 | A live fetch takes 160 to 430 s, and the search step is 144 to 409 s of that, one request at a time. | Find exposures with one TAP query, as NASA's tutorial notebook does. Target: first look under 60 s |
| O-D2 | The live service is not hosted. Without it only five coordinates have real pictures. | Host it: Python, outbound HTTPS, a disk cache |
| O-D3 | The Python tests were not run after the change from 3 to 8 parallel downloads. | Run `test_prebake.py` and `test_live.py` |
| O-D4 | Live-fetched spots have no catalogue, so nothing is marked or measured there. | Serve Gaia and CatWISE neighbours from the service |

### The wider workspace (the first vision, not built)

The first plan was a workspace with many frames. The working build has one frame. These parts of
the vision are not built. Their full write-up, with checks, is in the first draft of this spec, kept
as `docs/SPEC-v1-workspace-plan.md` (sections F4 to F13).

| ID | Not built | From the vision |
|---|---|---|
| O-V1 | Several frames at once (up to 6), each dropped on its own spot from a tool tray | "Tools that could be dragged and dropped on the image itself" |
| O-V2 | Frame types as separate tools: Blink, Two-date, Spectrum, Difference, Brightness, Stack, Info | "A frame that has comparison between two colours, the differences, many components" |
| O-V3 | Linking frames by time, position or detector, and a Compare button for side by side | "Placing one view next to the other" |
| O-V4 | Named workspaces: save, switch, export and import; a link that restores a whole layout | "Building their own workspaces that they could go back to" |
| O-V5 | Search filters on catalogues (fast movers in Gaia, cold objects in CatWISE) in the current view | "A search bar that has filters" |
| O-V6 | A motion handle on the stack: drag an arrow for speed and direction and watch the stack sharpen | The game-like direct control |
| O-V7 | A sandbox layer: place a pretend planet and see whether SPHEREx would show it, always tagged | "Like the game where you build solar systems" |
| O-V8 | Tap any source to see "known or new": its catalogue row, or "no catalogue source here". Built only inside Measure on shipped targets | Researcher use |
| O-V9 | PNG export of a picture with its label | Researcher use |
| O-V10 | A 3D sky. Decided against: distances are known for few objects, so depth would be invented (honesty rules). The globe is the honest version | "That I hope somehow we turn into 3D" |

If time allows after sections 5 and 10, build O-V1 to O-V4 first. They are what turns a viewer into
a workspace. Lane D owns frames; lane F owns the tray and workspaces.

### Whole app

| ID | Problem | Wanted |
|---|---|---|
| O-W1 | Never tested in Firefox or Safari. | Test both |
| O-W2 | Never tested with a real mouse on a real GPU since the big changes. | One full manual pass |
| O-W3 | Phones are broken, by agreement. | A simple "open on a desktop" note under 700 px |
| O-W4 | `README.md` and the About page's challenge list describe older features in places ("without Aladin"). | Update both |
| O-W5 | Unused "why" paragraphs remain in `src/explore/copy.ts`. | Delete or use |
| O-W6 | Nothing is committed. | Commit when the team decides |

---

## 11. How we know it is done

### 11.1 Automatic checks, on every merge

- `npm run typecheck` is clean.
- `npm test` passes (108 tests today; new work adds its own).
- `npm run build` succeeds.
- The smoke test: load the page at 1900×1030 and 1366×768, run the flows in 9.6, fail on any console
  error, any page scroll, or any card overlapping another.

### 11.2 Budgets

| Thing | Budget |
|---|---|
| First picture of the sky | 5 s, and the frame does not wait for it |
| Starter playing (shipped data) | 3 s from page open |
| Frame step | under 50 ms |
| Sky wavelength change, cached tiles | under 500 ms |
| Longest task during any tool | under 100 ms |
| Drawing 2,289 dots | under 4 ms a frame |
| Shipped data in the repo | under 25 MB |

### 11.3 Review

Each of the four areas is scored out of 10 by a reviewer who did not build it and who uses the real
app. The reviewer compares it with at least four other products, one of them outside astronomy
(Google Earth, Google Maps, Figma, Lightroom, DS9, ESASky, WorldWide Telescope, Stellarium Web,
Backyard Worlds, Duolingo). Any blocker caps the score at 6. Done means 9 or more in every area with
nothing broken.

### 11.4 Manual pass before the demo

One person, real mouse, real GPU, Chrome, then Firefox: the whole of section 4 in order, all five
test targets, one live fetch from start to end, the tour from start to end, keyboard only for one
full flow, and reduced motion switched on for one flow.

---

## 12. Risks and open decisions

| # | Item | Who decides |
|---|---|---|
| 1 | Aladin Lite is GPL-3. Shipping it bundled affects the licence of the app. | The team |
| 2 | Where to host the live service (O-D2). | The team |
| 3 | Whether work done before the hackathon may be reused. Asked of the Local Lead, not answered. | Local Lead |
| 4 | NASA's archive can retire a release without notice (it did on 12 November 2026). The release list is one line in `prebake.py`. | Lane A watches |
| 5 | NASA's archive serves about 300 KB a second per visitor. The shipped low-resolution sky hides this at first load only. | Accepted |
| 6 | Data terms of non-US-government sources (SIMBAD, Wikipedia text, OpenNGC) must be shown. They are listed on each card and in About. | Check before submitting |

---

## 13. Sources

- NASA Space Apps Challenge 2026, "Planet X and SPHEREx", challenge page and Resources tab.
- NASA/IPAC Infrared Science Archive: SPHEREx data, SIA and TAP services, SPHEREx tutorial notebooks.
- Gaia DR3 (ESA); CatWISE2020; AllWISE.
- SIMBAD (CDS); IAU Catalog of Star Names; OpenNGC; Wikidata; Wikipedia.
- Aladin Lite (CDS). Archivo, Aref Ruqaa and Cairo (SIL Open Font License).
- The full reference list with links is in the About dialog of the app.
