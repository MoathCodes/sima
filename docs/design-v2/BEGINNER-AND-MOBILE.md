# Discover (the beginner view) and phones: v2.0 spec

Status: **v2.0, revised after challenge**, 15 November 2026. Builds on `docs/SPEC.md` (behaviour),
`DESIGN-v2.md` (look) and the intro merged into `rebuild`. The two reviews are in `challenge/`
(`CODEX.md`, `OPUS.md`); section 2 says what changed because of them and why.

Requirement IDs here (VIEW-, DSC-, MSN-, MOB-, GLS-, A11Y-, GATE-) extend SPEC section 5.
Mockups: `mockups/png/` (WebP, each screen at 1366×768 and 390×844).

## 0. In short

- Sima gets two views. **Discover** is for the public: plain sentences, three short missions,
  and other real objects to try. **Expert** is today's app at the Measure level, with every
  number, picture tool, frame and workspace. A switch at the top right moves between them.
- A first visit plays the intro, cross-fades to the sky as a globe, and shows a welcome card
  whose main button starts the first mission.
- **v2.0 ships three missions**, each on real data or clearly simulated:
  1. **The runaway**: catch Barnard's Star moving (real).
  2. **The ghost**: make WISE 0855−0714 appear by adding pictures along its path (real).
  3. **Planet X**: could SPHEREx see a far planet? (**Simulated**, a model.)
- **Three more real objects** can be opened in Discover with no grading: R Draconis, Epsilon Indi B
  and RW Aurigae. RW Aurigae is where "Try Blink" goes after the first mission.
- **Nothing is locked.** Every Discover tool works from the start. Missions mark skills as
  learned, as a small completion record, not a gate.
- **Phones**: Discover works fully. Panels are opaque on phones. The picture is never covered.
  Expert on a phone is one scrolling column with every number, and "Send this to my computer".
- The build is about **five working days** with eight lanes and the integrator (section 14),
  with a release gate (section 15) and cut rules.

## 1. Decisions and their reasons

| # | Decision | Why | Rejected, and why |
|---|---|---|---|
| B-1 | **Two views: Discover and Expert.** Discover replaces today's Explore level. Expert is today's app at the Measure level. | Explore was a gentler Measure; three levels would leave a middle nobody owns. "Discover" is a verb that invites looking. It is only the view's name: no sentence says "you discovered" (section 8). | *"Beginner":* asks people to rank themselves. *"Explore":* one reviewer preferred it; the team kept Discover. |
| B-2 | **A first visit opens Discover.** Links that carry Expert settings (`view`, `pic`, `det`, `date`, `#w=`) open Expert. | Newcomers first (SPEC 1). A link made in Expert opens the way it was made. | *A quiz on first visit:* a question before anything to see. |
| B-3 | **Three missions in v2.0: the runaway, the ghost, Planet X.** The runaway is suggested first; the other two can be started at any time. | These three have checks that the code supports today, or will after one agreed contract change (section 13). Judges play one or two. | *Six missions:* three of them (breather, recipe, hunt) had checks the data does not support as written. They move to v2.1 (section 17). |
| B-4 | **No locks. Skills are a completion record.** Finishing a mission marks its skill "learned" with a check. Every tool works from the start. | Autonomy (RESEARCH 1.6). A judge or teacher must never be blocked. Removes coupling between progress, the frame's controls and links. | *Skills that unlock tools:* both reviewers found it contradicts "let people choose" and adds work. |
| B-5 | **Every check reads the app's own measurement, the model, or a named catalogue.** Each step has four states: checking, done, not available (with the reason) and failed (try again). Every not-available step has a finish the visitor can complete. | H4, H5. A mission must never pass on a number the app did not make, and must never trap the visitor. | *Scripted answers:* break when data or code changes. *Dead ends when a measurement is missing:* both reviewers found these. |
| B-6 | **"Show me" rings the place; the visitor still taps.** (O-G2 carried) | Finding it yourself is the lesson. | *Auto-complete:* a hollow win. |
| B-7 | **Planet X is Simulated from start to end** ("Simulated:" first, dashed amber, every number tagged "Model"). | H3, H4. It answers "could SPHEREx see it?" honestly. | *A "find Planet X" game on made-up pictures:* teaches that Planet X was found. |
| B-8 | **Phones: Discover is complete; Expert is one scrolling column** with the frame, the bar and Measure's numbers, and hands picture tools, frames and workspaces to a computer. | Measure's numbers fit a column; picture tools and workspaces need a pointer and space. "How was this measured?" must still lead somewhere on a phone. | *Expert hidden on phones:* a shared Expert link would dead-end. *A Measure sheet:* more sheet states for no gain. |
| B-9 | **One opaque (Slate) sheet on phones, two heights (peek and half), never over the picture.** The picture shrinks to fit above the sheet, down to 240 px; below that the page becomes one scrolling column. | The Well Rule: no glass, and nothing at all, over a picture. Glass on phones costs the most GPU on the weakest devices for little visible gain. | *A Raised glass sheet with three heights:* covered the picture in the old `04-*-390` mockup. |
| B-10 | **The view is remembered; progress is never in a link.** | A shared link shows the same sky, not someone's progress. | *Progress in links:* privacy and confusion. |
| B-11 | **No sound, no timer, no "wrong!"** A miss gets a calm note, and the next hint is offered. | Calm and exact (DESIGN mood). | *Lives or a timer:* punishes looking carefully. |

## 2. Decisions after challenge

Both reviews said "build with changes". Their shared findings are all applied. Where they
disagreed, or where the team's decisions left a choice, this is what we picked and why. The rule
was: **the more honest option, then the smaller one to build.**

| Topic | Codex | Opus | Picked | Why |
|---|---|---|---|---|
| Phones' glass | Solid on phones until measured | Slate sheet, glass on the top row at Lite | **Phones start Solid everywhere**; Settings can turn Glass on (the visitor's choice) | Smaller: no phone governor and no Lite level. Honest about cost: nobody has measured a real phone yet. |
| Governor test | Sustained slow frames or repeated gaps over 50 ms | Dropped frames against the display's own pace; start Solid on software renderers | **Both, as one early decision** (DESIGN-v2 §6): software renderer → Solid; else judge the first 1.5 s of glass over the moving sky by frames dropped against the display's own pace | Opus's pace rule avoids misfiring at 30 fps (Low Power Mode). Codex's 50 ms gap rule catches stalls a median hides. |
| Welcome screen vs "first change in ten seconds" | Land on the playable task right after the intro | Keep the welcome; cross-fade | **Keep the welcome card**, preload Barnard's Star's pictures during the intro, and make Start open them playing-ready in under 1 s, with no second long dive | The product owner asked for intro → globe → Discover. One press is a small cost; the 3 s budget (SPEC 11.2) is kept on the skip path (section 16). A five-visitor test is in the release gate. |
| Runaway headline | Measured 10.50 ± 0.26″/yr beside Gaia's 10.39″/yr | A Moon comparison | **Measured beside Gaia** (team decision), plus one sourced plain line | A Moon comparison adds a fact and a calculation to check. Not needed for v2.0. |
| The ghost's first step | "Hard to distinguish in a single picture" | A measured single-picture S/N | **Codex's sentence, no number** | It needs no new measurement and claims nothing about what people can see. |
| The ghost's pass rule | The ratio gate plus all three cutouts | (none) | **The stack's own rule**: the stack along the motion is at least 5× the noise and at least 2 more than each control (`core/stack.ts` lines 519–526) | It reuses the app's existing verdict, so the mission and Expert can never disagree. |
| Expert on a phone | Readable measurements and the link | Read-only frame, no Measure | **One scrolling column with Measure in it** | "How was this measured? Open Expert view" must land on the numbers, on every device. A column has no sheet states, so it costs less than either. |
| Sheet heights | Peek, half, full, with Back | Peek and half, tap to toggle, no drag | **Peek and half, a tap toggles, no drag.** Settings, About and Find open as a full-height page with Back | Smallest. Full pages are modal and say so, so the "full sheet over the picture" problem cannot happen. |
| Limb tags for far-side objects | (not raised) | Cut; turn the globe on Start | **Cut.** The mission list starts missions; the globe turns to the target on Start | Smaller, and three missions do not need it. |
| `Shift+E` / `Shift+D` | (not raised) | `H` fails WCAG 2.1.4 | **Drop `Shift+E`/`Shift+D`**; `H` works only while focus is in the mission card or picture | A shifted letter still counts as a character-key shortcut. The switch is reachable with Tab. |
| "Describe the dots" | Needs new science; give it to a lane or cut | Same | **Cut to v2.1.** v2.0 uses today's key picker, described exactly as it works | It needs a per-source shift measurement no code has. |
| Field guide | Cut | Cut or a text line | **Cut**, with no text line | A line that points to a missing feature is worse than none. |
| The welcome card over empty space | (not raised) | Overlap the globe's edge by about 40 px | **Overlap by about 40 px** (mockup `01`) | One line of layout; it is the moment the glass should show. |

