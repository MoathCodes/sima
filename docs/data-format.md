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
| `catalogue` | Position (`ra`, `dec`, degrees, at decimal year `ep`), motion (`pmra`, `pmdec`, mas/yr, east motion times cos dec) and `parallax` (mas) of the target, used to centre each cutout, and `from`: where the values come from (for example `"Gaia DR3 4472832130942575872 (ESA Gaia archive, gaiadr3.gaia_source)"`). Same values as `src/core/targets.ts`. Cutouts are centred on the position moved by the motion only (parallax is under 0.6″, a tenth of a pixel). |
| `fov`, `size` | Field width the app opens at (arcmin) and cutout side (degrees). |
| `units` | Pixel unit, as text: `"MJy/sr, zodiacal light model (ZODI) subtracted"`. |
| `flagBits` | Flag bit number → name, read from the FLAGS header of the files, as an object keyed by the bit number written as a string (`{"0": "TRANSIENT", …, "21": "SOURCE", …}`). Newer files name bits as `MSKNnnnn` (name) and `MSKMnnnn` (mask) pairs, older ones as `MP_<name> = bit`; both give the same numbers. |
| `badFlags` | Flag names that make a pixel unfit for measuring (see below). |
| `perDetPerWindow` | How many exposures per detector per visit were kept. |
| `monthly` | `true` when each window is one calendar month of a deep field rather than one survey pass (R Draconis). |
| `frames` | One entry per exposure, in time order (below). |
| `neighbours` | Optional. Gaia DR3 and CatWISE2020 sources near the target's path (below). Without it, the target is measured in every exposure as before. |
| `neighboursFrom` | With `neighbours`: which service answered for each catalogue (`gaia`, `catwise`), e.g. `"ESA Gaia archive TAP (gaiadr3.gaia_source)"` and `"IRSA TAP (catwise_2020)"`. VizieR at CfA is the fallback. The same columns under other names. |

Each entry of `frames`:

| Field | Meaning |
|---|---|
| `id` | Observation ID plus detector, as in the IRSA file name, e.g. `2025W33_2C_0321_3D6`. |
| `det` | Detector, 1 to 6. |
| `mjd`, `dateObs` | Middle of the exposure (MJD-AVG, UTC) and the same as text (DATE-AVG). |
| `release` | IRSA collection, e.g. `spherex_qr3` or `spherex_dr1_deep`. Shown on screen as "QR3", "DR1". |
| `pipeline` | Pipeline version from the file name, e.g. `l2b-v27-2026-228`. |
| `url` | The full Level 2 file at IRSA. Shown as the "View the full file" link and used for credit. |
| `cutout` | The exact cutout request that was downloaded (`url?center=RA,DEC&size=DEG`). |
| `exptime` | Exposure time, seconds (XPOSURE). |
| `w`, `h` | Cutout width and height in pixels. Not always square: cutouts are clipped at detector edges. |
| `offset` | Byte offset of this frame inside the decompressed `frames.bin`. |
| `lam`, `bw` | Central wavelength and bandwidth (µm) at the target's position in this exposure. |
| `wcs` | Sky ↔ pixel mapping (below): `crval`, `crpix`, `cd`. |
| `wcsErr` | Largest difference between `wcs` and the full pipeline WCS inside the cutout, arcsec. |
| `zodi` | Median of the zodiacal light model that was subtracted, MJy/sr. `null` if the plane has no value. |
| `sigma` | Typical pixel noise: square root of the median VARIANCE of usable pixels, MJy/sr. `null` if no pixel is usable. |
| `omega` | Median pixel solid angle (OMEGA_MEDIAN), arcsec². `null` if the header lacks it. |
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
and `cd` = [CD1_1, CD1_2, CD2_1, CD2_2] in degrees per pixel, so that the standard coordinates
(ξ east, η north, degrees, about `crval`) are `ξ = CD1_1·(x − crpix[0]) + CD1_2·(y − crpix[1])` and
`η = CD2_1·(x − crpix[0]) + CD2_2·(y − crpix[1])`. Pixel (0, 0) is the centre of the first stored
pixel (0-based, unlike FITS); `crpix` is the centre of the cutout and `crval` the sky there. The
pipeline's own WCS adds distortion terms (TAN-SIP); the script fits this plain projection to it over a
9 × 9 grid across the cutout and records the worst mismatch in `wcsErr` (at most 0.09″ for 6′ cutouts
and 0.34″ for 12′ ones in the shipped data, against 6.15″ pixels).
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
- In the five targets as baked on 2026-11-14, DICHROIC is set within 20 pixels of the target in
  6 of 445 exposures; SATELLITE_HALO is set in none.
