# Independent Codex challenge

**Verdict: build with changes.** Keep Night Glass, the opaque science wells, the simple first mission and the one-click route to Expert. Those form a strong product. Do not build the full proposal as written. Several mission checks teach stronger conclusions than the measurements support. The phone sheets already obscure the evidence in the mockups. The plan also calls substantial new measurement and accessibility work “existing” behaviour. Ship one complete beginner mission, a readable phone layout and the existing Expert tools first. Add other missions only after their checks pass on real shipped data.

This is an independent review of this checkout on 15 November 2026. I did not inspect the other challenger’s work. I used the supplied brief in place of a design interview and performed the review myself, as requested. No app code was changed.

## Ranked findings

### 1. Blocker — The hunt quiz teaches guesses as facts

**Wrong:** Practice grades “Known”, “Likely artefact” and “Weak” as “A real star moving”, “A glitch” and “Just noise”. These are not equivalent statements. This contradicts the careful, ungraded hunt immediately below it.

**Evidence:** BEGINNER-AND-MOBILE §5.6 and MSN-7. In `src/core/detect.ts:623`, Known can mean a positional match at a source, including a brightness change rather than motion. At lines 635–637, Weak can mean proximity to a bright star. At lines 642–648, Likely artefact can mean glare or a single-exposure event; the code explicitly allows “something that lasted less than a day”. A catalogue match does not verify the cause of a difference. SPEC H4/H7 require the distinction.

**Fix:** Replace the practice choices with observable checks: “At a catalogue source”, “Only on one exposure”, “Near a bright star”, and “Not enough evidence”. Exact feedback: “It appears on 1 of 4 exposures. That can be an artefact or a short event. This check does not tell us which.” Remove the pass score until an independently reviewed real example set exists. Reward completing the checks, not agreement with the pipeline.

**Effort:** Half a day for wording and checklist rules. Several days to curate and verify a defensible graded set.

### 2. Blocker — Discover cannot use the ghost’s handle under the stated contracts

**Wrong:** The ghost is described as reusing an existing tool, but Discover runs at Explore level and that tool only runs at Measure level. Adding mission IDs does not solve this.

**Evidence:** BEGINNER-AND-MOBILE §§5.3, 12, 13. `src/viewer/motion.ts:79` requires `S.level === 'measure'`. `src/viewer/state.ts:38` excludes Stack from Explore’s views. `src/explore/game.ts:147` resets an unsupported mode to Flip. The motion module exports the trial picture and motion, but its completed trial result and controls are private. Target results in `src/viewer/detail.ts:55` and its request flow at line 238 are also private to the Measure UI.

**Fix:** Before lane work, agree a result contract with D/E/B/H: patch identity, detector, trial motion, settings, pending/error status, completed stack and both controls. A mission must reject results for an older trial or patch. Explicitly allow the motion handle in the ghost mission without raising the whole app to Expert. Give D the handle change, B the result computation and H the check. For v2.0, cut this mission rather than adding the contract in a rush.

**Effort:** One to two days including integration and stale-result tests. This is a design dependency, not a missing button.

### 3. Blocker — The phone sheet covers the evidence it promises to preserve

**Wrong:** The success sheet overlays the frame. Fixed square pictures, half-height sheets and fixed controls cannot all fit on short screens. A larger hint sheet has the same unresolved constraint.

**Evidence:** Viewed `04-mission-success-390.png` and `03-mission-progress-390.png`. Chromium geometry on the success HTML: at 390×844 the frame spans y=64–476.39 and the sheet starts at y=411.98, an overlap of 64.41 px. At 360×740 the frame ends at 446.39 and the sheet starts at 290.59, an overlap of 155.80 px. The latter sheet is about 61% high, despite §10 specifying half. `04-mission-success.html:17` clips the card with `max-height:62vh; overflow:hidden`. This violates DESIGN-v2’s Rest Rule and the nonmodal promise in BEGINNER-AND-MOBILE §10.

**Fix:** “At peek and half, size the picture to the remaining visual viewport after header, controls, provenance and sheet. The target and required controls must remain visible. At full, pause picture interaction and provide Collapse and Back controls. Sheet content may scroll whenever it exceeds its available height.” Retain a minimum useful picture size; below it switch to stacked, vertically scrollable content. Do not shrink sentences or hide the explanation to force a fit.

