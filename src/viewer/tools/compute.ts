/**
 * Runs the heavy jobs (jobs.ts) in Web Workers so the page never holds still for more than
 * 100 ms (TLS-8, O-T1, O-T5). Owner: lane E.
 *
 * Two workers: one for the change search, one for Measure, so a long search never makes Measure
 * wait. Each gets the patch's data once (when `S.set` or `S.field` change). A new search while
 * one is still running stops the old one (the worker is replaced), as docs/tools.md asks: "If you
 * change detector or threshold while the search runs, it stops and starts again".
 *
 * Results are kept per patch, so switching tabs or detectors back and forth costs nothing.
 *
 * When lane B's worker API (src/core/work.ts) is merged, this file is the one place to switch.
 */
import { S, watch } from '../state.ts';
import { runJob, type Job, type JobResult } from './jobs.ts';

/** Rejection reason for a job whose patch has changed or that a newer job replaced. */
export const STALE = 'stale';

interface Pending {
  resolve: (r: JobResult) => void;
  reject: (e: unknown) => void;
}

interface Lane {
  worker: Worker | null;
  sent: number;
  pending: Map<number, Pending>;
}

let gen = 0;
let nextId = 1;
const cache = new Map<string, Promise<JobResult>>();
const lanes: Record<'search' | 'measure', Lane> = {
  search: { worker: null, sent: -1, pending: new Map() },
  measure: { worker: null, sent: -1, pending: new Map() },
};
let started = false;

function start(): void {
  if (started) return;
  started = true;
  watch(['set', 'field'], () => {
    gen += 1;
    cache.clear();
    for (const lane of Object.values(lanes)) if (lane.pending.size) restart(lane);
  });
}

function makeWorker(lane: Lane): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { id: number; ok: boolean; result?: JobResult; error?: string };
      const p = lane.pending.get(m.id);
      if (!p) return;
      lane.pending.delete(m.id);
      if (m.ok && m.result !== undefined) p.resolve(m.result);
      else p.reject(m.error === STALE ? STALE : new Error(m.error ?? 'failed'));
    };
    w.onerror = (e) => {
      e.preventDefault();
      for (const p of lane.pending.values()) p.reject(new Error(e.message || 'worker failed'));
      lane.pending.clear();
      restart(lane);
    };
    return w;
  } catch {
    return null;
  }
}

/** Stops whatever the lane's worker is doing; its jobs are rejected as stale. */
function restart(lane: Lane): void {
  lane.worker?.terminate();
  lane.worker = null;
  lane.sent = -1;
  for (const p of lane.pending.values()) p.reject(STALE);
  lane.pending.clear();
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
  const laneName = job.kind === 'search' ? 'search' : 'measure';
  const lane = lanes[laneName];
  if (laneName === 'search' && lane.pending.size) {
    // A newer search replaces the one still running.
    for (const k of [...cache.keys()]) if (k.includes('"kind":"search"')) cache.delete(k);
    restart(lane);
  }
  const p = run(lane, job).catch((err: unknown) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, p);
  return p as Promise<T>;
}

function run(lane: Lane, job: Job): Promise<JobResult> {
  lane.worker ??= makeWorker(lane);
  const w = lane.worker;
  const myGen = gen;
  if (!w) {
    // No worker (tests, or a browser without module workers): run here, after a turn.
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        if (myGen !== gen) return reject(STALE);
        try {
          resolve(runJob(job, S.set, S.field));
        } catch (err) {
          reject(err);
        }
      }, 0),
    );
  }
  if (lane.sent !== gen) {
    w.postMessage({ type: 'data', gen, set: S.set, field: S.field });
    lane.sent = gen;
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    lane.pending.set(id, { resolve, reject });
    w.postMessage({ type: 'job', id, gen, job });
  });
}

/** True while a change search is running. */
export function searching(): boolean {
  return lanes.search.pending.size > 0;
}
