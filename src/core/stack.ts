/**
 * Stacking along a catalogue motion: shift each exposure so a mover stays put, then combine, so
 * something too faint for any single picture adds up (WISE 0855−0714 in SPEC 7.3). Owner: lane B.
 * Pure.
 *
 * SPEC 7.1.9: when the object moved about one pixel, a simple aperture cannot tell "along the
 * motion" from "fixed". So every stack comes with two controls, and the UI always shows them.
 *
 * Method. Every frame of the detector is sky-subtracted and brightness-matched (its `gain`),
 * flagged pixels left out, then shifted (bilinear) so the catalogue position on its own date lands
 * where the catalogue puts the object at the frames' mean date. The shifted frames are combined
 * pixel by pixel (mean, median or sigma clip) into the pictures shown. The controls are the same
 * frames not shifted, and shifted along the opposite motion.
 *
 * Strength (`snr`) is forced photometry, not a circle on the stacked picture: on every frame, the
 * object at its place for that stack (moving, still, or moving the opposite way) and every listed
 * Gaia or CatWISE neighbour within 5 pixels at that date are fitted together as point sources (a
 * round Gaussian of the detector's measured width) on a flat sky, by linear least squares over the
 * usable pixels within 4 pixels. The object's light on each frame then gets a weighted straight
 * line in wavelength (each frame sees its own wavelength, and a cold object brightens steeply
 * across one detector); the light is the line at the frames' mean wavelength, and its error is
 * widened when the frames scatter about the line more than their errors allow. So a neighbour a
 * pixel away (WISE 0855−0714 passes 5 to 12″ from a Gaia star of G 16.3) is not counted as the
 * object's light. Limit: two sources much closer than one pixel cannot be told apart; their light
 * is shared out with large errors, which the strength then reflects.
 */
import type { CatalogueTrack, Det, Field, Frame, Neighbour, RealSet } from './types.ts';
import type { CombineHow } from './picture.ts';
import { combine } from './filters.ts';
import { robustSigma } from './stats.ts';
import { mjdToYear, propagate, separation } from './astro.ts';
import { frameUjy, invertMatrix, localSky, wcsSky2Pix } from './real.ts';
import { atDate } from './catalog.ts';
import { lineFit, median, weightedMean } from './stats.ts';

/** One stacked picture with its measured strength at the target. */
export interface StackPicture {
  /** What it is, in plain words, e.g. "Along the catalogue motion". */
  label: string;
  /** n × n µJy per pixel, screen order. */
  pix: Float32Array;
  /** Signal-to-noise at the target's position; NaN when not measured. */
  snr: number;
}

/** A stack and its two controls. */
export interface StackResult {
  det: Det;
  /** Frames combined. */
  frames: number;
  how: CombineHow;
  /** Shifted along the motion. */
  along: StackPicture;
  /** The two controls, e.g. not shifted, and shifted along the opposite motion. */
  controls: [StackPicture, StackPicture];
  /** What can and cannot be concluded, in words. */
  note: string;
  /** Where the object is in the stacked pictures, field pixels (added by lane B). */
  x?: number;
  y?: number;
  /** Decimal year the stack is aligned to: the frames' mean date (added by lane B). */
  epoch?: number;
  /** How far the catalogue motion carries the object between the first and last frame, pixels. */
  travel?: number;
  /** The forced photometry behind `along.snr`: light in µJy and its error (added by lane B). */
  flux?: number;
  fluxErr?: number;
}

/** A frame shifted by (dx, dy) pixels: out(x, y) = in(x + dx, y + dy), bilinear, NaN-aware. */
export function shiftPicture(f: Frame, n: number, dx: number, dy: number): Float32Array {
  const out = new Float32Array(n * n).fill(Number.NaN);
  const sky = Number.isFinite(f.sky) ? f.sky : 0;
  const gain = Number.isFinite(f.gain) ? f.gain : 1;
  for (let y = 0; y < n; y++) {
    const sy = y + dy;
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < n; x++) {
      const sx = x + dx;
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      let sw = 0;
      let sv = 0;
      for (let j = 0; j < 4; j++) {
        const xx = x0 + (j & 1);
        const yy = y0 + (j >> 1);
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const k = yy * n + xx;
        if (f.bad[k]) continue;
        const v = f.pix[k]!;
        if (!Number.isFinite(v)) continue;
        const w = (j & 1 ? fx : 1 - fx) * (j >> 1 ? fy : 1 - fy);
        sw += w;
        sv += w * (v - sky) * gain;
      }
      // Need most of the weight from usable pixels, or the value leans on one corner.
      if (sw >= 0.5) out[y * n + x] = sv / sw;
    }
  }
  return out;
}

