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
 *   once its tiles are in (0.26 s), never a cut to grey. The map is a globe (Aladin's "SIN"
 *   projection): from a few arcminutes it fills the window, and zoomed out further it becomes the
 *   whole sky seen from outside, a disc with dark space round it, with no switch on the way.
 * - The patch (FRM-1 to 4): drawn from the frame's `patch` messages; grabbed anywhere inside;
 *   dropped, it sends `aim`. A click on empty sky only offers "Move the frame here". The sky
 *   moves only when the user moves it: never because pictures arrived.
 */
import { emit, on, type BusEvents, type PatchSource } from '../shell/bus.ts';
import { frameRect, onFrameMove, skyReady, type SkyLoad } from '../shell/shell.ts';
import { icon } from '../shell/icons.ts';
import { onLayout } from '../shell/sheet.ts';
import { formatCoords } from '../core/astro.ts';
import { CHANNEL_LAM, DEFAULT_LAM, WISE_HIPS, channelFor, detectorOf } from './hips.ts';
import {
  calibrate,
  fovOf,
  makeView,
  project,
  separation,
  widestFov,
  wrapRa,
  zoomOf,
  type View,
} from './project.ts';

/** What the sky shows: its centre and zoom. */
export interface Camera {
  /** Centre of the view, degrees. */
  ra: number;
  dec: number;
  /**
   * Width of the view in DEGREES (not arcminutes, unlike the frame's field size). Past 180 the
   * whole globe shows and the number keeps growing as it shrinks (project.ts `zoomOf`), up to
   * `widestFov` (360 at most).
   */
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
/** The smallest a patch square is drawn, CSS px. */
const MIN_SIDE = 16;
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
/** Discover's shorter sky note (DESIGN-v2 mockups: "Average of all dates: moving things blur here"). */
const H1_DISCOVER = 'Average of all dates:';

// ----- Aladin Lite, as much of it as Sima uses --------------------------------------------------

interface HiPSLayer {
  setOpacity(o: number): void;
  /** True once Aladin has added it to the view. */
  readonly added: boolean;
}
interface Aladin {
  getRaDec(): [number, number];
  /** The window's half-width over the globe's radius (project.ts `zoomOf`). */
  getZoomFactor(): number;
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
/** Aladin's own element: the map's box, which the globe is centred in (`mapBox`). */
let mapHost: HTMLElement | null = null;
/**
 * The map's box on screen, CSS px from the window's top left. The whole window in Expert; in
 * Discover, the free space beside its panels, so the globe is centred there (DESIGN-v2 8.4).
 */
const hostBox = { x: 0, y: 0, w: 0, h: 0 };

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
/** The patch (or a workspace frame's ring, by id) while it is being dragged. */
let dragging: { ra: number; dec: number; dx: number; dy: number; ring?: string } | null = null;
/** The spot of the open click card. */
let clicked: SkyPoint | null = null;

/**
 * A workspace frame's patch (SPEC 10 O-V1): drawn like the main patch, with its number and a thin
 * line to its window. Set by src/workspace through `setRings`.
 */
export interface Ring {
  id: string;
  ra: number;
  dec: number;
  /** Arcminutes. */
  fov: number;
  source: PatchSource;
  /** Shown on the ring's corner: the frame's number. */
  label: string;
  /** The frame's window, for the line; null draws no line. */
  el: Element | null;
}
let rings: readonly Ring[] = [];
const ringDropFns = new Set<(id: string, ra: number, dec: number) => void>();

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
        (separation(p.ra, p.dec, dropped.ra, dropped.dec) < 1e-3 ||
          p.source === 'loading' ||
          Date.now() > dropped.until)
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
  // The globe's faint limb glow, in the shown detector's hue (DESIGN-v2 8.4, D-11).
  const limb = document.createElement('div');
  limb.className = 'sky-limb';
  el.replaceChildren(host, lift, limb);
  mapHost = host;
  placeHost(freeBox());
  // The bottom layer: the first channel's soft sky (shipped), which never needs the network.
  baseChannel = flags.sw ? wantedChannel() : null;
  const base = flags.sw ? softUrl(wantedChannel()) : WISE_HIPS['wise-w1'];
  al = lib.aladin(host, {
    survey: base,
    hipsList: [],
    projection: 'SIN',
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
  watchBox();
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
 * @param to Centre in degrees, `fov` in degrees across the window (clamped to 0.05 up to the
 *   whole globe, `widestFov`).
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
  // A far trip zooms out until both ends show, turns, then zooms in, so the eye can follow it and
  // the middle is drawn from the wide (shipped, sharp) map instead of half-loaded tiles
  // (ux-audit #6). A near one is the plain 0.65 s glide.
  const sep = separation(cam.ra, cam.dec, target.ra, target.dec);
  const top = Math.max(cam.fov, target.fov);
  const mid = clampFov(Math.max(top, sep * 2.4));
  const arc = mid > top * 1.5 ? Math.log(zoomOf(mid)) - Math.log(zoomOf(top)) : 0;
  const ms = arc ? Math.min(2200, 1100 + 260 * arc) : 650;
  glide = { from: { ...cam }, to: target, start: performance.now(), ms, arc };
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
  const w = skyAt(x, y);
  return w && { ra: wrapRa(w[0]), dec: w[1] };
}

/** Aladin's sky position under a point, or null off the globe (where Aladin throws). */
function skyAt(x: number, y: number): [number, number] | null {
  let w: [number, number] | undefined;
  try {
    w = al?.pix2world(x - hostBox.x, y - hostBox.y);
  } catch {
    return null;
  }
  return w && Number.isFinite(w[0]) && Number.isFinite(w[1]) ? w : null;
}

/** The patch square's box on screen; null when there is no patch or it is out of view. */
export function outline(): DOMRect | null {
  return boxAt(patchAt());
}

/**
 * The workspace's extra frames' patches (O-V1). Each is drawn as a square in the patch's line
 * styles, numbered, with a thin dotted line to its window, and can be dragged like the patch.
 */
export function setRings(next: readonly Ring[]): void {
  rings = next;
  requestDraw();
}

/**
 * Calls `fn` when the user drops a ring somewhere else (the frame looks there next).
 * @returns Unsubscribe.
 */
export function onRingDrop(fn: (id: string, ra: number, dec: number) => void): () => void {
  ringDropFns.add(fn);
  return () => ringDropFns.delete(fn);
}

/** A square on the sky's box on screen; null when it is out of view. */
function boxAt(at: { ra: number; dec: number; fov: number } | null): DOMRect | null {
  if (!at || !view) return null;
  const c = project(view, at.ra, at.dec);
  if (!c) return null;
  const half = at.fov / 120; // arcminutes → half the side in degrees
  const top = project(view, at.ra, Math.min(90, at.dec + half));
  const bottom = project(view, at.ra, Math.max(-90, at.dec - half));
  // Never smaller than 16 px, so the line style (FRM-1) reads at every zoom.
  const side = Math.max(MIN_SIDE, top && bottom ? Math.abs(bottom.y - top.y) : MIN_SIDE);
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

// ----- The map's box (DESIGN-v2 8.4) ------------------------------------------------------------

/** Discover's left column on desktop: the mission list (372 px) from its 16 px gutter. */
const DISCOVER_LEFT = 388;
/** The phone's top row (56 px) and its gap. */
const PHONE_TOP = 64;
/** How long the map takes to fade out, and back in, when its box moves (DESIGN-v2 10). */
const DIP_MS = 150;

/**
 * The map's box: the whole window in Expert. In Discover, the free space beside Discover's
 * panels, so the globe is centred there: right of the left column on desktop, between the top
 * row and the sheet on phones.
 */
function freeBox(): { x: number; y: number; w: number; h: number } {
  const W = innerWidth;
  const H = innerHeight;
  if (document.documentElement.dataset.view !== 'discover') return { x: 0, y: 0, w: W, h: H };
  if (W >= 700) {
    const left = W - DISCOVER_LEFT >= 560 ? DISCOVER_LEFT : 0;
    return { x: left, y: 0, w: W - left, h: H };
  }
  // Under the top row and the sky note (which sits under the top row on phones, sky.css).
  const note = document.getElementById('sky-note');
  const noteBottom = note?.checkVisibility() ? note.getBoundingClientRect().bottom + 8 : 0;
  const y = Math.round(Math.max(PHONE_TOP, Math.min(noteBottom, H / 3)));
  const sheet = document.getElementById('sheet');
  const top = sheet?.checkVisibility() ? sheet.getBoundingClientRect().top : H;
  const bottom = Math.max(y + 200, Math.min(H, top));
  return { x: 0, y, w: W, h: Math.round(bottom - y) };
}

/** Puts Aladin's element in a box (it follows its element's size by itself). */
function placeHost(b: { x: number; y: number; w: number; h: number }): void {
  Object.assign(hostBox, b);
  if (!mapHost) return;
  Object.assign(mapHost.style, {
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
  });
  requestDraw();
}

let dipping = false;
/**
 * Moves the map to its box now. With `dip`, a change of place is covered by a short fade out and
 * in (Aladin cannot move its globe across the screen); the globe keeps its size on screen.
 */
function updateBox(dip: boolean): void {
  const b = freeBox();
  const h = hostBox;
  if (b.x === h.x && b.y === h.y && b.w === h.w && b.h === h.h) return;
  const host = mapHost;
  if (!host || !al || !dip || dipping) {
    swapBox(b);
    return;
  }
  dipping = true;
  const out = host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DIP_MS, fill: 'forwards' });
  void out.finished
    .catch(() => undefined)
    .then(() => {
      dipping = false;
      swapBox(freeBox());
      out.cancel();
      host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DIP_MS });
    });
}

