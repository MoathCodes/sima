# Challenge: Sima v2 design (Opus)

Independent review of `DESIGN-v2.md`, `BEGINNER-AND-MOBILE.md` (B&M below), `RESEARCH.md` and the
mockups, checked against `docs/SPEC.md`, the code in `src/` and the shipped data in `public/`.
Written 15 November 2026. Nothing in the app was changed.

## Verdict

**Build it, but with changes.** The look is right: dark smoked glass, science in opaque wells,
measured contrast, and no reward colours. It is calm and honest, and the globe after the intro will
impress. The weak parts are the missions and the scope. I ran the real code on the shipped data.
Three of the six missions do not work as written:

- **The ghost** needs a tool that today only runs in Expert.
- **The recipe** has 29 measured colours out of 102, not "28 early on".
- **The hunt's practice** grades people against the change search's guesses and calls them
  "known answers".

The plan is also weeks of work, not days. It has 9 lanes, 6 missions, a sheet system, two themes,
a governor with three levels and about 40 acceptance checks. Cut it to v2.0: the glass, the view
switch, the welcome and home screens, and three missions done well (the runaway, the ghost after
its fix, and Planet X), plus a simple phone layout. Fix the honesty wording listed below before
anything ships.

## How I checked

- Read all three documents in full, the SPEC sections they lean on (H1 to H10, 1.4 judging, 6.3
  live service, 9.6 demo, 11.2 budgets), and the code each mission check names.
- Looked at every PNG at 1900 and 390, and screens 02 and 03 at 1366.
- **Ran the real change search** (`core/detect.ts` `findChanges`) on all five shipped patches ×
  six detectors, at threshold 5 and at threshold 3, and counted the verdicts.
- **Ran the real spectrum** (`measureTarget` + `channelSpectrum`) on Epsilon Indi B and applied
  the recipe's step 2 and step 3 rules to it.
- Read R Draconis's frame dates per detector from `public/data/r-dra/frames.json`.
- **Measured glass cost** with a test page: a full-window WebGL star field that moves every frame,
  with glass panels covering 23%, 35% or 65% of the window. I ran it on this machine's real GPU (AMD
  Renoir integrated, Vulkan) and in SwiftShader (software rendering, the worst case). Each run was
  240 frames on a shared machine, once per case. Treat the numbers as rough.

## Findings, ranked

Effort: **S** under 2 hours, **M** about half a day, **L** a day or more.

### 1. Blocker: the plan does not fit the time

**What is wrong.** B&M §13 gives a time only for step 0 ("half a day"). The rest is a lot of work:

- 6 missions, each with new checks;
- a practice set and the hunt;
- a field guide and coach cards;
- a bottom sheet with three detents, gestures and screen-reader actions;
- the globe hand-off (SIN);
- phone layouts in six stylesheets, and Expert on a phone;
- the Chart theme, a three-level governor and four media-query fallbacks;
- about 40 acceptance checks (§14).

Two lanes are new. Step 2 alone needs K, H, C and D working on one flow at the same time.

**Evidence.** B&M §13 and §14. SPEC 1.4: judges score impact, creativity, validity, relevance and
presentation. Judges will play one mission, maybe two.

**Fix.** Use the cut list below. Add this line to B&M §13: "v2.0 is the cut list's 'build now'
rows; everything else is v2.1 and must not block the demo."

**Effort.** S to write down. It saves weeks.

### 2. Major: Discover cannot run the ghost, or the Brightness and Stack skills, at the Explore level

**What is wrong.** B&M §12 contract 1 says Discover runs the frame at `setLevel('explore')`. But:

- The motion handle only works at the Measure level: `src/viewer/motion.ts:80`,
  `return … S.level === 'measure' && S.mode === 'stack' …`.
- Explore's views are Flip, Two dates and Difference. Stack is Measure only (SPEC FRM-7).
- The handle starts at the catalogue motion (`trial = null` means catalogue, `motion.ts:39`). The
  ghost's step 3 needs it to start at zero.
- None of this is in lane D's list in §13, and none of it is one of the "three small, additive"
  contract changes.

