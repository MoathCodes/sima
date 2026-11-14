/**
 * The change search (Find changes tab): difference spots, pairs, linking, known-star matching,
 * vetting and ranking (docs/tools.md, "1. Difference pictures"), with the movers from
 * core/movers.ts. Owner: lane B. Pure, so it can run in a Web Worker (O-T1).
 *
 * Honesty (H7): these are candidates to check. Nothing here or in the UI says "discovery".
 *
 * PHASE 0 STUB: finds nothing.
 */
import type { Det, Field, RealSet } from './types.ts';

/** How sure the search is, in the order the list ranks them. */
export type Verdict =
  | 'strong' // Strong signal
  | 'possible' // Possible
  | 'known' // Known: at a Gaia or CatWISE source, or the patch's target
  | 'blended' // Blended: a mover too close to a listed neighbour to separate
  | 'weak' // Weak: as expected from noise
  | 'not-confirmed' // Not confirmed: a check on the original exposures disagrees
  | 'artefact'; // Likely artefact: on one exposure only, or in a bright star's glare

/** What changed. */
export type ChangeKind = 'brighter' | 'fainter' | 'moved' | 'mover';

/** One candidate to check. */
export interface Candidate {
  /** Stable for a patch, detector and threshold (marks are kept per id). */
  id: string;
  /** 1 is listed first. */
  rank: number;
  kind: ChangeKind;
  verdict: Verdict;
  /** Position, degrees, and on the field grid (pixels). */
  ra: number;
  dec: number;
  x: number;
  y: number;
  /** Strength in noise units, or motion / error for a mover. */
  strength: number;
  /** Change of light and its 1σ error, µJy; NaN for a mover. */
  change: number;
  changeErr: number;
  /** Measured motion for a mover, mas/yr and arcsec/yr; null otherwise. */
  motion: { pmra: number; pmdec: number; total: number; totalErr: number } | null;
  /** The window where it shows, and the index (in Field.frames) of the exposure the frame jumps to. */
  window: number;
  frame: number;
  /** Windows it was seen on. */
  windows: number[];
  /** The catalogue source or target it sits on; null for an unknown spot. */
  known: { cat: 'gaia' | 'catwise' | 'target'; id: string; pmTotal: number | null } | null;
  /** In the glare of a bright star. */
  glare: boolean;
  /** Distance to a saturated star within 15 pixels on most exposures, arcsec; null when none. */
  nearSaturated: number | null;
  /** Noise spots at least this strong the search would give (Weak when 0.5 or more). */
  expectedFromNoise: number | null;
  /** The two checks on the exposures behind it, in words ("agrees", "no change seen", …). */
  checks: { eachExposure: string; fixedAperture: string };
  /** Why it was flagged, in words. */
  why: string;
}

/** One run of the search. */
export interface ChangeSearch {
  det: Det;
  /** Times the noise. */
  threshold: number;
  candidates: Candidate[];
  /** Not at a known source and not in glare. */
  unexplained: number;
  /** Spots noise alone would give at this threshold. */
  expected: number;
  /** The one-line status: "20 candidates in D3 · 9 unexplained · about 13 expected from noise". */
  status: string;
  /** A line about the patch's own target: its measured motion, or why it was not measured. */
  target: string;
  /** What this search can and cannot see, in words. */
  limits: string;
  /** How long the search took and the longest time it held the thread, ms. */
  ms: number;
  longestMs: number;
}

/**
 * Runs the change search on one detector.
 * PHASE 0 STUB: no candidates.
 *
 * @param field The frames on the viewer's grid.
 * @param set The original exposures (for the fixed-aperture checks and the movers); null for a
 *   simulated field.
 * @param det Detector, 1 to 6.
 * @param threshold Times the noise, 3 to 10 (PicSettings.threshold).
 */
export function findChanges(
  field: Field,
  set: RealSet | null,
  det: Det,
  threshold: number,
): ChangeSearch {
  return {
    det,
    threshold,
    candidates: [],
    unexplained: 0,
    expected: Number.NaN,
    status: 'Not searched yet: the science code is a phase 0 stub.',
    target: '',
    limits: '',
    ms: 0,
    longestMs: 0,
  };
}

/**
 * How many spots noise alone would give: (pixels searched ÷ pixels per beam) × 2 × the Gaussian
 * tail chance at the threshold, with a beam of 4π × 2 × psf² pixels.
 * PHASE 0 STUB: NaN.
 *
 * @param pixels Pixels searched.
 * @param threshold Times the noise.
 * @param psf Point-source sigma, pixels (default 1).
 */
export function falseAlarms(pixels: number, threshold: number, psf = 1): number {
  return Number.NaN;
}
