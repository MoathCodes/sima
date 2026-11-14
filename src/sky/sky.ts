/**
 * The sky map: NASA SPHEREx's all-sky picture (Aladin Lite 3.8.2), the patch square on it, the
 * dotted tether to the frame, the click card, the sky note and the pointer's coordinates.
 * Owner: lane C.
 *
 * The sky half (SPEC 8.3): this module learns about the frame only from the bus (`patch`,
 * `shown`) and from shell.ts `frameRect()`. It never imports src/viewer.
 *
 * - The map (SKY-1 to 9): each SPHEREx channel is a 2D HiPS served by public/sky-tiles-sw.js,
 *   which shows the shipped low-resolution sky first. A new channel fades in over the old one
 *   once its tiles are in (0.26 s), never a cut to grey. The stereographic projection fills the
 *   window from 180° wide to a few arcminutes.
 * - The patch (FRM-1 to 4): drawn from the frame's `patch` messages; grabbed anywhere inside;
 *   dropped, it sends `aim`. A click on empty sky only offers "Move the frame here". The sky
 *   moves only when the user moves it: never because pictures arrived.
 */
import { emit, on, type BusEvents } from '../shell/bus.ts';
import { frameRect, onFrameMove, skyReady } from '../shell/shell.ts';
import { icon } from '../shell/icons.ts';
import { formatCoords } from '../core/astro.ts';
import { CHANNEL_LAM, DEFAULT_LAM, WISE_HIPS, channelFor, detectorOf } from './hips.ts';
import { calibrate, makeView, project, separation, wrapRa, type View } from './project.ts';

/** What the sky shows: its centre and zoom. */
export interface Camera {
  /** Centre of the view, degrees. */
  ra: number;
  dec: number;
  /** Width of the view in DEGREES (not arcminutes, unlike the frame's field size). 180 at most. */
  fov: number;
  /** Size of the map on screen, CSS pixels. */
  width: number;
  height: number;
}

/** A sky map the chooser offers (SKY-4). */
export type SkyLayer = 'spherex' | 'wise-w1' | 'wise-w2';

/** A spot on the sky and where it is on screen (CSS pixels from the window's top left). */
export interface SkyPoint {
  ra: number;
  dec: number;
  x: number;
  y: number;
}

const FOV_MIN = 0.05; // 3 arcminutes
const FOV_MAX = 180;
/** The first view: Barnard's Star, as wide as the reference pictures (a 6′ patch is ~78 px). */
const START = { ra: 269.452, dec: 4.693, fov: 1.9 };
const CROSSFADE_MS = 260; // DESIGN.md Motion, --t-crossfade
const BASE = import.meta.env.BASE_URL;
const LAYER_NAMES: Record<SkyLayer, string> = {
  spherex: 'SPHEREx',
  'wise-w1': 'AllWISE 3.4 µm',
  'wise-w2': 'AllWISE 4.6 µm',
};
const H1 = 'Average of all dates: moving objects are blurred or shifted here';

// ----- Aladin Lite, as much of it as Sima uses --------------------------------------------------

interface HiPSLayer {
  setOpacity(o: number): void;
}
interface Aladin {
  getRaDec(): [number, number];
  getFov(): [number, number];
  gotoRaDec(ra: number, dec: number): void;
  setFoV(fov: number): void;
  pix2world(x: number, y: number): [number, number] | undefined;
  world2pix(ra: number, dec: number): [number, number] | undefined;
  setOverlayImageLayer(layer: HiPSLayer, name: string): HiPSLayer;
  removeImageLayer(name: string): void;
  setCooGrid(opts: Record<string, unknown>): void;
  on(event: string, fn: (...args: unknown[]) => void): void;
}
interface AladinLib {
  init: Promise<void>;
  aladin(el: HTMLElement, opts: Record<string, unknown>): Aladin;
  HiPS(url: string, opts: Record<string, unknown>): HiPSLayer;
}

let A: AladinLib | null = null;
let al: Aladin | null = null;
let skyEl: HTMLElement | null = null;

// ----- State ------------------------------------------------------------------------------------

const cam: Camera = { ra: START.ra, dec: START.dec, fov: START.fov, width: 0, height: 0 };
let view: View | null = null;
let layer: SkyLayer = 'spherex';
let lam: number = DEFAULT_LAM;
let rev = 0;
const flags = { grid: false, grab: true, sw: false, lost: false, moved: false, centred: false };
let patch: Readonly<BusEvents['patch']> | null = null;
/** Where the user dropped the patch, shown until the frame's next `patch` message. */
let dropped: { ra: number; dec: number; until: number } | null = null;
/** The patch while it is being dragged. */
let dragging: { ra: number; dec: number; dx: number; dy: number } | null = null;
/** The spot of the open click card. */
let clicked: SkyPoint | null = null;

const clickFns = new Set<(p: SkyPoint) => void>();
const pointerFns = new Set<(p: SkyPoint | null) => void>();
const zoomFns = new Set<(c: Readonly<Camera>) => void>();

/** What markers.ts lends the sky: dots under the pointer. Set by `registerDots`. */
interface DotHooks {
  pick(x: number, y: number): { id: string } | null;
  hover(id: string | null): void;
  click(id: string, p: SkyPoint): void;
}
let dotHooks: DotHooks | null = null;

let marks: HTMLCanvasElement | null = null;
let dotsCanvas: HTMLCanvasElement | null = null;
let colours: Record<string, string> = {};

// ----- Starting -------------------------------------------------------------------------------

