/**
 * Loading a patch into the frame: shipped targets (public/data), any coordinate through the
 * live service (docs/live-service.md), and the labelled practice simulation. Owner: lane D.
 *
 * It writes the patch and data fields of `S` (ra, dec, fov, target, label, source, set, field,
 * load), builds the flip-book (`groups`), tells the sky through the bus (`patch` at every change
 * and loading step, `shown` when the picture changes) and starts playback.
 *
 * Every load has a number; a newer load (another aim, another target) silently replaces an
 * older one, whose late answers are dropped.
 *
 * A field wider than the exposures on hand (a larger field size, a pan, a dragged patch) keeps
 * the pictures on screen and asks the live service for real exposures of the wider field in the
 * background (surround.ts `widerPatch`); they replace the narrower ones when they arrive. Until
 * then, or without the service, the frame shows the sky map around them, dimmed and labelled.
 */
import { S, nearestFov, pic, type Fov, type LoadState } from './state.ts';
import { draw } from './render.ts';
import { pause, play, reducedMotion } from './playback.ts';
import { emit, type PatchSource } from '../shell/bus.ts';
import { decodeFrames, fieldGrid } from '../core/real.ts';
import { buildField, measure, usePatch } from '../core/work.ts';
import { groupFrames, sameColourOnly } from '../core/blink.ts';
import { detectorOf } from '../core/instrument.ts';
import { TARGETS, targetByKey } from '../core/targets.ts';
import { SCENARIOS } from '../core/field.ts';
import { simulate } from '../core/frames.ts';
import { formatCoords, separation } from '../core/astro.ts';
import {
  centreOf,
  covers,
  liveFov,
  nominal,
  overlaps,
  pinCentre,
  setWidening,
  widerPatch,
} from './surround.ts';
import { SEED_BASE, resolveFolder, seedFor } from './seed.ts';
import type {
  Det,
  Field,
  Group,
  LiveStatus,
  Measurement,
  RealSet,
  Target,
  TargetData,
} from '../core/types.ts';

/** The live service's address (`/api/patch` in dev), or '' when there is none (FRM-11). */
export const LIVE_API: string = (import.meta.env.VITE_LIVE_API ?? '').replace(/\/$/, '');

/** `resolveFolder` for this page and its service. */
export function liveFolder(folder: string): string {
  return resolveFolder(folder, LIVE_API, location.href);
}
/** How often the live service is asked how far it got (docs/live-service.md). */
export const POLL_MS = 1500;
/** A spot this close to a shipped target's track opens the target's own pictures, degrees. */
export const TARGET_RADIUS = 1.5 / 60;

/** Why a spot has no pictures, for the frame's "No pictures here" card (FRM-11). */
export interface NoPictures {
  /** One plain sentence: why. */
  why: string;
  /** A second sentence: what the user can do, or null. */
  more: string | null;
  /** True when asking again may help (the live service or NASA's archive failed): a Retry button. */
  retry?: boolean;
}

/** Why the frame shows nothing, while `S.source` is `none`; null otherwise. */
export let noPictures: NoPictures | null = null;
/** Extra lines the frame shows about the live fetch (the service's warning). */
export let liveNote = '';
/** A note about the data in force, for the data line (e.g. "First look: 12 of 36"). */
export let stepNote = '';
/** The live job of the patch on screen, if any (for lane E's catalogue). */
export let liveJob: LiveStatus | null = null;
/** Passes left out by "Same wavelength only", in words ("pass B"). */
export let missingPasses: string[] = [];

/** Listeners for the preview picture (frame.ts draws it under the cover). */
const previewFns = new Set<(c: OffscreenCanvas | null) => void>();
export function onPreview(fn: (c: OffscreenCanvas | null) => void): () => void {
  previewFns.add(fn);
  return () => previewFns.delete(fn);
}

let seq = 0;
let abort: AbortController | null = null;

/**
 * The spot's own exposures (shipped, or fetched live for the spot) and its test target. Every
 * field size and pan of the spot starts from these.
 */
let home: { set: RealSet; target: Target | null } | null = null;
/** Real sets fetched live for wider fields, newest last; kept across loads for reuse. */
const onHand: RealSet[] = [];
const ON_HAND = 4;
/**
 * The field last asked for (`place`): centre and size. `S` takes them only once its pictures are
 * cut, so a wider set arriving meanwhile is placed by this, not by `S`.
 */
let wanted: { ra: number; dec: number; fov: Fov } | null = null;