**Effort:** One to two days for layout and sheet integration; test real browser chrome and rotation.

### 4. Major — Several no-measurement branches have no finish

**Wrong:** The global rule promises an alternative check, but several missions have none. The breather fallback asks for measured visit values after saying no detector has measurements. The recipe can ask the visitor to keep playing a channel that has no shipped exposure. “Show me” is only defined as a picture ring, not as a fallback for these tasks.

**Evidence:** BEGINNER-AND-MOBILE B-5, §§4.8, 5.2–5.5 and MSN-1. Planet X’s real `verdict()` has an `unknown` branch when noise is missing (`src/core/sandbox.ts:173`). The recipe has 28 usable channels, not 102. Missing coverage cannot be repaired by more loops.

**Fix:** Give every step four explicit states: checking, verified, unavailable with reason, and retryable failure. “When no valid check exists, offer Continue without a measurement. Record the step as unavailable, not verified. The skill may unlock for completing the lesson; show no numerical win or scientific claim.” Preselect measured channels for the recipe. Define what a reload does while measuring.

**Effort:** Half to one day for the state table; implementation across missions adds time.

### 5. Major — The recipe’s check does not establish its molecular conclusion

**Wrong:** Any low point in any shaded band passes. That does not show both water and methane absorption. Comparing a dip with the global 4.11 µm maximum also does not isolate an absorption feature from the broad spectrum shape.

**Evidence:** BEGINNER-AND-MOBILE §5.4. The absorption regions in `src/viewer/measure/model.ts:169` are physical reference bands. The shipped usable spectrum has water-band points but no usable point in the listed 3.15–3.5 µm methane band. There are usable points in the 2.15–2.45 µm methane band, so the lesson is feasible with careful selection. The current test (`tests/real.test.ts:122`) compares the 1.37 µm dip with nearby peaks; the mission instead accepts any flux below half the global maximum. My measured peak was 57,455.45 ± 59.60 µJy at 4.1098 µm.

**Fix:** For v2.0, say: “Some measured colours are much fainter. The shaded regions show where water and methane can absorb. SIMBAD classifies this object as a pair of brown dwarfs.” For a stronger lesson, require separately measured water and methane examples, compare with suitable nearby continuum points, and propagate both errors. Do not present catalogue classification as something this check proved.

**Effort:** Two hours for restrained copy; one to two days for a verified molecular lesson.

### 6. Major — The ghost tells users what they can see without checking

**Wrong:** Both answers to “Can you see it?” receive “Nobody can”. The result also says “nothing to see” in short bands. That turns non-detection into absence and dismisses the visitor’s report.

**Evidence:** BEGINNER-AND-MOBILE §5.3. Running `stackAlong` on shipped WISE 0855 D5 with mean combination gave 15.2572σ along the catalogue motion, controls 5.6565σ and 2.3467σ, travel 1.3634 pixels. The proposed ratio threshold passes (2.6973×). This is good evidence for that particular check. But the unshifted control itself exceeds 5σ, so a dot alone is insufficient. The stack computation is a fitted source measurement, including neighbours, not a test of what every viewer can see (`src/core/stack.ts:15–25`).

**Fix:** “It is hard to distinguish in a single picture. Let’s compare a stack with two controls.” Result: “Not detected in these shorter bands with this method.” Fill the measured bands and limits at runtime. Preserve the proposed control comparison, show all three cutouts and explain any control signal. Name the ratio criterion as a teaching check, not proof of a unique motion.

**Effort:** Two hours for copy; half a day for a clear three-cutout lesson.

### 7. Major — Brightness skill confuses fixed-position change with a star changing

**Wrong:** The unlocked tool promises “This star changed” anywhere a user taps. The actual spot method measures a fixed circle. A moving source can leave that circle, and blend changes can imitate variability. A missing or untested result also cannot become “No change we can measure”.

**Evidence:** BEGINNER-AND-MOBILE §5.2 skill. `src/viewer/measure/model.ts`’s `spotHeadline` explicitly says a moving source walks out of a fixed circle. It distinguishes changed, steady and not tested. R Draconis’s clean D6 curve is real: my run reproduced 10 visits and 1.0381 mag range, about 2.60×. That validates the target lesson, not the universal tool promise.

