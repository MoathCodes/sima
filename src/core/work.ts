/**
 * Heavy science without blocking the page (O-T1, O-T5, TLS-8): a typed promise API the page
 * calls. Owner: lane B. Lane E (Find changes, Stack) and lane D (building a patch, the frame's
 * pictures and their clean-up) use it.
 *
 * It runs each job in a Web Worker (core/worker.ts). Where Workers are not available (or one
 * cannot start), it runs the same steps on the page's own thread in slices of about 20 ms, with a
 * turn for the page between slices, so no task holds the page for more than 100 ms.
 *
 * ```ts
 * import { buildField, measure, pictures, searchChanges, stack, usePatch, cancelAll } from '../core/work.ts';
 *
 * const field = await buildField(set, { ra, dec, fov, target });  // off the page's thread
 * const ms = await measure(set, target);                          // the target, every exposure
 * usePatch(key, field, set);           // once per patch: sends it to the worker (a copy)
 * const ctl = new AbortController();
 * const search = await searchChanges(det, threshold, { signal: ctl.signal });
 * const st = await stack(det, track, 'mean', { signal: ctl.signal });
 * const [pix] = await pictures(field, [group], settings);  // a date's picture, cleaned up
 * ctl.abort();                          // a newer request replaces this one
 * ```
 *
 * Every promise rejects with an `AbortError` (a DOMException) when its signal aborts, and with an
 * Error naming the reason when the job fails. A call made before `usePatch` rejects.
 */
import type { CatalogueTrack, Det, Field, Group, Measurement, RealSet, Target } from './types.ts';
import type { CombineHow, PicSettings } from './picture.ts';
import { groupPictureSteps } from './blink.ts';
import { buildRealFieldSteps, measureTargetSteps } from './real.ts';
import { changeSteps, type ChangeSearch } from './detect.ts';
import { stackSteps, type StackResult } from './stack.ts';

