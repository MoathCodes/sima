/**
 * The sandbox (O-V7, SPEC-v1 F12): how bright a pretend planet would be in each SPHEREx detector,
 * how far it would shift in a year, and whether one exposure, or a stack of them, would show it
 * against the noise measured in the patch. The honest answer to "could SPHEREx see Planet X?".
 * Pure. The page side is shell/sandbox.ts.
 *
 * Everything here is a MODEL (H4), labelled so on screen, and the pretend planet is never added
 * to any picture, measurement, list, chart or export (H3; tests/sandbox.test.ts checks it).
 *
 * The model, kept simple on purpose:
 * - Where it is seen from: SPHEREx looks about 90° from the Sun, so the planet at `r` AU from the
 *   Sun is `Δ = √(r² − 1)` AU from the telescope, at phase angle `α = asin(1/r)`.
 * - Reflected sunlight: the Sun as a blackbody of 5772 K and radius 695,700 km (IAU 2015 nominal
 *   values), its light at 1 AU diluted by `1/r²`, times the geometric albedo `p` (the
 *   "reflectivity"), times the planet's disc `(R/Δ)²`, times a Lambert phase law
 *   `(sin α + (π − α) cos α)/π` (almost 1 this far out).
 * - Its own glow: a blackbody sphere at one temperature, `F = π B(T) (R/Δ)²`. The temperature from
 *   sunlight is `278.6 K × (1 − A)^¼ / √r`, with the Bond albedo `A` taken equal to `p` (a simple
 *   choice); heat of its own (`T_own`, as giant planets have) adds as `T⁴ = T_sun⁴ + T_own⁴`.
 * - Each detector is read at the middle of its band (core/instrument.ts `BAND_EDGES`), not
 *   averaged over it.
 * - Point-source noise of one exposure: the patch's measured pixel noise times `√(4π s²)`, the
 *   noise-equivalent area of a round Gaussian of width `s` pixels (the detector's measured width,
 *   core/stack.ts `psfWidth`). A stack of N adds as `√N`, the best case: it must follow the planet
 *   (its parallax moves it far between passes), and it ignores stars it would pass over.
 * - Seen means at least 5 times the noise.
 * - Yearly shift: the parallax `asin(1/r)` (it swings that far to each side of its mean place in
 *   a year) and its own orbit, `2π/√r` AU a year seen from `Δ` (direction unknown, so only the
 *   size is given).
 */
import { BAND_EDGES, PIXEL_ARCSEC } from './instrument.ts';
import { offsetBy, parallaxFactors } from './astro.ts';

/** The planet the user sets. */
export interface PretendPlanet {
  /** Radius, Earth radii. */
  radius: number;
  /** Distance from the Sun, AU. */
  distance: number;
  /** Geometric albedo, 0 to 1 ("reflectivity"). */
  albedo: number;
  /** Temperature of its own heat, K (0 for none). */
  ownHeat: number;
}

/** The limits the inputs are kept within. */
export const LIMITS = {
  radius: { min: 0.1, max: 30, step: 0.1 },
  distance: { min: 5, max: 2000, step: 1 },
  albedo: { min: 0.01, max: 1, step: 0.01 },
  ownHeat: { min: 0, max: 200, step: 1 },
} as const;

/** The planet the sandbox opens with: Neptune's size and reflectivity, far out. */
export const DEFAULT_PLANET: Readonly<PretendPlanet> = { radius: 3.9, distance: 500, albedo: 0.4, ownHeat: 0 };

/** Seen means at least this many times the noise. */
export const SEEN = 5;

// Physical constants (SI; CODATA 2018 and IAU 2015 nominal values).
const H = 6.62607015e-34;
const C = 299_792_458;
const K = 1.380649e-23;
const AU = 1.495978707e11;
const R_EARTH = 6.371e6;
const R_SUN = 6.957e8;
const T_SUN = 5772;
/** µJy in W m⁻² Hz⁻¹. */
const UJY = 1e-32;

/** Planck's law: W m⁻² Hz⁻¹ sr⁻¹ at wavelength `lam` µm and temperature `t` K (0 when t ≤ 0). */
export function planck(lam: number, t: number): number {
  if (!(t > 0)) return 0;
  const nu = C / (lam * 1e-6);
  const x = (H * nu) / (K * t);
  if (x > 700) return 0;
  return (2 * H * nu ** 3) / (C * C) / Math.expm1(x);
}

