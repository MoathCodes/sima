/**
 * Cutouts: the reference, this date and the difference around one spot (as transient surveys
 * show them, SPEC 7.4). Used by a candidate in Find changes and by Measure's Cutouts tab.
 * Owner: lane E. The pictures are lane B's blends (made in its worker, through lane D's
 * `picturesReady`) and `combine`; painting is lane B's display.
 */
import { combine } from '../../core/filters.ts';
import { limits, makeLut, toRgba, type Range } from '../../core/display.ts';
import type { PicSettings } from '../../core/picture.ts';
import { wcsSky2Pix } from '../../core/real.ts';
import { median } from '../../core/stats.ts';
import type { Det, Field, Group } from '../../core/types.ts';
import { pic } from '../state.ts';
import { groupPicture, picturesReady } from '../paint.ts';

/** One window of one detector as a flip-book group. */
export function windowGroup(field: Field, det: Det, window: number): Group {
  const frames = field.frames.filter((f) => f.det === det && f.window === window);
  const mjds = frames.map((f) => f.mjd);
  return {
    key: `w${window}`,
    letter: String.fromCharCode(65 + (window % 26)),
    window,
    visit: null,
    det,
    frames: frames.map((f) => f.i),
    mjd: mjds.length ? mjds.reduce((a, b) => a + b, 0) / mjds.length : Number.NaN,
    mjd0: mjds.length ? Math.min(...mjds) : Number.NaN,
    mjd1: mjds.length ? Math.max(...mjds) : Number.NaN,
    lam: frames.length ? frames.reduce((a, f) => a + f.lam, 0) / frames.length : Number.NaN,
  };
}

export interface Triplet {
  /** The median of the other dates, this date, and this date minus the reference. µJy. */
  ref: Float32Array;
  now: Float32Array;
  diff: Float32Array;
  /** What the reference is, in words. */
  refText: string;
}

/** The settings of a date's blend as recorded: no clean-up step. */
function blendOnly(p: PicSettings): PicSettings {
  return { ...p, background: false, median: false, smooth: 0 };
}

/**
 * True when every date's blend a triplet of this detector needs is made. If not, they are made
 * off the page's thread (blending every date at once held the page 150 ms, TLS-8) and `ready` is
 * called once they are; ask again then.
 */
export function tripletReady(field: Field, det: Det, ready: () => void): boolean {
  const groups = Array.from({ length: field.windows }, (_, w) => windowGroup(field, det, w));
  return picturesReady(field, groups, blendOnly(pic()), ready);
}

/** Triplets already made, per field: a flip-book revisits its dates, and the tabs repaint. */
const triplets = new WeakMap<Field, Map<string, Triplet | null>>();

/**
 * The three pictures for a window of a detector; null when the window has no exposure. With
 * `around`, the reference and the difference are worked out only in the cutout's box (NaN outside
 * it): the median of every other date over the whole field held the page (TLS-8).
 */
export function triplet(field: Field, det: Det, window: number, around?: { ra: number; dec: number; half: number }): Triplet | null {
  const p = pic();
  const c = around ? wcsSky2Pix(field.wcs, around.ra, around.dec) : null;
  const n = field.n;
  const box = c && around
    ? { x0: Math.max(0, Math.round(c.x) - around.half), x1: Math.min(n - 1, Math.round(c.x) + around.half), y0: Math.max(0, Math.round(c.y) - around.half), y1: Math.min(n - 1, Math.round(c.y) + around.half) }
    : { x0: 0, x1: n - 1, y0: 0, y1: n - 1 };
  const key = `${det}|${window}|${p.combineBy}|${p.match}|${box.x0},${box.x1},${box.y0},${box.y1}`;
  let kept = triplets.get(field);
  if (!kept) triplets.set(field, (kept = new Map()));
  if (kept.has(key)) return kept.get(key)!;
  const made = makeTriplet(field, det, window, box);
  if (kept.size >= 48) kept.delete(kept.keys().next().value!);
  kept.set(key, made);
  return made;
}

