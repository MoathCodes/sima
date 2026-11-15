/**
 * Real exposures for the workspace's extra frames, through the same paths as the main frame
 * (viewer/load.ts): the five shipped targets, else the live service for any coordinate, else an
 * honest "no real pictures here". Never a simulation (SPEC-v1 F4). Owner: integrator (workspace).
 *
 * Decoded sets are shared: a frame on a shipped target reuses the main frame's set when it is
 * the same target, and two frames on one live spot share one fetch. Each frame builds its own
 * field (its own centre and size) off the page's thread (core/work.ts `buildField`), and hands it
 * to the worker (`keepPatch`) so its pictures and stacks are made there too.
 */
import { S, type Fov } from '../viewer/state.ts';
import { LIVE_API, POLL_MS, TARGET_RADIUS, centreOf, fetchSet, liveFov, releaseName, searchNote } from '../viewer/load.ts';
import { buildField, keepPatch } from '../core/work.ts';
import { TARGETS } from '../core/targets.ts';
import { separation } from '../core/astro.ts';
import { targetAt } from '../core/real.ts';
import type { Field, LiveStatus, RealSet, Target } from '../core/types.ts';

/** What a frame's patch is now. The words follow the main frame's (GEN-4, FRM-11). */
export interface PatchStatus {
  source: 'real' | 'live' | 'none' | 'loading';
  set: RealSet | null;
  field: Field | null;
  target: Target | null;
  /** Loading: what it waits for, in words. */
  what: string;
  /** Exposures fetched and wanted; null while not known. */
  done: number | null;
  total: number | null;
  /** No pictures: why, in one or two plain sentences. */
  why: string | null;
  /** A note on the data in force ("First look"), or ''. */
  step: string;
  /** Where the exposures are centred (a shipped target's own patch), for snapping a new frame. */
  centre: { ra: number; dec: number } | null;
}

export const NO_SERVICE = 'No live service: real pictures are available for the five test targets only.';

export function loadingStatus(what: string): PatchStatus {
  return { source: 'loading', set: null, field: null, target: null, what, done: null, total: null, why: null, step: '', centre: null };
}

const shipped = new Map<string, Promise<RealSet>>();
const live = new Map<string, Promise<RealSet>>();

/** A shipped target's decoded set: the main frame's own when it shows that target. */
function shippedSet(key: string, signal: AbortSignal): Promise<RealSet> {
  if (S.set?.key === key && S.set.origin === 'shipped') return Promise.resolve(S.set);
  let p = shipped.get(key);
  if (!p) {
    // Not tied to one frame's signal: other frames may wait on the same fetch.
    p = fetchSet(`${import.meta.env.BASE_URL}data/${key}/`, key, 'shipped', new AbortController().signal);
    p.catch(() => shipped.delete(key));
    shipped.set(key, p);
  }
  return abortable(p, signal);
}

function liveSet(folder: string, id: string, signal: AbortSignal): Promise<RealSet> {
  let p = live.get(folder);
  if (!p) {
    p = fetchSet(folder.endsWith('/') ? folder : `${folder}/`, id, 'live', new AbortController().signal);
    p.catch(() => live.delete(folder));
    live.set(folder, p);
  }
  return abortable(p, signal);
}

function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    p.then(resolve, reject);
  });
}

/** About the middle of the shipped exposures' dates (late 2025), MJD. */
const SHIPPED_MJD = 61000;

/**
 * The shipped target whose patch covers this spot, if any: near its catalogue position, or near
 * where it is in the shipped exposures (Barnard's Star has moved 1.7′ since its 2016 position).
 */
export function targetNear(ra: number, dec: number): Target | null {
  return (
    TARGETS.find((t) => {
      const now = targetAt(t, SHIPPED_MJD);
      return separation(t.ra, t.dec, ra, dec) < TARGET_RADIUS || separation(now.ra, now.dec, ra, dec) < TARGET_RADIUS;
    }) ?? null
  );
}

/**
 * Builds a frame's field on a set, centred on its anchor, and keeps it for the worker.
 *
 * @param id The frame's id: its worker patch is named after it.
 */
export async function fieldFor(
  id: string,
  set: RealSet,
  target: Target | null,
  at: { ra: number; dec: number },
  fov: Fov,
  signal: AbortSignal,
): Promise<Field> {
  const gridFov = Math.min(fov, set.data.size * 60);
  const field = await buildField(set, { ra: at.ra, dec: at.dec, fov: gridFov, target }, { signal });
  keepPatch(`ws:${id}:${set.key}:${at.ra.toFixed(5)}:${at.dec.toFixed(5)}:${gridFov}`, field, set);
  return field;
}

