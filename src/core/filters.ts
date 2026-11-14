/**
 * Clean-up filters for pictures on the viewer's grid: sigma clipping, Gaussian smoothing, the
 * 3 × 3 median, background subtraction and combining. Owner: lane B. Pure.
 * docs/tools.md ("Clean up tab") gives each method and its limits.
 *
 * Pictures are n × n Float32Arrays in µJy per pixel, screen order (core/types.ts `Field`), NaN
 * where there is no data. Filters never write into their input.
 */
import type { PicSettings, CombineHow } from './picture.ts';

/** Median of the first `m` values of `a`, which this sorts in place. NaN when m is 0. */
function medianInPlace(a: Float64Array, m: number): number {
  if (m === 0) return Number.NaN;
  const s = a.subarray(0, m).sort();
  const h = m >> 1;
  return m % 2 ? s[h] : 0.5 * (s[h - 1] + s[h]);
}

/** Median and robust sigma (1.4826 × median absolute deviation) of the first m values of a. */
function medianSigma(a: Float64Array, m: number, work: Float64Array): { med: number; rs: number } {
  for (let i = 0; i < m; i++) work[i] = a[i];
  const med = medianInPlace(work, m);
  for (let i = 0; i < m; i++) work[i] = Math.abs(a[i] - med);
  return { med, rs: 1.4826 * medianInPlace(work, m) };
}

/**
 * Sigma clipping: drop values more than k robust standard deviations from the median
 * (robust = 1.4826 × MAD), repeat until stable, then take the mean.
 *
 * @param values Any values; NaN are ignored.
 * @param k Clip at k sigma (default 3).
 * @returns The mean of the values kept, their standard deviation (as astropy's
 *   sigma_clipped_stats, divided by N) and how many were kept. NaN and 0 kept when there are no
 *   finite values.
 */
export function sigmaClip(
  values: ArrayLike<number>,
  k = 3,
): { mean: number; sigma: number; kept: number } {
  let cur = new Float64Array(values.length);
  let m = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) cur[m++] = v;
  }
  const work = new Float64Array(m);
  for (let iter = 0; iter < 100 && m > 0; iter++) {
    const { med, rs } = medianSigma(cur, m, work);
    const next = new Float64Array(m);
    let kept = 0;
    for (let i = 0; i < m; i++) if (Math.abs(cur[i] - med) <= k * rs) next[kept++] = cur[i];
    if (kept === m) break;
    cur = next;
    m = kept;
  }
  if (m === 0) return { mean: Number.NaN, sigma: Number.NaN, kept: 0 };
  let sum = 0;
  for (let i = 0; i < m; i++) sum += cur[i];
  const mean = sum / m;
  let ss = 0;
  for (let i = 0; i < m; i++) ss += (cur[i] - mean) ** 2;
  return { mean, sigma: Math.sqrt(ss / m), kept: m };
}

/**
 * 3 × 3 median filter: each pixel becomes the median of itself and its 8 neighbours.
 * Neighbours off the edge or without data are left out; a pixel without data stays without data.
 */
export function median3x3(pix: Float32Array, n: number): Float32Array {
  const out = new Float32Array(pix.length);
  const buf = new Float64Array(9);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (!Number.isFinite(pix[i])) {
        out[i] = pix[i];
        continue;
      }
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= n) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= n) continue;
          const v = pix[yy * n + xx];
          if (Number.isFinite(v)) buf[m++] = v;
        }
      }
      out[i] = medianInPlace(buf, m);
    }
  }
  return out;
}

/**
 * Gaussian smoothing. Flagged pixels are left out, not blurred in: each usable pixel becomes the
 * kernel-weighted mean of the usable pixels around it (the kernel normalised over them), out to
 * 3 sigma. Flagged pixels and pixels without data keep their own value.
 *
 * @param sigma Pixels: 0.5, 1 or 2. 0 or less returns a copy.
 * @param bad n × n, 1 where flagged.
 */
