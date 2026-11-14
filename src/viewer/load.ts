/**
 * Loading a patch into the frame: shipped targets (public/data), any coordinate through the
 * live service (docs/live-service.md), and the labelled practice simulation. Owner: lane D.
 *
 * It writes the patch and data fields of `S` (ra, dec, fov, target, label, source, set, field,
 * load), tells the sky through the bus (`patch`, `shown`), and starts playback.
 *
 * PHASE 0 STUB: every target opens the same placeholder: 18 made-up pictures (3 dates × 6
 * detectors) of drawn dots with one that jumps. It is labelled "Placeholder" everywhere and its
 * source is `simulated`, so it is dashed amber on the sky and never passes for real data (H3).
 */
import { S, nearestFov, type Fov } from './state.ts';
import { draw } from './render.ts';
import { play } from './playback.ts';
import { emit } from '../shell/bus.ts';
import { fieldGrid } from '../core/real.ts';
import { PIXEL_ARCSEC } from '../core/instrument.ts';
import { TARGETS } from '../core/targets.ts';
import { SCENARIOS } from '../core/field.ts';
import { formatCoords } from '../core/astro.ts';
import type { Field, Frame, Group } from '../core/types.ts';

/** Where the placeholder sits on the sky (near Barnard's Star, so the phase 0 sky looks right). */
const PLACEHOLDER = { ra: 269.44623, dec: 4.76867 };
const DATES = [60900, 61080, 61270]; // three made-up visit windows, MJD
const LAMS = [0.93, 1.37, 2.0, 3.1, 4.1, 4.7]; // a made-up wavelength per detector, µm

/**
 * Opens a shipped target or a practice patch in the frame.
 *
 * @param id A key from core/targets.ts (`barnard`, `eps-indi-b`, `wise-0855`, `rw-aur`,
 *   `r-dra`) or core/field.ts SCENARIOS (`warm-up`, `planet-x`).
 * @returns Resolves when the first pictures are on screen, or when the frame has said why there
 *   are none.
 */
export async function loadTarget(id: string): Promise<void> {
  const name =
    TARGETS.find((t) => t.key === id)?.name ?? SCENARIOS[id]?.title ?? 'an unknown target';
  const known = TARGETS.some((t) => t.key === id) || id in SCENARIOS;
  S.ra = PLACEHOLDER.ra;
  S.dec = PLACEHOLDER.dec;
  S.fov = 6;
  S.target = known ? id : null;
  S.label = `Placeholder for ${name}`;
  S.source = 'simulated';
  S.set = null;
  S.field = placeholderField();
  S.load = null;
  S.groups = groupsFor(S.field, S.det);
  S.epoch = 0;
  S.ref = 0;
  announce();
  draw();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) S.mode = 'two';
  else play();
}

/**
 * Aims the frame at any spot: shipped pictures if a target is there, else the live service, else
 * the "no pictures here" state with the five test targets and the practice (FRM-11).
 *
 * @param ra Degrees.
 * @param dec Degrees.
 * @param fov Arcminutes; rounded to the nearest of FOVS. Leave out to keep the field size.
 * @returns Resolves when the spot's first pictures are on screen, when it is known there are
 *   none, or when a newer aim replaces this one.
 */
export async function aimAt(ra: number, dec: number, fov?: number): Promise<void> {
  S.ra = ra;
  S.dec = dec;
  if (fov !== undefined) S.fov = nearestFov(fov);
  S.target = null;
  S.label = formatCoords(ra, dec);
  S.source = 'none';
  S.set = null;
  S.field = null;
  S.load = null;
  S.groups = [];
  S.epoch = 0;
  S.ref = 0;
  S.playing = false;
  announce();
  draw();
}

/**
 * Changes the field size (FRM-6) and cuts the pictures again. Lane D only (the − and +
 * buttons and the wheel over the picture); others go through `aimAt`.
 * PHASE 0 STUB: the square on the sky changes, the placeholder pictures do not.
 */
export async function setFov(fov: Fov): Promise<void> {
  S.fov = fov;
  announce();
}

/** Tells the sky what the frame shows. */
function announce(): void {
  emit('patch', {
    ra: S.ra,
    dec: S.dec,
    fov: S.fov,
    source: S.source,
    label: S.source === 'simulated' ? 'Placeholder' : S.label,
    target: S.target,
  });
  const g = S.groups[S.epoch];
  emit('shown', { lam: S.color ? null : S.lam, mjd: g ? g.mjd : null, det: S.det });
}

/**
 * The flip-book for one detector: one group per window (Explore). Lane D only.
 * PHASE 0 STUB: lane D builds this with core/blink.ts `groupFrames`.
 */
export function groupsFor(field: Field | null, det: number): Group[] {
  if (!field) return [];
  return DATES.map((_, w) => {
    const frames = field.frames.filter((f) => f.window === w && f.det === det).map((f) => f.i);
    const mjd = DATES[w] ?? Number.NaN;
    return {
      key: `w${w}`,
      letter: 'ABC'[w] ?? '?',
      window: w,
      visit: null,
      det,
      frames,
      mjd,
      mjd0: mjd,
      mjd1: mjd,
      lam: LAMS[det - 1] ?? Number.NaN,
    };
  });
}

/** Made-up pictures: noise, a few drawn dots and one that jumps between dates. */
function placeholderField(): Field {
  const { n, wcs } = fieldGrid(PLACEHOLDER.ra, PLACEHOLDER.dec, 6);
  let seed = 11;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const dots = Array.from({ length: 14 }, () => ({
    x: rand() * n,
    y: rand() * n,
    f: 40 + rand() * 900,
  }));
  const frames: Frame[] = [];
  DATES.forEach((mjd, w) => {
    for (let det = 1; det <= 6; det++) {
      const pix = new Float32Array(n * n);
      const mover = { x: n * (0.35 + 0.15 * w), y: n * (0.55 - 0.1 * w), f: 1400 };
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          let v = 30 + (rand() - 0.5) * 16;
          for (const d of [...dots, mover]) {
            const r2 = (x - d.x) ** 2 + (y - d.y) ** 2;
            if (r2 < 25) v += d.f * Math.exp(-r2 / 2.2);
          }
          pix[y * n + x] = v;
        }
      }
      frames.push({
        i: frames.length,
        id: `SIMULATED-PLACEHOLDER-${w}-D${det}`,
        det,
        mjd,
        lam: LAMS[det - 1] ?? Number.NaN,
        bw: 0.05,
        window: w,
        visit: 0,
        release: 'simulated',
        pix,
        bad: new Uint8Array(n * n),
        sigma: 4.6,
        sky: 30,
        gain: 1,
        src: null,
      });
    }
  });
  return {
    ra: PLACEHOLDER.ra,
    dec: PLACEHOLDER.dec,
    fov: 6,
    n,
    scale: PIXEL_ARCSEC,
    wcs,
    simulated: true,
    frames,
    windows: DATES.length,
    monthly: false,
    noise: [4.6, 4.6, 4.6, 4.6, 4.6, 4.6],
    target: null,
    neighbours: [],
    releases: ['simulated'],
  };
}
