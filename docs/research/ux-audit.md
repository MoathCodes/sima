# UX audit: what a first-time visitor or a judge would notice

Research only. No app code was changed. Written 15 November 2026 on `rebuild` at `d89016f`
(the audit began on `fbb4b1c`; the findings were checked again after merging `rebuild`).

## Summary

The app is honest and mostly works. But several things still look broken, frozen or low quality to
a real person while every test passes. The top 10, most noticeable first:

1. **The tour rejects a tap on the moving star.** Only the middle 48 px of a 200 px star counts.
   A tap on the rest of it says "Not that one: that dot stays put", which is false. (Blocker)
2. **On a slow link the sky turns to flat grey or blur**, on the first view and on every
   wavelength change, while the loading card says "The SPHEREx map is in". (Major)
3. **Live loading can be dead without anyone knowing.** A leftover live service answers nothing,
   and the dev server still says it is "using" it. Seen twice today. A separately hosted service
   would also fail at the download step. (Major, demo risk)
4. **"Show all the numbers" looks broken when paused:** the chart is stretched (tall, thin letters,
   oval dots) and the six detector thumbnails are empty black squares. (Major)
5. **The frame forgets the place's name.** "Look with the frame" on the Andromeda Galaxy titles the
   frame "00h 42m 44.33s +41° 16′ 07.5″". (Major)
6. **Going to a place is a jump into blur, not a journey.** The sky cuts to the new spot, shows
   grey smears, and a big galaxy fills the view as fog until "Zoom to it" is pressed. (Major)
7. **The globe sits half under the frame and the bar, its dark edge cannot be seen, and labels
   are drawn on top of other places' dots** ("Sombrer●Galaxy"). (Major; v2 fixes the first two)
8. **Coordinates copied from Astropy or SIMBAD are not understood** (`17h57m48s +04d41m36s`:
   "Nothing found"). (Major for scientists and judges)
9. **Smaller screens:** at 1366×768 the frame title becomes "Bar…"; at 1280×720 (many projectors)
   cards run off the bottom; a phone shows one sentence and nothing else. (Major; v2 does phones)
10. **A device set to "reduce motion" opens on a still two-colour picture** with no word about
    why, so the app's main idea (flipping) is not seen. (Minor to Major, depends on the device)

How sure: 1, 4, 5, 8, 9, 10 were measured directly and are certain. 2 and 6 are certain as
symptoms; how long they last depends on the network and the GPU. 3 is certain on this machine.
7 is certain.

## How this was done

- The app ran on port 5261 (`npm run dev`). Headless Chromium 1243 drove it through Playwright,
  one browser at a time. About 350 screenshots and contact sheets are in `~/.cache/sima-rebuild/ux-audit/` (not in the
  repo). Files named `sheet-*.png` are contact sheets of several screenshots.
- Tried: the intro, the welcome card, the guided tour end to end, wheel and button zoom from the
  globe to the deepest view, drag, double-click, search (English, Arabic, catalogue numbers, six
  coordinate formats, nonsense), all lists, tours, Surprise me, place cards, field sizes 3′ to 48′,
  the wavelength scale, playback, the three views, Measure and all its tabs, the picture tools,
  workspace frames, Share, About, Guide, Explain the screen, Escape, the keyboard, reduced motion,
  1900×1030, 1366×768, 1280×720, 1024×768, a phone at 390×844, a slow link to NASA's tile server,
  that server unreachable, the live service off, the live service broken, and a live load.
- Compared with Aladin Lite's own page in the same browser, and read about ESASky.
- **Limits.** Headless Chromium draws WebGL in software, and the machine was very busy (load 34 on
  12 cores). So nothing here judges smoothness or frame rate, and waits are longer than on a real
  laptop. Firefox and Safari were not tried. NASA's exposure search failed all day (timeouts, then
  HTTP 502), so a live load that *succeeds* was not seen; the failure path was.

---

## The issues

Effort: S = under an hour, M = about half a day, L = a day or more.

### 1. The tour rejects a tap on the moving star · Blocker

- **What a person sees.** Step 5 of the tour says "Tap the star that moves". Barnard's Star is a
  glowing blob about 200 px across. In Difference it is a white shape beside a dark one. A tap on
  the glow 30 px from the middle, on the right half of the white shape, or on the dark shape gets
  "Not that one: that dot stays put. Try again, or ask for a hint." That sentence is wrong: they
  tapped the right star. Then the picture slides 22 px down to make room for the message, and
  3.5 s later slides back up, so the target moves while the person aims again.
