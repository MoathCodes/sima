/**
 * Lane E's results, and the one job lane E runs in its own small worker: a fixed spot's light on
 * every exposure (`spotPhotometry`, 30 to 50 ms on R Draconis, so off the page: TLS-8). The change
 * search, the stacks and measuring the target run in lane B's worker (core/work.ts); see
 * compute.ts. Owner: lane E.
 */
import type { ChangeSearch } from '../../core/detect.ts';
import type { DetectorCurve } from '../../core/fit.ts';
import { channelSpectrum, spotPhotometry, type ChannelPoint, type SpotPoint } from '../../core/stats.ts';
import type { StackResult } from '../../core/stack.ts';
import type { CombineHow } from '../../core/picture.ts';
import type { Det, Field, Measurement, MotionFit, RealSet } from '../../core/types.ts';

/** A job, as compute() takes it. */
export type Job =
  | { kind: 'search'; det: Det; threshold: number }
  | { kind: 'target' }
  | { kind: 'spot'; ra: number; dec: number }
  | { kind: 'stack'; how: CombineHow };

/** The patch's own target, measured (MSR-1, MSR-3). */
export interface TargetResult {
  ms: Measurement[];
  fit: MotionFit;
  curves: DetectorCurve[];
  /** Exposures whose aperture had a flagged pixel: lower limits. */
  lower: Measurement[];
  spectrum: ChannelPoint[];
}

/** A fixed spot measured on every exposure. */
export interface SpotResult {
  points: SpotPoint[];
  spectrum: ChannelPoint[];
}

/** One stack per detector that has frames. */
export type StackSet = StackResult[];

export type JobResult = ChangeSearch | TargetResult | SpotResult | StackSet;

/** The spot job, run in lane E's worker (worker.ts) or, without one, on the page. */
export function runSpot(job: { ra: number; dec: number }, set: RealSet | null, _field: Field | null): SpotResult {
  if (!set) throw new Error('no real exposures');
  const points = spotPhotometry(set, job.ra, job.dec);
  const spectrum = channelSpectrum(
    points
      .filter((p) => !p.flagged && Number.isFinite(p.flux))
      .map((p) => ({ lam: p.lam, det: p.det, flux: p.flux, err: p.err })),
  );
  return { points, spectrum };
}
