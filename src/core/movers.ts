/**
 * Finding stars that creep: positions on every exposure and a straight-line motion fit, the way
 * catalogues measure motion (docs/tools.md, "2. Positions"). Owner: lane B. Pure.
 *
 * PHASE 0 STUB: finds nothing.
 */
import type { Det, RealSet } from './types.ts';

/** A source whose measured motion stands out of its error. */
export interface Mover {
  /** Mean position, degrees. */
  ra: number;
  dec: number;
  /** Measured motion, mas/yr (east times cos dec, north), with 1σ errors (widened when the
   *  points scatter more than their errors allow). */
  pmra: number;
  pmdec: number;
  pmraErr: number;
  pmdecErr: number;
  /** Total motion and its error, arcsec/yr. */
  total: number;
  totalErr: number;
  /** total / totalErr. Listed as "Moved?" when at least the search threshold. */
  sigma: number;
  /** Exposures with a position. */
  n: number;
  /** The centre was saturated: never "Strong signal". */
  saturated: boolean;
}

/**
 * Measures every source that stands out of one exposure's noise (peak 5×, at most 150, brightest
 * first) on every exposure of a detector and fits its motion.
 * PHASE 0 STUB: no movers.
 *
 * @param set The decoded patch.
 * @param det Detector, 1 to 6.
 * @param threshold List a source when its motion is at least this many times its error.
 * @returns The movers; how many sources were measured; and a plain note on what was not
 *   measured and why (shown in "About <target>, noise and limits").
 */
export function findMovers(
  set: RealSet,
  det: Det,
  threshold: number,
): { movers: Mover[]; measured: number; note: string } {
  return { movers: [], measured: 0, note: 'Not searched yet: the science code is a phase 0 stub.' };
}
