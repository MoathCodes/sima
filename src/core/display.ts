/**
 * How pixel values become colours on screen: limits, stretches, colour maps and the histogram
 * (docs/tools.md, "Picture tab", after SAOImage DS9). Owner: lane B. Pure: the result is a plain
 * RGBA byte array; viewer code wraps it in ImageData.
 *
 * Each setting builds a 16,384-step lookup table once, so a redraw is one table lookup per
 * pixel. The default (asinh, noise-based limits, Band colours) is the app's normal look.
 */
import type { Det } from './types.ts';
import type { PicSettings, Stretch } from './picture.ts';

/** Steps in a lookup table. */
export const LUT_SIZE = 16384;

/** Black and white points, µJy per pixel. */
export interface Range {
  lo: number;
  hi: number;
}

/** Pixel values of a picture, counted on an asinh axis (sky and bright stars both get room). */
export interface Histogram {
  /** Bin edges in noise units above the sky: counts.length + 1 of them. */
  edges: number[];
  counts: number[];
}

/**
 * Noise-based limits: the white point, in noise units above the sky, for each stretch. The black
 * point is the sky itself. Asinh and log at 800 put the noise (1 unit) at about a tenth of full
 * brightness, a 5-unit star at about a quarter and a 50-unit star at about 0.6, so faint stars show
 * and bright ones are not burnt out (the old look: black 0, white 800). Sqrt and linear rise less
 * steeply, so their white is lower to keep faint stars visible.
 */
export const NOISE_WHITE: Readonly<Record<Stretch, number>> = Object.freeze({
  linear: 30,
  sqrt: 100,
  log: 800,
  asinh: 800,
  equal: 800,
});

/** Custom limits are kept in this range, in noise units above the sky (docs/tools.md). */
export const BLACK_MIN = -50;
export const WHITE_MAX = 100_000;
/** The smallest gap kept between custom black and white, noise units. */
export const MIN_GAP = 0.1;

/** Log stretch: log(a·x + 1) / log(a). */
const LOG_A = 1000;
/** Asinh stretch: asinh(s·x) / asinh(s). */
const ASINH_S = 500;

/**
 * Custom black and white points kept in range: black from −50, white up to 100,000 and always
 * above black (by at least MIN_GAP). These are the values in force, for the panel's boxes.
 * A value that is not a number takes the default (0 and 800).
 */
export function clampCustom(black: number, white: number): { black: number; white: number } {
  const b = Number.isFinite(black) ? Math.min(Math.max(black, BLACK_MIN), WHITE_MAX - MIN_GAP) : 0;
  const w0 = Number.isFinite(white) ? Math.min(white, WHITE_MAX) : 800;
  return { black: b, white: Math.max(w0, b + MIN_GAP) };
}

/** Finite values of a picture, sorted. */
function sortedFinite(pix: ArrayLike<number>): Float64Array {
  const out = new Float64Array(pix.length);
  let m = 0;
  for (let i = 0; i < pix.length; i++) {
    const v = pix[i];
    if (Number.isFinite(v)) out[m++] = v;
  }
  return out.subarray(0, m).sort();
}

/** Value at fraction q (0..1) of sorted values, linearly interpolated. */
function quantile(sorted: Float64Array, q: number): number {
  const pos = q * (sorted.length - 1);
  const i = Math.floor(pos);
  const j = Math.min(i + 1, sorted.length - 1);
  return sorted[i] + (sorted[j] - sorted[i]) * (pos - i);
}

/**
 * The sky (median) and noise (1.4826 × median absolute deviation) measured from the picture
 * itself. Used when the sky and noise passed in are not usable numbers.
 */
export function skyNoise(pix: ArrayLike<number>): { sky: number; sigma: number } {
  const s = sortedFinite(pix);
  if (s.length === 0) return { sky: Number.NaN, sigma: Number.NaN };
  const sky = quantile(s, 0.5);
  for (let i = 0; i < s.length; i++) s[i] = Math.abs(s[i] - sky);
  s.sort();
  return { sky, sigma: 1.4826 * quantile(s, 0.5) };
}

/** The noise passed in if usable, else measured from the picture. */
function usableNoise(
  pix: ArrayLike<number>,
  noise: { sky: number; sigma: number },
): { sky: number; sigma: number } {
  if (Number.isFinite(noise.sky) && Number.isFinite(noise.sigma) && noise.sigma > 0) return noise;
  return skyNoise(pix);
}

/**
 * IRAF zscale (as in IRAF `display` and astropy's ZScaleInterval): up to 1000 evenly spaced
 * samples, sorted; a straight line is fitted to them with 2.5-sigma rejection (rejected points
 * grown by 1% of the samples, at most 5 rounds); the limits are the median ∓ the slope ÷ 0.25
 * across the samples, kept inside the sample range.
 */
