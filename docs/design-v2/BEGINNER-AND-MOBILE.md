# Discover (the beginner view) and phones: spec

Status: proposal, 15 November 2026. Builds on `docs/SPEC.md` (behaviour), `DESIGN-v2.md` (look) and
the intro now merged into `rebuild`. Requirement IDs here (VIEW-, DSC-, MSN-, MOB-, GLS-, A11Y-)
extend SPEC section 5. Mockups: `mockups/png/` (each screen at 1900×1030, 1366×768 and 390×844).

## 0. In short

- Sima gets two views. **Discover** is for the public: very little technical language, missions
  with known answers, and skills that unlock real tools. **Expert** is today's app at the Measure
  level, with every number, picture tool, frame and workspace.
- A first-time visitor sees the intro, which now ends on the sky as a globe, and a welcome card
  that offers the first mission. Discover is the default; Expert is one press away, always.
- Six missions, each on real data with an answer the app can check from its own measurements or
  from a named catalogue: **the runaway** (Barnard's Star), **the breather** (R Draconis), **the
  ghost** (WISE 0855−0714), **the recipe** (Epsilon Indi B), **Planet X** (a labelled simulation)
  and **the real hunt** (change-search candidates, ungraded, "candidates to check").
- Rewards are skills: each mission unlocks the tool it taught, inside Discover. No points, no
  streaks, no leaderboard.
- Phones are designed now: Discover works fully on a phone; Expert on a phone shows the frame,
  every date and every number, and hands the heavy tools to a computer.
- It is built by nine lanes and the integrator, with separate files (section 13). Two lanes (K, M) are new. Contracts change in three small,
  additive ways (section 12).

## 1. Decisions and their reasons

| # | Decision | Why | Rejected, and why |
|---|---|---|---|
| B-1 | **Two views, named Discover and Expert.** Discover replaces today's Explore level. Expert is today's app with the Measure level on. | The brief separates them. Explore was already a gentler Measure; keeping three levels would leave a middle nobody owns. | *"Beginner" as the label:* it asks people to rank themselves. *Keep Explore too:* three states to test and explain. |
| B-2 | **Discover is the default for a first visit.** Links that carry expert settings (`view`, `pic`, `det`, `date`, `#w=`) open in Expert. | SPEC 1: newcomers first. A link someone made in Expert should open the way they made it. | *Ask on first visit "Are you a beginner?":* a quiz before seeing anything; the welcome card offers "I know astronomy" instead. |
| B-3 | **The first mission is fixed (the runaway); after it, any order.** The real hunt opens after any two more. | The runaway teaches Blink, which every other mission uses. After that, autonomy matters more than a path (Duolingo's backlash; SDT). The hunt needs practice first (Galaxy Zoo). | *A strict line:* felt rigid in Duolingo's path. *Everything open:* the hunt without practice produces noise and disappointment. |
| B-4 | **Rewards are skills that unlock real tools in Discover.** Nothing in Expert is ever locked. A setting can unlock all skills. | Research: rewards for doing a task lower interest; feeling able raises it (RESEARCH 1.6). A judge or teacher must be able to skip. | *Points, badges, streaks:* empty, and streaks punish people who come once. |
| B-5 | **Every mission success is checked against the app's own measurement or a named catalogue, never a hard-coded answer.** If the measurement is missing, the step says "not measured" and why, and changes to a step that can be checked. | H4, H5. A mission that "passes" on a number the app did not measure would teach the wrong lesson. | *Scripted answers (tap within a fixed circle):* breaks the day the data or the pipeline changes. |
| B-6 | **"Show me" rings the place; the user still taps** (O-G2 carried). | Finding it yourself is the competence the skill rewards. | *Auto-complete on Show me:* a hollow win. |
| B-7 | **The real hunt is never graded and never says "found".** People mark candidates "worth a closer look" or "probably not"; that is a note, kept in their browser. | H7: no sentence claims a discovery; nobody knows the answer. | *Score the hunt against the change search's own ranking:* that would grade people on the pipeline's guess. |
| B-8 | **Planet X is a labelled simulation from start to end** ("Simulated" first, dashed amber, model numbers). It never enters the field guide as an object. | H3, H4. It answers "could SPHEREx see it?" honestly. | *A "find Planet X" game on pretend data:* teaches that Planet X was found. |
| B-9 | **On a phone, Discover is complete; Expert is a reading view** (frame, dates, wavelength, Measure's numbers and charts) with "Send this to my computer". | Picture tools, several frames and workspaces need a pointer and space; Measure's numbers do not. | *Expert hidden on phones:* a shared Expert link would dead-end. *Full Expert on phones:* 480 px frames and 760 px panels do not fit 390 px. |
| B-10 | **One nonmodal bottom sheet on phones** for every card. | Apple and Material: one sheet, nonmodal so the sky stays usable; thumbs reach the bottom third. | *Floating cards as on desktop:* they cover the picture. *Full-screen pages:* lose the sky. |
| B-11 | **The view is remembered; progress is never in a link.** | A shared link should show the same sky, not hand over someone's progress. | *Progress in links:* privacy and confusion. |
| B-12 | **No sound, no timer, no "wrong!"** A miss gets a calm note ("Not that one. That star stays put.") and the next hint becomes available. | Calm, exact, honest (DESIGN mood); no pressure for people who are learning. | *Lives or a timer:* game tension that punishes looking carefully. |

## 2. Information architecture

```
Intro (first visit) ──► Discover ◄──────── view switch ────────► Expert
                        │                                         │
                        ├─ Home: the globe, mission path,         ├─ Today's app at the Measure level:
                        │        dock (next mission, skills)      │  frame, bar, Measure, picture tools,
                        ├─ Mission (×6): brief → steps → success  │  several frames, workspaces, places,
                        ├─ Free look (Blink skill): tap the sky,  │  tours, guide, share, about
                        │        "Look here", real pictures       │
                        ├─ Field guide: objects you have met      ├─ Phone: frame, dates, wavelength,
                        ├─ Find (search), place card              │  Measure as a sheet, "Send to computer"
                        └─ Settings: panels, theme, motion,       │
                                     unlock all, reset progress   │
Shared by both: the sky, places, search, About, Share, the intro, the data, the honesty rules.
```

What each view shows:

| Part | Discover | Expert |
|---|---|---|
| Sky / globe | Yes; beacons for missions; place dots by importance | Yes; place dots, chips, rail |
| Top row | Wordmark, Find, Field guide, Settings, About, view switch | Wordmark, search, chips, Guide, Places, Share, About, view switch |
| Frame | Slate; big Play, date chips, 3 views after skills (Flip, Two dates, Stack) | Slate; full bar, 6 views, badge with time and detector |
| Wavelength | Hidden until the Colour skill; then a simple slider with a plain name | The wavelength scale (carried) |
| Measure | Never as a panel; results as plain sentences; "See the numbers" opens Expert | Measure panel, all numbers |
| Picture tools | No (the default look; "Original" is offered if a link brings `pic=`, as today) | Yes |
| Several frames, workspaces | No | Yes |
| Guide tour | Replaced by missions | "Tour the numbers" and "Explain the screen" stay |

## 3. Flows

### 3.1 First visit (intro → Discover)

1. The intro plays (DESIGN Intro, carried) up to the turn: Barnard's Star faces us.
2. **Change (DESIGN-v2 §11):** the globe does not dive. It glides 1.3 s to its first-run place
   (right of centre on desktop, top on phones). The welcome card, top row and sky note fade in
   (0.45 s). The Barnard's Star beacon pulses once.
3. Welcome card (`01-first-run`): "This is the real infrared sky." Three choices:
   - **Start your first mission** (primary): the dive into Barnard's Star, then mission 1.
   - **Look around first**: closes the card; the globe is live; the mission path appears.
   - **I know astronomy**: switches to Expert, lands on Barnard's Star at the Measure level.
4. Reduced motion: the intro's still version, then the globe appears in place (0.6 s fade).
5. Skip at any moment (carried): lands on the same first-run state.

### 3.2 Returning visit

- Opens in the remembered view (`sima-view`). Discover opens on the globe with the path and dock;
  "Up next" is the first mission not done.
- A visit with v1 storage (`b102-level` = `measure`) opens in Expert (migration).
- An unfinished mission shows "Continue: The breather, step 2 of 3" in the dock.

### 3.3 Mission

Start (path, dock, beacon, or `?mission=`) → the dive (≈1.3 s; reduced motion: cross-fade) → the
mission card and frame rise → steps, each checked live → success card → choose: next mission, try
the new skill, or "How was this measured? Open Expert view" (Expert on the same star, date and
wavelength, Measure open on the relevant tab).

Leaving a mission (✕, Escape, or the view switch) keeps its step; nothing is lost.

### 3.4 Switching views

- Discover → Expert: the frame glides to its Expert place, Discover's cards fade out, the bar and
  Measure fade in. The same target, date, detector and field size. First time only, a coach card
  under the switch (`05-switch-expert`): what Expert has, that missions and skills are kept, where
  to switch back, and "Tour the numbers (3 steps)".
- Expert → Discover: Measure and tools close; the frame keeps the target if it is a mission or
  field-guide object, otherwise Discover returns to the globe. Any extra frames and the workspace
  are kept (autosaved as today) and come back on return to Expert.
- On a phone, Expert's first time shows the "Expert view on a phone" sheet instead.

### 3.5 Free look (after the Blink skill)

Tap the sky → the v1 "Move the frame here" card, worded "Look here" in Discover → the frame opens
on that spot. Shipped targets play at once; other spots use the live service (§5.6).

## 4. Screens and states (Discover)

Each screen lists its parts, its copy, and the states it must handle. Copy is final English
unless marked; plain words, short sentences.

### 4.1 Welcome (first run): `01-first-run`

| Part | Content |
|---|---|
| Wordmark | سيما (Arabic display font) · Sima |
| Heading | This is the real infrared sky. |
| Body | NASA's SPHEREx telescope photographs the whole sky again and again. Put its pictures side by side and you can catch stars that move, breathe and hide. |
| Primary | Start your first mission · The runaway · about 2 minutes |
| Secondary | Look around first · I know astronomy |
| Fine print | Every picture here is real and says where it came from. Your progress stays in this browser. |
| Sky | The globe, Barnard's Star beacon "Your first mission", 4 bright-star labels, "Drag to turn the sky" (desktop) |

### 4.2 Home: `02-discover-home`

| Part | Content |
|---|---|
| Mission path | "Missions · 1 of 6 done", "Learn to spot change in the real sky. Each mission teaches one skill.", six rows (name, one line, skill, minutes, state), footer "Want every number now? Expert view" |
| Dock | Up next (thumbnail of the real picture, name, one line, **Start**) · Your skills (six tiles, lit or dim) |
| Globe | Beacons for missions on the near side; limb tags for the far side; place labels |
| Phone | Sheet at half: skills row, Up next card with **Start mission**, then all missions (scroll inside the sheet) |

Mission row states: **Done** (white node, check), **Next** (filled play button, row highlighted),
**Open** (play button), **Locked** (lock, "Opens after 2 more missions"), **In progress** ("Step 2
of 3", a thin progress bar under the name).

### 4.3 Mission in progress: `03-mission-progress`

| Part | Content |
|---|---|
| Mission card (Raised) | "Mission 1 of 6 · Skill: Blink", title, one line about the object (with its source on hover/focus), the step list (done, now, next), the current step's sentence, the hint box when asked, **Hint / Another hint / Look closer / Show me** (one at a time, GDE-5 carried), a progress bar, key hints |
| Frame (Slate) | Name, "Real data · NASA SPHEREx", the picture in its well with the date badge (letter, month, "picture 2 of 3"), the pass-tint edge, previous / Play / next, date chips, the data line (H2) |
| Sky | The patch square and tether (carried) |
| Phone | Frame at the top (full width), date chips under the controls; sheet at peek/half with "step 2 of 3", the step sentence, Hint and Show me (48 px) |

Step states: **waiting** (the step sentence), **hint shown** (the hint box), **missed** (a calm
note for 3 s: "Not that one. That star stays put."), **shown** (Show me rings the place on the
picture with a dashed `mark` ring; the sentence becomes "It's inside the ring. Tap it."),
**checking** (a measurement is still being made: "Measuring…" with the moving bar; never a
pass before the number exists), **done** (the step ticks, the next step slides in 0.26 s).

### 4.4 Mission success: `04-mission-success`

| Part | Content |
|---|---|
| Pill | Mission 1 complete |
| Heading | The plain win: "You caught a runaway star." |
| Result | One plain number ("About 1.7 pixels a year"), one sentence with the real number and how it was measured, a status pill comparing with the catalogue ("Matches Gaia's star catalogue: 10.4″ a year"), the sources line |
| Skill | New skill tile (white light), its name and what it lets you do now |
| Field guide | "Barnard's Star is in your field guide now." |
| Actions | **Next: The breather** (primary) · Try Blink · "How was this measured? Open Expert view" |
| Frame | Switches to the view that shows the answer best (Two dates for a mover), with the found ring and a magenta tag "Found · moved north" |

If the comparison does not match, the pill says so in words ("Differs from the catalogue: 9.1 vs
10.4″ a year") in `warn`, and the result still stands as measured. If the measurement could not be
made, the result block says "Not measured: <reason>" and the mission still completes on the
check that was made (the tap on the moving star), because finding it was the skill.

### 4.5 Field guide (Slate panel; sheet on phones)

A list of objects met in missions and in free look, each with the real picture you saw (its date and
detector), the plain kind, the Arabic name when the catalogue has one (H9, in the Arabic display
font), and the place card's facts with sources. Empty state: "Objects you meet in missions appear
here." Planet X never appears (B-8).

### 4.6 Settings (Raised popover; sheet on phones)

Panels: Glass / Solid · Theme: Night / Chart · Motion: follows your system (read-only line, with
how to change it) · Unlock all skills · Reset my progress (asks to confirm; clears `sima-missions`
only) · "Your progress is kept in this browser only."

### 4.7 Place card in Discover: `07-place-card`

v1's card in Raised glass, with Discover's wording: "Look at its pictures" (needs Blink; before
that it reads "Learn to look first: The runaway") and "Zoom to it". The facts table shows only the
first row in Discover ("Brightness", in plain words); "More facts" opens the rest. Sources are always
shown (H9). On phones the card is the sheet at half.

### 4.8 States every Discover screen handles

| State | What the visitor sees |
|---|---|
| **Loading (shipped data)** | Under 0.25 s nothing; then the frame's busy cover with "Getting the pictures…" and the sky map's own preview tagged "Preview from the sky map (all dates averaged)" (carried) |
| **Live fetch** (free look on a new spot) | "Fetching real pictures from NASA. This can take a few minutes. Try a mission meanwhile: we'll tell you when they arrive." A bar fills when the count is known ("9 of 12"). When they arrive: a toast "Your pictures of 18h 02m +04° 44′ are ready · Look" |
| **Live service off** | "Live pictures are off right now. The six missions still work: their pictures come with Sima." Plus the labelled practice simulation (FRM-11, "Simulated" first) |
| **Offline** | The globe from the shipped sky (SKY-8). Missions 1–5 play from shipped data if it was cached; otherwise the mission row says "Needs a connection" and the dock offers the first playable one. The hunt's live part says "Needs a connection." |
| **Error (a picture failed)** | It stays visible as missing (H6): the date chip shows a dotted outline and "Missing"; the mission continues on the others, or says "This mission needs that date. Try again" with a **Try again** button |
| **Empty** | Field guide: as 4.5. Hunt with no candidates: §5.6. Skills shelf with none: six dim tiles and "Finish a mission to light one." |
| **Success** | §4.4 |
| **Failure of a check** | Never "wrong": the miss note, then the next hint. After "Show me" the step always completes on a tap inside the ring |
| **Reduced motion** | No dive (cross-fade), no glide (fade), no rim sweep; flipping becomes the still Two dates picture with a "Step through" button (carried FRM-8) |
| **Glass off / high contrast / forced colours** | DESIGN-v2 §5 |

## 5. The six missions

Common rules: every mission opens with the frame on its target, a fixed detector and view chosen
for the lesson (and said in words), and a brief: what you will learn, the object in plain words with
its source, about how long. Every check reads a value the app already computes; the function it
calls is named. Every result sentence is a template filled from that value; when the value is
missing it prints "not measured" and why.

### 5.1 The runaway: Barnard's Star · skill **Blink**

| | |
|---|---|
| Data | 72 real exposures, DR1 and QR3, Aug 2025 to Sep 2026, three survey passes (A, B, C) |
| Known answer | The star's track from Gaia DR3 4472832130942575872 (motion −801.6, +10362.4 mas/yr; 10.39″/yr) moved to each picture's date (`core/catalog.ts`); the measured fit from Measure (`fitMotion`, today 10.50 ± 0.26″/yr from 71 of 72) |
| Opens on | Flip, D3 (1.67–1.79 µm), 6′ field, playing |
| Step 1 | **Play the pictures.** "They were taken months apart." Check: three date changes seen (played or stepped) |
| Step 2 | **One dot jumps. Tap it.** "Stars stay put. Look for the one that doesn't." Check: the existing tap test (`explore/track.ts` `hits`) against the catalogue track at the shown date, radius as today |
| Step 3 | **See how far it went.** The frame switches to Two dates; the found ring and "moved north" tag appear. Check: none (reading) |
| Hints | "Look near the middle." · "Step from A to C with the arrow keys and watch closely." · Look closer: the close-up (GDE-4) · Show me: rings it |
| Result | "About {pxPerYear} pixels a year." · "{name} crossed {arcsecPerYear}″ of sky in a year. Sima measured that from {used} of {total} real pictures." · pill: match/differs with Gaia's value · "Measured from SPHEREx pixels · Catalogue: ESA Gaia DR3" |
| Facts shown | "A small red star, 6 light-years away" (kind: SIMBAD M4V; distance from Gaia DR3 parallax 547.0 mas = 5.96 ly) |
| Skill | **Blink**: date chips and Play anywhere; "Look here" on the sky (free look) |

### 5.2 The breather: R Draconis · skill **Brightness**

| | |
|---|---|
| Data | 144 real exposures, 18 months of roughly monthly pictures |
| Known answer | The measured light curve from Measure's Brightness tab (per detector, visit averages with errors, the "did it change?" test). Today: up to 1.04 mag in D6 between 10 visits, "changed beyond noise". Pulsation period 246.12 days from AAVSO VSX (B/vsx/vsx) |
| Opens on | Flip, D6 (4.41–5.00 µm), where Sima measured the change; said as "We're looking at deep infrared, 4.4 to 5.0 µm." Many dates: the date chips become a **date scrubber** (month ticks, one stop per visit) |
| Step 1 | **Watch it for 18 months.** Check: one full loop played |
| Step 2 | **Stop it at its brightest.** Check: the paused visit's measured brightness (same detector) is within max(0.15 mag, 2σ) of the brightest visit |
| Step 3 | **Now find its faintest.** Same check against the faintest visit |
| Fallback | If the light curve is not measured in D6 (fit failed, too few visits): the mission switches to the detector with the largest measured change and says so; if none is measured: "Not measured: {reason}. Compare A and the last date by eye instead", and step 2 becomes "Which looks brighter?" checked against the two visits' measured values when those exist |
| Result | "At its brightest it gave out about {ratio} times the light of its faintest, in this colour band." (ratio = 10^(0.4 Δm), today 2.6) · "It breathes like this every 246 days (AAVSO VSX)." · pill: "Changed more than noise allows" or "Within the noise" in words |
| Skill | **Brightness**: tap a star in any frame to get one sentence: "This star changed by about {ratio}× between {first} and {last} (measured, {det})" or "No change we can measure" (uses the same forced photometry as Measure) |

### 5.3 The ghost: WISE 0855−0714 · skill **Stack**

| | |
|---|---|
| Data | 70 real exposures (DR1) |
| Known answer | Catalogue motion −8118, +680 mas/yr and parallax 449 mas (Luhman & Esplin 2016); the stack's measured signal (today 15.6σ in D5, 7.2σ in D6, nothing at 0.7–2.4 µm) |
| Opens on | Flip, D5 (3.83–4.41 µm), 6′, a dashed amber circle where the catalogue says it is (labelled "Where the catalogue says it is") |
| Step 1 | **Can you see it?** "Play the pictures and look inside the circle." Then two buttons: "I can see it" / "I can't". Either answer passes; the reply teaches: "Nobody can: it is too faint in any one picture." |
| Step 2 | **Add the pictures up.** Press Stack (Discover shows the Stack view in this mission). Check: `S.mode === 'stack'` (the existing faint-task check) |
| Step 3 | **Follow its path.** "It moves, so the pictures must be shifted along its path. Drag the arrow until a dot appears." The motion handle (`viewer/motion.ts`) starts at zero motion. Check: the trial stack's measured signal at the target ≥ 5σ **and** at least twice the larger of its two controls (not shifted, opposite motion). "Snap to the catalogue" is the last hint |
| Result | "Added along its path, {n} pictures show a clear dot: {snr} times the noise at {lam} µm." · "At 0.7 to 2.4 µm there is nothing to see." (from the per-detector stack) · "It is a brown dwarf of type Y2 (SIMBAD), the coldest kind (Wikipedia: Brown dwarf)." |
| Skill | **Stack**: the Stack view and its arrow in any frame, with the two controls always shown (SPEC 7.1.9) |

### 5.4 The recipe: Epsilon Indi B · skill **Colour**

| | |
|---|---|
| Data | 87 real exposures, four passes |
| Known answer | The measured spectrum (Measure's Spectrum tab, 102 channels, built as pictures play): today "Brightest at 4.11 µm", 28 of 102 colours measured early on. The shaded water and methane bands are where those molecules absorb (not a model of this star), as the chart already says |
| Opens on | Flip, the ringed pair in the middle; the bright glow at the edge is named "Epsilon Indi A, the star it orbits (SIMBAD)" |
| Step 1 | **Play the pictures once.** "Sima measures its colours as the pictures play." Check: the spectrum has at least one measured channel in each of D3–D6 |
| Step 2 | **Slide the colour. Stop where it shines brightest.** A simple colour slider appears (plain names: "near infrared … deep infrared"). Check: the chosen channel's measured flux ≥ 85% of the brightest measured channel |
| Step 3 | **Now find a colour where it almost vanishes.** Check: the chosen channel lies in a shaded water or methane band and its measured flux is below 50% of the brightest, by at least 3σ. If that channel is not measured yet: "Not measured at this colour yet. Play the pictures to measure more." |
| Result | "Water and methane soak up its light at some colours. That pattern is how astronomers tell a cold brown dwarf from a star." · "SIMBAD lists it as a pair of brown dwarfs, types T1 and T6." |
| Skill | **Colour**: the colour slider in every frame and on the sky map |

### 5.5 Planet X: a pretend planet · skill **What-if** · **Simulated**

| | |
|---|---|
| Data | The sandbox model (`core/sandbox.ts`) against the measured pixel noise of the open patch (Barnard's Star by default). Everything is a model (H4) |
| Labels | The card title starts "Simulated:"; the pretend planet is dashed amber with a "Pretend" tag (carried, O-V7); every number is tagged "Model" |
| Step 1 | **Simulated: would SPHEREx see a planet like Neptune 500 times farther than Earth?** Press Check. The model's verdict shows (today: "would not show it here … about 28 exposures") |
| Step 2 | **Bring it closer until one picture would show it.** Distance slider. Check: the verdict becomes "seen in one exposure" (`verdict().kind === 'one'`) |
| Step 3 | **Or make it bigger.** Back at 500 AU, size slider. Check: verdict "one" with distance ≥ 500 |
| Result | "Simulated result, by a simple model: a Neptune-sized planet would show in one SPHEREx picture closer than about {d} AU; at 500 AU it would need to be about {r} times Earth's size." · "Nothing here was observed." |
| Skill | **What-if**: the sandbox from search or the dock, in Discover |

### 5.6 The real hunt: candidates to check · skill **Check**

Two parts. Opens after the runaway and two more missions.

**Practice (graded, on known answers).** Six spots from the change search (`core/detect.ts`) on the
shipped patches, picked at runtime: two the search marks **Known** (matched to Gaia or CatWISE),
two **Likely artefact** (seen on one exposure only), two **Weak** (as expected from noise). For
each, the visitor sees new/reference/difference cutouts (real pixels) and chooses: "A real star
moving" · "A glitch in one picture" · "Just noise". Feedback names the check: "Right: it is on 1 of
4 exposures only. A cosmic ray or a hot pixel does that." Pass: 4 of 6; otherwise six new ones.
If the shipped patches do not yield two of each kind, the practice uses as many as exist (at least
three) and says how many.

**The hunt (never graded).** The change search's **Possible** and **Strong** candidates on the
patch in the frame (any shipped target, or any live spot). For each: the cutouts, where it is,
which dates, and the search's own words. The visitor marks "Worth a closer look" or "Probably
not". Copy at the top, always: "Candidates to check. Nobody knows yet if any of these are real.
Your marks are notes for you, not results." Actions: "Open in Expert" (Measure on that candidate),
"Download my notes (CSV)" (the candidate's fields plus the visitor's mark, titled "Candidates to
check, not discoveries"). Empty: "No candidates here. That is the usual answer: most of the sky
stays the same. Try another spot." This part needs the live service to be useful beyond the five
shipped patches (O-D2).

Result after practice: "You can now check candidates." Skill **Check**: the candidate list
("Things that changed here") in any frame.

## 6. Discover components

All use DESIGN-v2 materials and tokens.

| Component | Material | Spec |
|---|---|---|
| View switch | Regular | DESIGN-v2 §9 |
| Mission path | Regular | 372 px; rows 44 px node + text, 16 px titles, 14 px lines, 12 px meta; a dashed connector at white 18%; the Next row on `fill-1` with an inner 1 px white-8% line |
| Dock | Regular | 24 px corners; Up next (76 px thumbnail well, eyebrow, 17 px name, 14 px line, `.lg` Start) · a hairline · the skill shelf |
| Skill tile | inside glass | 44 px rounded square; dim: white-12% ring, `on-glass-3` icon; lit: white-85% ring, white icon, a soft cool glow (`0 0 18px rgb(190 210 255 / .35)`) |
| Beacon | on the sky | DESIGN-v2 §9; done = white ring |
| Limb tag | Thin | "{object} · {mission} · on the far side →" |
| Mission card | Raised | 380 px; eyebrow, 25 px title, object line; steps (26 px number disc; done = white disc with a check; now = white disc, 17 px step, `fill-1` row); hint box (white 5%, bulb icon); hint buttons; 4 px progress bar; key hints |
| Discover frame | Slate | picture `min(560px, 100vh − 330px)`; date badge 14 px with letter tile; Play 56 px; step buttons 44 px; date chips 48 px (letter in pass tint, month, pass); the current chip ringed 2 px `mark`; the data line 12 px |
| Date scrubber | Slate | for targets with more than 4 date groups: a 48 px track, month ticks, one 8 px dot per visit, the playhead in `mark` |
| Colour slider | inside the frame | the six detector hues as a 6 px strip (data colours, allowed), a 24 px `mark` handle, a plain name above ("deep infrared, 4.1 µm") |
| Success card | Raised | 420 px; "Mission N complete" pill; 25 px heading; result block (white 5%, 25 px number); unlock tile (white light); field-guide row; actions |
| Coach card | Raised | 340 px, anchored to the control it explains, never over it (GDE-8) |
| Bottom sheet | Raised | §10 |

## 7. Copy

Voice: plain, warm, exact. Short sentences. Name the real thing; never "amazing", never "discover"
as a claim. Numbers in Discover are rounded for reading ("about 1.7 pixels a year") and always have
the exact value one step away (the result's second line, or Expert).

**Words we use and avoid in Discover.**

| Say | Not | Because |
|---|---|---|
| picture | exposure, frame (in Discover) | "Exposure" is Expert's word |
| colour, colour band | wavelength, detector, channel | The slider shows µm in small type for the curious |
| moved … in a year | proper motion | |
| changed by about 2.6 times | 1.04 mag | Magnitudes run backwards |
| times the noise | sigma, SNR | |
| candidate to check | discovery, new object, found (in the hunt) | H7 |
| simulated, pretend, model | prediction, would be found | H3, H4 |
| catalogue (Gaia's star catalogue) | ground truth | |

**Key strings.** Final for English; the rest of each screen's copy is in section 4 and 5.

| Where | String |
|---|---|
| View switch | Discover · Expert |
| Miss note | Not that one. That star stays put. |
| Show me | It's inside the ring. Tap it. |
| Measuring | Measuring… |
| Not measured | Not measured: {reason}. |
| Leave mission | Leave the mission? Your step is kept. · Leave · Stay |
| Expert coach | You're in Expert view · Every number, picture tool, frame and workspace. You are looking at the same star, date and wavelength as before. · Your missions, skills and field guide are kept. · Switch back to Discover here, any time. |
| Expert on a phone | Expert view on a phone · Here you get the frame, every date and every number. Picture tools, several frames and workspaces need a computer. · Send this to my computer |

**Arabic.** Arabic appears where the app already uses it: the wordmark سيما; Arabic star names on
place cards, field-guide entries and labels (from the places catalogue, with its source, in the
Arabic display font); search by Arabic name (PLC-4). Translating Discover's interface is an open
question (§16); if the team says yes, the view names would be **اكتشف** (Discover) and **خبير**
(Expert), interface Arabic would use `--arabic-text` and the layout would mirror (`dir="rtl"`),
except the sky, the pictures, the scales and the charts, which keep sky orientation.

## 8. What is remembered, and links

| Key | Holds | Owner |
|---|---|---|
| `sima-view` (new) | `discover` or `expert`. Missing: Discover, unless `b102-level` is `measure` (then Expert, once) | F |
| `sima-missions` (new) | `{ v: 1, missions: { id: { state, step, hints, doneAt, result } }, skills: [...], guide: [targetKey], unlockAll, practice: {...}, hunt: { candidateKey: 'look' or 'no' } }`. Merge, never overwrite | H |
| `sima-panels` (new) | `glass` or `solid` (only when the user chose) | F |
| `sima-theme` (new) | `night` or `chart` | F |
| `b102-level`, `frame-box`, `sky-places`, `sima-guide`, `sima.tools`, `sima-workspace(s)`, `sima-intro` | Carried | Carried |

`result` stores only what the success card showed (numbers and their source line), so the field
guide can show it later without re-measuring; it is marked with the date it was measured.

**Links.** New parameters: `ui=discover|expert` and `mission=<id>` (`runaway`, `breather`, `ghost`,
`recipe`, `planet-x`, `hunt`). Share adds `ui` for the sender's view. A link with `mission=` opens
that mission at its brief (Discover), never anyone's progress. A link without `ui` opens Expert if
it carries `view`, `pic`, `det`, `date` or `#w=`, otherwise the visitor's own view. Unknown values
are named in a note (carried rule).

## 9. Accessibility

- **Keyboard**: everything in Discover works with keys (DESIGN-v2 §12). The picture answers by
  the existing key picker (Tab into the picture, arrows move a ring between bright sources, Enter
  answers; `explore/keypick.ts`). Focus moves to the step card when a step changes, never to Skip
  (O-G8 carried). Escape closes the top card; on the mission card it asks before leaving.
- **Screen readers**: the mission card is a region with a live area: each new step, miss and
  result is announced once ("Step 2 of 3: One dot jumps. Tap it."). The picture has a text
  alternative that changes with the date ("Picture B, March 2026, of 3"). The key picker announces
  each source by position and brightness ("Source 3 of 9, upper left, bright"). For the runaway, a
  "Describe the dots" button lists sources with their measured shift between the first and last
  date in plain words; choosing one answers the step. This is analysing the data, which is the
  skill; it is not a giveaway because every source gets its shift. The sheet's grabber is a
  button with "Expand" and "Collapse" actions.
- **Motion and flashing**: flips stay ≤ 2.5 a second (carried); reduced motion gives the still
  Two dates picture and a "Step through" button; no dive, glide or sweep.
- **Targets**: 48 px on phones, 36 px minimum on desktop, 8 px apart.
- **Colour**: never the only signal: steps have numbers and checks; skills have names; "Simulated"
  is a word and a dashed line; date chips have letters and months.
- **Contrast**: DESIGN-v2 §4.4; focus rings have a white halo on Night.
- **Zoom**: Discover works at 200% browser zoom at 1366 (it reflows to the phone layout under
  700 CSS px).

## 10. Phones

Screens: `01`–`07` at 390×844.

- **Layout** (DESIGN-v2 §8.3): a 44 px top row; the sky note under it; the globe or the frame at
  the top; one bottom sheet.
- **Sheet**: Raised; grabber; detents **peek** (132 px), **half** (50%), **full** (92%; Slate at
  this detent, since nothing behind shows). Dragging the grabber or the sheet's header moves it; a
  tap on the grabber cycles; content scrolls inside only at full. Nonmodal: the frame, the picture
  and the sky stay live above it. One sheet at a time; opening another replaces the content with a
  0.18 s fade.
- **Which detent when**: home → half; mission → peek (half when a hint is open); success → half,
  showing the result and the primary action without scrolling; place card → half; Field guide,
  Settings → full.
- **Frame**: full width (`100vw − 24px`), picture `100vw − 40px`, header 40 px (name, "Real data ·
  {release} · {det} {λ}", the date is on the picture), controls 56 px, date chips row 48 px. The
  data line (H2) is in the header on phones.
- **Gestures**: DESIGN-v2 §12. Pinch over the picture changes the field size (FRM-6); pinch over
  the sky zooms the sky.
- **Expert on a phone** (`05`, `06` at 390): the top row with the switch; the frame (Slate) with
  the full badge; a compact bar (previous, Play, next, a mini date scale with the playhead, the
  counter); the wavelength as a slider row under it; Measure as the sheet (headline, tabs, chart,
  "Show all the numbers" scrolls inside at full). Picture tools, several frames, workspaces and the
  tray are not shown; a row in Measure says "Picture tools and workspaces open on a computer";
  **Send this to my computer** opens the system share sheet with the link (the Web Share API), or
  copies it.
- **The intro** plays on phones (carried) and lands on the Discover globe.
- **Landscape phones** (under 500 px tall): the frame on the left half, the sheet as a right-side
  panel (Raised, full height, 360 px). No new content.

## 11. Honesty review (H1–H10)

| Rule | Where Discover could break it | What the design does |
|---|---|---|
| H1 map is an average | The globe looks like "the sky now" | The sky note stays on screen in Discover, also on phones ("Average of all dates: moving things blur here · SPHEREx {λ}"); the dive into a mission switches to dated pictures with their badge |
| H2 every picture says source, release, date, wavelength | Discover hides technical lines | The data line stays under every picture (in the header on phones); the date badge stays on the picture; field-guide thumbnails carry date and detector |
| H3 simulated says so, dashed, never mixed | Planet X as a game | "Simulated:" first in title and result; dashed amber; never in the field guide, finds or CSV; its success says "Nothing here was observed" |
| H4 measured, catalogue or model, labelled | Plain sentences hide where numbers came from | Each result has a sources line ("Measured from SPHEREx pixels · Catalogue: ESA Gaia DR3"); model numbers are tagged "Model" |
| H5 not measured, never a model fallback | A mission needs a number | Every check names its measurement; a missing one prints "Not measured: {reason}" and the mission changes step (§5) |
| H6 flagged, missing, failed stay visible | Clean-looking chips | Missing dates show a dotted "Missing" chip; failed downloads say so |
| H7 no discovery claims | "Mission complete", "You caught…", the hunt | Known objects are "caught", "found" only for targets with a catalogue entry; the hunt never says found and carries its "Candidates to check" line on every screen and in the CSV title |
| H8 processing says so; original one press away | Stack in Discover | The stack picture says "Stack of {n} pictures, shifted along a trial path"; "Original" is on the picture whenever anything is processed |
| H9 facts from a named source | Friendly object lines ("a small red star, 6 light-years away") | Each is built from catalogue fields (SIMBAD type, Gaia parallax) with the source on hover/focus and in the field guide; missing facts are left out. The mockups were checked: an unsourced phrase ("the shoulder of Orion") was removed |
| H10 AI disclosure | n/a | About is shared by both views and keeps the disclosure |

## 12. Fit with the architecture

**No new bus messages.** Discover is a different shell around the same two halves.

Contract changes (all additive; each needs the integrator's agreement, AGENTS.md rule 7):

1. **`shell/view.ts` (new, F)**: `getView(): 'discover' | 'expert'`, `setView(v)`,
   `onView(fn)`; it sets `html[data-view]`, writes `sima-view`, and calls `setLevel('explore')` for
   Discover or `setLevel('measure')` for Expert. Added to SPEC 8.4.
2. **`viewer/state.ts` (D)**: an optional `S.measureOpen: boolean` (written by E), so in Expert the
   Measure button opens and closes the panel without leaving the Measure level. Explore stays a
   valid `Level` (Discover runs the frame half at `explore`).
3. **`explore/game.ts` (H)**: `StarterId` gains `breather`, `ghost`, `recipe`, `hunt` (`planet-x`
   exists; `made-of` and `too-faint` stay as aliases of `recipe` and `ghost`). `openStarter` stays
   the one way in, through the existing `start` message.

New exports (no contract change for others): `sky/markers.ts` `setBeacons(beacons)` (C);
`sky/sky.ts` `camera().projection: 'STG' | 'SIN'` (C); `shell/glass.ts` `glassLevel()`,
`onGlass(fn)` (F); `shell/sheet.ts` `openSheet(el, { detent, label })`, `closeSheet()` (M).

Mount points to add to `index.html` (F): `discover-path`, `discover-dock`, `mission`,
`mission-success`, `field-guide`, `settings`, `coach`, `sheet`, and `view-switch` in `actions`'s
row. `narrow-note` is removed.

`data-guide` names (new): `view-switch`, `view-discover`, `view-expert`, `mission-<id>`,
`mission-start`, `mission-step`, `mission-hint`, `mission-show-me`, `mission-leave`,
`success-next`, `success-expert`, `skill-<id>`, `field-guide-button`, `settings-button`,
`panels-solid`, `sheet-grabber`, `send-to-computer`.

Every new card has a place in the Escape order: coach and tips 50; mission card, success, place
card, Field guide, Settings 30; sheet (phones) closes its content at 30; Measure 10 (carried).

## 13. Build plan: lanes and files

Nine lanes and the integrator; no file has two owners. Ports: Discover K 5181, Mobile M 5182, the
rest as in `docs/lanes.md` (H keeps 5178).

| Lane | Builds | Owns (new files marked *) | Changes in files it already owns |
|---|---|---|---|
| **F. Shell and glass** | Tokens, materials, fallbacks, governor, settings, view switch, links, top rows for both views, phone top row | `src/styles/app.css`, `src/styles/shell.css`, `src/shell/view.ts`*, `src/shell/glass.ts`*, `src/shell/settings.ts`*, `src/styles/settings.css`*, `index.html`, `viewer/url.ts`, `viewer/share.ts` | app.css: Night and Chart tokens, the materials and rim/grain classes, the shared components re-skinned; shell.css: top row, rail, view switch, phone top row; url.ts: `ui`, `mission`; share.ts: Web Share on phones; index.html: mount points (§12) |
| **C. Sky** | Globe (SIN handover), limb glow, empty space, beacons, limb tags, labels on Thin chips over bright sky, keep-clear for Discover cards | `src/sky/*`, `src/styles/sky.css` | sky.ts: projection handover, `camera().projection`; markers.ts: `setBeacons`, bright-sky label chips; sky.css |
| **D. Frame and bar** | Frame and bar in Slate/Regular; Discover frame variant (56 px Play, date chips, date scrubber, colour slider); phone frame; Expert-on-phone compact bar | `src/viewer/` files D owns, `src/viewer/chips.ts`*, `src/viewer/scrubber.ts`*, `src/styles/frame.css` | frame.ts/bar.ts read `html[data-view]` for the variant; state.ts: `measureOpen` |
| **E. Measure and tools** | Measure and tools in Slate; `measureOpen`; Measure as a phone sheet | `viewer/detail.ts`, `tools.ts`, `inbox.ts`, `src/styles/tools.css` | detail.ts: render into the sheet on phones; tools.css tokens |
| **H. Missions engine** | Mission definitions, checks, progress, plain sentences, practice set | `src/explore/*` incl. `missions.ts`*, `progress.ts`*, `plain.ts`*, `practice.ts`*; `src/guide/*`; `src/styles/guide.css`; `tests/missions.test.ts`* | game.ts: new starters; copy.ts: Discover strings; guide: tours stay in Expert |
| **K. Discover interface** | Welcome, home (path, dock, shelf), mission card, success, field guide, coach cards, free look wording | `src/discover/*`* (`index.ts`, `welcome.ts`, `path.ts`, `dock.ts`, `mission.ts`, `success.ts`, `guidebook.ts`, `coach.ts`), `src/styles/discover.css`* | none (new) |
| **M. Mobile sheet** | The bottom sheet: detents, gestures, keyboard and screen-reader actions, Slate at full | `src/shell/sheet.ts`*, `src/styles/sheet.css`*, `tests/sheet.test.ts`* | none (new). Each lane writes its own phone `@media` rules in its own stylesheet |
| **G. Places** (small) | Place card and lists in glass; the Discover wording; card in the sheet on phones; `placeFacts(key)` for the field guide | `src/shell/places.ts`, `objects.ts`, `places/*`, `src/styles/places.css` | as listed |
| **Integrator** | `main.ts` starts `discover`, `glass`, `sheet`; workspace.css on tokens; smoke flows at 390×844; glass-area and contrast checks in the smoke test | `src/main.ts`, `src/styles/workspace.css`, `tests/smoke/*`, `docs/*` | add `390×844` to flows that opt in; add `tests/smoke/flows/k-discover.ts`*, `m-phone.ts`* |
| **B. Core** (small) | `nearestSeenDistance(planet, noises)` and `smallestSeenRadius(…)` for Planet X step results | `src/core/sandbox.ts` | pure functions with tests |

**Order of work.**

| Step | Result | Lanes |
|---|---|---|
| 0 (half a day) | Contracts in §12 agreed; tokens in app.css; `view.ts` stub; mount points; `sheet.ts` stub | F, Integrator |
| 1 | Night Glass everywhere in Expert; governor; fallbacks; contrast test in CI | F, D, E, G, Integrator |
| 2 | Discover home and the runaway end to end on desktop; globe at full zoom-out | K, H, C, D |
| 3 | The other five missions; field guide; settings; phones (sheet, frame, Expert on a phone) | H, K, M, D, E, B |
| 4 | Review against §14 and DESIGN-v2; manual pass on a real GPU, Safari and Firefox | All |

## 14. Acceptance checks

Automatic unless marked (manual).

### Glass (GLS)
| ID | Requirement | Check |
|---|---|---|
| GLS-1 | Every material uses the DESIGN-v2 recipe; no hand-typed blur, tint or shadow outside app.css | Token lint (grep for `backdrop-filter` outside app.css) |
| GLS-2 | Every text colour passes 4.5:1 on every material over white, Betelgeuse and the Milky Way | `mockups/tests` method run on the built CSS in the smoke test |
| GLS-3 | GLS-2 also holds in Firefox and Safari | Manual, once per release |
| GLS-4 | No glass element has an ancestor with opacity < 1, filter, mask, clip-path, mix-blend-mode or backdrop-filter | Smoke: walk ancestors of every element with a backdrop-filter |
| GLS-5 | Blurred area within budget at each size | Smoke: sum of rects (DESIGN-v2 §6) |
| GLS-6 | No picture, chart, cutout or histogram is inside or under a glass element | Smoke: for every `canvas` and `.well`, no overlapping element with a backdrop-filter is above it, and none of its ancestors has one |
| GLS-7 | Solid via setting, via `prefers-reduced-transparency`, without `backdrop-filter` support; contrast-more and forced-colours behave as DESIGN-v2 §5 | Emulated media in the smoke test |
| GLS-8 | The governor drops to Lite then Solid when frames are slow, never back up in a visit, and the user's choice wins | Unit test with fake frame times |

### Views (VIEW)
| ID | Requirement | Check |
|---|---|---|
| VIEW-1 | A first visit opens Discover; `b102-level=measure` opens Expert once | Smoke with storage set |
| VIEW-2 | The switch is on screen in both views at all three sizes, and keeps target, date, detector and field size | Smoke |
| VIEW-3 | Expert shows everything today's Measure level shows; nothing in Expert is locked by missions | Smoke runs the existing flows in Expert |
| VIEW-4 | Links: `ui`, `mission`, and the rule for links without `ui`; progress never in a link | Unit (url.ts) |
| VIEW-5 | The first switch to Expert shows the coach card once | Smoke |

### Discover (DSC)
| ID | Requirement | Check |
|---|---|---|
| DSC-1 | After the intro on a first visit, the globe glides to its first-run place and the welcome card appears; skip lands on the same state | Smoke (`?intro=1`) |
| DSC-2 | At full zoom-out the sky is a globe on empty blue-black space with the limb glow in the shown detector's hue, and the sky note names the detector | Smoke + screenshot |
| DSC-3 | Mission beacons for near-side targets; limb tags for far-side ones that turn the globe when pressed | Smoke |
| DSC-4 | The path shows six missions with correct states; the hunt is locked until three missions are done | Unit (progress) + smoke |
| DSC-5 | Skills light only after their mission; "Unlock all" lights all; each lit skill's tool appears in Discover | Smoke |
| DSC-6 | Free look: "Look here" on the sky after Blink; live states as §4.8 | Smoke with the service off and on |
| DSC-7 | Field guide lists met objects with picture, date, detector and sources; never Planet X | Smoke |
| DSC-8 | Every state in §4.8 is reachable and worded as written | Smoke flows per state |
| DSC-9 | Labels over a bright sky sit on a Thin chip | Screenshot at Betelgeuse |

### Missions (MSN)
| ID | Requirement | Check |
|---|---|---|
| MSN-1 | Each mission's checks call the functions named in §5, and a step never passes before its measurement exists | Unit (missions.ts with fixtures) |
| MSN-2 | The runaway: a tap on Barnard's Star's track passes; a tap 3 reach-radii away misses with the calm note | Smoke |
| MSN-3 | The breather: pausing on the brightest and faintest visits passes; other visits do not; the not-measured fallback works | Unit with a synthetic light curve; smoke on R Draconis |
| MSN-4 | The ghost: the arrow at zero motion does not pass; at the catalogue motion it passes; the opposite motion does not | Smoke (uses the motion handle's keys) |
| MSN-5 | The recipe: stopping in the brightest band passes; a water or methane band passes step 3 only when measured below 50% at 3σ | Unit with the shipped spectrum |
| MSN-6 | Planet X: "Simulated" first everywhere; verdicts come from `core/sandbox.ts`; nothing reaches finds, field guide or exports | Unit (extends tests/sandbox.test.ts) |
| MSN-7 | The hunt: practice graded against the change search's labels; the hunt never graded; the CSV is titled "Candidates to check, not discoveries" | Unit + smoke |
| MSN-8 | Show me rings and never completes the step | Smoke |
| MSN-9 | Progress survives a reload; Reset clears only `sima-missions` | Smoke |
| MSN-10 | Every result sentence has a sources line, and a "Not measured: {reason}" form | Unit (plain.ts) |

### Phones (MOB)
| ID | Requirement | Check |
|---|---|---|
| MOB-1 | No page scroll and no horizontal overflow at 390×844 and 360×740 | Smoke |
| MOB-2 | Every target ≥ 48×48 px, 8 px apart | Smoke measures `[data-guide]` and buttons |
| MOB-3 | The sheet's detents, drag, tap-to-cycle, and screen-reader actions | Unit + smoke |
| MOB-4 | Discover's six missions can be finished on a phone | Smoke at 390×844 |
| MOB-5 | Expert on a phone shows the frame, bar, wavelength and Measure; Send this to my computer shares or copies the link | Smoke |
| MOB-6 | The intro plays on phones and lands on the Discover globe | Smoke |
| MOB-7 | Landscape phones put the sheet on the right | Smoke at 844×390 |

### Accessibility (A11Y)
| ID | Requirement | Check |
|---|---|---|
| A11Y-1 | One full mission with the keyboard only | Smoke (keys only) + manual |
| A11Y-2 | Step changes, misses and results are announced once | Smoke reads the live region |
| A11Y-3 | "Describe the dots" can complete the runaway | Smoke |
| A11Y-4 | Reduced motion: no dive, glide or sweep; still Two dates picture | Smoke with emulated media |
| A11Y-5 | Focus is visible on Night glass (white halo) | Screenshot |

## 15. Performance budgets

SPEC 11.2 and DESIGN-v2 §6 hold. Added for Discover and phones:

| Thing | Budget |
|---|---|
| Discover code (`src/discover`, missions, sheet), gzip | ≤ 40 KB on top of today's bundle |
| Intro end → welcome card visible | ≤ 0.5 s (no new loading) |
| Start mission → pictures playing (shipped data) | ≤ 1.5 s after the dive ends |
| A mission check after the action | ≤ 100 ms, except checks that wait for a measurement (they show "Measuring…") |
| Practice set ready (change search on shipped patches) | In the worker, ≤ 5 s on the reference laptop, prepared while the visitor plays earlier missions |
| Phones: first globe | ≤ 5 s on a mid-range phone over 4G (shipped sky) |
| Phones: memory | Missions load one patch at a time; the frame keeps at most two patches |

## 16. Open questions for the team

1. **Names.** Discover and Expert (or "Simple" and "Expert", or Arabic names first)?
2. **Default theme.** Night for everyone (D-1), or follow the system on light desktops?
3. **Arabic interface.** Translate Discover now (and which `--arabic-text` face), or English only for
   the hackathon?
4. **The Arabic display font.** The font agent's choice replaces Aref Ruqaa in the mockups; does
   the team want a calligraphic hand (Ruqaa) or a built Kufi for the mark?
5. **The live service** (SPEC risk 2). The hunt and free look need it beyond the five shipped
   patches. Without it the hunt is practice plus whatever the shipped patches yield.
6. **Limb glow in the detector hue** (D-11): keep, or white only?
7. **RW Aurigae** has no mission. Add a seventh ("The flickering newborn") or keep six?
8. **Demo flow** (SPEC 9.6): film Discover (intro → runaway → skill unlocked → Expert's
   10.39″/yr) or Expert as today?
9. **Mission order after the first**: free (B-3), or a suggested order shown as "Up next" only (as
   designed)?
10. **Practice set size** in the hunt: six spots, pass at four, if the shipped patches allow.
