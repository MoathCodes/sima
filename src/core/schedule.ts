/**
 * The labelled practice simulation, part 1 of 3: when a simulated SPHEREx would look (passes about
 * six months apart, a few visits each, each visit at its own wavelength). Owner: lane B. Pure.
 * Used with core/field.ts and core/frames.ts. Everything they make is labelled Simulated (H3).
 *
 * PHASE 0 STUB: an empty schedule.
 */
import type { Det } from './types.ts';

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

/**
 * A simulated observing schedule: every detector at every visit of every pass.
 * PHASE 0 STUB: always [].
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
  return [];
}
