/**
 * Heavy science without blocking the page (O-T1, O-T5, TLS-8): a typed promise API the page
 * calls. Owner: lane B. Lane E (Find changes, Stack) and lane D (building a patch) use it.
 *
 * It runs each job in a Web Worker (core/worker.ts). Where Workers are not available (or one
 * cannot start), it runs the same steps on the page's own thread in slices of about 20 ms, with a
 * turn for the page between slices, so no task holds the page for more than 100 ms.
 *
 * ```ts
 * import { buildField, searchChanges, stack, usePatch, cancelAll } from '../core/work.ts';
 *
 * const field = await buildField(set, { ra, dec, fov, target });  // off the page's thread
 * usePatch(key, field, set);           // once per patch: sends it to the worker (a copy)
 * const ctl = new AbortController();
 * const search = await searchChanges(det, threshold, { signal: ctl.signal });
 * const st = await stack(det, track, 'mean', { signal: ctl.signal });
 * ctl.abort();                          // a newer request replaces this one
 * ```
 *
 * Every promise rejects with an `AbortError` (a DOMException) when its signal aborts, and with an
 * Error naming the reason when the job fails. A call made before `usePatch` rejects.
 */
import type { CatalogueTrack, Det, Field, RealSet, Target } from './types.ts';
import type { CombineHow } from './picture.ts';
import { buildRealFieldSteps } from './real.ts';
import { changeSteps, type ChangeSearch } from './detect.ts';
import { stackSteps, type StackResult } from './stack.ts';

/** A job as the worker receives it (internal; exported for core/worker.ts). */
export type Job =
  | { op: 'patch'; key: string; field: Field; set: RealSet | null }
  | { op: 'cancel' }
  | {
      op: 'build';
      set: RealSet;
      opts: { ra: number; dec: number; fov: number; target: Target | null };
    }
  | { op: 'search'; key: string; det: Det; threshold: number }
  | { op: 'stack'; key: string; det: Det; track: CatalogueTrack; how: CombineHow };

/** Where the work ran, and how long it took (added to results). */
export interface WorkTiming {
  /** `worker`, or `page` when Workers are not available. */
  ranOn: 'worker' | 'page';
  /** Whole job, ms. */
  ms: number;
  /** Longest stretch it held its thread, ms (the page's thread only when `ranOn` is `page`). */
  longestMs: number;
}

/** Options of every call. */
export interface WorkOptions {
  /** Abort to stop the job (its promise then rejects with an AbortError). */
  signal?: AbortSignal;
}

const yieldToPage = (): Promise<void> =>
  new Promise((resolve) => {
    // A MessageChannel turn is not clamped to 4 ms like setTimeout; fall back to setTimeout.
    if (typeof MessageChannel !== 'undefined') {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        resolve();
      };
      ch.port2.postMessage(0);
    } else setTimeout(resolve, 0);
  });

/** Every Float32Array, Uint8Array and Uint32Array buffer inside a value, to transfer. */
function buffersOf(v: unknown, out: Set<ArrayBuffer> = new Set()): ArrayBuffer[] {
  if (v instanceof Float32Array || v instanceof Uint8Array || v instanceof Uint32Array) {
    if (v.buffer instanceof ArrayBuffer) out.add(v.buffer);
  } else if (Array.isArray(v)) {
    for (const x of v) buffersOf(x, out);
  } else if (v && typeof v === 'object') {
    for (const x of Object.values(v)) buffersOf(x, out);
  }
  return [...out];
}

/**
 * Runs a job's generator to the end in slices of `slice` ms, with a turn for the event loop
 * between slices (internal; used by core/worker.ts and by the page fallback).
 */
export async function runSteps(
  job: Job,
  patch: () => { key: string; field: Field; set: RealSet | null } | null,
  slice: number,
  cancelled: () => boolean,
): Promise<{ value: unknown; transfer: ArrayBuffer[]; ms: number; longestMs: number }> {
  let it: Generator<void, unknown>;
  let transferResult = false;
  if (job.op === 'build') {
    it = buildRealFieldSteps(job.set, job.opts);
    transferResult = true;
  } else if (job.op === 'search' || job.op === 'stack') {
    const p = patch();
    if (!p || p.key !== job.key) throw new Error('No patch: call usePatch first.');
    if (job.op === 'search') it = changeSteps(p.field, p.set, job.det, job.threshold);
    else {
      it = stackSteps(p.field, job.det, job.track, job.how, p.set);
      transferResult = true;
    }
  } else {
    throw new Error(`Unknown job ${job.op}`);
  }
  const t0 = performance.now();
  let longest = 0;
  for (;;) {
    const s0 = performance.now();
    let r: IteratorResult<void, unknown>;
    do {
      r = it.next();
    } while (!r.done && performance.now() - s0 < slice);
    longest = Math.max(longest, performance.now() - s0);
    if (r.done) {
      const value = r.value;
      return {
        value,
        transfer: transferResult ? buffersOf(value) : [],
        ms: performance.now() - t0,
        longestMs: longest,
      };
    }
    if (cancelled()) throw new DOMException('The work was cancelled.', 'AbortError');
    await yieldToPage();
    if (cancelled()) throw new DOMException('The work was cancelled.', 'AbortError');
  }
}

// ---------------------------------------------------------------------------------------------
// The page side
// ---------------------------------------------------------------------------------------------

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let current: { key: string; field: Field; set: RealSet | null } | null = null;
let sentKey: string | null = null;

