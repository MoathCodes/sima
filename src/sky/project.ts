/**
 * Sky position to screen position, fast, for drawing thousands of dots each frame (PLC-8).
 * Pure: no page. Owner: lane C.
 *
 * The map is a globe: Aladin Lite's orthographic projection ("SIN"). Zoomed in, it fills the
 * window; zoomed out past that, the whole sphere shows as a disc of sky with dark space around it,
 * with no change of projection on the way (SKY-1). Only the half facing the viewer is drawn.
 * sky.ts measures the scale from Aladin itself after each change of view (`calibrate`), so this
 * and the map always agree.
 *
 * Aladin's zoom: its "zoom factor" z is the window's half-width over the globe's radius. Up to
 * 180° wide, z = sin(fov / 2) (the window's edge is fov / 2 from the centre); past 180°, Aladin
 * shrinks the globe linearly, z = fov / 180, up to z = 2 (the globe half the window's width).
 * Sima's `fov` is that same number: degrees across the window, and beyond 180 a measure of how
 * far the globe has shrunk.
 */

const RAD = Math.PI / 180;

/** One view of the sky: its centre, its scale and the screen point of its centre. */
export interface View {
  /** Centre, degrees. */
  ra: number;
  dec: number;
  /** Screen pixels per unit of the projection plane: the globe's radius (sin θ is θ from centre). */
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

/** Orthographic plane coordinates of a sky position, or null on the far side of the globe. */
export function plane(v: View, ra: number, dec: number): { x: number; y: number } | null {
  const d = dec * RAD;
  const h = (ra - v.ra) * RAD;
  const sd = Math.sin(d);
  const cd = Math.cos(d);
  const ch = Math.cos(h);
  const cosc = v.sinDec * sd + v.cosDec * cd * ch;
  if (cosc < 0) return null;
  return { x: cd * Math.sin(h), y: v.cosDec * sd - v.sinDec * cd * ch };
}

/**
 * Screen point of a sky position (CSS pixels); false when it is on the far side of the globe.
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
  if (cosc < 0) return false;
  const k = v.scale;
  out.x = v.cx + v.flip * k * cd * Math.sin(h);
  out.y = v.cy - k * (v.cosDec * sd - v.sinDec * cd * ch);
  return true;
}

/** Screen point of a sky position, or null on the far side of the globe. */
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

/** The largest zoom factor Aladin allows: the globe half the window's width. */
export const ZOOM_MAX = 2;

/**
 * Aladin's zoom factor for a view `fov` degrees wide (see the top of this file): the window's
 * half-width over the globe's radius.
 */
export function zoomOf(fov: number): number {
  return fov <= 180 ? Math.sin((fov * RAD) / 2) : fov / 180;
}

/** The view's width, degrees, at a zoom factor (the inverse of `zoomOf`). */
export function fovOf(zoom: number): number {
  return zoom <= 1 ? (2 * Math.asin(Math.max(0, zoom))) / RAD : zoom * 180;
}

/** The globe's radius on screen, CSS px, in a window `width` wide showing `fov` degrees. */
export function globeScale(width: number, fov: number): number {
  return width / 2 / zoomOf(fov);
}

/**
 * The widest view: the whole globe with dark space round it, its diameter 88% of the window's
 * shorter side, as far as Aladin allows (`ZOOM_MAX`). Degrees, as `fov`.
 */
export function widestFov(width: number, height: number): number {
  const side = Math.min(width, height) * 0.88;
  return fovOf(Math.min(ZOOM_MAX, Math.max(1, width / Math.max(side, 1))));
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
