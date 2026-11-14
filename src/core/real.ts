/**
 * Real SPHEREx exposures: decoding, flags, sky ↔ pixel, resampling onto the viewer's grid,
 * centroids, photometry and colour matching (docs/data-format.md). Owner: lane B. Pure.
 *
 * Units: exposure pixels are MJy/sr (zodiacal light model subtracted); photometry returns µJy
 * (a pixel's MJy/sr times its solid angle, OMEGA_MEDIAN). Positions in an exposure are 0-based
 * pixels in FITS order (row 0 is the bottom row).
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
import type { FrameMeta } from './types.ts';
import { mjysrToUjy, PIXEL_ARCSEC } from './instrument.ts';
import { median, robustSigma } from './stats.ts';
import { matchGains } from './blink.ts';
import { atDate, blendedWith } from './catalog.ts';
import { mjdToYear, propagate, separation } from './astro.ts';

/**
 * Decodes one patch: frames.json plus the bytes of frames.bin.gz (or frames.bin, if a server
 * already unpacked it: the missing gzip header is noticed).
 *
 * Each frame at its `offset` holds w × h FLAGS (uint32, little-endian), then w × h pixels
 * (IEEE half-precision, little-endian) in MJy/sr, FITS order (bottom row first). Unpacking uses
 * the platform's DecompressionStream; the decoding loop gives the page a turn every 20 ms.
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
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : bytes;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const half = halfTable();
  const frames: RealFrame[] = [];
  let slice = performance.now();
  for (const meta of data.frames) {
    const n = meta.w * meta.h;
    const flags = new Uint32Array(n);
    const pix = new Float32Array(n);
    let o = meta.offset;
    if (o + n * 6 > raw.byteLength) {
      throw new Error(`frames.bin is too short for exposure ${meta.id}`);
    }
    for (let i = 0; i < n; i++, o += 4) flags[i] = view.getUint32(o, true);
    for (let i = 0; i < n; i++, o += 2) pix[i] = half[view.getUint16(o, true)]!;
    frames.push({ meta, pix, flags });
    // Give the page a turn about every 20 ms (TLS-8): R Draconis takes about 0.3 s in all.
    if (performance.now() - slice > 20) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      slice = performance.now();
    }
  }
  return { key: opts.key, origin: opts.origin, data, frames, badMask: badMaskOf(data) };
}

/** Unpacks gzip with the platform's DecompressionStream (browsers, workers and Node 22). */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

let HALF: Float32Array | null = null;
/** Every IEEE half-precision value, by its 16 bits. Built once (256 KB). */
function halfTable(): Float32Array {
  if (HALF) return HALF;
  const t = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const s = h & 0x8000 ? -1 : 1;
    const e = (h >> 10) & 0x1f;
    const f = h & 0x3ff;
    if (e === 0) t[h] = s * f * 2 ** -24;
    else if (e === 31) t[h] = f ? Number.NaN : s * Infinity;
    else t[h] = s * (1 + f / 1024) * 2 ** (e - 15);
  }
  HALF = t;
  return t;
}

/**
 * The bitmask of the bad flags: every name in `badFlags`, looked up in `flagBits`. A pixel is
 * unfit for measuring when `flags & badMask` is not 0. SOURCE is not bad.
 */
export function badMaskOf(data: Pick<TargetData, 'flagBits' | 'badFlags'>): number {
  const bad = new Set(data.badFlags);
  let mask = 0;
  for (const [bit, name] of Object.entries(data.flagBits)) {
    if (bad.has(name)) mask |= 1 << Number(bit);
  }
  return mask >>> 0;
}

/**
 * The bitmask of one named flag (0 when the file does not name it).
 *
 * @param name A flag name from the files' FLAGS header, e.g. `OVERFLOW`.
 */
export function flagBit(data: Pick<TargetData, 'flagBits'>, name: string): number {
  for (const [bit, n] of Object.entries(data.flagBits)) if (n === name) return (1 << Number(bit)) >>> 0;
  return 0;
}

const D2R = Math.PI / 180;

/**
 * Sky → pixel through a plain gnomonic projection.
 *
 * @param ra Degrees.
 * @param dec Degrees.
 * @returns Pixel coordinates, 0-based, integer at pixel centres. NaN for a point 90° or more
 *   away from the reference (behind the tangent plane).
 */
export function wcsSky2Pix(wcs: Wcs, ra: number, dec: number): { x: number; y: number } {
  const a0 = wcs.crval[0] * D2R;
  const d0 = wcs.crval[1] * D2R;
  const a = ra * D2R;
  const d = dec * D2R;
  const cosd = Math.cos(d);
  const cosda = Math.cos(a - a0);
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * cosd * cosda;
  if (!(cosc > 0)) return { x: Number.NaN, y: Number.NaN };
  const xi = (cosd * Math.sin(a - a0)) / cosc / D2R;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * cosd * cosda) / cosc / D2R;
  const [c11, c12, c21, c22] = wcs.cd;
  const det = c11 * c22 - c12 * c21;
  return {
    x: wcs.crpix[0] + (c22 * xi - c12 * eta) / det,
    y: wcs.crpix[1] + (-c21 * xi + c11 * eta) / det,
  };
}