/** Starts a new load: the older one's answers are ignored from now on. */
function begin(): { id: number; signal: AbortSignal } {
  abort?.abort();
  abort = new AbortController();
  seq += 1;
  noPictures = null;
  liveNote = '';
  stepNote = '';
  liveJob = null;
  missingPasses = [];
  home = null;
  wanted = null;
  stopWidening();
  return { id: seq, signal: abort.signal };
}
const current = (id: number) => id === seq;

/**
 * Opens a shipped target or a practice patch in the frame.
 *
 * @param id A key from core/targets.ts (`barnard`, `eps-indi-b`, `wise-0855`, `rw-aur`,
 *   `r-dra`) or core/field.ts SCENARIOS (`warm-up`, `planet-x`).
 * @param opts `fov`: arcminutes (rounded to FOVS); leave out for the target's own field size.
 * @returns Resolves when the first pictures are on screen, or when the frame has said why there
 *   are none.
 */
export async function loadTarget(id: string, opts: { fov?: number } = {}): Promise<void> {
  const target = targetByKey(id);
  const scenario = SCENARIOS[id];
  if (!target && !scenario) {
    const { id: n } = begin();
    S.target = null;
    S.label = `Unknown target "${id}"`;
    clearData('none');
    noPictures = {
      why: `Sima has no target called "${id}".`,
      more: 'Choose one of the five test targets below.',
    };
    if (current(n)) announce();
    return;
  }
  if (scenario) return loadPractice(scenario.key, opts.fov);
  if (target) return loadShipped(target, opts.fov);
}

async function loadShipped(target: Target, fov?: number): Promise<void> {
  const { id, signal } = begin();
  pause();
  S.target = target.key;
  S.label = target.name;
  S.ra = target.ra;
  S.dec = target.dec;
  S.fov = nearestFov(fov ?? S.fov);
  startLoading('shipped', `Loading the real SPHEREx exposures of ${target.name}…`);
  announce();
  try {
    const base = `${import.meta.env.BASE_URL}data/${target.key}/`;
    const set = await fetchSet(base, target.key, 'shipped', signal);
    if (!current(id)) return;
    home = { set, target };
    const own = fov === undefined ? nearestFov(set.data.fov) : S.fov;
    await place(centreOf(set.data), own, null);
  } catch (err) {
    if (!current(id) || signal.aborted) return;
    console.warn('load: shipped data failed', err);
    clearData('none');
    noPictures = {
      why: `The pictures of ${target.name} could not be read (${errText(err)}).`,
      more: 'Reload the page to try again.',
    };
    announce();
  }
}

async function loadPractice(key: string, fov?: number): Promise<void> {
  const scenario = SCENARIOS[key];
  if (!scenario) return;
  begin();
  pause();
  const field = simulate(scenario);
  S.target = key;
  S.label = `Simulated: ${scenario.title}`;
  S.ra = scenario.ra;
  S.dec = scenario.dec;
  S.fov = nearestFov(fov ?? scenario.fov);
  S.set = null;
  S.field = field;
  S.load = null;
  S.source = 'simulated';
  usePatch(`practice|${key}`, field, null);
  if (!field.frames.length) {
    noPictures = {
      why: 'The practice simulation is not ready in this build.',
      more: 'Try one of the five test targets: they are real.',
    };
  }
  finishShow();
}

/**
 * Aims the frame at any spot: shipped pictures if a target is there, else the live service, else
 * the "no pictures here" state with the five test targets and the practice (FRM-11).
 *
 * @param ra Degrees.
 * @param dec Degrees.
 * @param fov Arcminutes; rounded to the nearest of FOVS. Leave out to keep the field size.
 * @returns Resolves when the spot's first pictures are on screen, when it is known there are
 *   none, or when a newer aim replaces this one.
 */