**Fix:** “Light at this fixed spot changed by … Moving stars, nearby objects and image problems can also cause this.” Keep changed, steady, not tested and not measured distinct. For the target lesson label 246 days as a catalogue period; do not imply Sima fitted it from these visits.

**Effort:** Half a day if reusing existing spot wording; more if tracking arbitrary tapped stars is required.

### 8. Major — Ten seconds gets the visitor a menu, not the moving star

**Wrong:** The welcome screen is understandable, but the new first-run flow adds a decision and another dive before the first useful task. “About 2 minutes” is a poor opening promise for a 30-second judge video. The overview also locks basic playback and free look behind completion.

**Evidence:** BEGINNER-AND-MOBILE §§3.1, 4.1, 5.1. DESIGN.md’s intro lasts about 6.25 seconds plus fade. V2 ends on a globe and requires a click followed by another ≈1.3-second dive. SPEC §11.2 requires the starter playing within 3 seconds of page open. `01-first-run-390.png` clearly prioritises Start, but the visitor has not yet seen dated change. This is a design assessment; no novice timing study was run.

**Fix:** “Preload and start Barnard’s pictures within 3 seconds, independent of intro and sky tiles. Skip lands on the same playable first task. After the intro, show ‘One dot moves. Tap it.’ beside the pictures.” If the globe welcome is retained, explicitly resolve the visible-first-result budget with the integrator. Keep Play, stepping and Look here usable before completion; use the skill shelf to record learning, not to block exploration.

**Effort:** Half to one day. Test five new visitors: within ten seconds they should identify both the task and the picture to act on.

### 9. Major — The glass governor misses the failures its budget cares about

**Wrong:** Ninety moving frames at a median threshold above 22 ms can take seconds to react. Median timing ignores occasional severe stalls. Short drags may finish before a decision. The text conflicts over whether all phones start Lite or only devices with certain reported hardware values do.

**Evidence:** DESIGN-v2 §6 says phones start Lite in the budget table, then limits that start to `deviceMemory ≤ 4` or `hardwareConcurrency ≤ 4`. The governor ignores stationary-sky work and uses a median, while the target is p95 ≤20 ms and SPEC also limits long tasks. A system can have a good median and still miss both. BEGINNER-AND-MOBILE §15 permits waiting for measurement; that must not exempt computation from the main-thread limit.

**Fix:** “All compact layouts start Lite. Collect visible-tab samples across gestures. Downshift after a short window of sustained slow frames or repeated >50 ms gaps. Ignore hidden-tab and resume gaps. Measure p95 pan timing and main-thread tasks separately.” Define priority between user Glass, system high contrast and automatic degradation. A manual preference must not silently disable the performance acceptance check.

**Effort:** Half to one day, plus device testing. Ship Solid on phones if those tests cannot be run.

### 10. Major — Glass area and software rendering do not prove the GPU budget

**Wrong:** CSS-pixel area is a useful guard, not a cost measurement. It ignores device pixel ratio, blur sampling outside element bounds and the actual moving canvas. “Lite costs about half” has no benchmark attached.

**Evidence:** DESIGN-v2 §§5–6; `mockups/tests/glass_area.mjs` sums clipped rectangles. A DPR 3 screen has nine times the physical pixels of the same CSS viewport at DPR 1. The contrast and area pages use static imagery. My single-browser probe moved the globe image for 180 animation frames at 1366×768, DPR 2, Chromium 1243 with SwiftShader: glass median 66.6 ms / p95 83.3 ms; no blur median 66.6 ms / p95 133.3 ms. The software setup was slow in both cases and the result is inconclusive about blur cost. It is not evidence of a real-phone failure or a glass speedup.

**Fix:** Remove the “about half” cost claim. Require warm, paired Glass/Lite/Solid runs on the actual animated sky at native DPR: a reference integrated-GPU laptop, a weaker Android phone and iPhone Safari. Log p95 and long tasks during panning, playback and wavelength changes. Retain the area guard. If the real-device gate is missed, release Solid rather than holding the whole product for glass tuning.

**Effort:** Half a day if devices are available. More if performance fails.

### 11. Major — Accessibility work is hidden behind an incorrect reuse claim