/**
 * Pixel → sky through a plain gnomonic projection.
 *
 * @param x Pixel, 0-based.
 * @param y Pixel, 0-based.
 * @returns Degrees.
 */
export function wcsPix2Sky(wcs: Wcs, x: number, y: number): { ra: number; dec: number } {
  const [c11, c12, c21, c22] = wcs.cd;
  const dx = x - wcs.crpix[0];
  const dy = y - wcs.crpix[1];
  const xi = (c11 * dx + c12 * dy) * D2R;
  const eta = (c21 * dx + c22 * dy) * D2R;
  const a0 = wcs.crval[0] * D2R;
  const d0 = wcs.crval[1] * D2R;
  const den = Math.cos(d0) - eta * Math.sin(d0);
  const a = a0 + Math.atan2(xi, den);
  const d = Math.atan2(Math.sin(d0) + eta * Math.cos(d0), Math.hypot(xi, den));
  return { ra: (((a / D2R) % 360) + 360) % 360, dec: d / D2R };
}

/**
 * The viewer's grid for a patch: square, north up, east left, 6.15″ pixels, covering `fov`
 * (rounded up to whole pixels, and odd, so the patch centre is a pixel centre). See `Field` in
 * core/types.ts for the pixel order.
 *
 * @param ra Patch centre, degrees.
 * @param dec Patch centre, degrees.
 * @param fov Field width, arcminutes.
 * @returns Pixels across, and the grid's sky mapping.
 */
export function fieldGrid(ra: number, dec: number, fov: number): { n: number; wcs: Wcs } {
  let n = Math.max(3, Math.ceil((fov * 60) / PIXEL_ARCSEC));
  if (n % 2 === 0) n += 1;
  const s = PIXEL_ARCSEC / 3600;
  return { n, wcs: { crval: [ra, dec], crpix: [(n - 1) / 2, (n - 1) / 2], cd: [-s, 0, 0, -s] } };
}

/** µJy per pixel of the viewer's grid for 1 MJy/sr. */
const GRID_UJY = mjysrToUjy(PIXEL_ARCSEC * PIXEL_ARCSEC);
/** µJy per pixel of an exposure for 1 MJy/sr (its own pixel solid angle, when recorded). */
export function frameUjy(meta: FrameMeta): number {
  return mjysrToUjy(meta.omega ?? PIXEL_ARCSEC * PIXEL_ARCSEC);
}

/**
 * One exposure resampled onto a grid (bilinear between usable pixels) and converted to µJy per
 * pixel. A usable pixel takes nothing from flagged neighbours (docs/tools.md, "A cause fixed at
 * the source"). Pixels the cutout does not cover are NaN and marked bad. A grid pixel whose
 * nearest exposure pixel is flagged is marked bad too (H6); it keeps a value only when some
 * usable exposure pixel touches it.
 *
 * @param set The decoded patch.
 * @param i Index into set.frames.
 * @param grid From `fieldGrid`.
 */
export function realFrame(set: RealSet, i: number, grid: { n: number; wcs: Wcs }): Frame {
  const f = set.frames[i]!;
  const m = f.meta;
  const n = grid.n;
  const size = n * n;
  const pix = new Float32Array(size).fill(Number.NaN);
  const bad = new Uint8Array(size).fill(1);
  const mask = set.badMask;
  const w = m.w;
  const h = m.h;
  // The grid → exposure mapping is affine to far better than 0.001 pixel over a patch, so map
  // three points exactly and step linearly (much faster than two projections per pixel).
  const at = (gx: number, gy: number): { x: number; y: number } => {
    const sky = wcsPix2Sky(grid.wcs, gx, gy);
    return wcsSky2Pix(m.wcs, sky.ra, sky.dec);
  };
  const c = (n - 1) / 2;
  const p0 = at(c, c);
  const px = at(c + 1, c);
  const py = at(c, c + 1);
  const ax = px.x - p0.x;
  const ay = px.y - p0.y;
  const bx = py.x - p0.x;
  const by = py.y - p0.y;
  const usable = (k: number): boolean => (f.flags[k]! & mask) === 0 && Number.isFinite(f.pix[k]!);
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const ex = p0.x + ax * (gx - c) + bx * (gy - c);
      const ey = p0.y + ay * (gx - c) + by * (gy - c);
      if (!(ex >= -0.5 && ey >= -0.5 && ex <= w - 0.5 && ey <= h - 0.5)) continue;
      const o = gy * n + gx;
      const nx = Math.min(w - 1, Math.max(0, Math.round(ex)));
      const ny = Math.min(h - 1, Math.max(0, Math.round(ey)));
      const nearestOk = usable(ny * w + nx);
      const x0 = Math.floor(ex);
      const y0 = Math.floor(ey);
      const fx = ex - x0;
      const fy = ey - y0;
      let sw = 0;
      let sv = 0;
      for (let j = 0; j < 4; j++) {
        const xx = x0 + (j & 1);
        const yy = y0 + (j >> 1);
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (!usable(k)) continue;
        const wt = (j & 1 ? fx : 1 - fx) * (j >> 1 ? fy : 1 - fy);
        sw += wt;
        sv += wt * f.pix[k]!;
      }
      if (sw > 1e-6) pix[o] = (sv / sw) * GRID_UJY;
      bad[o] = nearestOk && sw > 1e-6 ? 0 : 1;
    }
  }
  const sky = median(pix.filter((v, k) => bad[k] === 0));
  return {
    i,
    id: m.id,
    det: m.det,
    mjd: m.mjd,
    lam: m.lam,
    bw: m.bw,
    window: m.window,
    visit: 0,
    release: m.release,
    pix,
    bad,
    sigma: m.sigma === null ? Number.NaN : m.sigma * GRID_UJY,
    sky,
    gain: 1,
    src: i,
  };
}

