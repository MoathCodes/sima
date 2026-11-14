/**
 * Fits: proper motion (and parallax), brightness curves, folded curves. Owner: lane B. Pure.
 * docs/data-format.md ("How the viewer uses the frames") and docs/tools.md give the methods.
 *
 * Honesty (H5): when something cannot be measured, the result says "not measured" and why. It
 * never falls back to a model or catalogue value.
 */
import type { Det, Measurement, MotionFit, Target } from './types.ts';
import type { Chi2 } from './stats.ts';
import { lineFit, visitTest, weightedMean } from './stats.ts';
import { mjdToYear, offsetArcsec, offsetBy, parallaxFactors } from './astro.ts';
import { invertMatrix } from './real.ts';

/** One exposure on a brightness curve, in magnitudes against its detector's own average. */
export interface CurvePoint {
  /** Index into the measurements given. */
  m: number;
  mjd: number;
  window: number;
  /** Change in magnitude (positive is fainter) and its 1σ error. */
  dmag: number;
  err: number;
  /** From the outer glow of a saturated core, not the aperture. */
  glow: boolean;
}

/** One detector's brightness curve (MSR-3, Brightness tab). */
export interface DetectorCurve {
  det: Det;
  points: CurvePoint[];
  /** Weighted mean of each visit, with widened errors. */
  visits: { window: number; mjd: number; dmag: number; err: number }[];
  /** "Did it change?" between visits; null with fewer than two visits. */
  test: Chi2 | null;
  /** Visit errors were multiplied by this (1 = not widened). */
  widenedBy: number;
  /** Weighted straight line through the visits, mag/yr, drawn only above 3σ; null when none. */
  trend: { slope: number; err: number; drawn: boolean } | null;
  /** False when the scatter within a visit is over 0.2 mag: the curve is not shown. */
  shown: boolean;
  /** Anything the panel must say about this curve, in words; null when nothing. */
  note: string | null;
}

/** A weighted linear least-squares fit: parameters, their covariance, χ² and degrees of freedom. */
export function linearFit(
  rows: readonly number[][],
  y: readonly number[],
  err: readonly number[],
): { p: number[]; cov: number[][]; chi2: number; dof: number } | null {
  const k = rows[0]?.length ?? 0;
  if (rows.length <= k || k === 0) return null;
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  rows.forEach((r, i) => {
    const w = 1 / (err[i]! * err[i]!);
    for (let a = 0; a < k; a++) {
      b[a]! += w * r[a]! * y[i]!;
      for (let c = 0; c < k; c++) A[a]![c]! += w * r[a]! * r[c]!;
    }
  });
  const cov = invertMatrix(A);
  if (!cov) return null;
  const p = cov.map((row) => row.reduce((acc, v, c) => acc + v * b[c]!, 0));
  let chi2 = 0;
  rows.forEach((r, i) => {
    const m = r.reduce((acc, v, c) => acc + v * p[c]!, 0);
    chi2 += ((y[i]! - m) / err[i]!) ** 2;
  });
  return { p, cov, chi2, dof: rows.length - k };
}

/** One position on the sky as the motion fit uses it. */
interface Pos {
  /** Index into the measurements. */
  k: number;
  t: number;
  east: number;
  north: number;
  err: number;
  window: number;
  mjd: number;
  cd?: [number, number, number, number];
}

/** Straight-line motion through positions: east and north fitted together, errors widened. */
function straight(ps: readonly Pos[]): {
  e0: number;
  n0: number;
  me: number;
  mn: number;
  eme: number;
  emn: number;
  res: number[];
} | null {
  const t = ps.map((p) => p.t);
  const err = ps.map((p) => p.err);
  const fe = lineFit(t, ps.map((p) => p.east), err);
  const fn = lineFit(t, ps.map((p) => p.north), err);
  if (!Number.isFinite(fe.b) || !Number.isFinite(fn.b)) return null;
  const dof = fe.dof + fn.dof;
  const widen = dof > 0 ? Math.max(1, Math.sqrt((fe.chi2 + fn.chi2) / dof)) : 1;
  const res = ps.map((p) => Math.hypot(p.east - fe.a - fe.b * p.t, p.north - fn.a - fn.b * p.t));
  return { e0: fe.a, n0: fn.a, me: fe.b, mn: fn.b, eme: fe.eb * widen, emn: fn.eb * widen, res };
}

/**
 * Position, motion and parallax fitted together (5 terms), optionally with a fixed shift on the
 * detector (2 more terms: the same pixel offset on every exposure, turned to the sky by each
 * exposure's own CD matrix). Returns the parallax in arcsec and its formal error, widened.
 */
