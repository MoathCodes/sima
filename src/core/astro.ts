/**
 * Coordinates and dates. Owner: lane B. Pure: no page access.
 *
 * Positions are ICRS degrees. Dates are MJD (UTC) or decimal years. Text uses the app's symbols:
 * ′ and ″ for arcminutes and arcseconds, − for minus, tabular figures (DESIGN.md).
 *
 * PHASE 0 STUB: every function returns a fixed fake value. Fake text uses the digits 1 to 6
 * ("12h 34m 56.00s") so it is easy to spot on screen.
 */

/** MJD of the J2000.0 epoch (2000 January 1, 12:00 TT). */
export const MJD_J2000 = 51544.5;

/**
 * MJD → JavaScript Date (UTC).
 * PHASE 0 STUB: always 2026-01-01T00:00:00Z.
 */
export function mjdToDate(mjd: number): Date {
  return new Date(Date.UTC(2026, 0, 1));
}

/**
 * JavaScript Date → MJD (UTC).
 * PHASE 0 STUB: always 61041 (2026-01-01).
 */
export function dateToMjd(date: Date): number {
  return 61041;
}

/**
 * MJD → decimal year (for catalogue epochs, e.g. 2016.0).
 * PHASE 0 STUB: always 2026.0.
 */
export function mjdToYear(mjd: number): number {
  return 2026.0;
}

/**
 * Decimal year → MJD.
 * PHASE 0 STUB: always 61041.
 */
export function yearToMjd(year: number): number {
  return 61041;
}

/**
 * Right ascension as text: "17h 57m 47.09s".
 * PHASE 0 STUB: always "12h 34m 56.00s".
 *
 * @param ra Degrees, 0 to 360.
 * @param digits Decimals of the seconds (default 2).
 */
export function formatRa(ra: number, digits = 2): string {
  return '12h 34m 56.00s';
}

/**
 * Declination as text with a sign: "+04° 46′ 07.6″", "−07° 14′ 39.9″" (true minus sign).
 * PHASE 0 STUB: always "+12° 34′ 56.0″".
 *
 * @param dec Degrees, −90 to 90.
 * @param digits Decimals of the seconds (default 1).
 */
export function formatDec(dec: number, digits = 1): string {
  return '+12° 34′ 56.0″';
}

/**
 * Both, one space apart: "17h 57m 47.09s +04° 46′ 07.6″". The frame title and the pointer
 * readout use this. PHASE 0 STUB: fixed fake text.
 */
export function formatCoords(ra: number, dec: number): string {
  return `${formatRa(ra)} ${formatDec(dec)}`;
}

/**
 * A date as text, UTC:
 * - `month`: "Mar 2026" (Explore's date badge),
 * - `day`: "21 Mar 2026",
 * - `time`: "21 Mar 2026, 06:42 UTC" (Measure's date badge).
 * PHASE 0 STUB: fixed fake text.
 *
 * @param mjd MJD (UTC).
 */
export function formatDate(mjd: number, style: 'month' | 'day' | 'time' = 'day'): string {
  if (style === 'month') return 'Jun 2026';
  if (style === 'time') return '12 Jun 2026, 12:34 UTC';
  return '12 Jun 2026';
}

/**
 * Coordinates typed by a person → degrees. Accepts decimal degrees ("217.429 -62.680"),
 * sexagesimal ("17 57 48.5 +04 41 36", "17h57m48.5s +4°41′36″") and a comma between the two.
 * PHASE 0 STUB: always null.
 *
 * @param text What the user typed.
 * @returns Degrees, or null when the text is not coordinates.
 */
export function parseCoords(text: string): { ra: number; dec: number } | null {
  return null;
}

/**
 * Angle between two sky positions (haversine, safe for tiny angles).
 * PHASE 0 STUB: always 0.
 *
 * @returns Degrees.
 */
export function separation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  return 0;
}

/**
 * Offset of a position from a reference, on the sky: east (along RA, times cos dec) and north.
 * The Path chart and the motion fit use it.
 * PHASE 0 STUB: always zero.
 *
 * @returns Arcseconds east and north.
 */
export function offsetArcsec(
  ra0: number,
  dec0: number,
  ra: number,
  dec: number,
): { east: number; north: number } {
  return { east: 0, north: 0 };
}

/**
 * Moves a catalogue position by its proper motion (SPEC 7.1.6: positions need the right epoch).
 * PHASE 0 STUB: returns the position unchanged.
 *
 * @param ra Degrees at `fromYear`.
 * @param dec Degrees at `fromYear`.
 * @param pmra mas/yr, east motion already times cos dec.
 * @param pmdec mas/yr.
 * @param fromYear Decimal year of the catalogue position.
 * @param toYear Decimal year wanted.
 * @returns Degrees at `toYear`.
 */
export function propagate(
  ra: number,
  dec: number,
  pmra: number,
  pmdec: number,
  fromYear: number,
  toYear: number,
): { ra: number; dec: number } {
  return { ra, dec };
}

/**
 * Parallax factors: how far a star at 1 mas parallax is pushed east and north on a date, from a
 * simple formula for the Sun's position (data-format.md, "Parallax").
 * PHASE 0 STUB: always zero.
 *
 * @param mjd Date.
 * @param ra Degrees.
 * @param dec Degrees.
 * @returns Factors (mas per mas of parallax), east and north.
 */
export function parallaxFactors(
  mjd: number,
  ra: number,
  dec: number,
): { east: number; north: number } {
  return { east: 0, north: 0 };
}
