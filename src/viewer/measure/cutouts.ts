/**
 * Cutouts: the reference, this date and the difference around one spot (as transient surveys
 * show them, SPEC 7.4). Used by a candidate in Find changes and by Measure's Cutouts tab.
 * Owner: lane E. The pictures are lane B's `blend` and `combine`; painting is lane B's display.
 */
import { blend } from '../../core/blink.ts';
import { combine } from '../../core/filters.ts';
import { limits, makeLut, toRgba } from '../../core/display.ts';
import { wcsSky2Pix } from '../../core/real.ts';
import { median } from '../../core/stats.ts';
import type { Det, Field, Group } from '../../core/types.ts';
import { pic } from '../state.ts';

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

/** The three pictures for a window of a detector; null when the window has no exposure. */
export function triplet(field: Field, det: Det, window: number): Triplet | null {
  const p = pic();
  const now = windowGroup(field, det, window);
  if (!now.frames.length) return null;
  const others: Float32Array[] = [];
  for (let w = 0; w < field.windows; w++) {
    if (w === window) continue;
    const g = windowGroup(field, det, w);
    if (g.frames.length) others.push(blend(field, g, p.combineBy, p.match));
  }
  if (!others.length) return null;
  const a = blend(field, now, p.combineBy, p.match);
  const ref = others.length === 1 ? (others[0] ?? a) : combine(others, 'median');
  const diff = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) diff[i] = (a[i] ?? Number.NaN) - (ref[i] ?? Number.NaN);
  const refText =
    others.length === 1 ? 'the other date' : `the median of the other ${others.length} dates`;
  return { ref, now: a, diff, refText };
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
  const lut = makeLut(opts.diff ? { ...p, cmap: 'mono', stretch: 'linear', invert: false } : p, det, cut, range);
  const rgba = toRgba(cut, range, lut);
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = new ImageData(side, side);
  img.data.set(rgba.subarray(0, side * side * 4));
  ctx.putImageData(img, 0, 0);
}
