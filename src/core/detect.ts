/**
 * The change search (Find changes tab): difference spots, pairs, linking, known-star matching,
 * vetting and ranking (docs/tools.md, "1. Difference pictures"), with the movers from
 * core/movers.ts. Owner: lane B. Pure, so it can run in a Web Worker (O-T1): `changeSteps` is the
 * search in small steps (a generator); `findChanges` runs it to the end; core/work.ts runs it in a
 * worker or in slices on the page.
 *
 * Honesty (H7): these are candidates to check. Nothing here or in the UI says "discovery".
 */
import type { Det, Field, Frame, Neighbour, RealSet, Target } from './types.ts';
import { blend } from './blink.ts';
import { combine, gaussianSmooth, subtractBackground } from './filters.ts';
import { finiteSorted, medianOfSorted, robustSigma, spotPhotometry, weightedMean } from './stats.ts';
import { atDate, blendedWith } from './catalog.ts';
import { separation } from './astro.ts';
import { nearestSaturated, targetAt, wcsPix2Sky, wcsSky2Pix } from './real.ts';
import { PIXEL_ARCSEC } from './instrument.ts';
import { moverSteps, type Mover } from './movers.ts';

/** How sure the search is, in the order the list ranks them. */
export type Verdict =
  | 'strong' // Strong signal
  | 'possible' // Possible
  | 'known' // Known: at a Gaia or CatWISE source, or the patch's target
  | 'blended' // Blended: a mover too close to a listed neighbour to separate
  | 'weak' // Weak: as expected from noise
  | 'not-confirmed' // Not confirmed: a check on the original exposures disagrees
  | 'artefact'; // Likely artefact: on one exposure only, or in a bright star's glare

/** What changed. */
export type ChangeKind = 'brighter' | 'fainter' | 'moved' | 'mover';

/** One candidate to check. */
export interface Candidate {
  /** Stable for a patch, detector and threshold (marks are kept per id). */
  id: string;
  /** 1 is listed first. */
  rank: number;
  kind: ChangeKind;
  verdict: Verdict;
  /** Position, degrees, and on the field grid (pixels). */
  ra: number;
  dec: number;
  x: number;
  y: number;
  /** Strength in noise units, or motion / error for a mover. */
  strength: number;
  /** Change of light and its 1σ error, µJy; NaN for a mover. */
  change: number;
  changeErr: number;
  /** Measured motion for a mover, mas/yr and arcsec/yr; null otherwise. */
  motion: { pmra: number; pmdec: number; total: number; totalErr: number } | null;
  /** The window where it shows, and the index (in Field.frames) of the exposure the frame jumps to. */
  window: number;
  frame: number;
  /** Windows it was seen on. */
  windows: number[];
  /** The catalogue source or target it sits on; null for an unknown spot. */
  known: { cat: 'gaia' | 'catwise' | 'target'; id: string; pmTotal: number | null } | null;
  /** In the glare of a bright star. */
  glare: boolean;
  /** Distance to a saturated star within 15 pixels on most exposures, arcsec; null when none. */
  nearSaturated: number | null;
  /** Noise spots at least this strong the search would give (Weak when 0.5 or more). */
  expectedFromNoise: number | null;
  /** The two checks on the exposures behind it, in words ("agrees", "no change seen", …). */
  checks: { eachExposure: string; fixedAperture: string };
  /** Why it was flagged, in words. */
  why: string;
  /** For a moved pair: the faint (where it was) end on the grid (added by lane B). */
  from?: { x: number; y: number } | null;
  /** For a mover: its positions, for the small chart (added by lane B). */
  path?: Mover['points'];
}

/** One run of the search. */
export interface ChangeSearch {
  det: Det;
  /** Times the noise. */
  threshold: number;
  candidates: Candidate[];
  /** Not at a known source and not in glare. */
  unexplained: number;
  /** Spots noise alone would give at this threshold. */
  expected: number;
  /** The one-line status: "20 candidates in D3 · 9 unexplained · about 13 expected from noise". */
  status: string;
  /** A line about the patch's own target: its measured motion, or why it was not measured. */
  target: string;
  /** What this search can and cannot see, in words. */
  limits: string;
  /** How long the search took and the longest time it held the thread, ms. */
  ms: number;
  longestMs: number;
}