**Fix.** Add a fourth contract change to B&M §12: "In Discover, the frame allows the views its
skills have unlocked (Stack after the Stack skill or inside the ghost mission). `motion.ts`
`active()` accepts `S.level === 'explore'` when `html[data-view=discover]` and the Stack view is
on. A new `startAt: 'zero' | 'catalogue'` option sets where the handle starts." Add `motion.ts` and
`render.ts` view gating to lane D's row in §13.

**Effort.** M.

### 3. Major: the hunt's practice grades people on the pipeline's guesses, and the shipped data cannot fill it

**What is wrong.**

- B&M §5.6 grades "Known → A real star moving", "Likely artefact → A glitch in one picture" and
  "Weak → Just noise", and calls these "known answers".
- They are the change search's heuristic labels, the very thing B-7 rejects grading on:
  - **Known** means "at a Gaia or CatWISE source, or the patch's target" (`detect.ts:24`). It does
    not mean "moving". It is set for brighter or fainter changes too (`detect.ts:618–624`).
  - **Weak** is also given to anything "in a bright star's glow" (`detect.ts:635–637`), which is
    not noise.
  - **Artefact** covers "in a bright star's glare" too (`detect.ts:645–647`). So the feedback "it
    is on 1 of 4 exposures only" is wrong for about half of them.

**Measured (real search, shipped patches).**

| Threshold | Known | Weak | Likely artefact | Possible / Strong | Not confirmed |
|---|---|---|---|---|---|
| 5 (all 30 patch × detector runs) | 14, all on the three moving targets (Barnard's Star, Epsilon Indi B, WISE 0855) | **1** | 105 | 25 | 26 |
| 3 | 20, of which **1** is not the patch's own target | 51 | 260 (128 glare, 132 one-exposure) | 79 | 49 |

At the default threshold, practice cannot find two Weak spots. At any threshold, "a real star
moving" means showing people Barnard's Star, Epsilon Indi B or WISE 0855 again, which they have just
done in other missions.

**Also overclaiming:**

- The path row says "Candidates nobody has checked yet" (`02-discover-home`).
- §5.6 says "Nobody knows yet if any of these are real."

Sima cannot know either. The candidates are mostly glitches and known stars, and a catalogue may
already list them.

**Fix.**

1. Grade what the label actually checks, and word the answers to match:
   - "At a catalogued star (Gaia or CatWISE)"
   - "On one picture only"
   - "No stronger than noise would make"

   The feedback names the check ("The search found it on 1 of 4 pictures of that date"). It never
   names a cause as fact ("A cosmic ray or a hot pixel *can* do that").
2. Use threshold 3 for practice, and only one-exposure artefacts, not glare.
3. Work out the practice set at build time with the same code. Save it as small cutouts in a JSON
   file. That removes the 5 s worker job and the two-patch memory conflict on phones (B&M §15).
4. Change the copy to: "Changes Sima's search flagged here. Most turn out to be glitches or known
   stars. Your marks are notes for you, not results." Path line: "Changes to look at yourself".

**Effort.** M. Move the hunt to v2.1 anyway (see the cut list).

### 4. Major: the recipe mission's slider and checks do not match the data

**What is wrong.** B&M §5.4 says "28 of 102 colours measured early on". In fact, after all 87
exposures, **29 of 102 channels have any data, and 28 are clear**: 4 or 5 per detector. Each
exposure gives one channel at the target. So:

- Most of the 102 slider stops are gaps that can never be measured, and nothing will fill them as
  pictures play.
- Step 2 ("≥ 85% of the brightest") passes at only **two** channels, 4.11 and 4.14 µm.
- Step 3 ("in a shaded band and below 50% of the brightest by 3σ") passes at **every** in-band
  channel. The z-scores range from 97 to 428, because everything except about 3.8–4.6 µm is below
  half the peak. So the check is really "is the slider in a grey band?". It does not test that a
  dip was seen.
- The strongest methane dip the tests use, 3.04 µm (`tests/real.test.ts:133`), is outside both
  shaded bands in `ABSORPTION` (`viewer/measure/model.ts:153`).

**Fix.**

- The slider snaps only to measured channels and shows the gaps as "not measured".
- Step 2 passes at the brightest measured channel or its neighbour.
- Step 3 passes when the chosen channel is in a shaded band **and** is below the nearest measured
  channel on each side outside that band, by 3σ. That is a real dip.
- Change "28 of 102 colours measured early on" to "{n} of 102 colours measured (each picture
  measures one)".

