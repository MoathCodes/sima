/**
 * The labelled practice simulation, part 1 of 3: when a simulated SPHEREx would look (passes about
 * six months apart, a few visits each, each visit at its own wavelength). Owner: lane B. Pure.
 * Used with core/field.ts and core/frames.ts. Everything they make is labelled Simulated (H3).
 *
 * Like the real survey, one sky point lands on a different part of each detector's filter at each
 * visit, so its wavelength changes from visit to visit (SPEC 7.1.1). The first visit of every pass
 * is kept within a fifth of a bandwidth of one wavelength per detector, so every pass has a
 * same-colour partner in every other pass and blinking compares like with like.
 */
import type { Det } from './types.ts';
import { BAND_EDGES, DETECTORS } from './instrument.ts';
import { rng } from './math.ts';

/** One simulated exposure's date and colour. */
export interface SimExposure {
  /** MJD. */
  mjd: number;
  /** Visit window (pass), from 0. */
  window: number;
  /** Visit inside the window, from 0. */
  visit: number;
  det: Det;
  /** Wavelength and bandwidth, µm. */
  lam: number;
  bw: number;
}

/** Days between passes: half a year, as the survey scans the whole sky twice a year. */
export const PASS_DAYS = 182.6;
/** The practice patch's plan: first pass (MJD 60810, May 2025), passes, visits per pass. */
export const SIM_START = 60810;
export const SIM_WINDOWS = 3;
export const SIM_VISITS = 2;

/**
 * Resolving power λ/Δλ per detector (index 0 is D1): about 41 in D1–D4 and 120 in D5 and D6, as
 * the bandwidths in the shipped files show (core/instrument.ts).
 */
export const RESOLVING_POWER: readonly number[] = Object.freeze([41, 41, 41, 41, 120, 120]);

/** Spread of the partner visit's wavelength around its detector's anchor, in bandwidths (±). */
const PARTNER_SPREAD = 0.2;

/**
 * A simulated observing schedule: every detector at every visit of every pass.
 *
 * Passes start `PASS_DAYS` apart (with up to a day of jitter); visits inside a pass are 2 to 4
 * days apart. All six detectors see the patch at once, so they share each visit's date. In time
 * order, then by detector.
 *
 * @param opts `start`: MJD of the first pass; `windows`: passes; `visits`: visits per pass;
 *   `seed`: the same seed gives the same schedule.
 */
export function simSchedule(opts: {
  start: number;
  windows: number;
  visits: number;
  seed: number;
}): SimExposure[] {
  const rand = rng(opts.seed * 7919 + 17);
  const windows = Math.max(0, Math.floor(opts.windows));
  const visits = Math.max(0, Math.floor(opts.visits));

  // One anchor wavelength per detector, away from the band edges: the partner visits sit near it.
  const anchor: number[] = [];
  for (let d = 1; d <= DETECTORS; d++) anchor.push(inBand(d, 0.25 + 0.5 * rand()));

  const out: SimExposure[] = [];
  for (let w = 0; w < windows; w++) {
    let mjd = opts.start + w * PASS_DAYS + (rand() - 0.5);
    for (let v = 0; v < visits; v++) {
      if (v > 0) mjd += 2 + 2 * rand();
      for (let d = 1; d <= DETECTORS; d++) {
        const r = RESOLVING_POWER[d - 1]!;
        let lam: number;
        if (v === 0) {
          lam = anchor[d - 1]! * (1 + (PARTNER_SPREAD * (2 * rand() - 1)) / r);
        } else {
          lam = inBand(d, 0.05 + 0.9 * rand());
        }
        out.push({ mjd, window: w, visit: v, det: d, lam, bw: lam / r });
      }
    }
  }
  return out;
}

/** A wavelength a fraction `f` (0 to 1, in log wavelength) of the way across detector `d`. */
function inBand(d: Det, f: number): number {
  const lo = Math.log(BAND_EDGES[d - 1]!);
  const hi = Math.log(BAND_EDGES[d]!);
  return Math.exp(lo + f * (hi - lo));
}