/** Point-source width of the matched filter, pixels (Gaussian σ). */
const PSF = 1;
/** Pairs: a bright and a dark spot this close on one comparison, pixels. */
const PAIR_PX = 6;
/** Linking: spots this close on several comparisons are one candidate, pixels. */
const LINK_PX = 1.5;
/** Each half of a pair, and the floor for any spot, in noise units. */
const WEAK_HALF = 3;
/** Up to this far from a saturated star (arcsec), a spot sits in its glow (O-T2). */
const GLOW_REACH_ARCSEC = 75;
/** Most candidates listed. */
const MAX_LISTED = 100;

/** Upper tail of the standard normal distribution: P(Z > k). */
export function normalTail(k: number): number {
  // erfc by Numerical Recipes' Chebyshev fit (fractional error under 1.2e-7).
  const z = Math.abs(k) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  const erfc = k >= 0 ? r : 2 - r;
  return erfc / 2;
}

/**
 * How many spots noise alone would give: (pixels searched ÷ pixels per beam) × 2 × the Gaussian
 * tail chance at the threshold, with a beam of 4π × 2 × psf² pixels (both signs counted). Real
 * data have non-Gaussian noise, so the true number is higher.
 *
 * @param pixels Pixels searched (summed over every comparison).
 * @param threshold Times the noise.
 * @param psf Point-source sigma, pixels (default 1).
 */
export function falseAlarms(pixels: number, threshold: number, psf = 1): number {
  if (!(pixels > 0) || !Number.isFinite(threshold)) return Number.NaN;
  const beam = 4 * Math.PI * 2 * psf * psf;
  return (pixels / beam) * 2 * normalTail(threshold);
}

/** "about 13", "about 0.4", "fewer than 0.1". */
export function expectedWords(v: number): string {
  if (!Number.isFinite(v)) return 'noise not estimated';
  if (v < 0.1) return 'fewer than 0.1 expected from noise';
  const s = v < 10 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v));
  return `about ${s} expected from noise`;
}

/** One survey pass (or month) as the search sees it. */
interface DatePic {
  window: number;
  frames: Frame[];
  /** Combined, sky-matched and background-subtracted. */
  pic: Float32Array;
  /** The background that was taken off, above its usual level (glare), µJy per pixel. */
  glare: Float32Array;
  /** Background surface subtracted, µJy per pixel. */
  bg: Float32Array;
  /** Pixel noise of this date's picture (robust), µJy. */
  noise: number;
}

/** One spot on one comparison. */
interface Spot {
  cmp: number;
  window: number;
  x: number;
  y: number;
  /** Signed strength in noise units. */
  s: number;
  change: number;
  changeErr: number;
  /** A moved pair: the other end. */
  pair: { x: number; y: number; s: number } | null;
  glare: number;
}

/** A comparison: this date against a reference. */
interface Comparison {
  window: number;
  diff: Float32Array;
  /** The reference picture (for the bright-star noise term). */
  ref: Float32Array;
  /** Words: "against the median of the other dates", "against the first date". */
  against: string;
  /** Pixel noise of the difference, µJy. */
  noise: number;
}

const D2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;

/** Light in a circle of 2 pixels on a picture, µJy, with its count of pixels. */
function circle(pix: Float32Array, n: number, x: number, y: number, mask?: Uint8Array): { sum: number; n: number } {
  let sum = 0;
  let k = 0;
  for (let yy = Math.ceil(y - 2); yy <= Math.floor(y + 2); yy++) {
    for (let xx = Math.ceil(x - 2); xx <= Math.floor(x + 2); xx++) {
      if (xx < 0 || yy < 0 || xx >= n || yy >= n || D2(xx, yy, x, y) > 4) continue;
      const i = yy * n + xx;
      const v = pix[i]!;
      if (!Number.isFinite(v) || mask?.[i]) continue;
      sum += v;
      k++;
    }
  }
  return { sum, n: k };
}

