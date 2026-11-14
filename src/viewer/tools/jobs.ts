/**
 * The heavy jobs, as one pure function, so they run the same in the worker (worker.ts) and, where
 * there is no worker (tests), on the spot. Owner: lane E. Everything here is lane B's science.
 */
import { findChanges, type ChangeSearch } from '../../core/detect.ts';
import { measureTarget } from '../../core/real.ts';
import { fitMotion, lowerLimits, realCurve, type DetectorCurve } from '../../core/fit.ts';
import { channelSpectrum, spotPhotometry, type ChannelPoint, type SpotPoint } from '../../core/stats.ts';
import { stackAlong, type StackResult } from '../../core/stack.ts';
import type { CombineHow } from '../../core/picture.ts';
import type { Det, Field, Measurement, MotionFit, RealSet } from '../../core/types.ts';

/** A job for the worker. */
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

/** Runs one job. Throws when the job needs data the patch does not have. */
export function runJob(job: Job, set: RealSet | null, field: Field | null): JobResult {
  switch (job.kind) {
    case 'search':
      if (!field) throw new Error('no pictures');
      return findChanges(field, set, job.det, job.threshold);
    case 'target': {
      const target = field?.target;
      if (!set || !target) throw new Error('no target with real exposures');
      const ms = measureTarget(set, target);
      const fit = fitMotion(ms, target);
      const curves = realCurve(ms, target);
      const usable = ms.filter(
        (m) => m.seen && !m.lower && !m.saturated && !m.skipped && Number.isFinite(m.flux),
      );
      const spectrum = channelSpectrum(
        usable.map((m) => ({ lam: m.lam, det: m.det, flux: m.flux, err: m.fluxErr })),
      );
      return { ms, fit, curves, lower: lowerLimits(ms), spectrum };
    }
    case 'spot': {
      if (!set) throw new Error('no real exposures');
      const points = spotPhotometry(set, job.ra, job.dec);
      const spectrum = channelSpectrum(
        points
          .filter((p) => !p.flagged && Number.isFinite(p.flux))
          .map((p) => ({ lam: p.lam, det: p.det, flux: p.flux, err: p.err })),
      );
      return { points, spectrum };
    }
    case 'stack': {
      if (!field || !set) throw new Error('no real exposures');
      const dets = [...new Set(field.frames.map((f) => f.det))].sort((a, b) => a - b);
      return dets.map((d) => stackAlong(field, d, set.data.catalogue, job.how));
    }
  }
}
