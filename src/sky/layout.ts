/**
 * Which place dots show at a zoom, and where their labels go (PLC-2, PLC-3, PLC-8). Pure: no
 * page, so the tests can time it on the whole catalogue. Owner: lane C.
 *
 * - Dots appear by importance with zoom, like cities then towns on a map: tier 0 at the widest
 *   view, more tiers as the view narrows (`maxTier`). Dots of a chosen kind show at any zoom.
 * - Labels never overlap each other, any box to keep clear (cards), or the window's edge. A
 *   label tries the right of its dot, then the left, above and below; with no room, the dot
 *   shows without a label. More important places choose first.
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
}

/** A drawn dot: its index in the input, where it is, and its label box if it has one. */
export interface Placed {
  index: number;
  x: number;
  y: number;
  label: Box | null;
}

/** The faintest tier shown at a view this wide (degrees). */
export function maxTier(fov: number): number {
  return fov > 110 ? 0 : fov > 55 ? 1 : fov > 22 ? 2 : fov > 7 ? 3 : 4;
}

export const LABEL_HEIGHT = 16;
const GAP = 7;
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
 */
export function layout(
  dots: readonly LayoutInput[],
  view: View,
  width: number,
  height: number,
  fov: number,
  avoid: readonly Box[],
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
    let label: Box | null = null;
    if (labels < MAX_LABELS) {
      const w = d.width;
      const h = LABEL_HEIGHT;
      const tries: Box[] = [
        { left: p.x + GAP, top: p.y - h / 2, right: p.x + GAP + w, bottom: p.y + h / 2 },
        { left: p.x - GAP - w, top: p.y - h / 2, right: p.x - GAP, bottom: p.y + h / 2 },
        { left: p.x - w / 2, top: p.y - GAP - h, right: p.x + w / 2, bottom: p.y - GAP },
        { left: p.x - w / 2, top: p.y + GAP, right: p.x + w / 2, bottom: p.y + GAP + h },
      ];
      for (const t of tries) {
        if (t.left < 2 || t.top < 2 || t.right > width - 2 || t.bottom > height - 2) continue;
        if (avoid.some((r) => hits(t, r)) || taken.some((r) => hits(t, r))) continue;
        label = t;
        break;
      }
    }
    if (label) {
      taken.push(label);
      labels++;
    }
    out.push({ index: i, x: p.x, y: p.y, label });
  }
  return out;
}