- PHANTOM (bit 4) and REFERENCE (bit 5) appear only in the headers of older files and are not in the
  current table (today's DR1 and QR3 headers do not name them). Phantom pixels and reference rows sit
  outside the 2040 × 2040 science image, and no pixel in the five baked targets has either bit set
  (all 445 exposures checked), so they stay out of the list.

**Visits.** SPHEREx sweeps each part of the sky about every six months. Exposures are grouped into
visit windows wherever there is a gap of more than 40 days. Near the ecliptic poles one sweep is
several short visits weeks apart, each seeing the target in only two detectors; the 40-day rule keeps
them together so a window usually has all six detectors.

**R Draconis: months instead of passes.** R Draconis lies in SPHEREx's northern deep field, which is
seen almost every month, so it also gets the deep-field collections (`spherex_dr1_deep`,
`spherex_qr3_deep`; `deep=True` in the script). With the 40-day rule all its months would merge into
one window, so its windows are calendar months (UTC) instead (`monthly=True`, and `monthly` in
`frames.json`). Most months see the star in one or two detector pairs (D1/D4, D2/D5 or D3/D6; June
2025 has all six), so the cap counts only the detectors a window has, and the viewer skips months with
no exposure in the detector on screen (`emptyPasses` in `src/viewer/state.ts`). Result on 2026-11-14:
18 months, April 2025 to September 2026, 3 exposures per detector per month (lowered from 4 to stay
under its cap of 150), 144 frames, 3.77 MB, from all four collections. A same-colour partner exists in
78% of the other months that have the detector. How much the star changes is for the viewer to
measure on these frames (SPEC 7.3).

**How many frames.** For each window and detector the script keeps up to 4 exposures
(`PER_DET_PER_WINDOW`), so at most 24 per window and, with three or four windows, 70 to 96 per target.
If a target has too many windows for its cap (`MAX_FRAMES_PER_TARGET`, 96; 150 for R Draconis), fewer
per window are kept, then evenly spaced windows dropped (keeping the first and the last). An exposure
is skipped if the target lies within 5 pixels of the cutout edge (cutouts are clipped at detector
edges); the next backup of the same window and detector takes its place. Cutouts are the field width
plus 0.01°: 0.11° (about 64 pixels) for 6′ fields and 0.21° (about 123 pixels) for 12′ fields. Field
sizes (`fov` in `TARGETS`): 6′ for Barnard's Star, WISE 0855 and RW Aurigae; 12′ for Epsilon Indi B
and R Draconis.

**Which exposures: the same colour in every pass.** Each exposure sees the target at its own
wavelength, so exposures picked only by time rarely match in colour between passes. The script picks
them by colour instead (`colour_order`). For each detector it chooses a wavelength found in the most
windows, then the next one found in the most windows and farthest from those already chosen, until it
has 4; each window gives its exposure closest to each chosen wavelength. Backups for downloads that
fail come in order of closeness to a chosen wavelength. The plan aims within 0.3 channel widths
(`PLAN_SAME_COLOUR`), inside the viewer's half-width rule, to leave room for the estimate's error.

The wavelength is estimated before any pixels are downloaded (`estimate_lam`), at no extra request
per exposure:

1. The search result's footprint (the plane table's `poly`, the same four corners as ObsCore's
   `s_region`) gives where the target falls on the 2040 × 2040 detector. The corners are the outer
   edges of pixels (0, 0), (2039, 0), (2039, 2039) and (0, 2039), in that order (checked against the
   full-frame WCS of a Level 2 file); a projective map between them in the tangent plane leaves out
   only the small distortion terms. A channel is about 120 pixels wide.
2. The detector's wavelength table gives the wavelength there. One table per detector and release is
   kept (`wave/wave-D<n>-plan-<release>.npz` in the cache, about 2 KB each), read once from the end of
   one file (below).

Across the 445 exposures baked on 2026-11-14 the estimate was within 0.06 channel widths of the
value read from each file (median 0.01 to 0.04, depending on the target). The value stored in `lam`
is still the one read for the downloaded file.

Result, baked on 2026-11-14 (7.96 MB in all):

| Target | Frames | Windows | Dates (UTC) | Releases (frames) | `frames.bin.gz` | Same-colour partner |
|---|---|---|---|---|---|---|
| Barnard's Star | 72 | 3 | 2025-08-15 to 2026-09-02 | DR1 48, QR3 24 | 0.55 MB | 97% |
| Epsilon Indi B | 87 | 4 | 2025-04-24 to 2026-10-02 | DR1 71, QR3 16 | 2.49 MB | 85% |
| WISE 0855−0714 | 70 | 3 | 2025-05-05 to 2026-05-14 | DR1 70 | 0.58 MB | 63% |
| RW Aurigae | 72 | 3 | 2025-09-01 to 2026-09-16 | DR1 48, QR3 24 | 0.57 MB | 90% |
| R Draconis | 144 | 18 months | 2025-04-27 to 2026-09-25 | DR1 62, DR1 deep 52, QR3 18, QR3 deep 12 | 3.77 MB | 78% |

"Same-colour partner" is the share of pairs (an exposure, another window that has its detector) where
that other window has an exposure within half a channel width of it. The earlier build measured 26%
on average when exposures were picked evenly in time (Quick Release 2, now retired). WISE 0855 has no
QR3 exposures yet: its passes so far are about six months apart (May 2025, October–November 2025
and April–May 2026), and the next one is not released. Every detector has 11 to 16
exposures of each six-monthly target (WISE 0855: 12 in D5, 11 in D6, for stacking).