export function zscale(pix: ArrayLike<number>): Range {
  const NSAMPLES = 1000;
  const CONTRAST = 0.25;
  const KREJ = 2.5;
  const stride = Math.max(1, Math.floor(pix.length / NSAMPLES));
  const picked: number[] = [];
  for (let i = 0; i < pix.length && picked.length < NSAMPLES; i += stride) {
    const v = pix[i];
    if (Number.isFinite(v)) picked.push(v);
  }
  const s = Float64Array.from(picked).sort();
  const npix = s.length;
  if (npix === 0) return { lo: Number.NaN, hi: Number.NaN };
  let zmin = s[0];
  let zmax = s[npix - 1];
  const minpix = Math.max(5, Math.floor(npix * 0.5));
  const ngrow = Math.max(1, Math.floor(npix * 0.01));
  const bad = new Uint8Array(npix);
  let ngood = npix;
  let lastGood = npix + 1;
  let slope = 0;
  for (let iter = 0; iter < 5 && ngood < lastGood && ngood >= minpix; iter++) {
    // Least-squares line through the good samples (x = sample index).
    let sw = 0,
      sx = 0,
      sy = 0,
      sxx = 0,
      sxy = 0;
    for (let i = 0; i < npix; i++) {
      if (bad[i]) continue;
      sw++;
      sx += i;
      sy += s[i];
      sxx += i * i;
      sxy += i * s[i];
    }
    const den = sw * sxx - sx * sx;
    slope = den !== 0 ? (sw * sxy - sx * sy) / den : 0;
    const icpt = (sy - slope * sx) / sw;
    // Spread of the good samples about the line.
    let m = 0,
      m2 = 0;
    for (let i = 0; i < npix; i++) {
      if (bad[i]) continue;
      const f = s[i] - (icpt + slope * i);
      m += f;
      m2 += f * f;
    }
    m /= sw;
    const thr = KREJ * Math.sqrt(Math.max(0, m2 / sw - m * m));
    // Reject outliers, then grow each rejected sample into its neighbours.
    const rej = new Uint8Array(npix);
    for (let i = 0; i < npix; i++) {
      const f = s[i] - (icpt + slope * i);
      if (bad[i] || f < -thr || f > thr) rej[i] = 1;
    }
    const left = ngrow - 1 - Math.floor(ngrow / 2);
    const right = Math.floor(ngrow / 2);
    for (let i = 0; i < npix; i++) {
      if (!rej[i]) continue;
      for (let j = Math.max(0, i - left); j <= Math.min(npix - 1, i + right); j++) bad[j] = 1;
    }
    lastGood = ngood;
    ngood = 0;
    for (let i = 0; i < npix; i++) if (!bad[i]) ngood++;
  }
  if (ngood >= minpix) {
    slope /= CONTRAST;
    const center = Math.floor((npix - 1) / 2);
    const median = quantile(s, 0.5);
    zmin = Math.max(zmin, median - (center - 1) * slope);
    zmax = Math.min(zmax, median + (npix - center) * slope);
  }
  return { lo: zmin, hi: zmax };
}

/**
 * The black and white points in force for a picture, by the settings' method (noise based,
 * zscale, 99.5%, min to max, or custom in noise units above the sky, clamped).
 * The white point is always above the black point. A picture with no data gives 0 to 1.
 *
 * @param pix The picture, µJy per pixel.
 * @param p Settings in force.
 * @param noise The picture's sky level and noise, µJy. When they are not usable numbers they are
 *   measured from the picture (median and 1.4826 × MAD).
 */
export function limits(
  pix: Float32Array,
  p: PicSettings,
  noise: { sky: number; sigma: number },
): Range {
  let r: Range;
  if (p.limits === 'noise' || p.limits === 'custom') {
    const { sky, sigma } = usableNoise(pix, noise);
    const { black, white } =
      p.limits === 'custom'
        ? clampCustom(p.black, p.white)
        : { black: 0, white: NOISE_WHITE[p.stretch] };
    r = { lo: sky + black * sigma, hi: sky + white * sigma };
  } else if (p.limits === 'zscale') {
    r = zscale(pix);
  } else {
    const s = sortedFinite(pix);
    r =
      s.length === 0
        ? { lo: Number.NaN, hi: Number.NaN }
        : p.limits === 'pct'
          ? { lo: quantile(s, 0.005), hi: quantile(s, 0.995) }
          : { lo: s[0], hi: s[s.length - 1] };
  }
  if (!Number.isFinite(r.lo) || !Number.isFinite(r.hi)) return { lo: 0, hi: 1 };
  if (!(r.hi > r.lo)) r = { lo: r.lo, hi: r.lo + Math.max(Math.abs(r.lo) * 1e-6, 1e-6) };
  return r;
}

