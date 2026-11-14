/**
 * The Web Worker that runs the heavy science off the page's thread (O-T1, O-T5, TLS-8): building
 * a patch's field, the change search, stacking and the frame's cleaned-up pictures. Owner: lane B.
 *
 * Do not import this file. The page talks to it only through core/work.ts, which starts it with
 * `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`.
 *
 * Messages in (from work.ts): `{ id, op: 'patch', key, field, set }` keeps a patch by its key for
 * the jobs that name it, and `{ id, op: 'drop', key }` forgets one; `{ id, op: 'build', set, opts }`, `{ id, op: 'measure', set, target }`,
 * `{ id, op: 'search', key, det, threshold }`, `{ id, op: 'stack', key, det, track, how }` and
 * `{ id, op: 'pictures', key, groups, p }` start a job; `{ id, op: 'cancel' }`
 * stops one. Messages out: `{ id, ok: true, value, ms, longestMs }` or `{ id, ok: false, error }`.
 *
 * Jobs are generators (core/real.ts `buildRealFieldSteps` and `measureTargetSteps`, core/detect.ts `changeSteps`,
 * core/stack.ts `stackSteps`, core/blink.ts `groupPictureSteps`). The worker runs their steps back to back for about 50 ms, then lets
 * its own event loop take a turn, so a cancel or a newer job is heard quickly.
 */
import type { Field, RealSet } from './types.ts';
import { runSteps, type Job } from './work.ts';

interface Scope {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}
const scope = globalThis as unknown as Scope;

/** The patches jobs may name, by key (work.ts sends them and says when to drop one). */
const patches = new Map<string, { key: string; field: Field; set: RealSet | null }>();
const running = new Map<number, { cancelled: boolean }>();

scope.onmessage = (e: MessageEvent) => {
  const msg = e.data as Job & { id: number };
  if (msg.op === 'cancel') {
    const r = running.get(msg.id);
    if (r) r.cancelled = true;
    return;
  }
  if (msg.op === 'patch') {
    patches.set(msg.key, { key: msg.key, field: msg.field, set: msg.set });
    scope.postMessage({ id: msg.id, ok: true, value: null, ms: 0, longestMs: 0 });
    return;
  }
  if (msg.op === 'drop') {
    patches.delete(msg.key);
    return;
  }
  const state = { cancelled: false };
  running.set(msg.id, state);
  runSteps(msg, (key) => patches.get(key) ?? null, 50, () => state.cancelled)
    .then(({ value, transfer, ms, longestMs }) => {
      running.delete(msg.id);
      if (state.cancelled) return;
      scope.postMessage({ id: msg.id, ok: true, value, ms, longestMs }, transfer);
    })
    .catch((err: unknown) => {
      running.delete(msg.id);
      if (state.cancelled) return;
      scope.postMessage({ id: msg.id, ok: false, error: String((err as Error)?.message ?? err) });
    });
};