**Wrong:** The spec describes an existing picker that jumps between bright sources and announces brightness. The existing picker moves a crosshair one pixel per arrow press. “Describe the dots” also needs measured shifts for multiple sources, which the target-only motion fit does not supply. Only the runaway gets a nonvisual task alternative; the remaining visual and drag tasks do not.

**Evidence:** BEGINNER-AND-MOBILE §9 and A11Y-3. `src/explore/keypick.ts:1`, `onKey`, and `where()` describe pixel movement and coordinate announcements. No source list or measured per-source shift is exposed there. §5.3 asks for arrow dragging, §5.4 a colour slider, and §5.6 three cutout classifications. The acceptance list tests only one keyboard mission.

**Fix:** Do not call source navigation existing. For v2.0 retain the current keyboard picker and its catalogue ring guidance, clearly labelled. If implementing Describe the dots, assign B the measured source-list contract, and say not measured for failed shifts. Give each mission a keyboard and screen-reader route, including numeric trial-motion controls and a table of measured channels. Test VoiceOver and TalkBack with a person; reading a live-region string is not that test. On step change, announce it without always stealing focus from playback or a slider.

**Effort:** Several days for the full six-mission promise. One complete accessible mission is achievable first.

### 12. Major — The phone mockups omit provenance and undersize controls

**Wrong:** The phone success screen hides the measured explanation and the direct Expert link. Its picture header has no release. A single rounded “1.7 µm” cannot explain both dates of a composite. Small top controls contradict the 48 px rule.

**Evidence:** `04-mission-success.html:18–20` hides `.result p`, `.textlink` and the view row on phones. Its data line is desktop-only; the phone header reads “Real data · NASA SPHEREx · D3 1.7 µm”. In `03-mission-progress-390.png`, the picture badge gives a month rather than the full source/date line specified by H2. `discover.css:267–270` makes icon controls 44 px and switch segments 36 px high. Chromium confirmed 36 px segments at 390 and 360 wide. BEGINNER-AND-MOBILE §§4.4, 10–11 require those omitted details.

**Fix:** Show source, release, full date(s) and wavelength range in a wrapping compact header. Give combined pictures an explicit “Two dates combined” label and a one-press original view. Keep “How measured” beside the result on phones. Set actual hit areas to 48 px with 8 px gaps, including the grabber, switch and icon controls. Adjust the 44 px top-row specification accordingly.

**Effort:** Half a day for spec and mockup correction; coordinate with the layout fix.

### 13. Major — Sheet navigation has no return contract

**Wrong:** One sheet is sensible, but replacing its content can make the mission’s next action disappear. Field guide, Settings, a place card and Measure all compete for it. A shared Escape priority of 30 does not define which closes first, where focus returns or whether Escape closes content and the sheet twice.

**Evidence:** BEGINNER-AND-MOBILE §§10, 12; `openSheet(el, {detent,label})` has no stated return behaviour. Mission step persistence is specified; return to the interrupted sheet is not. Discover’s phone top row has only one icon, with no specified route to all shared actions.

**Fix:** “Opening secondary content saves the previous sheet content, detent and invoking control. Back restores them without changing the mission. Escape performs exactly one Back or Close. Full sheets make covered controls unfocusable; half sheets retain usable exposed controls.” Add an explicit phone menu containing Find, Field guide, Settings, Share and About. Define equal-priority desktop card ordering by most recently opened.

**Effort:** Half to one day before callers start integrating sheets.

### 14. Major — The build plan understates cross-lane work

**Wrong:** Nine owners do not remove the dependency chain. Results, skills, URL state, tool visibility, mobile reparenting and source picking need agreements not covered by the three listed additive changes. “All five other missions, field guide, settings, phones” in one step is not a schedule.

**Evidence:** BEGINNER-AND-MOBILE §§12–13. H owns `sima-missions`, K draws its state, D needs skills to choose views, F owns Settings’ unlock/reset actions. No subscriptions or commands are specified between them. E reparents Measure into M’s sheet while its render flow already controls visibility. F/M/H all participate in modal and keyboard behaviour. B is called “small” but the source-shift accessibility feature adds science work. SPEC §8.4 and AGENTS require integrator agreement for these boundaries.

