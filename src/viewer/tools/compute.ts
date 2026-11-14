/**
 * Runs Measure's and the tools' heavy jobs off the page's thread, so the page never holds still
 * for more than 100 ms (TLS-8, O-T1, O-T5). Owner: lane E.
 *
 * - The change search, the stacks and measuring the target: lane B's worker (core/work.ts).
 *   A new search stops the one still running (docs/tools.md: "If you change detector or
 *   threshold while the search runs, it stops and starts again").
 * - A fixed spot's light on every exposure: lane E's own small worker (worker.ts).
 *
 * Results are kept per patch, so switching tabs or detectors back and forth costs nothing.
 */
import { S, watch } from '../state.ts';
import { searchChanges, stack, type WorkTiming } from '../../core/work.ts';
import { targetMeasurements } from '../load.ts';
import { fitMotion, lowerLimits, realCurve } from '../../core/fit.ts';
import { channelSpectrum } from '../../core/stats.ts';
import type { ChangeSearch } from '../../core/detect.ts';
import { runSpot, type Job, type JobResult, type SpotResult, type StackSet, type TargetResult } from './jobs.ts';

/** Rejection reason for a job whose patch changed or that a newer job replaced. */
export const STALE = 'stale';

let gen = 0;
let nextId = 1;
const cache = new Map<string, Promise<JobResult>>();
/** Aborts every job of the patch on screen when it changes. */
let patchCtl = new AbortController();
/** Aborts the running search when a newer one starts. */
let searchCtl: AbortController | null = null;
let started = false;

/** Lane E's spot worker. */
let spotWorker: Worker | null = null;
let spotSent = -1;
const spotPending = new Map<number, { resolve: (r: SpotResult) => void; reject: (e: unknown) => void }>();

function start(): void {
  if (started) return;
  started = true;
  watch(['set', 'field'], () => {
    gen += 1;
    cache.clear();
    patchCtl.abort();
    patchCtl = new AbortController();
    searchCtl = null;
    for (const p of spotPending.values()) p.reject(STALE);
    spotPending.clear();
  });
}

/** Turns lane B's AbortError into STALE, so callers can ignore it. */
function quiet(err: unknown): never {
  if ((err as DOMException)?.name === 'AbortError') throw STALE;
  throw err;
}

/**
 * Runs a job on the patch on screen.
 *
 * @returns The result; rejects with STALE when the patch changed or a newer search replaced it
 *   (callers ignore that), or with an Error saying why it failed.
 */
export function compute<T extends JobResult>(job: Job): Promise<T> {
  start();
  const key = `${gen}|${JSON.stringify(job)}`;
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const p = run(job).catch((err: unknown) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, p);
  return p as Promise<T>;
}

async function run(job: Job): Promise<JobResult> {
  const field = S.field;
  const set = S.set;
  const myGen = gen;
  if (!field) throw new Error('no pictures');
  const signal = patchCtl.signal;
  switch (job.kind) {
    case 'search': {
      searchCtl?.abort();
      for (const k of [...cache.keys()]) if (k.includes('"kind":"search"') && !k.endsWith(JSON.stringify(job))) cache.delete(k);
      const ctl = new AbortController();
      searchCtl = ctl;
      signal.addEventListener('abort', () => ctl.abort(), { once: true });
      return (await searchChanges(job.det, job.threshold, { signal: ctl.signal }).catch(quiet)) as ChangeSearch &
        WorkTiming;
    }
    case 'target': {
      const target = field.target;
      if (!set || !target) throw new Error('no target with real exposures');
      // Lane D measures the target once per patch (load.ts); share it rather than measure again.
      const ms = await (targetMeasurements() ?? Promise.reject(new Error('no target with real exposures')));
      if (myGen !== gen) throw STALE;
      // The fits take under 30 ms (core/work.ts) and run here.
      const fit = fitMotion(ms, target);
      const curves = realCurve(ms, target);
      const usable = ms.filter((m) => m.seen && !m.lower && !m.saturated && !m.skipped && Number.isFinite(m.flux));
      const spectrum = channelSpectrum(usable.map((m) => ({ lam: m.lam, det: m.det, flux: m.flux, err: m.fluxErr })));
      return { ms: [...ms], fit, curves, lower: lowerLimits(ms), spectrum } satisfies TargetResult;
    }
    case 'stack': {
      if (!set) throw new Error('no real exposures');
      const dets = [...new Set(field.frames.map((f) => f.det))].sort((a, b) => a - b);
      const out: StackSet = [];
      // One detector after another; the detector on screen first.
      for (const d of [S.det, ...dets.filter((x) => x !== S.det)].filter((x) => dets.includes(x))) {
        out.push(await stack(d, set.data.catalogue, job.how, { signal }).catch(quiet));
        if (myGen !== gen) throw STALE;
      }
      return out.sort((a, b) => a.det - b.det);
    }
    case 'spot':
      return spot(job.ra, job.dec);
  }
}

function spot(ra: number, dec: number): Promise<SpotResult> {
  const w = spotWorkerOf();
  const myGen = gen;
  if (!w) {
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        if (myGen !== gen) return reject(STALE);
        try {
          resolve(runSpot({ ra, dec }, S.set, S.field));
        } catch (err) {
          reject(err);
        }
      }, 0),
    );
  }
  if (spotSent !== gen) {
    w.postMessage({ type: 'data', gen, set: S.set, field: null });
    spotSent = gen;
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    spotPending.set(id, { resolve, reject });
    w.postMessage({ type: 'job', id, gen, job: { ra, dec } });
  });
}

function spotWorkerOf(): Worker | null {
  if (spotWorker || typeof Worker === 'undefined') return spotWorker;
  try {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { id: number; ok: boolean; result?: SpotResult; error?: string };
      const p = spotPending.get(m.id);
      if (!p) return;
      spotPending.delete(m.id);
      if (m.ok && m.result) p.resolve(m.result);
      else p.reject(m.error === STALE ? STALE : new Error(m.error ?? 'failed'));
    };
    w.onerror = (e) => {
      e.preventDefault();
      for (const p of spotPending.values()) p.reject(new Error(e.message || 'the worker failed'));
      spotPending.clear();
      spotWorker?.terminate();
      spotWorker = null;
      spotSent = -1;
    };
    spotWorker = w;
  } catch {
    spotWorker = null;
  }
  return spotWorker;
}