/**
 * Every exposure of a patch on one grid (visit k of a window = the k-th exposure in time of each
 * detector in it), with the typical noise per detector, the brightness-match gains (core/blink.ts
 * `matchGains`), and the target and neighbours attached.
 *
 * @param set The decoded patch.
 * @param opts Patch centre (degrees), field width (arcmin), and the target, if any.
 */
export function buildRealField(
  set: RealSet,
  opts: { ra: number; dec: number; fov: number; target: Target | null },
): Field {
  const it = buildRealFieldSteps(set, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/**
 * `buildRealField` in steps (a generator that yields after each exposure), so core/work.ts can
 * build a large patch in a worker or in slices on the page (TLS-8): R Draconis takes about 0.5 to
 * 0.8 s in all.
 */
export function* buildRealFieldSteps(
  set: RealSet,
  opts: { ra: number; dec: number; fov: number; target: Target | null },
): Generator<void, Field> {
  const grid = fieldGrid(opts.ra, opts.dec, opts.fov);
  const order = set.frames
    .map((_, i) => i)
    .sort((a, b) => set.frames[a]!.meta.mjd - set.frames[b]!.meta.mjd);
  const frames: Frame[] = [];
  for (const src of order) {
    frames.push({ ...realFrame(set, src, grid), i: frames.length });
    yield;
  }
  numberVisits(frames);
  const field: Field = {
    ra: opts.ra,
    dec: opts.dec,
    fov: opts.fov,
    n: grid.n,
    scale: PIXEL_ARCSEC,
    wcs: grid.wcs,
    simulated: false,
    frames,
    windows: frames.reduce((mx, f) => Math.max(mx, f.window + 1), 0),
    monthly: set.data.monthly,
    noise: noisePerDetector(frames),
    target: opts.target,
    neighbours: set.data.neighbours ?? [],
    releases: [...new Set(frames.map((f) => f.release))],
  };
  const gains = matchGains(field);
  frames.forEach((f, k) => (f.gain = gains[k]!));
  return field;
}

/** Sets `visit`: the k-th exposure (in time) of its detector inside its window. Frames in time order. */
export function numberVisits(frames: Frame[]): void {
  const seen = new Map<string, number>();
  for (const f of frames) {
    const key = `${f.window}:${f.det}`;
    const k = seen.get(key) ?? 0;
    f.visit = k;
    seen.set(key, k + 1);
  }
}

/** The median frame noise of each detector, µJy; NaN for a detector with no frames. */
export function noisePerDetector(frames: readonly Frame[]): number[] {
  return [1, 2, 3, 4, 5, 6].map((d) => median(frames.filter((f) => f.det === d).map((f) => f.sigma)));
}

// ---------------------------------------------------------------------------------------------
// Measuring on the original exposures (no resampling)
// ---------------------------------------------------------------------------------------------

/** Aperture radius, pixels: the light within 2 pixels. */
export const APERTURE = 2;
/** Sky ring, pixels from the centre. */
export const SKY_IN = 6;
export const SKY_OUT = 12;

/**
 * Sky level and pixel noise in a ring around a point of an exposure, in MJy/sr: the median and the
 * robust standard deviation of the usable pixels. Falls back to the file's own noise when fewer
 * than 8 pixels are usable.
 */
export function localSky(
  frame: RealFrame,
  badMask: number,
  x: number,
  y: number,
  rin = SKY_IN,
  rout = SKY_OUT,
): { sky: number; noise: number; n: number } {
  const m = frame.meta;
  const vals: number[] = [];
  const x0 = Math.max(0, Math.floor(x - rout));
  const x1 = Math.min(m.w - 1, Math.ceil(x + rout));
  const y0 = Math.max(0, Math.floor(y - rout));
  const y1 = Math.min(m.h - 1, Math.ceil(y + rout));
  const r2i = rin * rin;
  const r2o = rout * rout;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const d2 = (xx - x) ** 2 + (yy - y) ** 2;
      if (d2 < r2i || d2 > r2o) continue;
      const k = yy * m.w + xx;
      const v = frame.pix[k]!;
      if ((frame.flags[k]! & badMask) !== 0 || !Number.isFinite(v)) continue;
      vals.push(v);
    }
  }
  if (vals.length < 8) {
    return { sky: vals.length ? median(vals) : 0, noise: m.sigma ?? Number.NaN, n: vals.length };
  }
  const noise = robustSigma(vals);
  return { sky: median(vals), noise: noise > 0 ? noise : (m.sigma ?? Number.NaN), n: vals.length };
}

