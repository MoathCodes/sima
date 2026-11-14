/**
 * Finding stars that creep: positions on every exposure and a straight-line motion fit, the way
 * catalogues measure motion (docs/tools.md, "2. Positions"). Owner: lane B. Pure.
 */
import type { Det, RealFrame, RealSet } from './types.ts';
import { centroid, localSky, wcsPix2Sky, wcsSky2Pix } from './real.ts';
import { lineFit } from './stats.ts';
import { mjdToYear, offsetArcsec, offsetBy } from './astro.ts';
import { PIXEL_ARCSEC } from './instrument.ts';

/** A source whose measured motion stands out of its error. */
export interface Mover {
  /** Mean position, degrees. */
  ra: number;
  dec: number;
  /** Measured motion, mas/yr (east times cos dec, north), with 1σ errors (widened when the
   *  points scatter more than their errors allow). */
  pmra: number;
  pmdec: number;
  pmraErr: number;
  pmdecErr: number;
  /** Total motion and its error, arcsec/yr. */
  total: number;
  totalErr: number;
  /** total / totalErr. Listed as "Moved?" when at least the search threshold. */
  sigma: number;
  /** Exposures with a position. */
  n: number;
  /** The centre was saturated: never "Strong signal". */
  saturated: boolean;
  /** Decimal year of the mean position (added by lane B). */
  epoch?: number;
  /** Positions behind the fit, for the candidate's small chart (added by lane B): index into
   *  RealSet.frames, MJD, offsets from the mean position in arcsec, and their 1σ error. */
  points?: { frame: number; mjd: number; east: number; north: number; err: number }[];
}

/** Most sources measured per detector. */
export const MAX_SOURCES = 150;

/** A source to follow: a position on the sky and how bright it looked where it was found. */
interface Seed {
  ra: number;
  dec: number;
  peak: number;
}

/**
 * Sources that stand out of one exposure's noise: local maxima of usable pixels at least 5 times
 * the noise above the sky, and the centres of flagged blobs of 4 pixels or more (saturated cores,
 * which have no usable peak), brightest first, none within 3 pixels of a brighter one.
 */
export function findSources(frame: RealFrame, badMask: number, max = MAX_SOURCES): Seed[] {
  const m = frame.meta;
  const w = m.w;
  const h = m.h;
  const ok = (k: number): boolean => (frame.flags[k]! & badMask) === 0 && Number.isFinite(frame.pix[k]!);
  const all: number[] = [];
  for (let k = 0; k < w * h; k++) if (ok(k)) all.push(frame.pix[k]!);
  all.sort((a, b) => a - b);
  const sky = all.length ? all[all.length >> 1]! : 0;
  const noise = m.sigma ?? Number.NaN;
  if (!(noise > 0)) return [];
  const cands: { x: number; y: number; peak: number }[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (!ok(k)) continue;
      const v = frame.pix[k]!;
      if (v - sky < 5 * noise) continue;
      let top = true;
      for (let dy = -1; dy <= 1 && top; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const kk = k + dy * w + dx;
          if (ok(kk) && frame.pix[kk]! > v) {
            top = false;
            break;
          }
        }
      }
      if (top) cands.push({ x, y, peak: (v - sky) / noise });
    }
  }
  // Flagged blobs: saturated cores.
  const seen = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) {
    if (seen[k] || ok(k)) continue;
    const stack = [k];
    seen[k] = 1;
    let n = 0;
    let sx = 0;
    let sy = 0;
    while (stack.length) {
      const q = stack.pop()!;
      const qx = q % w;
      const qy = (q - qx) / w;
      n++;
      sx += qx;
      sy += qy;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = qx + dx;
        const ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (seen[nk] || ok(nk)) continue;
        seen[nk] = 1;
        stack.push(nk);
      }
    }
    if (n < 4 || n > 400) continue;
    const cx = sx / n;
    const cy = sy / n;
    // A blob counts as a star only when light around it rises well above the sky.
    const ring = localSky(frame, badMask, cx, cy, Math.sqrt(n / Math.PI) + 0.5, Math.sqrt(n / Math.PI) + 2.5);
    if (!((ring.sky - sky) / noise > 5)) continue;
    cands.push({ x: cx, y: cy, peak: 1e6 + n });
  }
  cands.sort((a, b) => b.peak - a.peak);
  const kept: { x: number; y: number; peak: number }[] = [];
  for (const c of cands) {
    if (kept.length >= max) break;
    if (kept.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 3)) continue;
    kept.push(c);
  }
  return kept.map((c) => {
    const s = wcsPix2Sky(m.wcs, c.x, c.y);
    return { ra: s.ra, dec: s.dec, peak: c.peak };
  });
}

/** The motion of one source from its positions on every exposure of a detector; null if fewer than
 *  three positions in two visits. */