/** The shifts of one stack, per frame: field pixels, from the frame's date to the mean date. */
export function stackShifts(
  field: Field,
  frames: readonly Frame[],
  track: CatalogueTrack,
): { x: number; y: number; epoch: number; shifts: { dx: number; dy: number }[] } {
  const years = frames.map((f) => mjdToYear(f.mjd));
  const epoch = years.reduce((a, b) => a + b, 0) / Math.max(1, years.length);
  const ref = propagate(track.ra, track.dec, track.pmra, track.pmdec, track.ep, epoch);
  const p = wcsSky2Pix(field.wcs, ref.ra, ref.dec);
  const shifts = years.map((yr) => {
    const at = propagate(track.ra, track.dec, track.pmra, track.pmdec, track.ep, yr);
    const q = wcsSky2Pix(field.wcs, at.ra, at.dec);
    return { dx: q.x - p.x, dy: q.y - p.y };
  });
  return { x: p.x, y: p.y, epoch, shifts };
}

/** A point source of unit total light, round Gaussian of width `s`, sampled at a pixel centre. */
const psf = (dx: number, dy: number, s: number): number =>
  Math.exp(-(dx * dx + dy * dy) / (2 * s * s)) / (2 * Math.PI * s * s);

/** A picture for measuring the point-source width: light above the sky (NaN where unusable). */
interface WidthImage {
  w: number;
  h: number;
  value: (k: number) => number;
  noise: number;
}

/**
 * The median Gaussian width (σ, pixels) that best fits up to 40 bright (over 30× the noise),
 * isolated, unflagged stars on the pictures: sky, light and width fitted over a 5 × 5 box, the
 * width searched from 0.4 to 2.5 pixels. 0.9 pixels when no star qualifies.
 */
function widthOf(images: readonly WidthImage[]): number {
  const widths: number[] = [];
  for (const im of images) {
    if (!(im.noise > 0) || widths.length >= 40) continue;
    for (let y = 4; y < im.h - 4 && widths.length < 40; y++) {
      for (let x = 4; x < im.w - 4; x++) {
        const v = im.value(y * im.w + x);
        if (!(v > 30 * im.noise)) continue;
        let peak = true;
        let clean = true;
        for (let dy = -4; dy <= 4 && clean; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            if (!dx && !dy) continue;
            const w = im.value((y + dy) * im.w + x + dx);
            if (!Number.isFinite(w)) {
              if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) clean = false;
              continue;
            }
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && w > v) peak = false;
            if ((Math.abs(dx) > 2 || Math.abs(dy) > 2) && w > 0.2 * v) clean = false;
          }
        }
        if (!peak || !clean) continue;
        let best = Infinity;
        let bestS = Number.NaN;
        for (let s = 0.4; s <= 2.5; s += 0.02) {
          let a11 = 0;
          let a12 = 0;
          let a22 = 0;
          let b1 = 0;
          let b2 = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const g = psf(dx, dy, s);
              const w = im.value((y + dy) * im.w + x + dx);
              a11 += 1;
              a12 += g;
              a22 += g * g;
              b1 += w;
              b2 += g * w;
            }
          }
          const D = a11 * a22 - a12 * a12;
          const sky = (a22 * b1 - a12 * b2) / D;
          const amp = (a11 * b2 - a12 * b1) / D;
          let chi = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              chi += (im.value((y + dy) * im.w + x + dx) - sky - amp * psf(dx, dy, s)) ** 2;
            }
          }
          if (chi < best) {
            best = chi;
            bestS = s;
          }
        }
        if (bestS > 0.41 && bestS < 2.49) widths.push(bestS);
      }
    }
  }
  if (!widths.length) return 0.9;
  widths.sort((a, b) => a - b);
  return widths[widths.length >> 1]!;
}

/** The detector's point-source width on the field grid, pixels (Gaussian σ). See `widthOf`. */
export function psfWidth(field: Field, det: Det): number {
  return widthOf(
    field.frames
      .filter((f) => f.det === det)
      .map((f) => ({
        w: field.n,
        h: field.n,
        value: (k: number) => (f.bad[k] ? Number.NaN : f.pix[k]! - f.sky),
        noise: f.sigma,
      })),
  );
}

