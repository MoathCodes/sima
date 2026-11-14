/**
 * Dots and labels for places on the sky (PLC-2, PLC-3, PLC-8). Owner: lane C. Lane G gives the
 * dots (`setDots`); lane C decides which show at each zoom and where their labels go.
 *
 * Labels never cover a card: every visible `[data-card]` is kept clear, and so is anything given
 * to `keepClear` (rule 5 in SPEC 9.4).
 *
 * PHASE 0 STUB: a crude tier rule by zoom (see `maxTier`), labels to the right unless that would
 * touch a card, no collision between labels, every dot drawn as a DOM span.
 */
import { camera, onZoom, toScreen } from './sky.ts';
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

let dots: readonly Dot[] = [];
let groups: readonly PlaceKind[] | null = null;
let hover: string | null = null;
let chosen: string | null = null;
const clear = new Set<Element>();
const restFns = new Set<() => void>();
let layer: HTMLDivElement | null = null;
let restTimer = 0;

onZoom(() => {
  paint();
  clearTimeout(restTimer);
  restTimer = window.setTimeout(() => restFns.forEach((fn) => fn()), 200);
});

/**
 * The places to show. Replaces the previous set.
 * @param next Dots, any order. Lane C sorts by tier.
 */
export function setDots(next: readonly Dot[]): void {
  dots = next;
  paint();
}

/**
 * With a kind chip on, every dot of those kinds shows at any zoom (PLC-2).
 * @param kinds Kinds to show at every zoom, or null to go back to showing by importance.
 */
export function showGroups(kinds: readonly PlaceKind[] | null): void {
  groups = kinds;
  paint();
}

/** Highlights the dot of a place the pointer is on in a list; null for none. */
export function setHover(id: string | null): void {
  hover = id;
  paint();
}

/** Marks the place whose card is open; null for none. */
export function setChosen(id: string | null): void {
  chosen = id;
  paint();
}

/**
 * Keeps labels off an element's box while it is visible (rule 5 in SPEC 9.4). Visible
 * `[data-card]` elements are kept clear without asking.
 * @returns Stop keeping it clear.
 */
export function keepClear(el: Element): () => void {
  clear.add(el);
  paint();
  return () => {
    clear.delete(el);
    paint();
  };
}

/**
 * The dot under a screen point, if any.
 * @param x CSS pixels from the window's left.
 * @param y CSS pixels from the window's top.
 */
export function pick(x: number, y: number): Dot | null {
  let best: Dot | null = null;
  let bestD = 9; // pixels
  for (const d of dots) {
    const p = toScreen(d.ra, d.dec);
    const dist = p ? Math.hypot(p.x - x, p.y - y) : Infinity;
    if (dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

/** The dots inside the current view (the lists' "In this view" switch). */
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

// ----- Phase 0 drawing ------------------------------------------------------------------------

/** Phase 0: the faintest tier shown at a sky width (degrees). Lane C replaces this rule. */
function maxTier(fov: number): number {
  return fov > 60 ? 0 : fov > 20 ? 1 : fov > 6 ? 2 : fov > 2 ? 3 : 4;
}

function paint(): void {
  const host = document.getElementById('sky-marks');
  if (!host) return;
  if (!layer) {
    layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;inset:0';
    host.append(layer);
  }
  const avoid = [...document.querySelectorAll('[data-card]'), ...clear]
    .filter((el) => el.checkVisibility())
    .map((el) => el.getBoundingClientRect());
  const parts: string[] = [];
  const tier = maxTier(camera().fov);
  for (const d of dots) {
    if (d.tier > tier && !groups?.includes(d.kind)) continue;
    const p = toScreen(d.ra, d.dec);
    if (!p) continue;
    const label = new DOMRect(p.x + 8, p.y - 8, 8 + d.name.length * 6.5, 16);
    const hit = avoid.some(
      (r) =>
        label.left < r.right &&
        label.right > r.left &&
        label.top < r.bottom &&
        label.bottom > r.top,
    );
    const ring = d.id === chosen || d.id === hover ? 'box-shadow:0 0 0 2px var(--mark);' : '';
    const colour = d.simulated ? 'var(--st-accent-2)' : 'var(--st-ink)';
    parts.push(
      `<span style="position:absolute;left:${p.x - 3}px;top:${p.y - 3}px;width:6px;height:6px;border-radius:50%;background:${colour};${ring}"></span>`,
    );
    if (!hit) {
      const text = d.simulated ? `Simulated: ${d.name}` : d.name;
      parts.push(
        `<span style="position:absolute;left:${label.left}px;top:${label.top}px;font:var(--text-label);color:${colour};white-space:nowrap">${text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}</span>`,
      );
    }
  }
  layer.innerHTML = parts.join('');
}
