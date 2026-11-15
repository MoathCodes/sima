/**
 * Dots and labels for places on the sky (PLC-2, PLC-3, PLC-8). Owner: lane C. Lane G gives the
 * dots (`setDots`); lane C decides which show at each zoom and where their labels go
 * (layout.ts), and draws them on one canvas under the patch.
 *
 * Labels never cover a card: every visible `[data-card]` is kept clear, and so is anything given
 * to `keepClear` (rule 5 in SPEC 9.4), and the patch square.
 */
import {
  camera,
  currentView,
  dotLayer,
  onZoom,
  outline,
  registerDots,
  skyBrightness,
  toScreen,
  type SkyPoint,
} from './sky.ts';
import { layout, LABEL_HEIGHT, type Box, type LayoutInput, type Placed } from './layout.ts';
import type { PlaceKind } from '../data/schema.ts';

/** One place on the sky. */
export interface Dot {
  /** Stable id, the same as the place's id in places.json. */
  id: string;
  /** Degrees. */
  ra: number;
  dec: number;
  /** The label. */
  name: string;
  /** Importance: 0 shows at the widest view, 4 only when zoomed far in. */
  tier: 0 | 1 | 2 | 3 | 4;
  /** The place's kind, as places.json names it (src/data/schema.ts). */
  kind: PlaceKind;
  /** A practice spot: drawn dashed amber with "Simulated" in its label (H3). */
  simulated?: boolean;
}

/** A saved place on the sky: a pale ring with its name (DESIGN.md "Pins"). */
export interface Pin {
  /** Stable id, lane G's own. */
  id: string;
  name: string;
  /** Degrees. */
  ra: number;
  dec: number;
}

/**
 * A catalogue source a filter found (O-V5): drawn as a small reticle, a circle for Gaia and a
 * square for CatWISE (DESIGN.md: catalogue marks told apart by shape), never as a place.
 */
export interface Find {
  /** Stable id: the catalogue's name. */
  id: string;
  /** Degrees. */
  ra: number;
  dec: number;
  /** Shown as a label only while chosen or hovered. */
  name: string;
  cat: 'gaia' | 'catwise';
}

/** The circle a filter searched, drawn dotted so the user sees what was and was not searched. */
export interface FindArea {
  ra: number;
  dec: number;
  /** Degrees. */
  radius: number;
}

let dots: Dot[] = [];
let pins: Pin[] = [];
let finds: Find[] = [];
let findArea: FindArea | null = null;
let findHot: string | null = null;
const findClickFns = new Set<(find: Find, p: SkyPoint) => void>();
let pinInputs: LayoutInput[] = [];
let pinPlaced: Placed[] = [];
const pinClickFns = new Set<(pin: Pin, p: SkyPoint) => void>();
let inputs: LayoutInput[] = [];
let groups: ReadonlySet<PlaceKind> | null = null;
let hover: string | null = null;
let skyHover: string | null = null;
let chosen: string | null = null;
let placed: Placed[] = [];
const clear = new Set<Element>();
const restFns = new Set<() => void>();
const clickFns = new Set<(dot: Dot, p: SkyPoint) => void>();
let restTimer = 0;
let queued = false;
let font = '500 12px Archivo, "Helvetica Neue", Arial, sans-serif';
let measureCtx: CanvasRenderingContext2D | null = null;
let avoidCache: { at: number; boxes: Box[] } | null = null;
/** How long the last few paints took, ms (PLC-8: under 4 ms a frame). */
const paintTimes: number[] = [];

/** Spots drawn by globe.ts (beacons, objects to try): their place dots are not drawn twice. */
let taken: readonly { ra: number; dec: number; name?: string }[] = [];
/** Linear brightness of the map above which a label sits on a Thin chip (DESIGN-v2 9). */
const BRIGHT = 0.4;

/** The view at the last move, so a redraw of only the patch is not taken for a move. */
let lastView = '';
/** When the view last moved (ms): labels are only added once it has stopped (layout.ts). */
let lastMove = 0;
/** The side each label took in the last paint, so it keeps it (layout.ts `prev`). */
let sides = new Map<LayoutInput, number>();
const REST_MS = 200;

onZoom((c) => {
  // The sky also redraws when only the patch changes (each picture during playback): the view
  // has not moved, so "In this view" lists are not rebuilt (their buttons would keep changing
  // under the pointer).
  const view = `${c.ra} ${c.dec} ${c.fov} ${c.width} ${c.height}`;
  const moved = view !== lastView;
  if (moved) lastMove = performance.now();
  paint();
  if (!moved) return;
  lastView = view;
  clearTimeout(restTimer);
  restTimer = window.setTimeout(() => {
    paint(); // the view has stopped: labels may be added now
    restFns.forEach((fn) => fn());
  }, REST_MS);
});