function plxSolve(
  ps: readonly Pos[],
  ra: number,
  dec: number,
  shift: boolean,
): { plx: number; err: number; me: number; mn: number } | null {
  const rows: number[][] = [];
  const y: number[] = [];
  const err: number[] = [];
  for (const p of ps) {
    const f = parallaxFactors(p.mjd, ra, dec);
    const cd = p.cd;
    if (shift && !cd) return null;
    const se = shift ? [cd![0] * 3600, cd![1] * 3600] : [];
    const sn = shift ? [cd![2] * 3600, cd![3] * 3600] : [];
    rows.push([1, 0, p.t, 0, f.east, ...se]);
    y.push(p.east);
    err.push(p.err);
    rows.push([0, 1, 0, p.t, f.north, ...sn]);
    y.push(p.north);
    err.push(p.err);
  }
  const fit = linearFit(rows, y, err);
  if (!fit) return null;
  const widen = fit.dof > 0 ? Math.max(1, Math.sqrt(fit.chi2 / fit.dof)) : 1;
  return {
    plx: fit.p[4]!,
    err: Math.sqrt(fit.cov[4]![4]!) * widen,
    me: fit.p[2]!,
    mn: fit.p[3]!,
  };
}

const notMeasured = (reason: string, of: number): MotionFit => ({
  ok: false,
  reason,
  pmra: Number.NaN,
  pmdec: Number.NaN,
  pmraErr: Number.NaN,
  pmdecErr: Number.NaN,
  total: Number.NaN,
  totalErr: Number.NaN,
  pa: Number.NaN,
  ra: Number.NaN,
  dec: Number.NaN,
  ep: Number.NaN,
  used: 0,
  of,
  visits: 0,
  outliers: [],
  stability: Number.NaN,
  parallax: null,
  catalogue: null,
  matches: null,
});

/**
 * Proper motion from the measured positions: a straight line through every position where the
 * target was seen, refitted once without points more than 3 times the median distance (and at
 * least 1″) off. Needs at least three positions in at least two visits. With three or more
 * visits, parallax is fitted too, but shown only when trustworthy (SPEC 7.1.8).
 *
 * Errors: each position's own error (core/real.ts `centroid`), widened by √(χ²/dof) when the
 * points scatter more than their errors allow, so pointing errors and blends are not taken for
 * motion. `stability` is the largest change of the total motion when one visit is left out.
 *
 * Parallax: the error is how much the parallax moves when each visit in turn is left out
 * (exposures in one visit share their errors). It is shown only when it is more than 3 times that
 * error and a fixed shift on the detector cannot mimic it (adding such a shift to the fit at most
 * doubles the parallax's formal error). Otherwise the straight-line motion is shown and `why`
 * says why.
 *
 * @param ms Measurements from core/real.ts `measureTarget`.
 * @param target The target, for the catalogue comparison; null for a spot with no target.
 */
