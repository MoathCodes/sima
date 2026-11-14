/**
 * The picture on screen, as lane D last painted it: values, date, detector, processing. Lane E
 * reads it for the histogram, the value under the pointer and the cutouts. It is caught with a
 * `drawHooks` function that draws nothing (SPEC 9.4 rule 4). Owner: lane E.
 */
import { drawHooks, type PictureView } from '../render.ts';
import { limits, type Range } from '../../core/display.ts';
import { median } from '../../core/stats.ts';
import { pic } from '../state.ts';

/**
 * What lane D may add to PictureView (requested in lane E's report): the black and white points
 * it painted with and the sky level and noise it used. Until then lane E works them out the same
 * way, from the frames of the picture on screen.
 */
type Painted = PictureView & { range?: Range; noise?: { sky: number; sigma: number } };

let last: Painted | null = null;
const fns = new Set<(v: Readonly<PictureView>) => void>();
let queued = false;

/** Starts listening to paints. Called once. */
export function startView(): void {
  drawHooks.add((_ctx, view) => {
    last = view as Painted;
    if (queued) return;
    queued = true;
    // After the paint, not inside it: listeners may do real work.
    queueMicrotask(() => {
      queued = false;
      if (last) for (const fn of fns) fn(last);
    });
  });
}

/** The last painted picture; null before the first paint. */
export function lastView(): Readonly<PictureView> | null {
  return last;
}

/** Hear every paint (once per paint, after it). */
export function onPaint(fn: (v: Readonly<PictureView>) => void): () => void {
  fns.add(fn);
  return () => fns.delete(fn);
}

/**
 * The sky level and noise of the picture on screen, µJy per pixel: lane D's if it says, else the
 * median sky of its frames and the detector's typical noise, reduced by √N for N frames blended.
 */
export function noiseOf(view: Readonly<PictureView>): { sky: number; sigma: number } | null {
  const v = view as Painted;
  if (v.noise && Number.isFinite(v.noise.sigma)) return v.noise;
  const field = view.field;
  const group = view.group;
  if (!field || !group || !group.frames.length) return null;
  const frames = group.frames.map((i) => field.frames[i]).filter((f) => f !== undefined);
  const sky = median(frames.map((f) => f.sky * f.gain));
  const each = median(frames.map((f) => f.sigma * f.gain));
  const sigma = each / Math.sqrt(frames.length);
  if (!Number.isFinite(sigma) || sigma <= 0) return null;
  return { sky: view.mode === 'diff' ? 0 : Number.isFinite(sky) ? sky : 0, sigma };
}

/** The black and white points in force for the picture on screen, µJy; null without values. */
export function rangeOf(view: Readonly<PictureView>): Range | null {
  const v = view as Painted;
  if (v.range) return v.range;
  const noise = noiseOf(view);
  if (!view.values || !noise) return null;
  return limits(view.values, pic(), noise);
}