/**
 * Starts the sky in its mount point and reports loading to the shell (`skyReady`).
 * Resolves once the map has been created (its tiles keep loading after that).
 *
 * @param el The `#sky` element.
 */
export async function startSky(el: HTMLElement): Promise<void> {
  skyEl = el;
  makeMarks();
  readColours();
  skyReady({ layer: LAYER_NAMES[layer], loaded: 0, total: 1, failed: 0, first: true });
  on(
    'patch',
    (p) => {
      patch = p;
      if (
        dropped &&
        (separation(p.ra, p.dec, dropped.ra, dropped.dec) < 1e-3 || Date.now() > dropped.until)
      ) {
        dropped = null;
      }
      // Before the user has moved the sky, the first patch decides where the sky opens. After
      // that the sky never follows the patch by itself (FRM-4, O-I1).
      if (!flags.centred && !flags.moved) {
        flags.centred = true;
        if (al) al.gotoRaDec(p.ra, p.dec);
        else {
          cam.ra = p.ra;
          cam.dec = p.dec;
        }
      }
      requestDraw();
    },
    { replay: true },
  );
  on(
    'shown',
    (s) => {
      if (s.lam === null) return; // the Color view: the map keeps its channel
      lam = s.lam;
      channelSoon();
    },
    { replay: true },
  );
  addEventListener('resize', () => requestDraw());
  // The tether follows the frame: its glide is a transform, which no observer sees.
  onFrameMove(requestDraw);
  const frame = document.getElementById('frame');
  if (frame) new ResizeObserver(() => requestDraw()).observe(frame);
  new MutationObserver(() => requestDraw()).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class'],
  });

  // The worker and the map's code load side by side; neither waits for the other.
  const [sw, lib] = await Promise.all([
    startWorker(),
    import('aladin-lite').then(async (m) => {
      const lib = m.default as unknown as AladinLib;
      await lib.init;
      return lib;
    }),
  ]);
  flags.sw = sw;
  A = lib;
  softenTiles();
  const host = document.createElement('div');
  host.className = 'sky-map';
  const lift = document.createElement('div');
  lift.className = 'sky-lift';
  el.replaceChildren(host, lift);
  // The bottom layer: the first channel's soft sky (shipped), which never needs the network.
  baseChannel = flags.sw ? wantedChannel() : null;
  const base = flags.sw ? softUrl(wantedChannel()) : WISE_HIPS['wise-w1'];
  al = lib.aladin(host, {
    survey: base,
    hipsList: [],
    projection: 'STG',
    cooFrame: 'ICRS',
    target: `${cam.ra} ${cam.dec}`,
    fov: cam.fov,
    backgroundColor: 'rgb(5, 7, 13)',
    showReticle: false,
    showZoomControl: false,
    showFullscreenControl: false,
    showLayersControl: false,
    showGotoControl: false,
    showFrame: false,
    showFov: false,
    showCooLocation: false,
    showProjectionControl: false,
    showStatusBar: false,
    showContextMenu: false,
    showCooGridControl: false,
    showSettingsControl: false,
    showShareControl: false,
    showSimbadPointerControl: false,
    showColorPickerControl: false,
    log: false,
    samp: false,
    inertia: true,
    gridColor: 'rgb(170, 178, 208)',
    gridOpacity: 0.45,
    gridOptions: { enabled: flags.grid, showLabels: true, thickness: 1, labelSize: 12 },
  });
  watchContext(host);
  watchPointer(el);
  showLayer();
  loop();
}

/** Registers the service worker and waits until it serves this page (SKY-8). */
async function startWorker(): Promise<boolean> {
  const sw = navigator.serviceWorker;
  if (!sw) return false;
  try {
    await sw.register(`${BASE}sky-tiles-sw.js`, { scope: BASE });
    sw.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === 'sky-tile') onTile(e.data as TileEvent);
    });
    sw.startMessages();
    if (sw.controller) return true;
    return await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(!!sw.controller), 4000);
      sw.addEventListener('controllerchange', () => {
        clearTimeout(t);
        resolve(true);
      });
    });
  } catch (err) {
    console.warn('sky: the tile service worker could not start', err);
    return false;
  }
}

/**
 * Aladin magnifies the map's pixels as hard blocks. Sampling the tile textures linearly shows
 * them softened instead, by about half a map pixel, display only (DESIGN.md Grey Map Rule).
 */
function softenTiles(): void {
  // Aladin cuts each Allsky image into 768 tiles with getImageData on a detached canvas. On a
  // GPU-backed canvas each read is a slow readback (seconds in all); a CPU-backed one is fast.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    opts?: unknown,
  ) {
    const options =
      type === '2d' && opts === undefined && !this.isConnected
        ? { willReadFrequently: true }
        : opts;
    return (getContext as (t: string, o?: unknown) => RenderingContext | null).call(
      this,
      type,
      options,
    );
  } as typeof getContext;

  const proto = WebGL2RenderingContext.prototype;
  const set = proto.texParameteri;
  const store = proto.texStorage3D;
  const ours = (gl: WebGL2RenderingContext) => !!skyEl && skyEl.contains(gl.canvas as Node);
  proto.texParameteri = function (target, pname, param) {
    if (
      ours(this) &&
      target === this.TEXTURE_2D_ARRAY &&
      (pname === this.TEXTURE_MAG_FILTER || pname === this.TEXTURE_MIN_FILTER) &&
      param === this.NEAREST
    ) {
      param = this.LINEAR;
    }
    set.call(this, target, pname, param);
  };
  proto.texStorage3D = function (target, levels, format, w, h, depth) {
    store.call(this, target, levels, format, w, h, depth);
    if (target === this.TEXTURE_2D_ARRAY && ours(this)) {
      set.call(this, target, this.TEXTURE_MAG_FILTER, this.LINEAR);
      set.call(this, target, this.TEXTURE_MIN_FILTER, this.LINEAR);
    }
  };
}

