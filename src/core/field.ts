/**
 * The labelled practice simulation, part 2 of 3: what is in a simulated patch (stars, and a
 * mover or a pretend planet). Owner: lane B. Pure. Everything here is Simulated (H3) and never
 * mixes with real results.
 *
 * The background stars are made up: positions at random, brightness from a power law (a few
 * bright, many faint), and colours from blackbodies of 3300 to 7000 K, so they fade towards long
 * wavelengths like real stars. `warm-up` adds one obvious mover; `planet-x` adds one faint, cold
 * pretend planet that is brightest in D5 and D6.
 */
import { BAND_EDGES, DETECTORS, PIXEL_ARCSEC } from './instrument.ts';
import { rng } from './math.ts';
import type { Rand } from './math.ts';
import { PASS_DAYS, SIM_WINDOWS } from './schedule.ts';

/** One simulated source. */
export interface SimSource {
  /** Degrees at the first date. */
  ra: number;
  dec: number;
  /** mas/yr (east times cos dec, north). */
  pmra: number;
  pmdec: number;
  /** Brightness per detector, µJy; index 0 is D1. */
  flux: [number, number, number, number, number, number];
  kind: 'star' | 'mover' | 'planet';
}

/** A practice patch, opened by a starter in the Places menu. */
export interface Scenario {
  /** Key used with viewer/load.ts `loadTarget`. */
  key: string;
  /** What the Places menu calls it. */
  title: string;
  /** Its plain line there (after the Simulated label). */
  line: string;
  /** Where the simulated patch sits on the sky, degrees. Not a real place's pictures. */
  ra: number;
  dec: number;
  /** Field size, arcminutes: one of FOVS in viewer/state.ts. */
  fov: number;
  /** The same seed always gives the same patch. */
  seed: number;
}

/**
 * The practice patches. Both sit a few degrees from the south galactic pole (RA 12.86°,
 * Dec −27.13°), where the sky is dark and nearly empty, and far from the five real targets and
 * from the bright galaxies and clusters there (NGC 253, NGC 288, Sculptor). Gaia DR3 has nothing
 * brighter than G 11 within 9′ of either (checked 2026-11-14). The pictures are made up; only the
 * spot on the map is real.
 */
export const SCENARIOS: Readonly<Record<string, Scenario>> = Object.freeze({
  'warm-up': {
    key: 'warm-up',
    title: 'Warm-up',
    line: '20-second practice',
    ra: 17.5,
    dec: -30,
    fov: 6,
    seed: 1,
  },
  'planet-x': {
    key: 'planet-x',
    title: 'The hidden planet',
    line: 'Made up: it jumps',
    ra: 8.5,
    dec: -24.5,
    fov: 6,
    seed: 2,
  },
});

/** How far the `warm-up` mover jumps between passes, pixels. */
export const MOVER_JUMP_PX = 2.5;
/** How far the `planet-x` pretend planet jumps between passes, pixels. */
export const PLANET_JUMP_PX = 3;

/** Background stars per square arcminute. */
const STAR_DENSITY = 1;
/** Faintest star, µJy at 1.25 µm; the power law's slope (N(>F) ∝ F^−slope); the brightest. */
const STAR_FAINT = 15;
const STAR_SLOPE = 0.6;
const STAR_BRIGHT = 30000;
/** No background star within this many pixels of the mover's or the planet's path. */
const CLEAR_PX = 4;
/** Reference wavelength of the drawn brightness, µm. */
const LAM_REF = 1.25;

/**
 * The sources of a practice patch: background stars, plus the mover (`warm-up`) or the pretend
 * planet (`planet-x`). The same scenario always gives the same sources.
 */
export function simSources(scenario: Scenario): SimSource[] {
  const rand = rng(scenario.seed * 104729 + 3);
  const half = (scenario.fov * 60) / 2; // arcsec from the centre to the edge
  const out: SimSource[] = [];

  // The special source first, so the stars can keep clear of its path.
  const paths: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const special = specialSource(scenario, rand, half);
  if (special) {
    out.push(special.src);
    paths.push(special.path);
  }

  const count = Math.round(STAR_DENSITY * scenario.fov * scenario.fov);
  for (let k = 0; k < count; k++) {
    const x = (2 * rand() - 1) * half; // arcsec east
    const y = (2 * rand() - 1) * half; // arcsec north
    const f = Math.min(STAR_BRIGHT, STAR_FAINT * Math.pow(1 - rand(), -1 / STAR_SLOPE));
    const t = 3300 + 3700 * rand();
    if (paths.some((p) => distToSegment(x, y, p) < CLEAR_PX * PIXEL_ARCSEC)) continue;
    const pos = offset(scenario, x, y);
    out.push({ ...pos, pmra: 0, pmdec: 0, flux: blackbodyFlux(f, t), kind: 'star' });
  }
  return out;
}

