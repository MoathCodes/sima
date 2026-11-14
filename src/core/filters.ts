/**
 * Clean-up filters for pictures on the viewer's grid: sigma clipping, Gaussian smoothing, the
 * 3 × 3 median, background subtraction and combining. Owner: lane B. Pure.
 * docs/tools.md ("Clean up tab") gives each method and its limits.
 *
 * Pictures are n × n Float32Arrays in µJy per pixel, screen order (core/types.ts `Field`), NaN
 * where there is no data. Filters never write into their input.
 *
 * PHASE 0 STUB: every filter returns an unchanged copy; statistics return NaN.
 */
import type { PicSettings, CombineHow } from './picture.ts';

/**
 * Sigma clipping: drop values more than k robust standard deviations from the median
 * (robust = 1.4826 × MAD), repeat until stable, then take the mean.
 * PHASE 0 STUB: NaN.
 *
 * @param values Any values; NaN are ignored.
 * @param k Clip at k sigma (default 3).
 */
export function sigmaClip(
  values: ArrayLike<number>,
  k = 3,
): { mean: number; sigma: number; kept: number } {
  return { mean: Number.NaN, sigma: Number.NaN, kept: 0 };
}

/**
 * 3 × 3 median filter: each pixel becomes the median of itself and its 8 neighbours.
 * PHASE 0 STUB: an unchanged copy.
 */
export function median3x3(pix: Float32Array, n: number): Float32Array {
  return pix.slice();
}

/**
 * Gaussian smoothing. Flagged pixels are left out, not blurred in.
 * PHASE 0 STUB: an unchanged copy.
 *
 * @param sigma Pixels: 0.5, 1 or 2.
 * @param bad n × n, 1 where flagged.
 */
export function gaussianSmooth(
  pix: Float32Array,
  n: number,
  sigma: number,
  bad?: Uint8Array,
): Float32Array {
  return pix.slice();
}

/**
 * Background removal (SExtractor mesh): boxes a third of the picture across (4 to 16 pixels),
 * each box's sky by 3σ clipping, a 3 × 3 median of the box values, a smooth surface subtracted.
 * PHASE 0 STUB: an unchanged copy.
 */
export function subtractBackground(pix: Float32Array, n: number, bad?: Uint8Array): Float32Array {
  return pix.slice();
}

/**
 * Combines pictures of the same grid, pixel by pixel: mean, median, or sigma clip (drop values
 * more than 3 robust sigma from the median, then the mean).
 * PHASE 0 STUB: a copy of the first picture (or an empty array when there is none).
 */
export function combine(pictures: readonly Float32Array[], how: CombineHow): Float32Array {
  return pictures[0]?.slice() ?? new Float32Array(0);
}

/**
 * Applies the clean-up steps that are on in `p`, in their order: background, median, smoothing
 * (combining a pass happens before, in core/blink.ts). Returns a new picture.
 * PHASE 0 STUB: an unchanged copy.
 *
 * @param p Settings in force (`pic()` from viewer/state.ts).
 * @param bad n × n, 1 where flagged.
 */
export function cleanUp(
  pix: Float32Array,
  n: number,
  p: PicSettings,
  bad?: Uint8Array,
): Float32Array {
  return pix.slice();
}
