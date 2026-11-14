# Picture tools: what each one does

The picture tools sit in the panel opened by the sliders button beside the frame. They have four tabs:
**Picture**, **Clean up**, **Find changes** and **Layers**. Newcomers never need to open the panel.
The default look is the same as before the tools existed.

Every tool here changes how the pixels are **shown or combined**. None of them adds light that was
not recorded. When any clean-up step is on, the corner label says **Processed:** and lists the steps.
The **Original** button on the picture (and the `\` key) shows the pixels as recorded with one press.

**Newcomers (Explore).** Settings kept in this browser belong to the Measure tools: the Explore game
always shows the default look. Only a shared link with `pic=` brings its settings into Explore, and
then the **Original** button and the `\` key are offered there too, so the pixels as recorded are
still one press away. (WiseView keeps each viewer's settings in its own tool the same way.)

The code is in `src/core/display.ts`, `src/core/filters.ts`, `src/core/detect.ts`,
`src/core/stats.ts` and `src/core/picture.ts`. These files do not touch the page, so the tests in
`tests/tools.test.ts` run them directly in Node. The panel itself is `src/viewer/tools.ts`.

## Picture tab: how pixel values become brightness

These steps follow SAOImage DS9, the standard viewer in astronomy.

1. **Limits** pick the darkest and brightest value to show.
   - *Noise based* (default): from the sky level up to a fixed number of noise units above it. The
     number depends on the stretch, so faint things stay visible.
   - *zscale*: the IRAF method. Fit a line to the sorted pixel values and keep the part near the
     middle. Good for faint sky.
   - *99.5%*: clip the brightest 0.5% and darkest 0.5% of pixels.
   - *Min to max*: the full range. Bright stars make everything else dark.
   - *Custom*: your own black and white, in noise units above the sky. Drag the two handles on the
     histogram under the choices, or type the numbers. Typed numbers are kept in range (black from
     −50, white up to 100,000 and always above black), and the boxes show the values in force. The
     line under the boxes says what one noise unit is in µJy for the picture on screen. Noise units make one setting suit every date and
     detector, which is why there is no separate setting per detector.

   The **histogram** shows the pixel values of the picture on screen on an asinh axis (so the sky, a
   few units, and bright stars, thousands, both get room), with the black and white points in force
   for any of the five choices. This follows DS9's scale dialog and Lightroom's histogram.
2. **Stretch** maps the range to 0..1: linear, square root, log (a = 1000), asinh (softening 500)
   or histogram equalisation. The default asinh with noise-based limits gives exactly the old look.
3. **Brightness and contrast** move and steepen the curve, like DS9's bias and contrast.
   Double-click a slider to reset it.
4. **Colour map**: Band (the detector's own colour), Thermal (inferno), Mono (grey) and Viridis.
   Thermal and Viridis are perceptually even, so equal steps in value look like equal steps in
   brightness. **Invert** turns dark sky white, which helps with faint smudges.
5. **Color view mix** (the Color button, all six detectors): choose which detectors make red, green
   and blue, or leave one out, as with DS9's RGB frames or Aladin's RGB tool. Each colour is the mean
   of the tone-mapped pictures of its detectors. The default puts D5 and D6 in red, D3 and D4 in
   green, D1 and D2 in blue. A changed mix is named in the frame's corner ("Color: red D5 D6, …").
   There is no separate stretch per detector: the limits are in noise units, so one setting suits
   every detector.

Speed: each setting builds a 16,384-step lookup table once, so redrawing is one table lookup per
pixel.

## Clean up tab: noise reduction

Each step is off by default and switches on by itself. They run in this order.

- **Remove background**: the SExtractor and photutils method. Split the picture into boxes (a third
  of the picture across, between 4 and 16 pixels), find each box's sky with 3-sigma clipping, smooth
  the box values with a 3 × 3 median, and subtract a smooth surface between them. *Limit*: a large
  galaxy or nebula is partly removed as if it were sky.
- **3 × 3 median filter**: each pixel becomes the median of itself and its 8 neighbours. Removes
  single hot pixels and cosmic-ray hits. *Limit*: SPHEREx stars are about one 6″ pixel wide, so it
  can also remove faint stars and movers, not just hot pixels. The panel says so, and while it is on
  in the Difference or Two dates view the picture's corner says "The median filter can erase faint
  stars and movers here".
- **Smooth**: a Gaussian blur of 0.5, 1 or 2 pixels. Flagged pixels are left out, not blurred in.
  *Limit*: faint spread-out things get easier to see; close pairs merge.
- **Brightness match** (on by default): exposures from different dates are scaled to the same sky
  level before blinking. Off shows each exposure as recorded.
- **Combine a pass** (mean, median or sigma clip): how the several exposures of one survey pass
  become one picture. Sigma clip drops values more than 3 robust standard deviations from the
  median (robust = 1.4826 × the median absolute deviation), then takes the mean. Median and sigma
  clip remove satellite trails and cosmic rays that appear in only one exposure.

While **Original** is on, the Clean up tab keeps your switches but dims them and says "Original is
on: these steps are paused", with a link to turn Original off.

**Reset all** returns every setting to the default: the picture, the clean-up, the change search's
threshold, and the candidate list's filter and order.

## Find changes tab: the change search

The search compares the dates in one detector and lists places where the sky changed. Two methods
run, because each misses what the other sees.

### 1. Difference pictures (for faint things that appear, fade or jump)

This is the difference-imaging idea of Backyard Worlds and survey pipelines (ZTF, Pan-STARRS), in a
simplified form. Code: `src/core/detect.ts`.

1. **One picture per date** (`prepareDate`). Each survey pass is combined with sigma clipping, then
   its background is removed. Pixels that are flagged on every exposure, saturated on any, not covered
   on every date, or far below the sky (below −10 noise units) are masked.
2. **A reference for each date.** With fewer than five dates, the median of the *other* dates
   (leave-one-out), so a source on one date does not hide itself. From five dates up, the median of
   *all* dates (one odd date cannot move a median of five).
3. **The longest baseline.** The last date is also compared directly with the first. A slow mover
   has moved furthest there, while a median of three or four dates half-hides it.
4. **Difference** = this date minus its reference.
5. **Matched filter.** The difference is smoothed with the point-source shape (Gaussian, 1 pixel)
   and divided by its noise, measured robustly (1.4826 × median absolute deviation). An extra term,
   20% of the reference brightness plus the **glare** (below), is added near bright stars, because
   subtracting a bright star never leaves exactly zero.
6. **Spots and pairs.** Peaks above the threshold (default 5× the noise, slider 3 to 10) are spots.
   A bright spot within 6 pixels of a dark one on the same comparison is one **Moved?** pair. Each
   half of a pair may be as weak as 3× the noise when the two together pass the threshold: noise
   rarely puts a bright and a dark spot side by side. The two ends of a small move sit about two star
   widths apart, so "Ends apart" is the most it moved, not the move itself.
7. **Linking.** Spots within 1.5 pixels on several dates (or at either end of a pair) are one
   candidate. The same date seen by both comparisons counts once.

**Glare of bright stars** (`glareOf`, `satZone`). The background step takes out the smooth halo of a
bright star, on or just off the patch. That halo changes with wavelength from date to date, so its
leftovers looked like strong changes (round 1 listed 49 of them around Epsilon Indi A as "Strong
signal"). Now the halo (the background's rise above its usual level) joins the noise term, and a spot
where the halo is above 10× the pixel noise, or within reach of a saturated pixel (3 pixels plus 1.5×
the radius of the saturated blob), is marked **likely artefact** and listed after everything else.

### 2. Positions (for stars that creep)

Code: `src/core/movers.ts`. Difference pictures cannot see a bright star creep by a fraction of a
pixel, and skip saturated centres. So every source that stands out of one exposure's noise (peak 5×,
at most 150, brightest first) is measured the way catalogues measure motion:

1. its centre on every exposure of the detector, with the app's own `centroid` (a flux-weighted
   centre, or a round profile fitted around a saturated core), in the exposure's own pixels and then
   on the sky;
2. a weighted straight line through the positions against time, east and north (`lineFit`). Each
   point's error is 1.2 pixels ÷ its signal-to-noise, at least 0.05 pixels;
3. if the points scatter more than their errors allow (chi-square per degree of freedom above 1),
   the errors are widened by that much, so pointing errors, blends and parallax are not taken for
   motion;
4. a star whose motion is at least the threshold times its error is listed as **Moved?**, with its
   motion in ″ a year. A saturated centre is never "Strong signal".

On the shipped data at 5× (6′ patches): Barnard's Star is found in five of six detectors, 10.1 to
10.8″ a year (catalogue 10.4); in D3 its centre is saturated and the fit gives 7.7 ± 2.7, under 5×
its error, so it is not listed and the status line says why. Epsilon Indi B is found in all six,
4.1 to 4.7″ a year (catalogue 4.7). WISE 0855−0714 is found only in D5 (6.6 ± 1.0″ a year by position,
catalogue 8.1, and as a moved pair between the first and last dates); in D1 to D4 and D6 it is too
faint on one exposure, and the status line says so. Of the 461 other stars measured in all six
detectors of the five patches, none reached 5× its error; the largest were 4.7. So at a threshold
under 5, expect a few stars that do not really move.

### What the list says

The status line gives the count, how many are not at a known source and not in glare, how many spots
noise alone would give, and a line about the patch's **own target**: its measured motion, or why it
was not measured (saturated centre, or too faint, with its strength). "What this search can and
cannot see" gives the smallest change: a jump of about 1 pixel (6″) between dates for the pictures,
and k × the median motion error of the measured stars (typically 1–2″ a year here) for positions.

**Known sources.** A candidate within reach of the field's target, a baked neighbour, or a Gaia or
CatWISE source is marked with its name and, when the catalogue has one, its catalogue motion. The reach
is 2 pixels, wider (up to 10 pixels) for stars brighter than magnitude 12.

**Ranking.** Strength in noise units (or motion in units of its error), capped at 50 so one huge
leftover does not outrank everything; raised for candidates seen on several dates and for moved pairs;
lowered for known sources and single-date spots. Likely artefacts always come last.

**Checks on the exposures behind each change** (new in round 3). A date is usually several exposures
combined, and a combined picture of three can keep a cosmic ray that the pipeline did not flag. So
every change that is not a measured mover is checked twice:

1. *Each exposure on its own.* The change is measured on every exposure of its date (that exposure,
   scaled, minus the date's background, minus the reference, flagged pixels left out). If one
   exposure has it at k × its error or more, the others are all under 3 errors, and it stands k
   errors above their mean, it is "on 1 of N exposures only": a **Likely artefact** (a cosmic ray or
   hot pixel, or something that lasted less than a day). WISE and NEOWISE reject one-frame hits the
   same way. *Limit*: a date with one exposure (Same wavelength only) cannot be checked this way.
2. *A fixed aperture on the original exposures* (no resampling, `spotPhotometry`): this date's
   weighted mean minus the other exposures'. It *agrees* when it shows the same sign at 3 errors or
   more, says *no change seen* when it is under 3 errors although the search's change would be at
   least 5 of them, and is *not measured* when every exposure of the date has a flagged pixel in the
   aperture. *No change seen* makes the candidate **Not confirmed**. *Limit*: the two methods use
   different sky estimates, so near a bright star they can disagree for that reason alone.

Both results are in the candidate's details ("Each exposure", "Fixed aperture") and in the CSV.

**A cause fixed at the source.** The resampling onto the patch grid used to mix the value of a
flagged pixel (a cosmic ray) into its unflagged neighbours, which then looked like real light. A
pixel that is not flagged now takes nothing from flagged ones (`realFrame` in `core/real.ts`). On R
Draconis D3 this took the list from 7 candidates (top one a 196× "Possible" that its own chart
contradicted) to 2, both marked.

**Blended movers.** When a listed neighbour is too close to separate on every exposure of the
detector (as for WISE 0855 and a CatWISE neighbour in D5), the target's row says **Blended** and
"motion mixes two stars" instead of a "Moved?" strength, and it is not counted as a candidate.

**Weak: as expected from noise** (round 4). A lone brighter or fainter spot (not a pair, not a
mover, not at a known source) gets the number of noise spots at least as strong as it that the search
would give (the false-alarm formula below, at its own strength). When that is 0.5 or more and the
fixed aperture does not see the change at 5 errors or more, it is **Weak**, listed after the clear
ones, and its details say "Weak: as expected from noise", with that number. A fixed-aperture
"agrees" at 3 errors does not save it: the fixed aperture measures the same exposures, so a noise
spot picked at 3× the noise also shows there at about 3 errors. Only a much clearer fixed-aperture
change says more than the search did. At 5× this almost never happens; at 3×
on a 24′ patch (R Draconis, about 13 noise spots expected) the 3.0 to 3.5× spots are weak, and an
8.7× spot is not. The reviewer also suggested "fixed aperture not clear and light curve steady"; that
was not used, because the light-curve test runs over all exposures and dilutes a change on one date,
so it would hide real one-date changes.

**Near a saturated star** (round 4). When a saturated star lies within 15 pixels of a change on most
exposures, the row says "53″ from a saturated star", the small chart says its glow is in the numbers,
and the CSV has `saturated_star_arcsec`. The confidence does not change: the glare check above
already handles spots inside the star's reach.

**A mover the catalogue says does not move** (round 4). When a moving star sits on a catalogued
source and its measured motion differs from the catalogue motion by more than 3 errors, the
measurement is most likely off (a blend, a pointing error, its colour shifting its centre), not the
star. It is **Not confirmed**, ranked after the rest, and the details say so instead of "it is not
new". Motions are shown with the error to two significant figures (0.52 ± 0.16″ a year), so the
ratio on the row reads true.

**Confidence wording.** *Strong signal*, *Possible*, *Weak*, *Not confirmed* or *Likely artefact*,
and *Known* (or *Blended*) for catalogued sources. Weak comes after the clear ones, then not
confirmed, and likely artefacts last. The panel never says "discovery". Every candidate shows three cutouts (the reference or the
first date, this date, the difference), the date in the frame's own words ("pass 3, 23 Aug 2026"),
what it was compared with, why it was flagged, a small chart, and the line "Not a discovery".

**The date on screen.** The search uses the combined picture of each pass. When the frame shows
single exposures, the candidate says "Found in the combined picture of pass N. The frame shows one
exposure of it" and offers **Show the combined pass**. That turns on **Combine each pass** in Clean
up (a saved setting like any other), so the details then say "this turned on Combine each pass in
Clean up" with **Turn it off**. The date in the list is the date of the
exposure the frame jumps to, so the two agree.

**The small chart under each candidate.** For a mover, its positions along its motion on every
exposure with the fitted line. Otherwise, the light in a fixed 25″ circle (2 pixels in radius) on every exposure of the
detector, ±1 error, with the chi-square "did it change?" test and a weighted trend line (drawn when
its slope is over 3× its error, else the mean). So the evidence is next to the list even where the
panel covers Measure (1366 × 768). Under the chart, rings mark the exposures of the candidate's
date, and the note says how many of them were left out for a flagged pixel in the circle.
**Open in Measure** opens the full view: for a candidate at the patch's own target (Barnard's Star,
say) it opens that target's measurement; for a Gaia or CatWISE source it opens that source as a click
on it would; only an unknown spot is measured as a fixed spot. In a narrow window the panel steps
aside and the marks stay on the picture.

**Download the list (CSV)** under the list saves every candidate: rank, verdict, kind, date, RA and
Dec, strength, change and error, motion and error, dates seen, known source, the glare and
bright-star flags, both checks, and your mark. The first lines (starting with `#`) say what the file
is, that these are candidates and not discoveries, the detector, threshold and dates, and where the
pixels came from.

**The list first.** The status above the list is one line: "20 candidates in D3 · 9 unexplained ·
about 13 expected from noise". The target's line, the noise estimate and the limits fold under
"About <target>, noise and limits". Picking a candidate scrolls its cutouts and facts into view, so
at 1366 × 768 they are not left below the panel's edge.

**Working through the list** (as in Fritz and Zooniverse). Each candidate can be marked **Checked**
or **Reject** (keys C and X in the list; the next one is selected). Marks are kept in this browser per
patch, detector and place. **Hide known, ruled out and rejected** (ruled out: weak, not confirmed or likely artefact) and **Strongest / By date** order the
list; both are remembered (changing a picture setting no longer forgets them). Up to 100 rows are listed.

**False alarms.** The status line says how many spots noise alone would give at the threshold ("fewer
than 0.1" when tiny):
(pixels searched ÷ pixels per beam) × 2 × the Gaussian tail chance at k, with a beam of
4π × 2 × psf² pixels. At 5 noise units this is under 0.1 for a typical patch. Real data have
non-Gaussian noise, so the true number is higher.

**Speed.** The search runs in small steps: every exposure is resampled in its own step, then the
brightness match, each date, each comparison, and positions in slices of about 20 ms. Steps run back
to back for about 25 ms, then the page gets a turn to draw and answer (round 4; before, it paused
after every step and so waited behind every redraw of the sky). "About … noise and limits" says how
long the search took and the longest time it held the page. Measured in headless Chromium at
1366 × 768 on a shared machine with a load average of 12 to 13, where the idle page already makes
about 13 tasks a second of 60 to 90 ms (software sky drawing):

| | before round 4 | round 4 |
| --- | --- | --- |
| R Draconis, D3, 12′, threshold 3×: whole search | 15.2 s | 6.7 s |
| longest hold by the search | 54 ms | 76 ms |
| tasks over 100 ms during the search | 0 | 0 |

Epsilon Indi B, D3, 12′, 3× now takes about 1.5 s.

A clean-up switch no longer rebuilds Measure (its numbers do not depend on how the picture is
drawn; only its Cutouts tab is redrawn). On R Draconis the first time a step is switched on it takes
60 to 75 ms (the step is computed once and kept); after that 20 to 35 ms. The next frame still comes
110 to 170 ms later on this machine because of the sky's own drawing. A later run of the same search
took 4.3 s, longest hold 57 ms, so the search time depends mostly on how busy the machine is. If you change detector or threshold while the search runs, it stops and starts again.
**Combine each pass** no longer restarts the search: the search compares combined passes whatever the
frame shows.

**What it does not do.** It does not check asteroids, does not fit parallax, and does not know about
stars missing from the catalogues. Variable stars (for example R Dra) give many real but expected
changes.

## Measure this spot: light curve, spectrum and tests

- **Aperture photometry** at a fixed sky position on every real exposure: 2-pixel radius, sky from a
  ring 6 to 12 pixels out. The same aperture as the target's own measurements, so numbers compare.
  Exposures with a flagged pixel in the aperture are left out.
- **Light curve** per detector, with ±1 error bars and the weighted mean as a dashed line.
- **"Did it change?"** For each detector, chi-square of the points about the weighted mean, and the
  chance p of a value that large from noise alone (Numerical Recipes, chapter 6 and 15). Small p: it
  changed, or the error bars are too small. p very close to 1: the error bars are probably too big.
- **Spectrum** on the 102 SPHEREx channels (6 detectors × 17). Each exposure goes to its nearest
  channel; each channel shows the weighted mean and its error. Points under 2 sigma are drawn hollow.
- **Trend.** A weighted straight-line fit (`lineFit`, errors on both terms) per detector. The slope
  is given with its error in one unit (µJy or mJy a year, whichever suits the larger), and drawn as a
  solid line when it is more than 3× its error.
- **Near a saturated star** (round 4). The aperture and the sky ring (6 to 12 pixels out) can sit in
  a bright star's halo. Each exposure records the distance to the nearest saturated pixel within 15
  pixels (`nearestFlag`); when there is one, Measure and the candidate's chart say "A saturated star
  about 58″ away (on 40 of 57 exposures) adds its glow to the aperture and the sky ring here, so these
  numbers include its light". As ESASky shows how near a bright source a measurement is.

*Limit*: within one detector each exposure sees a slightly different wavelength, so a source with a
steep spectrum can look variable. A moving source walks out of the fixed aperture.

## The value under the pointer

Round 4, as DS9's pixel readout. In Expert, pointing at the picture shows, beside the pointer, that
pixel's value in µJy, how many times the noise it is above the sky, "saturated", "flagged pixel" or
"no data here" when the exposure says so, its RA and Dec, and its pixel. In the Difference view the
value is the change against the typical sky. The value is the one drawn, so with clean-up on the
line says "(processed)". The Color view asks for one detector.

## Measure, Brightness tab of a target: error bars and "did it change?"

Round 4. The target's brightness curve (`realCurve` in `core/fit.ts`) is in magnitudes against each
detector's own average, with the star's colour taken out by a straight line in wavelength.

- **Error bars.** Each exposure's ±1 error in magnitudes is 1.0857 × flux error ÷ flux, from the pixel
  noise. The outer glow of a saturated star has no error of its own, so there the error is the
  detector's scatter within a visit, and the note says so.
- **Visit averages** (squares, with their errors): the weighted mean of each visit's exposures.
- **"Did it change?"** (`visitTest` in `core/stats.ts`): chi-square of the visit averages about their
  weighted mean, with p, in the same words as the spot chart. Before that, if the exposures of one
  visit scatter more than their error bars allow (chi-square per degree of freedom above 1, counting
  the colour slope as fitted), the averages' errors are widened by that much. So a change must stand
  out of the scatter seen within one visit, not just out of the pixel noise. This is the same
  widening the position fit uses.
- **Trend**: a weighted straight line through the visit averages, "fading 0.05 ± 0.01 mag a year" or
  "brightening …", drawn when its slope is over 3× its error.
- A star with a catalogue pulsation period (R Draconis, a Mira) gets no straight trend: the note
  says to see its cycle under Folded instead.
- The brightness CSV of a saturated variable gains `delta_mag_err`.

*Limit*: each exposure sees a slightly different wavelength, and the colour line is only a straight
line, so a star with a curved spectrum leaves some colour in the points; the widening absorbs part of
it. A change here is a reason to look, not proof.

**Download these numbers (CSV)** under the chart saves what Measure measured: one row per exposure
with its id, date, MJD, detector, wavelength, channel (0 to 16, as in the 102-channel spectrum),
flux and error in µJy, and whether it was saturated. For a target, exposures with a flagged pixel in
the aperture are added as lower limits (`lower_limit = 1`). A variable star whose core is flagged on
every exposure (R Draconis) has no total brightness at all, so its file holds what the Brightness tab
draws: the change in magnitude on each exposure, read from the outer glow, with each detector's
scatter within a visit in the notes (there is no error per point). The link shows only when there is a
number to save. The `#` lines say how it was measured and
that it was computed by Sima from SPHEREx Level 2 images, not an official SPHEREx measurement; on a
simulated patch they say SIMULATED, and a `model_uJy` column gives what the simulation put there.
The format is plain CSV (RFC 4180) that TOPCAT, a spreadsheet or `pandas.read_csv(…, comment='#')`
read directly (`core/csv.ts`).

## Settings: remembered, resettable, shareable

- The panel's settings are saved in this browser (`localStorage` key `sima.tools`) and come back on
  reload.
- They are added to the share link as `pic=`, for example `pic=st.log_lim.zscale_cm.mono_inv.1`,
  or `lim.custom_lo.0_hi.41.3` for custom black and white points. The change search's threshold
  goes in too (`fk.3`), so whoever opens the link gets the same candidate list, as WiseView puts every
  viewing parameter in its URL. A threshold stored by an older version (`k`) is still read. Only settings that differ from the
  default are written. A link's settings win over saved ones. Unknown values in a link are left at
  their defaults, and the page says so in a short note and in the panel's footer, naming them in
  words ("stretch, smoothing, white point").
- The candidate list's order, its filter and the Checked / Reject marks are kept in this browser too.
- **Original** is never saved, so a page never opens with clean-up silently turned off. It turns
  clean-up off, not the display: the corner label says which display settings are kept.
- The picture tabs follow the usual keyboard pattern: arrow keys, Home and End move between tabs.

## Speed of the panels

Opening Measure on R Draconis (54 visits) used to hold the page for 1.5 to 2.4 s in one go, because
the six detector thumbnails resampled every exposure of every detector at once. Now the thumbnails
are painted one after another, the detector on screen first, and each detector's exposures are
resampled in slices of about 12 ms; the sky level of each exposure is sorted in a typed array. In
headless Chromium at 1366 × 768 the longest task after pressing Measure is now 117 ms on R Draconis,
135 ms on Epsilon Indi B and 199 ms on Barnard's Star; the page's own playback and sky drawing
already make tasks of 60 to 160 ms there before Measure is pressed. A clean-up switch no longer
waits for the thumbnails either.

## How this compares with other tools

| Tool | What we took | What we left out |
| --- | --- | --- |
| SAOImage DS9 | Limits (zscale, percent, min–max), stretches, bias and contrast, colour maps, RGB mix, saving numbers | Region files, contours, many more colour maps |
| Aladin and ESASky | Catalogue overlays, all-sky backdrop, tables to download | Multi-mission picture overlays, VOTable and SAMP |
| WiseView and Backyard Worlds | Blinking dates, difference view, "moved" pairs | Proper-motion fitting, user voting |
| Photutils and SExtractor | Mesh background, sigma clipping, robust noise | Source deblending, PSF photometry |
| Lightroom | One-click reset, live preview, double-click to reset a slider, histogram | Masks, local edits, history |
| Gaia, CatWISE | Motion from positions with widened errors | Parallax, full astrometric solution |
| ZTF Fritz, Zooniverse | Triplet cutouts, Checked / Reject with keys, hide what is known, rule-based real-or-bogus checks, CSV | Machine-learned real-or-bogus score |

The tools are tested in `tests/tools.test.ts`: the default look matches the old one, every stretch
rises steadily, zscale and 99.5% ignore a few bright stars, the background step removes a slope,
sigma clipping removes an outlier, the chi-square tail matches known values, the search finds a
new, a steady and a moving source in a test patch, pure noise gives few false alarms, and settings
survive encoding into a link. `tests/analysis.test.ts` (round 4) covers the visit test (a steady
source passes, a jump fails, a fade is recovered, scatter within a visit widens the errors), the
rounding of a value to its error, the nearest saturated pixel, weak spots and their rank, a mover the
catalogue says is still, and the threshold in links and older storage; `tests/real.test.ts` checks
that the glow curve carries errors and a test. `tests/detect.test.ts` covers the round 2 additions: a faint star
moving 1.5 pixels between the first and last of three dates is found as moved against the first
date; weak pairs pass only together; the glare zone grows with the saturated star; a change in glare
is a likely artefact and ranks last; a ripple in a bright halo is not reported; a bright star moving
1.5 pixels a year is measured from its positions and a still one is not; scattered points widen the
error; custom limits and the histogram behave. Round 3 adds: a cosmic ray on one exposure of a date
is told from a change on all of them; flagged pixels are left out of one exposure's change; the
fixed-aperture check agrees, contradicts or says it cannot look; checked candidates rank as they
should; tables leave as CSV with quoting; the Color view mix survives a link and is never empty
(`tests/tools.test.ts`); and a flagged pixel no longer leaks into its neighbours when an exposure is
resampled (`tests/real.test.ts`).