export function fitMotion(ms: readonly Measurement[], target: Target | null): MotionFit {
  const seen = ms
    .map((m, k) => ({ m, k }))
    .filter(
      ({ m }) =>
        m.seen && !m.skipped && Number.isFinite(m.ra) && Number.isFinite(m.dec) && m.posErr > 0,
    );
  const windows = new Set(seen.map(({ m }) => m.window));
  if (seen.length < 3 || windows.size < 2) {
    const why =
      seen.length < 3
        ? `Not measured: the target was seen on ${seen.length} exposure${seen.length === 1 ? '' : 's'}, and a motion needs at least 3.`
        : 'Not measured: every position is from one visit, and a motion needs at least two.';
    return notMeasured(why, ms.length);
  }
  const ra0 = seen[0]!.m.ra;
  const dec0 = seen[0]!.m.dec;
  const years = seen.map(({ m }) => mjdToYear(m.mjd));
  const ep = years.reduce((a, b) => a + b, 0) / years.length;
  const all: Pos[] = seen.map(({ m, k }, i) => {
    const o = offsetArcsec(ra0, dec0, m.ra, m.dec);
    const p: Pos = { k, t: years[i]! - ep, east: o.east, north: o.north, err: m.posErr, window: m.window, mjd: m.mjd };
    if (m.cd) p.cd = m.cd;
    return p;
  });
  const first = straight(all);
  if (!first) return notMeasured('Not measured: the positions do not span enough time.', ms.length);
  const sorted = [...first.res].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1]!;
  const cut = Math.max(3 * med, 1);
  const keep = all.filter((_, i) => first.res[i]! <= cut);
  const outliers = all.filter((_, i) => first.res[i]! > cut).map((p) => p.k);
  const keptWindows = new Set(keep.map((p) => p.window));
  if (keep.length < 3 || keptWindows.size < 2) {
    return notMeasured('Not measured: too few positions agree with each other.', ms.length);
  }
  const fit = straight(keep)!;
  const total = Math.hypot(fit.me, fit.mn);
  const totalErr = total > 0 ? Math.hypot(fit.me * fit.eme, fit.mn * fit.emn) / total : Math.hypot(fit.eme, fit.emn);
  // Leave one visit out.
  let stability = 0;
  for (const w of keptWindows) {
    const rest = keep.filter((p) => p.window !== w);
    if (new Set(rest.map((p) => p.window)).size < 2 || rest.length < 3) continue;
    const f = straight(rest);
    if (f) stability = Math.max(stability, Math.abs(Math.hypot(f.me, f.mn) - total));
  }
  // Parallax, with three or more visits.
  let parallax: MotionFit['parallax'] = null;
  let me = fit.me;
  let mn = fit.mn;
  let eme = fit.eme;
  let emn = fit.emn;
  if (keptWindows.size >= 3) {
    const full = plxSolve(keep, ra0, dec0, false);
    if (full) {
      const jack: number[] = [];
      for (const w of keptWindows) {
        const f = plxSolve(
          keep.filter((p) => p.window !== w),
          ra0,
          dec0,
          false,
        );
        if (f) jack.push(f.plx);
      }
      const V = jack.length;
      const mean = jack.reduce((a, b) => a + b, 0) / Math.max(1, V);
      const jackErr = V >= 3 ? Math.sqrt(((V - 1) / V) * jack.reduce((a, b) => a + (b - mean) ** 2, 0)) : Number.NaN;
      const err = Math.max(jackErr, full.err);
      const shifted = plxSolve(keep, ra0, dec0, true);
      const mimic = shifted ? shifted.err > 2 * full.err : true;
      const big = Number.isFinite(err) && Math.abs(full.plx) > 3 * err;
      const shown = big && !mimic;
      const why = !Number.isFinite(jackErr)
        ? 'Fitted, but there are too few visits to say how sure it is, so only the catalogue value is shown.'
        : !big
          ? `Fitted as ${(full.plx * 1000).toFixed(0)} ± ${(err * 1000).toFixed(0)} mas: not clear of its own error, so only the catalogue value is shown.`
          : mimic
            ? 'Fitted, but a fixed shift on the detector would look the same (SPHEREx sees the star from opposite sides six months apart), so only the catalogue value is shown.'
            : 'Measured from the positions of every visit.';
      parallax = { value: full.plx * 1000, err: err * 1000, shown, why };
      if (shown) {
        me = full.me;
        mn = full.mn;
      }
    }
  } else {
    parallax = null;
  }
  const t = target;
  const catTotal = t ? Math.hypot(t.pmra, t.pmdec) / 1000 : Number.NaN;
  const finalTotal = Math.hypot(me, mn);
  const finalErr = finalTotal > 0 ? Math.hypot(me * eme, mn * emn) / finalTotal : totalErr;
  const pos = offsetBy(ra0, dec0, fit.e0, fit.n0);
  return {
    ok: true,
    reason: null,
    pmra: me * 1000,
    pmdec: mn * 1000,
    pmraErr: eme * 1000,
    pmdecErr: emn * 1000,
    total: finalTotal,
    totalErr: finalErr,
    pa: ((Math.atan2(me, mn) * 180) / Math.PI + 360) % 360,
    ra: pos.ra,
    dec: pos.dec,
    ep,
    used: keep.length,
    of: ms.length,
    visits: keptWindows.size,
    outliers,
    stability,
    parallax,
    catalogue: t ? { total: catTotal, pmra: t.pmra, pmdec: t.pmdec, source: t.values } : null,
    matches: t ? Math.abs(finalTotal - catTotal) <= 3 * finalErr : null,
  };
}

/** Largest scatter within a visit for a curve to be shown, magnitudes. */
const MAX_VISIT_SCATTER = 0.2;

/**
 * Brightness changes per detector (`realCurve`): each detector compared only with itself, a
 * straight line in wavelength plus one level per visit fitted and the line taken out; the
 * aperture, or the outer glow in every exposure when the core is saturated in any of them.
 *
 * Magnitudes are against each detector's own average (positive is fainter). Aperture errors are
 * 1.0857 × flux error ÷ flux. The outer glow has no error of its own, so there each point's error
 * is the detector's scatter within a visit (the note says so). Visit averages come from
 * stats.ts `visitTest` (widened when the exposures of one visit scatter more than their errors).
 * A detector whose scatter within a visit is over 0.2 mag is returned with `shown: false`.
 * A star with a catalogue period gets no straight trend: its note points to the Folded tab.
 */
