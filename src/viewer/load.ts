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
 */
import { S, nearestFov, pic, type Fov, type LoadState } from './state.ts';
import { draw } from './render.ts';
import { pause, play, reducedMotion } from './playback.ts';
import { emit, type PatchSource } from '../shell/bus.ts';
import { buildRealField, decodeFrames, fieldGrid } from '../core/real.ts';
import { groupFrames, sameColourOnly } from '../core/blink.ts';
import { detectorOf } from '../core/instrument.ts';
import { TARGETS, targetByKey } from '../core/targets.ts';
import { SCENARIOS } from '../core/field.ts';
import { simulate } from '../core/frames.ts';
import { formatCoords, separation } from '../core/astro.ts';
import type { Det, Field, Group, LiveStatus, RealSet, Target, TargetData } from '../core/types.ts';

/** The live service's address (`/api/patch` in dev), or '' when there is none (FRM-11). */
export const LIVE_API: string = (import.meta.env.VITE_LIVE_API ?? '').replace(/\/$/, '');
/** How often the live service is asked how far it got (docs/live-service.md). */
export const POLL_MS = 1500;
/** Field sizes the live service fetches, arcminutes. */
const LIVE_FOVS = [3, 6, 12] as const;
/** A spot this close to a shipped target's track opens the target's own pictures, degrees. */
const TARGET_RADIUS = 1.5 / 60;

/** Why a spot has no pictures, for the frame's "No pictures here" card (FRM-11). */
export interface NoPictures {
  /** One plain sentence: why. */
  why: string;
  /** A second sentence: what the user can do, or null. */
  more: string | null;
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
    const own = fov === undefined ? nearestFov(set.data.fov) : S.fov;
    show(set, target, centreOf(set.data), own, 'real');
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
export async function aimAt(ra: number, dec: number, fov?: number): Promise<void> {
  const want = nearestFov(fov ?? S.fov);
  const near = TARGETS.find((t) => separation(t.ra, t.dec, ra, dec) < TARGET_RADIUS);
  if (near) {
    return loadTarget(near.key, { fov: want });
  }
  const { id, signal } = begin();
  pause();
  S.ra = ((ra % 360) + 360) % 360;
  S.dec = Math.max(-90, Math.min(90, dec));
  S.fov = want;
  S.target = null;
  S.label = formatCoords(S.ra, S.dec);
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

/** Field size as the live service fetches it: the nearest of 3, 6 and 12 that covers the field. */
function liveFov(fov: number): number {
  return LIVE_FOVS.find((f) => f >= fov) ?? 12;
}

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
            what: 'Searching NASA’s archive for SPHEREx exposures of this spot…',
            step: 'searching',
          });
        break;
      case 'first':
        if (!shown) {
          setLoad({
            what: status.total
              ? `Fetching ${status.done} of ${status.total} real exposures for a first look…`
              : `Found ${status.found} exposures. Choosing a first look…`,
            done: status.total ? status.done : null,
            total: status.total || null,
            step: 'first',
          });
        }
        break;
      case 'rest':
        stepNote = status.total
          ? `First look. Fetching the rest: ${status.done} of ${status.total}`
          : 'First look. Fetching the rest';
        setLoad(
          shown
            ? null
            : {
                what: `Fetching ${status.done} of ${status.total} real exposures…`,
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
          `NASA’s archive could not give the pictures (${status.error || 'no reason given'}).`,
        );
    }
    await wait(POLL_MS, signal);
  }
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
      folder.endsWith('/') ? folder : `${folder}/`,
      status.id,
      'live',
      signal,
    );
    if (!current(id)) return false;
    stepNote = step === 'first' ? 'First look' : '';
    const keepEpoch = S.groups[S.epoch]?.mjd ?? null;
    show(set, null, { ra: S.ra, dec: S.dec }, S.fov, 'live', keepEpoch);
    return true;
  } catch (err) {
    if (!current(id) || signal.aborted) return false;
    console.warn(`load: live ${step} set failed`, err);
    return false;
  }
}

function giveUp(id: number, why: string): void {
  if (!current(id)) return;
  clearData('none');
  noPictures = { why, more: null };
  announce();
}

/**
 * Changes the field size (FRM-6) and cuts the pictures again. The sky stays still; the patch
 * square changes size. Lane D only (the − and + buttons and the wheel over the picture); others
 * go through `aimAt`.
 */
export async function setFov(fov: Fov): Promise<void> {
  if (fov === S.fov) return;
  const set = S.set;
  if (set && S.source !== 'loading') {
    const covered = set.data.size * 60;
    // A live spot fetched narrower than the new field: ask the service for the wider one.
    if (set.origin === 'live' && liveFov(fov) > Math.round(covered) && covered < 12) {
      return aimAt(S.ra, S.dec, fov);
    }
    S.fov = fov;
    const keep = S.groups[S.epoch]?.mjd ?? null;
    show(set, S.field?.target ?? null, { ra: S.ra, dec: S.dec }, fov, S.source, keep);
    return;
  }
  if (S.source === 'loading' && !S.target) return aimAt(S.ra, S.dec, fov);
  S.fov = fov;
  announce();
}

/**
 * Moves the patch by a sky offset without leaving the data (FRM-12: dragging inside the picture).
 * Shipped and live pictures are cut again around the new centre; where the exposures do not
 * reach, the picture is empty and says so. A drag that leaves the exposures altogether aims the
 * frame at the new spot.
 */
export function panTo(ra: number, dec: number): void {
  const set = S.set;
  if (!set || !S.field) {
    void aimAt(ra, dec);
    return;
  }
  const c = centreOf(set.data);
  const reach = (set.data.size / 2) * 0.9;
  if (separation(c.ra, c.dec, ra, dec) > reach) {
    void aimAt(ra, dec);
    return;
  }
  const keep = S.groups[S.epoch]?.mjd ?? null;
  show(set, S.field.target, { ra, dec }, S.fov, S.source, keep);
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

/** Puts a decoded set on screen at a centre and field size, and plays it. */
function show(
  set: RealSet,
  target: Target | null,
  centre: { ra: number; dec: number },
  fov: Fov,
  source: PatchSource,
  keepMjd: number | null = null,
): void {
  // The grid never reaches beyond what the exposures cover; a larger field shows them in its
  // middle with the rest empty (render.ts), so nothing is filled in (H6).
  const covered = set.data.size * 60;
  const gridFov = Math.min(fov, covered);
  const field = buildRealField(set, { ra: centre.ra, dec: centre.dec, fov: gridFov, target });
  S.ra = centre.ra;
  S.dec = centre.dec;
  S.fov = fov;
  S.set = set;
  S.field = field;
  S.load = null;
  S.source = source;
  if (!field.frames.length) {
    noPictures = {
      why: 'The exposures arrived but could not be read in this build.',
      more: null,
    };
  }
  finishShow(keepMjd);
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

async function fetchSet(
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

/** The middle of the exposures: the median of the cutout centres. */
function centreOf(data: TargetData): { ra: number; dec: number } {
  const ras = data.frames.map((f) => f.wcs.crval[0]).sort((a, b) => a - b);
  const decs = data.frames.map((f) => f.wcs.crval[1]).sort((a, b) => a - b);
  const mid = (v: number[]) => v[v.length >> 1] ?? Number.NaN;
  const ra = mid(ras);
  const dec = mid(decs);
  return Number.isFinite(ra) && Number.isFinite(dec)
    ? { ra, dec }
    : { ra: data.catalogue.ra, dec: data.catalogue.dec };
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
