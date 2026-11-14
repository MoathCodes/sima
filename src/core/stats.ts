/**
 * Statistics: weighted means, χ² tests, line fits, spot photometry, the channel spectrum.
 * Owner: lane B. Pure. Maths and limits are in docs/tools.md ("Measure this spot").
 *
 * Wording rule for the UI (MSR-4): every number from here is shown with a plain explanation in
 * place. Never a bare χ², p or "degrees of freedom".
 *
 * PHASE 0 STUB: every function returns a fixed fake value (NaN, empty, "not measured").
 */
import type { Det, RealSet } from './types.ts';

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

/**
 * Weighted mean and its error (weights 1/err²). Non-finite values and errors are skipped.
 * PHASE 0 STUB: NaN.
 */
export function weightedMean(
  values: ArrayLike<number>,
  errors: ArrayLike<number>,
): { mean: number; err: number } {
  return { mean: Number.NaN, err: Number.NaN };
}

/**
 * "Did it change?": χ² of the values about their weighted mean, and p.
 * PHASE 0 STUB: NaN, 0 degrees of freedom.
 */
export function chi2Test(values: ArrayLike<number>, errors: ArrayLike<number>): Chi2 {
  return { chi2: Number.NaN, dof: 0, p: Number.NaN };
}

/**
 * The chance of a χ² at least this large from noise alone: Q(dof/2, χ²/2), the regularized upper
 * incomplete gamma function (Numerical Recipes, chapter 6).
 * PHASE 0 STUB: NaN.
 */
export function chi2Tail(chi2: number, dof: number): number {
  return Number.NaN;
}

/**
 * Weighted straight-line fit with errors on both terms.
 * PHASE 0 STUB: NaN everywhere.
 */
export function lineFit(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  err: ArrayLike<number>,
): LineFit {
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

/**
 * Visit averages and the "did it change?" test between them. If exposures inside one visit
 * scatter more than their error bars allow, the averages' errors are widened by that much
 * (SPEC 7.1.12), and `widenedBy` says by how much (1 = not widened).
 *
 * PHASE 0 STUB: no visits, nothing tested.
 *
 * @param points One value per exposure with its error and visit window.
 */
export function visitTest(points: readonly { window: number; value: number; err: number }[]): {
  visits: { window: number; value: number; err: number; n: number }[];
  test: Chi2;
  widenedBy: number;
} {
  return { visits: [], test: { chi2: Number.NaN, dof: 0, p: Number.NaN }, widenedBy: 1 };
}

/**
 * The light in a fixed 2-pixel aperture at a sky position on every original exposure, with sky
 * from a ring 6 to 12 pixels out (docs/tools.md). The same aperture as the target's own
 * measurements, so numbers compare.
 *
 * PHASE 0 STUB: no points.
 *
 * @param set The decoded patch.
 * @param ra Degrees.
 * @param dec Degrees.
 * @param det Only this detector, or all when omitted.
 */
export function spotPhotometry(set: RealSet, ra: number, dec: number, det?: Det): SpotPoint[] {
  return [];
}

/**
 * The 102-channel spectrum: each exposure to its nearest channel, each channel the weighted mean.
 * PHASE 0 STUB: no points.
 */
export function channelSpectrum(
  points: readonly { lam: number; det: Det; flux: number; err: number }[],
): ChannelPoint[] {
  return [];
}

/**
 * Median of the finite values; NaN when there are none.
 * PHASE 0 STUB: NaN.
 */
export function median(values: ArrayLike<number>): number {
  return Number.NaN;
}

/**
 * Robust standard deviation: 1.4826 × the median absolute deviation of the finite values.
 * PHASE 0 STUB: NaN.
 */
export function robustSigma(values: ArrayLike<number>): number {
  return Number.NaN;
}

/**
 * A value with its error, rounded to the error's two significant figures: "0.52 ± 0.16".
 * Uses the true minus sign. PHASE 0 STUB: fixed text.
 */
export function roundToError(value: number, err: number): string {
  return '— ± —';
}