function makeMarks(): void {
  const host = document.getElementById('sky-marks');
  if (!host) return;
  dotsCanvas = document.createElement('canvas');
  dotsCanvas.className = 'sky-dots';
  marks = document.createElement('canvas');
  marks.className = 'sky-patch';
  host.replaceChildren(dotsCanvas, marks);
}

function readColours(): void {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  colours = {
    mark: get('--mark', '#ff4a9c'),
    amber: get('--st-accent-2', '#ffb03a'),
    ink: get('--st-ink', '#eef0f8'),
    ink2: get('--st-ink-2', '#aab2d0'),
    ink3: get('--st-ink-3', '#7c86ab'),
    sky: get('--sky', '#05070d'),
    font: '500 12px Archivo, "Helvetica Neue", Arial, sans-serif',
  };
}

// ----- Exports (SPEC 8.4) ----------------------------------------------------------------------

/** Shows another sky map (SKY-4). The new map fades in over the old one once it has loaded. */
export function setLayer(next: SkyLayer): void {
  if (next === layer) return;
  layer = next;
  showLayer();
}

/**
 * Moves the sky. Missing fields keep their value. This is a user-chosen move: callers are
 * search, place cards, the rail and the keys, never a timer or arriving data (FRM-4).
 *
 * @param to Centre in degrees, `fov` in degrees across the window (clamped to 0.05 to 180).
 * @param opts `animate` (default true): glide there; false jumps. Reduced motion always jumps.
 */
export function flyTo(
  to: { ra?: number; dec?: number; fov?: number },
  opts: { animate?: boolean } = {},
): void {
  flags.moved = true;
  flags.centred = true;
  const target = {
    ra: to.ra === undefined ? cam.ra : wrapRa(to.ra),
    dec: to.dec === undefined ? cam.dec : Math.max(-90, Math.min(90, to.dec)),
    fov: to.fov === undefined ? cam.fov : clampFov(to.fov),
  };
  zoomTo = null;
  if (!al || opts.animate === false || reducedMotion()) {
    glide = null;
    if (al) {
      al.setFoV(target.fov);
      al.gotoRaDec(target.ra, target.dec);
    } else Object.assign(cam, target);
    requestDraw();
    return;
  }
  glide = { from: { ...cam }, to: target, start: performance.now(), ms: 650 };
}

/** The view now (a copy). */
export function camera(): Camera {
  return { ...cam };
}

/**
 * Where a sky position is on screen.
 * @returns CSS pixels from the window's top left, or null when it is out of the view.
 */
export function toScreen(ra: number, dec: number): { x: number; y: number } | null {
  if (!view) return null;
  const p = project(view, ra, dec);
  const m = 200;
  return !p || p.x < -m || p.y < -m || p.x > cam.width + m || p.y > cam.height + m ? null : p;
}

/**
 * The sky position under a screen point.
 * @param x CSS pixels from the window's left.
 * @param y CSS pixels from the window's top.
 * @returns Degrees, or null off the sky.
 */
export function toWorld(x: number, y: number): { ra: number; dec: number } | null {
  const w = al?.pix2world(x, y);
  if (!w || !Number.isFinite(w[0]) || !Number.isFinite(w[1])) return null;
  return { ra: wrapRa(w[0]), dec: w[1] };
}

/** The patch square's box on screen; null when there is no patch or it is out of view. */
export function outline(): DOMRect | null {
  const at = patchAt();
  if (!at || !view) return null;
  const c = project(view, at.ra, at.dec);
  if (!c) return null;
  const half = at.fov / 120; // arcminutes → half the side in degrees
  const top = project(view, at.ra, Math.min(90, at.dec + half));
  const bottom = project(view, at.ra, Math.max(-90, at.dec - half));
  const side = Math.max(12, top && bottom ? Math.abs(bottom.y - top.y) : 12);
  const box = new DOMRect(c.x - side / 2, c.y - side / 2, side, side);
  if (box.right < 0 || box.bottom < 0 || box.left > cam.width || box.top > cam.height) return null;
  return box;
}

/**
 * Calls `fn` after a click on the sky that was not a drag and not on a dot (markers.ts `pick`
 * handles dots). The sky shows its own "Move the frame here" card first (FRM-3).
 * @returns Unsubscribe.
 */
export function onSkyClick(fn: (p: SkyPoint) => void): () => void {
  clickFns.add(fn);
  return () => clickFns.delete(fn);
}

/**
 * Calls `fn` as the pointer moves over the sky, and with null when it leaves.
 * @returns Unsubscribe.
 */
export function onPointer(fn: (p: SkyPoint | null) => void): () => void {
  pointerFns.add(fn);
  return () => pointerFns.delete(fn);
}

/**
 * Calls `fn` after the view changes (pan, zoom, resize, flyTo), at most once per drawn frame.
 * @returns Unsubscribe.
 */
export function onZoom(fn: (c: Readonly<Camera>) => void): () => void {
  zoomFns.add(fn);
  return () => zoomFns.delete(fn);
}

/**
 * Whether the patch square can be picked up and dragged (FRM-2). Off while the tour waits for
 * something else, for example.
 */
export function grabbable(on: boolean): void {
  flags.grab = on;
  if (!on && dragging) dragging = null;
  requestDraw();
}