/** The saturated pixels of one detector on the field grid (union over its exposures), and blobs. */
function saturation(
  field: Field,
  set: RealSet | null,
  det: Det,
): { mask: Uint8Array; blobs: { x: number; y: number; r: number }[] } {
  const n = field.n;
  const mask = new Uint8Array(n * n);
  if (set) {
    const sat = ((1 << 1) | (1 << 15)) >>> 0; // OVERFLOW, NONLINEAR (Explanatory Supplement table 16)
    for (const f of set.frames) {
      const m = f.meta;
      if (m.det !== det) continue;
      for (let k = 0; k < m.w * m.h; k++) {
        if ((f.flags[k]! & sat) === 0) continue;
        const ex = k % m.w;
        const ey = (k - ex) / m.w;
        const s = wcsPix2Sky(m.wcs, ex, ey);
        const g = wcsSky2Pix(field.wcs, s.ra, s.dec);
        const gx = Math.round(g.x);
        const gy = Math.round(g.y);
        if (gx >= 0 && gy >= 0 && gx < n && gy < n) mask[gy * n + gx] = 1;
      }
    }
  }
  const blobs: { x: number; y: number; r: number }[] = [];
  const seen = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) {
    if (!mask[k] || seen[k]) continue;
    const stack = [k];
    seen[k] = 1;
    let c = 0;
    let sx = 0;
    let sy = 0;
    while (stack.length) {
      const q = stack.pop()!;
      const qx = q % n;
      const qy = (q - qx) / n;
      c++;
      sx += qx;
      sy += qy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx;
          const ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const nk = ny * n + nx;
          if (!mask[nk] || seen[nk]) continue;
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    blobs.push({ x: sx / c, y: sy / c, r: Math.sqrt(c / Math.PI) });
  }
  return { mask, blobs };
}

/** Local extrema of a strength map at or beyond `floor` (positive maxima and negative minima). */
function extrema(S: Float32Array, n: number, floor: number): { x: number; y: number; s: number }[] {
  const out: { x: number; y: number; s: number }[] = [];
  for (let y = 2; y < n - 2; y++) {
    for (let x = 2; x < n - 2; x++) {
      const v = S[y * n + x]!;
      if (!Number.isFinite(v) || Math.abs(v) < floor) continue;
      let top = true;
      for (let dy = -1; dy <= 1 && top; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const w = S[(y + dy) * n + x + dx]!;
          if (Number.isFinite(w) && (v > 0 ? w > v : w < v)) {
            top = false;
            break;
          }
        }
      }
      if (top) out.push({ x, y, s: v });
    }
  }
  return out;
}

/** The known source a position sits on, if any: the target first, then the nearest neighbour. */
function knownAt(
  field: Field,
  ra: number,
  dec: number,
  mjd: number,
): { cat: 'gaia' | 'catwise' | 'target'; id: string; pmTotal: number | null; sep: number; nb: Neighbour | null } | null {
  const reachOf = (mag: number): number =>
    PIXEL_ARCSEC * (Number.isFinite(mag) && mag < 12 ? Math.min(10, 2 + 2 * (12 - mag)) : 2);
  const t = field.target;
  if (t) {
    const own = field.neighbours.filter((nb) => nb.target).map((nb) => nb.mag);
    const mag = own.length ? Math.min(...own) : Number.NaN;
    const p = targetAt(t, mjd);
    const sep = separation(p.ra, p.dec, ra, dec) * 3600;
    if (sep <= reachOf(mag)) {
      return { cat: 'target', id: t.name, pmTotal: Math.hypot(t.pmra, t.pmdec) / 1000, sep, nb: null };
    }
  }
  let best: { cat: 'gaia' | 'catwise'; id: string; pmTotal: number | null; sep: number; nb: Neighbour } | null = null;
  for (const nb of field.neighbours) {
    if (nb.target) continue;
    const p = atDate(nb, mjd);
    const sep = separation(p.ra, p.dec, ra, dec) * 3600;
    if (sep > reachOf(nb.mag)) continue;
    if (!best || sep < best.sep) {
      const pm = Math.hypot(nb.pmra, nb.pmdec);
      best = { cat: nb.cat, id: nb.id, pmTotal: pm > 0 ? pm / 1000 : null, sep, nb };
    }
  }
  return best;
}

const roundErr = (v: number, e: number): string => {
  const d = e >= 1 ? 1 : Math.max(1, 1 - Math.floor(Math.log10(e)));
  return `${v.toFixed(d)} ± ${e.toFixed(d)}`;
};

/**
 * The change search in steps (a generator): yields after each date, each comparison and each
 * source measured for motion, so a worker or the page can share the thread (TLS-8). Returns the
 * search with `ms` and `longestMs` set to 0; the runner fills them.
 *
 * @see findChanges for the parameters.
 */