- **Screenshot.** `~/.cache/sima-rebuild/ux-audit/04-tour-5-wrong.png`
- **Reproduce.** Welcome card → Runaway star → follow steps 1 to 4 → tap the star's glow, not its
  exact middle. Measured: offsets (0,0), (16,−15), (0,25) px pass; (40,−12), (−2,50), (−30,0),
  (0,−30) fail. The picture's top moves from 191 to 213 px and back.
- **Cause.** `src/explore/game.ts:383`: a tap counts only within `max(18, 3 × k)` px (24 px here)
  of the catalogue positions. The radius does not grow with how big the star looks. The message
  line is added above the picture, which moves it (DESIGN.md Motion: "the picture slides").
- **Reference apps.** Citizen-science tools (Zooniverse, Backyard Worlds) accept a click anywhere
  on the object.
- **Smallest true fix.** Make the reach as big as the star looks: at least the radius where its
  light is above the picture's display limit, capped at a third of the picture. And show the miss
  note without moving the picture (keep the line's height reserved, as O-I5 does for the loading
  line). Effort S to M. Lane H (game.ts), lane D (the reserved line).
- **Design v2.** Not covered. BEGINNER-AND-MOBILE.md step 2 says "reach radius as today", so the
  first mission would inherit this.

### 2. On a slow link the sky turns to flat grey or blur · Major

- **What a person sees.** (a) First visit: the cards appear over a flat grey sky with no stars,
  and the card at the top says "The SPHEREx map is in". (b) Moving the wavelength: the sharp sky is
  replaced within about 2 s by a soft grey one, then comes back in patches of coarse blocks. The
  spec says this change is "never a cut to grey" (SKY-2).
- **Screenshots.** `~/.cache/sima-rebuild/ux-audit/sheet-14slow.png` (first tile: "map is in" over
  grey; third tile: grey 2 s after a wavelength change), `sheet-08w.png` (blank at 1.21 µm, blur
  at 4.93 µm when NASA's server was slow by itself).
- **Reproduce.** Add 1.2 s of delay to `irsa.ipac.caltech.edu` (or use a weak Wi-Fi), open
  `?intro=1`, then click far along the wavelength scale. On a fast link the swap is clean
  (`sheet-09wl.png`), so tests never see it.
- **Cause (fairly sure).** `src/sky/sky.ts:736-748` `ready()` decides the new map is "in" when
  every tile *asked for so far* is done. The first tiles asked for are the coarse ones, and the
  service worker answers those at once from the shipped low-resolution sky
  (`public/sky-tiles-sw.js:195, 203`, reported as `done`). So the new map fades in before any
  sharp tile has arrived, or after 4 s whatever happened (`sky.ts:744`). The loading card counts
  the same way (`sky.ts:801-816`).
- **Reference apps.** Aladin Lite keeps drawing the old tiles and sharpens in place; it never
  swaps a sharp view for a blurrier one.
- **Smallest true fix.** In `ready()` and `report()`, count only tiles at the depth the view
  needs, and only those that came from the cache or from NASA. Keep the old map on screen until
  then. If the wait passes a limit, keep the old map and let the card say "still loading 4.37 µm".
  Effort M. Lane C.
- **Also.** With NASA's tile server unreachable, the first view is grey for good, because the
  shipped sky is too coarse for the 1.9° landing view (`sheet-14blocked.png`). The words are honest
  ("Part of the SPHEREx map did not load… Retry"). Shipping the dozen sharp tiles round Barnard's
  Star for the default wavelength would make the landing view sharp on any network. They are real
  NASA tiles, so this is honest. Effort S (`npm run seed:sky`), integrator.
- **Design v2.** Not covered.

### 3. Live loading can be dead without anyone knowing · Major (demo risk)

Two separate causes. Both end in "No real pictures yet".

**3a. A leftover live service answers nothing.**

- **What a person sees.** Every new spot fails after about 3 s with "The live service did not
  answer (Unexpected end of JSON input)". Wider fields on the five targets quietly stay small.
- **Screenshot.** `~/.cache/sima-rebuild/ux-audit/06-live-005000.png`
- **Reproduce.** Kill a dev server hard (kill -9, or close its terminal). Its `live.py` stays on
  port 8765. Start any dev server: it prints "live service: using the one already on
  127.0.0.1:8765". `curl http://127.0.0.1:8765/api/health` returns an empty reply. This happened
  twice during this audit, with two different leftover processes (pids 844887 and 880246, both from
  the main checkout).
- **Cause.** The leftover's log pipe is closed. Each request logs first (`scripts/prebake.py:173-176`
  prints to stderr), that raises BrokenPipeError, and `scripts/live.py:737-738` swallows it, so no
  answer is sent. `vite.config.ts:63` treats any open port as a healthy service.