**Effort.** M. Move it to v2.1.

### 5. Major: phones carry the most glass on the weakest hardware

**What is wrong.**

- The measured blurred area is 53–65% of the window on phone screens 01, 02, 04 and 07
  (DESIGN-v2 §6), against 12–23% at 1900.
- Blur radius is in CSS pixels, so at DPR 3 a 32 px Raised blur is about 96 device pixels.
- The "start at Lite" rule uses `navigator.deviceMemory`, which is Chromium only. iPhones never
  report it, so they start at full glass.
- On the phone home screen the sheet sits over empty space below the globe (`02-…-390`). The blur
  costs GPU and changes nothing you can see.
- On `04-mission-success-390` the Raised sheet covers the lower part of the Two dates picture. That
  is glass over a picture, which breaks the Well Rule and the design's own check GLS-6.

**Measured.** On the AMD integrated GPU, 65% glass at DPR 3 with a 32 px blur still held 60 fps.
That machine has headroom; phones were not measured.

**Fix.** Add to DESIGN-v2 §8.3:

- "On phones the sheet is Slate at every detent; only the top row, chips and labels are glass
  (Thin or Regular at Lite radii)."
- "Phones (coarse pointer and narrower than 700 px) start at Lite."
- "At the half detent, the sheet never covers the picture well; the frame shrinks to fit above it."

This cuts phone glass to about 10% of the window and fixes the Well Rule break.

**Effort.** S in the spec, M in the build.

### 6. Major: the governor reacts too late and can misfire

**What is wrong.** DESIGN-v2 §6 samples only "while the sky is moving", needs 90 frames, then
steps down twice (to Lite, then to Solid). On the Discover home the globe is still most of the
time, so the governor may not decide during a judge's first minute.

Measured in SwiftShader (software rendering, which Chrome uses on blocklisted GPUs and in some
virtual machines and remote desktops): glass over the moving canvas **doubled the median frame time,
from 50 ms to 100 ms**, with a p95 of 167–233 ms.

Lite (half the blur) was **not** cheaper in that run: 133 ms median at 12 px against 100 ms at
24 px. So "Lite costs about half" (§5) is unproven.

**Second problem.** A fixed 22 ms threshold misfires where the browser caps the frame rate at
30 fps (33 ms gaps). iOS Low Power Mode does this. Glass would turn Solid there even when it costs
nothing.

**Fix.**

1. Decide once, early. The welcome card (glass) fades in over the globe while it glides (B&M 3.1),
   which is glass over moving WebGL. Time those 1.3 s, and repeat-visit landings the same way.
2. Start Solid when the WebGL renderer string contains "SwiftShader" or "llvmpipe".
3. Judge by dropped frames compared with the display's own pace (the shortest gap seen), not a
   fixed 22 ms.
4. Drop Lite from v2.0 (Glass or Solid only) until it is measured as cheaper.

**Effort.** M.

### 7. Major: the Blink skill's reward depends on a service that is not hosted

**What is wrong.**

- Blink's reward is "Play the pictures of any spot in the sky. Tap the sky, then 'Look here'"
  (`04-mission-success`). B&M §3.5 says other spots "use the live service".
- SPEC 1.5 says the service is "not hosted (O-D2)". SPEC 6.3 says a new spot takes 160–430 s.
- So for judges, "Try Blink" usually ends at "Live pictures are off right now", or at a wait of
  several minutes. The first reward feels empty.

**Fix.**

- Blink's reward text becomes "Play the pictures of the six shipped stars, and of any spot once
  its pictures are fetched".
- "Try Blink" opens **RW Aurigae**. It is shipped (72 exposures), has no mission, is a real
  variable (0.85 ± 0.11 mag measured, `tests/real.test.ts:162`), and works with no service.

**Effort.** S.

### 8. Major: the breather asks for an eye test the picture cannot support

**What is wrong.**