export async function aimAt(ra: number, dec: number, fov?: number, name?: string): Promise<void> {
  const want = nearestFov(fov ?? S.fov);
  const near = TARGETS.find((t) => separation(t.ra, t.dec, ra, dec) < TARGET_RADIUS);
  // A small move (a drag inside the picture, or of the patch on the sky) keeps the target and the
  // pictures on hand: they are cut again around the new centre, and only the part they do not
  // reach is asked for (`place`).
  const set = S.set;
  if (
    (!near || near.key === S.target) &&
    home &&
    set &&
    S.field &&
    S.source !== 'loading' &&
    overlaps(set.data, ra, dec, want)
  ) {
    const at = { ra: ((ra % 360) + 360) % 360, dec: Math.max(-90, Math.min(90, dec)) };
    return place(at, want, S.groups[S.epoch]?.mjd ?? null);
  }
  if (near) {
    return loadTarget(near.key, { fov: want });
  }
  const { id, signal } = begin();
  pause();
  S.ra = ((ra % 360) + 360) % 360;
  S.dec = Math.max(-90, Math.min(90, dec));
  S.fov = want;
  S.target = null;
  // A named place keeps its name (UX audit #5); the header adds the coordinates under it.
  S.label = name?.trim() || formatCoords(S.ra, S.dec);
  // Real exposures fetched earlier for a wider field may already hold this spot.
  const held = [...onHand].reverse().find((set) => covers(set.data, S.ra, S.dec, want));
  if (held) {
    home = { set: held, target: null };
    await place({ ra: S.ra, dec: S.dec }, want, null);
    return;
  }
  // A tour stop or top place fetched ahead of time (the static seed) opens from there.
  if (SEED_BASE) {
    startLoading('queued', 'Opening real SPHEREx exposures of this spot…');
    announce();
    if ((await showSeed(id, signal)) || !current(id)) return;
  }
  if (!LIVE_API) {
    clearData('none');
    noPictures = {
      why: 'Sima has real pictures of five test targets. Other spots come from a small service that fetches them from NASA’s archive, and it is not running for this page.',
      more: null,
    };
    announce();
    return;
  }
  startLoading('queued', 'Asking for the real SPHEREx exposures of this spot…');
  announce();
  void preview(id, signal);
  await pollLive(id, signal);
}

export { centreOf, liveFov };

async function pollLive(id: number, signal: AbortSignal): Promise<void> {
  const q = `${LIVE_API}?ra=${S.ra.toFixed(4)}&dec=${S.dec.toFixed(4)}&fov=${liveFov(S.fov)}`;
  let url = q;
  let shown: 'first' | 'full' | null = null;
  let failures = 0;
  while (current(id)) {
    let status: LiveStatus;
    try {
      const res = await fetch(url, { signal });
      const body = (await res.json()) as LiveStatus & { error?: string };
      if (!current(id)) return;
      if (!res.ok) {
        if (res.status === 503) {
          setLoad({ what: 'NASA’s archive is busy with other spots. Waiting for a turn…' });
          await wait(POLL_MS * 2, signal);
          continue;
        }
        return giveUp(id, `The live service refused this spot (${body.error || res.status}).`);
      }
      status = body;
      failures = 0;
    } catch (err) {
      if (!current(id) || signal.aborted) return;
      failures += 1;
      if (failures < 3) {
        await wait(POLL_MS, signal);
        continue;
      }
      return giveUp(id, `The live service did not answer (${errText(err)}).`);
    }
    liveJob = status;
    url = `${LIVE_API}/${status.id}`;
    liveNote = status.warning || '';

    if (status.full && shown !== 'full') {
      const ok = await showLive(id, status, 'full', signal);
      if (ok) shown = 'full';
      if (ok && status.state === 'ready') return;
    } else if (status.first && !shown) {
      if (await showLive(id, status, 'first', signal)) shown = 'first';
    }
    if (!current(id)) return;

    switch (status.state) {
      case 'queued':
        if (!shown) setLoad({ what: 'Waiting for a turn at NASA’s archive…', step: 'queued' });
        break;
      case 'searching':
        if (!shown)
          setLoad({
            what: `Searching NASA’s archive for SPHEREx exposures of this spot…${searchNote(status) || busyNote(status, ' ', '.')}`,
            step: 'searching',
          });
        break;
      case 'first':
        if (!shown) {
          setLoad({
            what: status.total
              ? `Fetching ${status.done} of ${status.total} real exposures. The picture shows as soon as two dates are in…${busyNote(status, ' ', '.')}`
              : `Found ${status.found} exposures. Choosing a first look…`,
            done: status.total ? status.done : null,
            total: status.total || null,
            step: 'first',
          });
        }
        break;
      case 'rest':
        stepNote =
          (status.total
            ? `First look. Fetching the rest: ${status.done} of ${status.total}`
            : 'First look. Fetching the rest') + busyNote(status, ' · ');
        setLoad(
          shown
            ? null
            : {
                what: `Fetching ${status.done} of ${status.total} real exposures…${busyNote(status, ' ', '.')}`,
                done: status.done,
                total: status.total,
                step: 'rest',
              },
        );
        if (shown) announceLines();
        break;
      case 'ready':
        if (shown === 'full') return;
        if (!status.full && !status.first) return giveUp(id, 'The live service sent no pictures.');
        break;
      case 'empty':
        clearData('none');
        noPictures = {
          why: `SPHEREx has no released exposures of this spot yet (searched ${releasesText(status.searched)}).`,
          more: 'SPHEREx covers the whole sky every six months; new releases come often.',
        };
        announce();
        return;
      case 'failed':
        if (shown) {
          stepNote = `First look only: the rest failed (${status.error || 'no reason given'})`;
          S.load = null;
          announceLines();
          return;
        }
        return giveUp(
          id,
          status.searchTimedOut
            ? `${status.error || 'NASA’s search did not answer'}.`
            : `NASA’s archive could not give the pictures (${status.error || 'no reason given'}).`,
          'NASA’s archive is sometimes slow or busy. Asking again often works.',
        );
    }
    await wait(POLL_MS, signal);
  }
}

