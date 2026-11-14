/**
 * The sky map: NASA SPHEREx's all-sky picture (Aladin Lite), the patch square on it, the dotted
 * tether to the frame, the click card, the sky note and the pointer's coordinates. Owner: lane C.
 *
 * The sky half (SPEC 8.3): this module learns about the frame only from the bus (`patch`,
 * `shown`) and from shell.ts `frameRect()`. It never imports src/viewer.
 *
 * PHASE 0 STUB: no Aladin and no network. A drawn placeholder star field, clearly named in the
 * sky note, with a flat projection, drag to pan and the wheel to zoom. The camera, the
 * conversions and the callbacks behave like the real ones, so other lanes can build on them.
 */
import { emit, on, type BusEvents } from '../shell/bus.ts';
import { frameRect, skyReady } from '../shell/shell.ts';
import { icon } from '../shell/icons.ts';
import { formatCoords } from '../core/astro.ts';

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

const cam: Camera = { ra: 269.45, dec: 4.7, fov: 1.9, width: 0, height: 0 };
let layer: SkyLayer = 'spherex';
const flags = { grid: false, grab: true };
let lam: number | null = 2.0;
let patch: Readonly<BusEvents['patch']> | null = null;

const clickFns = new Set<(p: SkyPoint) => void>();
const pointerFns = new Set<(p: SkyPoint | null) => void>();
const zoomFns = new Set<(c: Readonly<Camera>) => void>();

let canvas: HTMLCanvasElement | null = null;
let marks: SVGSVGElement | null = null;
let queued = false;

// A fixed placeholder star field: [ra, dec, brightness 0..1]. Made-up dots, evenly over the
// whole sky, plus a denser field around the starting view so the first screen is not empty.
const STARS: [number, number, number][] = (() => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out: [number, number, number][] = [];
  for (let i = 0; i < 30000; i++) {
    out.push([rand() * 360, (Math.asin(2 * rand() - 1) * 180) / Math.PI, rand() ** 8]);
  }
  for (let i = 0; i < 2600; i++) {
    out.push([cam.ra + (rand() - 0.5) * 16, cam.dec + (rand() - 0.5) * 16, rand() ** 6]);
  }
  return out;
})();

/** Degrees between two right ascensions, −180 to 180. */
function dRa(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/**
 * Starts the sky in its mount point and reports loading to the shell (`skyReady`).
 * PHASE 0 STUB: draws the placeholder star field at once.
 *
 * @param el The `#sky` element.
 */
export function startSky(el: HTMLElement): void {
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:grab';
  el.replaceChildren(canvas);

  const marksEl = document.getElementById('sky-marks');
  if (marksEl) {
    marks = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    marks.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible';
    marksEl.append(marks);
  }

  resize();
  addEventListener('resize', resize);
  watchPointer(canvas);
  on(
    'patch',
    (p) => {
      patch = p;
      redraw();
    },
    { replay: true },
  );
  on(
    'shown',
    (s) => {
      lam = s.lam;
      note();
    },
    { replay: true },
  );
  // The tether follows the frame when it moves or resizes.
  const frame = document.getElementById('frame');
  if (frame) new ResizeObserver(redraw).observe(frame);
  note();
  skyReady({ layer: layerName(), loaded: 1, total: 1, failed: 0, first: false });
}

/**
 * Shows another sky map (SKY-4). The sky note says which.
 * PHASE 0 STUB: only the note changes.
 */
export function setLayer(next: SkyLayer): void {
  layer = next;
  note();
  redraw();
}

/**
 * Moves the sky. Missing fields keep their value. This is a user-chosen move: callers are
 * search, place cards, the rail and the keys, never a timer or arriving data (FRM-4).
 *
 * @param to Centre in degrees, `fov` in degrees across the window (clamped to 0.05 to 180).
 * @param opts `animate` (default true): glide there; false jumps.
 */
export function flyTo(
  to: { ra?: number; dec?: number; fov?: number },
  opts: { animate?: boolean } = {},
): void {
  if (to.ra !== undefined) cam.ra = ((to.ra % 360) + 360) % 360;
  if (to.dec !== undefined) cam.dec = Math.max(-90, Math.min(90, to.dec));
  if (to.fov !== undefined) cam.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, to.fov));
  redraw();
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
  const k = cam.width / cam.fov; // pixels per degree
  const x = cam.width / 2 - dRa(ra, cam.ra) * Math.cos((cam.dec * Math.PI) / 180) * k;
  const y = cam.height / 2 - (dec - cam.dec) * k;
  const m = 200;
  return x < -m || y < -m || x > cam.width + m || y > cam.height + m ? null : { x, y };
}