- In D6, R Draconis is saturated. The test confirms brightness comes from the outer glow
  (`tests/real.test.ts:145`, "saturated: the outer glow"), and the core is masked, like Barnard's
  Star in `03`.
- D6 has 30 exposures on 10 visits, from 27 Apr 2025 to 8 Jun 2026: about 13.5 months.
- B&M §5.2 says "Watch it for 18 months", but 18 months is the span across all detectors. The
  mockup dock says "over 8 months". Those are three different numbers for one star.
- "Stop it at its brightest" means comparing the size of a halo across 10 visits. The pass band,
  max(0.15 mag, 2σ), lets about 1–3 visits pass. Expect guessing and frustration.

**Fix.**

- Step 2 becomes **"Which picture is brighter?"**, showing the measured brightest and faintest
  visits side by side (Two dates). It is checked against the two measured visit values, which the
  fallback already plans.
- Then reveal the light curve with "Watch it change" playing.
- Every span in the copy is filled from the frames shown ("{months} months of pictures"), never
  typed by hand.

**Effort.** M.

### 9. Major: the welcome card says "Every picture here is real"

**What is wrong.** The same app shows Planet X, a simulation, and the labelled practice simulation
when the service is off (B&M §4.8). The sentence breaks H3 on the very first screen.

**Fix.** Change it to "Every picture here is real and says where it came from, unless it says
Simulated. Your progress stays in this browser."

**Effort.** S.

### 10. Minor: the 1366 home screen hides the sky note (H1)

**Evidence.** In `02-discover-home-1366.png` the mission path runs to y≈742 and covers "Average of
all dates…", which only shows as a cut-off line. H1 requires the note always.

**Fix.** In B&M §6, under "Mission path": "At heights under 820 px the path shows names only (one
line a row) and scrolls inside; it never covers the sky note." Add the sky note to the keep-clear
list.

**Effort.** S.

### 11. Minor: mission 1 is one tap, and its first step ticks itself

**What is wrong.**

- The runaway opens "playing" (B&M §5.1), so step 1 ("three date changes seen") passes in about
  1.2 s with no action. Step 3 has no check.
- The whole mission is "tap the big blob in the middle". The patch square on the sky says "The
  runaway", and the first hint says "Look near the middle".
- In D3 the "dot" is the largest thing in the picture: a saturated disc about 25 px wide with a
  masked core (`03`). It moves 1.7 px a year.
- "About 2 minutes" overstates it.

**Fix.**

- Open paused. Step 1 is "Press Play".
- Call it "One star jumps".
- Say "about 1 minute".
- Optional: centre the 6′ field 1′ off the target. The cutout allows it; `buildRealField` takes any
  centre.

**Effort.** S.

### 12. Minor: three ways to start the same mission on the home screen

**Evidence.** In `02-discover-home-1900`, the path's Next row, the dock's "Up next · Start" and the
globe beacon all start The breather. That is too many choices in a first-time visitor's first 10
seconds.

**Fix.** On desktop the dock holds only the skill shelf. "Up next" lives in the path. Phones keep
the dock's Up next card, because there the path is below it in the same sheet.

**Effort.** S.

### 13. Minor: locked tools go against the design's own "let people choose"

**What is wrong.** RESEARCH principle 11 and SDT favour autonomy. Yet Discover locks the Colour
slider and Stack until their missions are done, and "Unlock all" is hidden in Settings.

**Fix.** A dim skill tile is still a button: "Colour: learn it in The recipe (4 min) · Use it now".
Using it now does not count as the skill. The hunt keeps its gate.

**Effort.** S.

### 14. Minor: "I know astronomy" makes people rank themselves

**Evidence.** B-1 rejects the label "Beginner" because "it asks people to rank themselves". The
welcome button "I know astronomy" does the same thing.

**Fix.** Rename it "Show me every number" (it opens Expert).

**Effort.** S.

### 15. Minor: the globe hand-off is not "exact", and it is not Aladin's SIN in the intro

**What is wrong.**

- DESIGN-v2 D-11 says "Aladin Lite's SIN view, as in the intro". §11 says "the same picture of the
  same sky, so the hand-off is exact". §10 says "no cut".