/**
 * While the service searches: how long NASA's search has not answered and which try this is,
 * once that matters ("NASA’s search has not answered for 1 min 40 s (try 3 of 4)."); else ''.
 */
export function searchNote(status: LiveStatus): string {
  const t = status.searchElapsed ?? 0;
  const n = status.searchTry ?? 0;
  if (status.state !== 'searching' || (t < 20 && n < 2)) return '';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const time = m ? `${m} min ${s} s` : `${s} s`;
  const of = n && status.searchTries ? ` (try ${n} of ${status.searchTries})` : '';
  return ` NASA’s search has not answered for ${time}${of}.`;
}

/** Says that NASA's archive is answering busy and the service asks again (the wait is theirs). */
function busyNote(status: LiveStatus, sep: string, end = ''): string {
  return status.retrying
    ? `${sep}NASA’s archive is busy, so the service is asking again${end}`
    : '';
}

async function showLive(
  id: number,
  status: LiveStatus,
  step: 'first' | 'full',
  signal: AbortSignal,
): Promise<boolean> {
  const folder = step === 'full' ? status.full : status.first;
  if (!folder) return false;
  try {
    const set = await fetchSet(
      liveFolder(folder),
      status.id,
      'live',
      signal,
    );
    if (!current(id)) return false;
    stepNote = step === 'first' ? 'First look' : '';
    const keepEpoch = S.groups[S.epoch]?.mjd ?? null;
    home = { set, target: null };
    if (step === 'full') keep(set);
    return await show(set, null, { ra: S.ra, dec: S.dec }, S.fov, 'live', keepEpoch);
  } catch (err) {
    if (!current(id) || signal.aborted) return false;
    console.warn(`load: live ${step} set failed`, err);
    return false;
  }
}

/** Shows the seeded patch that holds the field on screen, if the seed has one. */
async function showSeed(id: number, signal: AbortSignal): Promise<boolean> {
  try {
    const hit = await seedFor(S.ra, S.dec, liveFov(S.fov));
    if (!hit || !current(id)) return false;
    const set = await fetchSet(hit.folder, hit.id, 'live', signal);
    if (!current(id)) return false;
    home = { set, target: null };
    keep(set);
    return await show(set, null, { ra: S.ra, dec: S.dec }, S.fov, 'live', null);
  } catch (err) {
    if (!current(id) || signal.aborted) return false;
    console.warn('load: seeded set failed', err);
    return false;
  }
}

/** No pictures from the live service: says why, and offers to ask again (Retry). */
function giveUp(id: number, why: string, more: string | null = null): void {
  if (!current(id)) return;
  clearData('none');
  noPictures = { why, more, retry: true };
  announce();
}

/**
 * Changes the field size (FRM-6) and cuts the pictures again. The sky stays still; the patch
 * square changes size. A field wider than the exposures keeps them on screen and fetches wider
 * real ones in the background (`place`). Lane D only (the − and + buttons and the wheel over the
 * picture); others go through `aimAt`.
 */
export async function setFov(fov: Fov): Promise<void> {
  if (fov === S.fov) return;
  if (home && S.set && S.source !== 'loading') {
    return place({ ra: S.ra, dec: S.dec }, fov, S.groups[S.epoch]?.mjd ?? null);
  }
  if (S.source === 'loading' && !S.target) return aimAt(S.ra, S.dec, fov);
  S.fov = fov;
  announce();
}

/**
 * Moves the patch by a sky offset without leaving the data (FRM-12: dragging inside the picture).
 * The pictures are cut again around the new centre; where the exposures do not reach, the sky
 * map shows around them while wider real ones are fetched. A drag that leaves the exposures
 * altogether aims the frame at the new spot.
 */
