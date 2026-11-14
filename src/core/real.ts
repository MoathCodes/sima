/**
 * Real SPHEREx exposures: decoding, flags, sky ↔ pixel, resampling onto the viewer's grid,
 * centroids, photometry and colour matching (docs/data-format.md). Owner: lane B. Pure.
 *
 * PHASE 0 STUB: every function returns a fixed fake value: no frames, nothing measured.
 */
import type {
  Det,
  Field,
  Frame,
  Measurement,
  RealFrame,
  RealSet,
  Target,
  TargetData,
  Wcs,
} from './types.ts';
import { PIXEL_ARCSEC } from './instrument.ts';

/**
 * Decodes one patch: frames.json plus the bytes of frames.bin.gz (or frames.bin, if a server
 * already unpacked it: the missing gzip header is noticed).
 *
 * Each frame at its `offset` holds w × h FLAGS (uint32, little-endian), then w × h pixels
 * (IEEE half-precision, little-endian) in MJy/sr, FITS order (bottom row first).
 *
 * PHASE 0 STUB: returns the set with no frames.
 *
 * @param data The parsed frames.json.
 * @param bytes The file's bytes, gzipped or not.
 * @param opts `key`: target key or live job id; `origin`: shipped or live.
 */
export async function decodeFrames(
  data: TargetData,
  bytes: Uint8Array,
  opts: { key: string; origin: 'shipped' | 'live' },
): Promise<RealSet> {
  return { key: opts.key, origin: opts.origin, data, frames: [], badMask: 0 };
}

/**
 * The bitmask of the bad flags: every name in `badFlags`, looked up in `flagBits`. A pixel is
 * unfit for measuring when `flags & badMask` is not 0. SOURCE is not bad.
 *
 * PHASE 0 STUB: always 0.
 */
export function badMaskOf(data: Pick<TargetData, 'flagBits' | 'badFlags'>): number {
  return 0;
}

/**
 * Sky → pixel through a plain gnomonic projection.
 * PHASE 0 STUB: always the reference pixel.
 *
 * @param ra Degrees.
 * @param dec Degrees.
 * @returns Pixel coordinates, 0-based, integer at pixel centres.
 */
export function wcsSky2Pix(wcs: Wcs, ra: number, dec: number): { x: number; y: number } {
  return { x: wcs.crpix[0], y: wcs.crpix[1] };
}

/**
 * Pixel → sky through a plain gnomonic projection.
 * PHASE 0 STUB: always the reference position.
 *
 * @param x Pixel, 0-based.
 * @param y Pixel, 0-based.
 * @returns Degrees.
 */
export function wcsPix2Sky(wcs: Wcs, x: number, y: number): { ra: number; dec: number } {
  return { ra: wcs.crval[0], dec: wcs.crval[1] };
}

/**
 * The viewer's grid for a patch: square, north up, east left, 6.15″ pixels, covering `fov`.
 * See `Field` in core/types.ts for the pixel order.
 *
 * PHASE 0 STUB: fixed size 59 pixels, centred on the patch.
 *
 * @param ra Patch centre, degrees.
 * @param dec Patch centre, degrees.
 * @param fov Field width, arcminutes.
 * @returns Pixels across, and the grid's sky mapping.
 */
export function fieldGrid(ra: number, dec: number, fov: number): { n: number; wcs: Wcs } {
  const n = 59;
  const s = PIXEL_ARCSEC / 3600;
  return { n, wcs: { crval: [ra, dec], crpix: [(n - 1) / 2, (n - 1) / 2], cd: [-s, 0, 0, -s] } };
}

/**
 * One exposure resampled onto a grid (bilinear between usable pixels) and converted to µJy per
 * pixel. A usable pixel takes nothing from flagged neighbours (docs/tools.md, "A cause fixed at
 * the source"). Pixels the cutout does not cover are NaN and marked bad.
 *
 * PHASE 0 STUB: a frame with no data (all NaN, all bad).
 *
 * @param set The decoded patch.
 * @param i Index into set.frames.
 * @param grid From `fieldGrid`.
 */