- But the intro draws its own globe with its own shader from the order-3 Allsky image
  (`src/intro/sphere.ts`, `intro/scene.ts:169`). It does not use Aladin.
- Aladin does have `setProjection` (aladin-lite 3.8.2), but changing projection is a jump, not a
  blend. The app's `sky/aladin-lite.d.ts` does not declare it yet.

**Fix.** Change D-11 to say "the intro's own globe". Allow a 0.3 s cross-fade at both hand-overs
(intro → Aladin SIN, and SIN ↔ STG). The intro already uses a 0.4 s cross-fade (`T.crossfade`).
Lane C proves it in a spike before step 2.

**Effort.** M for the spike.

### 16. Minor: on the first two screens the glass is not visible

**Evidence.** In `01` and `02` at 1900, the welcome card, path and dock sit on empty blue-black
space next to the globe, with no overlap. Blurring black looks just like Slate, so the "premium
glass" judges see first is only a dark card with a rim. The glass shows well in `03` and `07`, over
stars.

**Fix.** Pick one:

- (a) Accept it, and make those panels Slate to save GPU.
- (b) Let the welcome card overlap the globe's limb by about 40 px on purpose, so the glow and the
  stars pass behind the glass.

I recommend (b) for the welcome card only. It is the moment that should impress.

**Effort.** S.

### 17. Minor: "About 1.7 pixels a year" is the wrong headline for the public

**What is wrong.** A pixel is the instrument's unit. It means nothing to a visitor and makes the
win feel small.

**Fix.** Make the headline a comparison worked out from the measured value, with its source:
"Fast enough to cross the full Moon's width in about {years} years" (Moon's mean width 31′, named
source). Keep "10.5″ a year, measured from 71 of 72 pictures" on the second line and the pixel
figure in Expert.

**Effort.** S.

### 18. Minor: the Brightness skill sentence compares only the first and last dates

**What is wrong.** B&M §5.2 skill says "changed by about {ratio}× between {first} and {last}". For
a star that pulses, the first and last dates can match while it changed a lot in between. Two noisy
points also have no test.

**Fix.** Use the visit test that already exists (`stats.ts` `visitTest`, `measure/words.ts`
`verdictOf`): "Its brightness changed by up to {ratio}× across {n} visits, more than noise allows"
or "No change we can measure across {n} visits".

**Effort.** S.

### 19. Minor: accessibility gaps

