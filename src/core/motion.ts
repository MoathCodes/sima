/**
 * The motion handle on the Stack view (O-V6, SPEC-v1 F9): an arrow on the picture whose length
 * is a speed and whose direction is a direction on the sky. Pure: the mapping between the arrow
 * and a motion, the keyboard nudges, the words, and the trial track a stack follows. The page
 * side is viewer/motion.ts; the stack itself is core/stack.ts, run in core/work.ts's worker.
 *
 * The picture is north up and east left (core/types.ts `Field`), so an arrow pointing left is a
 * motion to the east (pmra > 0) and an arrow pointing up is a motion to the north (pmdec > 0).
 *
 * The arrow starts where the object is at the frames' mean date, the date the stack is aligned
 * to (core/stack.ts `stackShifts`), and is drawn larger than the true shift: its full length is
 * `maxSpeed`, so a motion of a few pixels over the dates can still be dragged.
 */
import type { CatalogueTrack } from './types.ts';
import { mjdToYear, propagate } from './astro.ts';

/** A motion on the sky: mas/yr, east (times cos dec) and north. */
export interface Motion {
  pmra: number;
  pmdec: number;
}

/** The arrow's full length is at least this speed, mas/yr (Barnard's Star moves 10,393). */
export const MIN_MAX_SPEED = 12_000;
/** Keyboard nudges, mas/yr: an arrow key, and with Shift. */
export const NUDGE = 100;
export const NUDGE_BIG = 1000;

/** The speed at the arrow's full length: 12″/yr, or 1.5 times the catalogue motion if faster. */
export function maxSpeed(catalogue: Motion | null): number {
  const v = catalogue ? Math.hypot(catalogue.pmra, catalogue.pmdec) : 0;
  return Math.max(MIN_MAX_SPEED, 1.5 * v);
}

/** Keeps a motion within the arrow's full length (the direction is kept). */
export function clampMotion(m: Motion, max: number): Motion {
  const v = Math.hypot(m.pmra, m.pmdec);
  if (v <= max || v === 0) return { pmra: m.pmra, pmdec: m.pmdec };
  return { pmra: (m.pmra * max) / v, pmdec: (m.pmdec * max) / v };
}

/**
 * The motion an arrow tip stands for.
 * @param dx Tip minus tail, screen pixels to the right.
 * @param dy Screen pixels down.
 * @param radius The arrow's full length on screen, pixels.
 * @param max The speed at full length, mas/yr.
 */
export function offsetToMotion(dx: number, dy: number, radius: number, max: number): Motion {
  if (!(radius > 0)) return { pmra: 0, pmdec: 0 };
  return clampMotion({ pmra: (-dx / radius) * max, pmdec: (-dy / radius) * max }, max);
}

/** Where the arrow tip goes for a motion (the inverse of `offsetToMotion`). */
export function motionToOffset(m: Motion, radius: number, max: number): { dx: number; dy: number } {
  const c = clampMotion(m, max);
  return { dx: (-c.pmra / max) * radius, dy: (-c.pmdec / max) * radius };
}

/**
 * A keyboard nudge: the arrow keys move the tip the way they point on screen (left is east).
 * @returns The new motion, or null for any other key.
 */
export function nudge(m: Motion, key: string, big: boolean, max: number): Motion | null {
  const step = big ? NUDGE_BIG : NUDGE;
  const d: Record<string, [number, number]> = {
    ArrowLeft: [step, 0],
    ArrowRight: [-step, 0],
    ArrowUp: [0, step],
    ArrowDown: [0, -step],
  };
  const v = d[key];
  if (!v) return null;
  return clampMotion({ pmra: m.pmra + v[0], pmdec: m.pmdec + v[1] }, max);
}

/** Speed (″/yr) and position angle (degrees east of north, 0 to 360). */
export function speedAndAngle(m: Motion): { speed: number; pa: number } {
  const speed = Math.hypot(m.pmra, m.pmdec) / 1000;
  const pa = ((Math.atan2(m.pmra, m.pmdec) * 180) / Math.PI + 360) % 360;
  return { speed, pa };
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** "8.15″/yr toward the west (position angle 275°)", or "standing still". */
export function motionWords(m: Motion): string {
  const { speed, pa } = speedAndAngle(m);
  if (speed < 0.005) return 'standing still';
  const point = POINTS[Math.round(pa / 45) % 8];
  return `${speed.toFixed(2)}″/yr toward the ${point} (position angle ${Math.round(pa)}°)`;
}

/**
 * The track a trial stack follows: the object's place at the frames' mean date (from the
 * catalogue when there is one, else the given place), moving with the trial motion from that
 * date. Stacking along it (core/stack.ts) then keeps that place fixed, as the arrow's tail is.
 *
 * @param mjds The dates of the frames stacked.
 * @param at The place: the catalogue track, or a fixed point (degrees) when there is none.
 */
export function trialTrack(
  mjds: readonly number[],
  at: CatalogueTrack | { ra: number; dec: number },
  m: Motion,
): CatalogueTrack {
  const years = mjds.map(mjdToYear);
  const epoch = years.length ? years.reduce((a, b) => a + b, 0) / years.length : 2026;
  const place =
    'ep' in at ? propagate(at.ra, at.dec, at.pmra, at.pmdec, at.ep, epoch) : { ra: at.ra, dec: at.dec };
  return {
    ra: place.ra,
    dec: place.dec,
    ep: epoch,
    pmra: m.pmra,
    pmdec: m.pmdec,
    parallax: null,
    from: `a trial motion of ${motionWords(m)}, set with the motion handle (not a catalogue value)`,
  };
}

/** True when two motions round to the same handle position (within 1 mas/yr). */
export function sameMotion(a: Motion, b: Motion): boolean {
  return Math.abs(a.pmra - b.pmra) < 1 && Math.abs(a.pmdec - b.pmdec) < 1;
}