registerDots({
  pick: (x, y) => {
    const find = pickFind(x, y);
    if (find) return { id: `find:${find.id}` };
    const pin = pickPin(x, y);
    return pin ? { id: `pin:${pin.id}` } : pick(x, y);
  },
  hover: (id) => {
    if (id === skyHover) return;
    skyHover = id;
    soon();
  },
  click: (id, p) => {
    if (id.startsWith('find:')) {
      const find = finds.find((x) => `find:${x.id}` === id);
      if (find) for (const fn of findClickFns) fn(find, p);
      return;
    }
    if (id.startsWith('pin:')) {
      const pin = pins.find((x) => `pin:${x.id}` === id);
      if (pin) for (const fn of pinClickFns) fn(pin, p);
      return;
    }
    const dot = dots.find((d) => d.id === id);
    if (dot) for (const fn of clickFns) fn(dot, p);
  },
});

// Cards that appear, move or resize change where labels may go.
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => {
    avoidCache = null;
    soon();
  }).observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class', 'open'],
  });
  addEventListener('resize', () => {
    avoidCache = null;
    soon();
  });
}

/**
 * The places to show. Replaces the previous set.
 * @param next Dots, any order. Lane C sorts by tier.
 */
export function setDots(next: readonly Dot[]): void {
  dots = [...next].sort((a, b) => a.tier - b.tier);
  // Label widths are measured when a label is first placed: measuring all 2,289 at once blocks
  // the page for over 100 ms (TLS-8), and most never show.
  inputs = dots.map((d) => {
    let width = 0;
    return {
      ra: d.ra,
      dec: d.dec,
      tier: d.tier,
      always: false,
      get width() {
        return (width ||= textWidth(label(d)));
      },
    };
  });
  refreshAlways();
  soon();
}

/**
 * Saved places, drawn as pins at every zoom. Their labels go first and obey the same rules as
 * the dots' labels: never over each other, a card or the window's edge. Replaces the previous set.
 * @param next Pins, any order; an empty list removes them.
 */
export function setPins(next: readonly Pin[]): void {
  pins = next.map((x) => ({ ...x }));
  pinInputs = pins.map((x) => ({
    ra: x.ra,
    dec: x.dec,
    tier: 0,
    always: true,
    width: textWidth(x.name),
    gap: 11,
  }));
  soon();
}

/**
 * Calls `fn` when the user clicks a pin on the sky.
 * @returns Unsubscribe.
 */
export function onPinClick(fn: (pin: Pin, p: SkyPoint) => void): () => void {
  pinClickFns.add(fn);
  return () => pinClickFns.delete(fn);
}

/**
 * The sources a catalogue filter found, and the circle it searched (O-V5). Replaces the previous
 * set; an empty list and a null area remove them.
 */
export function setFinds(next: readonly Find[], area: FindArea | null): void {
  finds = next.map((x) => ({ ...x }));
  findArea = area ? { ...area } : null;
  soon();
}

/** Rings one found source (its row is hovered or chosen in the list); null for none. */
export function setFindHover(id: string | null): void {
  findHot = id;
  soon();
}

/**
 * Calls `fn` when the user clicks a found source on the sky.
 * @returns Unsubscribe.
 */
export function onFindClick(fn: (find: Find, p: SkyPoint) => void): () => void {
  findClickFns.add(fn);
  return () => findClickFns.delete(fn);
}

/**
 * With a kind chip on, every dot of those kinds shows at any zoom (PLC-2).
 * @param kinds Kinds to show at every zoom, or null to go back to showing by importance.
 */
export function showGroups(kinds: readonly PlaceKind[] | null): void {
  groups = kinds ? new Set(kinds) : null;
  refreshAlways();
  soon();
}

/** Highlights the dot of a place the pointer is on in a list; null for none. */
export function setHover(id: string | null): void {
  hover = id;
  refreshAlways();
  soon();
}

/** Marks the place whose card is open; null for none. */
export function setChosen(id: string | null): void {
  chosen = id;
  refreshAlways();
  soon();
}

/**
 * Spots another mark draws itself (globe.ts: mission beacons and objects to try). A place dot at
 * one of them (within 0.01°) is neither drawn nor picked, so its name does not show twice.
 * @param spots Degrees; an empty list gives the dots back.
 */
