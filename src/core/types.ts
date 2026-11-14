/**
 * Shared data types: a contract between lanes. Owner: lane B (science core).
 *
 * Units everywhere: degrees for sky positions, arcminutes for field sizes, arcseconds for small
 * angles and position errors, micrometres (µm) for wavelengths, MJD (UTC) for dates, decimal
 * years for catalogue epochs, mas/yr for catalogue motions (the east motion already times
 * cos dec), MJy/sr for raw exposure pixels, µJy per pixel for pictures on the viewer's grid.
 *
 * The file-format types (DataIndex, TargetData, FrameMeta, Wcs, Neighbour, CatalogueTrack,
 * LiveBlock, LiveStatus, PatchCatalog, LiveHealth) match docs/data-format.md and
 * docs/live-service.md exactly: every field here is a field in the JSON that lane A writes
 * (scripts/prebake.py, scripts/live.py), checked against every public/data/<key>/frames.json.
 *
 * Changing this file: adding an optional field is fine (tell the lanes that read it). Renaming or
 * removing a field, or changing what it means, needs the integrator (AGENTS.md).
 */

/** A detector number, 1 to 6: D1 (0.75 µm) … D6 (5.0 µm). */
export type Det = number;

// ---------------------------------------------------------------------------------------------
// Shipped and live data files (docs/data-format.md)
// ---------------------------------------------------------------------------------------------

/**
 * Sky ↔ pixel mapping of one exposure: a plain gnomonic (tangent-plane) projection that
 * prebake.py fits to the pipeline's TAN-SIP WCS. `wcsSky2Pix` and `wcsPix2Sky` in core/real.ts
 * implement it.
 */
export interface Wcs {
  /** [RA, Dec] in degrees at the reference pixel. */
  crval: [number, number];
  /** Reference pixel [x, y], 0-based: pixel (0, 0) is the centre of the first stored pixel. */
  crpix: [number, number];
  /** [CD1_1, CD1_2, CD2_1, CD2_2] in degrees per pixel. */
  cd: [number, number, number, number];
}

/** One exposure in frames.json. */
export interface FrameMeta {
  /** Observation ID plus detector, as in the IRSA file name, e.g. `2026W39_1A_0371_1D2`. */
  id: string;
  /** Detector, 1 to 6. */
  det: Det;
  /** Middle of the exposure (MJD-AVG, UTC). */
  mjd: number;
  /** The same as text, as the file header gives it. */
  dateObs: string;
  /** IRSA collection, e.g. `spherex_qr3`. Shown on screen as "QR3". */
  release: string;
  /** Pipeline version from the file name, e.g. `l2b-v27-2026-268`. */
  pipeline: string;
  /** The full Level 2 file at IRSA ("View the full file", and credit). */
  url: string;
  /** The exact cutout request that was downloaded (`url?center=RA,DEC&size=DEG`). */
  cutout: string;
  /** Exposure time, seconds (XPOSURE). */
  exptime: number;
  /** Cutout width in pixels. Not always equal to h: cutouts are clipped at detector edges. */
  w: number;
  /** Cutout height in pixels. */
  h: number;
  /** Byte offset of this frame inside the decompressed frames.bin. */
  offset: number;
  /** Central wavelength at the target's position in this exposure, µm. */
  lam: number;
  /** Bandwidth there, µm. Two exposures are the same colour when their lam differ by ≤ bw / 2. */
  bw: number;
  /** Sky ↔ pixel mapping of this cutout. */
  wcs: Wcs;
  /** Largest difference between `wcs` and the full pipeline WCS inside the cutout, arcsec. */
  wcsErr: number;
  /** Median of the zodiacal light model that was subtracted, MJy/sr; null if the plane has none. */
  zodi: number | null;
  /** Typical pixel noise: square root of the median VARIANCE of usable pixels, MJy/sr; null if
   * no pixel is usable. */
  sigma: number | null;
  /** Median pixel solid angle (OMEGA_MEDIAN), arcsec²; null if the header lacks it. */
  omega: number | null;
  /** Fraction of the cutout's pixels that carry a bad flag, 0 to 1. */
  badFrac: number;
  /** Visit window, counting from 0: a survey pass, or a calendar month when `monthly`. */
  window: number;
}