/** The detector's point-source width on its original exposures, pixels (Gaussian σ). */
export function psfWidthReal(set: RealSet, det: Det): number {
  return widthOf(
    set.frames
      .filter((f) => f.meta.det === det)
      .map((f) => {
        const ok = (k: number): boolean =>
          (f.flags[k]! & set.badMask) === 0 && Number.isFinite(f.pix[k]!);
        const sky = median(f.pix.filter((_, k) => ok(k)));
        return {
          w: f.meta.w,
          h: f.meta.h,
          value: (k: number) => (ok(k) ? f.pix[k]! - sky : Number.NaN),
          noise: f.meta.sigma ?? Number.NaN,
        };
      }),
  );
}

/** Forced photometry of the object over the frames of one stack. */
export interface ForcedResult {
  /** Light of the object at the frames' mean wavelength, µJy, its error, and the two divided. */
  flux: number;
  err: number;
  snr: number;
  /** Frames fitted. */
  n: number;
  /** The errors were multiplied by this because the frames scatter (1 = not widened). */
  widenedBy: number;
  /** Listed neighbours fitted alongside, by name. */
  neighbours: string[];
  /** Original exposures (no resampling) or the viewer's grid. */
  on: 'exposures' | 'grid';
}

/** One picture to fit: its pixels and how to place a sky position on it. */
interface FitImage {
  w: number;
  h: number;
  /** Light above the sky, µJy per pixel, NaN where unusable. */
  value: (k: number) => number;
  /** Pixel noise, µJy. */
  noise: number;
  lam: number;
  mjd: number;
  toPix: (ra: number, dec: number) => { x: number; y: number };
}

/**
 * The object fitted with its neighbours on one picture (linear least squares over the usable
 * pixels within 4 pixels: flat sky plus one round Gaussian per source). Null when too few pixels.
 */
function fitOne(
  img: FitImage,
  obj: { ra: number; dec: number },
  neighbours: readonly Neighbour[],
  width: number,
): { flux: number; err: number; names: string[] } | null {
  const R = 4;
  const t = img.toPix(obj.ra, obj.dec);
  const kept: { id: string; x: number; y: number; ra: number; dec: number }[] = [];
  for (const nb of neighbours) {
    if (nb.target) continue;
    const p = atDate(nb, img.mjd);
    if (kept.some((q) => separation(q.ra, q.dec, p.ra, p.dec) * 3600 < 2)) continue;
    const q = img.toPix(p.ra, p.dec);
    const d = Math.hypot(q.x - t.x, q.y - t.y);
    if (d > 5 || d < 0.25) continue;
    kept.push({ id: nb.id, x: q.x, y: q.y, ra: p.ra, dec: p.dec });
  }
  const srcs = [t, ...kept];
  const m = srcs.length + 1;
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b = new Array<number>(m).fill(0);
  let count = 0;
  for (let yy = Math.ceil(t.y - R); yy <= Math.floor(t.y + R); yy++) {
    for (let xx = Math.ceil(t.x - R); xx <= Math.floor(t.x + R); xx++) {
      if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
      if ((xx - t.x) ** 2 + (yy - t.y) ** 2 > R * R) continue;
      const v = img.value(yy * img.w + xx);
      if (!Number.isFinite(v)) continue;
      const r = [1, ...srcs.map((q) => psf(xx - q.x, yy - q.y, width))];
      for (let a = 0; a < m; a++) {
        b[a]! += r[a]! * v;
        for (let c = 0; c < m; c++) A[a]![c]! += r[a]! * r[c]!;
      }
      count++;
    }
  }
  if (count < m + 5) return null;
  const cov = invertMatrix(A);
  if (!cov) return null;
  const flux = cov[1]!.reduce((acc, v, c) => acc + v * b[c]!, 0);
  const err = Math.sqrt(cov[1]![1]!) * img.noise;
  if (!Number.isFinite(flux) || !(err > 0)) return null;
  return { flux, err, names: kept.map((q) => q.id) };
}

