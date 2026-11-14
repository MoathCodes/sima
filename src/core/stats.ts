/**
 * Statistics: weighted means, χ² tests, line fits, spot photometry, the channel spectrum.
 * Owner: lane B. Pure. Maths and limits are in docs/tools.md ("Measure this spot").
 *
 * Wording rule for the UI (MSR-4): every number from here is shown with a plain explanation in
 * place. Never a bare χ², p or "degrees of freedom".
 */
import type { Det, RealSet } from './types.ts';
import { channelLam, channelOf } from './instrument.ts';
import { aperturePhotometry, nearestSaturated, wcsSky2Pix } from './real.ts';
import { PIXEL_ARCSEC } from './instrument.ts';

/** A χ² test: "did it change?". */
export interface Chi2 {
  chi2: number;
  /** Degrees of freedom. */
  dof: number;
  /** Chance of a χ² this large from noise alone (0 to 1). */
  p: number;
}

/** A weighted straight line y = a + b·x with 1σ errors. */
export interface LineFit {
  a: number;
  b: number;
  ea: number;
  eb: number;
  /** Covariance of a and b. */
  cov: number;
  chi2: number;
  dof: number;
}

/** The light in a fixed spot on one original exposure (no resampling). */
export interface SpotPoint {
  /** Index into RealSet.frames. */
  frame: number;
  mjd: number;
  det: Det;
  lam: number;
  window: number;
  /** µJy in a 2-pixel radius, sky from a ring 6 to 12 pixels out; NaN when flagged. */
  flux: number;
  err: number;
  /** A flagged pixel in the aperture: left out of the curve. */
  flagged: boolean;
  /** Distance to the nearest saturated pixel within 15 pixels, arcsec; null when none. */
  nearSaturated: number | null;
}

/** One point of the 102-channel spectrum. */
export interface ChannelPoint {
  /** 0 to 101. */
  channel: number;
  det: Det;
  /** Channel centre, µm. */
  lam: number;
  /** Weighted mean flux, µJy, and its error. */
  flux: number;
  err: number;
  /** Exposures in this channel. */
  n: number;
  /** Under 2σ: drawn hollow. */
  weak: boolean;
}

const ok = (v: number, e: number): boolean => Number.isFinite(v) && Number.isFinite(e) && e > 0;

/**
 * Weighted mean and its error (weights 1/err²). Non-finite values and errors are skipped.
 * NaN when nothing is left.
 */
export function weightedMean(
  values: ArrayLike<number>,
  errors: ArrayLike<number>,
): { mean: number; err: number } {
  let sw = 0;
  let swx = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    const e = errors[i]!;
    if (!ok(v, e)) continue;
    const w = 1 / (e * e);
    sw += w;
    swx += w * v;
  }
  if (sw === 0) return { mean: Number.NaN, err: Number.NaN };
  return { mean: swx / sw, err: 1 / Math.sqrt(sw) };
}

/**
 * "Did it change?": χ² of the values about their weighted mean, and p (the chance of a χ² this
 * large from noise alone). Degrees of freedom: the number of points minus one.
 */
export function chi2Test(values: ArrayLike<number>, errors: ArrayLike<number>): Chi2 {
  const { mean } = weightedMean(values, errors);
  let chi2 = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    const e = errors[i]!;
    if (!ok(v, e)) continue;
    chi2 += ((v - mean) / e) ** 2;
    n++;
  }
  if (n < 2) return { chi2: Number.NaN, dof: 0, p: Number.NaN };
  return { chi2, dof: n - 1, p: chi2Tail(chi2, n - 1) };
}

