/**
 * Where to put a floating card (the tour's step card, a tip) next to the thing it talks about,
 * without covering that thing or any other card. Owner: lane H. Pure: no page access.
 */

/** A box on screen, CSS pixels. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Which side of the target the card sits on. */
export type Side = 'below' | 'above' | 'right' | 'left';

/** True when two boxes overlap by more than `slack` pixels. */
export function overlaps(a: Box, b: Box, slack = 0): boolean {
  return (
    a.left + slack < b.left + b.width &&
    b.left + slack < a.left + a.width &&
    a.top + slack < b.top + b.height &&
    b.top + slack < a.top + a.height
  );
}

/** Area two boxes share, square pixels. */
function shared(a: Box, b: Box): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

export interface PlaceOptions {
  /** Space between the card and the target. */
  gap?: number;
  /** Space kept from the window's edges. */
  margin?: number;
  /** Sides to try, in order. */
  sides?: readonly Side[];
  /**
   * When no spot is free: true returns the spot that covers the least of `avoid` (never the
   * target); false returns null.
   */
  force?: boolean;
}

/**
 * A spot for a card of `size` beside `target`, inside the window, not over the target and not
 * over any box in `avoid`.
 *
 * Each side is tried with the card centred on the target, then slid along that side in steps
 * until it fits.
 *
 * @returns The card's box and the side it is on, or null (see `force`).
 */
export function placeNear(
  target: Box,
  size: { width: number; height: number },
  win: { width: number; height: number },
  avoid: readonly Box[],
  opts: PlaceOptions = {},
): { box: Box; side: Side } | null {
  const gap = opts.gap ?? 12;
  const margin = opts.margin ?? 8;
  const sides = opts.sides ?? ['below', 'above', 'right', 'left'];
  const { width: w, height: h } = size;
  let best: { box: Box; side: Side; cost: number } | null = null;

  for (const side of sides) {
    for (const box of along(target, side, w, h, gap, win, margin)) {
      if (box.left < margin - 0.5 || box.top < margin - 0.5) continue;
      if (box.left + w > win.width - margin + 0.5 || box.top + h > win.height - margin + 0.5) {
        continue;
      }
      if (overlaps(box, target, -1)) continue;
      const cost = avoid.reduce((sum, a) => sum + shared(box, a), 0);
      if (cost === 0) return { box, side };
      if (!best || cost < best.cost) best = { box, side, cost };
    }
  }
  return opts.force && best ? { box: best.box, side: best.side } : null;
}

/** Spots on one side of the target: centred first, then slid both ways. */
function* along(
  t: Box,
  side: Side,
  w: number,
  h: number,
  gap: number,
  win: { width: number; height: number },
  margin: number,
): Generator<Box> {
  const horizontal = side === 'below' || side === 'above';
  const fixed =
    side === 'below'
      ? t.top + t.height + gap
      : side === 'above'
        ? t.top - gap - h
        : side === 'right'
          ? t.left + t.width + gap
          : t.left - gap - w;
  const len = horizontal ? w : h;
  // The card slides along the side only while it stays level with the target (at least 20 px
  // of the two side by side), so it never ends up far from what it talks about.
  const tStart = horizontal ? t.left : t.top;
  const tEnd = horizontal ? t.left + t.width : t.top + t.height;
  const reach = Math.min(20, (tEnd - tStart) / 2);
  const lo = Math.max(margin, tStart + reach - len);
  const hi = Math.min((horizontal ? win.width : win.height) - margin - len, tEnd - reach);
  if (hi < lo) return;
  const centre = horizontal ? t.left + t.width / 2 - w / 2 : t.top + t.height / 2 - h / 2;
  const start = Math.max(lo, Math.min(hi, centre));
  const make = (p: number): Box =>
    horizontal
      ? { left: p, top: fixed, width: w, height: h }
      : { left: fixed, top: p, width: w, height: h };
  yield make(start);
  const step = 24;
  for (let d = step; d <= hi - lo + step; d += step) {
    let any = false;
    if (start + d <= hi) {
      any = true;
      yield make(start + d);
    }
    if (start - d >= lo) {
      any = true;
      yield make(start - d);
    }
    if (!any) break;
  }
}

/**
 * Like `placeNear`, for a target inside a card (`holder`): first right beside the target, then
 * just outside the holder, level with the target (left or right of it) or in line with it (above
 * or below it). With `force`, the last resort is the least covered spot beside the target.
 */
export function placeBeside(
  target: Box,
  holder: Box | null,
  size: { width: number; height: number },
  win: { width: number; height: number },
  avoid: readonly Box[],
  opts: PlaceOptions = {},
): { box: Box; side: Side } | null {
  const free = placeNear(target, size, win, avoid, { ...opts, force: false });
  if (free || !holder) return free ?? placeNear(target, size, win, avoid, opts);
  const level = { left: holder.left, width: holder.width, top: target.top, height: target.height };
  const inLine = { left: target.left, width: target.width, top: holder.top, height: holder.height };
  return (
    placeNear(level, size, win, avoid, { ...opts, sides: ['left', 'right'], force: false }) ??
    placeNear(inLine, size, win, avoid, { ...opts, sides: ['below', 'above'], force: false }) ??
    placeNear(target, size, win, avoid, opts)
  );
}