/**
 * The coordinate grid (SKY-5).
 * @param show True or false to set it; leave out to only read it.
 * @returns Whether it is on.
 */
export function grid(show?: boolean): boolean {
  if (show !== undefined) {
    flags.grid = show;
    al?.setCooGrid({ enabled: show });
  }
  return flags.grid;
}

/**
 * Asks again for the sky tiles that failed (SKY-7). The loading card's Retry calls it.
 */
export function retry(): void {
  rev++;
  for (const t of tracks.values()) t.failed.clear();
  showLayer();
}

// ----- For markers.ts (lane C) ----------------------------------------------------------------

/** The projection of the view now, for drawing many dots fast; null before the map starts. */
export function currentView(): View | null {
  return view;
}

/** The canvas the dots are drawn on (under the patch). */
export function dotLayer(): HTMLCanvasElement | null {
  return dotsCanvas;
}

/** markers.ts lends the sky its dot picking, so a click on a dot is not a click on the sky. */
export function registerDots(hooks: DotHooks): void {
  dotHooks = hooks;
}

// ----- The map's layers and channels ------------------------------------------------------------

interface Shown {
  key: string;
  name: string;
  hips: HiPSLayer;
  /** The same channel from the shipped low-resolution sky, under `hips` (SPHEREx only). */
  soft: { name: string; hips: HiPSLayer } | null;
  channel: number | null;
}
let current: Shown | null = null;
/** The channel of the bottom layer (its soft sky), which stays for the whole visit. */
let baseChannel: number | null = null;

function softUrl(channel: number): string {
  return `${location.origin}${BASE}sky-hips/spherex-soft/${channel}/0`;
}
let incoming: Shown | null = null;
let layerSeq = 0;
let channelTimer = 0;

function wantedChannel(): number {
  return channelFor(lam);
}

/** The wavelength moved: show its channel, once the scale has rested for a moment. */
let channelPending = -1;
function channelSoon(): void {
  // `shown` comes with every picture; only a new channel restarts the wait.
  if (wantedChannel() === channelPending) return;
  channelPending = wantedChannel();
  clearTimeout(channelTimer);
  channelTimer = window.setTimeout(() => {
    channelPending = -1;
    if (layer === 'spherex' && flags.sw && (incoming ?? current)?.channel !== wantedChannel()) {
      showLayer();
    } else note();
  }, 120);
}

function layerKey(): string {
  if (layer !== 'spherex' || !flags.sw) return layer === 'spherex' ? 'wise-w1' : layer;
  return `spherex/${wantedChannel()}/${rev}`;
}

/** Shows the chosen map: it loads under the old one, then fades in over it (SKY-2). */
function showLayer(): void {
  if (!al || !A) {
    note();
    return;
  }
  const key = layerKey();
  if (incoming?.key === key || (!incoming && current?.key === key)) return;
  if (incoming) {
    removeShown(incoming);
    incoming = null;
  }
  const spherex = key.startsWith('spherex/');
  const channel = spherex ? wantedChannel() : null;
  const url = spherex
    ? `${location.origin}${BASE}sky-hips/${key}`
    : WISE_HIPS[key as keyof typeof WISE_HIPS];
  const name = `sky-${++layerSeq}`;
  let soft: Shown['soft'] = null;
  if (spherex && channel !== baseChannel) {
    const softName = `${name}-soft`;
    const softHips = A.HiPS(softUrl(channel ?? 0), {
      name: softName,
      imgFormat: 'png',
    });
    al.setOverlayImageLayer(softHips, softName);
    soft = { name: softName, hips: softHips };
  }
  const hips = A.HiPS(url, { name, imgFormat: spherex ? 'png' : 'jpeg' });
  const next: Shown = { key, name, hips, soft, channel };
  tellWorker(channel);
  al.setOverlayImageLayer(hips, name);
  if (!current) {
    current = next;
    note();
    report();
    return;
  }
  hips.setOpacity(0.001);
  soft?.hips.setOpacity(0.001);
  incoming = next;
  note();
  void ready(next).then(() => {
    if (incoming !== next) return;
    fadeIn(next);
  });
}

function fadeIn(next: Shown): void {
  const start = performance.now();
  const step = (now: number) => {
    if (incoming !== next) return;
    const t = Math.min(1, (now - start) / CROSSFADE_MS);
    next.hips.setOpacity(Math.max(0.001, t));
    next.soft?.hips.setOpacity(Math.max(0.001, t));
    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }
    if (current) removeShown(current);
    current = next;
    incoming = null;
    tellWorker(next.channel);
    note();
    report();
  };
  requestAnimationFrame(step);
}

function removeShown(shown: Shown): void {
  al?.removeImageLayer(shown.name);
  if (shown.soft) al?.removeImageLayer(shown.soft.name);
}

function tellWorker(channel: number | null): void {
  const channels = [current?.channel, channel].filter(
    (c): c is number => c !== null && c !== undefined,
  );
  navigator.serviceWorker?.controller?.postMessage({ type: 'sky-active', channels });
}

/** Resolves when a layer's tiles for the view are in, or after 4 s whatever happened. */
function ready(shown: Shown): Promise<void> {
  if (!shown.key.startsWith('spherex/')) return new Promise((r) => setTimeout(r, 1200));
  return new Promise((resolve) => {
    const started = performance.now();
    const check = () => {
      const t = tracks.get(shown.key);
      const pending = t ? t.started.size - t.done.size - t.failed.size : 1;
      const waited = performance.now() - started;
      if ((t && t.started.size > 0 && pending <= 0 && waited > 150) || waited > 4000) resolve();
      else setTimeout(check, 80);
    };
    check();
  });
}