export function realFrame(set: RealSet, i: number, grid: { n: number; wcs: Wcs }): Frame {
  const meta = set.frames[i]?.meta;
  const size = grid.n * grid.n;
  return {
    i,
    id: meta?.id ?? '',
    det: meta?.det ?? 1,
    mjd: meta?.mjd ?? Number.NaN,
    lam: meta?.lam ?? Number.NaN,
    bw: meta?.bw ?? Number.NaN,
    window: meta?.window ?? 0,
    visit: 0,
    release: meta?.release ?? '',
    pix: new Float32Array(size).fill(Number.NaN),
    bad: new Uint8Array(size).fill(1),
    sigma: Number.NaN,
    sky: Number.NaN,
    gain: 1,
    src: i,
  };
}

/**
 * Every exposure of a patch on one grid (visit k of a window = the k-th exposure in time of each
 * detector in it), with the typical noise per detector and the target and neighbours attached.
 *
 * PHASE 0 STUB: an empty field (no frames).
 *
 * @param set The decoded patch.
 * @param opts Patch centre (degrees), field width (arcmin), and the target, if any.
 */
export function buildRealField(
  set: RealSet,
  opts: { ra: number; dec: number; fov: number; target: Target | null },
): Field {
  const grid = fieldGrid(opts.ra, opts.dec, opts.fov);
  return {
    ra: opts.ra,
    dec: opts.dec,
    fov: opts.fov,
    n: grid.n,
    scale: PIXEL_ARCSEC,
    wcs: grid.wcs,
    simulated: false,
    frames: [],
    windows: 0,
    monthly: set.data.monthly,
    noise: [Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN],
    target: opts.target,
    neighbours: set.data.neighbours ?? [],
    releases: [],
  };
}

/** A position measured on one exposure, in that exposure's pixels. */
export interface Centroid {
  /** Pixel, 0-based, in the exposure (FITS order). NaN when not seen. */
  x: number;
  y: number;
  /** Light within 2 pixels, µJy, and its 1σ error. */
  flux: number;
  fluxErr: number;
  /** Peak signal-to-noise. */
  snr: number;
  /** Brightest pixel 5 times the noise above the sky and the total 5 times its error. */
  seen: boolean;
  /** More than a quarter of the aperture flagged: a profile was fitted around the core. */
  saturated: boolean;
  method: 'centroid' | 'profile' | 'none';
}

/**
 * Finds a source near a guess: the brightest usable pixel within 2 pixels, then the
 * flux-weighted centre of usable pixels within 2 pixels of it, repeated until it settles; sky
 * and noise from a ring 6 to 12 pixels out. Around a saturated core, a round Gaussian is fitted to
 * usable pixels within 5 pixels instead (docs/data-format.md, "Measuring the target").
 *
 * PHASE 0 STUB: never seen.
 *
 * @param frame The exposure.
 * @param badMask From `badMaskOf`.
 * @param x0 Guess, pixels (FITS order).
 * @param y0 Guess, pixels.
 */
export function centroid(frame: RealFrame, badMask: number, x0: number, y0: number): Centroid {
  return {
    x: Number.NaN,
    y: Number.NaN,
    flux: Number.NaN,
    fluxErr: Number.NaN,
    snr: 0,
    seen: false,
    saturated: false,
    method: 'none',
  };
}

/**
 * Same colour: two exposures whose wavelengths differ by at most half a channel width, so their
 * passbands share at least half their width (SPEC 7.1.1).
 *
 * PHASE 0 STUB: always false.
 */
export function colourMatch(
  a: { lam: number; bw: number },
  b: { lam: number; bw: number },
): boolean {
  return false;
}

/**
 * Measures the test target on every exposure: position (centroid or profile), brightness in a
 * 2-pixel aperture, the outer glow when the core is saturated, and "not measured" with the
 * reason when a listed neighbour within 12.3″ is bright enough to matter.
 *
 * PHASE 0 STUB: returns no measurements.
 *
 * @param set The decoded patch.
 * @param target The patch's target.
 * @returns One Measurement per exposure, in time order.
 */
export function measureTarget(set: RealSet, target: Target): Measurement[] {
  return [];
}

/**
 * Which detector's frames a field has at all, in order. Handy for the detector strip.
 *
 * PHASE 0 STUB: always all six.
 */
export function detectorsIn(field: Field): Det[] {
  return [1, 2, 3, 4, 5, 6];
}