export function panTo(ra: number, dec: number): void {
  void aimAt(ra, dec);
}

// ----- Fields wider than the exposures -----------------------------------------------------------

/** Waits this long after the last field change before asking for wider pictures, ms. */
const WIDEN_AFTER_MS = 600;
let widen: { key: string; abort: AbortController; timer: number } | null = null;

/** Keeps a live set for later fields, replacing an older step of the same patch. */
function keep(set: RealSet): void {
  const at = onHand.findIndex((s) => s.key === set.key);
  if (at >= 0) onHand.splice(at, 1);
  onHand.push(set);
  if (onHand.length > ON_HAND) onHand.shift();
}

const withTarget = new WeakMap<RealSet, RealSet>();
const grafted = new WeakSet<RealSet>();
/**
 * A live set shown for a shipped target: the target's own catalogue position, motion and
 * neighbours go with it (they are facts about the target, not the exposures), so Measure, the
 * stack along the motion and the blend check work there as on the shipped pictures.
 */
function forHome(set: RealSet): RealSet {
  const own = home?.set;
  if (!own || set === own || own.origin !== 'shipped' || grafted.has(set)) return set;
  let out = withTarget.get(set);
  if (!out) {
    const { catalogue, neighbours, neighboursFrom } = own.data;
    out = { ...set, data: { ...set.data, catalogue, neighbours, neighboursFrom } };
    pinCentre(out.data, nominal(set.data));
    withTarget.set(set, out);
    grafted.add(out);
  }
  return out;
}

/**
 * Puts the real set that best holds a field on screen: the spot's own exposures when they cover
 * it, else wider ones fetched earlier, else the ones on screen (the sky map shows around them)
 * while wider real ones are asked for.
 */
async function place(
  centre: { ra: number; dec: number },
  fov: Fov,
  keepMjd: number | null,
): Promise<void> {
  const h = home;
  if (!h) return;
  const { ra, dec } = centre;
  wanted = { ra, dec, fov };
  // The size shows at once (the pictures on screen rescale), so a second press steps on from it.
  S.fov = fov;
  const fit = [h.set, ...[...onHand].sort((a, b) => a.data.size - b.data.size)].find((s) =>
    covers(s.data, ra, dec, fov),
  );
  const shownSet = S.set && S.source !== 'loading' ? S.set : null;
  const raw = fit ?? (shownSet && overlaps(shownSet.data, ra, dec, fov) ? shownSet : h.set);
  if (fit) stopWidening();
  else askWider(centre, fov);
  const set = forHome(raw);
  const source: PatchSource = h.set.origin === 'shipped' ? 'real' : 'live';
  await show(set, h.target, centre, fov, source, keepMjd);
}

/** Asks again for real exposures of the field on screen, after a wider fetch failed. */
export function retryWider(): void {
  if (!home || !S.set) return;
  stopWidening();
  const v = wanted ?? { ra: S.ra, dec: S.dec, fov: S.fov };
  askWider({ ra: v.ra, dec: v.dec }, v.fov);
}

function stopWidening(): void {
  if (widen) {
    clearTimeout(widen.timer);
    widen.abort.abort();
    widen = null;
  }
  setWidening(null);
}

/** Asks the live service for real exposures of a field the ones on hand do not cover. */
function askWider(centre: { ra: number; dec: number }, fov: Fov): void {
  const h = home;
  if (!h) return;
  if (!LIVE_API) {
    stopWidening();
    setWidening({
      state: 'off',
      what: 'Real exposures end at the dashed line. Wider ones come from a live service that is not running for this page',
      done: null,
      total: null,
    });
    return;
  }
  const want = widerPatch(centreOf(h.set.data), centre.ra, centre.dec, fov);
  const key = `${want.ra.toFixed(4)}|${want.dec.toFixed(4)}|${want.fov}`;
  if (widen?.key === key) return;
  stopWidening();
  const ab = new AbortController();
  const loadId = seq;
  widen = {
    key,
    abort: ab,
    timer: window.setTimeout(() => void pollWider(want, loadId, ab.signal), WIDEN_AFTER_MS),
  };
  setWidening({
    state: 'busy',
    what: 'Asking NASA’s archive for real exposures of the wider field…',
    done: null,
    total: null,
  });
}