/** A Gaia DR3 or CatWISE2020 source near the target's path (frames.json `neighbours`). */
export interface Neighbour {
  /** `gaia` (Gaia DR3, VizieR I/355/gaiadr3) or `catwise` (CatWISE2020, VizieR II/365/catwise). */
  cat: 'gaia' | 'catwise';
  /** Catalogue name as shown, e.g. `Gaia DR3 5756956644387831296` or `CWISE J085501.95-071428.2`. */
  id: string;
  /** Position in degrees at decimal year `ep`. */
  ra: number;
  dec: number;
  /** Epoch of ra, dec: 2016.0 for Gaia; 2015.4019 (MJD 57170) for CatWISE. */
  ep: number;
  /** Motion east, mas/yr, already times cos dec. 0 where the catalogue gives none. */
  pmra: number;
  /** Motion north, mas/yr. 0 where the catalogue gives none. */
  pmdec: number;
  /** Gaia G; CatWISE W1mproPM, or W2mproPM when W1 is empty. */
  mag: number;
  /** True on the target's own entries; absent otherwise. A fast mover can be listed more than once. */
  target?: boolean;
}

/**
 * The catalogue position and motion that centred each cutout (frames.json `catalogue`). Cutouts
 * are centred on the position moved by the motion only (parallax is under 0.6″).
 *
 * In a live patch this is the patch centre typed by the user: motion 0, parallax null, ep 2016.0,
 * and `from` says it is "a position, not a catalogue object".
 */
export interface CatalogueTrack {
  /** Degrees at decimal year `ep`. */
  ra: number;
  dec: number;
  /** Decimal year. */
  ep: number;
  /** mas/yr, east motion times cos dec. */
  pmra: number;
  pmdec: number;
  /** mas; null in a live patch (no object). */
  parallax: number | null;
  /** Where the values come from, in words, e.g. "Gaia DR3 4472832130942575872 (ESA Gaia archive,
   * gaiadr3.gaia_source)". Shown with the numbers (H4). */
  from: string;
}

/** The `live` block of a live patch's frames.json (docs/live-service.md). Absent in shipped data. */
export interface LiveBlock {
  /** The service's job id, 16 lowercase hex digits. */
  id: string;
  /** `first`: one exposure per detector at the oldest and newest visit; `full`: the whole plan. */
  step: 'first' | 'full';
  /** When the files were written, UTC (ISO 8601). */
  fetched: string;
  /** Exposures the search found. */
  found: number;
  /** Number of visit windows. */
  windows: number;
}

/** One target's frames.json. */
export interface TargetData {
  /** Position and motion used to centre each cutout. Same values as core/targets.ts. */
  catalogue: CatalogueTrack;
  /** Field width the app opens at, arcmin. */
  fov: number;
  /** Cutout side, degrees. */
  size: number;
  /** Pixel unit: MJy/sr, with the zodiacal light model subtracted. */
  units: string;
  /** Flag bit number (as a string key, '0' to '31') → flag name, from the files' FLAGS header. */
  flagBits: Record<string, string>;
  /** Flag names that make a pixel unfit for measuring. SOURCE is not one of them. */
  badFlags: string[];
  /** How many exposures per detector per visit window were kept. */
  perDetPerWindow: number;
  /** True when each window is one calendar month of a deep field (R Draconis). Always written. */
  monthly: boolean;
  /** One entry per exposure, in time order. */
  frames: FrameMeta[];
  /** Gaia DR3 and CatWISE2020 sources near the target's path. Absent on older files. */
  neighbours?: Neighbour[];
  /** With `neighbours`: which service answered for each catalogue, in words. */
  neighboursFrom?: Partial<Record<'gaia' | 'catwise', string>>;
  /** Only in a live patch: which job and step wrote it. */
  live?: LiveBlock;
}

/** One target in manifest.json (`targets.<key>`). */
export interface DataIndexEntry {
  /** Folder of the target's files, relative to the site root (public/), ending in `/`:
   * `data/barnard/`. Fetch `${import.meta.env.BASE_URL}${path}frames.json`. */
  path: string;
  /** Name to show. */
  label: string;
  /** Number of exposures. */
  frames: number;
  /** Size of frames.bin.gz in bytes. */
  bytes: number;
  /** IRSA collections the kept frames came from. */
  releases: string[];
  /** Number of visit windows. */
  windows: number;
}

/** public/data/manifest.json: which targets have shipped data. */
export interface DataIndex {
  /** Format version, now 1. */
  version: number;
  /** When prebake.py last ran, UTC (ISO 8601). */
  generated: string;
  /** The archive searched, in words. */
  source: string;
  /** IRSA image collections that were searched. */
  collections: string[];
  /** Target key (`barnard`, `eps-indi-b`, `wise-0855`, `rw-aur`, `r-dra`) → entry. */
  targets: Record<string, DataIndexEntry>;
}