/** ln Γ(x), Lanczos (Numerical Recipes 6.1). */
function gammaln(x: number): number {
  const cof = [
    57.1562356658629235, -59.5979603554754912, 14.1360979747417471, -0.491913816097620199,
    0.339946499848118887e-4, 0.465236289270485756e-4, -0.983744753048795646e-4,
    0.158088703224912494e-3, -0.210264441724104883e-3, 0.217439618115212643e-3,
    -0.164318106536763890e-3, 0.844182239838527433e-4, -0.261908384015814087e-4,
    0.368991826595316234e-5,
  ];
  let y = x;
  const tmp0 = x + 5.2421875;
  const tmp = (x + 0.5) * Math.log(tmp0) - tmp0;
  let ser = 0.999999999999997092;
  for (const c of cof) ser += c / ++y;
  return tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularized lower incomplete gamma P(a, x) by its series (x < a + 1). */
function gser(a: number, x: number): number {
  let sum = 1 / a;
  let del = sum;
  let ap = a;
  for (let i = 0; i < 1000; i++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
}

/** Regularized upper incomplete gamma Q(a, x) by its continued fraction (x ≥ a + 1). */
function gcf(a: number, x: number): number {
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

/**
 * The chance of a χ² at least this large from noise alone: Q(dof/2, χ²/2), the regularized upper
 * incomplete gamma function (Numerical Recipes, chapter 6). NaN for dof < 1 or a χ² that is not
 * a number.
 */
export function chi2Tail(chi2: number, dof: number): number {
  if (!(dof >= 1) || !Number.isFinite(chi2)) return Number.NaN;
  if (chi2 <= 0) return 1;
  const a = dof / 2;
  const x = chi2 / 2;
  return x < a + 1 ? 1 - gser(a, x) : gcf(a, x);
}

/**
 * Weighted straight-line fit y = a + b·x (weights 1/err²), with the errors of both terms and
 * their covariance (Numerical Recipes 15.2). Points with a non-finite value or error are
 * skipped. NaN everywhere with fewer than two points or a single x.
 */
export function lineFit(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  err: ArrayLike<number>,
): LineFit {
  let S = 0;
  let Sx = 0;
  let Sy = 0;
  let Sxx = 0;
  let Sxy = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const yi = y[i]!;
    const e = err[i]!;
    if (!Number.isFinite(xi) || !ok(yi, e)) continue;
    const w = 1 / (e * e);
    S += w;
    Sx += w * xi;
    Sy += w * yi;
    Sxx += w * xi * xi;
    Sxy += w * xi * yi;
    n++;
  }
  const D = S * Sxx - Sx * Sx;
  if (n < 2 || !(D > 0) || D < 1e-12 * S * Sxx) {
    return {
      a: Number.NaN,
      b: Number.NaN,
      ea: Number.NaN,
      eb: Number.NaN,
      cov: Number.NaN,
      chi2: Number.NaN,
      dof: 0,
    };
  }
  const a = (Sxx * Sy - Sx * Sxy) / D;
  const b = (S * Sxy - Sx * Sy) / D;
  let chi2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const yi = y[i]!;
    const e = err[i]!;
    if (!Number.isFinite(xi) || !ok(yi, e)) continue;
    chi2 += ((yi - a - b * xi) / e) ** 2;
  }
  return {
    a,
    b,
    ea: Math.sqrt(Sxx / D),
    eb: Math.sqrt(S / D),
    cov: -Sx / D,
    chi2,
    dof: n - 2,
  };
}

/**
 * Visit averages and the "did it change?" test between them. If exposures inside one visit
 * scatter more than their error bars allow (χ² per degree of freedom inside the visits above 1),
 * the averages' errors are widened by its square root (SPEC 7.1.12), and `widenedBy` says by how
 * much (1 = not widened).
 *
 * @param points One value per exposure with its error and visit window.
 * @param opts `fitted`: parameters already fitted to these values that use up degrees of freedom
 *   inside the visits (the colour slope of `realCurve`), default 0.
 */
export function visitTest(
  points: readonly { window: number; value: number; err: number }[],
  opts: { fitted?: number } = {},
): {
  visits: { window: number; value: number; err: number; n: number }[];
  test: Chi2;
  widenedBy: number;
} {
  const byWindow = new Map<number, { value: number; err: number }[]>();
  for (const p of points) {
    if (!ok(p.value, p.err)) continue;
    const list = byWindow.get(p.window) ?? [];
    list.push(p);
    byWindow.set(p.window, list);
  }
  const visits: { window: number; value: number; err: number; n: number }[] = [];
  let within = 0;
  let withinDof = 0;
  for (const w of [...byWindow.keys()].sort((a, b) => a - b)) {
    const list = byWindow.get(w)!;
    const m = weightedMean(
      list.map((p) => p.value),
      list.map((p) => p.err),
    );
    for (const p of list) within += ((p.value - m.mean) / p.err) ** 2;
    withinDof += list.length - 1;
    visits.push({ window: w, value: m.mean, err: m.err, n: list.length });
  }
  withinDof -= opts.fitted ?? 0;
  const widenedBy = withinDof > 0 && within / withinDof > 1 ? Math.sqrt(within / withinDof) : 1;
  for (const v of visits) v.err *= widenedBy;
  const test = chi2Test(
    visits.map((v) => v.value),
    visits.map((v) => v.err),
  );
  return { visits, test, widenedBy };
}

/**
 * The light in a fixed 2-pixel aperture at a sky position on every original exposure, with sky
 * from a ring 6 to 12 pixels out (docs/tools.md). The same aperture as the target's own
 * measurements, so numbers compare. Exposures whose cutout does not hold the position are left
 * out.
 *
 * @param set The decoded patch.
 * @param ra Degrees.
 * @param dec Degrees.
 * @param det Only this detector, or all when omitted.
 */
export function spotPhotometry(set: RealSet, ra: number, dec: number, det?: Det): SpotPoint[] {
  const out: SpotPoint[] = [];
  set.frames.forEach((f, i) => {
    const m = f.meta;
    if (det !== undefined && m.det !== det) return;
    const p = wcsSky2Pix(m.wcs, ra, dec);
    if (!(p.x >= -0.5 && p.y >= -0.5 && p.x <= m.w - 0.5 && p.y <= m.h - 0.5)) return;
    const ap = aperturePhotometry(f, set.badMask, p.x, p.y);
    const sat = nearestSaturated(f, set.badMask, p.x, p.y, 15);
    out.push({
      frame: i,
      mjd: m.mjd,
      det: m.det,
      lam: m.lam,
      window: m.window,
      flux: ap.flagged ? Number.NaN : ap.flux,
      err: ap.fluxErr,
      flagged: ap.flagged,
      nearSaturated: sat === null ? null : sat * PIXEL_ARCSEC,
    });
  });
  return out;
}

/**
 * The 102-channel spectrum: each exposure to its nearest channel, each channel the weighted mean.
 * Points with no finite flux or error are skipped. Sorted by channel.
 */
export function channelSpectrum(
  points: readonly { lam: number; det: Det; flux: number; err: number }[],
): ChannelPoint[] {
  const by = new Map<number, { f: number[]; e: number[]; det: Det }>();
  for (const p of points) {
    if (!ok(p.flux, p.err) || !Number.isFinite(p.lam)) continue;
    const c = channelOf(p.lam, p.det);
    const b = by.get(c) ?? { f: [], e: [], det: p.det };
    b.f.push(p.flux);
    b.e.push(p.err);
    by.set(c, b);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([channel, b]) => {
      const m = weightedMean(b.f, b.e);
      return {
        channel,
        det: b.det,
        lam: channelLam(channel),
        flux: m.mean,
        err: m.err,
        n: b.f.length,
        weak: !(Math.abs(m.mean) >= 2 * m.err),
      };
    });
}

/** Median of the finite values; NaN when there are none. */
export function median(values: ArrayLike<number>): number {
  const a = finiteSorted(values);
  return medianOfSorted(a);
}

/** The finite values, sorted, in a typed array. */
export function finiteSorted(values: ArrayLike<number>): Float64Array {
  let n = 0;
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i]!)) n++;
  const a = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (Number.isFinite(v)) a[k++] = v;
  }
  return a.sort();
}