**Fix:** Freeze minimal typed contracts before parallel work: progress read/subscribe/actions, mission start/leave, measurement requests/results with stale identity, sheet Back/focus ownership and URL precedence. Explicitly assign each existing file, including `viewer/motion.ts` and `explore/keypick.ts`. Build one vertical path first: cold load → runaway → honest result → Expert → back → phone. Only then distribute independent additions. Give each step a stop date and a cut rule.

**Effort:** Half a day to narrow and specify; the complete proposal is several parallel days plus integration, not a half-day setup followed by cosmetic work.

### 15. Major — Network and offline states promise more than is defined

**Wrong:** The proposal covers basic offline and service-off states, but not the full job lifecycle. It promises a ready toast while the visitor tries another mission, without defining how the arriving patch avoids replacing that mission. It says “six missions still work” with the service off, although the hunt may not produce enough practice examples. Under three available examples has no branch.

**Evidence:** BEGINNER-AND-MOBILE §§4.8, 5.6, 15. `docs/live-service.md` describes search, first-look and full-set phases, partial availability, retries and empty/failure cases. §4.8’s ready message does not identify first-look versus full set. The offline claim depends on cached patches, but the v2 plan does not establish an installable offline cache. The existing sky service worker alone is not proof that all mission frames are cached.

**Fix:** Name searching, queued, partial playable, complete, timed out, cancelled and no-coverage states. Never replace an active mission when an old fetch completes; offer an explicit Open action tied to that job. Say “The shipped lessons can work without the live service. Offline availability depends on downloaded pictures.” If fewer than three practice examples exist, show an ungraded walkthrough or an unavailable reason. Provide Retry, choose a shipped mission and cancel/leave actions. Add blocked-storage and corrupt-progress behaviour; use in-memory progress when saving fails.

**Effort:** One day for the state contract and tests, longer if full offline caching is added. Defer the caching promise.

### 16. Major — Responsive acceptance stops before the hard cases

**Wrong:** Two portrait sizes and 200% zoom are too narrow a gate. The landscape rule specifies a 360 px side panel plus a half-width frame; those compete on smaller landscape phones. Fixed no-scroll layouts risk losing actions when text grows or the software keyboard opens.

**Evidence:** BEGINNER-AND-MOBILE §§9–10 and MOB-1/MOB-7 only test 844×390 landscape. At 568×320, half width plus a 360 px panel already exceeds the viewport before gutters. There are no acceptance states for virtual keyboard, browser bars, 320 px width, 400% zoom, large text, 700–1024 px tablets or rotation during a gesture. Mockup CSS switches only by width and does not implement the proposed landscape rule. W3C’s [Reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) requires non-excepted content to work at an equivalent width of 320 CSS px; the scientific canvas exception does not excuse clipped surrounding controls.

**Fix:** Use available visual height as well as width. Below the minimum two-column width, stack content and allow vertical scrolling. Preserve target, step and focus across rotation; cancel active drags safely. Add 320×568, 568×320, tablet portrait, 400% desktop zoom, 200% text and search with the keyboard open. Use logical CSS properties and isolated LTR spans for coordinates and µm values inside Arabic text.

**Effort:** One day after the core sheet layout works.

### 17. Minor — Contrast evidence is useful but narrower than the claim

**Wrong:** The test samples a percentile of blank panel backgrounds. It does not test every final text/control combination. Discarding the brightest 2% can miss a small glare under a glyph. The typography rules also disagree: one says no text under 14 px on glass; another allows 12 px labels at weight 500.

**Evidence:** DESIGN-v2 §§4.4, 7, 13; `mockups/tests/measure_contrast.py` samples a fixed central region every third pixel and uses the 98th/2nd percentile. The material values provide healthy nominal contrast, which is good. But final filled rows, status pills, disabled controls and focus outlines are different combinations. Current [MDN backdrop-filter documentation](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter) confirms broad support, not identical rendering or speed. [Reduced transparency remains a limited-availability feature](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-transparency), so the manual Solid setting is a sound decision.

**Fix:** Describe these as material samples, not a blanket WCAG pass. Test worst local backgrounds and final component states, including Chart, Lite and Solid, on Safari/Firefox as already planned. Resolve the font rule: body at least 14 px on glass; compact labels 12 px/500 where verified. Test final tokens with grain and fills enabled. Keep the prefixed and unprefixed blur properties and support fallback.

**Effort:** Half a day for focused checks. Do not delay the hackathon for a comprehensive screenshot testing framework.