/**
 * The histogram under the Picture tab's black and white handles. The bins are even on an asinh
 * axis of noise units above the sky, from the faintest to the brightest pixel (always covering
 * at least 0 to 10 units). Every finite pixel is counted once.
 *
 * @param bins Number of bins.
 * @param noise Sky and noise, µJy; measured from the picture when not usable numbers.
 */
export function histogram(
  pix: Float32Array,
  bins: number,
  noise: { sky: number; sigma: number },
): Histogram {
  const nb = Math.floor(bins);
  const { sky, sigma } = usableNoise(pix, noise);
  if (!(nb > 0) || !Number.isFinite(sky) || !(sigma > 0)) return { edges: [], counts: [] };
  let tLo = 0;
  let tHi = Math.asinh(10);
  for (let i = 0; i < pix.length; i++) {
    const v = pix[i];
    if (!Number.isFinite(v)) continue;
    const t = Math.asinh((v - sky) / sigma);
    if (t < tLo) tLo = t;
    if (t > tHi) tHi = t;
  }
  const step = (tHi - tLo) / nb;
  const edges: number[] = [];
  for (let i = 0; i <= nb; i++) edges.push(Math.sinh(tLo + i * step));
  const counts = new Array<number>(nb).fill(0);
  for (let i = 0; i < pix.length; i++) {
    const v = pix[i];
    if (!Number.isFinite(v)) continue;
    const k = Math.floor((Math.asinh((v - sky) / sigma) - tLo) / step);
    counts[Math.min(Math.max(k, 0), nb - 1)]++;
  }
  return { edges, counts };
}

/**
 * Detector hues for the Band colour map, D1 to D6 (DESIGN.md tokens `d1`…`d6`, also
 * `--d1`…`--d6` in src/styles/app.css).
 */
export const BAND_HUES: readonly string[] = Object.freeze([
  '#8f7cff',
  '#4fa8ff',
  '#3fd0c0',
  '#a8d34f',
  '#f4b740',
  '#ff7650',
]);
/** Band colour map: black at 0, the detector's hue at this level, white at 1. */
const BAND_KNEE = 0.7;

/**
 * Matplotlib's inferno and viridis (CC0, van der Walt and Smith), 33 evenly spaced stops of the
 * published 256-entry tables, 6 hex digits each; linearly interpolated between stops.
 */
const INFERNO =
  '0000040403120b0724150b37210c4a2f0a5b3d09654a0c6b57106e64156e71196e7d1e6d8a226a972766a32c61b031' +
  '5bbc3754c63d4dd04545da4e3ce35933eb6429f1711ff67e14f98c0afb9b06fcaa0ffbba1ff9c932f5d949f2e865f3f5' +
  '86fcffa4';
const VIRIDIS =
  '440154470d6048186a482374472d7b4537814240863e49893b528b375b8d33638d2f6b8e2c728e297a8e26828e2389' +
  '8e21918c1f978b1f9f8821a68527ad8131b57b3dbc744cc26c5cc8636ece5881d34d95d840aadc32c0df25d5e21aea' +
  'e51afde725';

function hexStops(hex: string): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + 6 <= hex.length; i += 6) {
    out.push([0, 2, 4].map((k) => parseInt(hex.slice(i + k, i + k + 2), 16)));
  }
  return out;
}

/** Colour at y (0..1) along evenly spaced stops. */
function ramp(stops: number[][], y: number): number[] {
  const pos = y * (stops.length - 1);
  const i = Math.min(Math.floor(pos), stops.length - 2);
  const f = pos - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * f);
}

/** The stretch curve, 0..1 → 0..1 (not histogram equalisation). */
function stretchCurve(s: Stretch, x: number): number {
  switch (s) {
    case 'sqrt':
      return Math.sqrt(x);
    case 'log':
      return Math.log(LOG_A * x + 1) / Math.log(LOG_A);
    case 'asinh':
      return Math.asinh(ASINH_S * x) / Math.asinh(ASINH_S);
    default:
      return x;
  }
}

/**
 * Histogram equalisation curve over LUT_SIZE steps: the share of pixels between black and white
 * at or below each step, rescaled so the first step is 0 and the last is 1.
 */