/** Aperture photometry on one exposure. */
export interface ApertureResult {
  /** µJy within the aperture, sky subtracted: usable pixels only (a lower limit when flagged). */
  flux: number;
  fluxErr: number;
  /** A flagged or empty pixel is in the aperture. */
  flagged: boolean;
  /** Pixels in the aperture, and how many are usable. */
  npix: number;
  nok: number;
  /** Sky and noise of the ring, MJy/sr. */
  sky: number;
  noise: number;
  /** Brightest usable pixel above the sky, in noise units. */
  peak: number;
}

/**
 * The light within `r` pixels of a point (pixel centres inside the circle), minus the sky from a
 * ring 6 to 12 pixels out, in µJy. The error is the ring's pixel noise over the aperture plus the
 * error of the sky level.
 */
export function aperturePhotometry(
  frame: RealFrame,
  badMask: number,
  x: number,
  y: number,
  r = APERTURE,
  sky?: { sky: number; noise: number; n: number },
): ApertureResult {
  const m = frame.meta;
  const s = sky ?? localSky(frame, badMask, x, y);
  const conv = frameUjy(m);
  let sum = 0;
  let npix = 0;
  let nok = 0;
  let peak = -Infinity;
  const r2 = r * r;
  for (let yy = Math.ceil(y - r); yy <= Math.floor(y + r); yy++) {
    for (let xx = Math.ceil(x - r); xx <= Math.floor(x + r); xx++) {
      if ((xx - x) ** 2 + (yy - y) ** 2 > r2) continue;
      npix++;
      if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
      const k = yy * m.w + xx;
      const v = frame.pix[k]!;
      if ((frame.flags[k]! & badMask) !== 0 || !Number.isFinite(v)) continue;
      nok++;
      sum += v - s.sky;
      if (v - s.sky > peak) peak = v - s.sky;
    }
  }
  const skyErr2 = s.n > 0 ? (Math.PI / 2) * (s.noise * s.noise) / s.n : 0;
  const err = Math.sqrt(nok * s.noise * s.noise + nok * nok * skyErr2);
  return {
    flux: nok ? sum * conv : Number.NaN,
    fluxErr: nok ? err * conv : Number.NaN,
    flagged: nok < npix,
    npix,
    nok,
    sky: s.sky,
    noise: s.noise,
    peak: nok ? peak / s.noise : Number.NaN,
  };
}

/** The bitmask of saturated pixels: OVERFLOW (and NONLINEAR where a file names it). */
export function saturatedMask(data: Pick<TargetData, 'flagBits'>): number {
  return (flagBit(data, 'OVERFLOW') | flagBit(data, 'NONLINEAR')) >>> 0;
}

/**
 * Distance from a point to the nearest saturated pixel (OVERFLOW or NONLINEAR) within `reach`
 * pixels, in pixels; null when none.
 *
 * @param badMask Not used for the test itself; kept so callers pass the same arguments as the
 *   other photometry helpers.
 */
export function nearestSaturated(
  frame: RealFrame,
  badMask: number,
  x: number,
  y: number,
  reach = 15,
): number | null {
  void badMask;
  const m = frame.meta;
  const sat = SAT_BITS;
  let best = Infinity;
  for (let yy = Math.max(0, Math.ceil(y - reach)); yy <= Math.min(m.h - 1, Math.floor(y + reach)); yy++) {
    for (let xx = Math.max(0, Math.ceil(x - reach)); xx <= Math.min(m.w - 1, Math.floor(x + reach)); xx++) {
      if ((frame.flags[yy * m.w + xx]! & sat) === 0) continue;
      const d = Math.hypot(xx - x, yy - y);
      if (d < best) best = d;
    }
  }
  return best <= reach ? best : null;
}
/**
 * OVERFLOW is bit 1 and NONLINEAR bit 15 in every SPHEREx file so far (Explanatory Supplement,
 * Table 16; the same numbers in every shipped header). Used where no flagBits are at hand.
 */