/** Follows the live patch for a wider field and shows its pictures when they arrive. */
async function pollWider(
  want: { ra: number; dec: number; fov: number },
  loadId: number,
  signal: AbortSignal,
): Promise<void> {
  let url = `${LIVE_API}?ra=${want.ra.toFixed(4)}&dec=${want.dec.toFixed(4)}&fov=${want.fov}`;
  let got: 'first' | 'full' | null = null;
  let failures = 0;
  const live = () => current(loadId) && !signal.aborted;
  const say = (what: string, done: number | null = null, total: number | null = null) =>
    live() && setWidening({ state: 'busy', what, done, total });
  const fail = (why: string) => {
    if (!live()) return;
    widen = null;
    setWidening({
      state: 'failed',
      what: got ? `First look of the wider field only: ${why}` : `Real exposures end at the dashed line: ${why}`,
      done: null,
      total: null,
    });
  };
  while (live()) {
    let status: LiveStatus;
    try {
      const res = await fetch(url, { signal });
      const body = (await res.json()) as LiveStatus & { error?: string };
      if (!live()) return;
      if (!res.ok) {
        if (res.status === 503) {
          say('NASA’s archive is busy with other spots. Waiting for a turn…');
          await wait(POLL_MS * 2, signal);
          continue;
        }
        return fail(`the live service refused the wider field (${body.error || res.status})`);
      }
      status = body;
      failures = 0;
    } catch (err) {
      if (!live()) return;
      if (++failures < 3) {
        await wait(POLL_MS, signal);
        continue;
      }
      return fail(`the live service did not answer (${errText(err)})`);
    }
    url = `${LIVE_API}/${status.id}`;
    const step: 'first' | 'full' | null = status.full && got !== 'full' ? 'full' : status.first && !got ? 'first' : null;
    const folder = step === 'full' ? status.full : step === 'first' ? status.first : null;
    if (step && folder) {
      try {
        const set = await fetchSet(liveFolder(folder), status.id, 'live', signal);
        if (!live()) return;
        got = step;
        keep(set);
        // Shown only if it holds the field wanted now (the user may have moved on).
        const v = wanted ?? { ra: S.ra, dec: S.dec, fov: S.fov };
        if (covers(set.data, v.ra, v.dec, v.fov) && home) {
          const keepMjd = S.groups[S.epoch]?.mjd ?? null;
          const source: PatchSource = home.set.origin === 'shipped' ? 'real' : 'live';
          await show(forHome(set), home.target, { ra: v.ra, dec: v.dec }, v.fov, source, keepMjd);
        }
        if (step === 'full' && status.state === 'ready') {
          widen = null;
          setWidening(null);
          return;
        }
      } catch (err) {
        if (!live()) return;
        console.warn(`load: wider ${step} set failed`, err);
      }
    }
    const busy = busyNote(status, ' ', '.');
    switch (status.state) {
      case 'queued':
        say('Waiting for a turn at NASA’s archive for the wider field…');
        break;
      case 'searching':
        say(`Searching NASA’s archive for exposures of the wider field…${searchNote(status) || busy}`);
        break;
      case 'first':
      case 'rest':
        if (status.total) {
          say(
            got
              ? `Wider field, first look. Fetching the rest: ${status.done} of ${status.total}${busy}`
              : `Fetching ${status.done} of ${status.total} real exposures of the wider field${busy}`,
            status.done,
            status.total,
          );
        } else say(`Found ${status.found} exposures of the wider field. Choosing which to fetch…`);
        break;
      case 'ready':
        if (!status.full && !status.first) return fail('the live service sent no pictures');
        break;
      case 'empty':
        return fail('SPHEREx has no released exposures of the wider field');
      case 'failed':
        return fail(
          status.searchTimedOut && status.error
            ? status.error
            : `NASA’s archive could not give them (${status.error || 'no reason given'})`,
        );
    }
    await wait(POLL_MS, signal);
  }
}

/** Tells the sky where the patch is while the user drags inside the picture (no reload). */
export function previewPatch(ra: number, dec: number): void {
  emit('patch', {
    ...patchMsg(),
    ra: ((ra % 360) + 360) % 360,
    dec: Math.max(-90, Math.min(90, dec)),
  });
}

// ----- Showing a set ----------------------------------------------------------------------------

let showSeq = 0;
let showAbort: AbortController | null = null;

/**
 * Puts a decoded set on screen at a centre and field size, and plays it. The field is built off
 * the page's thread (core/work.ts `buildField`); while it builds, the pictures already on screen
 * stay. A newer call, or a newer load, drops this one's result.
 *
 * @returns True when this call's field is on screen.
 */
