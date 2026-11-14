/**
 * Fits: proper motion (and parallax), brightness curves, folded curves. Owner: lane B. Pure.
 * docs/data-format.md ("How the viewer uses the frames") and docs/tools.md give the methods.
 *
 * Honesty (H5): when something cannot be measured, the result says "not measured" and why. It
 * never falls back to a model or catalogue value.
 *
 * PHASE 0 STUB: nothing is ever measured.
 */
import type { Det, Measurement, MotionFit, Target } from './types.ts';
import type { Chi2 } from './stats.ts';

/** One exposure on a brightness curve, in magnitudes against its detector's own average. */
export interface CurvePoint {
  /** Index into the measurements given. */
  m: number;
  mjd: number;
  window: number;
  /** Change in magnitude (positive is fainter) and its 1σ error. */
  dmag: number;
  err: number;
  /** From the outer glow of a saturated core, not the aperture. */
  glow: boolean;
}

/** One detector's brightness curve (MSR-3, Brightness tab). */
export interface DetectorCurve {
  det: Det;
  points: CurvePoint[];
  /** Weighted mean of each visit, with widened errors. */
  visits: { window: number; mjd: number; dmag: number; err: number }[];
  /** "Did it change?" between visits; null with fewer than two visits. */
  test: Chi2 | null;
  /** Visit errors were multiplied by this (1 = not widened). */
  widenedBy: number;
  /** Weighted straight line through the visits, mag/yr, drawn only above 3σ; null when none. */
  trend: { slope: number; err: number; drawn: boolean } | null;
  /** False when the scatter within a visit is over 0.2 mag: the curve is not shown. */
  shown: boolean;
  /** Anything the panel must say about this curve, in words; null when nothing. */
  note: string | null;
}

/**
 * Proper motion from the measured positions: a straight line through every position where the
 * target was seen, refitted once without points more than 3 times the median distance (and at
 * least 1″) off. Needs at least three positions in at least two visits. With three or more
 * visits, parallax is fitted too, but shown only when trustworthy (SPEC 7.1.8).
 *
 * PHASE 0 STUB: not measured.
 *
 * @param ms Measurements from core/real.ts `measureTarget`.
 * @param target The target, for the catalogue comparison; null for a spot with no target.
 */
export function fitMotion(ms: readonly Measurement[], target: Target | null): MotionFit {
  return {
    ok: false,
    reason: 'Not measured yet: the science code is a phase 0 stub.',
    pmra: Number.NaN,
    pmdec: Number.NaN,
    pmraErr: Number.NaN,
    pmdecErr: Number.NaN,
    total: Number.NaN,
    totalErr: Number.NaN,
    pa: Number.NaN,
    ra: Number.NaN,
    dec: Number.NaN,
    ep: Number.NaN,
    used: 0,
    of: ms.length,
    visits: 0,
    outliers: [],
    stability: Number.NaN,
    parallax: null,
    catalogue: null,
    matches: null,
  };
}

/**
 * Brightness changes per detector (`realCurve`): each detector compared only with itself, a
 * straight line in wavelength plus one level per visit fitted and the line taken out; the
 * aperture, or the outer glow in every exposure when the core is saturated in any of them.
 * PHASE 0 STUB: no curves.
 */
export function realCurve(ms: readonly Measurement[], target: Target | null): DetectorCurve[] {
  return [];
}

/**
 * Exposures whose aperture had a flagged pixel, as lower limits for the spectrum.
 * PHASE 0 STUB: none.
 */
export function lowerLimits(ms: readonly Measurement[]): Measurement[] {
  return [];
}

/**
 * Folds a curve on a period (the Folded tab, for periodic stars).
 * PHASE 0 STUB: no points.
 *
 * @param period Days.
 * @param t0 MJD of phase 0 (default: the first point).
 * @returns Phase 0 to 1 for each point.
 */
export function foldCurve(
  points: readonly { mjd: number; dmag: number; err: number }[],
  period: number,
  t0?: number,
): { phase: number; dmag: number; err: number }[] {
  return [];
}