/**
 * Where a source is a number of days after the first date, degrees.
 *
 * @param src A simulated source.
 * @param days Days after the first date.
 */
export function sourceAt(src: SimSource, days: number): { ra: number; dec: number } {
  const yr = days / 365.25;
  const dec = src.dec + (src.pmdec * yr) / 3.6e6;
  const ra = src.ra + (src.pmra * yr) / 3.6e6 / Math.cos((src.dec * Math.PI) / 180);
  return { ra, dec };
}

/** The mover or the planet of a scenario, with its path in arcsec from the centre; else null. */
function specialSource(
  scenario: Scenario,
  rand: Rand,
  half: number,
): { src: SimSource; path: { x0: number; y0: number; x1: number; y1: number } } | null {
  let jump: number;
  let flux: SimSource['flux'];
  let kind: SimSource['kind'];
  if (scenario.key === 'warm-up') {
    jump = MOVER_JUMP_PX;
    flux = blackbodyFlux(2500, 3200); // a bright, red, nearby-looking star
    kind = 'mover';
  } else if (scenario.key === 'planet-x') {
    jump = PLANET_JUMP_PX;
    flux = [1, 2, 4, 30, 160, 200]; // cold: almost nothing short of 2.4 µm
    kind = 'planet';
  } else {
    return null;
  }
  // Motion in a seeded direction; the middle of the path a little off the centre.
  const angle = 2 * Math.PI * rand();
  const perYear = (jump * PIXEL_ARCSEC) / (PASS_DAYS / 365.25); // arcsec/yr
  const span = (jump * PIXEL_ARCSEC * Math.max(1, SIM_WINDOWS - 1)) / 2; // half the path, arcsec
  const mx = (2 * rand() - 1) * 0.25 * half;
  const my = (2 * rand() - 1) * 0.25 * half;
  const ex = Math.sin(angle); // east
  const ny = Math.cos(angle); // north
  const x0 = mx - ex * span;
  const y0 = my - ny * span;
  const src: SimSource = {
    ...offset(scenario, x0, y0),
    pmra: perYear * ex * 1000,
    pmdec: perYear * ny * 1000,
    flux,
    kind,
  };
  return { src, path: { x0, y0, x1: mx + ex * span, y1: my + ny * span } };
}

/** Sky position of an offset from the patch centre (arcsec east, arcsec north), degrees. */
function offset(scenario: Scenario, east: number, north: number): { ra: number; dec: number } {
  const dec = scenario.dec + north / 3600;
  const ra = scenario.ra + east / 3600 / Math.cos((scenario.dec * Math.PI) / 180);
  return { ra: ((ra % 360) + 360) % 360, dec };
}

/** Brightness per detector (at each band's middle) of a blackbody of temperature `t` K that is
 * `f` µJy at LAM_REF. */
function blackbodyFlux(f: number, t: number): SimSource['flux'] {
  // Fν ∝ ν³ / (exp(hν/kT) − 1); hc/k = 14388 µm·K.
  const fnu = (lam: number): number => Math.pow(lam, -3) / Math.expm1(14388 / (lam * t));
  const ref = fnu(LAM_REF);
  const out: number[] = [];
  for (let d = 1; d <= DETECTORS; d++) {
    const lam = Math.sqrt(BAND_EDGES[d - 1]! * BAND_EDGES[d]!);
    out.push((f * fnu(lam)) / ref);
  }
  return out as SimSource['flux'];
}

/** Distance from a point to a line segment, same units. */
function distToSegment(
  x: number,
  y: number,
  p: { x0: number; y0: number; x1: number; y1: number },
): number {
  const dx = p.x1 - p.x0;
  const dy = p.y1 - p.y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - p.x0) * dx + (y - p.y0) * dy) / len2)) : 0;
  return Math.hypot(x - (p.x0 + t * dx), y - (p.y0 + t * dy));
}