/** Median of values already sorted; NaN when empty. */
export function medianOfSorted(a: ArrayLike<number>): number {
  const n = a.length;
  if (n === 0) return Number.NaN;
  const h = n >> 1;
  return n % 2 ? a[h]! : (a[h - 1]! + a[h]!) / 2;
}

/**
 * Robust standard deviation: 1.4826 × the median absolute deviation of the finite values.
 * NaN when there are none.
 */
export function robustSigma(values: ArrayLike<number>): number {
  const a = finiteSorted(values);
  const m = medianOfSorted(a);
  if (!Number.isFinite(m)) return Number.NaN;
  for (let i = 0; i < a.length; i++) a[i] = Math.abs(a[i]! - m);
  a.sort();
  return 1.4826 * medianOfSorted(a);
}

const MINUS = '−';
const signed = (s: string): string => (s.startsWith('-') ? MINUS + s.slice(1) : s);

/** Rounds to `dec` decimals; a negative `dec` rounds to tens, hundreds… */
function fixed(v: number, dec: number): string {
  if (dec >= 0) return v.toFixed(dec);
  const p = 10 ** -dec;
  return (Math.round(v / p) * p).toFixed(0);
}

/**
 * A value with its error, rounded to the error's two significant figures: "0.52 ± 0.16".
 * Uses the true minus sign. Without a usable error, the value with three significant figures and
 * a dash for the error.
 */
export function roundToError(value: number, err: number): string {
  if (!Number.isFinite(value)) return '— ± —';
  if (!(Number.isFinite(err) && err > 0)) return `${signed(String(Number(value.toPrecision(3))))} ± —`;
  let dec = 1 - Math.floor(Math.log10(err));
  // Rounding can carry the error into the next power of ten (0.0996 → 0.10): keep two figures.
  if (Number(fixed(err, dec)) >= 10 ** (2 - dec)) dec -= 1;
  const v = fixed(value, dec);
  const zero = Number(v) === 0 ? v.replace('-', '') : v;
  return `${signed(zero)} ± ${fixed(err, dec)}`;
}
