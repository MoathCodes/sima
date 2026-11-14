/**
 * Lane E's small worker: a fixed spot's light on every exposure, off the page's thread (TLS-8).
 * The change search, stacks and the target's measurement run in lane B's worker (core/work.ts).
 * Owner: lane E. It only calls lane B's pure functions in src/core.
 *
 * Messages in: `{ type: 'data', gen, set, field }` once per patch, then `{ type: 'job', id, gen,
 * job }`. Out: `{ id, ok: true, result }` or `{ id, ok: false, error }`. A job for an older patch
 * (`gen`) is answered with an error and not run.
 */
import { runSpot } from './jobs.ts';
import type { Field, RealSet } from '../../core/types.ts';

interface Port {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const port = self as unknown as Port;

let data: { gen: number; set: RealSet | null; field: Field | null } = {
  gen: -1,
  set: null,
  field: null,
};

port.onmessage = (e: MessageEvent) => {
  const m = e.data as
    | { type: 'data'; gen: number; set: RealSet | null; field: Field | null }
    | { type: 'job'; id: number; gen: number; job: { ra: number; dec: number } };
  if (m.type === 'data') {
    data = { gen: m.gen, set: m.set, field: m.field };
    return;
  }
  if (m.gen !== data.gen) {
    port.postMessage({ id: m.id, ok: false, error: 'stale' });
    return;
  }
  try {
    const result = runSpot(m.job, data.set, data.field);
    port.postMessage({ id: m.id, ok: true, result });
  } catch (err) {
    port.postMessage({ id: m.id, ok: false, error: String(err) });
  }
};