### 18. Minor — The direction is premium; some decoration weakens the hierarchy

**Wrong:** The distinctive parts are the real sky, the two-date picture and Arabic identity. Repeated glowing tiles, pill outlines and large corner radii can make those feel like a generic space dashboard. Home repeats the same next task in the mission list, dock and beacon. Desktop mission instructions and the picture sit at opposite edges with a large empty gap between them.

**Evidence:** Viewed screens 01–08 at 1900 and 1366, and all seven supplied phone screens. Screen 08 has no 390 PNG in this checkout. `02-discover-home-1366.png` gives the next mission three competing representations. `03-mission-progress-1900.png` separates the reading and action areas. `04-mission-success-390.png` gives the unlock tile considerable space while hiding the measured explanation. DESIGN-v2 says the data should be brightest, but the ghosted tile glows and rim sweep are presentation rather than data.

**Fix:** Keep the smoked palette and opaque wells. Put the active instruction nearer the picture on wide desktops. Remove the home dock’s duplicate next-task card when that row is already visible. Make the skill shelf smaller and remove repeated tile glows; retain one quiet unlock transition. Judge the final Arabic font at 17 px and the real wordmark size, not only in a large specimen. This is visual judgment, not a measured usability failure.

**Effort:** Half a day after functional blockers. Do not spend the hackathon recreating OS glass refraction.

## What the data checks actually established

I ran the repository’s pure TypeScript functions against this checkout’s `public/data` using `tests/core-data.ts` to decode it. These were temporary probes outside the repository, not new tests or app changes.

| Lesson | Observed result | Limit |
|---|---|---|
| Runaway | `fitMotion`: 10.5002 ± 0.2560″/yr, 71/72 pictures | The success number is supported. A tap on a catalogue track alone does not verify the fit. `explore/track.ts:64` tests distance to a path, not an observed source classification. |
| Breather | D6 shown, 10 visits, 1.0381 mag range; D5 also shown | About 2.60× is supported in D6. Detectors 1–4 have `shown:false`; use the existing quality gate. Lower dmag means brighter. |
| Ghost | D5 mean stack: 12 pictures, 15.2572σ; controls 5.6565σ / 2.3467σ | Catalogue-aligned ratio passes the proposed 2× gate. This does not show every trial is unique or prove each single picture is invisible. |
| Recipe | 28 usable channels across all six detectors; peak 4.1098 µm | Coverage is sparse. A slider over 102 channels needs an explicit unavailable-channel state. |
| Planet X | `verdict` has one/stack/no/unknown branches and uses measured patch noise | The check exists. I did not run a full distance/radius sweep, so the proposed thresholds and attainable slider endpoints still need verification. Keep all results conditional on model assumptions and this patch’s noise. |
| Hunt | Code inspection confirms probabilistic labels | I did not prove that shipped data yields two examples of each label. Do not promise that set or a pass threshold before measuring its availability. |

The data and seeded sky directories total about 19.18 MB by `du -sb`, including directory entries. There is room under 25 MB for small additions. This is not a full shipped-asset audit. Do not ship the mockup screenshot collection as production mission data.

The browser probe used a temporary static server on port 5231 and at most one Chromium process at a time. Browser and server were stopped. I did not run native-GPU, Safari or Firefox tests. The pure data results do not establish browser frame-step or cold-load timing.

## Ranked hackathon cuts

1. **Cut graded hunt practice and the pass score.** Keep the existing Expert candidates and warnings. An ungraded evidence checklist can come later. This removes the worst honesty risk and runtime example-set dependency.
2. **Ship the runaway as the only required mission.** Use one result and one clear Expert handoff. Offer other shipped targets as ungraded “Try another object” choices. Do not advertise six complete missions until their real-data and access routes work.
3. **Cut the new molecular grading and ghost trial-motion mission from v2.0.** Keep their existing Expert spectrum and stack tools. Add the lessons after result contracts and data fixtures are verified.
4. **Cut hard skill gates.** Keep a small completion indicator. Playback and free look should work immediately. This reduces coupling between progress, frame controls and URL restoration.
5. **Use Solid on phones until measured otherwise.** Keep desktop smoked glass, opaque wells, explicit Solid setting and system fallbacks. Defer fine governor tuning and decorative limb/skill effects before compromising the data or interaction budgets.
6. **Cut Chart glass from the first release.** It doubles surface-state checks. Retain high-contrast and forced-colour support. Restore a light theme after the dark workflow passes.
7. **Cut Field guide snapshots, six-tile shelf and hunt CSV notes.** Keep source-backed place cards and one progress record. Add collection features only after the first mission and Expert round trip are reliable.
8. **Defer continuous STG–SIN projection handover.** Keep the existing intro, then use a labelled fade to the playable patch. The new globe home can ship only if it does not delay first science or break map targeting. It is attractive, but not required to demonstrate change.
9. **Defer full mobile Expert customisation and Arabic translation.** Ship the promised readable measurements and link handoff, with the same target preserved. Keep Arabic names/search and prepare layout direction without launching an untested translation.