export function* changeSteps(
  field: Field,
  set: RealSet | null,
  det: Det,
  threshold: number,
): Generator<void, ChangeSearch> {
  const k = Math.min(10, Math.max(3, threshold));
  const n = field.n;
  const size = n * n;
  const frames = field.frames.filter((f) => f.det === det && f.sigma > 0);
  const windows = [...new Set(frames.map((f) => f.window))].sort((a, b) => a - b);
  const empty = (status: string): ChangeSearch => ({
    det,
    threshold: k,
    candidates: [],
    unexplained: 0,
    expected: Number.NaN,
    status,
    target: '',
    limits: '',
    ms: 0,
    longestMs: 0,
  });
  if (windows.length < 2) {
    return empty(`Not searched in D${det}: it needs exposures on at least two dates, and there ${windows.length === 1 ? 'is one' : 'are none'}.`);
  }
  const sat = saturation(field, set, det);
  yield;

  // 1. One picture per date.
  const dates: DatePic[] = [];
  const bad = new Uint8Array(size);
  for (const w of windows) {
    const fs = frames.filter((f) => f.window === w);
    const g = {
      key: `w${w}`,
      letter: '',
      window: w,
      visit: null,
      det,
      frames: fs.map((f) => f.i),
      mjd: 0,
      mjd0: 0,
      mjd1: 0,
      lam: 0,
    };
    const raw = blend(field, g, 'clip', true);
    for (let i = 0; i < size; i++) {
      if (fs.every((f) => f.bad[i]) || !Number.isFinite(raw[i]!) || sat.mask[i]) bad[i] = 1;
    }
    const pic = subtractBackground(raw, n, bad);
    const bgSurface = new Float32Array(size);
    for (let i = 0; i < size; i++) bgSurface[i] = raw[i]! - pic[i]!;
    const typical = medianOfSorted(finiteSorted(bgSurface));
    const glare = new Float32Array(size);
    for (let i = 0; i < size; i++) glare[i] = Math.max(0, bgSurface[i]! - typical);
    dates.push({ window: w, frames: fs, pic, glare, bg: bgSurface, noise: 0 });
    yield;
  }
  for (const d of dates) {
    d.noise = robustSigma(d.pic.filter((_, i) => !bad[i]));
    for (let i = 0; i < size; i++) if (!bad[i] && d.pic[i]! < -10 * d.noise) bad[i] = 1;
  }
  yield;

  // 2–4. References and differences.
  const comps: Comparison[] = [];
  const all = dates.length >= 5 ? combine(dates.map((d) => d.pic), 'median') : null;
  for (const d of dates) {
    yield;
    const ref = all ?? combine(dates.filter((o) => o !== d).map((o) => o.pic), 'median');
    const diff = new Float32Array(size);
    for (let i = 0; i < size; i++) diff[i] = bad[i] ? Number.NaN : d.pic[i]! - ref[i]!;
    comps.push({
      window: d.window,
      diff,
      ref,
      against: all ? 'the median of all dates' : 'the median of the other dates',
      noise: robustSigma(diff),
    });
  }
  if (dates.length >= 3) {
    const first = dates[0]!;
    const last = dates[dates.length - 1]!;
    const diff = new Float32Array(size);
    for (let i = 0; i < size; i++) diff[i] = bad[i] ? Number.NaN : last.pic[i]! - first.pic[i]!;
    comps.push({ window: last.window, diff, ref: first.pic, against: 'the first date', noise: robustSigma(diff) });
  }
  yield;

  // 5–6. Matched filter, spots and pairs.
  let searched = 0;
  const spots: Spot[] = [];
  for (let ci = 0; ci < comps.length; ci++) {
    if (ci > 0) yield;
    const c = comps[ci]!;
    const F = gaussianSmooth(c.diff, n, PSF, bad);
    const sigmaF = robustSigma(F.filter((_, i) => !bad[i]));
    const refS = gaussianSmooth(c.ref, n, PSF, bad);
    const date = dates.find((d) => d.window === c.window)!;
    const glareS = gaussianSmooth(date.glare, n, PSF, bad);
    const S = new Float32Array(size).fill(Number.NaN);
    for (let i = 0; i < size; i++) {
      if (bad[i] || !Number.isFinite(F[i]!)) continue;
      const extra = 0.2 * Math.max(0, refS[i]!) + glareS[i]!;
      const noise = Math.sqrt(sigmaF * sigmaF + extra * extra);
      S[i] = F[i]! / noise;
      searched++;
    }
    const ex = extrema(S, n, WEAK_HALF);
    const pos = ex.filter((e) => e.s > 0);
    const neg = ex.filter((e) => e.s < 0);
    const used = new Set<object>();
    const measure = (x: number, y: number): { change: number; err: number } => {
      const ap = circle(c.diff, n, x, y);
      return { change: ap.sum, err: c.noise * Math.sqrt(Math.max(1, ap.n)) };
    };
    // Pairs first: the strongest bright end with its strongest dark partner.
    for (const p of [...pos].sort((a, b) => b.s - a.s)) {
      let best: (typeof neg)[number] | null = null;
      for (const q of neg) {
        if (used.has(q) || D2(p.x, p.y, q.x, q.y) > PAIR_PX * PAIR_PX || D2(p.x, p.y, q.x, q.y) < 1) continue;
        if (!best || q.s < best.s) best = q;
      }
      if (!best || (p.s - best.s) / Math.SQRT2 < k) continue;
      used.add(p);
      used.add(best);
      const m = measure(p.x, p.y);
      spots.push({
        cmp: ci,
        window: c.window,
        x: p.x,
        y: p.y,
        s: (p.s - best.s) / Math.SQRT2,
        change: m.change,
        changeErr: m.err,
        pair: { x: best.x, y: best.y, s: best.s },
        glare: glareS[p.y * n + p.x]!,
      });
    }
    for (const e of ex) {
      if (used.has(e) || Math.abs(e.s) < k) continue;
      const m = measure(e.x, e.y);
      spots.push({
        cmp: ci,
        window: c.window,
        x: e.x,
        y: e.y,
        s: e.s,
        change: m.change,
        changeErr: m.err,
        pair: null,
        glare: glareS[e.y * n + e.x]!,
      });
    }
  }
  yield;
  const expected = falseAlarms(searched, k, PSF);

  // 7. Linking.
  const groups: Spot[][] = [];
  for (const s of [...spots].sort((a, b) => Math.abs(b.s) - Math.abs(a.s))) {
    const g = groups.find((gr) => gr.some((o) => D2(o.x, o.y, s.x, s.y) <= LINK_PX * LINK_PX || (o.pair && D2(o.pair.x, o.pair.y, s.x, s.y) <= LINK_PX * LINK_PX)));
    if (g) g.push(s);
    else groups.push([s]);
  }

  // Movers, from positions on the original exposures.
  let movers: Mover[] = [];
  let moverNote = 'Positions were not measured: there are no original exposures (simulated patch).';
  if (set) {
    const it = moverSteps(set, det, k);
    for (;;) {
      const r = it.next();
      if (r.done) {
        movers = r.value.movers;
        moverNote = r.value.note;
        break;
      }
      yield;
    }
  }

  const sigmaOf = (w: number): number => dates.find((d) => d.window === w)?.noise ?? Number.NaN;
  const firstFrameOf = (w: number): number => frames.find((f) => f.window === w)?.i ?? frames[0]!.i;
  const midMjd = (w: number): number => {
    const fs = frames.filter((f) => f.window === w);
    return fs.reduce((a, f) => a + f.mjd, 0) / Math.max(1, fs.length);
  };
  const nearSat = (ra: number, dec: number): number | null => {
    if (!set) return null;
    const ds: number[] = [];
    let total = 0;
    for (const f of set.frames) {
      if (f.meta.det !== det) continue;
      total++;
      const p = wcsSky2Pix(f.meta.wcs, ra, dec);
      const d = nearestSaturated(f, set.badMask, p.x, p.y, 15);
      if (d !== null) ds.push(d);
    }
    if (!total || ds.length * 2 <= total) return null;
    ds.sort((a, b) => a - b);
    return ds[ds.length >> 1]! * PIXEL_ARCSEC;
  };
  const inSatZone = (x: number, y: number): boolean =>
    sat.blobs.some((b) => Math.hypot(b.x - x, b.y - y) <= b.r + 3 + 1.5 * b.r);

  const cands: Candidate[] = [];
  // Difference candidates.
  for (const g of groups) {
    const top = g[0]!;
    const sky = wcsPix2Sky(field.wcs, top.x, top.y);
    const wins = [...new Set(g.map((s) => s.window))].sort((a, b) => a - b);
    const pair = top.pair;
    const kind: ChangeKind = pair ? 'moved' : top.s > 0 ? 'brighter' : 'fainter';
    const known = knownAt(field, sky.ra, sky.dec, midMjd(top.window));
    const glare = top.glare > 10 * sigmaOf(top.window) || inSatZone(top.x, top.y);
    const ns = nearSat(sky.ra, sky.dec);
    // Check 1: each exposure on its own.
    const date = dates.find((d) => d.window === top.window)!;
    const comp = comps[top.cmp]!;
    let eachExposure = 'one exposure on this date: cannot be checked this way';
    let oneOnly = false;
    if (date.frames.length >= 2) {
      const vals = date.frames.map((f) => {
        const pic = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          pic[i] = f.bad[i] ? Number.NaN : (f.pix[i]! - f.sky) * f.gain - date.bg[i]! - comp.ref[i]!;
        }
        const ap = circle(pic, n, top.x, top.y);
        return { v: ap.sum * Math.sign(top.s), e: f.sigma * f.gain * Math.sqrt(Math.max(1, ap.n)), ok: ap.n > 0 };
      }).filter((v) => v.ok);
      if (vals.length >= 2) {
        const sig = vals.map((v) => v.v / v.e);
        const hi = sig.indexOf(Math.max(...sig));
        const rest = vals.filter((_, i) => i !== hi);
        const restMean = weightedMean(rest.map((v) => v.v), rest.map((v) => v.e));
        const stand = (vals[hi]!.v - restMean.mean) / Math.hypot(vals[hi]!.e, restMean.err);
        oneOnly = sig[hi]! >= k && rest.every((v) => v.v / v.e < 3) && stand >= k;
        const seenOn = sig.filter((s2) => s2 >= 3).length;
        eachExposure = oneOnly
          ? `on 1 of ${vals.length} exposures only`
          : `seen on ${seenOn} of ${vals.length} exposures at 3 errors or more`;
      }
    }
    // Check 2: a fixed aperture on the original exposures.
    let fixedAperture = 'not measured: no original exposures (simulated patch)';
    let fixedSigma = Number.NaN;
    let noChange = false;
    if (set) {
      const pts = spotPhotometry(set, sky.ra, sky.dec, det);
      const mine = pts.filter((p) => p.window === top.window && !p.flagged);
      const other = pts.filter((p) => p.window !== top.window && !p.flagged);
      if (!mine.length) {
        fixedAperture = 'not measured: every exposure of this date has a flagged pixel in the circle';
      } else if (!other.length) {
        fixedAperture = 'not measured: no other date without a flagged pixel in the circle';
      } else {
        const a = weightedMean(mine.map((p) => p.flux), mine.map((p) => p.err));
        const b = weightedMean(other.map((p) => p.flux), other.map((p) => p.err));
        const d = a.mean - b.mean;
        const e = Math.hypot(a.err, b.err);
        fixedSigma = (d * Math.sign(top.s)) / e;
        if (fixedSigma >= 3) fixedAperture = `agrees: ${roundErr(d, e)} µJy (${fixedSigma.toFixed(1)} errors)`;
        else if (Math.abs(top.change) >= 5 * e) {
          noChange = true;
          fixedAperture = `no change seen: ${roundErr(d, e)} µJy, although the search's change would be ${(Math.abs(top.change) / e).toFixed(0)} of these errors`;
        } else fixedAperture = `unclear: ${roundErr(d, e)} µJy (${fixedSigma.toFixed(1)} errors)`;
      }
    }
    const lone = !pair && !known && g.length === 1;
    const exp = lone ? falseAlarms(searched, Math.abs(top.s), PSF) : null;
    let verdict: Verdict = Math.abs(top.s) >= Math.max(10, 2 * k) ? 'strong' : 'possible';
    const whys: string[] = [];
    whys.push(
      `${kind === 'moved' ? 'A bright and a dark spot side by side' : kind === 'brighter' ? 'Brighter' : 'Fainter'} on ${wins.length} date${wins.length === 1 ? '' : 's'}, ${Math.abs(top.s).toFixed(1)}× the noise, against ${comp.against}.`,
    );
    if (known) {
      verdict = 'known';
      whys.push(
        known.cat === 'target'
          ? `At the patch's own target, ${known.id}.`
          : `At ${known.id} (${known.cat === 'gaia' ? 'Gaia DR3' : 'CatWISE2020'}), ${known.sep.toFixed(1)}″ away.`,
      );
    }
    if (lone && exp !== null && exp >= 0.5 && !(fixedSigma >= 5)) {
      verdict = 'weak';
      whys.push(`Weak: as expected from noise. Noise alone would give about ${exp < 10 ? exp.toFixed(1) : Math.round(exp)} spots this strong here.`);
    }
    if (ns !== null && ns <= GLOW_REACH_ARCSEC && !glare && (verdict === 'strong' || verdict === 'possible')) {
      verdict = 'weak';
      whys.push(`Weak: in a bright star's glow, ${Math.round(ns)}″ from a saturated star.`);
    }
    if (noChange) {
      verdict = 'not-confirmed';
      whys.push('Not confirmed: a fixed circle on the original exposures sees no change.');
    }
    if (oneOnly) {
      verdict = 'artefact';
      whys.push('Likely artefact: on one exposure of its date only (a cosmic ray or hot pixel, or something that lasted less than a day).');
    } else if (glare) {
      verdict = 'artefact';
      whys.push("Likely artefact: in a bright star's glare, where subtracting the star never leaves exactly zero.");
    }
    whys.push('Not a discovery: a candidate to check.');
    cands.push({
      id: `D${det}-${kind}-${Math.round(sky.ra * 1e4)}-${Math.round(sky.dec * 1e4)}`,
      rank: 0,
      kind,
      verdict,
      ra: sky.ra,
      dec: sky.dec,
      x: top.x,
      y: top.y,
      strength: Math.abs(top.s),
      change: top.change,
      changeErr: top.changeErr,
      motion: null,
      window: top.window,
      frame: firstFrameOf(top.window),
      windows: wins,
      known: known ? { cat: known.cat, id: known.id, pmTotal: known.pmTotal } : null,
      glare,
      nearSaturated: ns,
      expectedFromNoise: exp,
      checks: { eachExposure, fixedAperture },
      why: whys.join(' '),
      from: pair ? { x: pair.x, y: pair.y } : null,
    });
    yield;
  }

  // Movers.
  for (const mv of movers) {
    const g = wcsSky2Pix(field.wcs, mv.ra, mv.dec);
    if (!(g.x >= -0.5 && g.y >= -0.5 && g.x <= n - 0.5 && g.y <= n - 0.5)) continue;
    const mjdMid = (frames[0]!.mjd + frames[frames.length - 1]!.mjd) / 2;
    const known = knownAt(field, mv.ra, mv.dec, mjdMid);
    const whys = [`Its position creeps ${roundErr(mv.total, mv.totalErr)}″ a year over ${mv.n} exposures, ${mv.sigma.toFixed(1)}× its error.`];
    let verdict: Verdict = mv.saturated ? 'possible' : mv.sigma >= Math.max(10, 2 * k) ? 'strong' : 'possible';
    let blendedNb: Neighbour | null = null;
    if (known) {
      const cat = known.cat === 'target' ? field.target! : null;
      const catPm = cat ? Math.hypot(cat.pmra, cat.pmdec) / 1000 : known.nb ? Math.hypot(known.nb.pmra, known.nb.pmdec) / 1000 : 0;
      if (known.cat === 'target' && field.target) {
        blendedNb = frames.every((f) => blendedWith(field.target!, field.neighbours, f.mjd) !== null)
          ? blendedWith(field.target, field.neighbours, frames[0]!.mjd)
          : null;
      }
      if (blendedNb) {
        verdict = 'blended';
        whys.push(`Blended: ${blendedNb.id} is too close to separate on every exposure, so the motion mixes two stars.`);
      } else if (Math.abs(mv.total - catPm) > 3 * mv.totalErr) {
        verdict = 'not-confirmed';
        whys.push(
          `Not confirmed: it sits on ${known.id}, which the catalogue says moves ${catPm.toFixed(2)}″ a year. A difference of more than 3 errors points to a blend, a pointing error or its colour shifting its centre, not to the star.`,
        );
      } else {
        verdict = 'known';
        whys.push(`Known: ${known.id}, catalogue motion ${catPm.toFixed(2)}″ a year. It is not new.`);
      }
    }
    if (mv.saturated) whys.push('Its centre is saturated, so the position comes from a profile fitted around the core.');
    whys.push('Not a discovery: a candidate to check.');
    // A difference candidate on the same star is folded into the mover.
    const dup = cands.findIndex((c) => c.kind !== 'mover' && Math.hypot(c.x - g.x, c.y - g.y) <= 3);
    const wins = dup >= 0 ? cands[dup]!.windows : [...new Set(frames.map((f) => f.window))];
    if (dup >= 0) cands.splice(dup, 1);
    cands.push({
      id: `D${det}-mover-${Math.round(mv.ra * 1e4)}-${Math.round(mv.dec * 1e4)}`,
      rank: 0,
      kind: 'mover',
      verdict,
      ra: mv.ra,
      dec: mv.dec,
      x: g.x,
      y: g.y,
      strength: mv.sigma,
      change: Number.NaN,
      changeErr: Number.NaN,
      motion: { pmra: mv.pmra, pmdec: mv.pmdec, total: mv.total, totalErr: mv.totalErr },
      window: frames[0]!.window,
      frame: frames[0]!.i,
      windows: wins,
      known: known ? { cat: known.cat, id: known.id, pmTotal: known.pmTotal } : null,
      glare: false,
      nearSaturated: null,
      expectedFromNoise: null,
      checks: { eachExposure: 'a measured mover: not checked this way', fixedAperture: 'a measured mover: not checked this way' },
      why: whys.join(' '),
      from: null,
      path: mv.points ?? [],
    });
  }

  // Ranking.
  const order: Record<Verdict, number> = { strong: 0, possible: 0, known: 0, blended: 0, weak: 1, 'not-confirmed': 2, artefact: 3 };
  const score = (c: Candidate): number =>
    Math.min(c.strength, 50) *
    (1 + 0.25 * (c.windows.length - 1)) *
    (c.kind === 'moved' || c.kind === 'mover' ? 1.3 : 1) *
    (c.known ? 0.5 : 1) *
    (c.windows.length === 1 && c.kind !== 'moved' && c.kind !== 'mover' ? 0.9 : 1);
  cands.sort((a, b) => order[a.verdict] - order[b.verdict] || score(b) - score(a));
  const listed = cands.slice(0, MAX_LISTED);
  listed.forEach((c, i) => (c.rank = i + 1));
  const unexplained = listed.filter((c) => !c.known && !c.glare && c.verdict !== 'artefact').length;
  const status = `${listed.length} candidate${listed.length === 1 ? '' : 's'} in D${det} · ${unexplained} unexplained · ${expectedWords(expected)}`;

  // The patch's own target.
  let targetLine = '';
  const t: Target | null = field.target;
  if (t) {
    const mine = listed.find((c) => c.kind === 'mover' && c.known?.cat === 'target');
    if (mine && mine.motion) {
      targetLine = `${t.name}: moves ${roundErr(mine.motion.total, mine.motion.totalErr)}″ a year by its positions in D${det} (catalogue ${(Math.hypot(t.pmra, t.pmdec) / 1000).toFixed(2)}).`;
    } else if (set) {
      const fr = frames[0]!;
      const p = targetAt(t, fr.mjd);
      const sr = set.frames[fr.src ?? 0];
      const pm = Math.hypot(t.pmra, t.pmdec) / 1000;
      if (sr) {
        const q = wcsSky2Pix(sr.meta.wcs, p.ra, p.dec);
        const d = nearestSaturated(sr, set.badMask, q.x, q.y, 2);
        targetLine =
          d !== null
            ? `${t.name}: its centre is saturated in D${det}; its motion was not listed at ${k}× its error.`
            : pm * ((frames[frames.length - 1]!.mjd - frames[0]!.mjd) / 365.25) < 1.5 * PIXEL_ARCSEC && pm > 0
              ? `${t.name}: it moves ${pm.toFixed(2)}″ a year (catalogue), under 1.5 pixels over these dates, and its motion was not listed at ${k}× its error.`
              : `${t.name}: not listed in D${det}. It is too faint on one exposure here, or its motion is under ${k}× its error.`;
      }
    }
  }
  const limits =
    `Pictures: a jump of about 1 pixel (${PIXEL_ARCSEC}″) between dates, or a change of about ${k}× the noise of one date's picture. ` +
    `Positions: ${moverNote} ` +
    'It does not check asteroids, does not fit parallax, and does not know about stars missing from the catalogues. Variable stars give real but expected changes.';
  return {
    det,
    threshold: k,
    candidates: listed,
    unexplained,
    expected,
    status,
    target: targetLine,
    limits,
    ms: 0,
    longestMs: 0,
  };
}

/**
 * Runs the change search on one detector, start to end, on the calling thread. On the page, use
 * core/work.ts instead (a worker, or slices of about 20 ms), so the page never holds for more
 * than 100 ms (TLS-8).
 *
 * @param field The frames on the viewer's grid.
 * @param set The original exposures (for the fixed-aperture checks and the movers); null for a
 *   simulated field.
 * @param det Detector, 1 to 6.
 * @param threshold Times the noise, 3 to 10 (PicSettings.threshold).
 */
export function findChanges(
  field: Field,
  set: RealSet | null,
  det: Det,
  threshold: number,
): ChangeSearch {
  const t0 = performance.now();
  const it = changeSteps(field, set, det, threshold);
  for (;;) {
    const r = it.next();
    const now = performance.now();
    if (r.done) {
      const ms = now - t0;
      return { ...r.value, ms, longestMs: ms };
    }
  }
}
