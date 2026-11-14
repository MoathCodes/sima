/**
 * Sky position to screen position, fast, for drawing thousands of dots each frame (PLC-8).
 * Pure: no page. Owner: lane C.
 *
 * The map uses the stereographic projection (Aladin Lite "STG"): it fills the window at every
 * zoom up to 180° wide, with no black sphere around it (SKY-1). sky.ts measures the scale from
 * Aladin itself after each change of view (`calibrate`), so this and the map always agree.
 */

const RAD = Math.PI / 180;

/** One view of the sky: its centre, its scale and the screen point of its centre. */
export interface View {
  /** Centre, degrees. */
  ra: number;
  dec: number;
  /** Screen pixels per unit of the projection plane (2·tan(θ/2) is 1 unit at θ from centre). */
  scale: number;
  /** Screen point of the centre, CSS pixels. */
  cx: number;
  cy: number;
  /** −1 when right ascension grows to the left on screen (the sky as seen from inside). */
  flip: 1 | -1;
  sinDec: number;
  cosDec: number;
}

/** Builds a view. */
export function makeView(
  ra: number,
  dec: number,
  scale: number,
  cx: number,
  cy: number,
  flip: 1 | -1 = -1,
): View {
  return {
    ra,
    dec,
    scale,
    cx,
    cy,
    flip,
    sinDec: Math.sin(dec * RAD),
    cosDec: Math.cos(dec * RAD),
  };
}

/** Stereographic plane coordinates of a sky position, or null for the point opposite. */
export function plane(v: View, ra: number, dec: number): { x: number; y: number } | null {
  const d = dec * RAD;
  const h = (ra - v.ra) * RAD;
  const sd = Math.sin(d);
  const cd = Math.cos(d);
  const ch = Math.cos(h);
  const cosc = v.sinDec * sd + v.cosDec * cd * ch;
  if (cosc < -0.98) return null;
  const k = 2 / (1 + cosc);
  return { x: k * cd * Math.sin(h), y: k * (v.cosDec * sd - v.sinDec * cd * ch) };
}

/**
 * Screen point of a sky position (CSS pixels), or null when it is behind the viewer.
 * Allocation-free variant: writes into `out` and returns true.
 */
export function projectInto(
  v: View,
  ra: number,
  dec: number,
  out: { x: number; y: number },
): boolean {
  const d = dec * RAD;
  const h = (ra - v.ra) * RAD;
  const sd = Math.sin(d);
  const cd = Math.cos(d);
  const ch = Math.cos(h);
  const cosc = v.sinDec * sd + v.cosDec * cd * ch;
  if (cosc < -0.98) return false;
  const k = (2 / (1 + cosc)) * v.scale;
  out.x = v.cx + v.flip * k * cd * Math.sin(h);
  out.y = v.cy - k * (v.cosDec * sd - v.sinDec * cd * ch);
  return true;
}

/** Screen point of a sky position, or null behind the viewer. */
export function project(v: View, ra: number, dec: number): { x: number; y: number } | null {
  const out = { x: 0, y: 0 };
  return projectInto(v, ra, dec, out) ? out : null;
}

/**
 * The scale of a view, from one known screen point of a known sky position (sky.ts asks Aladin
 * for the sky position under a point off the centre).
 */
export function calibrate(
  v: View,
  ra: number,
  dec: number,
  x: number,
  y: number,
): { scale: number; flip: 1 | -1 } | null {
  const p = plane(v, ra, dec);
  if (!p) return null;
  const dx = x - v.cx;
  const dy = v.cy - y;
  const lenScreen = Math.hypot(dx, dy);
  const lenPlane = Math.hypot(p.x, p.y);
  if (lenPlane < 1e-12 || lenScreen < 1) return null;
  const flip: 1 | -1 = Math.abs(p.x) > 1e-9 && Math.sign(dx) !== Math.sign(p.x) ? -1 : 1;
  return { scale: lenScreen / lenPlane, flip };
}

/** Angle between two sky positions, degrees. */
export function separation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const a = Math.sin(((dec2 - dec1) * RAD) / 2) ** 2;
  const b = Math.cos(dec1 * RAD) * Math.cos(dec2 * RAD) * Math.sin(((ra2 - ra1) * RAD) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a + b)))) / RAD;
}

/** Right ascension folded into 0 ≤ ra < 360 degrees. */
export function wrapRa(ra: number): number {
  return ((ra % 360) + 360) % 360;
}