const SAT_BITS = ((1 << 1) | (1 << 15)) >>> 0;

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
  /** 1σ position error, pixels (each axis); NaN when not seen. */
  err?: number;
}

/**
 * Finds a source near a guess: the brightest usable pixel within 2 pixels, then the
 * flux-weighted centre of usable pixels within 2 pixels of it, repeated until it settles; sky
 * and noise from a ring 6 to 12 pixels out. Around a saturated core, a round Gaussian is fitted to
 * usable pixels within 5 pixels instead (docs/data-format.md, "Measuring the target"), or within 3
 * pixels beyond the flagged core when the core is wider than that (in a few exposures of
 * Barnard's Star the flagged blob reaches 7 to 9 pixels and leaves no usable pixel within 5).
 *
 * The position error is 1.2 pixels ÷ the signal-to-noise of the total, at least 0.05 pixels
 * (docs/tools.md, "Positions"); for a profile fit it is the fit's own error, widened by the
 * scatter of its residuals, at least 0.05 pixels.
 *
 * @param frame The exposure.
 * @param badMask From `badMaskOf`.
 * @param x0 Guess, pixels (FITS order).
 * @param y0 Guess, pixels.
 */
export function centroid(frame: RealFrame, badMask: number, x0: number, y0: number): Centroid {
  const none: Centroid = {
    x: Number.NaN,
    y: Number.NaN,
    flux: Number.NaN,
    fluxErr: Number.NaN,
    snr: 0,
    seen: false,
    saturated: false,
    method: 'none',
    err: Number.NaN,
  };
  const m = frame.meta;
  if (!(x0 >= 0 && y0 >= 0 && x0 <= m.w - 1 && y0 <= m.h - 1)) return none;
  const ring = localSky(frame, badMask, x0, y0);
  if (!(ring.noise > 0)) return none;
  const guess = aperturePhotometry(frame, badMask, x0, y0, APERTURE, ring);
  const usable = (xx: number, yy: number): boolean => {
    if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) return false;
    const k = yy * m.w + xx;
    return (frame.flags[k]! & badMask) === 0 && Number.isFinite(frame.pix[k]!);
  };
  if (guess.npix - guess.nok > guess.npix / 4) {
    // Usable pixels within 5 pixels, or 3 beyond the flagged core when the core is larger.
    const reach = Math.max(5, Math.ceil(coreRadius(frame, badMask, x0, y0)) + 3);
    const fit = gaussFit(frame, usable, x0, y0, ring.sky, ring.noise, reach);
    if (!fit) return { ...none, saturated: true };
    const ap = aperturePhotometry(frame, badMask, fit.x, fit.y, APERTURE, ring);
    const snr = fit.amp / ring.noise;
    return {
      x: fit.x,
      y: fit.y,
      flux: ap.flux,
      fluxErr: ap.fluxErr,
      snr,
      seen: snr >= 5,
      saturated: true,
      method: 'profile',
      err: Math.max(0.05, fit.err),
    };
  }
  // Brightest usable pixel within 2 pixels of the guess.
  let bx = -1;
  let by = -1;
  let bv = -Infinity;
  for (let yy = Math.ceil(y0 - APERTURE); yy <= Math.floor(y0 + APERTURE); yy++) {
    for (let xx = Math.ceil(x0 - APERTURE); xx <= Math.floor(x0 + APERTURE); xx++) {
      if ((xx - x0) ** 2 + (yy - y0) ** 2 > APERTURE * APERTURE || !usable(xx, yy)) continue;
      const v = frame.pix[yy * m.w + xx]!;
      if (v > bv) {
        bv = v;
        bx = xx;
        by = yy;
      }
    }
  }
  if (bx < 0) return none;
  const peakSnr = (bv - ring.sky) / ring.noise;
  let cx = bx;
  let cy = by;
  for (let it = 0; it < 20; it++) {
    let sw = 0;
    let sx = 0;
    let sy = 0;
    for (let yy = Math.ceil(cy - APERTURE); yy <= Math.floor(cy + APERTURE); yy++) {
      for (let xx = Math.ceil(cx - APERTURE); xx <= Math.floor(cx + APERTURE); xx++) {
        if ((xx - cx) ** 2 + (yy - cy) ** 2 > APERTURE * APERTURE || !usable(xx, yy)) continue;
        const wv = frame.pix[yy * m.w + xx]! - ring.sky;
        if (wv <= 0) continue;
        sw += wv;
        sx += wv * xx;
        sy += wv * yy;
      }
    }
    if (sw <= 0) break;
    const nx = sx / sw;
    const ny = sy / sw;
    const moved = Math.hypot(nx - cx, ny - cy);
    cx = nx;
    cy = ny;
    if (moved < 0.005) break;
  }
  const ap = aperturePhotometry(frame, badMask, cx, cy, APERTURE, ring);
  const totalSnr = ap.flux / ap.fluxErr;
  const seen = peakSnr >= 5 && totalSnr >= 5;
  return {
    x: seen ? cx : Number.NaN,
    y: seen ? cy : Number.NaN,
    flux: ap.flux,
    fluxErr: ap.fluxErr,
    snr: peakSnr,
    seen,
    saturated: false,
    method: seen ? 'centroid' : 'none',
    err: seen ? Math.max(0.05, 1.2 / Math.max(totalSnr, 1e-9)) : Number.NaN,
  };
}