Everything else both reviews asked for is in place: no graded hunt and no "nobody has checked"
wording (section 17); the ghost's tool contract (section 13); sheets that never cover the picture
(sections 11 and 13); finishes for every not-measured branch (section 6); a governor that decides
once (DESIGN-v2 §6); no locks (B-4); a cross-fade instead of an exact projection hand-over
(DESIGN-v2 §11); the copy fixes (section 8); the sheet's return rule, network states, rotation
and short screens, accessibility and phone provenance (sections 5, 10, 11); and a build plan with
times and a release gate (sections 14 and 15).

## 3. Scope

**v2.0 (this spec):**

1. Night Glass on both views, plus **Solid**: the setting, `@supports`,
   `prefers-reduced-transparency`, `prefers-contrast`, `forced-colors`. Night theme only.
2. The governor as one early decision: Glass or Solid. Phones start Solid.
3. The view switch (Discover | Expert), `sima-view`, and moving `b102-level` over to it.
4. The globe at full zoom-out, a cross-fade from the intro, beacons for the three missions.
5. The welcome card and the Discover home (mission list, "Try another object", skills record).
6. **The runaway**, **the ghost** and **Planet X**, each with success, Expert hand-off and every
   state in section 5.
7. "Try another object": R Draconis, Epsilon Indi B, RW Aurigae (ungraded). "Try Blink" opens
   RW Aurigae.
8. Phones: the fit layout with the Slate sheet, the scroll layout for short or rotated screens,
   Expert as one column, "Send this to my computer".
9. Settings: Panels (Glass / Solid), the motion line, Reset my progress.

**v2.1 later**: see section 17 (the breather, the recipe, the real hunt, the Chart theme, Lite
glass, the field guide, the full sheet height and drag, landscape side panel, "Describe the dots",
offline mission play, the Arabic interface).

## 4. Information architecture

```
Intro (first visit) ──► Discover ◄──────── view switch ────────► Expert
                        │                                         │
                        ├─ Home: globe, mission list (3),         ├─ Today's app at the Measure level:
                        │        "Try another object" (3),        │  frame, bar, Measure, picture tools,
                        │        skills record                    │  frames, workspaces, places, guide,
                        ├─ Mission: brief → steps → success       │  share, about
                        ├─ Object: frame on a shipped object,     │
                        │        what to look for, ungraded       ├─ Phone: one column: frame, bar,
                        ├─ Look here: any spot (needs the live    │  Measure; "Send this to my computer"
                        │        service beyond shipped objects)  │
                        └─ Find, place card, Settings, About      │
Shared by both: the sky, places, search, About, Share, the intro, the data, the honesty rules.
```

| Part | Discover | Expert |
|---|---|---|
| Sky / globe | Yes; mission beacons; place dots by importance | Yes; place dots, chips, rail |
| Top row | Wordmark, Find, Settings, About, view switch | Wordmark, search, chips, Guide, Places, Share, About, view switch |
| Frame | Slate; Play (56 px), date chips, views **Flip, Two dates, Difference, Stack** | Slate; full bar, six views |
| Wavelength | Fixed per object and said in words in the data line; changed in Expert | The wavelength scale (carried) |
| Measure | Results as plain sentences; "How was this measured? Open Expert view" | Measure panel |
| Picture tools, several frames, workspaces | No ("Original" is offered when a link brings `pic=`, as today) | Yes |
| Guide tours | Replaced by missions | "Tour the numbers" and "Explain the screen" stay |

## 5. Flows, screens and states

### 5.1 First visit

