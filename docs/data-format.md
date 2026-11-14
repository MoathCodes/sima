# Real SPHEREx data: file format

The viewer shows real SPHEREx pictures for the five challenge targets. They are small cutouts of
SPHEREx Level 2 images from NASA's IRSA archive, downloaded ahead of time by `scripts/prebake.py` and
stored under `public/data/`. Anything else the viewer shows (a typed coordinate, the practice star,
Planet X) is simulated, and the picture says so, unless the live service fetches real frames for a
typed coordinate in this same format (`docs/live-service.md`).

The TypeScript types for everything below are in `src/core/types.ts` (`DataIndex`, `TargetData`,
`FrameMeta`, `Wcs`). The decoder is `decodeFrames` in `src/core/real.ts`.

## Files

```
public/data/manifest.json             which targets have data
public/data/<key>/frames.json         one target: settings and one entry per exposure
public/data/<key>/frames.bin.gz       one target: the pixels of every exposure, gzip-compressed
```

`<key>` is the target key used everywhere in the app (`barnard`, `eps-indi-b`, `wise-0855`,
`rw-aur`, `r-dra`).

### manifest.json

| Field | Meaning |
|---|---|
| `version` | Format version, now 1. |
| `generated` | When the script last ran (UTC). |
| `source`, `collections` | Archive and IRSA image collections that were searched. |
| `targets.<key>` | `path` (folder, ends in `/`), `label`, `frames` (count), `bytes` (size of `frames.bin.gz`), `releases` (collections the kept frames came from), `windows` (visits). |

### frames.json

| Field | Meaning |
|---|---|
| `catalogue` | Position (`ra`, `dec`, degrees, at decimal year `ep`) and motion (`pmra`, `pmdec`, mas/yr) used to centre each cutout. Same values as `src/core/targets.ts`. |
| `fov`, `size` | Field width the app opens at (arcmin) and cutout side (degrees). |
| `units` | Pixel unit: MJy/sr, with the zodiacal light model subtracted. |
| `flagBits` | Flag bit number → name, read from the FLAGS header of the files. Newer files name bits as `MSKNn`/`MSKMn` pairs, older ones as `MP_<name> = bit`; both give the same numbers. |
| `badFlags` | Flag names that make a pixel unfit for measuring (see below). |
| `perDetPerWindow` | How many exposures per detector per visit were kept. |
| `monthly` | `true` when each window is one calendar month of a deep field rather than one survey pass (R Draconis). |
| `frames` | One entry per exposure, in time order (below). |
| `neighbours` | Optional. Gaia DR3 and CatWISE2020 sources near the target's path (below). Without it, the target is measured in every exposure as before. |
| `neighboursFrom` | With `neighbours`: which service answered for each catalogue (`gaia`, `catwise`), e.g. `"ESA Gaia archive TAP (gaiadr3.gaia_source)"` and `"IRSA TAP (catwise_2020)"`. VizieR at CfA is the fallback. The same columns under other names. |

Each entry of `frames`:

| Field | Meaning |
|---|---|
| `id` | Observation ID plus detector, as in the IRSA file name, e.g. `2026W39_1A_0371_1D2`. |
| `det` | Detector, 1 to 6. |
| `mjd`, `dateObs` | Middle of the exposure (MJD-AVG, UTC) and the same as text. |
| `release` | IRSA collection, e.g. `spherex_qr3`. Shown on screen as "QR3". |
| `pipeline` | Pipeline version from the file name, e.g. `l2b-v27-2026-268`. |
| `url` | The full Level 2 file at IRSA. Shown as the "View the full file" link and used for credit. |
| `cutout` | The exact cutout request that was downloaded (`url?center=RA,DEC&size=DEG`). |
| `exptime` | Exposure time, seconds (XPOSURE). |
| `w`, `h` | Cutout width and height in pixels. Not always square: cutouts are clipped at detector edges. |
| `offset` | Byte offset of this frame inside the decompressed `frames.bin`. |
| `lam`, `bw` | Central wavelength and bandwidth (µm) at the target's position in this exposure. |
| `wcs` | Sky ↔ pixel mapping (below). |
| `wcsErr` | Largest difference between `wcs` and the full pipeline WCS inside the cutout, arcsec. |
| `zodi` | Median of the zodiacal light model that was subtracted, MJy/sr. |
| `sigma` | Typical pixel noise: square root of the median VARIANCE of usable pixels, MJy/sr. |
| `omega` | Median pixel solid angle (OMEGA_MEDIAN), arcsec². |
| `badFrac` | Fraction of the cutout's pixels that carry a bad flag. |
| `window` | Visit window, counting from 0 (below). |