/**
 * A round Gaussian (sky fixed) fitted to the usable pixels within 5 pixels of a guess by
 * Levenberg–Marquardt: centre, peak and width. Null when it does not converge to a sensible
 * answer (centre more than 3 pixels from the guess, width outside 0.3 to 6 pixels).
 */
function gaussFit(
  frame: RealFrame,
  usable: (x: number, y: number) => boolean,
  x0: number,
  y0: number,
  sky: number,
  noise: number,
  R = 5,
): { x: number; y: number; amp: number; s: number; err: number } | null {
  const m = frame.meta;
  const xs: number[] = [];
  const ys: number[] = [];
  const vs: number[] = [];
  for (let yy = Math.ceil(y0 - R); yy <= Math.floor(y0 + R); yy++) {
    for (let xx = Math.ceil(x0 - R); xx <= Math.floor(x0 + R); xx++) {
      if ((xx - x0) ** 2 + (yy - y0) ** 2 > R * R || !usable(xx, yy)) continue;
      xs.push(xx);
      ys.push(yy);
      vs.push(frame.pix[yy * m.w + xx]! - sky);
    }
  }
  const N = xs.length;
  if (N < 8) return null;
  // Start: the light-weighted centre of the usable pixels, a width of 1.5 pixels.
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let vmax = 0;
  for (let i = 0; i < N; i++) {
    const v = Math.max(0, vs[i]!);
    sw += v;
    sx += v * xs[i]!;
    sy += v * ys[i]!;
    vmax = Math.max(vmax, vs[i]!);
  }
  let p = [sw > 0 ? sx / sw : x0, sw > 0 ? sy / sw : y0, 0, 1.5];
  {
    const r2 = (i: number): number => (xs[i]! - p[0]!) ** 2 + (ys[i]! - p[1]!) ** 2;
    let num = 0;
    let den = 0;
    for (let i = 0; i < N; i++) {
      const g = Math.exp(-r2(i) / (2 * p[3]! * p[3]!));
      num += g * vs[i]!;
      den += g * g;
    }
    p[2] = den > 0 ? Math.max(num / den, vmax) : vmax;
  }
  const model = (q: number[], i: number): { f: number; J: number[] } => {
    const dx = xs[i]! - q[0]!;
    const dy = ys[i]! - q[1]!;
    const s2 = q[3]! * q[3]!;
    const g = Math.exp(-(dx * dx + dy * dy) / (2 * s2));
    const f = q[2]! * g;
    return { f, J: [(f * dx) / s2, (f * dy) / s2, g, (f * (dx * dx + dy * dy)) / (s2 * q[3]!)] };
  };
  const chi = (q: number[]): number => {
    let c = 0;
    for (let i = 0; i < N; i++) c += (vs[i]! - model(q, i).f) ** 2;
    return c;
  };
  let lambda = 1e-3;
  let c0 = chi(p);
  let JtJ: number[][] = [];
  for (let it = 0; it < 60; it++) {
    JtJ = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
    const Jtr = [0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      const { f, J } = model(p, i);
      const r = vs[i]! - f;
      for (let a = 0; a < 4; a++) {
        Jtr[a]! += J[a]! * r;
        for (let b = 0; b < 4; b++) JtJ[a]![b]! += J[a]! * J[b]!;
      }
    }
    const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) : v)));
    const step = solve4(A, Jtr);
    if (!step) break;
    const q = p.map((v, k) => v + step[k]!);
    q[3] = Math.abs(q[3]!);
    const c1 = chi(q);
    if (c1 < c0) {
      const done = Math.abs(c0 - c1) < 1e-9 * c0 && Math.hypot(step[0]!, step[1]!) < 1e-5;
      p = q;
      c0 = c1;
      lambda = Math.max(lambda / 10, 1e-9);
      if (done) break;
    } else {
      lambda *= 10;
      if (lambda > 1e8) break;
    }
  }
  if (!(Math.hypot(p[0]! - x0, p[1]! - y0) <= 3) || !(p[3]! >= 0.3 && p[3]! <= 6) || !(p[2]! > 0)) {
    return null;
  }
  // Error of the centre: from the curvature, with the residual scatter as the pixel noise (it
  // holds the profile's mismatch too, which is what limits a fit to the wings).
  const cov = invert4(JtJ);
  const s2 = Math.max(noise * noise, c0 / Math.max(1, N - 4));
  const err = cov ? Math.sqrt(Math.max(0, (cov[0]![0]! + cov[1]![1]!) / 2) * s2) : Number.NaN;
  return { x: p[0]!, y: p[1]!, amp: p[2]!, s: p[3]!, err };
}