/**
 * The sky position under a screen point.
 * @param x CSS pixels from the window's left.
 * @param y CSS pixels from the window's top.
 * @returns Degrees, or null off the sky.
 */
export function toWorld(x: number, y: number): { ra: number; dec: number } | null {
  const k = cam.width / cam.fov;
  const dec = cam.dec - (y - cam.height / 2) / k;
  if (Math.abs(dec) > 90) return null;
  const ra = cam.ra - (x - cam.width / 2) / k / Math.cos((cam.dec * Math.PI) / 180);
  return { ra: ((ra % 360) + 360) % 360, dec };
}

/** The patch square's box on screen; null when there is no patch or it is out of view. */
export function outline(): DOMRect | null {
  if (!patch) return null;
  const c = toScreen(patch.ra, patch.dec);
  if (!c) return null;
  const side = Math.max(6, (patch.fov / 60) * (cam.width / cam.fov));
  return new DOMRect(c.x - side / 2, c.y - side / 2, side, side);
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
 * PHASE 0 STUB: stored only; the placeholder patch cannot be dragged.
 */
export function grabbable(on: boolean): void {
  flags.grab = on;
}

/**
 * The coordinate grid (SKY-5).
 * @param show True or false to set it; leave out to only read it.
 * @returns Whether it is on.
 */
export function grid(show?: boolean): boolean {
  if (show !== undefined) flags.grid = show;
  return flags.grid;
}

/**
 * Asks again for the sky tiles that failed (SKY-7). The loading card's Retry calls it.
 * PHASE 0 STUB: nothing fails.
 */
export function retry(): void {
  skyReady({ layer: layerName(), loaded: 1, total: 1, failed: 0, first: false });
}

// ----- Phase 0 drawing ------------------------------------------------------------------------

function layerName(): string {
  return { spherex: 'SPHEREx', 'wise-w1': 'AllWISE 3.4 µm', 'wise-w2': 'AllWISE 4.6 µm' }[layer];
}

function note(): void {
  const el = document.getElementById('sky-note');
  if (!el) return;
  const channel = layer === 'spherex' && lam !== null ? ` · ${lam.toFixed(2)} µm` : '';
  el.textContent = `Placeholder sky (phase 0): drawn dots, not ${layerName()} data${channel}`;
}

function resize(): void {
  cam.width = innerWidth;
  cam.height = innerHeight;
  if (canvas) {
    canvas.width = Math.round(innerWidth * devicePixelRatio);
    canvas.height = Math.round(innerHeight * devicePixelRatio);
  }
  redraw();
}

function redraw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    paintStars();
    paintPatch();
    for (const fn of zoomFns) fn({ ...cam });
  });
}