**Wavelength.** Each detector has a filter whose wavelength changes along the image's y axis, so the
same star is seen at a different wavelength in every exposure. The value is read from the WCS-WAVE
lookup table (FITS `-TAB`: index vectors `X` (9 points) and `Y` (14 points) in full-detector pixels,
1-based, and bilinear interpolation of `VALUES`, as the archive documentation describes) at the
target's predicted pixel. The cutout header's `CRPIX1W`/`CRPIX2W` give the cutout's offset on the
detector. The result matches astropy's own lookup-table reader exactly (a test checks this).
(Astropy's reader also applies the image distortion terms to the wavelength axis when they are
present; they have to be removed first, `wcs.sip = None`.)

The table is the last extension of every file, after a 4 MB PSF table. So:

- each cutout download stops once IMAGE, FLAGS, VARIANCE and ZODI have arrived (about 100 KB for a 6′
  cutout, 400 KB for 12′), and
- the table itself is read with one byte-range request for the last 11,520 bytes of the full Level 2
  file (IRSA's file server answers ranges; WCS-WAVE is the last 5,760 bytes). One table per detector
  and spectral calibration (the `[CALIB] spectral_wcs <id>` line in the cutout's HISTORY) is kept in
  the cache as `wave/wave-D<n>-<id>.npz`.

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
uv venv .venv && uv pip install -r scripts/requirements.txt    # once
.venv/bin/python scripts/prebake.py --plan          # search and plan only
.venv/bin/python scripts/prebake.py                 # all five targets
.venv/bin/python scripts/prebake.py barnard         # one target
```

**Finding exposures.** One TAP query per release, all at once, as in IRSA's SPHEREx cutout notebook:

```
SELECT o.observationid, p.energy_bandpassname, p.time_bounds_lower, p.time_bounds_upper,
       p.time_exposure, p.poly, a.uri
FROM spherex.artifact a
JOIN spherex.plane p ON a.planeid = p.planeid
JOIN spherex.observation o ON p.obsid = o.obsid
WHERE o.collection = '<release>' AND a.producttype = 'science'
  AND 1 = CONTAINS(POINT('ICRS', <ra>, <dec>), p.poly)
```

at `https://irsa.ipac.caltech.edu/TAP/sync`, searched at the target's position in 2026.0. `uri` is the
Level 2 file (`ibe/data/spherex/<release>/level2/…fits`); the cutout is that address plus
`?center=<ra>,<dec>&size=<deg>`, centred on the target's position at the exposure's own date. An
exposure found in two releases is kept from the first in the list. The queries run in parallel and
take about 10 to 30 s (the WISE 0855 search took 180 s while IRSA was busy, including the check of
IRSA's collection list that runs when a release finds nothing).

Collections, visit grouping, the per-detector count, the cap, the cutout margin and the network
settings are all in the configuration block at the top of the script. New data releases arrive
often: add the collection to `RELEASES` and run again. On 2026-11-12 IRSA retired `spherex_qr2` and
replaced it with `spherex_dr1` (the first year, reprocessed with pipeline v27); the switch was that
one line and a re-run. If a collection in `RELEASES` finds nothing and IRSA no longer lists it, the
script says so in its log with the collections IRSA lists now (`release_note`; IRSA's list comes from
`SELECT DISTINCT collection FROM spherex.observation`). On 2026-11-14 IRSA listed `spherex_dr1`,
`spherex_dr1_cal`, `spherex_dr1_deep`, `spherex_qr3` and `spherex_qr3_deep`.

Raw cutouts, wavelength tables and query answers are cached in `~/.cache/sima-rebuild/irsa`
(`--cache` or `SIMA_CACHE` to change it; searches are reused for 12 hours, catalogue answers for 30
days), so a re-run only downloads what is new, and with no new data it writes identical frame files
(only the date in `manifest.json` changes). Requests are anonymous with the generic User-Agent
`sima-sky-viewer/1.0`, at most 8 at a time, and busy replies (HTTP 503, often one request in five)
are retried with growing waits (2, 4, 8, 15, 30, 60 s). The whole bake of the five targets took about
19 minutes on 2026-11-14, with IRSA answering about one cutout request in five with 503.

**Neighbours.** Gaia DR3 from the ESA Gaia archive TAP (`gaiadr3.gaia_source`) and CatWISE2020 from
IRSA TAP (`catwise_2020`), one cone each holding the target's track and its catalogue positions plus
100″, then filtered as described under `neighbours`. VizieR at CfA is the fallback; on 2026-11-14 it
answered CatWISE queries with no rows even where IRSA lists sources, so an empty fallback answer
counts as a failure and the `neighbours` block is then left out (never written empty).

Credit: SPHEREx data from the NASA/IPAC Infrared Science Archive (IRSA), Caltech/IPAC.