/** Solves a 4 × 4 linear system by Gaussian elimination with pivoting; null when singular. */
function solve4(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-300) return null;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Inverse of a small square matrix; null when singular. */
export function invertMatrix(A: number[][]): number[][] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...A.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-300) return null;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]!;
    for (let k = 0; k < 2 * n; k++) M[c]![k]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]!;
      if (f === 0) continue;
      for (let k = 0; k < 2 * n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row) => row.slice(n));
}
const invert4 = invertMatrix;

/**
 * Same colour: two exposures whose wavelengths differ by at most half a channel width, so their
 * passbands share at least half their width (SPEC 7.1.1). The channel width is the mean of the
 * two bandwidths.
 */
export function colourMatch(
  a: { lam: number; bw: number },
  b: { lam: number; bw: number },
): boolean {
  return Math.abs(a.lam - b.lam) <= (a.bw + b.bw) / 4;
}

/** Where the catalogue puts the target on a date (motion only, as the cutouts were centred). */
export function targetAt(target: Target, mjd: number): { ra: number; dec: number } {
  return propagate(target.ra, target.dec, target.pmra, target.pmdec, target.ep, mjdToYear(mjd));
}

/**
 * Radius of the flagged core around a point: the connected flagged pixels that start within 1.5
 * pixels of it (out to 10 pixels), as the radius of a circle of the same area plus half a pixel;
 * 0 when nothing there is flagged. The area, not the farthest pixel, so a bleed trail along one
 * column does not count as a wider core.
 */