1. The intro plays (DESIGN Intro, carried). While it plays, Barnard's Star's shipped pictures load
   (the first mission's data, 72 exposures).
2. **Cross-fade, not a hand-over** (DESIGN-v2 §11): when the intro's globe has turned to Barnard's
   Star, the page's globe (Aladin Lite, SIN view) fades in over 0.4 s at its first-run place, and
   the intro's own globe fades out. The two are drawn by different code and are not claimed to
   match pixel for pixel.
3. The welcome card, the top row and the sky note fade in (0.18 s). The Barnard's Star beacon
   pulses once.
4. Welcome card (`01-first-run`):

| Part | Content |
|---|---|
| Wordmark | سيما (Ruqaa, wordmark only) · Sima |
| Heading | This is the real infrared sky. |
| Body | NASA's SPHEREx telescope photographs the whole sky again and again. Put its pictures side by side and you can catch stars that move. |
| Primary | **Start your first mission** · One star jumps · about 1 minute |
| Secondary | Look around first · Show me every number |
| Fine print | Pictures here are real and say where they came from. Anything made up says "Simulated" first. Your progress stays in this browser. |

- **Start your first mission**: a short fly to the patch (0.6 s; reduced motion: a 0.3 s
  cross-fade), then the frame opens on the already-loaded pictures.
- **Look around first**: closes the card; the globe is live; the mission list appears.
- **Show me every number**: switches to Expert on Barnard's Star at the Measure level.
- **Skip** during the intro lands on this same welcome card, ready.
- **Reduced motion**: the intro's still version, then the globe and card appear (0.3 s fade).
- **A `?mission=` link on a first visit**: the intro is skipped (`sima-intro` is set), and the
  mission's brief opens. The link chose a task; the intro can be replayed from About.

### 5.2 Home (`02-discover-home`)

| Part | Content |
|---|---|
| Mission list (Regular glass, left) | "Missions · 1 of 3 done". Three rows: name, one line, skill, minutes, state. Then **Try another object** (no mission): R Draconis, Epsilon Indi B, RW Aurigae, one line each. Footer: "Want every number now? Expert view" |
| Skills record (in the list's header) | "Learned: Blink ✓ · Stack · What-if", as text with a check mark; screen readers hear "Blink, learned. Stack, not yet." |
| Globe | Beacons for missions whose target faces us; place labels |
| Phone | The sheet at half: the next mission card with **Start mission**, then the other missions and objects (scroll inside the sheet) |

There is **one** way to start the next mission on desktop: its row in the list (with a filled play
button). The beacon on the globe opens the same row. The old dock with a second "Up next" card is
removed.

Mission row states: **Done** (white node with a check), **Suggested next** (filled play button,
row highlighted), **Not started** (play button), **In progress** ("Step 2 of 3"). There is no
locked state.

At heights under 820 px, rows show one line each and the list scrolls inside itself. It never
covers the sky note (H1). The sky note is on the keep-clear list.

### 5.3 Mission screen (`03-mission-progress`)

| Part | Content |
|---|---|
| Mission card (Raised glass) | "Mission 1 of 3 · Skill: Blink", title, one line about the object with its source, the steps (done, now, next), the current step's sentence, the hint box, **Hint / Another hint / Look closer / Show me** (one at a time, GDE-5 carried), progress, key hints |
| Frame (Slate) | Name; data line "Real data · NASA SPHEREx {release} · {date or dates} · D{n} {λ range} µm"; the picture in its well with the date badge; the pass-tint edge; previous / Play / next; date chips |
| Sky | The patch square and tether (carried) |

On desktop wider than 1500 px, the mission card sits **directly left of the frame**, with a 16 px
gap, so the instruction is next to the picture. Narrower, it sits at the left edge as before.

**Step states** (every mission):

| State | What the visitor sees |
|---|---|
| Waiting | The step sentence |
| Checking | "Measuring…" with a moving bar. A step never passes before its number exists. The work runs off the page's thread (SPEC 11.2: no task over 100 ms) |
| Done | The step ticks; the next step slides in (0.26 s) |
| Missed | A calm note for 3 s ("Not that one. That star stays put."), then the waiting sentence |
| Not available | "Not measured: {reason}." and a **Continue without it** button. The step is recorded as "not available", not "done" |
| Failed | "That didn't work: {reason}." and **Try again** |
| Shown | After Show me: a dashed `mark` ring on the picture and "It's inside the ring. Tap it." |

**Leaving** (✕, Escape or the view switch) keeps the step. A reload during "Checking" restarts that
step's measurement; it never counts as done.

### 5.4 Success (`04-mission-success`)

| Part | Content |
|---|---|
| Pill | Mission 1 complete |
| Heading | The plain win ("You caught a runaway star.") |
| Result | The measured value with its error and how many pictures, beside the catalogue value, a status pill comparing them in words, and a sources line |
| Skill | "Skill learned: Blink" with a check. One line on what to do with it |
| Actions | **Next: The ghost** (primary) · Try Blink on RW Aurigae · **How was this measured? Open Expert view** |
| Frame | The view that shows the answer (Two dates for the runaway), with the found ring and a magenta tag "Found · moved north" |

On phones the success sheet opens at half height under the picture. The primary button is pinned
at the sheet's bottom edge; the pill, heading, result lines and "How was this measured?" scroll
above it. Nothing in the result is hidden on phones.

### 5.5 Try another object

Opens the object in the Discover frame, Flip, at a detector chosen per object and named in words.
There is no grading. Copy (descriptions come from the places catalogue and SIMBAD fields at
runtime, H9; the English below is the template):

| Object | Line (template) | What to look for |
|---|---|---|
| RW Aurigae | "{SIMBAD type, in plain words}. 72 real pictures." | "Play the pictures. Does its light change from date to date? Expert shows what Sima measured." |
| R Draconis | "{SIMBAD type, in plain words}. {n} pictures over {months} months." | "Step from the first date to the last. Expert shows its measured brightness over time." |
| Epsilon Indi B | "{SIMBAD type, in plain words}, next to the star Epsilon Indi A." | "Try Two dates: it moves, like Barnard's Star. Expert shows its colours." |

Each has **See the numbers in Expert** (Expert on the same object, Measure open on the tab that
fits). `{months}` and `{n}` are counted from the frames shown, never typed (Opus 8).

### 5.6 Look here (free look)

Tap the sky → "Look here" (v1's "Move the frame here", reworded) → the frame opens on that spot.
Shipped objects open at once. Any other spot needs the live service:

| Live state (`S.load.step` and service replies) | What the visitor sees |
|---|---|
| Service off or not hosted | Before any wait: "Live pictures are off right now. Shipped objects still work." and buttons for the three missions and three objects |
| Searching NASA's archive | "Searching NASA's archive for SPHEREx pictures of this spot…" and **Cancel** |
| Search took over 60 s | "NASA's archive did not answer in time." **Try again** · **Try a shipped object** |
| No pictures of this spot | "SPHEREx has no pictures of this spot in {releases} yet." |
| Queued | "Waiting for the live service: {k} requests ahead." **Cancel** |
| First look ready | The first pictures play: "{k} of {n} pictures so far. More are coming." |
| Complete | "All {n} pictures are here." |
| Stopped halfway | "NASA's archive is slow right now. {k} of {n} pictures arrived; they are kept." **Try again** |
| Cancelled or left | Nothing more arrives for that request |

**Never replace what the visitor is doing.** If pictures arrive while a mission or another object
is open, a toast says "Your pictures of {place} are ready" with **Open**. Open is tied to that
request; it never opens a different one.

### 5.7 Settings (Raised popover on desktop, a full-height page on phones)

Panels: Glass / Solid (and, when the governor chose Solid: "Panels are solid because the sky
was slow with glass on" with **Try glass again**) · Motion: follows your system (a read-only line
on how to change it) · Reset my progress (asks first; clears `sima-missions` only) · "Your progress
is kept in this browser only."

### 5.8 Place card in Discover (`07-place-card`)

v1's card in Raised glass (a sheet on phones), with Discover wording: "Look at its pictures" and
"Zoom to it". Facts show "Brightness" first in plain words, then "More facts". Sources are always
shown (H9). The Arabic name uses the Arabic text face, inside a bidi-isolated span (section 9).

### 5.9 States every Discover screen handles

| State | What the visitor sees |
|---|---|
| Loading shipped pictures | Nothing for 0.25 s; then the frame's cover "Getting the pictures…" with the sky map's preview tagged "Preview from the sky map (all dates averaged)" (carried) |
| Live service states | Section 5.6 |
| Offline | The globe from the shipped sky (SKY-8). A mission or object whose pictures did not load says "Needs a connection" and **Try again**. v2.0 makes **no offline promise** for missions: no lane caches `frames.bin.gz` |
| A picture failed to load | It stays visible as missing (H6): the date chip shows a dotted outline and "Missing". The mission goes on with the other dates; if it needs that date, the step becomes "Failed" with **Try again** |
| Find with no results | "No star, galaxy or nebula by that name. Try a famous one: Vega, Betelgeuse, Orion Nebula." |
| Storage blocked | Progress is kept in memory for this visit. Settings says "Your browser is not letting Sima save progress. It lasts until you close this tab." |
| Saved progress unreadable | It is ignored and progress starts empty; Settings says "Saved progress could not be read, so it was reset." |
| Phone rotated during a mission | The target, date, step, sheet content and focus are kept; the layout is computed again (section 11). A drag in progress (the ghost's arrow) is cancelled and its last applied value kept |
| Reduced motion | No fly, glide or rim sweep; fades only. Flipping becomes the still Two dates picture with a **Step through** button (carried FRM-8) |
| Solid / high contrast / forced colours | DESIGN-v2 §5 |

## 6. The three missions

Common rules: every mission opens on its target, at a fixed detector and view chosen for the
lesson and said in words, **paused**. Each step names the function that checks it. Every result
sentence is a template filled from a value; a missing value prints "not measured" and why.

### 6.1 The runaway: Barnard's Star · skill **Blink** · about 1 minute

| | |
|---|---|
| Data | 72 real exposures, DR1 and QR3, August 2025 to September 2026, three survey passes (A, B, C) |
| Known answer | The catalogue track from Gaia DR3 (−801.6, +10362.4 mas/yr; 10.39″/yr) moved to each date (`core/catalog.ts`). The measured fit `fitMotion` (`core/fit.ts`): today 10.50 ± 0.26″/yr from 71 of 72 pictures, `matches: true` |
| Opens on | Flip, D3 (1.67–1.79 µm, "near infrared"), 6′ field, paused on date A |
| Step 1 | **Press Play.** "These pictures were taken months apart." Check: the visitor pressed Play or stepped dates, and three date changes were seen |
| Step 2 | **One star jumps. Tap it.** "Stars stay put. Look for the one that doesn't." Check: `explore/track.ts` `hits()` against the catalogue track at the shown date, reach radius as today |
| Hints | "Look near the middle." · "Step from A to C with the arrow keys and watch closely." · Look closer (the close-up, GDE-4) · Show me (rings it) |
| Success heading | "You caught a runaway star." |
| Result lines | **"Sima measured it moving 10.50 ± 0.26″ a year, from 71 of 72 pictures."** · "Gaia's star catalogue: 10.39″ a year." · pill **"Matches within the error"** (from `fitMotion().matches`; otherwise **"Differs from the catalogue"** in `warn`) · "″ is an arcsecond: 1/3600 of a degree." · "No known star crosses the sky faster (Wikipedia: Barnard's Star)." · sources: "Measured from SPHEREx pixels · Catalogue: ESA Gaia DR3" |
| If the fit is not measured | Result: "Not measured: {reason}." and the Gaia line labelled "Catalogue value". The mission still completes, because the tap was checked against the catalogue track; the success card does not show a measured number |
| Skill | **Blink**: "Flip between dates to catch what moves." Try Blink → RW Aurigae |

The pixel figure ("about 1.7 pixels a year") moves to Expert. It is an instrument unit, not a
headline.

### 6.2 The ghost: WISE 0855−0714 · skill **Stack** · about 3 minutes

Needs contract change 4 (section 13).

| | |
|---|---|
| Data | 70 real exposures (DR1) |
| Known answer | Catalogue motion −8118, +680 mas/yr, parallax 449 mas (Luhman & Esplin 2016, as in the shipped `catalogue.from`). The stack along a motion and its two controls (`core/stack.ts`); measured by Codex on shipped D5: 15.3× the noise along the catalogue motion, controls 5.7× (not shifted) and 2.3× (opposite) |
| Opens on | Flip, D5 (3.83–4.41 µm, "deep infrared"), 6′, paused. A dashed amber circle: "Where the catalogue says it is" |
| Step 1 | **Press Play and look inside the circle.** Check: one full loop played. The step's done text: "It is hard to pick out in a single picture. Adding pictures up can help." |
| Step 2 | **Press Stack.** Check: `S.mode === 'stack'`. On entry the mission calls `setTrial({ pmra: 0, pmdec: 0 })`, so the arrow starts at **no motion** and the stack is "not shifted". The two controls are always shown (SPEC 7.1.9) |
| Step 3 | **It moves. Turn and stretch the arrow until the stack beats both checks.** Check: `trialResult()` (contract 4) for the current patch, detector and settings has `along.snr ≥ 5`, `along.snr ≥ still.snr + 2` and `along.snr ≥ opposite.snr + 2`: the stack's own "moves with" rule. A result for an older patch or setting is ignored |
| Hints | "It moves west: to the right in these pictures (north up, east left), and fast." · "Make the arrow long: it moves more than 8″ a year." · Look closer: the three cutouts side by side · Show me: "Snap to the catalogue motion" (the visitor still presses it) |
| Keyboard | The arrow's tip is a button: arrow keys turn and stretch it, Shift for bigger steps (`viewer/motion.ts`, carried); its label reads the speed and direction |
| Success heading | "You made a faint brown dwarf appear." |
| Result lines | "Added along its path, {n} pictures show it at {snr}× the noise, in {λ} µm light." · "Not shifted: {still}×. Opposite motion: {opp}×. Only the right motion makes it this strong." · "In {short bands} it was not detected with this method." (filled from the per-detector stack, only the detectors where it was run) · "SIMBAD lists it as a brown dwarf of type {SIMBAD spectral type}." · sources: "Measured from SPHEREx pixels · Motion: Luhman & Esplin 2016 · Type: SIMBAD" |
| If the stack cannot be made (too few pictures in D5, the worker fails) | Step 3 becomes "Not available: {reason}" with **Continue without it**. The success card shows no number: "This time Sima could not make the stack: {reason}." The skill is still marked learned, because the lesson was completed |
| Skill | **Stack**: "Add pictures up along a path to see faint movers." |

### 6.3 Planet X: a pretend planet · skill **What-if** · **Simulated** · about 2 minutes

| | |
|---|---|
| Data | The sandbox model (`core/sandbox.ts`) against the measured noise of the open patch (Barnard's Star). Every number is a model (H4) |
| Labels | The card title starts "Simulated:". The pretend planet is dashed amber with a "Pretend" tag (carried). Every number is tagged "Model" |
| Panel | The sandbox card (`shell/sandbox.ts`) opens under the mission card (desktop) or below the steps in the sheet (phone) |
| Step 1 | **Simulated: could SPHEREx see a Neptune-sized planet 500 times farther from the Sun than Earth?** Press **Check**. Check: a verdict exists (`verdict()` of `answer(planet, noises)`) |
| Step 2 | **Bring it closer until one picture would show it.** The distance slider. Check: `verdict().kind === 'one'` |
| Step 3 | **Or keep it at 500 AU and make it bigger.** The size slider. Check: `kind === 'one'` with distance ≥ 500 AU. Reachable: Opus measured about 9 Earth radii, inside the 30-radius limit |
| If the patch has no measured noise | `verdict().kind === 'unknown'`: "Not worked out: this patch has no measured noise to compare with." **Continue without it**. Success shows no model numbers |
| Success heading | "Simulated: you tested a pretend Planet X." |
| Result lines | "By a simple model and this patch's measured noise: a Neptune-sized planet would show in one SPHEREx picture closer than about {d} AU." · "At 500 AU it would need to be about {r} times Earth's width." · **"Nothing here was observed."** · sources: "Model: Sima's sandbox · Noise: measured from SPHEREx pixels" |
| How {d} and {r} are found | A pure function in `explore/plan-x.ts` (lane H) searches the distance (and the radius) for the edge where `verdict().kind` turns to `'one'`, by halving the interval within `LIMITS`, with tests |
| Skill | **What-if**: "Ask the model what SPHEREx could see." |

Planet X never enters results, exports, finds or anything Measure reads (carried, tested by
`tests/sandbox.test.ts`).

## 7. Discover components

All use DESIGN-v2 materials and tokens.

| Component | Material | Spec |
|---|---|---|
| View switch | Regular | DESIGN-v2 §9 |
| Mission list | Regular | 372 px. Rows: a 44 px node and text; title 16 px, line 14 px, meta 12 px/500. The suggested row on `fill-1`. The skills record in the header: 12 px/500, a check mark per learned skill |
| Mission beacon | on the sky | DESIGN-v2 §9 |
| Mission card | Raised | 380 px. Eyebrow; title 25 px; object line; steps (26 px number disc; done = white disc with a check); hint box; hint buttons; a 4 px progress bar; key hints |
| Discover frame | Slate | Picture `min(560px, 100vh − 330px)` on desktop. Data line under the name (H2). Date badge on the picture. Play 56 px; step buttons 48 px; date chips 48 px (letter in its pass tint, month, pass), the current one ringed 2 px `mark`. View segments: Flip, Two dates, Difference, Stack |
| Success card | Raised | 420 px. Pill; 25 px heading; result block (white 5%): the measured value at 25 px, the catalogue value under it, the comparison pill, the sources line; the skill line; actions |
| Coach card | Raised | 340 px. Never over the control it explains, the frame or Measure's numbers (GDE-8). Expert's first-visit coach sits in the free sky left of the frame (where picture tools open later); on phones it is a line at the top of Measure |
| Phone sheet | Slate | Section 11 |

## 8. Copy

Voice: plain, warm, exact. Short sentences. Numbers in Discover keep their error when they are
the result ("10.50 ± 0.26″ a year") and are rounded only in passing lines.

**No discovery claims.** "Discover" appears only as the view's name. No sentence says "you
discovered", "new", "discovery" or "first". For known objects the words are "caught", "found" and
"made appear"; for Planet X, "tested" and "pretend". For live spots: "pictures of this spot".

| Say | Not | Because |
|---|---|---|
| picture | exposure, frame | "Exposure" is Expert's word |
| colour band, near infrared, deep infrared (with µm in small type) | detector, channel | |
| moved … a year | proper motion | |
| times the noise | sigma, SNR | |
| simulated, pretend, model | prediction, would be found | H3, H4 |
| catalogue (Gaia's star catalogue) | ground truth | |
| not detected with this method | nothing there, invisible | Not seeing is not absence (Codex 6) |

**Key strings** (final English):

| Where | String |
|---|---|
| View switch | Discover · Expert |
| Miss note | Not that one. That star stays put. |
| Show me | It's inside the ring. Tap it. |
| Measuring | Measuring… |
| Not available | Not measured: {reason}. · Continue without it |
| Leave mission | Leave the mission? Your step is kept. · Leave · Stay |
| Expert coach | You're in Expert view · Every number, picture tool, frame and workspace. Same star, date and wavelength as before. · Your missions are kept. · Switch back to Discover here. |
| Expert on a phone | Picture tools, several frames and workspaces need a computer. · Send this to my computer |

## 9. Arabic

English interface for the hackathon. Arabic appears where the app already uses it:

- **The wordmark** سيما in the Ruqaa face (`--arabic-display`, mockups: Aref Ruqaa Bold). The
  Ruqaa face is used **only** for the wordmark.
- **Arabic star names** on place cards, labels and search results, from the places catalogue with
  its source, in the plain Arabic text face (`--arabic-text`, mockups: Noto Sans Arabic). Never
  smaller than 14 px.
- **Arabic search** by name (PLC-4), carried.
- **Bidi isolation**: every Arabic name inside a Latin line, and every Latin number, coordinate or
  µm value inside an Arabic name line, sits in its own `<bdi>` (or `dir="auto"` span), so the
  separators stay in place. Layout uses logical CSS properties (`margin-inline-start` and so on)
  so a later Arabic interface can mirror.
- Reem Kufi is used nowhere.

## 10. Accessibility

- **Keyboard.** Everything in Discover works with keys. The picture answers through the existing
  key picker (`explore/keypick.ts`): Tab into the picture, the arrow keys move a crosshair one
  pixel (Shift for more), it announces the position, Enter answers. With "Show me" the ring tells
  the visitor where to move it. That is all it does in v2.0; no source list is promised.
- **The ghost's arrow** is a focusable button: arrow keys turn and stretch it (carried), and its
  label says the speed and direction in words.
- **Planet X's sliders** are native range inputs with their values in words ("500 AU, 3.9 times
  Earth's width").
- **Focus.** On a step change, focus moves to the step card only if focus was on the control that
  finished the step; a slider or Play being used keeps focus (Codex 11). Escape closes the top card
  (on the mission card it asks first). Skip in the intro never takes focus (O-G8, carried).
- **Screen readers.** The mission card has a polite live area: each step, miss and result is
  announced once. The picture's text alternative changes with the date ("Picture B, March 2026, of
  3"). Skills read as "Blink, learned" or "Stack, not yet". The sheet's grabber is a button
  ("Show more" / "Show less").
- **Shortcuts.** `H` asks for a hint only while focus is in the mission card or the picture (WCAG
  2.1.4). There are no other new single-key shortcuts; the view switch is reached with Tab.
- **Motion and flashing.** Flips stay at or under 2.5 a second (carried). Reduced motion: section
  5.9.
- **Targets.** Phones: every hit area at least **48 × 48 px**, with 8 px between, including the
  view switch's segments, the grabber and icon buttons. The visible icon may be smaller; the hit
  area is not. Desktop: 36 px minimum.
- **Colour** is never the only signal: steps are numbered, skills have words and check marks,
  "Simulated" is a word and a dashed line, date chips have letters and months.
- **Text size.** On glass, sentences are at least 14 px; compact labels are 12 px at weight 500 or
  more. Charts are drawn at the panel's own size with axis labels at least 11 px. (The mockups show a scaled-down capture of the app's chart, so its labels look smaller there; that is a mockup limit, not the rule.)
- **Zoom and reflow.** At 400% desktop zoom (320 CSS px wide) the page uses the phone scroll
  layout: no control is clipped, and the page scrolls vertically. Large text (200%) wraps; nothing
  is cut by `overflow: hidden`.
- **Testing.** One full mission with the keyboard only (automatic). VoiceOver (iPhone) and TalkBack
  (Android) with a person, once before release (manual). A live-region string read by a script is
  not that test.

## 11. Phones

Mockups: `01`–`07` at 390×844.

### 11.1 Two layouts, chosen by space

Lane M computes the layout from the **visual viewport** (`window.visualViewport`: it excludes the
browser bars and the on-screen keyboard) and sets `html[data-layout="phone-fit" | "phone-scroll"]`
with CSS variables for the picture side (`--pic`) and the sheet height (`--sheet-h`). It recomputes
on resize, rotation and keyboard open.

**Fit layout** (the default when it fits): top row 56 px; the frame under it (header, picture,
controls 56 px, date chips 48 px); the sheet under the frame. Fixed parts add up to 244 px with
gaps. Then:

- picture side `P = min(width − 24, height − 244 − sheet)`, where the sheet is 120 px at **peek**,
  or its content height up to 50% of the height at **half**;
- **the picture never goes under 240 px**. At half, if `P` would drop under 240, `P` is 240 and the
  sheet takes what is left; its content scrolls inside.
- If `P` is under 240 even at peek, the page uses the scroll layout.

Examples (visual viewport): 390×750 (iPhone in Safari) → peek: 366 px picture; half: 240 px
picture and a 266 px sheet. 360×650 → peek: 286 px; half: 240 px and 166 px. 320×480, and any phone
on its side → scroll layout.

**Scroll layout**: one column that scrolls vertically: the top row (sticky), the frame (picture
`min(width − 24, height − 72)`, at least 240 px), the controls, then what would be in the sheet,
in the page's flow. No sheet. This also serves 400% zoom and large text.

### 11.2 The sheet (fit layout only)

- **Slate** (opaque), 28 px top corners, a grabber. Never glass, never over the picture.
- Two heights: **peek** (the step or title, one line and one button) and **half**. A tap on the
  grabber (a button) toggles them. No drag in v2.0.
- Which height when: home → half; mission → peek (half while a hint is open); success → half;
  place card → half.
- **Return rule** (Codex 13). Opening secondary content (a place card from the sky, the hint box)
  saves the current content, height and the control that opened it. **Back** restores them,
  without changing the mission. Escape does exactly one Back or one Close. Focus returns to the
  control that opened it.
- **Full-height pages**: Settings, About and Find open as a full-height Slate page with **Back**.
  They are modal: the picture and sheet behind are inert and paused for input, and say so to
  screen readers.

### 11.3 Top row and menu

56 px tall (48 px hit areas): the wordmark (the Arabic only, under 360 px wide), a **menu** button
(Find, Settings, Share, About), and the view switch (two 48 px segments). On a 320 px width the
switch shows "Discover" and "Expert" at 12 px/600.

### 11.4 Provenance on phones (H2)

The frame's header wraps to two lines when needed: name, then "Real data · SPHEREx {release} ·
{full date} · D{n} {λ range} µm". In Two dates it says "Two dates combined: {date A} (red) ·
{date B} (cyan)", and **Original** is one press away (H8). The date badge stays on the picture.

### 11.5 Expert on a phone (`05`, `06` at 390)

The scroll layout, always: the top row with the switch; the frame (Slate) with the full badge; a
compact bar (previous, Play, next, the counter "12 of 72"); the date scale for display only (the
buttons step, so no tiny targets); the wavelength as a slider row; then **Measure** in the page
flow (headline, tabs, chart, "Show all the numbers"). A row says "Picture tools, several frames
and workspaces need a computer" with **Send this to my computer**, which opens the system share
sheet (Web Share API) or copies the link. The first visit shows the coach line at the top of
Measure, not over it.

### 11.6 The intro on phones

Plays (carried) and cross-fades to the Discover globe at the top of the screen, with the welcome
in the sheet at half.

## 12. Honesty review (H1–H10)

| Rule | Where Discover could break it | What the design does |
|---|---|---|
| H1 the map is an average | The globe looks like "the sky now" | The sky note is always visible ("Average of all dates: moving things blur here · SPHEREx {detector in words}"), never covered (keep-clear) |
| H2 every picture says source, release, date, wavelength | Discover hides technical lines | The data line is on every frame, also on phones (11.4) |
| H3 simulated says so, dashed, never mixed | Planet X; the welcome's fine print | "Simulated:" first; dashed amber; never in results or exports; "Nothing here was observed". The welcome no longer says "every picture is real" |
| H4 measured, catalogue or model, labelled | Plain sentences | Each result has a sources line; the measured value and the catalogue value are on separate lines; model numbers are tagged "Model" |
| H5 not measured, never a model fallback | A step needs a number | The "Not available" state with its reason, and a finish without a number (6.x) |
| H6 flagged, missing, failed stay visible | Clean chips | Missing dates are dotted "Missing" chips |
| H7 no discovery claims | The view name, success lines | Section 8's rule. The hunt, the place where the risk was largest, is not in v2.0 |
| H8 processing says so; original one press away | Stack, Two dates | The stack says "Stack of {n} pictures, along a trial motion" (carried); Two dates says "Two dates combined"; Original is one press away |
| H9 facts from a named source | Object lines, the ghost's type, "no known star is faster" | Built from catalogue fields at runtime (SIMBAD type, never typed into the spec); each sentence has its source |
| H10 AI disclosure | n/a | About is shared and keeps it |

## 13. Fit with the architecture

**No new bus messages.** Discover is a different shell around the same two halves.

**Contract changes** (each needs the integrator's agreement, AGENTS.md rule 7; all are small):

1. **`shell/view.ts` (new, F)**: `getView(): 'discover' | 'expert'`, `setView(v)`, `onView(fn)`.
   It sets `html[data-view]`, writes `sima-view`, and calls `setLevel('explore')` for Discover or
   `setLevel('measure')` for Expert. Added to SPEC 8.4.
2. **`viewer/state.ts` (D)**: an optional `S.measureOpen: boolean` (written by E), so in Expert
   the Measure button opens and closes the panel without leaving the Measure level.
3. **`explore/game.ts` (H)**: `StarterId` gains `ghost` (`too-faint` stays as an alias for old
   links; `copy.ts` and menus show only the new name). `openStarter` stays the one way in, through
   the existing `start` message.
4. **Stack in Discover, and its result** (D, for the ghost; Codex 2, Opus 2):
   - `VIEWS.explore` becomes `['flip', 'two', 'diff', 'stack']` (`viewer/state.ts:36`).
   - `viewer/motion.ts` `active()` (line 80) drops `S.level === 'measure'`; it needs
     `S.mode === 'stack'`, no colour picture and pictures, as now.
   - A new export in `viewer/motion.ts`:
     `trialResult(): { key: string; motion: Motion; atCatalogue: boolean; result: StackResult } | null`.
     `key` is the patch, detector and combine setting (`keyNow()`); it returns `null` while the
     newest stack is still being made or when the one on hand is for an older key. At the
     catalogue motion it returns the ordinary stack's result (`render.ts` `stackShown()`).
   - The handle starts where the mission says by calling the existing `setTrial({ pmra: 0,
     pmdec: 0 })`. No new option is needed.
   - The explore level's badge and stack picture keep their "trial motion" labels (H8).

**Agreed typed contracts before parallel work** (Codex 14), all new exports, frozen in step 0:

| Contract | Owner | Shape |
|---|---|---|
| Progress | H | `progress(): Progress`, `onProgress(fn)`, `startMission(id)`, `leaveMission()`, `stepDone(id, step, state: 'done' \| 'unavailable')`, `resetProgress()`. In memory when storage is blocked |
| Mission results | H | Each check is a pure function `(inputs) → 'waiting' \| 'checking' \| 'done' \| 'unavailable' \| 'failed'` with a reason, tested in Node; inputs carry the result's key, and an old key is rejected |
| Sandbox reading | F (`shell/sandbox.ts`) | `sandboxState(): { planet; verdict; patchKey } \| null`, `onSandbox(fn)`, `openSandbox({ under })` |
| Sheet | M | `openSheet(el, { height, label, back? })`, `back()`, `closeSheet()`, `layout(): { kind, pic, sheetH }`, `onLayout(fn)` |
| Links | F | `ui=discover\|expert`, `mission=runaway\|ghost\|planet-x`. Order: `ui` wins; else Expert settings in the link mean Expert; else the remembered view |
| Glass | F | `glassLevel(): 'glass' \| 'solid'`, `onGlass(fn)` |

**Mount points** in `index.html` (F): `discover-list`, `mission`, `mission-success`, `settings`,
`coach`, `sheet`, `view-switch`. `narrow-note` is removed.

**`data-guide` names (new)**: `view-switch`, `view-discover`, `view-expert`, `mission-<id>`,
`mission-start`, `mission-step`, `mission-hint`, `mission-show-me`, `mission-leave`,
`mission-continue`, `success-next`, `success-expert`, `object-<key>`, `settings-button`,
`panels-solid`, `sheet-grabber`, `sheet-back`, `phone-menu`, `send-to-computer`.

**Escape order**: coach and tips 50; mission card, success, place card, Settings 30 (when two are
open at the same level, the most recently opened closes first); the phone sheet's Back 30;
Measure 10 (carried).

## 14. Build plan

**Lanes and files.** No file has two owners. H owns mission data and pure checks; K owns all
mission screens (Opus 22). M owns the phone layout as a whole.

| Lane | Builds | Owns (new files marked *) | Port |
|---|---|---|---|
| **F. Shell and glass** | Tokens, materials, Solid and fallbacks, governor, Settings, view switch, links, top rows, phone menu, sandbox reading exports | `src/styles/app.css`, `src/styles/shell.css`, `src/shell/view.ts`*, `src/shell/glass.ts`*, `src/shell/settings.ts`*, `src/styles/settings.css`*, `src/shell/sandbox.ts`, `index.html`, `viewer/url.ts`, `viewer/share.ts` | 5176 |
| **C. Sky** | Globe at full zoom-out (Aladin `setProjection('SIN')` with a 0.3 s cross-fade both ways), the intro → globe cross-fade, limb glow, beacons, labels on Thin chips over bright sky, keep-clear for Discover | `src/sky/*`, `src/styles/sky.css`. The intro's files stay with their owner; C listens for the intro's existing landing state (`html[data-intro]`) and asks the integrator for a "globe turned" event if one is needed | 5173 |
| **D. Frame and bar** | Frame and bar in Slate and Regular; the Discover frame (56 px Play, date chips, four views); contract 4; phone frame header; Expert-on-phone compact bar | `src/viewer/` files D owns incl. `motion.ts`, `src/viewer/chips.ts`*, `src/styles/frame.css` | 5174 |
| **E. Measure and tools** | Measure and tools in Slate; `measureOpen`; Measure in the phone column | `viewer/detail.ts`, `tools.ts`, `inbox.ts`, `src/styles/tools.css` | 5175 |
| **G. Places** | Place card in Raised glass; Discover wording; the Arabic text face and bidi isolation on names | `src/shell/places.ts`, `objects.ts`, `places/*`, `src/styles/places.css` | 5177 |
| **H. Missions engine** | The three missions' data and checks, progress, plain sentences, Planet X's edge search, "Try another object" templates | `src/explore/*` incl. `missions.ts`*, `progress.ts`*, `plain.ts`*, `plan-x.ts`*; `src/guide/*`; `tests/missions.test.ts`* | 5178 |
| **K. Discover interface** | Welcome, home (list, skills record, objects), mission card, success, coach | `src/discover/*`* , `src/styles/discover.css`* | 5181 |
| **M. Phone layout and sheet** | Fit and scroll layouts, the sheet, Back rule, full-height pages | `src/shell/sheet.ts`*, `src/shell/layout.ts`*, `src/styles/sheet.css`*, `tests/sheet.test.ts`* | 5182 |
| **Integrator** | `main.ts` wiring; workspace.css on tokens; smoke flows; the release gate | `src/main.ts`, `src/styles/workspace.css`, `tests/smoke/*`, `docs/*` | 5180 |

**Steps and time** (working days, lanes in parallel; times include tests):

| Step | When | Result | Lanes | Cut rule if late |
|---|---|---|---|---|
| 0. Contracts | Day 1, morning (0.5 d) | The four contract changes and six typed contracts agreed; stubs merged; tokens in `app.css`; mount points | F, D, H, M, Integrator | None: nothing starts without it |
| 1. Night Glass in Expert | Day 1 afternoon – day 2 (1.5 d) | Expert re-skinned; Solid setting and fallbacks; governor; contrast and glass-area checks in the smoke test | F (1.5 d), D (1 d), E (1 d), G (0.5 d), Integrator | Ship the governor as "Solid if software renderer, else Glass" |
| 2. The vertical path | Days 2–3 (1.5 d) | Cold visit → intro → welcome → runaway → success → Expert → back, on desktop and on a phone, keyboard and reduced motion | K (1.5 d), H (1 d), D (1 d: Discover frame, phone header), M (1.5 d), C (0.5 d spike + 1 d globe) | If C's globe spike fails by midday 3: Discover home uses today's sky at its widest zoom; the cross-fade goes straight to it |
| 3. Ghost, Planet X, objects | Days 3–4 (1.5 d) | Contract 4 built; the ghost and Planet X end to end; Try another object; live states; Expert as a phone column | D (0.5 d contract 4), H (1 d), K (1 d), E (0.5 d), F (0.5 d sandbox exports) | If the ghost does not pass its checks by the end of day 4, it ships as "Try another object" (WISE 0855, ungraded) and v2.0 has two missions |
| 4. Release | Day 5 (1 d) | The release gate (section 15) passes; manual pass on a real GPU laptop, Safari, Firefox, an iPhone and an Android phone | All, Integrator leads | Anything failing the gate is cut, not delayed |

Total: about **five working days** with eight lanes. A smaller team does steps 1–2 first and still
has a demo after three days.

## 15. Release gate and acceptance checks

### 15.1 The release gate (all must pass)

| ID | Check |
|---|---|
| GATE-1 | **Cold visit → Skip → the runaway → result → Expert → back to Discover**, at 1366×768 and at a short phone (360×640 visual viewport) |
| GATE-2 | The same path with the keyboard only |
| GATE-3 | The same path with reduced motion |
| GATE-4 | The same path on a slow network (Chromium's "Slow 4G" profile) and with the live service off |
| GATE-5 | `npm run typecheck`, `npm test`, `npm run build` pass; SPEC 11.2 budgets hold (section 16) |
| GATE-6 | Five people new to Sima, each shown the page after the intro: within ten seconds, each can say what the task is and which picture to act on (manual, Codex 8) |

### 15.2 Acceptance checks

Automatic unless marked (manual).

| ID | Requirement | Check |
|---|---|---|
| GLS-1 | Every material uses the DESIGN-v2 recipe; no `backdrop-filter` outside `app.css` | Lint |
| GLS-2 | Text colours on every material and the final component states (filled rows, pills, disabled, focus) pass 4.5:1 over white, Betelgeuse and the Milky Way, with grain on | Smoke, `mockups/tests` method on the built CSS |
| GLS-3 | GLS-2 in Firefox and Safari | Manual, once per release |
| GLS-4 | No glass element has an ancestor with opacity < 1, filter, mask, clip-path, mix-blend-mode or backdrop-filter | Smoke |
| GLS-5 | Blurred area within budget at each size (DESIGN-v2 §6) | Smoke |
| GLS-6 | No canvas or `.well` is under or inside any element with a backdrop-filter, or under the phone sheet | Smoke |
| GLS-7 | Solid via the setting, `prefers-reduced-transparency`, no `backdrop-filter` support, phones; contrast-more and forced colours as DESIGN-v2 §5 | Smoke with emulated media |
| GLS-8 | The governor: software renderer → Solid; slow first 1.5 s → Solid; never back up during a visit; the visitor's choice wins | Unit with fake frame times |
| VIEW-1 | A first visit opens Discover; `b102-level=measure` opens Expert once | Smoke |
| VIEW-2 | The switch is on screen in both views at all sizes, and keeps target, date, detector and field size | Smoke |
| VIEW-3 | Expert shows everything today's Measure level shows; nothing in Expert depends on progress | Existing flows run in Expert |
| VIEW-4 | Link order (`ui`, Expert settings, remembered view); `mission=`; progress never in a link | Unit (url.ts) |
| VIEW-5 | The first switch to Expert shows the coach once, not over Measure's numbers | Smoke |
| DSC-1 | After the intro the globe cross-fades in and the welcome card appears; Skip lands on the same state; Start shows playable pictures in under 1 s | Smoke (`?intro=1`) |
| DSC-2 | At full zoom-out the sky is a globe with the limb glow in the shown detector's hue, and the sky note names the detector in words | Smoke + screenshot |
| DSC-3 | The list shows three missions and three objects with correct states; no locked state exists | Unit + smoke |
| DSC-4 | Every Discover tool works before any mission is done | Smoke on a fresh profile |
| DSC-5 | Look here: every live state in 5.6, including timeout, partial and "service off"; an arriving request never replaces an open mission | Smoke with the service off, slow and on |
| DSC-6 | Every state in 5.9 is reachable and worded as written | Smoke |
| DSC-7 | The sky note is never covered at 1366×768 | Smoke (keep-clear) |
| MSN-1 | Each check calls the function named in section 6 and never passes before its value exists; old keys are rejected | Unit (missions.ts) |
| MSN-2 | The runaway: opens paused; Play passes step 1; a tap on the track passes; a tap three reach-radii away gives the miss note | Smoke |
| MSN-3 | The runaway's success shows 10.50 ± 0.26″/yr (or the not-measured form) and Gaia's 10.39″/yr on separate lines | Smoke |
| MSN-4 | The ghost: Stack works in Discover; the arrow starts at no motion and does not pass; the catalogue motion passes; the opposite motion does not | Smoke (arrow keys) |
| MSN-5 | Planet X: "Simulated" first everywhere; verdicts from `core/sandbox.ts`; `unknown` gives "Continue without it"; nothing reaches results or exports | Unit (extends `tests/sandbox.test.ts`) |
| MSN-6 | Every "Not available" state has a finish; the step is stored as "unavailable", not "done" | Unit |
| MSN-7 | Show me rings and never completes a step | Smoke |
| MSN-8 | Progress survives a reload; Reset clears only `sima-missions`; blocked storage works in memory | Smoke |
| MOB-1 | No horizontal overflow at 390×844, 360×640, 320×568 and 568×320 | Smoke |
| MOB-2 | Every hit area at least 48×48 px with 8 px between | Smoke measures buttons and `[data-guide]` |
| MOB-3 | The picture is never covered: at peek and half, the sheet's top is below the picture well's bottom; the picture is at least 240 px or the page is in the scroll layout | Smoke at each size |
| MOB-4 | The sheet's Back rule: secondary content returns to the mission content, height and focus | Unit + smoke |
| MOB-5 | The runaway can be finished on a phone in both layouts | Smoke at 390×844 and 568×320 |
| MOB-6 | Rotation during a mission keeps target, date, step and focus | Smoke |
| MOB-7 | Expert on a phone: one column with Measure; Send this to my computer shares or copies | Smoke |
| MOB-8 | The phone frame header shows source, release, full date and wavelength | Smoke |
| A11Y-1 | One full mission with the keyboard only | Smoke |
| A11Y-2 | Step changes, misses and results are announced once; focus is not taken from a slider or Play | Smoke |
| A11Y-3 | `H` works only with focus in the mission card or picture | Smoke |
| A11Y-4 | Arabic names are bidi-isolated and at least 14 px | Smoke |
| A11Y-5 | 400% zoom at 1280 wide uses the scroll layout with nothing clipped | Smoke |
| A11Y-6 | VoiceOver and TalkBack with a person | Manual |

## 16. Performance budgets

SPEC 11.2 and DESIGN-v2 §6 hold. Added:

| Thing | Budget |
|---|---|
| Page open with the intro skipped → the welcome card visible and the runaway's pictures loaded | ≤ 3 s on the reference laptop (SPEC 11.2's starter budget) |
| Start (welcome or list) → pictures ready to play | ≤ 1 s |
| A mission check after the action | ≤ 100 ms on the page's thread. Checks that wait for a measurement show "Measuring…"; the measurement runs in the worker, and no task on the page's thread passes 100 ms |
| Frame steps | < 50 ms (carried) |
| Discover code (`src/discover`, missions, sheet, layout), gzip | ≤ 40 KB on top of today's bundle |
| Phones: memory | One patch at a time in a mission |

## 17. v2.1 later

Brought back only after v2.0 passes its gate. Each item carries what the reviews require.

1. **The breather (R Draconis)**, redesigned: "Which picture is brighter?" on the measured
   brightest and faintest visits side by side, checked against the two measured visit values;
   then the light curve. Spans counted from the frames shown. Brightness words from the existing
   visit test: "Light at this fixed spot changed by up to {ratio}× across {n} visits, more than
   noise allows." The 246-day period labelled "AAVSO VSX catalogue".
2. **The recipe (Epsilon Indi B)**: a colour slider that stops only on measured channels and
   shows gaps as "not measured"; a dip passes only when it is below the nearest measured channels
   on each side outside the band, by 3σ; copy that does not say the check proved the molecules.
3. **The real hunt**: ungraded. If practice comes back, it grades only what each label checks
   ("At a catalogued star", "On one picture only", "No stronger than noise would make"), from a
   set worked out at build time and reviewed by a person, with no pass score until then. Copy:
   "Changes Sima's search flagged here. Most turn out to be glitches or known stars. Your marks
   are notes for you, not results."
4. **The Chart (light) theme.** Its tokens and measured contrast are kept in
   `mockups/glass.css` and DESIGN-v2 §14.
5. **Lite glass**, only if measured cheaper than Glass on real devices.
6. **The field guide.**
7. **The full sheet height, drag between heights, and a landscape side panel.**
8. **"Describe the dots"**: needs a per-source shift measurement (lane B, with tests).
9. **Offline mission play**: needs a lane to cache `frames.bin.gz`.
10. **Limb tags** for far-side objects.
11. **The Arabic interface**, with fluent review of the astronomy wording and RTL layouts.
12. **Tour resume (GDE-3)**: not reachable in v2.0, because its offer lived on v1's welcome card.

## 18. Open questions for the team

1. **The live service** (SPEC risk 2). Is it hosted for the judging? v2.0 does not need it; Look
   here beyond the shipped objects does.
2. **Real-device timing.** Who can run the governor's check on an iPhone, an Android phone and an
   integrated-GPU laptop on day 5? Without it, phones stay Solid and desktops keep the early check.
3. **The demo film** (SPEC 9.6). Proposed: intro → welcome → the runaway → success → "How was this
   measured?" → Expert showing 10.50 ± 0.26″/yr beside Gaia's 10.39″/yr; then about 20 s of the
   ghost's stack with its two controls. Agree, and update SPEC 9.6?
4. **The Arabic text face** behind `--arabic-text`: the mockups use Noto Sans Arabic. Confirm, or
   name another plain face.
5. **SIMBAD's type for WISE 0855** is filled at runtime. Recent papers give later types than
   older ones; the team should check what SIMBAD returns before filming.