- **Smallest true fix.** Make `log()` survive a closed pipe (catch OSError), so the service keeps
  answering. And have `vite.config.ts` ask `/api/health` instead of only opening the port. Effort
  S each. Integrator and lane A.
- **Until then, before a demo:** run `curl -s localhost:8765/api/health`. An empty answer means
  kill that `live.py` and restart the dev server.

**3b. A service on another address fails at the download.**

- **What a person sees.** The search step works, then the pictures never arrive.
- **Reproduce.** `VITE_LIVE_API=http://127.0.0.1:8766/api/patch npm run dev` with `live.py` on
  port 8766. The page asks `8766` for the status, then asks its *own* address for
  `/api/patch/<id>/full/frames.json` (seen in the browser log).
- **Cause.** The status carries paths that start with `/api/…`, and `src/viewer/load.ts:397-401`
  and `636-639` fetch them as they are. `docs/live-service.md` and `vite.config.ts` both describe
  a hosted service on another address as supported. `firebase.json` has no `/api` rewrite.
- **Smallest true fix.** Resolve the folder against `LIVE_API` (`new URL(folder, LIVE_API)`) in
  one helper used by both places and by `src/workspace/patches.ts:65`. Effort S. Lane D.
- This only bites if the page and the service are deployed on different addresses. The one-port
  container is not affected.

- **Design v2.** Neither is covered.

### 4. "Show all the numbers" looks broken when paused · Major

- **What a person sees.** After pressing Measure and then "Show all the numbers" with playback
  paused: the Path chart's letters are tall and thin, its dots are ovals, and D1 to D6 are six
  empty black squares. Pressing Next redraws the chart and fills one square (D3); the other five
  stay empty.
- **Screenshots.** `~/.cache/sima-rebuild/ux-audit/crop-13-all.png` (1900 wide),
  `10-1366x768-4-measure-all.png` (1366 wide).
- **Reproduce.** Pause → Measure → Show all the numbers. Measured: all six thumbnail canvases are
  1×1 px; after Next only D3 is 59×59.
- **Cause.** Chart: the canvas is sized by CSS to its box (`src/styles/tools.css:133-138`) and
  drawn once at the box's size then (`src/viewer/measure/charts.ts:63-64, 215-216`). "Show all the
  numbers" changes the box, and nothing redraws until the next picture. Thumbnails:
  `src/viewer/strip.ts:92-96` drops the paint queue while the strip is hidden, and only a level
  change or a new picture queues it again. A detector with no exposure in the shown visit is drawn
  as a 1×1 canvas (`strip.ts:116`) with the reason only in a tooltip.
- **Smallest true fix.** Redraw the chart when its box changes size (one ResizeObserver on the
  chart box in `src/viewer/detail.ts`; it also fixes window resizes). Repaint the strip when it
  becomes visible. For a detector with no exposure on this date, draw a dotted empty square with
  "none" under it, the app's own look for "missing" (H6). Effort S to M. Lane E.
- **Design v2.** Not covered (it keeps Measure as it is, on Slate).

### 5. The frame forgets the place's name · Major

- **What a person sees.** They open the Andromeda Galaxy's card and press "Look with the frame".
  The frame's title is "00h 42m 44.33s +41° 16′ 07.5″". The same for the Ring Nebula, for
  workspace frames, and for the patch label on the sky.
- **Screenshot.** `~/.cache/sima-rebuild/ux-audit/crop-06-live-frame.png`, `07-live-061s.png`
- **Cause.** The `aim` message has no name (`src/shell/bus.ts:32`), `openPlace` does not send one
  (`src/shell/shell.ts:128`), and the frame labels any spot that is not a shipped target with its
  coordinates (`src/viewer/load.ts:224`).