/** Places the map in box `b`, keeping the globe's size on screen. */
function swapBox(b: { x: number; y: number; w: number; h: number }): void {
  const r = view?.scale ?? 0;
  const wasGlobe = r > 0 && r < Math.hypot(hostBox.w, hostBox.h) / 2;
  placeHost(b);
  if (al && wasGlobe) al.setFoV(clampFov(fovOf(b.w / 2 / r)));
  readCamera(true);
  requestDraw();
}

function watchBox(): void {
  addEventListener('resize', () => updateBox(false));
  // Discover or Expert (shell/view.ts sets html[data-view]); the phone sheet's height.
  new MutationObserver(() => {
    updateBox(true);
    note();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-view'] });
  // The phone layout and the sheet's height (lane M, shell/sheet.ts).
  onLayout(() => updateBox(true));
  const sheet = document.getElementById('sheet');
  if (sheet) {
    new MutationObserver(() => updateBox(true)).observe(sheet, {
      attributes: true,
      attributeFilter: ['hidden', 'data-height', 'style', 'class'],
    });
    new ResizeObserver(() => updateBox(true)).observe(sheet);
  }
}

/** The map's box on screen (the globe is centred in it), CSS px from the window's top left. */
export function mapBox(): DOMRect {
  return new DOMRect(hostBox.x, hostBox.y, hostBox.w, hostBox.h);
}

/**
 * The globe's disc on screen when the whole globe shows (zoomed out); null when the sky fills
 * the map's box. For placing cards by the globe (the welcome card overlaps its edge by 40 px).
 */
export function globeCircle(): { x: number; y: number; r: number } | null {
  if (!view || skyEl?.dataset.globe !== '1') return null;
  return { x: view.cx, y: view.cy, r: view.scale };
}

/**
 * The diameter, CSS px, a globe `d` wide has as a view `fov` (sky.ts `flyTo`), in the map's box.
 * Aladin keeps the globe at least half the box's width.
 */
export function globeFov(d: number): number {
  const w = hostBox.w || innerWidth;
  return fovOf(w / Math.max(1, d));
}

// ----- How bright the map is under a label (DESIGN-v2 9, "Labels over a bright sky") ------------

/** CSS px per sample of the map's brightness. */
const SAMPLE_PX = 8;
let bright: { key: string; at: number; w: number; h: number; lin: Float32Array } | null = null;
let sampler: CanvasRenderingContext2D | null = null;

/**
 * The map's mean brightness under a box on screen, linear (0 black to 1 white), read from the
 * map as drawn now at one sample per 8 px. 0 when unknown (off the map, or no map yet).
 */
export function skyBrightness(left: number, top: number, right: number, bottom: number): number {
  const g = brightGrid();
  if (!g) return 0;
  const x0 = Math.max(0, Math.floor((left - hostBox.x) / SAMPLE_PX));
  const x1 = Math.min(g.w - 1, Math.floor((right - hostBox.x) / SAMPLE_PX));
  const y0 = Math.max(0, Math.floor((top - hostBox.y) / SAMPLE_PX));
  const y1 = Math.min(g.h - 1, Math.floor((bottom - hostBox.y) / SAMPLE_PX));
  let sum = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      sum += g.lin[y * g.w + x] ?? 0;
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** The brightness samples, read again when the view or the tiles changed (at most 4 a second). */
function brightGrid(): { w: number; h: number; lin: Float32Array } | null {
  const canvas = mapHost?.querySelector<HTMLCanvasElement>('canvas.aladin-imageCanvas');
  if (!canvas || !canvas.width || !skyEl) return bright;
  let done = 0;
  for (const t of tracks.values()) done += t.done.size;
  const key = `${skyEl.dataset.view} ${hostBox.w} ${hostBox.h} ${done} ${current?.key ?? ''}`;
  const now = performance.now();
  if (bright && (bright.key === key || now - bright.at < 250)) return bright;
  // Reading the map back from the GPU is slow on a software renderer: only once the view has
  // stopped (labels are only added then), and never under the intro.
  if (now - movedAt < 200 || document.documentElement.dataset.intro !== undefined) return bright;
  const w = Math.max(1, Math.ceil(hostBox.w / SAMPLE_PX));
  const h = Math.max(1, Math.ceil(hostBox.h / SAMPLE_PX));
  if (!sampler) {
    const c = document.createElement('canvas');
    sampler = c.getContext('2d', { willReadFrequently: true });
  }
  if (!sampler) return null;
  const c = sampler.canvas;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  try {
    sampler.clearRect(0, 0, w, h);
    sampler.drawImage(canvas, 0, 0, w, h);
    const px = sampler.getImageData(0, 0, w, h).data;
    const lin = new Float32Array(w * h);
    for (let i = 0; i < lin.length; i++) {
      const v = Math.max(px[i * 4] ?? 0, px[i * 4 + 1] ?? 0, px[i * 4 + 2] ?? 0) / 255;
      lin[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }
    bright = { key, at: now, w, h, lin };
  } catch {
    // A canvas that cannot be read (tainted): labels then keep their halo only.
    bright = { key, at: now, w, h, lin: new Float32Array(w * h) };
  }
  return bright;
}

// ----- For the intro (src/intro/intro.ts) -----------------------------------------------------

/**
 * The intro's landing: the map jumps to `from` degrees wide and glides to `to` in `ms`, keeping
 * its centre (the same glide as `flyTo`). It is not a user move: the sky still follows the first
 * patch. `ms` 0 jumps straight to `to`.
 */
export function introZoom(from: number, to: number, ms: number): void {
  if (!al) return;
  zoomTo = null;
  if (ms <= 0) {
    glide = null;
    al.setFoV(clampFov(to));
    requestDraw();
    return;
  }
  al.setFoV(clampFov(from));
  glide = {
    from: { ...cam, fov: clampFov(from) },
    to: { ra: cam.ra, dec: cam.dec, fov: clampFov(to) },
    start: performance.now(),
    ms,
  };
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

/** Maps to remove, and since when the oldest has waited (ms). */
const leaving: Shown[] = [];
let leavingSince = 0;

/**
 * Removes a map's layers. Aladin ignores the removal of a layer it has not added yet and adds it
 * later anyway, and when it removes its selected layer it selects the newest one, which may not be
 * added yet ("sky-N does not exists"). So a map is hidden at once and removed once Aladin has
 * added every layer asked for (or after 10 s, if one never loads).
 */
function removeShown(shown: Shown): void {
  shown.hips.setOpacity(0);
  shown.soft?.hips.setOpacity(0);
  if (!leaving.length) leavingSince = performance.now();
  leaving.push(shown);
  removeLeaving();
}

function removeLeaving(): void {
  if (!al || !leaving.length) return;
  const all = [current, incoming, ...leaving].flatMap((x) => (x ? [x.hips, x.soft?.hips] : []));
  if (all.some((h) => h && !h.added) && performance.now() - leavingSince < 10_000) return;
  for (const x of leaving.splice(0)) {
    al.removeImageLayer(x.name);
    if (x.soft) al.removeImageLayer(x.soft.name);
  }
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
    // In once every tile at the depth the view needs has come (from the cache, the shipped seed
    // or NASA). The coarse tiles asked for first, which the worker fills at once from the shipped
    // soft sky, do not count: counting them faded a grey map in over the sharp one (ux-audit #2).
    // There is no time limit: until then the old map stays and the loading card says so.
    const check = () => {
      const c = depthCount(tracks.get(shown.key));
      const waited = performance.now() - started;
      const deepEnough = c.depth >= neededOrder() - 1 || waited > 1500;
      if (c.total > 0 && c.loaded >= c.total && deepEnough && waited > 150) resolve();
      else setTimeout(check, 80);
    };
    check();
  });
}

/**
 * The tiles that say whether a map is in: those at the deepest order asked for (Allsky images only
 * when nothing else was asked). Coarser tiles stand in while the deep ones load, so they never
 * make the map "in" on their own.
 */
function depthCount(t: Track | undefined): { total: number; loaded: number; failed: number; depth: number } {
  if (!t || !t.started.size) return { total: 0, loaded: 0, failed: 0, depth: -1 };
  const tiles = [...t.started].map((id) => {
    const [k, n] = id.split('/').map(Number);
    return { id, k: k ?? 0, n: n ?? 0 };
  });
  const real = tiles.filter((x) => x.n >= 0);
  const use = real.length ? real : tiles;
  const depth = Math.max(...use.map((x) => x.k));
  const at = use.filter((x) => x.k === depth);
  const failed = at.filter((x) => t.failed.has(x.id)).length;
  const loaded = at.filter((x) => t.done.has(x.id) || t.failed.has(x.id)).length;
  return { total: at.length, loaded, failed, depth };
}

/** The HiPS order the view needs: map pixels (512 a tile) about as fine as screen pixels. */
function neededOrder(): number {
  if (!view) return 0;
  const degPerPx = 180 / Math.PI / view.scale;
  const k = Math.ceil(Math.log2(58.63 / (512 * degPerPx)));
  return Math.max(0, Math.min(5, k));
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
/** When the current round of loading started, and the timer that looks again after 10 s. */
let roundStart = 0;
let slowTimer = 0;
/** After this long without the whole sharp map, the card says why (O-I15). */
const SLOW_MS = 10_000;

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
  // While a new channel loads under the old one, the card speaks for the new one (ux-audit #2).
  const shown = incoming ?? current;
  if (!shown) return;
  if (!shown.key.startsWith('spherex/')) {
    firstDone = true;
    roundDone = true;
    roundStart = 0;
    skyReady({ layer: LAYER_NAMES[layer], loaded: 1, total: 1, failed: 0, first: false });
    return;
  }
  const c = depthCount(tracks.get(shown.key));
  const { total, loaded, failed } = c;
  const done = total > 0 && loaded >= total;
  const l = shown.channel !== null ? CHANNEL_LAM[shown.channel] : undefined;
  const load: SkyLoad = {
    layer: l !== undefined ? `${LAYER_NAMES.spherex} ${l.toFixed(2)} µm` : LAYER_NAMES.spherex,
    loaded: total ? loaded : 0,
    total: total || 1,
    failed,
    first: !firstDone,
  };
  if (!done) {
    clearTimeout(doneTimer);
    doneTimer = 0;
    roundDone = false;
    // Every tile not yet in is waiting on NASA's tile server: cached, shipped and Allsky tiles
    // answer at once. After 10 s the card says so, with how many (O-I15).
    const now = performance.now();
    roundStart ||= now;
    const waiting = total - loaded;
    if (now - roundStart >= SLOW_MS && waiting > 0) {
      load.why = `${waiting} ${waiting === 1 ? 'tile is' : 'tiles are'} still waiting on NASA's tile server (IRSA) after ${Math.round((now - roundStart) / 1000)} s.`;
    }
    clearTimeout(slowTimer);
    slowTimer = window.setTimeout(report, Math.max(1000, roundStart + SLOW_MS - now));
    skyReady(load);
    return;
  }
  clearTimeout(slowTimer);
  slowTimer = 0;
  roundStart = 0;
  // Done only once loading has been quiet for a moment: tiles arrive in bursts while the view
  // moves, and the loading card should not flicker between them.
  if (roundDone || doneTimer) return;
  doneTimer = window.setTimeout(() => {
    doneTimer = 0;
    const now = depthCount(tracks.get(shown.key));
    if ((incoming ?? current) !== shown || now.loaded < now.total) return;
    roundDone = true;
    firstDone = true;
    skyReady({ ...load, loaded: now.total, total: now.total, failed: now.failed });
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
      'Zoomed out, the map is the whole sky as a globe seen from outside: only the half facing you shows; drag to turn it. ' +
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
  // Zoomed in past the map's pixels, it is blur: say why, and where the sharp pictures are.
  const coarse =
    fine && channel !== null
      ? ` · <span>The map's pixels are 13″; the frame shows the sharper single pictures</span>`
      : '';
  // The globe's limb glow takes the hue of the detector the map shows (sky.css).
  const det = channel !== null ? detectorOf(channel) : null;
  if (skyEl && skyEl.dataset.det !== String(det ?? '')) skyEl.dataset.det = String(det ?? '');
  if (document.documentElement.dataset.view === 'discover') {
    // Discover names the detector in words (DESIGN-v2 D-11, BEGINNER-AND-MOBILE H1).
    if (channel !== null && det !== null) {
      const l = CHANNEL_LAM[channel] ?? lam;
      fact = `SPHEREx D${det}, ${bandWords(det)}, ${l.toFixed(2)} µm`;
    }
    el.innerHTML = `<b>${H1_DISCOVER}</b> moving things blur here · <span class="sky-note-more" tabindex="0" data-tip="${esc(more)}" data-tip-pos="above">${esc(fact)}</span>${coarse}`;
    return;
  }
  el.innerHTML = `<span>${H1}</span> · <span class="sky-note-more" tabindex="0" data-tip="${esc(more)}" data-tip-pos="above">${esc(fact)}</span>${coarse}`;
}

/**
 * A detector's band in words, as Discover says it (BEGINNER-AND-MOBILE section 8: "near infrared,
 * deep infrared"). D1 to D3 cover 0.75 to 2.42 µm, D4 to D6 2.42 to 5.0 µm.
 */
export function bandWords(det: number): string {
  return det <= 3 ? 'near infrared' : 'deep infrared';
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
  /** How far out (log zoom) the trip goes past its wider end; 0 for a straight glide. */
  arc?: number;
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
    } else if (patchLoading() && !reducedMotion()) drawPatch(); // the creeping dashes
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function animate(now: number): void {
  if (!al) return;
  removeLeaving();
  if (glide) {
    const t = Math.min(1, (now - glide.start) / glide.ms);
    const { from, to } = glide;
    // In the globe's size on screen (its zoom factor), so the speed looks the same at every zoom.
    const z0 = Math.log(zoomOf(from.fov));
    const z1 = Math.log(zoomOf(to.fov));
    if (glide.arc) {
      // Out, turn, in: the zoom rises and falls; the turn happens mostly while zoomed out.
      const e = t * t * (3 - 2 * t);
      const p = Math.max(0, Math.min(1, (t - 0.2) / 0.6));
      const turn = p * p * (3 - 2 * p);
      al.setFoV(clampFov(fovOf(Math.exp(z0 + (z1 - z0) * e + glide.arc * Math.sin(Math.PI * t)))));
      const at = along(from, to, turn);
      al.gotoRaDec(at.ra, at.dec);
    } else {
      const e = 1 - (1 - t) ** 3;
      const dRa = ((to.ra - from.ra + 540) % 360) - 180;
      al.setFoV(fovOf(Math.exp(z0 + (z1 - z0) * e)));
      al.gotoRaDec(wrapRa(from.ra + dRa * e), from.dec + (to.dec - from.dec) * e);
    }
    if (t >= 1) glide = null;
  }
  if (zoomTo) {
    const z = zoomOf(cam.fov);
    const goal = zoomOf(zoomTo.fov);
    const close = Math.abs(Math.log(goal / z)) < 0.004;
    al.setFoV(close ? zoomTo.fov : fovOf(z * (goal / z) ** 0.28));
    keepUnder(zoomTo.ra, zoomTo.dec, zoomTo.x, zoomTo.y);
    if (close) zoomTo = null;
  }
}

/** The point a fraction `f` of the way from `a` to `b` along the great circle. */
function along(
  a: { ra: number; dec: number },
  b: { ra: number; dec: number },
  f: number,
): { ra: number; dec: number } {
  const R = Math.PI / 180;
  const v = (p: { ra: number; dec: number }) => [
    Math.cos(p.dec * R) * Math.cos(p.ra * R),
    Math.cos(p.dec * R) * Math.sin(p.ra * R),
    Math.sin(p.dec * R),
  ];
  const p = v(a);
  const q = v(b);
  const dot = Math.max(-1, Math.min(1, p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!));
  const w = Math.acos(dot);
  if (w < 1e-9) return { ra: wrapRa(b.ra), dec: b.dec };
  const s0 = Math.sin((1 - f) * w) / Math.sin(w);
  const s1 = Math.sin(f * w) / Math.sin(w);
  const x = s0 * p[0]! + s1 * q[0]!;
  const y = s0 * p[1]! + s1 * q[1]!;
  const z = s0 * p[2]! + s1 * q[2]!;
  return { ra: wrapRa(Math.atan2(y, x) / R), dec: Math.asin(Math.max(-1, Math.min(1, z))) / R };
}

/**
 * Turns the globe so the sky position (ra, dec) sits on screen point (x, y). Once the globe is
 * smaller than that point's distance from the centre, the point is pulled in toward the centre
 * (it cannot sit off the globe), so zooming out ends on a centred globe without a jump.
 */
function keepUnder(ra: number, dec: number, x: number, y: number): void {
  if (!al) return;
  readCamera(true);
  if (!view) return;
  const p = project(view, ra, dec);
  if (!p) return;
  let dx = x - view.cx;
  let dy = y - view.cy;
  const reach = view.scale * 0.85;
  const far = Math.hypot(dx, dy);
  if (far > reach) {
    dx *= reach / far;
    dy *= reach / far;
  }
  const c = skyAt(p.x - dx, p.y - dy);
  if (c) al.gotoRaDec(wrapRa(c[0]), c[1]);
}

/** Reads Aladin's camera; true when it changed. Recalibrates the fast projection. */
function readCamera(force = false): boolean {
  if (!al || !skyEl) return false;
  const [ra, dec] = al.getRaDec();
  // Aladin's own `getFov` stops at 180; the zoom factor goes on to the whole globe.
  const fov = fovOf(al.getZoomFactor());
  const width = skyEl.clientWidth;
  const height = skyEl.clientHeight;
  const hb = hostBox;
  // The globe's centre: the middle of the map's box (the whole window in Expert).
  const cx = hb.x + hb.w / 2;
  const cy = hb.y + hb.h / 2;
  if (
    !force &&
    view &&
    ra === cam.ra &&
    dec === cam.dec &&
    fov === cam.fov &&
    width === cam.width &&
    height === cam.height &&
    cx === view.cx &&
    cy === view.cy
  ) {
    // Aladin applies an instant jump (setFoV, gotoRaDec) on its next draw: measure the scale
    // again for a few frames after a change, until it agrees.
    if (settle <= 0) return false;
    settle--;
    const before = view.scale;
    calibrateView(cx, cy);
    return Math.abs(view.scale - before) > 1e-6 * before;
  }
  settle = 3;
  movedAt = performance.now();
  Object.assign(cam, { ra: wrapRa(ra), dec, fov, width, height });
  if (fov > widest() * 1.0001 || fov < FOV_MIN - 1e-4) al.setFoV(clampFov(fov));
  calibrateView(cx, cy);
  return true;
}

/** Frames left in which `readCamera` measures the scale again although nothing changed. */
let settle = 0;
/** When the view last changed (performance.now ms). */
let movedAt = 0;

/** Measures the view's scale from Aladin, at a point off the globe's centre (cx, cy). */
function calibrateView(cx: number, cy: number): void {
  const v = makeView(cam.ra, cam.dec, 1, cx, cy);
  // A point well inside the globe at every zoom (its radius is at least a quarter of the width).
  const dx = Math.min(hostBox.w / 6, 200);
  const w = skyAt(cx + dx, cy + dx / 2);
  const cal = w ? calibrate(v, w[0], w[1], cx + dx, cy + dx / 2) : null;
  view = cal ? makeView(cam.ra, cam.dec, cal.scale, cx, cy, cal.flip) : view;
}

function draw(): void {
  sizeCanvas(marks);
  sizeCanvas(dotsCanvas);
  drawPatch();
  // The view and the patch box, readable by the guide and the smoke test without the sky's code.
  if (skyEl) {
    skyEl.dataset.view = `${cam.ra.toFixed(5)} ${cam.dec.toFixed(5)} ${cam.fov.toFixed(5)}`;
    // Round the whole globe, Aladin paints a fixed grey; it is masked away so space is the
    // page's own blue-black (sky.css), like the darkest sky.
    const r = view ? view.scale : 0;
    const globe = r > 0 && r < Math.hypot(hostBox.w, hostBox.h) / 2;
    if (globe && view) {
      skyEl.style.setProperty('--globe-r', `${r.toFixed(1)}px`);
      skyEl.style.setProperty('--globe-x', `${view.cx.toFixed(1)}px`);
      skyEl.style.setProperty('--globe-y', `${view.cy.toFixed(1)}px`);
    }
    if ((skyEl.dataset.globe === '1') !== globe) skyEl.dataset.globe = globe ? '1' : '';
    const box = outline();
    skyEl.dataset.patch = box
      ? `${Math.round(box.x)} ${Math.round(box.y)} ${Math.round(box.width)}`
      : '';
  }
  placeClickCard();
  showCoords();
  // Zoomed past the map's own sharpness: the note says so (ux-audit #11, #13).
  const px = view ? ((MAP_PIXEL / 3600) * Math.PI * view.scale) / 180 : 0;
  if (px > 4 !== fine) {
    fine = px > 4;
    note();
  }
  for (const fn of zoomFns) fn({ ...cam });
}

/** The pointer's coordinates, shown with the view's width (ux-audit #11). */
let pointerAt = '';
/** One map pixel (13″) spans several screen pixels: the note says the map is that coarse. */
let fine = false;
/** SPHEREx's map pixel: HiPS order 5 with 512-pixel tiles, 58.63° / 16384, in arcseconds. */
const MAP_PIXEL = 12.9;

/** The pointer's coordinates (when over the sky) and how wide the view is, bottom right. */
function showCoords(): void {
  const el = document.getElementById('sky-coords');
  if (!el) return;
  const f = cam.fov;
  const size =
    skyEl?.dataset.globe === '1'
      ? 'Whole sky'
      : f >= 1
        ? `${f.toFixed(f >= 10 ? 0 : 1)}° wide`
        : `${(f * 60).toFixed(f * 60 >= 10 ? 0 : 1)}′ wide`;
  const text = pointerAt ? `${pointerAt} · ${size}` : size;
  if (el.textContent !== text) el.textContent = text;
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
  if (dragging && !dragging.ring) return { ra: dragging.ra, dec: dragging.dec, fov: patch.fov };
  if (dropped) return { ra: dropped.ra, dec: dropped.dec, fov: patch.fov };
  return patch;
}

/** The patch shows the loading style now (FRM-1). */
function patchLoading(): boolean {
  return !!patch && (!!(dragging && !dragging.ring) || !!dropped || patch.source === 'loading');
}

/** FRM-1: line style says what the patch holds. */
function patchStyle(
  source: PatchSource = (dragging && !dragging.ring) || dropped ? 'loading' : (patch?.source ?? 'none'),
): { stroke: string; dash: number[]; cap: CanvasLineCap } {
  switch (source) {
    case 'simulated':
      return { stroke: colours.amber ?? '', dash: [6, 4], cap: 'butt' };
    case 'none':
      return { stroke: colours.ink3 ?? '', dash: [0.1, 5], cap: 'round' };
    case 'loading':
      return { stroke: colours.ink ?? '', dash: [5, 3], cap: 'butt' };
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
  drawRings(ctx);
  const box = outline();
  if (!box || !patch) return;
  const style = patchStyle();
  const f = frameRect();
  // The tether: a dotted line from the patch to the nearest point of the frame (DESIGN.md).
  if (f && !(dragging && !dragging.ring)) tether(ctx, box, f);
  const moving = !!((dragging && !dragging.ring) || dropped);
  const loading = moving || patch.source === 'loading';
  ctx.save();
  ctx.lineCap = style.cap;
  ctx.setLineDash(style.dash);
  // While loading, the dashes creep round the square, so the wait shows at any zoom.
  ctx.lineDashOffset = loading && !reducedMotion() ? -((performance.now() / 60) % 8) : 0;
  // A dark edge under the line keeps it readable on the bright Milky Way.
  ctx.strokeStyle = 'rgba(5, 7, 13, 0.6)';
  ctx.lineWidth = 4;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
  // The patch label: only when nothing else names the patch (DESIGN.md Marks on the sky).
  if (loading || !f) {
    const text = loading ? `${moving ? 'Moving here' : patch.label} · loading` : patch.label;
    tag(ctx, box, text, style.stroke, true);
  }
}

/** The workspace's frames: their squares, numbers and lines to their windows. */
function drawRings(ctx: CanvasRenderingContext2D): void {
  for (const r of rings) {
    const moving = dragging?.ring === r.id;
    const box = boxAt(moving && dragging ? { ra: dragging.ra, dec: dragging.dec, fov: r.fov } : r);
    if (!box) continue;
    const style = patchStyle(moving ? 'loading' : r.source);
    const win = r.el?.checkVisibility() ? r.el.getBoundingClientRect() : null;
    if (win && !moving) tether(ctx, box, win);
    ctx.save();
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 1.5;
    ctx.lineCap = style.cap;
    ctx.setLineDash(style.dash);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.restore();
    tag(ctx, box, r.label, style.stroke);
  }
}

/**
 * A small tag on a square's top left corner (or under it near the top of the window). With
 * `clear`, it moves to another side of the square when a card would cover it.
 */
function tag(
  ctx: CanvasRenderingContext2D,
  box: DOMRect,
  text: string,
  fill: string,
  clear = false,
): void {
  ctx.font = colours.font ?? '';
  const w = ctx.measureText(text).width + 10;
  const at = clear ? tagSpot(box, w) : { x: box.left - 1, y: tagTop(box) };
  ctx.fillStyle = fill;
  roundRect(ctx, at.x, at.y, w, 17, 4);
  ctx.fill();
  ctx.fillStyle = colours.sky ?? '';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, at.x + 5, at.y + 9);
}

let cardCache: { at: number; boxes: DOMRect[] } | null = null;
/** The cards on screen (re-read at most every 300 ms). */
function cardBoxes(): DOMRect[] {
  const now = performance.now();
  if (!cardCache || now - cardCache.at > 300) {
    cardCache = {
      at: now,
      boxes: [...document.querySelectorAll('[data-card]')]
        .filter((el) => el.checkVisibility())
        .map((el) => el.getBoundingClientRect()),
    };
  }
  return cardCache.boxes;
}

/** Where a tag `w` wide goes by a square: above, below, right or left, wherever no card is. */
function tagSpot(box: DOMRect, w: number): { x: number; y: number } {
  const h = 17;
  const tries = [
    { x: box.left - 1, y: box.top - 19 },
    { x: box.left - 1, y: box.bottom + 3 },
    { x: box.right - w + 1, y: box.top - 19 },
    { x: box.right - w + 1, y: box.bottom + 3 },
    { x: box.right + 6, y: box.top + box.height / 2 - h / 2 },
    { x: box.left - 6 - w, y: box.top + box.height / 2 - h / 2 },
  ];
  const cards = cardBoxes();
  const free = tries.find(
    (t) =>
      t.x >= 4 &&
      t.y >= 4 &&
      t.x + w <= cam.width - 4 &&
      t.y + h <= cam.height - 4 &&
      !cards.some((c) => t.x < c.right && t.x + w > c.left && t.y < c.bottom && t.y + h > c.top),
  );
  return free ?? { x: box.left - 1, y: tagTop(box) };
}

/** Where a square's tag starts: above its top left corner, or under it near the window's top. */
function tagTop(box: DOMRect): number {
  return box.top - 20 < 4 ? box.bottom + 3 : box.top - 19;
}

/** A dotted line from a square to the nearest point of a window (DESIGN.md "Tether"). */
function tether(ctx: CanvasRenderingContext2D, box: DOMRect, f: DOMRect): void {
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

/**
 * The workspace ring under a screen point (at least 28 px to grab), if any. With `tagOnly`, only
 * its number tag counts: the handle that still works when the ring sits on the main patch.
 */
function ringAt(x: number, y: number, tagOnly = false): { r: Ring; box: DOMRect } | null {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]!;
    const box = boxAt(r);
    if (!box) continue;
    if (inBox(new DOMRect(box.left - 1, tagTop(box) - 4, 28, 25), x, y)) return { r, box };
    if (tagOnly) continue;
    const grow = Math.max(0, (28 - box.width) / 2);
    const big = new DOMRect(box.x - grow, box.y - grow, box.width + 2 * grow, box.height + 2 * grow);
    if (inBox(big, x, y)) return { r, box };
  }
  return null;
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
  /** Where the patch or a ring was picked up, and whether it has moved since (> 4 px). */
  let grab: { x: number; y: number; moved: boolean } | null = null;
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };

  el.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      glide = null;
      // A ring's number tag first: it is drawn over the main patch.
      const tagged = flags.grab ? ringAt(e.clientX, e.clientY, true) : null;
      if (!tagged && flags.grab && patch && inBox(grabBox(), e.clientX, e.clientY)) {
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
        grab = { x: e.clientX, y: e.clientY, moved: false };
        el.setPointerCapture(e.pointerId);
        setCursor('grabbing');
        requestDraw();
        return;
      }
      const ring = tagged ?? (flags.grab ? ringAt(e.clientX, e.clientY) : null);
      if (ring) {
        stop(e);
        dragging = { ra: ring.r.ra, dec: ring.r.dec, dx: e.clientX - (ring.box.x + ring.box.width / 2), dy: e.clientY - (ring.box.y + ring.box.height / 2), ring: ring.r.id };
        grab = { x: e.clientX, y: e.clientY, moved: false };
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
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0 && (dragging || down)) {
        // The release never reached the page (the window lost the pointer mid-drag, e.g. to the
        // window manager or a screen recorder). End the drag here, so neither the patch nor the
        // sky follows a pointer with no button held. Aladin ends its own pan on a document mouseup.
        if (down) document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        down = null;
        if (dragging) {
          end(e);
          return;
        }
      }
      if (dragging) {
        stop(e);
        if (grab && Math.hypot(e.clientX - grab.x, e.clientY - grab.y) > 4) grab.moved = true;
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
        const overPatch =
          flags.grab && (inBox(grabBox(), e.clientX, e.clientY) || !!ringAt(e.clientX, e.clientY));
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
          pointerAt = world ? formatCoords(world.ra, world.dec) : '';
          showCoords();
          for (const fn of pointerFns) fn(world ? { ...world, x: last.x, y: last.y } : null);
        });
      }
    },
    true,
  );

  const end = (e: PointerEvent) => {
    const moved = !!grab?.moved;
    grab = null;
    if (dragging && !moved) {
      // A press without a drag moves nothing: the frame keeps its spot and its pictures.
      stop(e);
      dragging = null;
      setCursor('grab');
      requestDraw();
      return;
    }
    if (dragging?.ring) {
      stop(e);
      const id = dragging.ring;
      const at = { ra: wrapRa(dragging.ra), dec: Math.max(-90, Math.min(90, dragging.dec)) };
      dragging = null;
      setCursor('grab');
      rings = rings.map((r) => (r.id === id ? { ...r, ...at, source: 'loading' } : r));
      for (const fn of ringDropFns) fn(id, at.ra, at.dec);
      requestDraw();
      return;
    }
    if (dragging) {
      stop(e);
      const at = { ra: wrapRa(dragging.ra), dec: Math.max(-90, Math.min(90, dragging.dec)) };
      dragging = null;
      setCursor('grab');
      const drop = (dropped = { ...at, until: Date.now() + 4000 });
      window.setTimeout(() => {
        if (dropped !== drop) return;
        dropped = null;
        requestDraw();
      }, 4000);
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
      zoomAround(e.clientX, e.clientY, fovOf(zoomOf(cam.fov) / 2));
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
      const base = zoomOf(zoomTo?.fov ?? cam.fov);
      zoomAround(e.clientX, e.clientY, fovOf(base * Math.exp(delta * 0.0022)));
    },
    { capture: true, passive: false },
  );

  el.addEventListener('pointerleave', () => {
    last = null;
    pointerAt = '';
    showCoords();
    dotHooks?.hover(null);
    for (const fn of pointerFns) fn(null);
  });
  // Aladin's own menus and keys are not used.
  el.addEventListener('contextmenu', (e) => e.stopPropagation(), true);
}