Each entry of `neighbours` (the type is `Neighbour` in `src/core/types.ts`):

| Field | Meaning |
|---|---|
| `cat` | `"gaia"` (Gaia DR3, VizieR `I/355/gaiadr3`) or `"catwise"` (CatWISE2020, `II/365/catwise`). |
| `id` | Catalogue name as shown: `DR3Name` (e.g. `Gaia DR3 5756956644387831296`) or `"CWISE "` + `Name` (e.g. `CWISE J085501.95-071428.2`). |
| `ra`, `dec`, `ep` | Position in degrees at decimal year `ep`: Gaia `RA_ICRS`, `DE_ICRS` at 2016.0; CatWISE `RAPMdeg`, `DEPMdeg` at MJD 57170 (2015.4019), not at the row's `MJD`. |
| `pmra`, `pmdec` | Motion in mas/yr, east motion already times cos dec. CatWISE gives arcsec/yr: multiply by 1000. 0 where the catalogue gives none. |
| `mag` | Gaia `Gmag`; CatWISE `W1mproPM`, or `W2mproPM` if W1 is empty. Leave out a source with neither. |
| `target` | `true` on the target's own entries, else absent: an entry within 2″ (CatWISE: 4″) of the target's catalogue track (the `catalogue` values above) moved to the entry's own `ep`. A fast mover can be listed more than once (WISE 0855 is three times in CatWISE); all of these are its own. CatWISE gets 4″ because WISE images cannot split two sources that close, and it places the pieces of a fast mover a few arcseconds off its path with wrong motions (Epsilon Indi B: 2.7″ and 3.6″). |

Which sources: every entry of either catalogue that comes within 30″ of the target's catalogue track
at some time between the first and last exposure (checking, say, 20 evenly spaced dates), each moved
with its own motion, plus the target's own entries wherever their listed motion takes them (they give
its brightness). No magnitude limit: the viewer decides which ones matter.