- **Reference apps.** Aladin Lite, ESASky and Stellarium Web all keep the object's name on screen
  after a search.
- **Smallest true fix.** Add an optional `name` to `aim`; the frame shows the name as the title
  and the coordinates as the second line. This is a contract change (AGENTS rule 7), so the
  integrator must agree. Effort S. Lanes F and D.
- **Design v2.** Not covered.

### 6. Going to a place is a jump into blur · Major

- **What a person sees.** Choosing a search result, a list item, a tour stop or Surprise me cuts
  the sky to the new spot in about a third of a second. For one to three seconds the view is grey
  smears or diagonal streaks. The zoom is unchanged, so the Andromeda Galaxy (3° long) or the
  Triangulum Galaxy fills the 1.9° view as shapeless fog; it only looks like a galaxy after "Zoom
  to it". A small object (the Ring Nebula, 1.3′) is a dot.
- **Screenshots.** `~/.cache/sima-rebuild/ux-audit/sheet-06p.png` (top row: black, then fog;
  second row: after "Zoom to it"), `sheet-09crop.png` (the smears), `sheet-16fly.png`.
- **Cause.** `src/sky/sky.ts:405` glides in a straight line for 650 ms at the same zoom, whatever
  the distance, so the tiles on the way and at the end are not loaded. `openPlace` and the place
  card pass no zoom (`src/shell/shell.ts:129`); only "Zoom to it" picks one.
- **Reference apps.** WorldWide Telescope and Stellarium Web zoom out, turn, and zoom in, so the
  eye follows the trip. ESASky and Aladin Lite's object search set the view to fit the object.
  SPEC section 1 says "in the spirit of Google Earth".
- **Smallest true fix.** When a place is chosen, fly to the zoom that "Zoom to it" already works
  out for it. For a far target, make the glide two steps: out to the globe view (always sharp,
  from shipped tiles), turn, then in. Effort M. Lane C (`flyTo`), lane G (pass the zoom).
- **Design v2.** Partly: missions get a "dive" from the globe. Search, lists and tours in Expert
  are not covered.

### 7. The globe: hidden under cards, no visible edge, labels on dots · Major

- **What a person sees.** Zoomed right out, the globe is centred in the window, so the frame
  covers its right quarter and the bar covers its bottom. Away from the Milky Way the globe is as
  dark as the space round it, so on one side the edge cannot be seen and labels seem to float in
  black. Labels are drawn through other places' dots: "Sombrer●Galaxy", "Bode's Galaxy" running
  into the Cigar Galaxy's mark, the Spica dot inside "Sombrero Galaxy". A chosen place's pink ring
  cuts through the first letter of its own label.
- **Screenshots.** `~/.cache/sima-rebuild/ux-audit/03-globe-16s.png`, `03-globe-minus.png`
- **Cause.** Labels: `src/sky/layout.ts:105-123` keeps new labels off cards and off other labels
  (`taken`), but dots are never added to `taken`. The chosen ring has an 8 px radius
  (`src/sky/markers.ts:518`) and the label starts 7 px from the dot (`layout.ts:56`).
- **Reference apps.** Aladin Lite draws a clear grey ground outside the globe, so the edge always
  shows (`18-aladin-zoomed-out.png`).
- **Smallest true fix.** In `layout()`, add a small box for every drawn dot to `taken` before
  placing labels, and use a wider gap for the chosen place. Effort S, with a case in
  `tests/sky-layout.test.ts`. Lane C.
- **Design v2.** Covers the placement (centred in the free space, DESIGN-v2 8.4) and the edge
  (limb glow). Does **not** cover labels on dots.

### 8. Coordinates from Astropy or SIMBAD are not understood · Major for experts

- **What a person sees.** Pasting `17h57m48s +04d41m36s` gives "Nothing found". That is the form
  Astropy prints (`to_string('hmsdms')`) and many papers use. These all work: `17 57 48.5 +04 41 36`,
  `17:57:48.5 +04:41:36`, `269.452 4.693`, and the app's own `17h 57m 48.50s +04° 41′ 36.0″`.
- **Screenshot.** `~/.cache/sima-rebuild/ux-audit/06-search-coords-sexa.png`
- **Cause.** `src/core/astro.ts:134` rejects any text with a letter other than h, m and s, so the
  `d` for degrees fails.