export function setTaken(spots: readonly { ra: number; dec: number; name?: string }[]): void {
  taken = spots.map((x) => ({ ra: x.ra, dec: x.dec, name: x.name }));
  soon();
}

function isTaken(d: { ra: number; dec: number; name?: string }): boolean {
  for (const t of taken) {
    // The same object by name (catalogue and target positions can differ by their epochs).
    if (t.name && t.name === d.name) return true;
    if (Math.abs(t.dec - d.dec) < 0.01 && Math.abs(((t.ra - d.ra + 540) % 360) - 180) * Math.cos((d.dec * Math.PI) / 180) < 0.01) return true;
  }
  return false;
}

/**
 * Keeps labels off an element's box while it is visible (rule 5 in SPEC 9.4). Visible
 * `[data-card]` elements are kept clear without asking.
 * @returns Stop keeping it clear.
 */
export function keepClear(el: Element): () => void {
  clear.add(el);
  avoidCache = null;
  soon();
  return () => {
    clear.delete(el);
    avoidCache = null;
    soon();
  };
}

/**
 * The dot under a screen point, if any: only dots drawn now can be picked.
 * @param x CSS pixels from the window's left.
 * @param y CSS pixels from the window's top.
 */
export function pick(x: number, y: number): Dot | null {
  let best: Dot | null = null;
  let bestD = 9; // pixels
  for (const p of placed) {
    const dist = Math.hypot(p.x - x, p.y - y);
    const onLabel =
      p.label && x >= p.label.left && x <= p.label.right && y >= p.label.top && y <= p.label.bottom;
    const d = onLabel ? Math.min(dist, 4) : dist;
    if (d < bestD && !(taken.length && isTaken(dots[p.index] as Dot))) {
      best = dots[p.index] ?? null;
      bestD = d;
    }
  }
  return best;
}

/** The pin under a screen point (its ring or its label), if any. */
function pickPin(x: number, y: number): Pin | null {
  for (const p of pinPlaced) {
    const onLabel =
      p.label && x >= p.label.left && x <= p.label.right && y >= p.label.top && y <= p.label.bottom;
    if (onLabel || Math.hypot(p.x - x, p.y - y) <= 9) return pins[p.index] ?? null;
  }
  return null;
}

/** The found source under a screen point (within 8 px of its mark), if any. */
function pickFind(x: number, y: number): Find | null {
  let best: Find | null = null;
  let bestD = 8;
  for (const f of finds) {
    const p = toScreen(f.ra, f.dec);
    if (!p) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

/** The dots inside the current view (the lists' "In this view" switch), whatever their tier. */
export function inView(): Dot[] {
  const c = camera();
  return dots.filter((d) => {
    const p = toScreen(d.ra, d.dec);
    return p !== null && p.x >= 0 && p.y >= 0 && p.x <= c.width && p.y <= c.height;
  });
}

/**
 * Calls `fn` when the sky has stopped moving for 200 ms (to refresh "In this view").
 * @returns Unsubscribe.
 */
export function onRest(fn: () => void): () => void {
  restFns.add(fn);
  return () => restFns.delete(fn);
}

/**
 * Calls `fn` when the user clicks a dot on the sky (lane G opens its card). A click on a dot
 * never opens "Move the frame here".
 * @returns Unsubscribe.
 */
export function onDotClick(fn: (dot: Dot, p: SkyPoint) => void): () => void {
  clickFns.add(fn);
  return () => clickFns.delete(fn);
}

/** Paint time of the dots, ms: the median and the worst of the last 60 paints (PLC-8). */
export function paintStats(): { median: number; worst: number; count: number; drawn: number } {
  const sorted = [...paintTimes].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    worst: sorted[sorted.length - 1] ?? 0,
    count: dots.length,
    drawn: placed.length,
  };
}

// ----- Drawing --------------------------------------------------------------------------------

function label(d: Dot): string {
  return d.simulated ? `Simulated: ${d.name}` : d.name;
}

function textWidth(text: string): number {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d');
    if (measureCtx) measureCtx.font = font;
  }
  return Math.ceil(measureCtx?.measureText(text).width ?? text.length * 6.5) + 2;
}

function refreshAlways(): void {
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i] as Dot;
    const input = inputs[i] as LayoutInput;
    const ringed = d.id === hover || d.id === chosen || d.id === skyHover;
    input.always = !!groups?.has(d.kind) || ringed;
    // A ringed dot (8 px ring) puts its label further out, clear of the ring (ux-audit #7).
    input.gap = ringed ? 11 : undefined;
  }
}

function soon(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    refreshAlways();
    paint();
  });
}

