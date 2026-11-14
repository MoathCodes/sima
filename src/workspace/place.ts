/**
 * Where the extra frames sit (SPEC-v1 F4): pinned frames follow their spot as the sky pans, docked
 * ones stay put on the screen. Each is dragged by its title bar and sized from its bottom right
 * corner (at least 220 × 220). Owner: integrator (workspace).
 *
 * The card rules hold for them too (DESIGN.md, the smoke test): a frame stays inside the window
 * and above the bar, and once the sky rests it moves to the nearest place where it covers no other
 * card. While the sky moves, pinned frames simply follow their spots.
 *
 * It also tells the sky where each frame looks (`setRings`), so their squares and lines follow.
 */
import { camera, onRingDrop, onZoom, setRings, toScreen } from '../sky/sky.ts';
import { onFrameMove } from '../shell/layout.ts';
import { MIN_H, MIN_W, type FrameMode, type FrameState } from './schema.ts';
import { frameById, frames, numberOf, onChange, setAnchor, setBox, type Live } from './frames.ts';

const EDGE = 8;
/** Frames stay this far above the bar, as the main frame does. */
const ABOVE_BAR = 14;
/** Where each frame was last put, CSS pixels from the window's top left. */
const at = new WeakMap<Live, { x: number; y: number }>();
let dragging: Live | null = null;
let restTimer = 0;

/** Starts placing. Called once by index.ts. */
export function startPlace(): void {
  let last = '';
  onZoom((c) => {
    // The sky also draws for other reasons (the rings themselves): follow only real moves.
    const key = `${c.ra}|${c.dec}|${c.fov}|${c.width}|${c.height}`;
    if (key === last) return;
    last = key;
    place(false);
    clearTimeout(restTimer);
    restTimer = window.setTimeout(() => place(true), 180);
  });
  onChange((what) => {
    if (what === 'frames') {
      place(true);
      rings();
    }
  });
  onRingDrop((id, ra, dec) => {
    const f = frameById(id);
    if (f) setAnchor(f, ra, dec);
  });
  addEventListener('resize', () => place(true));
  onFrameMove(() => soon());
  // Cards opening and closing (Measure, the tools, a places list) may need the room.
  new MutationObserver(() => soon()).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden'],
  });
}

let soonTimer = 0;
function soon(): void {
  clearTimeout(soonTimer);
  soonTimer = window.setTimeout(() => place(true), 120);
}

/** Tells the sky every frame's spot (its square, number and line). */
export function rings(): void {
  setRings(
    frames().map((f) => ({
      id: f.s.id,
      ra: f.s.anchor.ra,
      dec: f.s.anchor.dec,
      fov: f.s.fov,
      source: f.status.source,
      label: numberOf(f),
      el: f.el,
    })),
  );
}

/** The room frames may use: inside the window, above the bar. */
function room(): { left: number; top: number; right: number; bottom: number } {
  const bar = document.getElementById('bar');
  const barTop = bar?.checkVisibility() ? bar.getBoundingClientRect().top : innerHeight;
  return { left: EDGE, top: EDGE, right: innerWidth - EDGE, bottom: barTop - ABOVE_BAR };
}

/** Where the frame wants to be, from its box: docked on screen, pinned beside its spot. */
function wanted(f: Live): { x: number; y: number } {
  const b = f.s.box;
  if (f.s.mode === 'docked') return { x: b.x, y: b.y };
  const p = toScreen(f.s.anchor.ra, f.s.anchor.dec);
  if (!p) return at.get(f) ?? { x: b.x, y: b.y };
  return { x: p.x + b.x, y: p.y + b.y };
}

/**
 * Puts every frame in its place. With `resolve`, a frame that would cover another card moves to
 * the nearest free place (the first frames first; a later frame keeps clear of earlier ones).
 * When the screen is too crowded for that, every extra frame is shown smaller, in steps down to
 * 220 × 220, until they fit; their saved sizes stay.
 */
export function place(resolve: boolean): void {
  const r = room();
  const list = frames().filter((f) => f.el && f !== dragging);
  // The last try packs the frames from the top left, wherever their spots are.
  const tries = resolve ? [1, 0.9, 0.8, 0.7, 0.6, 0.5, -0.5] : [1];
  for (const t of tries) {
    const k = Math.abs(t);
    const pack = t < 0;
    let crowded = false;
    for (const f of list) {
      const el = f.el!;
      const w = Math.max(MIN_W, Math.min(Math.round(f.s.box.w * k), r.right - r.left));
      const h = Math.max(MIN_H, Math.min(Math.round(f.s.box.h * k), r.bottom - r.top));
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      let { x, y } = pack ? { x: r.left, y: r.top } : wanted(f);
      x = clamp(x, r.left, r.right - w);
      y = clamp(y, r.top, r.bottom - h);
      if (resolve) {
        const spot = free(el, x, y, w, h, r);
        crowded ||= !spot.ok;
        x = spot.x;
        y = spot.y;
      }
      at.set(f, { x, y });
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
    }
    if (!crowded) break;
  }
  rings();
}

/**
 * The nearest place to (x, y) where a w × h box covers no other visible card (`ok`), or the place
 * that covers least.
 */