- **Smallest true fix.** Treat `d` as the degree sign before that check. Add the case to
  `tests/astro.test.ts`. Effort S. Lane B or whoever owns `core/astro.ts`.
- **Design v2.** Not covered.

### 9. Smaller screens · Major at 1366 and on phones

- **1366×768 (a required size).** With Measure open the frame's title is cut to "Bar…" or
  "Barnar…". `~/.cache/sima-rebuild/ux-audit/10-1366x768-4-measure-all.png`. The "Found in this
  patch" box is cut off at the bottom of the panel (known as O-I8).
- **1280×720 (not a required size, but what many projectors give).** The title is cut even in
  Explore ("Barnard's …"), the loading card's text is cut, and the place card and the picture
  tools run off the bottom. `sheet-10-1280.png`
- **1024×768.** The sky's loading card sits on the search field, and the picture tools cover
  Measure. `sheet-10-misc.png`
- **Phone, 390×844.** One sentence over the sky: "Sima is made for a desktop screen. Open it on a
  computer to use it." No name, no About, no link to copy, nothing to press. The intro still plays
  first. `10-390x844-1-first.png`
- **Cause.** The title shares one row with five buttons (`src/viewer/frame.ts:173`); at the narrow
  Measure width the buttons win.
- **Smallest true fix.** Let the title take its own row when the frame is narrower than about
  360 px (the picture slides down by one line). For phones before v2 lands: put the wordmark, one
  line on what Sima is, and a "Copy the link" button in the note. Effort S each. Lanes D and F.
- **Design v2.** Phones are fully designed (they start Solid). 1366 and 1280 title cut-offs are
  not mentioned.

### 10. "Reduce motion" devices open on a still picture · Minor to Major

- **What a person sees.** On a device that asks for less motion (Windows "Animation effects" off,
  macOS "Reduce motion"), the frame opens in Two dates, not Flip. Pressing Play moves the date
  letters, but the picture stays a red and cyan still. Nothing says why. Pressing Flip does play.
- **Screenshot.** `~/.cache/sima-rebuild/ux-audit/16-rm-play.png`
- **Cause.** By design (FRM-8, `src/viewer/load.ts:803`). The missing part is the explanation.
- **Smallest true fix.** One line under the views in this case: "Your device asks for less
  motion, so this is a still picture of two dates. Press Flip to play them." Effort S. Lane D.
- **Design v2.** Covered: "the still Two dates picture with a Step through button".

### 11. No size readout on the sky; the deepest zoom is blur with no word · Minor

- **What a person sees.** The sky shows the pointer's coordinates but never how wide the view is.
  The wheel goes in to 3′ across the window, about ten times past the map's sharpness (one map
  pixel becomes about 130 screen pixels), so the screen is black with two soft smudges. On the
  way in, stars smear into diagonal streaks while tiles load.
- **Screenshots.** `~/.cache/sima-rebuild/ux-audit/03-in-max-4s.png`, `03-in-12.png`
- **Cause.** `src/sky/sky.ts:62` `FOV_MIN = 0.05`.
- **Reference apps.** Aladin Lite also zooms past its data (to 0.1″), but it always shows the
  view's size ("15.00′ × 8.132′") in a corner. ESASky shows it too.
- **Smallest true fix.** Show the view's width beside the pointer coordinates ("1.9° wide"). When
  the view is finer than the map, add to the sky note: "The map's pixels are 13″. The frame shows
  the sharper single exposures." Effort S. Lane C.
- **Design v2.** Not covered.

### 12. Words that leak the machinery · Minor

- "The live service did not answer (Unexpected end of JSON input)" (`src/viewer/load.ts:283, 980`).
  Say "…(it sent an empty answer)" or drop the bracket.
- "NASA's search did not answer within 1 min 12 s (4 tries)" when NASA did answer, with an error
  (HTTP 502). Say "NASA's search failed 4 times (it answered with an error)". Seen at
  `~/.cache/sima-rebuild/ux-audit/crop-15-fail.png`.
- "frames.json lists only the sources near the target's path" in the Layers tab
  (`src/viewer/tools/tab-layers.ts:30`, `src/viewer/detail.ts:498`). Say "The shipped pictures
  list only…".
- Star names shown as SIMBAD's short forms: "alf Mon", "zet Mon", "eps Mon A"
  (`06-search-moon.png`). Known in part as O-P3.