/** Combines per-frame light into one value: a straight line in wavelength, widened by scatter. */
function combineForced(
  fits: { flux: number; err: number; lam: number }[],
  names: Set<string>,
  on: 'exposures' | 'grid',
): ForcedResult {
  const fluxes = fits.map((f) => f.flux);
  const errs = fits.map((f) => f.err);
  const lams = fits.map((f) => f.lam);
  // Each frame sees its own wavelength (SPEC 7.1.1), and a cold object's light can rise steeply
  // across one detector. So a straight line in wavelength is fitted, and the light is its value
  // at the frames' mean wavelength; only scatter about that line widens the error.
  const lam0 = lams.reduce((a, b) => a + b, 0) / Math.max(1, lams.length);
  const useLine = fluxes.length >= 5 && Math.max(...lams) - Math.min(...lams) > 0;
  const lf = useLine ? lineFit(lams.map((l) => l - lam0), fluxes, errs) : null;
  const line = lf !== null && Number.isFinite(lf.a);
  const wm = weightedMean(fluxes, errs);
  const mean = line ? lf.a : wm.mean;
  const formal = line ? lf.ea : wm.err;
  let chi2 = 0;
  fluxes.forEach((v, i) => {
    const model = line ? lf.a + lf.b * (lams[i]! - lam0) : wm.mean;
    chi2 += ((v - model) / errs[i]!) ** 2;
  });
  const dof = fluxes.length - (line ? 2 : 1);
  const widenedBy = dof > 0 && chi2 / dof > 1 ? Math.sqrt(chi2 / dof) : 1;
  const err = formal * widenedBy;
  return { flux: mean, err, snr: mean / err, n: fluxes.length, widenedBy, neighbours: [...names], on };
}

/** Where the object is on a date for one stack: along (1), still (0) or opposite (−1). */
function placeFor(track: CatalogueTrack, epoch: number, year: number, sign: number): { ra: number; dec: number } {
  return propagate(track.ra, track.dec, track.pmra, track.pmdec, track.ep, epoch + sign * (year - epoch));
}

/**
 * Forced photometry of a (possibly moving) object on every frame of a stack, with its listed
 * neighbours fitted alongside (see the module note). On the viewer's grid.
 *
 * @param sign 1 along the motion, 0 still at the mean-date place, −1 along the opposite motion.
 */
export function forcedStack(
  field: Field,
  det: Det,
  track: CatalogueTrack,
  sign: number,
  width = psfWidth(field, det),
): ForcedResult {
  const frames = field.frames.filter((f) => f.det === det && f.sigma > 0);
  const n = field.n;
  const years = frames.map((f) => mjdToYear(f.mjd));
  const epoch = years.reduce((a, b) => a + b, 0) / Math.max(1, years.length);
  const names = new Set<string>();
  const fits: { flux: number; err: number; lam: number }[] = [];
  frames.forEach((f, k) => {
    const img: FitImage = {
      w: n,
      h: n,
      value: (i) => (f.bad[i] ? Number.NaN : (f.pix[i]! - f.sky) * f.gain),
      noise: f.sigma * f.gain,
      lam: f.lam,
      mjd: f.mjd,
      toPix: (ra, dec) => wcsSky2Pix(field.wcs, ra, dec),
    };
    const r = fitOne(img, placeFor(track, epoch, years[k]!, sign), field.neighbours, width);
    if (!r) return;
    fits.push({ flux: r.flux, err: r.err, lam: f.lam });
    r.names.forEach((x) => names.add(x));
  });
  return combineForced(fits, names, 'grid');
}

/**
 * The same forced photometry on the original exposures (no resampling, so the pixel noise is
 * independent as the fit assumes, and the point source is as sharp as recorded). Pixels are
 * MJy/sr times each exposure's pixel solid angle (µJy); the sky is the median of a ring 6 to 12
 * pixels out; the noise is the file's own `sigma`.
 *
 * @param width Gaussian σ of a point source in exposure pixels.
 */
export function forcedStackReal(
  set: RealSet,
  det: Det,
  track: CatalogueTrack,
  sign: number,
  width: number,
): ForcedResult {
  const frames = set.frames.filter((f) => f.meta.det === det && f.meta.sigma !== null);
  const years = frames.map((f) => mjdToYear(f.meta.mjd));
  const epoch = years.reduce((a, b) => a + b, 0) / Math.max(1, years.length);
  const names = new Set<string>();
  const fits: { flux: number; err: number; lam: number }[] = [];
  const neighbours = set.data.neighbours ?? [];
  frames.forEach((f, k) => {
    const m = f.meta;
    const obj = placeFor(track, epoch, years[k]!, sign);
    const p = wcsSky2Pix(m.wcs, obj.ra, obj.dec);
    const sky = localSky(f, set.badMask, p.x, p.y);
    const conv = frameUjy(m);
    const img: FitImage = {
      w: m.w,
      h: m.h,
      value: (i) =>
        (f.flags[i]! & set.badMask) !== 0 || !Number.isFinite(f.pix[i]!)
          ? Number.NaN
          : (f.pix[i]! - sky.sky) * conv,
      noise: m.sigma! * conv,
      lam: m.lam,
      mjd: m.mjd,
      toPix: (ra, dec) => wcsSky2Pix(m.wcs, ra, dec),
    };
    const r = fitOne(img, obj, neighbours, width);
    if (!r) return;
    fits.push({ flux: r.flux, err: r.err, lam: m.lam });
    r.names.forEach((x) => names.add(x));
  });
  return combineForced(fits, names, 'exposures');
}