/**
 * The live service's status answer (docs/live-service.md): `GET /api/patch?ra=&dec=&fov=` (starts
 * the patch if new) and `GET /api/patch/<id>`. Poll every 1.5 s until `ready`, `empty` or
 * `failed`.
 *
 * SPEC 6.3 sketches the finished state as `done` and the count as `ready`; docs/live-service.md
 * (what the service sends) says `ready`/`empty` and `done`/`total`. This type follows the service.
 *
 * Other answers of the same route: `400 {"error": "…"}` for bad input and
 * `503 {"error": "busy", "state": "busy"}` when 8 patches already wait (see LiveError).
 */
export interface LiveStatus {
  /** Job id, 16 lowercase hex digits, e.g. `6d32669fdcdddebf`. */
  id: string;
  state: 'queued' | 'searching' | 'first' | 'rest' | 'ready' | 'empty' | 'failed';
  /** Exposures the search found. */
  found: number;
  /** Exposures fetched so far in the current step (`first`, then `rest`), of `total`. */
  done: number;
  total: number;
  /** How many of the fetched exposures were usable. */
  kept: number;
  /** Collections the kept frames came from (e.g. `spherex_dr1`); [] until a step is written. */
  releases: string[];
  /** Why it failed, in words; '' when it did not. */
  error: string;
  /** Set when a release found nothing because IRSA no longer lists it; '' when none. */
  warning: string;
  /** Folder of the first look once written (`/api/patch/<id>/first/`), else null. */
  first: string | null;
  /** Folder of the full set once written (`/api/patch/<id>/full/`), else null. */
  full: string | null;
  /** Address of catalog.json once written (`/api/patch/<id>/catalog.json`), else null. */
  catalog: string | null;
  /** Why the catalogue query failed, in words; '' when it did not (or has not finished). */
  catalogError: string;
  /** The patch as the service rounded it (0.001°): degrees, degrees, arcmin (3, 6 or 12). */
  ra: number;
  dec: number;
  fov: number;
  /** Collections the search asked (the service's release list). */
  searched: string[];
}

/** An error answer of the live service: `400 {error}`, `404`, or `503 {error: 'busy', state: 'busy'}`. */
export interface LiveError {
  error: string;
  state?: 'busy' | 'failed' | 'pending';
}

/**
 * A live patch's catalog.json (docs/live-service.md, O-D4): Gaia DR3 and CatWISE2020 sources in a
 * circle that holds the whole patch plus 30″, brightest first. The route answers
 * `202 {"state": "pending"}` while the query runs and `502 {"state": "failed", "error"}` if both
 * the primary service and the fallback failed.
 */
export interface PatchCatalog {
  /** The patch's job id. */
  id: string;
  /** Patch centre (degrees) and field size (arcmin). */
  ra: number;
  dec: number;
  fov: number;
  /** Radius of the circle searched, degrees. */
  radius: number;
  /** When it was written, UTC (ISO 8601). */
  generated: string;
  /** Which service answered each catalogue, in words. */
  from: { gaia: string; catwise: string };
  /** True when a catalogue reached `limit` rows (crowded field): its faintest are missing. */
  capped: { gaia: boolean; catwise: boolean };
  /** Most rows kept per catalogue. */
  limit: number;
  /** Fields of Neighbour, without `target` (a patch has no target). */
  rows: Omit<Neighbour, 'target'>[];
}

/** `GET /api/health`. */
export interface LiveHealth {
  ok: boolean;
  /** The collections the service searches. */
  releases: string[];
  /** Field sizes it accepts, arcmin. */
  fovs: number[];
}

// ---------------------------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------------------------

/** One of the five test targets (core/targets.ts). */
export interface Target {
  /** Key used everywhere: `barnard`, `eps-indi-b`, `wise-0855`, `rw-aur`, `r-dra`. */
  key: string;
  /** Name to show, e.g. "Barnard's Star". */
  name: string;
  /** Kind in plain words with its class, e.g. "Red dwarf (M4 V)". */
  kind: string;
  /** One short plain line for lists, e.g. "The runaway star". */
  line: string;
  /** Catalogue position, degrees, at decimal year `ep`. */
  ra: number;
  dec: number;
  ep: number;
  /** Catalogue motion, mas/yr (east motion times cos dec). */
  pmra: number;
  pmdec: number;
  /** Catalogue parallax, mas; null when the catalogue gives none. */
  plx: number | null;
  /** Catalogue pulsation period, days, from a named catalogue; null for stars that are not
   * periodic and while no catalogue value has been fetched (H9: never from memory). */
  period: number | null;
  /** Where the catalogue values come from, in words: frames.json `catalogue.from`. */
  values: string;
  /** What Measure leads with when it opens calm (MSR-1). */
  lead: 'motion' | 'spectrum' | 'stack' | 'brightness';
  /** Where `kind` comes from, in words (H9). Optional: added by lane B. */
  kindFrom?: string;
  /** Where `period` comes from, in words (H9); also why a catalogued period is not used. Optional:
   * added by lane B. */
  periodFrom?: string;
}