/** Boxes labels stay off: visible cards, kept-clear elements. Re-read when the page changes. */
function avoidBoxes(): Box[] {
  const now = performance.now();
  if (avoidCache && now - avoidCache.at < 500) return avoidCache.boxes;
  const boxes = [...document.querySelectorAll('[data-card]'), ...clear]
    .filter((el) => el.checkVisibility())
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - 4, top: r.top - 4, right: r.right + 4, bottom: r.bottom + 4 };
    })
    .filter((b) => b.right > b.left && b.bottom > b.top);
  avoidCache = { at: now, boxes };
  return boxes;
}

const STAR_KINDS = new Set<PlaceKind>([
  'star',
  'nearby-star',
  'fast-star',
  'brown-dwarf',
  'variable-star',
]);
const CLUSTER_KINDS = new Set<PlaceKind>(['open-cluster', 'globular-cluster']);
const GALAXY_KINDS = new Set<PlaceKind>(['spiral-galaxy', 'elliptical-galaxy', 'galaxy']);

/** One small glyph per family of kinds, told apart by shape (DESIGN.md: shape, not hue). */
function glyph(ctx: CanvasRenderingContext2D, kind: PlaceKind, x: number, y: number): void {
  ctx.beginPath();
  if (STAR_KINDS.has(kind)) {
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (CLUSTER_KINDS.has(kind)) {
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (GALAXY_KINDS.has(kind)) {
    ctx.ellipse(x, y, 5, 2.8, -Math.PI / 6, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.rect(x - 3.5, y - 3.5, 7, 7);
    ctx.stroke();
  }
}

let colours: { ink: string; amber: string; mark: string; halo: string } | null = null;

/** The tokens the dots use, read once from app.css. */
function palette(): { ink: string; amber: string; mark: string; halo: string } {
  if (colours) return colours;
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  font = `500 12px ${get('--font', 'Archivo, sans-serif')}`;
  colours = {
    ink: get('--st-ink', '#f4f4f5'),
    amber: get('--st-accent-2', '#ffb03a'),
    mark: get('--mark', '#ff4a9c'),
    halo: get('--note-bg', 'rgba(10, 10, 12, 0.82)'),
  };
  return colours;
}

function paint(): void {
  const canvas = dotLayer();
  const view = currentView();
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx || !view) return;
  const t0 = performance.now();
  const c = camera();
  const patch = outline();
  const avoid = avoidBoxes();
  const boxes = patch
    ? [
        ...avoid,
        {
          left: patch.left - 3,
          top: patch.top - 3,
          right: patch.right + 3,
          bottom: patch.bottom + 3,
        },
      ]
    : avoid;
  const both = pins.length ? [...pinInputs, ...inputs] : inputs;
  const all = layout(
    both,
    view,
    c.width,
    c.height,
    c.fov,
    boxes,
    sides,
    performance.now() - lastMove >= REST_MS - 20,
  );
  sides = new Map();
  for (const p of all) if (p.side >= 0) sides.set(both[p.index] as LayoutInput, p.side);
  pinPlaced = all.filter((p) => p.index < pins.length);
  placed = pins.length
    ? all.filter((p) => p.index >= pins.length).map((p) => ({ ...p, index: p.index - pins.length }))
    : all;

  // A phone-sized globe names only a few of the most important places (the beacons name the
  // missions); zooming in names more (lane M, redesign). Dots without a name stay drawn.
  if (Math.min(c.width, c.height) < 500 || c.width < 700) {
    const cap = c.fov > 90 ? 5 : c.fov > 40 ? 9 : c.fov > 15 ? 14 : 24;
    let n = 0;
    for (const p of placed) {
      if (!p.label) continue;
      const d = dots[p.index] as Dot;
      if (taken.length && isTaken(d)) continue;
      const keep = n < cap || d.id === chosen || d.id === hover;
      if (keep) n++;
      else p.label = null;
    }
  }
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  const { ink, amber, mark, halo } = palette();
  ctx.font = font;
  ctx.lineWidth = 1.4;
  ctx.textBaseline = 'middle';
  const solid = document.documentElement.dataset.glass === 'solid';
  for (const p of placed) {
    const d = dots[p.index] as Dot;
    if (taken.length && isTaken(d)) continue;
    const colour = d.simulated ? amber : ink;
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    ctx.setLineDash(d.simulated ? [3, 2] : []);
    glyph(ctx, d.kind, p.x, p.y);
    if (d.id === chosen || d.id === hover || d.id === skyHover) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = mark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (p.label) {
      const text = label(d);
      const x = p.label.left + 1;
      const y = p.label.top + LABEL_HEIGHT / 2;
      ctx.save();
      ctx.setLineDash([]);
      chip(ctx, p.label, solid);
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = halo;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colour;
      ctx.fillText(text, x, y);
      ctx.restore();
    }
  }
  for (const p of pinPlaced) {
    const pin = pins[p.index] as Pin;
    const hot = skyHover === `pin:${pin.id}`;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = hot ? mark : ink;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); // 14 px ring (--pin)
    ctx.stroke();
    if (p.label) {
      const x = p.label.left + 1;
      const y = p.label.top + LABEL_HEIGHT / 2;
      chip(ctx, p.label, solid);
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = halo;
      ctx.strokeText(pin.name, x, y);
      ctx.fillStyle = ink;
      ctx.fillText(pin.name, x, y);
    }
    ctx.restore();
  }
  if (finds.length || findArea) paintFinds(ctx, c.width, c.height);
  paintTimes.push(performance.now() - t0);
  if (paintTimes.length > 60) paintTimes.shift();
}

/**
 * A label over a bright sky sits on a Thin chip (DESIGN-v2 9): the map's mean brightness under
 * it above 0.4 (linear). A canvas cannot blur what is under it, so the chip is the Thin tint made
 * as dark as Thin's dimming would leave it over white (82%; Solid: 95%).
 */
function chip(ctx: CanvasRenderingContext2D, b: Box, solid: boolean): void {
  if (skyBrightness(b.left, b.top, b.right, b.bottom) <= BRIGHT) return;
  const x = b.left - 4;
  const y = b.top - 1;
  const w = b.right - b.left + 7;
  const h = b.bottom - b.top + 2;
  ctx.save();
  ctx.fillStyle = solid ? 'rgb(22 22 24 / 0.97)' : 'rgb(22 22 24 / 0.86)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.restore();
}

/** The filter's circle (dotted, faint ink) and its sources (reticles; the hot one ringed and named). */
function paintFinds(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const { ink, mark, halo } = palette();
  ctx.save();
  if (findArea) {
    // The circle on the sky, traced through the projection (it is not a circle on screen far out).
    const a = findArea;
    const d2r = Math.PI / 180;
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    let open = false;
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * 2 * Math.PI;
      // A point at angular distance r and position angle t from the centre.
      const r = a.radius * d2r;
      const dec0 = a.dec * d2r;
      const dec = Math.asin(Math.sin(dec0) * Math.cos(r) + Math.cos(dec0) * Math.sin(r) * Math.cos(t));
      const ra =
        a.ra * d2r +
        Math.atan2(Math.sin(t) * Math.sin(r) * Math.cos(dec0), Math.cos(r) - Math.sin(dec0) * Math.sin(dec));
      const p = toScreen(ra / d2r, dec / d2r);
      if (!p) {
        open = false;
        continue;
      }
      if (open) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      open = true;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.setLineDash([]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = ink;
  let hot: { f: Find; x: number; y: number } | null = null;
  for (const f of finds) {
    const p = toScreen(f.ra, f.dec);
    if (!p || p.x < -10 || p.y < -10 || p.x > w + 10 || p.y > h + 10) continue;
    if (f.id === findHot) hot = { f, x: p.x, y: p.y };
    ctx.beginPath();
    if (f.cat === 'gaia') ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    else ctx.rect(p.x - 4, p.y - 4, 8, 8);
    // Four short ticks make it a reticle, unlike any place's glyph.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      ctx.moveTo(p.x + dx * 6.5, p.y + dy * 6.5);
      ctx.lineTo(p.x + dx * 9.5, p.y + dy * 9.5);
    }
    ctx.stroke();
  }
  if (hot) {
    ctx.strokeStyle = mark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hot.x, hot.y, 11, 0, Math.PI * 2);
    ctx.stroke();
    // Its name, unless a card covers that spot (labels never go over cards).
    ctx.font = font;
    const tw = textWidth(hot.f.name);
    const box = { left: hot.x + 15, top: hot.y - 8, right: hot.x + 15 + tw, bottom: hot.y + 8 };
    const blocked = avoidBoxes().some(
      (b) => b.left < box.right && b.right > box.left && b.top < box.bottom && b.bottom > box.top,
    );
    if (!blocked) {
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = halo;
      ctx.strokeText(hot.f.name, box.left, hot.y);
      ctx.fillStyle = mark;
      ctx.fillText(hot.f.name, box.left, hot.y);
    }
  }
  ctx.restore();
}
