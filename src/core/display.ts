/**
 * How pixel values become colours on screen: limits, stretches, colour maps and the histogram
 * (docs/tools.md, "Picture tab", after SAOImage DS9). Owner: lane B. Pure: the result is a plain
 * RGBA byte array; viewer code wraps it in ImageData.
 *
 * Each setting builds a 16,384-step lookup table once, so a redraw is one table lookup per
 * pixel. The default (asinh, noise-based limits, Band colours) is the app's normal look.
 *
 * PHASE 0 STUB: fixed fake values (a black picture).
 */
import type { Det } from './types.ts';
import type { PicSettings } from './picture.ts';

/** Steps in a lookup table. */
export const LUT_SIZE = 16384;

/** Black and white points, µJy per pixel. */
export interface Range {
  lo: number;
  hi: number;
}

/** Pixel values of a picture, counted on an asinh axis (sky and bright stars both get room). */
export interface Histogram {
  /** Bin edges in noise units above the sky: counts.length + 1 of them. */
  edges: number[];
  counts: number[];
}

/**
 * The black and white points in force for a picture, by the settings' method (noise based,
 * zscale, 99.5%, min to max, or custom in noise units above the sky, clamped).
 * PHASE 0 STUB: always 0 to 1.
 *
 * @param pix The picture, µJy per pixel.
 * @param p Settings in force.
 * @param noise The picture's sky level and noise, µJy.
 */
export function limits(pix: Float32Array, p: PicSettings, noise: { sky: number; sigma: number }): Range {
  return { lo: 0, hi: 1 };
}

/**
 * The histogram under the Picture tab's black and white handles.
 * PHASE 0 STUB: empty.
 *
 * @param bins Number of bins.
 */
export function histogram(
  pix: Float32Array,
  bins: number,
  noise: { sky: number; sigma: number },
): Histogram {
  return { edges: [], counts: [] };
}

/**
 * A lookup table: LUT_SIZE RGBA entries (4 bytes each) from black to white, through the
 * stretch, brightness, contrast, colour map (Band uses the detector's hue) and invert.
 * PHASE 0 STUB: all black.
 *
 * @param p Settings in force.
 * @param det Detector, for the Band colour map.
 */
export function makeLut(p: PicSettings, det: Det): Uint8ClampedArray {
  return new Uint8ClampedArray(LUT_SIZE * 4);
}

/**
 * Paints a picture: n × n values → n × n RGBA bytes, through `lut` between `range.lo` and
 * `range.hi`. NaN (no data) is drawn as pure black.
 * PHASE 0 STUB: all black.
 *
 * @param out Optional array to fill (n × n × 4); a new one is made otherwise.
 */
export function toRgba(
  pix: Float32Array,
  range: Range,
  lut: Uint8ClampedArray,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  return out ?? new Uint8ClampedArray(pix.length * 4);
}
