/**
 * Where a task's object is on each date, and whether a tap hit it. Owner: lane H. Pure: no page
 * access, so tests run in Node.
 *
 * The positions are worked out, not observed (H4): for a test target they come from its
 * catalogue position and motion (core/targets.ts, Gaia DR3 or CatWISE2020), moved to the date;
 * for a practice patch, from the made-up source the simulation drew (core/field.ts). The close-up
 * says so in words.
 */
import { mjdToYear, propagate } from '../core/astro.ts';
import { SCENARIOS, simSources, sourceAt, type SimSource } from '../core/field.ts';
import { skyNoise } from '../core/display.ts';
import type { Field } from '../core/types.ts';

const special = new Map<string, SimSource | null>();

/** The made-up mover or planet of a practice patch; null for a patch without one. */
function practiceSource(key: string): SimSource | null {
  if (!special.has(key)) {
    const scenario = SCENARIOS[key];
    special.set(key, scenario ? (simSources(scenario).find((s) => s.kind !== 'star') ?? null) : null);
  }
  return special.get(key) ?? null;
}

/**
 * Where the task's object is at a date, degrees.
 *
 * @param field The patch on screen.
 * @param key Its target or practice key (`S.target`).
 * @param mjd The date.
 * @returns Null when the patch has no known object, or the date is not a number.
 */
export function targetAt(
  field: Field | null,
  key: string | null,
  mjd: number,
): { ra: number; dec: number } | null {
  if (!field || !key || !Number.isFinite(mjd)) return null;
  if (field.simulated) {
    const src = practiceSource(key);
    const t0 = field.frames[0]?.mjd;
    if (!src || t0 === undefined) return null;
    return sourceAt(src, mjd - t0);
  }
  const t = field.target;
  if (!t || t.key !== key) return null;
  return propagate(t.ra, t.dec, t.pmra, t.pmdec, t.ep, mjdToYear(mjd));
}

/** Where the catalogue numbers come from, in words, for the close-up's caption (H4). */
export function ringSource(field: Field | null): string {
  if (!field) return '';
  if (field.simulated) return 'where the simulation put its made-up object on each date';
  const t = field.target;
  if (!t) return '';
  const cat = t.values.startsWith('Gaia DR3') ? 'Gaia DR3' : 'the catalogue';
  return `where ${cat}’s position and motion put ${t.name} on each date`;
}

/** Light counts as seen when it is this many noise units above the sky. */
const SEEN = 5;

/**
 * How far from the object's path a tap still counts, CSS pixels: as far as its light reaches
 * (the ring of pixels around it whose median is still `SEEN` noise units above the sky), so a tap
 * anywhere on the star's glow hits. At least 18 px and three field pixels; the measured part at
 * most a third of the picture.
 *
 * @param pix The date's picture, n × n; null if there is none.
 * @param n Field pixels across.
 * @param path The object on each date, field pixels.
 * @param k CSS pixels per field pixel.
 */
export function tapReach(
  pix: ArrayLike<number> | null,
  n: number,
  path: readonly { x: number; y: number }[],
  k: number,
): number {
  const least = Math.max(18, 3 * k);
  if (!pix || pix.length !== n * n || !path.length) return least;
  const { sky, sigma } = skyNoise(pix);
  if (!(sigma > 0)) return least;
  const most = Math.floor(n / 3);
  let glow = 0;
  for (const c of path) {
    // Each pixel's light in noise units, binned by whole field pixels from the object.
    const rings: number[][] = Array.from({ length: most + 1 }, () => []);
    for (let y = Math.max(0, Math.ceil(c.y - most)); y <= Math.min(n - 1, c.y + most); y++) {
      for (let x = Math.max(0, Math.ceil(c.x - most)); x <= Math.min(n - 1, c.x + most); x++) {
        const r = Math.round(Math.hypot(x - c.x, y - c.y));
        const v = pix[y * n + x]!;
        if (r <= most && Number.isFinite(v)) rings[r]!.push((v - sky) / sigma);
      }
    }
    let r = 0;
    while (r < most) {
      const ring = rings[r + 1]!.sort((a, b) => a - b);
      if (!ring.length || ring[ring.length >> 1]! < SEEN) break;
      r++;
    }
    glow = Math.max(glow, r);
  }
  return Math.max(least, glow * k);
}

/**
 * True when a tap lands within `radius` of the path through `points` (the object on each date,
 * in the same units as the tap).
 */
export function hits(
  points: readonly { x: number; y: number }[],
  tap: { x: number; y: number },
  radius: number,
): boolean {
  if (!points.length) return false;
  if (points.length === 1) {
    const p = points[0]!;
    return Math.hypot(tap.x - p.x, tap.y - p.y) <= radius;
  }
  for (let i = 1; i < points.length; i++) {
    if (toSegment(tap, points[i - 1]!, points[i]!) <= radius) return true;
  }
  return false;
}

function toSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