/**
 * Opens a frame's patch: calls `report` at each step (loading, first look, full set, or no
 * pictures) until it is done or `signal` aborts.
 *
 * @param id The frame's id.
 * @param at Where the frame looks, degrees.
 * @param fov Arcminutes.
 */
export async function openPatch(
  id: string,
  at: { ra: number; dec: number },
  fov: Fov,
  report: (s: PatchStatus) => void,
  signal: AbortSignal,
): Promise<void> {
  const target = targetNear(at.ra, at.dec);
  try {
    if (target) {
      report(loadingStatus(`Loading the real SPHEREx exposures of ${target.name}…`));
      const set = await shippedSet(target.key, signal);
      const field = await fieldFor(id, set, target, at, fov, signal);
      report({ ...loadingStatus(''), source: 'real', set, field, target, centre: centreOf(set.data) });
      return;
    }
    if (!LIVE_API) {
      report({ ...loadingStatus(''), source: 'none', why: NO_SERVICE });
      return;
    }
    await pollLive(id, at, fov, report, signal);
  } catch (err) {
    if (signal.aborted || (err as DOMException)?.name === 'AbortError') return;
    report({ ...loadingStatus(''), source: 'none', why: `The pictures could not be read (${err instanceof Error ? err.message : String(err)}).` });
  }
}

async function pollLive(
  id: string,
  at: { ra: number; dec: number },
  fov: Fov,
  report: (s: PatchStatus) => void,
  signal: AbortSignal,
): Promise<void> {
  let url = `${LIVE_API}?ra=${at.ra.toFixed(4)}&dec=${at.dec.toFixed(4)}&fov=${liveFov(fov)}`;
  let shown: 'first' | 'full' | null = null;
  let failures = 0;
  report(loadingStatus('Asking for the real SPHEREx exposures of this spot…'));
  const none = (why: string) => report({ ...loadingStatus(''), source: 'none', why });
  while (!signal.aborted) {
    let status: LiveStatus;
    try {
      const res = await fetch(url, { signal });
      const body = (await res.json()) as LiveStatus & { error?: string };
      if (!res.ok) {
        if (res.status === 503) {
          report(loadingStatus('NASA’s archive is busy with other spots. Waiting for a turn…'));
          await wait(POLL_MS * 2, signal);
          continue;
        }
        return none(`The live service refused this spot (${body.error || res.status}).`);
      }
      status = body;
      failures = 0;
    } catch (err) {
      if (signal.aborted) return;
      if (++failures < 3) {
        await wait(POLL_MS, signal);
        continue;
      }
      return none(`The live service did not answer (${err instanceof Error ? err.message : String(err)}).`);
    }
    url = `${LIVE_API}/${status.id}`;
    const step: 'first' | 'full' | null = status.full && shown !== 'full' ? 'full' : status.first && !shown ? 'first' : null;
    const folder = step === 'full' ? status.full : step === 'first' ? status.first : null;
    if (step && folder) {
      try {
        const set = await liveSet(folder, status.id, signal);
        const field = await fieldFor(id, set, null, at, fov, signal);
        shown = step;
        const rest = status.state === 'rest' ? `First look. Fetching the rest: ${status.done} of ${status.total}` : step === 'first' ? 'First look' : '';
        report({ ...loadingStatus(''), source: 'live', set, field, step: rest, centre: null });
        if (step === 'full' && status.state === 'ready') return;
      } catch (err) {
        if (signal.aborted) return;
        console.warn('workspace: a live set failed', err);
      }
    }
    switch (status.state) {
      case 'queued':
        if (!shown) report(loadingStatus('Waiting for a turn at NASA’s archive…'));
        break;
      case 'searching':
        if (!shown) report(loadingStatus(`Searching NASA’s archive for SPHEREx exposures of this spot…${searchNote(status)}`));
        break;
      case 'first':
      case 'rest':
        if (!shown) {
          report({
            ...loadingStatus(status.total ? `Fetching ${status.done} of ${status.total} real exposures…` : `Found ${status.found} exposures. Choosing a first look…`),
            done: status.total ? status.done : null,
            total: status.total || null,
          });
        }
        break;
      case 'ready':
        if (shown === 'full') return;
        if (!status.full && !status.first) return none('The live service sent no pictures.');
        break;
      case 'empty':
        return none(`SPHEREx has no released exposures of this spot yet (searched ${status.searched.length ? status.searched.map(releaseName).join(', ') : 'every release'}).`);
      case 'failed':
        if (shown) return;
        return none(`NASA’s archive could not give the pictures (${status.error || 'no reason given'}).`);
    }
    await wait(POLL_MS, signal);
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}