function equalCurve(pix: Float32Array, range: Range): Float64Array | null {
  const cum = new Float64Array(LUT_SIZE);
  const scale = (LUT_SIZE - 1) / (range.hi - range.lo);
  let total = 0;
  for (let i = 0; i < pix.length; i++) {
    const v = pix[i];
    if (!(v >= range.lo && v <= range.hi)) continue;
    cum[Math.round((v - range.lo) * scale)]++;
    total++;
  }
  if (total === 0) return null;
  for (let i = 1; i < LUT_SIZE; i++) cum[i] += cum[i - 1];
  const first = cum[0];
  const span = total - first;
  for (let i = 0; i < LUT_SIZE; i++)
    cum[i] = span > 0 ? (cum[i] - first) / span : i / (LUT_SIZE - 1);
  return cum;
}

/**
 * A lookup table: LUT_SIZE RGBA entries (4 bytes each) from black to white, through the
 * stretch, brightness, contrast, colour map (Band uses the detector's hue) and invert.
 *
 * - Stretch: linear, sqrt, log (a = 1000), asinh (softening 500) or histogram equalisation.
 * - Brightness b and contrast c as DS9's bias and contrast: y' = (y − 0.5 + b/2) × c + 0.5,
 *   clamped to 0..1. Brightness 1 moves the curve up by half the range.
 * - Invert flips y' before the colour map (dark stars on a light sky).
 * - Band: black → the detector's hue (DESIGN.md `d1`…`d6`) at 0.7 → white, so bright stars turn
 *   white. A detector outside 1..6 gets grey.
 *
 * Histogram equalisation depends on the picture, so it needs `pix` and the `range` in force.
 * Without them (or with no pixels inside the range) it falls back to the linear curve.
 *
 * @param p Settings in force.
 * @param det Detector, for the Band colour map.
 * @param pix The picture, only for histogram equalisation.
 * @param range Black and white points in force, only for histogram equalisation.
 */
export function makeLut(
  p: PicSettings,
  det: Det,
  pix?: Float32Array,
  range?: Range,
): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE * 4);
  const eq =
    p.stretch === 'equal' && pix && range && range.hi > range.lo ? equalCurve(pix, range) : null;
  const b = Number.isFinite(p.brightness) ? p.brightness : 0;
  const c = Number.isFinite(p.contrast) && p.contrast > 0 ? p.contrast : 1;
  const stops =
    p.cmap === 'thermal'
      ? hexStops(INFERNO)
      : p.cmap === 'viridis'
        ? hexStops(VIRIDIS)
        : p.cmap === 'band'
          ? bandStops(det)
          : null;
  for (let i = 0; i < LUT_SIZE; i++) {
    const x = i / (LUT_SIZE - 1);
    let y = eq ? eq[i] : stretchCurve(p.stretch, x);
    y = Math.min(Math.max((y - 0.5 + b / 2) * c + 0.5, 0), 1);
    if (p.invert) y = 1 - y;
    const rgb = stops ? ramp(stops, y) : [255 * y, 255 * y, 255 * y];
    lut[i * 4] = rgb[0];
    lut[i * 4 + 1] = rgb[1];
    lut[i * 4 + 2] = rgb[2];
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

/** Band colour map as uneven stops, resampled to 101 even ones for `ramp`. */
function bandStops(det: Det): number[][] | null {
  const hex = BAND_HUES[det - 1];
  if (!hex) return null;
  const hue = hexStops(hex.slice(1))[0];
  const out: number[][] = [];
  for (let i = 0; i <= 100; i++) {
    const y = i / 100;
    out.push(
      y <= BAND_KNEE
        ? hue.map((h) => (h * y) / BAND_KNEE)
        : hue.map((h) => h + ((255 - h) * (y - BAND_KNEE)) / (1 - BAND_KNEE)),
    );
  }
  return out;
}

/**
 * Paints a picture: n × n values → n × n RGBA bytes, through `lut` between `range.lo` and
 * `range.hi`. NaN (no data) is drawn as pure black.
 *
 * @param out Optional array to fill (n × n × 4); a new one is made otherwise.
 */
export function toRgba(
  pix: Float32Array,
  range: Range,
  lut: Uint8ClampedArray,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  const dst = out ?? new Uint8ClampedArray(pix.length * 4);
  const top = LUT_SIZE - 1;
  const scale = range.hi > range.lo ? top / (range.hi - range.lo) : 0;
  const lo = range.lo;
  for (let i = 0, o = 0; i < pix.length; i++, o += 4) {
    const v = pix[i];
    if (v !== v) {
      dst[o] = 0;
      dst[o + 1] = 0;
      dst[o + 2] = 0;
      dst[o + 3] = 255;
      continue;
    }
    const t = (v - lo) * scale;
    const k = (t <= 0 ? 0 : t >= top ? top : (t + 0.5) | 0) * 4;
    dst[o] = lut[k];
    dst[o + 1] = lut[k + 1];
    dst[o + 2] = lut[k + 2];
    dst[o + 3] = lut[k + 3];
  }
  return dst;
}
