/**
 * The labelled practice simulation, part 3 of 3: simulated exposures of a practice patch on the
 * viewer's grid, with SPHEREx-like pixels, noise and colours. Owner: lane B. Pure.
 *
 * The result is a Field with `simulated: true`; every frame's id starts with `SIMULATED` and its
 * release is `simulated` (H3, O-G11).
 *
 * Each source is a round Gaussian spot (σ = 0.8 pixel, integrated over each pixel), on a small
 * leftover sky level, with Gaussian pixel noise and a handful of flagged pixels per exposure.
 */
import type { Field, Frame } from './types.ts';
import { fieldGrid, wcsSky2Pix } from './real.ts';
import { DETECTORS, PIXEL_ARCSEC } from './instrument.ts';
import { gauss, rng } from './math.ts';
import type { Rand } from './math.ts';
import type { Scenario } from './field.ts';
import { simSources, sourceAt } from './field.ts';
import { SIM_START, SIM_VISITS, SIM_WINDOWS, simSchedule } from './schedule.ts';

/** Simulated pixel noise per detector, µJy (index 0 is D1): higher in the narrow D5 and D6. */
export const SIM_NOISE: readonly number[] = Object.freeze([4, 4, 4, 5, 9, 11]);
/** Width of the simulated spot, pixels (Gaussian σ). */
export const SIM_PSF_SIGMA = 0.8;
/** Flagged pixels per simulated exposure. */
const BAD_PER_FRAME = 6;
/** Spot drawn out to this many pixels from its centre (over 5σ). */
const PSF_REACH = 4;

/**
 * A whole simulated patch, ready for the frame.
 *
 * @param scenario From core/field.ts SCENARIOS.
 */
export function simulate(scenario: Scenario): Field {
  const grid = fieldGrid(scenario.ra, scenario.dec, scenario.fov);
  const n = grid.n;
  const schedule = simSchedule({
    start: SIM_START,
    windows: SIM_WINDOWS,
    visits: SIM_VISITS,
    seed: scenario.seed,
  });
  const sources = simSources(scenario);
  const t0 = schedule.length > 0 ? schedule[0]!.mjd : SIM_START;
  const rand = rng(scenario.seed * 15485863 + 11);

  const frames: Frame[] = schedule.map((exp, i) => {
    const sigma = SIM_NOISE[exp.det - 1]!;
    const level = sigma * (0.5 + 0.25 * gauss(rand)); // sky left over after the zodiacal light
    const pix = new Float32Array(n * n);
    fillNoise(pix, rand, level, sigma);

    const keepClear: { x: number; y: number }[] = [];
    for (const src of sources) {
      const at = sourceAt(src, exp.mjd - t0);
      const p = wcsSky2Pix(grid.wcs, at.ra, at.dec);
      addSpot(pix, n, p.x, p.y, src.flux[exp.det - 1]!);
      if (src.kind !== 'star') keepClear.push(p);
    }

    // A few flagged pixels (hot, as after a particle hit), never on the mover or the planet.
    const bad = new Uint8Array(n * n);
    for (let b = 0; b < BAD_PER_FRAME; b++) {
      const x = Math.floor(rand() * n);
      const y = Math.floor(rand() * n);
      const hot = sigma * (20 + 80 * rand());
      if (keepClear.some((p) => Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 2)) continue;
      bad[y * n + x] = 1;
      pix[y * n + x] = pix[y * n + x]! + hot;
    }

    return {
      i,
      id: `SIMULATED_P${exp.window + 1}V${exp.visit + 1}_D${exp.det}`,
      det: exp.det,
      mjd: exp.mjd,
      lam: exp.lam,
      bw: exp.bw,
      window: exp.window,
      visit: exp.visit,
      release: 'simulated',
      pix,
      bad,
      sigma,
      sky: medianUsable(pix, bad),
      gain: 1,
      src: null,
    };
  });

  const noise: number[] = [];
  for (let d = 1; d <= DETECTORS; d++) {
    noise.push(frames.some((f) => f.det === d) ? SIM_NOISE[d - 1]! : Number.NaN);
  }

  return {
    ra: scenario.ra,
    dec: scenario.dec,
    fov: scenario.fov,
    n,
    scale: PIXEL_ARCSEC,
    wcs: grid.wcs,
    simulated: true,
    frames,
    windows: SIM_WINDOWS,
    monthly: false,
    noise,
    target: null,
    neighbours: [],
    releases: ['simulated'],
  };
}

/** Adds a Gaussian spot of total `flux` centred at (x0, y0), integrated over each pixel. */
function addSpot(pix: Float32Array, n: number, x0: number, y0: number, flux: number): void {
  if (!(flux > 0) || !Number.isFinite(x0) || !Number.isFinite(y0)) return;
  const xa = Math.max(0, Math.ceil(x0 - PSF_REACH));
  const xb = Math.min(n - 1, Math.floor(x0 + PSF_REACH));
  const ya = Math.max(0, Math.ceil(y0 - PSF_REACH));
  const yb = Math.min(n - 1, Math.floor(y0 + PSF_REACH));
  if (xa > xb || ya > yb) return;
  const wx: number[] = [];
  for (let x = xa; x <= xb; x++) wx.push(pixelShare(x - x0));
  for (let y = ya; y <= yb; y++) {
    const fy = flux * pixelShare(y - y0);
    for (let x = xa; x <= xb; x++) pix[y * n + x] = pix[y * n + x]! + fy * wx[x - xa]!;
  }
}

/** Share of a 1-D Gaussian (σ = SIM_PSF_SIGMA) that falls in the pixel `d` from its centre. */
function pixelShare(d: number): number {
  const s = SIM_PSF_SIGMA * Math.SQRT2;
  return 0.5 * (erf((d + 0.5) / s) - erf((d - 0.5) / s));
}

/** The error function (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-a * a));
}

/**
 * Fills `pix` with `level` plus Gaussian noise of width `sigma`. Marsaglia's polar method gives
 * two normal numbers per draw, about twice as fast as `gauss` for a whole picture.
 */
function fillNoise(pix: Float32Array, rand: Rand, level: number, sigma: number): void {
  for (let k = 0; k < pix.length; k += 2) {
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = 2 * rand() - 1;
      v = 2 * rand() - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const f = sigma * Math.sqrt((-2 * Math.log(s)) / s);
    pix[k] = level + u * f;
    if (k + 1 < pix.length) pix[k + 1] = level + v * f;
  }
}

/** Median of the pixels not flagged bad (Hoare's selection, linear time on average). */
function medianUsable(pix: Float32Array, bad: Uint8Array): number {
  const vals = new Float32Array(pix.length);
  let m = 0;
  for (let k = 0; k < pix.length; k++) if (!bad[k]) vals[m++] = pix[k]!;
  if (m === 0) return Number.NaN;
  const hi = select(vals, m, m >> 1);
  if (m % 2) return hi;
  let lo = -Infinity;
  for (let k = 0; k < m >> 1; k++) if (vals[k]! > lo) lo = vals[k]!;
  return (lo + hi) / 2;
}

/** The k-th smallest of the first m values (0-based); reorders them so smaller ones come first. */
function select(a: Float32Array, m: number, k: number): number {
  let lo = 0;
  let hi = m - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1]!;
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i]! < pivot) i++;
      while (a[j]! > pivot) j--;
      if (i <= j) {
        const t = a[i]!;
        a[i] = a[j]!;
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return a[k]!;
}