// ---------------------------------------------------------------------------------------------
// Decoded real exposures
// ---------------------------------------------------------------------------------------------

/** One decoded exposure in its own pixels, not resampled. */
export interface RealFrame {
  meta: FrameMeta;
  /**
   * w × h pixel values in MJy/sr, zodiacal light model subtracted; NaN where the archive has no
   * value. FITS order: row 0 is the bottom row; pixel (x, y) is element y·w + x.
   */
  pix: Float32Array;
  /** w × h FLAGS bitmasks, unchanged, same order as `pix`. */
  flags: Uint32Array;
}

/** A patch of real exposures: frames.json plus every exposure's pixels. */
export interface RealSet {
  /** Target key for shipped data, or the live service's job id. */
  key: string;
  /** Shipped with the app (public/data) or fetched live (docs/live-service.md). */
  origin: 'shipped' | 'live';
  data: TargetData;
  /** One per `data.frames` entry, same order. */
  frames: RealFrame[];
  /** Bitmask of the bad flags (`data.badFlags` through `data.flagBits`). */
  badMask: number;
}

// ---------------------------------------------------------------------------------------------
// The viewer's grid: what the frame paints and the tools measure
// ---------------------------------------------------------------------------------------------

/**
 * One exposure on the field's grid (resampled from a RealFrame, or simulated).
 * Pixel order is screen order: see `Field`.
 */
export interface Frame {
  /** Index of this frame in `Field.frames`. */
  i: number;
  /** Exposure ID. A simulated frame's ID starts with `SIMULATED` (O-G11). */
  id: string;
  det: Det;
  /** Middle of the exposure, MJD. */
  mjd: number;
  /** Wavelength at the field centre and bandwidth, µm. */
  lam: number;
  bw: number;
  /** Visit window, from 0 (FrameMeta.window). */
  window: number;
  /** k-th exposure (in time) of this detector inside its window, from 0. */
  visit: number;
  /** IRSA collection, or `simulated`. */
  release: string;
  /** n × n values in µJy per pixel, as recorded (gain not applied); NaN where there is no data. */
  pix: Float32Array;
  /** n × n: 1 where the pixel is flagged bad or not covered, else 0. */
  bad: Uint8Array;
  /** Typical pixel noise, µJy. */
  sigma: number;
  /** Sky level, µJy: the median of the usable pixels. */
  sky: number;
  /** Brightness match: multiply by this to match the reference frame (1 = as recorded). */
  gain: number;
  /** Index into RealSet.frames; null for simulated frames. */
  src: number | null;
}

/**
 * Every exposure of a patch on one grid, north up and east left, 6.15″ pixels.
 *
 * Field pixel (x, y) is 0-based and integer coordinates are pixel centres. x grows to the west
 * (right on screen) and y grows to the south (down on screen): row 0 is the north edge, and
 * pixel (x, y) is element y·n + x. `wcs` maps it with the same functions as an exposure.
 */
export interface Field {
  /** Centre, degrees. */
  ra: number;
  dec: number;
  /** Field width, arcmin. */
  fov: number;
  /** Pixels across (and down: the grid is square). */
  n: number;
  /** Arcsec per pixel (6.15). */
  scale: number;
  /** The grid's own sky mapping: crval = centre, crpix = centre pixel, cd = [−s, 0, 0, −s]. */
  wcs: Wcs;
  /** True for the labelled practice simulation (H3): it never mixes with real results. */
  simulated: boolean;
  /** Every exposure, in time order. */
  frames: Frame[];
  /** Number of visit windows. */
  windows: number;
  /** True when windows are calendar months (R Draconis), not survey passes. */
  monthly: boolean;
  /** Typical noise per detector, µJy: index 0 is D1. NaN for a detector with no frames. */
  noise: number[];
  /** The test target in this patch, if any. */
  target: Target | null;
  /** Catalogue sources near the target's path (from TargetData), possibly empty. */
  neighbours: Neighbour[];
  /** IRSA collections the frames came from, or ['simulated']. */
  releases: string[];
}