/** Keeps every input within its limits. */
export function clampPlanet(p: PretendPlanet): PretendPlanet {
  const c = (v: number, l: { min: number; max: number }) =>
    Math.min(l.max, Math.max(l.min, Number.isFinite(v) ? v : l.min));
  return {
    radius: c(p.radius, LIMITS.radius),
    distance: c(p.distance, LIMITS.distance),
    albedo: c(p.albedo, LIMITS.albedo),
    ownHeat: c(p.ownHeat, LIMITS.ownHeat),
  };
}

/** Distance from the telescope (AU) and phase angle (radians), seen 90° from the Sun. */
export function geometry(r: number): { delta: number; phase: number } {
  return { delta: Math.sqrt(Math.max(r * r - 1, 1e-9)), phase: Math.asin(Math.min(1, 1 / r)) };
}

/** Its temperature, K: from sunlight, and with its own heat. */
export function temperature(p: PretendPlanet): { sunlit: number; total: number } {
  const sunlit = (278.6 * Math.pow(1 - Math.min(p.albedo, 0.99), 0.25)) / Math.sqrt(p.distance);
  return { sunlit, total: Math.pow(sunlit ** 4 + Math.max(0, p.ownHeat) ** 4, 0.25) };
}

/** The middle wavelength of each detector, µm (D1 first). */
export function detectorLams(): number[] {
  return [1, 2, 3, 4, 5, 6].map((d) => (BAND_EDGES[d - 1]! + BAND_EDGES[d]!) / 2);
}

/** Brightness at one wavelength, µJy: reflected sunlight and its own glow. */
export function brightness(p: PretendPlanet, lam: number): { reflected: number; glow: number; total: number } {
  const { delta, phase } = geometry(p.distance);
  const disc = ((p.radius * R_EARTH) / (delta * AU)) ** 2;
  const sunAt1au = Math.PI * planck(lam, T_SUN) * (R_SUN / AU) ** 2;
  const lambert = (Math.sin(phase) + (Math.PI - phase) * Math.cos(phase)) / Math.PI;
  const reflected = ((sunAt1au / p.distance ** 2) * p.albedo * disc * lambert) / UJY;
  const glow = (Math.PI * planck(lam, temperature(p).total) * disc) / UJY;
  return { reflected, glow, total: reflected + glow };
}

/** What the patch offers for one detector: its measured pixel noise and point-source width. */
export interface DetectorNoise {
  det: number;
  /** Pixel noise of one exposure, µJy (the patch's `Field.noise`); NaN when it has none. */
  pixelNoise: number;
  /** Gaussian σ of a point source, pixels. */
  width: number;
  /** Exposures of this detector in the patch. */
  exposures: number;
}

/** The answer for one detector. */
export interface DetectorAnswer {
  det: number;
  lam: number;
  reflected: number;
  glow: number;
  total: number;
  /** Noise of one exposure for a point source, µJy; NaN when not measured. */
  noise: number;
  /** Times the noise in one exposure, and in a stack of all of this detector's exposures. */
  one: number;
  stacked: number;
  exposures: number;
  /** Exposures a stack would need to reach `SEEN` (Infinity when the planet gives no light). */
  needed: number;
}

/** Point-source noise of one exposure, µJy: pixel noise times √(4π s²). */
export function pointNoise(n: DetectorNoise): number {
  return n.pixelNoise * Math.sqrt(4 * Math.PI * n.width * n.width);
}

/** The planet against the patch's noise, detector by detector. */
export function answer(p: PretendPlanet, noises: readonly DetectorNoise[]): DetectorAnswer[] {
  const lams = detectorLams();
  return noises.map((n) => {
    const lam = lams[n.det - 1]!;
    const b = brightness(p, lam);
    const noise = pointNoise(n);
    const one = Number.isFinite(noise) && noise > 0 ? b.total / noise : Number.NaN;
    const stacked = one * Math.sqrt(Math.max(0, n.exposures));
    const needed = one > 0 ? Math.max(1, Math.ceil((SEEN / one) ** 2)) : Infinity;
    return { det: n.det, lam, ...b, noise, one, stacked, exposures: n.exposures, needed };
  });
}