// ----- Loading, reported to the shell's card (GEN-4, SKY-7, O-I15) --------------------------------

interface TileEvent {
  ch: number;
  rev: string;
  k: number;
  n: number;
  state: 'start' | 'done' | 'failed';
  from?: string;
}
interface Track {
  started: Set<string>;
  done: Set<string>;
  failed: Set<string>;
}
const tracks = new Map<string, Track>();
let firstDone = false;
/** The current round of loading has been reported as finished. */
let roundDone = false;
let doneTimer = 0;
let reportTimer = 0;

function onTile(e: TileEvent): void {
  const key = `spherex/${e.ch}/${e.rev}`;
  let t = tracks.get(key);
  if (!t) {
    t = { started: new Set(), done: new Set(), failed: new Set() };
    tracks.set(key, t);
  }
  const id = `${e.k}/${e.n}`;
  if (e.state === 'start') {
    // A fresh round of loading: the count starts again once the last round finished.
    if (roundDone && t.started.size === t.done.size + t.failed.size) {
      t.started = new Set(t.failed);
      t.done.clear();
    }
    t.started.add(id);
  } else if (e.state === 'done') t.done.add(id);
  else {
    t.failed.add(id);
    note();
  }
  if (!reportTimer) reportTimer = window.setTimeout(report, 150);
}

function report(): void {
  reportTimer = 0;
  const shown = current;
  if (!shown) return;
  if (!shown.key.startsWith('spherex/')) {
    firstDone = true;
    roundDone = true;
    skyReady({ layer: LAYER_NAMES[layer], loaded: 1, total: 1, failed: 0, first: false });
    return;
  }
  const t = tracks.get(shown.key);
  const total = t?.started.size ?? 0;
  const loaded = (t?.done.size ?? 0) + (t?.failed.size ?? 0);
  const failed = t?.failed.size ?? 0;
  const done = total > 0 && loaded >= total;
  const load = {
    layer: LAYER_NAMES.spherex,
    loaded: total ? loaded : 0,
    total: total || 1,
    failed,
    first: !firstDone,
  };
  if (!done) {
    clearTimeout(doneTimer);
    doneTimer = 0;
    roundDone = false;
    skyReady(load);
    return;
  }
  // Done only once loading has been quiet for a moment: tiles arrive in bursts while the view
  // moves, and the loading card should not flicker between them.
  if (roundDone || doneTimer) return;
  doneTimer = window.setTimeout(() => {
    doneTimer = 0;
    const now = tracks.get(shown.key);
    if (current !== shown || !now || now.done.size + now.failed.size < now.started.size) return;
    roundDone = true;
    firstDone = true;
    skyReady({
      ...load,
      loaded: now.started.size,
      total: now.started.size,
      failed: now.failed.size,
    });
  }, 500);
}

// ----- The sky note (SKY-6, H1, O-I6) and the context-loss message (SKY-9) ------------------------

function note(): void {
  const el = document.getElementById('sky-note');
  if (!el) return;
  if (flags.lost) {
    el.innerHTML = `The browser dropped the sky map's drawing surface, so the map stopped drawing. <button class="sky-note-btn" data-sky-reload>Reload the page</button>`;
    el.querySelector('[data-sky-reload]')?.addEventListener('click', () => location.reload());
    return;
  }
  const shown = incoming ?? current;
  const channel = shown?.channel ?? (layer === 'spherex' && flags.sw ? wantedChannel() : null);
  let fact: string;
  let more: string;
  if (channel !== null) {
    const l = CHANNEL_LAM[channel] ?? lam;
    const failed = [...tracks.entries()].some(([k, t]) => k === shown?.key && t.failed.size > 0);
    fact = `SPHEREx ${l.toFixed(2)} µm, gaps filled${failed ? ', soft in places' : ''}`;
    more =
      `SPHEREx DR1 all-sky map from NASA IRSA: channel ${channel} of 102, ${l} µm, detector D${detectorOf(channel)}. ` +
      'Bright star centres, which the map leaves empty, are filled in from their rim. ' +
      'Shown larger than its pixels, the map is softened by about half a pixel (display only). ' +
      'Until NASA’s tiles arrive, a smoothed low-resolution sky shipped with Sima stands in' +
      (failed ? '; some tiles did not load, so their place still shows it.' : '.');
  } else {
    const wanted = layer === 'spherex' ? 'wise-w1' : layer;
    fact = LAYER_NAMES[wanted];
    more =
      (layer === 'spherex'
        ? 'The SPHEREx map needs a service worker, which this browser did not allow, so AllWISE is shown. '
        : '') +
      `AllWISE all-sky map, ${wanted === 'wise-w1' ? 'W1, 3.4 µm' : 'W2, 4.6 µm'} (WISE, 2010 to 2011), from NASA IRSA. Nothing is filled in.`;
  }
  el.innerHTML = `<span>${H1}</span> · <span class="sky-note-more" tabindex="0" data-tip="${esc(more)}" data-tip-pos="above">${esc(fact)}</span>`;
}

function watchContext(host: HTMLElement): void {
  for (const c of host.querySelectorAll('canvas')) {
    c.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      flags.lost = true;
      note();
    });
  }
}

// ----- Drawing: one loop, one frame at a time ---------------------------------------------------

let drawQueued = false;
let glide: {
  from: Camera;
  to: { ra: number; dec: number; fov: number };
  start: number;
  ms: number;
} | null = null;
/** Zooming toward a screen point: the wheel, double-click (SKY-3). */
let zoomTo: { fov: number; x: number; y: number; ra: number; dec: number } | null = null;