export function realCurve(ms: readonly Measurement[], target: Target | null): DetectorCurve[] {
  const out: DetectorCurve[] = [];
  for (let det = 1; det <= 6; det++) {
    const mine = ms.map((m, k) => ({ m, k })).filter(({ m }) => m.det === det && !m.skipped);
    if (!mine.length) continue;
    const glow = mine.some(({ m }) => m.saturated);
    const pts = mine
      .map(({ m, k }) => {
        if (glow) {
          const g = m.glow;
          return g !== null && g > 0 ? { k, m, mag: -2.5 * Math.log10(g), err: Number.NaN } : null;
        }
        if (m.lower || !(m.flux > 0) || !(m.fluxErr > 0) || m.flux < 3 * m.fluxErr) return null;
        return { k, m, mag: -2.5 * Math.log10(m.flux), err: (1.0857 * m.fluxErr) / m.flux };
      })
      .filter((p): p is { k: number; m: Measurement; mag: number; err: number } => p !== null);
    const wins = [...new Set(pts.map((p) => p.m.window))].sort((a, b) => a - b);
    if (pts.length < 2 || pts.length <= wins.length) continue;
    // A straight line in wavelength plus one level per visit.
    const lam0 = pts.reduce((a, p) => a + p.m.lam, 0) / pts.length;
    const rows = pts.map((p) => [p.m.lam - lam0, ...wins.map((w) => (w === p.m.window ? 1 : 0))]);
    const w0 = pts.map((p) => (glow ? 1 : p.err));
    const fit = linearFit(rows, pts.map((p) => p.mag), w0);
    if (!fit) continue;
    const slope = fit.p[0]!;
    const resid = pts.map((p, i) => p.mag - rows[i]!.reduce((a, v, c) => a + v * fit.p[c]!, 0));
    const scatter = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / Math.max(1, fit.dof));
    const errs = pts.map((p) => (glow ? scatter : p.err));
    const flat = pts.map((p) => p.mag - slope * (p.m.lam - lam0));
    const avg = weightedMean(flat, errs).mean;
    const points: CurvePoint[] = pts.map((p, i) => ({
      m: p.k,
      mjd: p.m.mjd,
      window: p.m.window,
      dmag: flat[i]! - avg,
      err: errs[i]!,
      glow,
    }));
    const vt = visitTest(
      points.map((p) => ({ window: p.window, value: p.dmag, err: p.err })),
      { fitted: 1 },
    );
    const visits = vt.visits.map((v) => {
      const inVisit = points.filter((p) => p.window === v.window);
      const mjd = inVisit.reduce((a, p) => a + p.mjd, 0) / inVisit.length;
      return { window: v.window, mjd, dmag: v.value, err: v.err };
    });
    const periodic = target?.period != null;
    let trend: DetectorCurve['trend'] = null;
    if (!periodic && visits.length >= 3) {
      const lf = lineFit(
        visits.map((v) => mjdToYear(v.mjd)),
        visits.map((v) => v.dmag),
        visits.map((v) => v.err),
      );
      if (Number.isFinite(lf.b)) trend = { slope: lf.b, err: lf.eb, drawn: Math.abs(lf.b) > 3 * lf.eb };
    }
    const notes: string[] = [];
    if (glow) {
      notes.push(
        `From the outer glow of a saturated core: it has no error of its own, so each point's error is this detector's scatter within a visit (${scatter.toFixed(2)} mag).`,
      );
    }
    if (vt.widenedBy > 1.0001) {
      notes.push(
        `The exposures of one visit scatter more than their error bars, so the visit averages' errors were widened ${vt.widenedBy.toFixed(1)} times.`,
      );
    }
    if (periodic) notes.push('A pulsating star: see its cycle under Folded rather than a straight trend.');
    const shown = scatter <= MAX_VISIT_SCATTER;
    if (!shown) {
      notes.push(
        `Not shown: the exposures of one visit scatter by ${scatter.toFixed(2)} mag, more than the 0.2 mag a change could be told from.`,
      );
    }
    out.push({
      det,
      points,
      visits,
      test: visits.length >= 2 ? vt.test : null,
      widenedBy: vt.widenedBy,
      trend,
      shown,
      note: notes.length ? notes.join(' ') : null,
    });
  }
  return out;
}

/** Exposures whose aperture had a flagged pixel, as lower limits for the spectrum. */
export function lowerLimits(ms: readonly Measurement[]): Measurement[] {
  return ms.filter((m) => m.lower && !m.skipped && Number.isFinite(m.flux));
}

/**
 * Folds a curve on a period (the Folded tab, for periodic stars).
 *
 * @param period Days.
 * @param t0 MJD of phase 0 (default: the first point).
 * @returns Phase 0 to 1 for each point, in the order given.
 */
export function foldCurve(
  points: readonly { mjd: number; dmag: number; err: number }[],
  period: number,
  t0?: number,
): { phase: number; dmag: number; err: number }[] {
  if (!(period > 0) || !points.length) return [];
  const zero = t0 ?? points[0]!.mjd;
  return points.map((p) => {
    const ph = ((p.mjd - zero) / period) % 1;
    return { phase: ph < 0 ? ph + 1 : ph, dmag: p.dmag, err: p.err };
  });
}