export function measureMover(set: RealSet, frames: readonly number[], seed: Seed): Mover | null {
  const pts: { frame: number; mjd: number; t: number; ra: number; dec: number; err: number; window: number }[] = [];
  let saturated = false;
  for (const i of frames) {
    const f = set.frames[i]!;
    const p = wcsSky2Pix(f.meta.wcs, seed.ra, seed.dec);
    if (!(p.x >= 2 && p.y >= 2 && p.x <= f.meta.w - 3 && p.y <= f.meta.h - 3)) continue;
    const c = centroid(f, set.badMask, p.x, p.y);
    if (!c.seen || !(c.err! > 0)) continue;
    if (c.saturated) saturated = true;
    const s = wcsPix2Sky(f.meta.wcs, c.x, c.y);
    pts.push({
      frame: i,
      mjd: f.meta.mjd,
      t: mjdToYear(f.meta.mjd),
      ra: s.ra,
      dec: s.dec,
      err: c.err! * PIXEL_ARCSEC,
      window: f.meta.window,
    });
  }
  if (pts.length < 3 || new Set(pts.map((p) => p.window)).size < 2) return null;
  const ra0 = pts[0]!.ra;
  const dec0 = pts[0]!.dec;
  const t0 = pts.reduce((a, p) => a + p.t, 0) / pts.length;
  const off = pts.map((p) => offsetArcsec(ra0, dec0, p.ra, p.dec));
  const t = pts.map((p) => p.t - t0);
  const err = pts.map((p) => p.err);
  const fe = lineFit(t, off.map((o) => o.east), err);
  const fn = lineFit(t, off.map((o) => o.north), err);
  if (!Number.isFinite(fe.b) || !Number.isFinite(fn.b)) return null;
  const dof = fe.dof + fn.dof;
  const widen = dof > 0 ? Math.max(1, Math.sqrt((fe.chi2 + fn.chi2) / dof)) : 1;
  const eme = fe.eb * widen;
  const emn = fn.eb * widen;
  const total = Math.hypot(fe.b, fn.b);
  const totalErr = total > 0 ? Math.hypot(fe.b * eme, fn.b * emn) / total : Math.hypot(eme, emn);
  const mean = offsetBy(ra0, dec0, fe.a, fn.a);
  return {
    ra: mean.ra,
    dec: mean.dec,
    pmra: fe.b * 1000,
    pmdec: fn.b * 1000,
    pmraErr: eme * 1000,
    pmdecErr: emn * 1000,
    total,
    totalErr,
    sigma: total / totalErr,
    n: pts.length,
    saturated,
    epoch: t0,
    points: pts.map((p, k) => ({
      frame: p.frame,
      mjd: p.mjd,
      east: off[k]!.east - fe.a,
      north: off[k]!.north - fn.a,
      err: p.err,
    })),
  };
}

/** The exposures of one detector, in time order, and the one sources are found on. */
function framesOf(set: RealSet, det: Det): { frames: number[]; finder: number | null } {
  const frames = set.frames
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.meta.det === det)
    .sort((a, b) => a.f.meta.mjd - b.f.meta.mjd)
    .map(({ i }) => i);
  let finder: number | null = null;
  for (const i of frames) {
    const m = set.frames[i]!.meta;
    if (m.sigma === null) continue;
    if (finder === null || m.badFrac < set.frames[finder]!.meta.badFrac) finder = i;
  }
  return { frames, finder };
}

/**
 * The same search in steps, for a worker or for slicing on the main thread (TLS-8): yields after
 * each source. `findMovers` runs it to the end.
 */
export function* moverSteps(
  set: RealSet,
  det: Det,
  threshold: number,
): Generator<void, { movers: Mover[]; measured: number; note: string }> {
  const { frames, finder } = framesOf(set, det);
  if (finder === null || frames.length < 3) {
    return {
      movers: [],
      measured: 0,
      note: `Positions not searched in D${det}: it needs at least three exposures with a noise level.`,
    };
  }
  const seeds = findSources(set.frames[finder]!, set.badMask);
  yield;
  const all: Mover[] = [];
  for (const s of seeds) {
    const mv = measureMover(set, frames, s);
    if (mv) all.push(mv);
    yield;
  }
  // Two seeds can settle on one star: keep the better measured.
  const unique: Mover[] = [];
  for (const mv of [...all].sort((a, b) => b.n - a.n || a.totalErr - b.totalErr)) {
    if (unique.some((u) => Math.hypot(...Object.values(offsetArcsec(u.ra, u.dec, mv.ra, mv.dec))) < 1.5 * PIXEL_ARCSEC)) continue;
    unique.push(mv);
  }
  const movers = unique.filter((mv) => mv.sigma >= threshold).sort((a, b) => b.sigma - a.sigma);
  const errs = unique.map((u) => u.totalErr).sort((a, b) => a - b);
  const medErr = errs.length ? errs[errs.length >> 1]! : Number.NaN;
  const note =
    `${unique.length} sources measured on ${frames.length} exposures in D${det}; ` +
    (Number.isFinite(medErr)
      ? `a motion of about ${(threshold * medErr).toFixed(1)}″ a year (${threshold}× the typical error of ${medErr.toFixed(1)}″ a year) is the smallest it can list.`
      : 'too few positions to say what motion it could see.');
  return { movers, measured: unique.length, note };
}

/**
 * Measures every source that stands out of one exposure's noise (peak 5×, at most 150, brightest
 * first) on every exposure of a detector and fits its motion.
 *
 * Each position's error is 1.2 pixels ÷ its signal-to-noise, at least 0.05 pixels (a profile fit's
 * own error around a saturated core); a straight line against time, east and north; errors widened
 * by √(χ²/dof) when the points scatter more than their errors allow, so pointing errors, blends and
 * parallax are not taken for motion.
 *
 * @param set The decoded patch.
 * @param det Detector, 1 to 6.
 * @param threshold List a source when its motion is at least this many times its error.
 * @returns The movers; how many sources were measured; and a plain note on what was not
 *   measured and why (shown in "About <target>, noise and limits").
 */
export function findMovers(
  set: RealSet,
  det: Det,
  threshold: number,
): { movers: Mover[]; measured: number; note: string } {
  const it = moverSteps(set, det, threshold);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