async function show(
  set: RealSet,
  target: Target | null,
  centre: { ra: number; dec: number },
  fov: Fov,
  source: PatchSource,
  keepMjd: number | null = null,
): Promise<boolean> {
  const mine = ++showSeq;
  const loadId = seq;
  showAbort?.abort();
  showAbort = new AbortController();
  // The grid never reaches beyond what the exposures cover; a larger field shows them in its
  // middle with the rest empty (render.ts), so nothing is filled in (H6).
  const gridFov = Math.min(fov, set.data.size * 60);
  let field: Field;
  try {
    field = await buildField(
      set,
      { ra: centre.ra, dec: centre.dec, fov: gridFov, target },
      { signal: showAbort.signal },
    );
  } catch (err) {
    if (mine !== showSeq || !current(loadId) || (err as DOMException)?.name === 'AbortError') {
      return false;
    }
    console.warn('load: building the field failed', err);
    clearData('none');
    noPictures = {
      why: `The exposures could not be put on the frame's grid (${errText(err)}).`,
      more: null,
    };
    announce();
    return false;
  }
  if (mine !== showSeq || !current(loadId)) return false;
  S.ra = centre.ra;
  S.dec = centre.dec;
  S.fov = fov;
  S.set = set;
  S.field = field;
  S.load = null;
  S.source = source;
  usePatch(`${set.key}|${centre.ra.toFixed(5)}|${centre.dec.toFixed(5)}|${gridFov}`, field, set);
  if (!field.frames.length) {
    noPictures = {
      why: 'The exposures arrived but could not be read in this build.',
      more: null,
    };
  }
  finishShow(keepMjd);
  // Measure the target in the background, so Measure has its numbers when it opens.
  if (target) setTimeout(() => void targetMeasurements()?.catch(() => undefined), 0);
  return true;
}

let measuredSet: RealSet | null = null;
let measuredTarget: Target | null = null;
let measured: Promise<Measurement[]> | null = null;

/**
 * The patch's test target measured on every exposure (core/work.ts `measure`, off the page's
 * thread), started once per patch and shared by everyone who asks (lane E's Measure, the guide).
 *
 * @returns The measurements, in time order; null when the patch has no target or no real data.
 */
export function targetMeasurements(): Promise<Measurement[]> | null {
  const set = S.set;
  const target = S.field?.target ?? null;
  if (!set || !target) return null;
  if (set !== measuredSet || target !== measuredTarget || !measured) {
    measuredSet = set;
    measuredTarget = target;
    measured = measure(set, target);
  }
  return measured;
}

/** After S.field is set: the flip-book, the bus, the first paint, and playing. */
function finishShow(keepMjd: number | null = null): void {
  const wasPlaying = S.playing;
  regroup(keepMjd);
  S.ref = 0;
  announce();
  draw();
  if (!S.groups.length) return;
  if (reducedMotion()) {
    // Reduced motion: a still Two dates picture instead of flipping (FRM-8).
    if (S.level === 'explore') S.mode = 'two';
    return;
  }
  if (keepMjd === null || wasPlaying) play();
}

/**
 * Builds the flip-book for the detector on screen: Explore steps through visit windows (A, B,
 * C…), Measure through visits (or windows when "Combine each pass" is on). "Same wavelength only"
 * keeps the exposures that match the reference wavelength (BAR-5). Keeps the date on screen when
 * it can.
 *
 * @param keepMjd The date to stay on; null keeps the current one.
 */
export function regroup(keepMjd: number | null = null): void {
  const field = S.field;
  const mjd = keepMjd ?? S.groups[S.epoch]?.mjd ?? null;
  const groups = field ? groupsFor(field, S.det) : [];
  S.groups = groups;
  const at = mjd === null ? 0 : nearestGroup(groups, mjd);
  S.epoch = Math.min(at, Math.max(0, groups.length - 1));
  if (S.ref >= groups.length) S.ref = 0;
  if (groups.length < 2 && S.playing) pause();
}

function nearestGroup(groups: readonly Group[], mjd: number): number {
  let best = 0;
  groups.forEach((g, i) => {
    const d = Math.abs(g.mjd - mjd);
    const b = Math.abs((groups[best]?.mjd ?? Infinity) - mjd);
    if (Number.isFinite(d) && (d < b || !Number.isFinite(b))) best = i;
  });
  return best;
}

/**
 * The flip-book for one detector. Lane D only; others read `S.groups`.
 */