What the viewer does with it (`blendedWith` in `src/core/catalog.ts`, used by `measureTarget` in
`src/core/real.ts`): an exposure is not measured if, at its date, a listed neighbour lies within 12.3″
(2 pixels, how far the measurement looks for the target) of where the target should be, and that
neighbour is at most 2.5 mag fainter than the target's own entry in the same catalogue. Where CatWISE
does not list the target (Barnard's Star is too bright for it), the target's Gaia G stands in for W1:
almost every star is at least as bright in W1 as in G, so this never lets through a neighbour the true
W1 would block. Where Gaia does not list the target (WISE 0855 is too cold for it), a Gaia neighbour of
any brightness counts. The viewer then says "not measured" and names the neighbour.

### frames.bin.gz

Gzip of one byte string. For each frame, starting at its `offset`:

1. `w × h` flags, unsigned 32-bit little-endian integers: the original FLAGS bitmask, unchanged.
2. `w × h` pixel values, IEEE half-precision (16-bit) little-endian floats: IMAGE minus ZODI, in MJy/sr.
   NaN where the archive has no value.

Both arrays are row by row, starting with the bottom row of the FITS image (FITS order). Pixel
`(x, y)` is element `y * w + x`.

Half precision keeps about three significant digits. The pixel noise is around 0.02 MJy/sr on a
background near 0.1 to 0.3 MJy/sr, and star peaks go up to a few thousand, so the rounding is far below
the noise everywhere and the range is enough for the brightest stars (the largest half-precision
number is 65504).

If a web server sends the file already unpacked, the loader notices the missing gzip header and reads
it as is.

## Sky ↔ pixel mapping

`wcs` is a plain gnomonic (tangent-plane) projection: `crval` = [RA, Dec] in degrees at pixel `crpix`,
and `cd` = [CD1_1, CD1_2, CD2_1, CD2_2] in degrees per pixel. Pixel (0, 0) is the centre of the first
stored pixel. The pipeline's own WCS adds distortion terms (TAN-SIP); the script fits this plain
projection to it over a 9 × 9 grid across the cutout and records the worst mismatch in `wcsErr`.
`wcsSky2Pix` and `wcsPix2Sky` in `src/core/real.ts` implement it.

## Choices, and why

**Zodiacal light is subtracted before storing.** The archive images include it; it is 40 to 80% of
the background and changes with date and wavelength, so without it every exposure would have a
different background and blinking would flicker. The pipeline's own model (the ZODI plane) is
subtracted and its median is kept in `zodi`, so the viewer can say how much was removed. Storing the
plane as well would double the size for no use in the viewer. What is left after the model (a few
hundredths of MJy/sr) is removed in the browser as the median of the usable pixels of each cutout.

**Bad flags.** A pixel is not used for measuring if it has any of: TRANSIENT, OVERFLOW, SUR_ERROR,
NONFUNC, DICHROIC, MISSING_DATA, HOT, COLD, NONLINEAR, PERSIST, OUTLIER, CROSSTALK, GHOST, GHOST_FPA,
GHOST_EXT, STREAK, BLOOM, SNOWBALL, HALO, SATELLITE_HALO. SOURCE only says a known star is there (it
covers most pixels in crowded fields), and FULLSAMPLE and PHANMISS are informational, so those count
as usable. The list is `BAD_FLAG_NAMES` in the script and is copied into each `frames.json`.

Checked against Table 16 of the SPHEREx Explanatory Supplement (version 2.0, 2026-08-25), which the
IRSA data-product page points to for the flag definitions:

- DICHROIC (bit 7) marks pixels "not usefully calibrateable or of value for photometry", and
  SATELLITE_HALO (bit 29) pixels are "not recommended for use in science analysis". The IRSA Mosaic
  Tool sets both to NaN (section 3.4.3 of the supplement). The IRSA photometry tool does not leave
  DICHROIC pixels out, but warns when one is within 2.5 pixels of a source (section 3.3).
- No file header names bit 29, so the script adds the name itself (`EXTRA_FLAG_BITS`).
- In the five targets as re-baked, DICHROIC is set within 20 pixels of the target in 7 of 373
  exposures; SATELLITE_HALO is set in none.
- PHANTOM (bit 4) and REFERENCE (bit 5) appear only in the headers of older files and are not in the
  current table. Phantom pixels and reference rows sit outside the 2040 × 2040 science image, and no
  pixel in the five baked targets has either bit set, so they stay out of the list.

**Visits.** SPHEREx sweeps each part of the sky about every six months. Exposures are grouped into
visit windows wherever there is a gap of more than 40 days. Near the ecliptic poles one sweep is
several short visits weeks apart, each seeing the target in only two detectors; the 40-day rule keeps
them together so a window usually has all six detectors.

**R Draconis: months instead of passes.** R Draconis lies in SPHEREx's northern deep field, which is
seen almost every month, so it also gets the deep-field collections (`spherex_dr1_deep`,
`spherex_qr3_deep`; `deep=True` in the script). With the 40-day rule all 17 months would merge into one
window, so its windows are calendar months instead (`monthly=True`, and `monthly` in `frames.json`).
Each month sees the star in only one or two detector pairs (D1/D4, D2/D5 or D3/D6), so the cap counts
only the detectors a window has, and the viewer skips months with no exposure in the detector on
screen (`emptyPasses` in `src/viewer/state.ts`). Result: 17 months, up to 3 exposures per detector,
132 frames, 3.44 MB (cap 150). A same-colour partner exists in 72% of the other months that have the
detector. The brightness curve shows the star at its brightest in June 2025, fading to September,
bright again in January and February 2026 and fading in May 2026 (D4 to D6, 0.6 to 0.8 mag from
faintest to brightest). A cycle of 8 to 10 months fits, but the detectors disagree on its exact length
(D6 alone gives about 250 days, all three together about 280; the catalogue says 245.5), because each
sees the star in only 4 to 8 months: this is not a period measurement.

**How many frames.** For each window and detector the script keeps up to 4 exposures
(`PER_DET_PER_WINDOW`), so at most 24 per window and, with three or four windows, 70 to 96 per target. If a target ever had too many windows for the cap of 96 frames
(`MAX_FRAMES_PER_TARGET`), fewer per window would be kept, then evenly spaced windows dropped. An
exposure is skipped if the target lies within 5 pixels of the cutout edge. Cutouts are the field width
plus 0.01°: 0.11° (about 64 pixels) for 6′ fields and 0.21° (about 123 pixels) for 12′ fields.

**Which exposures: the same colour in every pass.** Each exposure sees the target at its own
wavelength, so exposures picked only by time rarely match in colour between passes. The script picks
them by colour instead (`colour_order`). For each detector it chooses a wavelength found in the most
windows, then the next one found in the most windows and farthest from those already chosen, until it
has 4; each window gives its exposure closest to each chosen wavelength. Backups for downloads that
fail come in order of closeness to a chosen wavelength. The plan aims within 0.3 channel widths
(`PLAN_SAME_COLOUR`), inside the viewer's half-width rule, to leave room for the estimate's error.

The wavelength is estimated before any pixels are downloaded (`estimate_lam`), at no extra request
per exposure:

1. The search result's footprint (`s_region`, the four detector corners) gives where the target falls
   on the 2040 × 2040 detector. Checked against 379 cutout headers, this is within 4 pixels across and
   10 pixels along the detector; a channel is about 120 pixels wide.
2. The detector's wavelength table gives the wavelength there. One table per detector and release is
   kept (`plan-wave-D<n>-<release>.npz` in the cache, about 2 KB each), read once from one file. The
   tables of one release agree; D5 and D6 shifted by a fifth of a channel between QR2 and QR3.

Across the 373 previously baked exposures the estimate was within 0.08 channel widths of the value
read from each file. The value stored in `lam` is still the one read from the downloaded file.

Result: an exposure has a same-colour partner in most of the other passes, against 26% when
exposures were picked evenly in time (Quick Release 2 data). With Data Release 1, re-baked on
2026-11-12 with the same caps (5.68 MB in all):

| Target | Picked by time (QR2) | By colour (QR2) | By colour (DR1) | Best the DR1 data allow |
|---|---|---|---|---|
| Barnard's Star | 38% | 100% | 98% | 97% |
| Epsilon Indi B | 24% | 80% | 75% | 69% |
| WISE 0855-0714 | 13% | 63% | 63% | 55% |
| RW Aurigae | 22% | 91% | 90% | 98% |
| R Draconis (survey only) | 35% | 94% | 71% | 63% |

R Draconis dropped because Data Release 1 ends in April 2026: its third pass then has only D3 and D6,
and Quick Release 3 has no survey exposures of it. It now uses monthly deep-field windows instead (see
"R Draconis: months instead of passes" above).

"Best the data allow" is the same share for an average exposure found by the search, counting any
exposure of the other pass. For WISE 0855 and Epsilon Indi B, SPHEREx simply saw the target in fewer
matching colours; a larger cap would not change that.

**Wavelength.** Each detector has a filter whose wavelength changes along the image's y axis, so the
same star is seen at a different wavelength in every exposure. The value is read from the WCS-WAVE
lookup table (bilinear interpolation between control points, as the archive documentation describes)
at the target's predicted pixel. That table sits at the end of each file, after a 4 MB PSF table, so
the script stops each download once IMAGE, FLAGS, VARIANCE and ZODI have arrived (about 135 KB for a
6′ cutout) and fetches
one complete cutout per detector and calibration version to get the table. The result matches
astropy's own lookup-table reader exactly. (Astropy's reader also applies the image distortion terms
to the wavelength axis when they are present; they have to be removed from the header first.)

