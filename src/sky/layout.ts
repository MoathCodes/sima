/**
 * Which place dots show at a zoom, and where their labels go (PLC-2, PLC-3, PLC-8). Pure: no
 * page, so the tests can time it on the whole catalogue. Owner: lane C.
 *
 * - Dots appear by importance with zoom, like cities then towns on a map: tier 0 at the widest
 *   view, more tiers as the view narrows (`maxTier`). Dots of a chosen kind show at any zoom.
 * - Labels never overlap each other, any box to keep clear (cards), or the window's edge. A
 *   label tries the right of its dot, then the left, above and below; with no room, the dot
 *   shows without a label. More important places choose first.
 * - Labels stay calm while the view moves: a label shown last time keeps its side and goes before
 *   any new one, and new labels are added only once the view has stopped (`grow`). So a wheel
 *   zoom never reshuffles them; it only drops those that collide or leave the window.
 */
import { projectInto, type View } from './project.ts';

/** A box on screen, CSS pixels. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One dot, as layout needs it. Give them sorted by importance: the first place labels first. */
export interface LayoutInput {
  ra: number;
  dec: number;
  tier: number;
  /** Shown at any zoom (its kind's chip is on, or it is hovered or chosen). */
  always: boolean;
  /** Label width in CSS pixels. */
  width: number;
  /** Room between the mark's centre and its label, CSS pixels (7 for a dot; pins are bigger). */
  gap?: number;
}

/** A drawn dot: its index in the input, where it is, and its label box if it has one. */
export interface Placed {
  index: number;
  x: number;
  y: number;
  label: Box | null;
  /** Which side the label took (0 right, 1 left, 2 above, 3 below), −1 for none. */
  side: number;
}

/** The labels of the last layout, by input: the side each took. */
export type Sides = ReadonlyMap<LayoutInput, number>;

/** The faintest tier shown at a view this wide (degrees). */
export function maxTier(fov: number): number {
  return fov > 110 ? 0 : fov > 55 ? 1 : fov > 22 ? 2 : fov > 7 ? 3 : 4;
}

export const LABEL_HEIGHT = 16;
const DOT_GAP = 7;
const MAX_LABELS = 80;

function hits(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Lays out the dots of one view.
 *
 * @param dots Sorted by importance (most important first).
 * @param view The projection now.
 * @param width Window width, CSS pixels.
 * @param height Window height.
 * @param fov Width of the view, degrees.
 * @param avoid Boxes labels must stay off (visible cards, the patch).
 * @param prev The sides of the last layout's labels: they keep them, and choose first.
 * @param grow False while the view moves: no label is added that `prev` did not have.
 */
export function layout(
  dots: readonly LayoutInput[],
  view: View,
  width: number,
  height: number,
  fov: number,
  avoid: readonly Box[],
  prev: Sides = new Map(),
  grow = true,
): Placed[] {
  const tier = maxTier(fov);
  const out: Placed[] = [];
  const taken: Box[] = [];
  const p = { x: 0, y: 0 };
  let labels = 0;
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i] as LayoutInput;
    if (d.tier > tier && !d.always) continue;
    if (!projectInto(view, d.ra, d.dec, p)) continue;
    if (p.x < -4 || p.y < -4 || p.x > width + 4 || p.y > height + 4) continue;
    out.push({ index: i, x: p.x, y: p.y, label: null, side: -1 });
  }
  // Labels: last time's first, on their old side if it is still free (while the view moves, only
  // there: a label never flips side mid-zoom); then, once it has stopped, new ones.
  const label = (placed: Placed, first: number, only = false): void => {
    const d = dots[placed.index] as LayoutInput;
    const w = d.width;
    const h = LABEL_HEIGHT;
    const GAP = d.gap ?? DOT_GAP;
    const { x, y } = placed;
    const tries: Box[] = [
      { left: x + GAP, top: y - h / 2, right: x + GAP + w, bottom: y + h / 2 },
      { left: x - GAP - w, top: y - h / 2, right: x - GAP, bottom: y + h / 2 },
      { left: x - w / 2, top: y - GAP - h, right: x + w / 2, bottom: y - GAP },
      { left: x - w / 2, top: y + GAP, right: x + w / 2, bottom: y + GAP + h },
    ];
    for (let k = -1; k < (only ? 0 : tries.length); k++) {
      const side = k < 0 ? first : k;
      if (side < 0 || (k >= 0 && k === first)) continue;
      const t = tries[side] as Box;
      if (t.left < 2 || t.top < 2 || t.right > width - 2 || t.bottom > height - 2) continue;
      if (avoid.some((r) => hits(t, r)) || taken.some((r) => hits(t, r))) continue;
      placed.label = t;
      placed.side = side;
      taken.push(t);
      labels++;
      return;
    }
  };
  for (const placed of out) {
    if (labels >= MAX_LABELS) break;
    const side = prev.get(dots[placed.index] as LayoutInput);
    if (side !== undefined && side >= 0) label(placed, side, !grow);
  }
  if (grow) {
    for (const placed of out) {
      if (labels >= MAX_LABELS) break;
      if (placed.side < 0 && !prev.has(dots[placed.index] as LayoutInput)) label(placed, -1);
    }
  }
  return out;
}