/** The one-line verdict, in words, and how it was reached. */
export interface Verdict {
  kind: 'one' | 'stack' | 'no' | 'unknown';
  text: string;
  best: DetectorAnswer | null;
}

export function verdict(answers: readonly DetectorAnswer[]): Verdict {
  const measured = answers.filter((a) => Number.isFinite(a.one));
  if (!measured.length)
    return { kind: 'unknown', text: 'Not worked out: this patch has no measured noise to compare with.', best: null };
  const best = measured.reduce((a, b) => (b.one > a.one ? b : a));
  const where = `D${best.det} (${best.lam.toFixed(2)} µm)`;
  if (best.one >= SEEN)
    return { kind: 'one', text: `One exposure would show it: ${fmtTimes(best.one)} the noise in ${where}.`, best };
  if (best.stacked >= SEEN)
    return {
      kind: 'stack',
      text: `No single exposure would show it, but a stack of all ${best.exposures} exposures in ${where} would reach ${fmtTimes(best.stacked)} the noise, if the stack follows its path.`,
      best,
    };
  return {
    kind: 'no',
    text: `SPHEREx would not show it here. The best is ${where}: ${fmtTimes(best.one)} the noise in one exposure, ${fmtTimes(best.stacked)} in a stack of ${best.exposures}; seeing it would take about ${fmtCount(best.needed)} exposures.`,
    best,
  };
}

/** How far it moves on the sky in a year. */
export interface YearlyShift {
  /** Parallax: it swings this far to each side of its mean place in a year, arcsec. */
  parallax: number;
  /** In SPHEREx pixels (6.15″). */
  parallaxPixels: number;
  /** Its own orbit, arcsec a year (direction not known). */
  orbit: number;
}

export function yearlyShift(p: PretendPlanet): YearlyShift {
  const parallax = (Math.asin(Math.min(1, 1 / p.distance)) * 180 * 3600) / Math.PI;
  const { delta } = geometry(p.distance);
  const orbitAu = (2 * Math.PI) / Math.sqrt(p.distance);
  const orbit = (Math.atan(orbitAu / delta) * 180 * 3600) / Math.PI;
  return { parallax, parallaxPixels: parallax / PIXEL_ARCSEC, orbit };
}

/**
 * Where the pretend planet is on a date: its mean place pushed by its parallax (the Earth's side
 * of the Sun). Its own orbit is left out (its direction is not known).
 *
 * @param at Its mean place, degrees.
 * @returns Degrees.
 */
export function placeOn(p: PretendPlanet, at: { ra: number; dec: number }, mjd: number): { ra: number; dec: number } {
  const plx = yearlyShift(p).parallax;
  const f = parallaxFactors(mjd, at.ra, at.dec);
  return offsetBy(at.ra, at.dec, plx * f.east, plx * f.north);
}

/** "0.0021", "3.4", "1,200": two significant figures, plain. */
export function fmtFlux(v: number): string {
  if (!Number.isFinite(v)) return 'not worked out';
  if (v === 0) return '0';
  if (v >= 100) return Math.round(v).toLocaleString('en');
  if (v >= 1e-4) return Number(v.toPrecision(2)).toString();
  return v.toExponential(1).replace('e-', ' × 10⁻').replace(/(\d+)$/, (d) => toSuper(d));
}

function toSuper(d: string): string {
  return [...d].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)] ?? c).join('');
}

/** "12×", "0.004×". */
export function fmtTimes(v: number): string {
  if (!Number.isFinite(v)) return 'not measured';
  return `${v >= 10 ? Math.round(v).toLocaleString('en') : Number(v.toPrecision(2))}×`;
}

/** "40,000", "3 million", "2 × 10¹²". */
export function fmtCount(n: number): string {
  if (!Number.isFinite(n)) return 'no number of';
  if (n < 1e6) return Math.round(n).toLocaleString('en');
  if (n < 1e9) return `${Number((n / 1e6).toPrecision(2))} million`;
  if (n < 1e12) return `${Number((n / 1e9).toPrecision(2))} billion`;
  const e = Math.floor(Math.log10(n));
  return `${Number((n / 10 ** e).toPrecision(2))} × 10${toSuper(String(e))}`;
}