/**
 * Stacks every frame of one detector along a catalogue motion, with the two controls.
 *
 * @param field The frames on the viewer's grid.
 * @param det Detector, 1 to 6.
 * @param track Catalogue position (degrees at decimal year ep) and motion (mas/yr).
 * @param how How the shifted frames are combined (PicSettings.combineBy).
 * @param set The original exposures, when there are any (optional, added by lane B). With it the
 *   strengths are measured on the original exposures (`forcedStackReal`), which is what SPEC 7.3
 *   quotes; without it, on the viewer's grid (`forcedStack`), where resampling blurs the point
 *   source and correlates the noise. Pass it for real data.
 */
export function stackAlong(
  field: Field,
  det: Det,
  track: CatalogueTrack,
  how: CombineHow,
  set?: RealSet | null,
): StackResult {
  const frames = field.frames.filter((f) => f.det === det && f.sigma > 0);
  const n = field.n;
  const { x, y, epoch, shifts } = stackShifts(field, frames, track);
  const real = set && set.frames.some((f) => f.meta.det === det) ? set : null;
  const width = !frames.length ? 0.9 : real ? psfWidthReal(real, det) : psfWidth(field, det);
  const forced: ForcedResult[] = [];
  const run = (label: string, sign: number): StackPicture => {
    if (!frames.length) return { label, pix: new Float32Array(n * n).fill(Number.NaN), snr: Number.NaN };
    const pics = frames.map((f, k) => shiftPicture(f, n, sign * shifts[k]!.dx, sign * shifts[k]!.dy));
    const pix = combine(pics, how);
    const fr = real ? forcedStackReal(real, det, track, sign, width) : forcedStack(field, det, track, sign, width);
    forced.push(fr);
    return { label, pix, snr: fr.snr };
  };
  const along = run('Along the catalogue motion', 1);
  const still = run('Not shifted', 0);
  const opposite = run('Along the opposite motion', -1);
  const travel = shifts.length
    ? Math.max(...shifts.map((s) => Math.hypot(s.dx, s.dy))) * 2
    : 0;
  const fmt = (v: number): string => (Number.isFinite(v) ? `${v.toFixed(1)}×` : 'not measured');
  let note: string;
  if (!frames.length) {
    note = `No exposure in D${det} to stack.`;
  } else if (!(along.snr >= 5)) {
    note = `Not seen: the stack along the motion is ${fmt(along.snr)} the noise at the object's place, under 5×. This says nothing about whether it is there.`;
  } else if (along.snr >= still.snr + 2 && along.snr >= opposite.snr + 2) {
    note = `Seen at ${fmt(along.snr)} the noise along the motion; the controls give ${fmt(still.snr)} (not shifted) and ${fmt(opposite.snr)} (opposite motion). Something at this place moves with the catalogue motion.`;
  } else {
    note = `Seen at ${fmt(along.snr)} the noise along the motion, but the controls give ${fmt(still.snr)} (not shifted) and ${fmt(opposite.snr)} (opposite motion). It moved about ${travel.toFixed(1)} pixels over these dates, too little for this circle to tell a mover from a still source (SPEC 7.1.9).`;
  }
  const names = forced[0]?.neighbours ?? [];
  if (names.length) {
    note += ` Listed neighbours fitted alongside, so their light is not counted: ${names.join(', ')}.`;
  }
  return {
    det,
    frames: frames.length,
    how,
    along,
    controls: [still, opposite],
    note,
    x,
    y,
    epoch,
    travel,
    flux: forced[0]?.flux ?? Number.NaN,
    fluxErr: forced[0]?.err ?? Number.NaN,
  };
}