export function gaussianSmooth(
  pix: Float32Array,
  n: number,
  sigma: number,
  bad?: Uint8Array,
): Float32Array {
  if (!(sigma > 0)) return pix.slice();
  const r = Math.ceil(3 * sigma);
  const kern = new Float64Array(2 * r + 1);
  for (let j = -r; j <= r; j++) kern[j + r] = Math.exp((-0.5 * j * j) / (sigma * sigma));
  // Normalised convolution: smooth (value × weight) and the weight, then divide. The Gaussian is
  // separable, so each is two one-dimensional passes.
  const size = n * n;
  const val = new Float64Array(size);
  const wt = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const ok = Number.isFinite(pix[i]) && !bad?.[i];
    wt[i] = ok ? 1 : 0;
    val[i] = ok ? pix[i] : 0;
  }
  const pass = (src: Float64Array, horizontal: boolean): Float64Array => {
    const dst = new Float64Array(size);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let j = -r; j <= r; j++) {
          const xx = horizontal ? x + j : x;
          const yy = horizontal ? y : y + j;
          if (xx < 0 || xx >= n || yy < 0 || yy >= n) continue;
          s += kern[j + r] * src[yy * n + xx];
        }
        dst[y * n + x] = s;
      }
    }
    return dst;
  };
  const num = pass(pass(val, true), false);
  const den = pass(pass(wt, true), false);
  const out = pix.slice();
  for (let i = 0; i < size; i++) if (wt[i] && den[i] > 0) out[i] = num[i] / den[i];
  return out;
}

/**
 * Background removal (SExtractor mesh): boxes a third of the picture across (4 to 16 pixels),
 * each box's sky by 3σ clipping, a 3 × 3 median of the box values, a smooth surface subtracted.
 *
 * Each box's sky is the 3-sigma-clipped mean of its usable pixels (data, not flagged). A box with
 * fewer than 3 usable pixels takes the median of the other boxes. The surface is bilinear between
 * box centres and continues in a straight line beyond the outer centres (half a box at most), so
 * a sky that slopes is removed to the edges. Flagged pixels have the surface subtracted too;
 * pixels without data stay without data. A picture with no usable pixel is returned unchanged.
 *
 * @param bad n × n, 1 where flagged.
 */