function makeTriplet(field: Field, det: Det, window: number, box: { x0: number; x1: number; y0: number; y1: number }): Triplet | null {
  const p = blendOnly(pic());
  const n = field.n;
  const now = windowGroup(field, det, window);
  if (!now.frames.length) return null;
  const others: Float32Array[] = [];
  for (let w = 0; w < field.windows; w++) {
    if (w === window) continue;
    const g = windowGroup(field, det, w);
    if (g.frames.length) others.push(groupPicture(field, g, p));
  }
  if (!others.length) return null;
  const a = groupPicture(field, now, p);
  // The median of the other dates inside the box only.
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const crop = (pix: Float32Array) => {
    const out = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) out[y * bw + x] = pix[(box.y0 + y) * n + box.x0 + x] ?? Number.NaN;
    return out;
  };
  const small = others.length === 1 ? crop(others[0]!) : combine(others.map(crop), 'median');
  const ref = new Float32Array(n * n).fill(Number.NaN);
  const diff = new Float32Array(n * n).fill(Number.NaN);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = (box.y0 + y) * n + box.x0 + x;
      ref[i] = small[y * bw + x] ?? Number.NaN;
      diff[i] = (a[i] ?? Number.NaN) - (ref[i] ?? Number.NaN);
    }
  const refText =
    others.length === 1 ? 'the other date' : `the median of the other ${others.length} dates`;
  return { ref, now: a, diff, refText };
}

/**
 * Colour tables by look and detector. A table is 16,384 colours; Measure repaints its cutouts on
 * every date of the flip-book, so making one each time held the page (TLS-8). Histogram
 * equalisation depends on the cutout's own pixels, so it is never kept.
 */
const luts = new Map<string, Uint8ClampedArray>();

function lutFor(p: PicSettings, det: Det, cut: Float32Array, range: Range): Uint8ClampedArray {
  if (p.stretch === 'equal') return makeLut(p, det, cut, range);
  const key = `${p.stretch}|${p.brightness}|${p.contrast}|${p.cmap}|${p.invert}|${det}`;
  let lut = luts.get(key);
  if (!lut) {
    if (luts.size >= 24) luts.delete(luts.keys().next().value!);
    lut = makeLut(p, det);
    luts.set(key, lut);
  }
  return lut;
}

/**
 * Paints a square cutout of `pix` around a sky position into a canvas, `half` pixels each side,
 * with the picture settings in force (the difference with a symmetric grey scale).
 */
export function paintCutout(
  canvas: HTMLCanvasElement,
  field: Field,
  pix: Float32Array,
  ra: number,
  dec: number,
  det: Det,
  opts: { half?: number; diff?: boolean; sigma?: number } = {},
): void {
  const half = opts.half ?? 7;
  const side = 2 * half + 1;
  const c = wcsSky2Pix(field.wcs, ra, dec);
  const cx = Math.round(c.x);
  const cy = Math.round(c.y);
  const n = field.n;
  const cut = new Float32Array(side * side).fill(Number.NaN);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const fx = cx - half + x;
      const fy = cy - half + y;
      if (fx < 0 || fy < 0 || fx >= n || fy >= n) continue;
      cut[y * side + x] = pix[fy * n + fx] ?? Number.NaN;
    }
  }
  const sigma = opts.sigma ?? field.noise[det - 1] ?? Number.NaN;
  const sky = opts.diff ? 0 : median(cut);
  const p = pic();
  const range = opts.diff
    ? { lo: -6 * sigma, hi: 6 * sigma }
    : limits(cut, p, { sky: Number.isFinite(sky) ? sky : 0, sigma });
  const look = opts.diff ? { ...p, cmap: 'mono' as const, stretch: 'linear' as const, invert: false } : p;
  const lut = lutFor(look, det, cut, range);
  const rgba = toRgba(cut, range, lut);
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = new ImageData(side, side);
  img.data.set(rgba.subarray(0, side * side * 4));
  ctx.putImageData(img, 0, 0);
}