export function groupsFor(field: Field | null, det: Det): Group[] {
  if (!field) return [];
  const by = S.level === 'measure' && !pic().combinePass ? 'visit' : 'window';
  const all = groupFrames(field, det, by);
  missingPasses = [];
  if (!S.sameColour || field.simulated) return all;
  const kept = sameColourOnly(field, all, S.lam);
  missingPasses = kept.missing;
  return kept.groups;
}

/** The detector changes (the wavelength scale, the strip, `band`): regroup and tell the sky. */
export function showDetector(det: Det, lam?: number): void {
  const changed = det !== S.det;
  S.det = det;
  if (lam !== undefined) S.lam = lam;
  if (changed || S.sameColour) regroup();
  draw();
  announceShown();
}

/** The wavelength the scale shows for a detector: the middle of its band, or `lam` if inside. */
export function lamInBand(det: Det, edges: readonly number[], lam = S.lam): number {
  const lo = edges[det - 1] ?? 0.75;
  const hi = edges[det] ?? 5;
  return detectorOf(lam) === det && lam >= lo && lam <= hi ? lam : (lo + hi) / 2;
}

// ----- Bits -------------------------------------------------------------------------------------

/** Fetches and decodes a patch's two files (the workspace's frames load through this too). */
export async function fetchSet(
  base: string,
  key: string,
  origin: 'shipped' | 'live',
  signal: AbortSignal,
): Promise<RealSet> {
  const [meta, bin] = await Promise.all([
    fetch(`${base}frames.json`, { signal }).then((r) => {
      if (!r.ok) throw new Error(`frames.json: HTTP ${r.status}`);
      return r.json() as Promise<TargetData>;
    }),
    fetch(`${base}frames.bin.gz`, { signal }).then((r) => {
      if (!r.ok) throw new Error(`frames.bin.gz: HTTP ${r.status}`);
      return r.arrayBuffer();
    }),
  ]);
  return decodeFrames(meta, new Uint8Array(bin), { key, origin });
}

function clearData(source: PatchSource): void {
  pause();
  S.source = source;
  S.set = null;
  S.field = null;
  S.load = null;
  S.groups = [];
  S.epoch = 0;
  S.ref = 0;
  draw();
}

function startLoading(step: LoadState['step'], what: string): void {
  clearData('loading');
  S.load = { what, done: null, total: null, step, since: performance.now() };
}

function setLoad(change: Partial<LoadState> | null): void {
  if (!change) {
    S.load = null;
    return;
  }
  const base: LoadState = S.load ?? {
    what: '',
    done: null,
    total: null,
    step: 'searching',
    since: performance.now(),
  };
  S.load = { ...base, done: null, total: null, ...change };
  if (S.source === 'loading') announce();
}

/** Fetches the sky map's own picture of the spot for the cover (O-I3). */
async function preview(id: number, signal: AbortSignal): Promise<void> {
  for (const fn of previewFns) fn(null);
  try {
    const { skyPreview } = await import('./preview.ts');
    const grid = fieldGrid(S.ra, S.dec, S.fov);
    const canvas = await skyPreview(grid, S.lam, signal);
    if (!current(id)) return;
    for (const fn of previewFns) fn(canvas);
  } catch {
    // No preview: the cover still says what it waits for.
  }
}

function patchMsg() {
  return {
    ra: S.ra,
    dec: S.dec,
    fov: S.fov,
    source: S.source,
    label: S.label,
    target: S.target,
  };
}

/** Tells the sky what the frame shows (`patch` and `shown`). */
export function announce(): void {
  if (Number.isFinite(S.ra) && Number.isFinite(S.dec)) emit('patch', patchMsg());
  announceShown();
}

/** Tells the sky what is on screen now (`shown`). */
export function announceShown(): void {
  const g = S.groups[S.epoch];
  const mjd = g && Number.isFinite(g.mjd) ? g.mjd : null;
  emit('shown', { lam: S.color ? null : S.lam, mjd, det: S.det });
}

/** Lines under the picture changed without new data (frame.ts watches `load`). */
function announceLines(): void {
  S.load = S.load ? { ...S.load } : null;
  draw();
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function releasesText(list: readonly string[]): string {
  return list.length ? list.map(releaseName).join(', ') : 'every release';
}

/** `spherex_dr1_deep` → "DR1 deep". */
export function releaseName(r: string): string {
  if (r === 'simulated') return 'simulated';
  return r
    .replace(/^spherex_/, '')
    .replace('_', ' ')
    .replace(/^(\w+)/, (m) => m.toUpperCase());
}