export function subtractBackground(pix: Float32Array, n: number, bad?: Uint8Array): Float32Array {
  const box = Math.min(16, Math.max(4, Math.floor(n / 3)));
  const nb = Math.ceil(n / box);
  const sky = new Float64Array(nb * nb);
  const vals = new Float64Array(box * box);
  for (let by = 0; by < nb; by++) {
    for (let bx = 0; bx < nb; bx++) {
      let m = 0;
      for (let y = by * box; y < Math.min(n, (by + 1) * box); y++) {
        for (let x = bx * box; x < Math.min(n, (bx + 1) * box); x++) {
          const i = y * n + x;
          if (Number.isFinite(pix[i]) && !bad?.[i]) vals[m++] = pix[i];
        }
      }
      sky[by * nb + bx] = m >= 3 ? sigmaClip(vals.subarray(0, m), 3).mean : Number.NaN;
    }
  }
  // Fill empty boxes with the median of the others.
  const filled = Float64Array.from(sky.filter((v) => Number.isFinite(v)));
  if (filled.length === 0) return pix.slice();
  const fill = medianInPlace(filled, filled.length);
  for (let i = 0; i < sky.length; i++) if (!Number.isFinite(sky[i])) sky[i] = fill;
  // 3 × 3 median of the box values. A neighbour off the grid is continued in a straight line
  // from the two boxes before it, so a sky that slopes keeps its slope at the edges.
  const smooth = new Float64Array(nb * nb);
  const buf = new Float64Array(9);
  const inGrid = (b: number): boolean => b >= 0 && b < nb;
  for (let by = 0; by < nb; by++) {
    for (let bx = 0; bx < nb; bx++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = by + dy;
          const xx = bx + dx;
          if (inGrid(yy) && inGrid(xx)) buf[m++] = sky[yy * nb + xx];
          else {
            const ny = inGrid(yy) ? yy : by;
            const nx = inGrid(xx) ? xx : bx;
            const fy = inGrid(yy) ? yy : by - dy;
            const fx = inGrid(xx) ? xx : bx - dx;
            if (inGrid(fy) && inGrid(fx)) buf[m++] = 2 * sky[ny * nb + nx] - sky[fy * nb + fx];
          }
        }
      }
      smooth[by * nb + bx] = medianInPlace(buf, m);
    }
  }
  // Box centres, in pixels, along one axis.
  const centre = (b: number): number => (b * box + Math.min(n, (b + 1) * box) - 1) / 2;
  // For a pixel coordinate: the lower box and the fraction towards the next one.
  const locate = (p: number): [number, number] => {
    if (nb === 1) return [0, 0];
    if (p <= centre(0)) return [0, (p - centre(0)) / (centre(1) - centre(0))];
    if (p >= centre(nb - 1))
      return [nb - 2, (p - centre(nb - 2)) / (centre(nb - 1) - centre(nb - 2))];
    let b = Math.min(nb - 2, Math.floor(p / box));
    if (p < centre(b)) b--;
    return [b, (p - centre(b)) / (centre(b + 1) - centre(b))];
  };
  const out = new Float32Array(pix.length);
  for (let y = 0; y < n; y++) {
    const [by, fy] = locate(y);
    const by1 = Math.min(by + 1, nb - 1);
    for (let x = 0; x < n; x++) {
      const [bx, fx] = locate(x);
      const bx1 = Math.min(bx + 1, nb - 1);
      const s =
        (1 - fy) * ((1 - fx) * smooth[by * nb + bx] + fx * smooth[by * nb + bx1]) +
        fy * ((1 - fx) * smooth[by1 * nb + bx] + fx * smooth[by1 * nb + bx1]);
      out[y * n + x] = pix[y * n + x] - s;
    }
  }
  return out;
}

/**
 * Combines pictures of the same grid, pixel by pixel: mean, median, or sigma clip (drop values
 * more than 3 robust sigma from the median, then the mean). Robust sigma is 1.4826 × the median
 * absolute deviation; the clip is done once. Values without data are left out; a pixel with no
 * data in any picture is NaN. The result has the length of the first picture.
 */
export function combine(pictures: readonly Float32Array[], how: CombineHow): Float32Array {
  const len = pictures[0]?.length ?? 0;
  const out = new Float32Array(len);
  const vals = new Float64Array(pictures.length);
  const work = new Float64Array(pictures.length);
  for (let i = 0; i < len; i++) {
    let m = 0;
    for (const pic of pictures) {
      const v = pic[i];
      if (Number.isFinite(v)) vals[m++] = v;
    }
    if (m === 0) {
      out[i] = Number.NaN;
    } else if (how === 'median') {
      out[i] = medianInPlace(vals, m);
    } else {
      const { med, rs } = how === 'clip' ? medianSigma(vals, m, work) : { med: 0, rs: Infinity };
      let sum = 0;
      let kept = 0;
      for (let j = 0; j < m; j++) {
        if (Math.abs(vals[j] - med) <= 3 * rs) {
          sum += vals[j];
          kept++;
        }
      }
      out[i] = sum / kept;
    }
  }
  return out;
}

/**
 * Applies the clean-up steps that are on in `p`, in their order: background, median, smoothing
 * (combining a pass happens before, in core/blink.ts). Returns a new picture.
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
  let out = p.background ? subtractBackground(pix, n, bad) : pix.slice();
  if (p.median) out = median3x3(out, n);
  if (p.smooth > 0) out = gaussianSmooth(out, n, p.smooth, bad);
  return out;
}