/** The worker, started on first use; null where Workers are unavailable. */
function getWorker(): Worker | null {
  if (worker || workerFailed) return worker;
  if (typeof Worker === 'undefined') {
    workerFailed = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { id: number; ok: boolean; value?: unknown; error?: string; ms?: number; longestMs?: number };
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve({ value: m.value, ms: m.ms ?? 0, longestMs: m.longestMs ?? 0 });
      else p.reject(new Error(m.error ?? 'The worker failed.'));
    };
    worker.onerror = (e) => {
      // A worker that cannot load: fail what waits, and use the page from now on.
      e.preventDefault?.();
      workerFailed = true;
      worker?.terminate();
      worker = null;
      sentKey = null;
      for (const [, p] of pending) p.reject(new Error('The worker stopped; the job will run on the page.'));
      pending.clear();
    };
  } catch {
    workerFailed = true;
    worker = null;
  }
  return worker;
}

const abortError = (): DOMException => new DOMException('The work was cancelled.', 'AbortError');

/** Sends a job to the worker, or runs it on the page; resolves with its value and timing. */
async function run<T>(job: Job, opts: WorkOptions = {}): Promise<T & WorkTiming> {
  const { signal } = opts;
  if (signal?.aborted) throw abortError();
  const w = getWorker();
  if (w && (job.op === 'search' || job.op === 'stack') && current && sentKey !== current.key) {
    await post(w, { op: 'patch', key: current.key, field: current.field, set: current.set });
    sentKey = current.key;
  }
  if (w) {
    try {
      const r = (await post(w, job, signal)) as { value: T; ms: number; longestMs: number };
      return withTiming(r.value, 'worker', r.ms, r.longestMs);
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError' || !workerFailed) throw err;
      // The worker died: fall through to the page.
    }
  }
  let aborted = false;
  const onAbort = (): void => {
    aborted = true;
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const r = await runSteps(job, () => current, 20, () => aborted);
    return withTiming(r.value as T, 'page', r.ms, r.longestMs);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

function withTiming<T>(value: T, ranOn: 'worker' | 'page', ms: number, longestMs: number): T & WorkTiming {
  const v = value as T & Partial<WorkTiming> & { ms?: number; longestMs?: number };
  if (v && typeof v === 'object') {
    v.ranOn = ranOn;
    v.ms = ms;
    v.longestMs = longestMs;
  }
  return v as T & WorkTiming;
}

function post(w: Worker, job: Job, signal?: AbortSignal): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          if (!pending.has(id)) return;
          pending.delete(id);
          w.postMessage({ id, op: 'cancel' });
          reject(abortError());
        },
        { once: true },
      );
    }
    w.postMessage({ id, ...job });
  });
}

/**
 * Sets the patch that `searchChanges` and `stack` work on. Call it once each time a new patch is
 * on screen (a new field object). The worker gets a copy when the next job starts; the page keeps
 * its own. Pass the original exposures as `set` for real data (null for the practice simulation).
 *
 * @param key Any id that changes when the patch changes (target key, live job id, scenario key).
 */
export function usePatch(key: string, field: Field, set: RealSet | null): void {
  if (current && current.key === key && current.field === field && current.set === set) return;
  current = { key, field, set };
  sentKey = null;
}

/**
 * Builds a patch's field (core/real.ts `buildRealField`) off the page's thread. The returned
 * field's pixel arrays were made in the worker and moved to the page (no copy back).
 *
 * @param set The decoded patch (sent to the worker as a copy).
 */
export function buildField(
  set: RealSet,
  opts: { ra: number; dec: number; fov: number; target: Target | null },
  options?: WorkOptions,
): Promise<Field & WorkTiming> {
  return run<Field>({ op: 'build', set, opts }, options);
}

/**
 * The change search (core/detect.ts `findChanges`) on the current patch. `ms` is how long it
 * took; `longestMs` the longest hold of the thread it ran on (`ranOn`).
 *
 * @param det Detector, 1 to 6.
 * @param threshold Times the noise, 3 to 10.
 */
export function searchChanges(
  det: Det,
  threshold: number,
  options?: WorkOptions,
): Promise<ChangeSearch & WorkTiming> {
  if (!current) return Promise.reject(new Error('No patch: call usePatch first.'));
  return run<ChangeSearch>({ op: 'search', key: current.key, det, threshold }, options);
}

/**
 * A stack along a catalogue motion with its two controls (core/stack.ts `stackAlong`) on the
 * current patch, measured on the original exposures when the patch has them.
 *
 * @param det Detector, 1 to 6.
 * @param track Catalogue position and motion (frames.json `catalogue`).
 * @param how How the shifted frames are combined.
 */
export function stack(
  det: Det,
  track: CatalogueTrack,
  how: CombineHow,
  options?: WorkOptions,
): Promise<StackResult & WorkTiming> {
  if (!current) return Promise.reject(new Error('No patch: call usePatch first.'));
  return run<StackResult>({ op: 'stack', key: current.key, det, track, how }, options);
}

/** Stops the worker and every job (for tests, or when the page goes away). */
export function cancelAll(): void {
  worker?.terminate();
  worker = null;
  sentKey = null;
  for (const [, p] of pending) p.reject(abortError());
  pending.clear();
}