function requestDraw(): void {
  drawQueued = true;
}

/** Runs every frame: follows Aladin's camera (it pans with inertia) and draws when it changed. */
function loop(): void {
  const tick = (now: number) => {
    animate(now);
    if (readCamera() || drawQueued) {
      drawQueued = false;
      draw();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function animate(now: number): void {
  if (!al) return;
  if (glide) {
    const t = Math.min(1, (now - glide.start) / glide.ms);
    const e = 1 - (1 - t) ** 3;
    const { from, to } = glide;
    const dRa = ((to.ra - from.ra + 540) % 360) - 180;
    al.setFoV(Math.exp(Math.log(from.fov) + (Math.log(to.fov) - Math.log(from.fov)) * e));
    al.gotoRaDec(wrapRa(from.ra + dRa * e), from.dec + (to.dec - from.dec) * e);
    if (t >= 1) glide = null;
  }
  if (zoomTo) {
    const fov = cam.fov * (zoomTo.fov / cam.fov) ** 0.28;
    const close = Math.abs(Math.log(zoomTo.fov / cam.fov)) < 0.004;
    al.setFoV(close ? zoomTo.fov : fov);
    keepUnder(zoomTo.ra, zoomTo.dec, zoomTo.x, zoomTo.y);
    if (close) zoomTo = null;
  }
}

/** Shifts the centre so the sky position (ra, dec) sits on screen point (x, y). */
function keepUnder(ra: number, dec: number, x: number, y: number): void {
  if (!al) return;
  readCamera(true);
  if (!view) return;
  const p = project(view, ra, dec);
  if (!p) return;
  const c = al.pix2world(cam.width / 2 + (p.x - x), cam.height / 2 + (p.y - y));
  if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) al.gotoRaDec(wrapRa(c[0]), c[1]);
}

/** Reads Aladin's camera; true when it changed. Recalibrates the fast projection. */
function readCamera(force = false): boolean {
  if (!al || !skyEl) return false;
  const [ra, dec] = al.getRaDec();
  const [fov] = al.getFov();
  const width = skyEl.clientWidth;
  const height = skyEl.clientHeight;
  if (
    !force &&
    view &&
    ra === cam.ra &&
    dec === cam.dec &&
    fov === cam.fov &&
    width === cam.width &&
    height === cam.height
  ) {
    return false;
  }
  Object.assign(cam, { ra: wrapRa(ra), dec, fov, width, height });
  if (fov > FOV_MAX + 0.01 || fov < FOV_MIN - 1e-4) al.setFoV(clampFov(fov));
  const v = makeView(cam.ra, cam.dec, 1, width / 2, height / 2);
  const dx = Math.min(width / 4, 200);
  const w = al.pix2world(width / 2 + dx, height / 2 + dx / 2);
  const cal = w ? calibrate(v, w[0], w[1], width / 2 + dx, height / 2 + dx / 2) : null;
  view = cal ? makeView(cam.ra, cam.dec, cal.scale, width / 2, height / 2, cal.flip) : view;
  return true;
}

function draw(): void {
  sizeCanvas(marks);
  sizeCanvas(dotsCanvas);
  drawPatch();
  // The view and the patch box, readable by the guide and the smoke test without the sky's code.
  if (skyEl) {
    skyEl.dataset.view = `${cam.ra.toFixed(5)} ${cam.dec.toFixed(5)} ${cam.fov.toFixed(5)}`;
    const box = outline();
    skyEl.dataset.patch = box
      ? `${Math.round(box.x)} ${Math.round(box.y)} ${Math.round(box.width)}`
      : '';
  }
  placeClickCard();
  for (const fn of zoomFns) fn({ ...cam });
}

function sizeCanvas(c: HTMLCanvasElement | null): void {
  if (!c) return;
  const w = Math.round(innerWidth * devicePixelRatio);
  const h = Math.round(innerHeight * devicePixelRatio);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
}

/** Where the patch is drawn: being dragged, just dropped, or where the frame says. */
function patchAt(): { ra: number; dec: number; fov: number } | null {
  if (!patch) return null;
  if (dragging) return { ra: dragging.ra, dec: dragging.dec, fov: patch.fov };
  if (dropped) return { ra: dropped.ra, dec: dropped.dec, fov: patch.fov };
  return patch;
}

/** FRM-1: line style says what the patch holds. */
function patchStyle(): { stroke: string; dash: number[]; cap: CanvasLineCap } {
  const source = dragging || dropped ? 'loading' : (patch?.source ?? 'none');
  switch (source) {
    case 'simulated':
      return { stroke: colours.amber ?? '', dash: [6, 4], cap: 'butt' };
    case 'none':
      return { stroke: colours.ink3 ?? '', dash: [0.1, 5], cap: 'round' };
    case 'loading':
      return { stroke: colours.ink2 ?? '', dash: [6, 4], cap: 'butt' };
    default:
      return { stroke: colours.mark ?? '', dash: [], cap: 'butt' };
  }
}

function drawPatch(): void {
  const ctx = marks?.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (clicked) {
    const p = view && project(view, clicked.ra, clicked.dec);
    if (p) {
      ctx.strokeStyle = colours.ink ?? '';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const box = outline();
  if (!box || !patch) return;
  const style = patchStyle();
  const f = frameRect();
  // The tether: a dotted line from the patch to the nearest point of the frame (DESIGN.md).
  if (f && !dragging) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const tx = Math.max(f.left, Math.min(f.right, cx));
    const ty = Math.max(f.top + 14, Math.min(f.bottom - 14, cy));
    const inside = cx >= f.left && cx <= f.right && cy >= f.top && cy <= f.bottom;
    if (!inside && !(tx >= box.left && tx <= box.right && ty >= box.top && ty <= box.bottom)) {
      const dx = tx - cx;
      const dy = ty - cy;
      const half = box.width / 2;
      const s = Math.min(
        Math.abs(dx) > 0 ? half / Math.abs(dx) : 1,
        Math.abs(dy) > 0 ? half / Math.abs(dy) : 1,
        1,
      );
      ctx.save();
      ctx.strokeStyle = colours.mark ?? '';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(cx + dx * s, cy + dy * s);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.save();
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = 2;
  ctx.lineCap = style.cap;
  ctx.setLineDash(style.dash);
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
  // The patch label: only when nothing else names the patch (DESIGN.md Marks on the sky).
  const loading = !!(dragging || dropped) || patch.source === 'loading';
  if (loading || !f) {
    const text = loading
      ? `${dropped || dragging ? 'Moving here' : patch.label} · loading`
      : patch.label;
    ctx.font = colours.font ?? '';
    const w = ctx.measureText(text).width + 10;
    const y = box.top - 20 < 4 ? box.bottom + 3 : box.top - 19;
    ctx.fillStyle = style.stroke;
    roundRect(ctx, box.left - 1, y, w, 17, 4);
    ctx.fill();
    ctx.fillStyle = colours.sky ?? '';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, box.left + 4, y + 9);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ----- Pointer: pan, zoom toward the pointer, grab the patch, click (SKY-3, FRM-2, FRM-3) -------

/** The box the patch can be grabbed by: the square itself, at least 28 px. */
function grabBox(): DOMRect | null {
  const box = outline();
  if (!box) return null;
  const grow = Math.max(0, (28 - box.width) / 2);
  return new DOMRect(box.x - grow, box.y - grow, box.width + 2 * grow, box.height + 2 * grow);
}

function inBox(r: DOMRect | null, x: number, y: number): boolean {
  return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function setCursor(kind: '' | 'grab' | 'grabbing' | 'pointer'): void {
  if (!skyEl) return;
  skyEl.dataset.cursor = kind;
}

function watchPointer(el: HTMLElement): void {
  let down: { x: number; y: number; t: number; moved: boolean } | null = null;
  let clickTimer = 0;
  let coordsQueued = false;
  let last: { x: number; y: number } | null = null;
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };

  el.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      glide = null;
      if (flags.grab && patch && inBox(grabBox(), e.clientX, e.clientY)) {
        // FRM-2: the patch is picked up anywhere inside it; the sky stays still.
        stop(e);
        const box = outline();
        const at = patchAt();
        if (!box || !at) return;
        dragging = {
          ra: at.ra,
          dec: at.dec,
          dx: e.clientX - (box.x + box.width / 2),
          dy: e.clientY - (box.y + box.height / 2),
        };
        el.setPointerCapture(e.pointerId);
        setCursor('grabbing');
        requestDraw();
        return;
      }
      down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    },
    true,
  );

  el.addEventListener(
    'pointermove',
    (e) => {
      last = { x: e.clientX, y: e.clientY };
      if (dragging) {
        stop(e);
        const w = toWorld(e.clientX - dragging.dx, e.clientY - dragging.dy);
        if (w) Object.assign(dragging, w);
        requestDraw();
        return;
      }
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) {
        down.moved = true;
        flags.moved = true; // the user panned: the sky is theirs now (FRM-4)
      }
      if (!down) {
        const overPatch = flags.grab && inBox(grabBox(), e.clientX, e.clientY);
        const dot = !overPatch ? (dotHooks?.pick(e.clientX, e.clientY) ?? null) : null;
        dotHooks?.hover(dot?.id ?? null);
        setCursor(overPatch ? 'grab' : dot ? 'pointer' : '');
      }
      if (!coordsQueued) {
        coordsQueued = true;
        requestAnimationFrame(() => {
          coordsQueued = false;
          if (!last) return;
          const world = toWorld(last.x, last.y);
          const coords = document.getElementById('sky-coords');
          if (coords) coords.textContent = world ? formatCoords(world.ra, world.dec) : '';
          for (const fn of pointerFns) fn(world ? { ...world, x: last.x, y: last.y } : null);
        });
      }
    },
    true,
  );

  const end = (e: PointerEvent) => {
    if (dragging) {
      stop(e);
      const at = { ra: wrapRa(dragging.ra), dec: Math.max(-90, Math.min(90, dragging.dec)) };
      dragging = null;
      setCursor('grab');
      dropped = { ...at, until: Date.now() + 4000 };
      hideClickCard();
      keepPatchClear();
      emit('aim', at); // FRM-2: the frame is aimed where the patch is put down
      requestDraw();
      return;
    }
    const d = down;
    down = null;
    if (!d || d.moved || e.type === 'pointercancel' || performance.now() - d.t > 700) return;
    const x = e.clientX;
    const y = e.clientY;
    // Wait a moment: a second click makes it a double-click, which zooms instead.
    clearTimeout(clickTimer);
    clickTimer = window.setTimeout(() => onClick(x, y), 260);
  };
  el.addEventListener('pointerup', end, true);
  el.addEventListener('pointercancel', end, true);

  el.addEventListener(
    'dblclick',
    (e) => {
      stop(e);
      clearTimeout(clickTimer);
      zoomAround(e.clientX, e.clientY, cam.fov / 2);
    },
    true,
  );

  el.addEventListener(
    'wheel',
    (e) => {
      // SKY-3: the wheel zooms toward the pointer; a fast spin is one smooth zoom.
      stop(e);
      const lines = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      const delta = Math.max(-300, Math.min(300, e.deltaY * lines));
      const base = zoomTo?.fov ?? cam.fov;
      zoomAround(e.clientX, e.clientY, base * Math.exp(delta * 0.0022));
    },
    { capture: true, passive: false },
  );

  el.addEventListener('pointerleave', () => {
    last = null;
    const coords = document.getElementById('sky-coords');
    if (coords) coords.textContent = '';
    dotHooks?.hover(null);
    for (const fn of pointerFns) fn(null);
  });
  // Aladin's own menus and keys are not used.
  el.addEventListener('contextmenu', (e) => e.stopPropagation(), true);
}

/** Zooms so the sky under (x, y) stays under it (SKY-3). */
function zoomAround(x: number, y: number, fov: number): void {
  flags.moved = true;
  glide = null;
  const target = clampFov(fov);
  const anchor = zoomTo && Math.hypot(zoomTo.x - x, zoomTo.y - y) < 2 ? zoomTo : toWorld(x, y);
  if (!anchor) return;
  zoomTo = { fov: target, x, y, ra: anchor.ra, dec: anchor.dec };
}

function onClick(x: number, y: number): void {
  const dot = dotHooks?.pick(x, y);
  const world = toWorld(x, y);
  if (!world) return;
  const p = { ...world, x, y };
  if (dot) {
    dotHooks?.click(dot.id, p);
    return;
  }
  showClickCard(p);
  for (const fn of clickFns) fn(p);
}

/** After a drop: if the frame covers the patch, the sky moves just enough to show it. */
function keepPatchClear(): void {
  const f = frameRect();
  const box = outline();
  if (!f || !box || !al) return;
  if (box.right < f.left || box.left > f.right || box.bottom < f.top || box.top > f.bottom) return;
  const shift = box.x + box.width / 2 - Math.max(80, f.left / 2);
  const c = al.pix2world(cam.width / 2 + shift, cam.height / 2);
  if (c) flyTo({ ra: c[0], dec: c[1] });
}

// ----- "Move the frame here" (FRM-3) ------------------------------------------------------------

/** FRM-3: a click asks before anything moves. */
function showClickCard(p: SkyPoint): void {
  const card = document.getElementById('sky-click');
  if (!card) return;
  clicked = p;
  card.classList.add('sky-click');
  card.innerHTML = `
    <span class="sky-click-coords">${esc(formatCoords(p.ra, p.dec))}</span>
    <button class="btn primary" data-move data-guide="move-frame-here">Move the frame here</button>
    <button class="icon-btn sm" data-close aria-label="Close" data-tip="Close">${icon('close')}</button>`;
  card.hidden = false;
  card.querySelector('[data-close]')?.addEventListener('click', hideClickCard);
  card.querySelector('[data-move]')?.addEventListener('click', () => {
    const at = clicked;
    hideClickCard();
    if (!at) return;
    dropped = { ra: at.ra, dec: at.dec, until: Date.now() + 4000 };
    emit('aim', { ra: at.ra, dec: at.dec });
    requestDraw();
  });
  placeClickCard();
  requestDraw();
}

function hideClickCard(): void {
  clicked = null;
  const card = document.getElementById('sky-click');
  if (card) card.hidden = true;
  requestDraw();
}

/** Puts the card by its spot, clear of every other card and inside the window. */
function placeClickCard(): void {
  const card = document.getElementById('sky-click');
  if (!card || card.hidden || !clicked || !view) return;
  const p = project(view, clicked.ra, clicked.dec);
  if (!p || p.x < 0 || p.y < 0 || p.x > cam.width || p.y > cam.height) {
    hideClickCard();
    return;
  }
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const others = [...document.querySelectorAll('[data-card]')]
    .filter((el) => el !== card && el.checkVisibility())
    .map((el) => el.getBoundingClientRect());
  const spots = [
    { x: p.x - w / 2, y: p.y - h - 14 },
    { x: p.x - w / 2, y: p.y + 14 },
    { x: p.x + 16, y: p.y - h / 2 },
    { x: p.x - w - 16, y: p.y - h / 2 },
    { x: p.x + 12, y: p.y + 12 },
    { x: p.x - w - 12, y: p.y - h - 12 },
  ];
  let best = spots[0] ?? { x: 0, y: 0 };
  let bestCost = Infinity;
  for (const s of spots) {
    const x = Math.max(8, Math.min(cam.width - w - 8, s.x));
    const y = Math.max(8, Math.min(cam.height - h - 8, s.y));
    let cost = Math.hypot(x - s.x, y - s.y);
    for (const r of others) {
      const ox = Math.min(x + w, r.right) - Math.max(x, r.left);
      const oy = Math.min(y + h, r.bottom) - Math.max(y, r.top);
      if (ox > -4 && oy > -4) cost += 10000 + Math.max(0, ox) * Math.max(0, oy);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = { x, y };
    }
  }
  card.style.left = `${Math.round(best.x)}px`;
  card.style.top = `${Math.round(best.y)}px`;
}

// ----- Helpers ----------------------------------------------------------------------------------

function clampFov(fov: number): number {
  return Math.max(FOV_MIN, Math.min(FOV_MAX, fov));
}

function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

if (import.meta.env.DEV) {
  // For people and tests poking at the sky in dev: `__sky.tracks`, `__sky.al`.
  (window as unknown as { __sky: unknown }).__sky = {
    tracks,
    get al() {
      return al;
    },
    get view() {
      return view;
    },
    cam,
    outline,
  };
}