function free(
  self: HTMLElement,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: ReturnType<typeof room>,
): { x: number; y: number; ok: boolean } {
  const others = [...document.querySelectorAll<HTMLElement>('[data-card]')]
    .filter((el) => el !== self && el.checkVisibility() && !(el.classList.contains('wf') && later(self, el)))
    .map((el) => el.getBoundingClientRect())
    .filter((b) => b.width > 0 && b.height > 0);
  const hits = (x: number, y: number) =>
    others.reduce((sum, b) => {
      const ox = Math.min(x + w, b.right) - Math.max(x, b.left);
      const oy = Math.min(y + h, b.bottom) - Math.max(y, b.top);
      return ox > -4 && oy > -4 ? sum + 1 + Math.max(0, ox) * Math.max(0, oy) : sum;
    }, 0);
  if (!hits(x0, y0)) return { x: x0, y: y0, ok: true };
  // Beside every other card, and a coarse grid over the room: the nearest free one wins.
  const STEP = 32;
  const grid = (lo: number, hi: number) =>
    Array.from({ length: Math.max(0, Math.floor((hi - lo) / STEP)) + 1 }, (_, i) => lo + i * STEP);
  const xs = [x0, ...others.flatMap((b) => [b.left - w - 8, b.right + 8]), ...grid(r.left, r.right - w), r.right - w];
  const ys = [y0, ...others.flatMap((b) => [b.top - h - 8, b.bottom + 8]), ...grid(r.top, r.bottom - h), r.bottom - h];
  let best = { x: x0, y: y0, cost: Infinity };
  for (const sy of ys)
    for (const sx of xs) {
      const x = clamp(sx, r.left, r.right - w);
      const y = clamp(sy, r.top, r.bottom - h);
      const cost = Math.hypot(x - x0, y - y0) + 100000 * hits(x, y);
      if (cost < best.cost) best = { x, y, cost };
    }
  return { x: best.x, y: best.y, ok: best.cost < 100000 };
}

/** True when `el` is a frame that comes after `self` (it is placed later and keeps clear). */
function later(self: HTMLElement, el: HTMLElement): boolean {
  const ids = frames().map((f) => f.el);
  return ids.indexOf(el) > ids.indexOf(self);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Math.max(lo, hi), v));
}

/**
 * The box that keeps a frame where it is on screen in a mode: docked holds its screen place,
 * pinned holds its offset from its spot.
 */
export function placedBox(f: Live, mode: FrameMode): FrameState['box'] {
  const p = at.get(f) ?? { x: f.s.box.x, y: f.s.box.y };
  const box = { ...f.s.box };
  if (mode === 'docked') return { ...box, x: Math.round(p.x), y: Math.round(p.y) };
  const s = toScreen(f.s.anchor.ra, f.s.anchor.dec) ?? { x: camera().width / 2, y: camera().height / 2 };
  return { ...box, x: Math.round(p.x - s.x), y: Math.round(p.y - s.y) };
}

/** Drag by the title bar, size by the corner. Called by index.ts for each new card. */
export function wireCard(f: Live): void {
  const el = f.el;
  if (!el) return;
  const head = el.querySelector<HTMLElement>('.wf-head');
  const grip = el.querySelector<HTMLElement>('[data-wf-grip]');
  head?.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest('button, a'))) return;
    const start = at.get(f) ?? { x: el.offsetLeft, y: el.offsetTop };
    drag(e, el, (dx, dy) => {
      const r = room();
      const x = clamp(start.x + dx, r.left, r.right - el.offsetWidth);
      const y = clamp(start.y + dy, r.top, r.bottom - el.offsetHeight);
      at.set(f, { x, y });
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      rings();
    }, () => setBox(f, placedBox(f, f.s.mode)), f);
  });
  grip?.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const w0 = el.offsetWidth;
    const h0 = el.offsetHeight;
    drag(e, el, (dx, dy) => {
      const r = room();
      const p = at.get(f) ?? { x: el.offsetLeft, y: el.offsetTop };
      const w = clamp(w0 + dx, MIN_W, r.right - p.x);
      const h = clamp(h0 + dy, MIN_H, r.bottom - p.y);
      el.style.width = `${Math.round(w)}px`;
      el.style.height = `${Math.round(h)}px`;
      rings();
    }, () => setBox(f, { ...placedBox(f, f.s.mode), w: el.offsetWidth, h: el.offsetHeight }), f);
  });
}

function drag(e: PointerEvent, el: HTMLElement, move: (dx: number, dy: number) => void, end: () => void, f: Live): void {
  e.preventDefault();
  const x0 = e.clientX;
  const y0 = e.clientY;
  const target = e.currentTarget as HTMLElement;
  try {
    target.setPointerCapture(e.pointerId);
  } catch {
    // A synthetic pointer cannot be captured; the drag works while it stays over the element.
  }
  dragging = f;
  el.dataset.moving = '';
  const onMove = (ev: PointerEvent) => move(ev.clientX - x0, ev.clientY - y0);
  const onUp = () => {
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
    target.removeEventListener('pointercancel', onUp);
    dragging = null;
    delete el.dataset.moving;
    end();
    place(true);
  };
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onUp);
}