/**
 * Zooms so the sky under (x, y) stays under it (SKY-3). Off the globe (in the dark space round
 * it), the zoom keeps the globe's centre where it is.
 */
function zoomAround(x: number, y: number, fov: number): void {
  flags.moved = true;
  glide = null;
  const target = clampFov(fov);
  let at = { x, y };
  let anchor = zoomTo && Math.hypot(zoomTo.x - x, zoomTo.y - y) < 2 ? zoomTo : toWorld(x, y);
  if (!anchor) {
    at = { x: view?.cx ?? cam.width / 2, y: view?.cy ?? cam.height / 2 };
    anchor = { ra: cam.ra, dec: cam.dec };
  }
  zoomTo = { fov: target, ...at, ra: anchor.ra, dec: anchor.dec };
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
  const c = view && skyAt(view.cx + shift, view.cy);
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
  // Beside the spot first; then against the edges of every other card (above the bar, left of
  // the frame), so a free place is found whenever the window has one (O-I9).
  const xs = [
    p.x - w / 2,
    p.x + 16,
    p.x - w - 16,
    ...others.flatMap((r) => [r.left - w - 8, r.right + 8]),
  ];
  const ys = [
    p.y - h - 14,
    p.y + 14,
    p.y - h / 2,
    ...others.flatMap((r) => [r.top - h - 8, r.bottom + 8]),
  ];
  let best = { x: 0, y: 0 };
  let bestCost = Infinity;
  for (const sy of ys)
    for (const sx of xs) {
      const x = Math.max(8, Math.min(cam.width - w - 8, sx));
      const y = Math.max(8, Math.min(cam.height - h - 8, sy));
      // How far the card sits from the spot; covering the spot itself is poor.
      const dx = Math.max(x - p.x, 0, p.x - x - w);
      const dy = Math.max(y - p.y, 0, p.y - y - h);
      let cost = Math.hypot(dx, dy) + (dx === 0 && dy === 0 ? 400 : 0);
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
  return Math.max(FOV_MIN, Math.min(widest(), fov));
}

/**
 * The widest view in the map's box. Discover's globe may be smaller (60% of the box's shorter
 * side), as its home view asks (`min(800px, 100vh − 160px)`, DESIGN-v2 8.4).
 */
function widest(): number {
  const fill = document.documentElement.dataset.view === 'discover' ? 0.6 : 0.88;
  return widestFov(hostBox.w || innerWidth, hostBox.h || innerHeight, fill);
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