export function coreRadius(frame: RealFrame, badMask: number, x: number, y: number): number {
  const m = frame.meta;
  const isBad = (xx: number, yy: number): boolean => {
    const k = yy * m.w + xx;
    return (frame.flags[k]! & badMask) !== 0 || !Number.isFinite(frame.pix[k]!);
  };
  const seen = new Set<number>();
  const stack: [number, number][] = [];
  for (let yy = Math.ceil(y - 1.5); yy <= Math.floor(y + 1.5); yy++) {
    for (let xx = Math.ceil(x - 1.5); xx <= Math.floor(x + 1.5); xx++) {
      if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
      if ((xx - x) ** 2 + (yy - y) ** 2 > 2.25 || !isBad(xx, yy)) continue;
      seen.add(yy * m.w + xx);
      stack.push([xx, yy]);
    }
  }
  let count = 0;
  while (stack.length) {
    const [xx, yy] = stack.pop()!;
    if (Math.hypot(xx - x, yy - y) > 10) continue;
    count++;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = xx + dx;
      const ny = yy + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const k = ny * m.w + nx;
      if (seen.has(k) || !isBad(nx, ny)) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return Math.min(10, count ? Math.sqrt(count / Math.PI) + 0.5 : 0);
}

/** Width of the outer-glow ring, pixels. */
export const GLOW_WIDTH = 3;

/**
 * The outer glow of a saturated star (docs/data-format.md, "Outer glow"): the light in a ring
 * `GLOW_WIDTH` pixels wide starting at `rin` (where the flagged core ends), minus the sky from a
 * ring 6 to 12 pixels further out than the glow ring. The mean of the usable ring pixels times
 * the ring's area, so exposures with a few more flagged pixels still compare. µJy; NaN when fewer
 * than a third of the ring's pixels are usable. It rises and falls with the star but is not its
 * total brightness.
 */
export function glowTarget(
  frame: RealFrame,
  badMask: number,
  x: number,
  y: number,
  rin: number,
): number {
  const m = frame.meta;
  const rout = rin + GLOW_WIDTH;
  const sky = localSky(frame, badMask, x, y, rout + 6, rout + 12);
  let sum = 0;
  let nok = 0;
  let npix = 0;
  for (let yy = Math.ceil(y - rout); yy <= Math.floor(y + rout); yy++) {
    for (let xx = Math.ceil(x - rout); xx <= Math.floor(x + rout); xx++) {
      const d2 = (xx - x) ** 2 + (yy - y) ** 2;
      if (d2 < rin * rin || d2 >= rout * rout) continue;
      npix++;
      if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
      const k = yy * m.w + xx;
      const v = frame.pix[k]!;
      if ((frame.flags[k]! & badMask) !== 0 || !Number.isFinite(v)) continue;
      sum += v - sky.sky;
      nok++;
    }
  }
  if (nok < npix / 3 || nok === 0) return Number.NaN;
  return (sum / nok) * npix * frameUjy(m);
}

/**
 * Measures the test target on every exposure: position (centroid or profile), brightness in a
 * 2-pixel aperture, the outer glow when the core is saturated, and "not measured" with the
 * reason when a listed neighbour within 12.3″ is bright enough to matter.
 *
 * The glow ring is the same for every exposure of one detector: it starts where the widest
 * flagged core of that detector ends (`coreRadius`), so it is outside the core on every exposure.
 *
 * @param set The decoded patch.
 * @param target The patch's target.
 * @returns One Measurement per exposure, in time order.
 */
export function measureTarget(set: RealSet, target: Target): Measurement[] {
  const it = measureTargetSteps(set, target);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** `measureTarget` in steps (a generator that yields after each exposure), for core/work.ts. */
export function* measureTargetSteps(set: RealSet, target: Target): Generator<void, Measurement[]> {
  const neighbours = set.data.neighbours ?? [];
  const order = set.frames.map((_, i) => i).sort((a, b) => set.frames[a]!.meta.mjd - set.frames[b]!.meta.mjd);
  const out: Measurement[] = [];
  const cores = new Map<number, number[]>();
  const centres: { x: number; y: number }[] = [];
  for (const i of order) {
    const f = set.frames[i]!;
    const m = f.meta;
    const pred = targetAt(target, m.mjd);
    const pp = wcsSky2Pix(m.wcs, pred.ra, pred.dec);
    const base: Measurement = {
      frame: i,
      id: m.id,
      det: m.det,
      mjd: m.mjd,
      lam: m.lam,
      bw: m.bw,
      window: m.window,
      seen: false,
      ra: Number.NaN,
      dec: Number.NaN,
      posErr: Number.NaN,
      predRa: pred.ra,
      predDec: pred.dec,
      method: 'none',
      saturated: false,
      flux: Number.NaN,
      fluxErr: Number.NaN,
      lower: false,
      glow: null,
      snr: 0,
      skipped: null,
      cd: m.wcs.cd,
    };
    const blend = blendedWith(target, neighbours, m.mjd);
    if (blend) {
      const p = atDate(blend, m.mjd);
      const sep = separation(p.ra, p.dec, pred.ra, pred.dec) * 3600;
      out.push({
        ...base,
        skipped: `${blend.id} is ${sep.toFixed(1)}″ from where ${target.name} should be on this date, too close to tell the two apart`,
      });
      centres.push({ x: Number.NaN, y: Number.NaN });
      continue;
    }
    if (!(pp.x >= 0 && pp.y >= 0 && pp.x <= m.w - 1 && pp.y <= m.h - 1)) {
      out.push({ ...base, skipped: 'The target is outside this cutout' });
      centres.push({ x: Number.NaN, y: Number.NaN });
      continue;
    }
    const c = centroid(f, set.badMask, pp.x, pp.y);
    const cx = c.seen ? c.x : pp.x;
    const cy = c.seen ? c.y : pp.y;
    const ap = aperturePhotometry(f, set.badMask, cx, cy);
    const sky = c.seen ? wcsPix2Sky(m.wcs, c.x, c.y) : null;
    if (c.saturated) cores.set(m.det, [...(cores.get(m.det) ?? []), coreRadius(f, set.badMask, cx, cy)]);
    centres.push({ x: cx, y: cy });
    yield;
    out.push({
      ...base,
      seen: c.seen,
      ra: sky ? sky.ra : Number.NaN,
      dec: sky ? sky.dec : Number.NaN,
      posErr: c.seen ? (c.err ?? Number.NaN) * PIXEL_ARCSEC : Number.NaN,
      method: c.method,
      saturated: c.saturated,
      flux: ap.flux,
      fluxErr: ap.fluxErr,
      lower: ap.flagged,
      snr: c.snr,
    });
  }
  // The outer glow, with one ring per detector.
  out.forEach((ms, k) => {
    if (!ms.saturated) return;
    const rin = Math.max(0, ...(cores.get(ms.det) ?? []));
    const c = centres[k]!;
    if (!(rin > 0) || !Number.isFinite(c.x)) return;
    const g = glowTarget(set.frames[ms.frame]!, set.badMask, c.x, c.y, rin);
    ms.glow = Number.isFinite(g) ? g : null;
  });
  return out;
}

/** Which detector's frames a field has at all, in order. Handy for the detector strip. */
export function detectorsIn(field: Field): Det[] {
  return [...new Set(field.frames.map((f) => f.det))].sort((a, b) => a - b);
}