/** A job as the worker receives it (internal; exported for core/worker.ts). */
export type Job =
  | { op: 'patch'; key: string; field: Field; set: RealSet | null }
  | { op: 'drop'; key: string }
  | { op: 'cancel' }
  | {
      op: 'build';
      set: RealSet;
      opts: { ra: number; dec: number; fov: number; target: Target | null };
    }
  | { op: 'measure'; set: RealSet; target: Target }
  | { op: 'search'; key: string; det: Det; threshold: number }
  | { op: 'stack'; key: string; det: Det; track: CatalogueTrack; how: CombineHow; name?: string }
  | { op: 'pictures'; key: string; groups: Group[]; p: PicSettings };

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
  patch: (key: string) => { key: string; field: Field; set: RealSet | null } | null,
  slice: number,
  cancelled: () => boolean,
): Promise<{ value: unknown; transfer: ArrayBuffer[]; ms: number; longestMs: number }> {
  let it: Generator<void, unknown>;
  let transferResult = false;
  if (job.op === 'build') {
    it = buildRealFieldSteps(job.set, job.opts);
    transferResult = true;
  } else if (job.op === 'measure') {
    it = measureTargetSteps(job.set, job.target);
  } else if (job.op === 'search' || job.op === 'stack' || job.op === 'pictures') {
    const p = patch(job.key);
    if (!p || p.key !== job.key) throw new Error('No patch: call usePatch first.');
    if (job.op === 'search') it = changeSteps(p.field, p.set, job.det, job.threshold);
    else if (job.op === 'pictures') {
      it = groupPictureSteps(p.field, job.groups, job.p);
      transferResult = true;
    } else {
      it = stackSteps(p.field, job.det, job.track, job.how, p.set, job.name);
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
type Patch = { key: string; field: Field; set: RealSet | null };
let current: Patch | null = null;
/** Every patch jobs may name, oldest first: the frame's (`current`) and the workspace's extra
 * frames' (`keepPatch`). At most MAX_PATCHES; the worker holds a copy of those in `sent`. */
const patches = new Map<string, Patch>();
const sent = new Set<string>();
const MAX_PATCHES = 8;

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
      sent.clear();
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
  if (w && (job.op === 'search' || job.op === 'stack' || job.op === 'pictures') && !sent.has(job.key)) {
    const p = patches.get(job.key);
    if (p) {
      sent.add(p.key);
      await post(w, { op: 'patch', key: p.key, field: p.field, set: p.set });
    }
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
    const r = await runSteps(job, (key) => patches.get(key) ?? null, 20, () => aborted);
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
  current = keep(key, field, set);
}

/**
 * Makes a patch available to `pictures` and `stack` without making it the current one (the
 * workspace's extra frames, src/workspace). The worker keeps up to eight patches; the oldest
 * that is not current is dropped first.
 */
export function keepPatch(key: string, field: Field, set: RealSet | null): void {
  const p = patches.get(key);
  if (p && p.field === field && p.set === set) {
    patches.delete(key);
    patches.set(key, p);
    return;
  }
  keep(key, field, set);
}

function keep(key: string, field: Field, set: RealSet | null): Patch {
  const p: Patch = { key, field, set };
  patches.delete(key);
  if (sent.delete(key) && worker) worker.postMessage({ id: nextId++, op: 'drop', key });
  patches.set(key, p);
  for (const old of patches.keys()) {
    if (patches.size <= MAX_PATCHES) break;
    if (old === key || old === current?.key) continue;
    patches.delete(old);
    if (sent.delete(old) && worker) worker.postMessage({ id: nextId++, op: 'drop', key: old });
  }
  return p;
}

/** The kept patch whose field this is, or null. */
function patchOf(field: Field): Patch | null {
  if (current?.field === field) return current;
  for (const p of patches.values()) if (p.field === field) return p;
  return null;
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
 * The test target measured on every exposure (core/real.ts `measureTarget`) off the page's thread:
 * R Draconis takes about 0.7 s. The fits that follow (core/fit.ts `fitMotion`, `realCurve`) take
 * under 30 ms and can run on the page. The array gets `ranOn`, `ms` and `longestMs` like the
 * other results.
 *
 * @param set The decoded patch (sent to the worker as a copy).
 */
export function measure(
  set: RealSet,
  target: Target,
  options?: WorkOptions,
): Promise<Measurement[] & WorkTiming> {
  return run<Measurement[]>({ op: 'measure', set, target }, options);
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
 * @param track Catalogue position and motion (frames.json `catalogue`), or a trial one.
 * @param how How the shifted frames are combined.
 * @param options Also `name`: what the motion is, for the labels ("trial motion" for the motion
 *   handle, O-V6; "catalogue motion" when left out).
 */
export function stack(
  det: Det,
  track: CatalogueTrack,
  how: CombineHow,
  options?: WorkOptions & { field?: Field; name?: string },
): Promise<StackResult & WorkTiming> {
  const p = options?.field ? patchOf(options.field) : current;
  if (!p) return Promise.reject(new Error('No patch: call usePatch first.'));
  const job: Job = { op: 'stack', key: p.key, det, track, how };
  if (options?.name) job.name = options.name;
  return run<StackResult>(job, options);
}

/**
 * The frame's pictures of these groups (core/blink.ts `groupPicture`: blended, then the clean-up
 * steps that are on) on the current patch, in the same order. The arrays are moved to the page.
 *
 * @param field The patch on screen; rejects unless it is the one given to `usePatch`.
 */
export function pictures(
  field: Field,
  groups: readonly Group[],
  p: PicSettings,
  options?: WorkOptions,
): Promise<Float32Array[] & WorkTiming> {
  const patch = patchOf(field);
  if (!patch) return Promise.reject(new Error('Not a patch given to usePatch or keepPatch.'));
  return run<Float32Array[]>({ op: 'pictures', key: patch.key, groups: [...groups], p: { ...p } }, options);
}

/** Stops the worker and every job (for tests, or when the page goes away). */
export function cancelAll(): void {
  worker?.terminate();
  worker = null;
  sent.clear();
  for (const [, p] of pending) p.reject(abortError());
  pending.clear();
}