function paintStars(): void {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--sky') || '#05070d';
  ctx.fillRect(0, 0, cam.width, cam.height);
  const scale = Math.min(3, Math.max(0.6, 1.9 / cam.fov) ** 0.3);
  for (const [ra, dec, b] of STARS) {
    const p = toScreen(ra, dec);
    if (!p) continue;
    ctx.globalAlpha = 0.25 + 0.75 * b;
    ctx.fillStyle = '#dfe6ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, (0.6 + 2.4 * b) * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const PATCH_LINE: Record<BusEvents['patch']['source'], { stroke: string; dash: string }> = {
  real: { stroke: 'var(--mark)', dash: '' },
  live: { stroke: 'var(--mark)', dash: '' },
  simulated: { stroke: 'var(--st-accent-2)', dash: '6 4' },
  none: { stroke: 'var(--st-ink-3)', dash: '1.5 4' },
  loading: { stroke: 'var(--st-ink-2)', dash: '6 4' },
};

function paintPatch(): void {
  if (!marks) return;
  const box = outline();
  if (!box || !patch) {
    marks.replaceChildren();
    return;
  }
  const line = PATCH_LINE[patch.source];
  const f = frameRect();
  const cy = box.y + box.height / 2;
  const tether =
    f && f.left > box.right
      ? `<path d="M${box.right} ${cy}H${f.left}" stroke="var(--mark)" stroke-width="1.5" stroke-dasharray="2 5" fill="none"/>`
      : '';
  const label = patch.source === 'loading' ? 'loading' : patch.label;
  marks.innerHTML = `${tether}
    <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none"
      stroke="${line.stroke}" stroke-width="2" stroke-dasharray="${line.dash}"/>
    <text x="${box.x}" y="${box.bottom + 14}" fill="${line.stroke}"
      style="font: var(--text-label)">${esc(label)}</text>`;
}

function watchPointer(el: HTMLCanvasElement): void {
  let drag: { x: number; y: number; ra: number; dec: number; moved: boolean } | null = null;
  el.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, ra: cam.ra, dec: cam.dec, moved: false };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
  });
  el.addEventListener('pointermove', (e) => {
    const world = toWorld(e.clientX, e.clientY);
    const coords = document.getElementById('sky-coords');
    if (coords) coords.textContent = world ? formatCoords(world.ra, world.dec) : '';
    for (const fn of pointerFns) fn(world ? { ...world, x: e.clientX, y: e.clientY } : null);
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    const k = cam.width / cam.fov;
    cam.ra = (((drag.ra + dx / k / Math.cos((cam.dec * Math.PI) / 180)) % 360) + 360) % 360;
    cam.dec = Math.max(-90, Math.min(90, drag.dec + dy / k));
    redraw();
  });
  el.addEventListener('pointerup', (e) => {
    el.style.cursor = 'grab';
    const wasClick = drag && !drag.moved;
    drag = null;
    if (!wasClick) return;
    const world = toWorld(e.clientX, e.clientY);
    if (!world) return;
    const p = { ...world, x: e.clientX, y: e.clientY };
    showClickCard(p);
    for (const fn of clickFns) fn(p);
  });
  el.addEventListener('pointerleave', () => {
    for (const fn of pointerFns) fn(null);
  });
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      flyTo({ fov: cam.fov * Math.exp(e.deltaY * 0.0015) }, { animate: false });
    },
    { passive: false },
  );
}

/** FRM-3: a click asks before anything moves. */
function showClickCard(p: SkyPoint): void {
  const card = document.getElementById('sky-click');
  if (!card) return;
  card.style.cssText = `left:${Math.min(p.x + 12, cam.width - 260)}px;top:${Math.min(p.y + 12, cam.height - 140)}px;padding:var(--pad-group);display:grid;gap:4px`;
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:2px 2px 2px 8px">
      <span style="font:var(--text-label);color:var(--ink-2)">${formatCoords(p.ra, p.dec)}</span>
      <button class="icon-btn sm" data-close aria-label="Close">${icon('close')}</button>
    </div>
    <button class="btn primary" data-move data-guide="move-frame-here">Move the frame here</button>`;
  card.hidden = false;
  card.querySelector('[data-close]')?.addEventListener('click', () => (card.hidden = true));
  card.querySelector('[data-move]')?.addEventListener('click', () => {
    card.hidden = true;
    emit('aim', { ra: p.ra, dec: p.dec });
  });
}

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