## How the viewer uses the frames

- **Visits on screen.** Visit k of a window holds the k-th exposure (in time) of each detector in that
  window (`buildRealField`). The six exposures of one visit can be hours to weeks apart; the date
  shown is the date of the exposure on screen. A detector with no exposure at a visit shows an empty,
  flagged picture and says so; nothing is filled in.
- **Same colour** (`colourMatch` in `core/real.ts`). Every exposure sees the target at its own
  wavelength, so two dates in one detector can be two colours. On real fields the picture says the
  wavelength on screen and whether it matches the reference (the comparison date, or the first date
  when blinking). Two exposures count as the same colour when their wavelengths differ by at most half
  a channel width (`bw`): their passbands then share at least half their width. The "Same colour"
  button keeps playback to the exposure closest to the reference wavelength in each pass, and names
  the passes that have none, instead of showing a mismatched one. It filters the visits; it does not
  reorder them.
- **Field grid.** Each exposure is resampled onto the viewer's north-up, east-left grid of 6.15″
  pixels (bilinear between usable pixels) and converted to µJy per pixel, so brightness matching
  (`core/blink.ts`), the combined pictures, Difference, Two dates, Stack and Trail all work unchanged.
  The noise level used for the display stretch is the median `sigma` of each detector.
- **Measuring the target** (`centroid` in `core/real.ts`). Starting from where the catalogue puts the
  target at that exposure's date, the brightest usable pixel within 2 pixels is found, then the
  flux-weighted centre of the usable pixels within 2 pixels of it, repeated until it settles. The
  sky level and noise come from a ring 6 to 12 pixels out. It counts as seen if the brightest pixel is
  5 times the noise above the sky and the total is 5 times its error. If more than a quarter of the
  aperture is flagged (the core of a star bright enough to fill the detector), a round Gaussian is
  fitted to the usable pixels within 5 pixels instead, because a flux-weighted centre would be
  pulled away from the flagged side. An exposure where a listed neighbour is too close to tell apart
  (see `neighbours` above) is left out of every measurement, and the viewer names the neighbour.