- Searching "moon" or "jupiter" lists unrelated places (Hubble's Nebula, Jupiter's Ghost Nebula).
  A line "The Moon and planets are not on this map: it shows the sky beyond the Solar System"
  would help a newcomer.
- Effort S each. Design v2 does not cover these.

### 13. Smaller things · Minor

- **Bright stars hide their own label.** Betelgeuse, Sirius and Aldebaran are white discs about
  300 px across; the label sits unreadable in the glare (`sheet-16fly.png`). v2 covers this
  (labels on a Thin chip over bright sky, DSC-9).
- **"What is it made of?" is hard to start.** The picture is dominated by the glare of the star
  next to the target, cut off by the picture's edge, and the task says "Tap it" about a faint
  pair that is not marked (`crop-13-madeof.png`). Hints exist. Not tested further.
- **The welcome card comes back on every reload**, even after "Or explore the sky on my own"
  (`src/guide/index.ts:58-60`). v2 replaces the card.
- **The tip "A star that moves: try Difference"** appears while the visitor is doing something
  else (zooming the sky, or on Epsilon Indi B) and stays until pressed. Known as O-G7.
- **During the tour's find step the rest of the page can be pressed** through the dimmer. Pressing
  Measure there leaves the tour card on top of Measure's text (`sheet-04.png`, last row).
- **The 3′ preview while loading** is 14 big grey squares (`crop-15-loading.png`). It is labelled
  honestly. A wider preview with the patch outlined would read as sky.
- **SPHEREx looks soft beside AllWISE.** The SPHEREx map looks soft beside AllWISE at the same zoom
  (`sheet-09b.png`, last two tiles). That is the data (13″ map pixels), not a bug. One clause in
  the sky note would stop a judge thinking it failed to load.

---

## Checked and fine

- **The intro.** Ring, name, shadow, turn, dive and landing all play; Skip works; with reduced
  motion it is a still. On a warm load the dive's blur lasts under half a second.
- **The globe.** It is a globe seen from outside, the zoom out is one motion, drag turns it, and
  it is sharp within a few seconds. Labels held their sides during the wheel test.
- **Wavelength on a fast link.** One click swaps the map cleanly in under a second; the frame's
  detector and colour follow; the note names the wavelength.
- **Field sizes 3′ to 48′.** Buttons and the wheel over the picture work; the sky stays still; the
  sky-map surround is filled and labelled "Sky map (all dates averaged) outside the dashed line".
- **Live loading words.** The frame says what it is doing, how long NASA has not answered, which
  try it is on, and that the sky still works. The failure card is clear, offers "Ask again", the
  five targets and the labelled practice.
- **Live service off.** "No real pictures here… it is not running for this page", the five
  targets, and "Simulated" first on the practice. Honest and calm.
- **NASA's tile server unreachable.** "Part of the SPHEREx map did not load. The rest of the page
  works. Retry", and the note adds "soft in places".
- **Search.** English, Arabic (الدبران, النسر, سهيل, الشعرى), meanings ("shepherd"), catalogue
  numbers (m104, "M 31", ngc6720), typos ("betelguese", "barnards star"), arrow keys and Enter.
- **Lists, tours, Surprise me, place cards.** Facts carry their sources; distances say how many
  measurements; tours play and pause.
- **A click on the sky** only offers "Move the frame here". Double-click zooms in.
- **Escape** closes the top thing on the first press everywhere tried (welcome, list, place card,
  click card, Measure, menus). O-I12 looks fixed. Space and the arrow keys work page-wide.
- **Tooltips** on every icon button tried. **Focus rings** on every tab stop.
- **Share** (link, embed, workspace frames), **About**, **Guide**, **Explain the screen**, the
  **grid** and the **AllWISE** maps all work.
- **Picture tools.** All four tabs open; Find changes lists candidates as "candidates to check, not
  discoveries" with honest labels.
- **Workspace frames.** Three extra frames opened beside the main one without overlapping.
- **No console errors** in normal use. No page scroll at 1900×1030 or 1366×768. No two cards
  overlapped at those sizes.

## Not checked

- A live load that succeeds, and Measure on a live spot (NASA's search failed all day).
- Real GPU smoothness, Firefox, Safari, a real phone, a real trackpad pinch.
- The tour's "Tour the numbers", the practice simulations past their first screen, and CSV files.