/**
 * Frames of one detector blended into one picture: one step of the flip-book.
 * Explore steps through windows (lettered A, B, C…); Measure steps through visits.
 */
export interface Group {
  /** Stable key: `w0` for window 0, `w0v2` for its visit 2. */
  key: string;
  /** Letter of its window: `A`, `B`, `C`… */
  letter: string;
  /** Visit window, from 0. */
  window: number;
  /** Visit inside the window, from 0; null when the group is the whole window. */
  visit: number | null;
  det: Det;
  /**
   * Indices into Field.frames, in time order. Empty when the detector has no exposure here: the
   * picture is then empty and flagged, and says so (H6). Nothing is filled in.
   */
  frames: number[];
  /** Middle, first and last MJD of its frames; NaN when empty. */
  mjd: number;
  mjd0: number;
  mjd1: number;
  /** Mean wavelength of its frames, µm; NaN when empty. */
  lam: number;
}

// ---------------------------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------------------------

/** The target measured on one exposure (core/real.ts `measureTarget`). */
export interface Measurement {
  /** Index into RealSet.frames. */
  frame: number;
  id: string;
  det: Det;
  mjd: number;
  lam: number;
  bw: number;
  window: number;
  /** Seen: the brightest pixel is 5 times the noise above the sky and the total 5 times its error. */
  seen: boolean;
  /** Measured position, degrees; NaN when not seen. */
  ra: number;
  dec: number;
  /** Position error, arcsec (1σ); NaN when not seen. */
  posErr: number;
  /** Where the catalogue puts the target at this date, degrees. */
  predRa: number;
  predDec: number;
  /** Flux-weighted centre, a profile fitted around a flagged core, or none. */
  method: 'centroid' | 'profile' | 'none';
  /** The core is flagged (saturated): position from a profile fit, brightness from the glow. */
  saturated: boolean;
  /** Light within 2 pixels, µJy, not corrected for light outside; NaN when not measured. */
  flux: number;
  /** 1σ error of `flux`, µJy. */
  fluxErr: number;
  /** `flux` is a lower limit: the aperture has a flagged pixel, so only usable pixels count. */
  lower: boolean;
  /** Outer glow of a saturated star, µJy in the ring minus sky; null when not saturated. */
  glow: number | null;
  /** Peak signal-to-noise. */
  snr: number;
  /** Why this exposure was not measured, in words (H5), e.g. naming a neighbour within 12.3″. */
  skipped: string | null;
  /**
   * The exposure's CD matrix ([CD1_1, CD1_2, CD2_1, CD2_2], degrees per pixel), so the motion fit
   * can test whether a fixed shift on the detector mimics parallax (SPEC 7.1.8). Optional: added
   * by lane B; measurements made without it skip that test.
   */
  cd?: [number, number, number, number];
}

/** Proper motion from the measured positions (core/fit.ts `fitMotion`). */
export interface MotionFit {
  /** False when it could not be measured; `reason` then says why (H5). Never a model value. */
  ok: boolean;
  reason: string | null;
  /** Measured motion, mas/yr (east times cos dec, north) and 1σ errors. */
  pmra: number;
  pmdec: number;
  pmraErr: number;
  pmdecErr: number;
  /** Total motion and its error, arcsec/yr. */
  total: number;
  totalErr: number;
  /** Direction of motion, degrees east of north. */
  pa: number;
  /** Fitted position, degrees, at decimal year `ep`. */
  ra: number;
  dec: number;
  ep: number;
  /** Exposures used, of those measured. */
  used: number;
  of: number;
  /** Visits the used exposures come from. */
  visits: number;
  /** Indices (into the measurements given) dropped by the refit as more than 3× the median off. */
  outliers: number[];
  /** Largest change of `total` when one visit is left out, arcsec/yr. */
  stability: number;
  /** Parallax fitted with position and motion, mas. Shown only when trustworthy (SPEC 7.1.8). */
  parallax: { value: number; err: number; shown: boolean; why: string } | null;
  /** The catalogue's motion for comparison; null when there is none. */
  catalogue: { total: number; pmra: number; pmdec: number; source: string } | null;
  /** True when the measurement agrees with the catalogue within 3σ; null without a catalogue. */
  matches: boolean | null;
}