- **Skill tiles** show lit or dim by brightness alone. Add text state for screen readers ("Blink,
  learned" or "Stack, not yet") and a check mark on lit tiles.
- **The single-key shortcut `H`** fails WCAG 2.1.4 unless it works only while focus is in the
  mission card or picture. Say that in DESIGN-v2 §12.
- **"Describe the dots"** (B&M §9, A11Y-3) needs a new measurement: each source's shift between the
  first and last date. No code has it, and no lane lists it in §13. Either give it to lane B with a
  test, or ship the existing key picker (`explore/keypick.ts`) for v2.0 and add Describe later.
- **The phone Expert bar's mini date scale** (`06-…-390`) has stops far under 48 px, which fails
  MOB-2. Use the previous and next buttons plus the counter, and make the scale display only.
- **Chart axis labels in `06`** ("5 arcsec", "north up, east left") are about 7 px. The Size Ladder
  minimum is 11 px.
- **Arabic names inside Latin lines** (`07`: يد الجوزاء · Yad al-Jawzāʼ) need bidi isolation
  (`<bdi>` or `dir="auto"`), or the separator can jump.
- **Good already:** reduced motion, the in-app Solid setting (needed because Safari hides iOS
  Reduce Transparency), live-region announcements, colour never the only signal, and 48 px phone
  targets.

**Effort.** S to M.

### 20. Minor: states the spec does not cover

Add these rows to B&M §4.8:

- **A phone rotated during a mission.** The step and detent are kept. Half becomes the right-hand
  panel.
- **A live fetch that fails halfway, or takes over 10 minutes.** "NASA's archive is slow right now.
  {k} of {n} pictures arrived; they are kept. Try again later." with a **Try again** button.
- **Find with no results in Discover.** "No star, galaxy or nebula by that name. Try a famous one:
  Vega, Betelgeuse, Orion Nebula."
- **A `?mission=` link on a first visit.** Does the intro play? I suggest a 2 s still intro, then
  straight into the mission brief.
- **Very large screens.** The blur budget is a share of the window. At 3840×2160 and DPR 2 that is
  eight times the pixels of 1900×1030 at DPR 1. Add "and no more than 1.5 million device pixels
  blurred".
- **Offline.** "Missions 1–5 play from shipped data if it was cached", but no lane owns caching
  `frames.bin.gz`. The existing service worker (`public/sky-tiles-sw.js`) caches sky tiles only. For
  v2.0, say "Needs a connection" and drop the offline promise.

**Effort.** S for the spec.

### 21. Minor: mockup and copy mismatches to fix before anyone builds from them

- **The "Mission 1 complete" pill is broken** in `04` at both sizes: the label spills out to the
  left. The cause is a class clash: `.skill` in `mockups/discover.css:80` (the skill tile) also
  matches `.pill.skill`. Name components so they cannot clash (`.skill-tile`).
- **"Skill: Colour sweep"** (path) against "Colour" (shelf and spec).
- **"over 8 months"** (dock) against "18 months" (spec). The data says 13.5 months in D6.
- **The WISE 0855 limb tag** runs off the right edge at 1366 ("on the far si…"). Limb tags must
  stay inside the window.
- **On the phone home**, the "R Draconis · The breather · next" tag covers its own beacon and
  touches the sky note.
- **The coach card in `05`** covers Measure's numbers, including "Catalogue (Gaia DR3) 10.39″/yr".
  That is the exact number the success card's "How was this measured?" promised. The rule says
  "never over it" (GDE-8). Anchor the coach under the view switch, to the left of Measure.
- **"Nobody can [see it]"** in the ghost's step 1 is a claim about people. Use the measurement
  instead: "In one picture it is lost in the noise. Sima measured about {snr1}× the noise." SPEC 7.3
  supports "not seen in single exposures".
- **"Type Y2 (SIMBAD)"** for WISE 0855 is typed into the spec. Fill it from the fetched SIMBAD
  field (H9) and check it, because recent papers give later types.

**Effort.** S.

### 22. Minor: lane splits that will rub

- **Mission definitions sit between K (screens) and H (engine).** Every mission change touches
  both. Fix: H owns `missions.ts` (data and pure check functions, tested), and K owns all mission
  UI. Write that line into §13.
- **"Each lane writes its own phone `@media` rules"** means nobody owns the phone screen as a
  whole. Fix: lane M also owns the phone layout grid. It sets `html[data-layout=phone]` and CSS
  variables for the frame, top row and sheet rectangles. Other lanes style only what is inside
  their own boxes.
- **`StarterId` aliases** (`made-of` → `recipe`, `too-faint` → `ghost`) keep two names for one
  thing. They are fine for links, but `copy.ts` and the places menu must show only the new names.

**Effort.** S.

### What is good (keep it)

- **The Well Rule and Slate for the frame (D-3, D-4).** No picture is ever under glass, and the
  frame is not paying for blur under an opaque image. This is the right call.
- **Smoked glass with contrast measured over the worst sky** (WCAG F83 method, a script anyone can
  run). Few glass designs measure contrast at all.
- **No reward hue (D-8).** Catching that gold looks like Path Amber, the colour of simulated data,
  is exactly the kind of honesty bug this team cares about.
- **B-5** (checks read real measurements, never answers typed into the code), **B-7** (the hunt is
  never graded) and **B-8** (Planet X is simulated from start to end). The intent is right; items
  3, 4 and 8 only fix where the data does not support the wording.
- **The runaway's check, the "Matches Gaia" pill and Planet X's verdict are real.** `hits`
  (`explore/track.ts:64`), `fitMotion(...).matches` (`core/fit.ts`) and `verdict().kind === 'one'`
  (`core/sandbox.ts:173`) exist and behave as the spec says. For Planet X, a Neptune at 500 AU
  needs about 28 exposures, so "make it bigger" passes at about 9 Earth radii, inside the 30-radius
  limit.
- **On a real GPU glass is cheap.** It held 60 fps in every case, including 65% at DPR 3.
- **The research is well sourced**, and it says what it could not verify.

## Ranked cut list for the hackathon

**Build now (v2.0), in this order:**

1. Night Glass tokens and the four materials, plus **Solid**: the setting, `@supports`,
   `prefers-reduced-transparency` and `forced-colors`. Lanes F, D, E and G re-skin Expert.
2. The view switch (Discover / Expert) and `sima-view`, with the migration from `b102-level`.
3. The welcome card, and the Discover home (path, globe with beacons, skill shelf). The globe
   hand-off uses a cross-fade (finding 15).
4. **The runaway**, polished (finding 11), with the success card, the Moon comparison and "How was
   this measured? Open Expert view".
5. **Planet X** (the sandbox exists; "Simulated" first).
6. **The ghost**, after the contract fix in finding 2.
7. The governor as one early decision, Glass or Solid only (finding 6).
8. **Phones:** Discover home and the runaway at 390. One Slate sheet with two detents (peek and
   half) and tap to toggle. No drag physics.
9. Expert on a phone as a read-only frame plus "Open this on a computer" (Web Share or copy). No
   Measure sheet.

**Cut to v2.1, cutting the top rows first:**

1. The Chart (light) theme. It doubles visual QA and nobody asked for it on a night sky.
2. The hunt and its practice (finding 3).
3. "Describe the dots" (new science code). Keep the key picker for now.
4. Landscape phone layout, the full sheet detent, and drag gestures.
5. The recipe (finding 4).
6. The Lite glass level.
7. The field guide (keep only "Barnard's Star is in your field guide now" as text, or drop it).
8. The date scrubber (only the breather needs it).
9. Limb tags for far-side beacons. Turn the globe to the next mission on Start instead.
10. Offline mission play.
11. The breather, after its redesign (finding 8). It is the first mission to bring back if time
    allows, because the "Which is brighter?" version is small.
12. The Arabic interface (keep Arabic names and the wordmark).

## Answers to the open questions (B&M §16)

1. **Names.** Use **Explore** and **Expert**. The copy rules ban "discover" as a claim (§7), and a
   view called Discover next to a "real hunt" invites judges to read it as one. "Explore" is
   already the app's word for the gentle level, so links and docs stay consistent. If the team
   prefers Discover, keep it; this is a small risk, not a blocker.
2. **Default theme.** Night for everyone, and no Chart theme in v2.0 (cut item 1).
3. **Arabic interface.** English only for the hackathon. Keep the Arabic wordmark, Arabic star
   names with their source, and Arabic search. Add bidi isolation (finding 19).
4. **The Arabic display font.** Use Ruqaa, a handwritten style, for the wordmark only, where it
   reads as "a mark". For star names at 17 px use a plain text face behind `--arabic-text`. In `07`,
   the Ruqaa name at 17 px reads smaller than the Latin next to it.
5. **The live service.** Plan the demo and every v2.0 mission without it. If it gets hosted, free
   look and live spots are a bonus. Even then, a 160–430 s wait cannot be on stage. Reword Blink's
   reward and use RW Aurigae (finding 7).
6. **Limb glow in the detector hue.** Keep it. It is data colour (the detector shown), it carries
   the intro's ring through, and the sky note names the detector in words. Keep it faint as
   specified.
7. **RW Aurigae.** No seventh mission. Make it the free "Try Blink" playground (finding 7). It is
   shipped, real and needs no service.
8. **Demo flow.** Film Discover for the first 60 s: intro → welcome → the runaway → success →
   "How was this measured?" → Expert showing 10.50 ± 0.26″/yr against Gaia's 10.39. Then about 20 s
   of Expert power: Difference, the ghost's stack with its two controls, and Arabic search. Judges
   score both newcomer impact and validity, and this covers both. Update SPEC 9.6 to match.
9. **Mission order.** Keep the design: a suggested "Up next", with free choice after the runaway.
   In v2.0 the hunt is cut, so there is no gate to argue about.
10. **Practice set size.** The shipped patches do not support six spots, two of each kind, at the
    default threshold (finding 3: one Weak spot in all 30 runs). If the hunt comes back, work the
    set out at build time at threshold 3, with relabelled answers, and pass at 4 of 6.