- **Motion** (`fitMotion` in `core/fit.ts`). A straight line through the measured sky positions of
  every exposure where the target was seen, refitted once without points more than three times the
  median distance (and at least 1″) off the first line. It needs at least three positions in at
  least two visits; otherwise the viewer says "not measured" and why.
- **Parallax** (`plxFit` in `core/fit.ts`). With three or more visits, position, motion and parallax
  are also fitted together, with Earth's place from a simple formula for the Sun's position
  (`parallaxFactors` in `core/astro.ts`). The error is how much the parallax moves when each visit in
  turn is left out, because exposures in one visit share their errors. The parallax (and the motion
  from this fit) is shown only if it is more than 3 times that error and a fixed shift on the
  detector cannot mimic it: if adding such a shift to the fit more than doubles the parallax error,
  the two cannot be told apart. SPHEREx often sees a star from two opposite directions six months
  apart, exactly when parallax pushes it to opposite sides, so a shift of a few hundredths of a pixel
  looks the same as parallax. Otherwise the straight-line motion is shown and the page says why.
- **Brightness** (`measurements`). The light within 2 pixels of the measured centre, or of the
  predicted position where the target is not seen, in µJy, not corrected for light outside the
  aperture. Exposures with any flagged pixel in the aperture are left out, because the flagged
  pixels are usually the brightest ones. This feeds the spectrum, which builds up as the exposures
  are shown: each one on screen adds its point at its own wavelength. Apertures with a flagged pixel
  appear there only as lower limits (`lowerLimits` in `core/fit.ts`): the light of their usable
  pixels, which leaves out the brightest ones.
- **Outer glow** (`glowTarget` in `core/real.ts`). For a star whose core is flagged as saturated,
  the light in a 3-pixel-wide ring that starts where the flagged core ends (the same ring for every
  exposure of one detector), minus the sky from a ring 6 to 12 pixels further out. It rises and
  falls with the star, but gives no total brightness.
- **Brightness changes** (`realCurve` in `core/fit.ts`). Each exposure sees the star at its own
  wavelength, so each detector is compared only with itself: a straight line in wavelength plus one
  level per visit is fitted to its magnitudes, and the line is taken out. A detector uses the outer
  glow in every exposure if the core is saturated in any of them, otherwise the aperture. It is shown
  only if the scatter within a visit is at most 0.2 mag. Measured this way, Barnard's Star, which
  does not vary, stays within 0.15 mag between visits in the detectors that are kept.

## Running the script

```
pip install -r scripts/requirements.txt
python scripts/prebake.py --plan          # search only
python scripts/prebake.py                 # all five targets
python scripts/prebake.py barnard         # one target
```

Collections, visit grouping, the per-detector count, the cap, the cutout margin and the network
settings are all in the configuration block at the top of the script. New data releases arrive
often: add the collection to `RELEASES` and run again. On 2026-11-12 IRSA retired `spherex_qr2` and
replaced it with `spherex_dr1` (the first year, reprocessed with pipeline v27); the switch was that
one line and a re-run of about nine minutes. If a collection in `RELEASES` finds nothing and IRSA no
longer lists it, the script says so in its log with the collections IRSA lists now (`release_note`). Raw cutouts are cached in the system temp
folder (`--cache` to change it), so a re-run only downloads what is new, and with no new data it writes
identical frame files (only the date in `manifest.json` changes). Requests are anonymous with a generic User-Agent, at most 8 at a time, and busy
replies (HTTP 503, about one request in five) are retried with growing waits.

Credit: SPHEREx data from the NASA/IPAC Infrared Science Archive (IRSA), Caltech/IPAC.