Release gate: a cold visit, Skip, runaway, result, Expert and return must work at 1366 and on a short phone, with keyboard, reduced motion, slow network and live service off. Typecheck, tests and build must pass. Preserve <100 ms main-thread tasks, <50 ms frame steps and the 3-second starter budget; a new “Measuring…” label is not permission to block the page.

## Answers to the ten open questions

1. **Names:** Discover and Expert. They are short and describe intent. Avoid Simple, which can sound like a judgment about the visitor. Use English labels for this release; keep سيما in the identity.
2. **Default theme:** Night. It supports the real image and intro. Do not let a desktop light preference unexpectedly change the sky workspace. Solid and high contrast remain available. Defer Chart glass if time is tight.
3. **Arabic interface:** English for the hackathon. Keep sourced Arabic names and Arabic search. Prepare logical layout properties and bidirectional isolation now. Translate Discover only with fluent review of astronomy wording, RTL interactions and actual phone layouts. Noto Sans Arabic is a reasonable prototype face, not a reason to promise translation.
4. **Arabic display font:** Prefer a compact built Kufi for this instrument-like interface, while respecting the owner’s exclusion of Reem Kufi. The final choice should be based on the actual small wordmark and 17 px star names. Aref Ruqaa is distinctive, but the small screenshots read more like a handwritten signature than an instrument mark. Do not hold integration for another font contest.
5. **Live service:** Keep it as an optional extra. Host and test it if time allows, but the judge route must run entirely on shipped pictures. Show separate search, partial and complete states. Never claim universal immediate imagery. Without the service, label free look’s limitation before the visitor waits; keep practice ungraded.
6. **Limb glow:** Prefer a very faint white rim for v2.0. Detector hue is acceptable only when the displayed band and label actually change together. A permanent teal halo around a fixed screenshot looks decorative and teaches no useful band relationship.
7. **RW Aurigae:** No seventh mission. Keep it accessible as another real target in Expert and as an ungraded follow-on. Six already exceeds the evidenced build scope.
8. **Demo flow:** Discover → tap the moving star → measured result → Expert. Keep the intro brief or use a short cut from it. Show 10.50 ± 0.26″/yr measured beside Gaia’s 10.39″/yr catalogue value; do not film 10.39 as the measured value merely because it matches the catalogue. This checkout’s code/data support the former. Aim to show the first real change in the opening ten seconds of the video.
9. **Order:** Free choice with a suggested Up next. The question’s two choices are compatible, not alternatives. Recommend the runaway first, but do not prevent other known-object lessons or Expert. Reserve any readiness gate for an activity that genuinely needs verified training; the current hunt quiz does not provide that verification.
10. **Practice set size:** Do not ship six with “four correct” from pipeline labels. Use three independently reviewed real examples and a checklist with explanatory feedback, without a pass score. Include an ambiguous case. If examples are unavailable, say so; do not endlessly ask for six new ones from a small finite dataset.

## Requests to other lanes

No app patch was made in this review. Before implementation, the integrator should approve the narrowed scope and resolve findings 1–4. D/E/B/H need the result and tool-availability contract described in finding 2. F/M/K need the available-height and sheet-return rules in findings 3 and 13. F should resolve the startup budget and phone Lite priority in findings 8–9. These are precise spec changes requested here, not permission to edit another lane’s files.

Validation: `npm run typecheck`, `npm test` (238 passed), and `npm run build` passed. Reviewed the requested report diff for scope; only this review file is intended for commit.
