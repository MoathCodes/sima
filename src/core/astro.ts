/**
 * Coordinates and dates. Owner: lane B. Pure: no page access.
 *
 * Positions are ICRS degrees. Dates are MJD (UTC) or decimal years (Julian years, so 2016.0 is
 * MJD 57388.5 as Gaia DR3 uses it). Text uses the app's symbols: ′ and ″ for arcminutes and
 * arcseconds, − (U+2212) for minus (DESIGN.md).
 */

/** MJD of the J2000.0 epoch (2000 January 1, 12:00 TT). */
export const MJD_J2000 = 51544.5;
/** MJD of 1970-01-01T00:00Z, JavaScript's time zero. */
const MJD_UNIX = 40587;
const DAY_MS = 86400000;
const D2R = Math.PI / 180;
const MINUS = '−';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** MJD → JavaScript Date (UTC). */
export function mjdToDate(mjd: number): Date {
  return new Date((mjd - MJD_UNIX) * DAY_MS);
}

/** JavaScript Date → MJD (UTC). */
export function dateToMjd(date: Date): number {
  return date.getTime() / DAY_MS + MJD_UNIX;
}

/** MJD → decimal (Julian) year, for catalogue epochs: 2016.0 is MJD 57388.5. */
export function mjdToYear(mjd: number): number {
  return 2000 + (mjd - MJD_J2000) / 365.25;
}

/** Decimal (Julian) year → MJD. */
export function yearToMjd(year: number): number {
  return MJD_J2000 + (year - 2000) * 365.25;
}

const pad = (v: number, width: number, digits: number): string => {
  const s = v.toFixed(digits);
  const int = digits > 0 ? s.indexOf('.') : s.length;
  return '0'.repeat(Math.max(0, width - int)) + s;
};

/** Splits a positive value into whole units, minutes and seconds, with the seconds rounded. */
function sexa(v: number, digits: number): [number, number, number] {
  const scale = 10 ** digits;
  const total = Math.round(v * 3600 * scale); // in units of 10^-digits seconds
  const perMin = 60 * scale;
  const perUnit = 3600 * scale;
  const a = Math.floor(total / perUnit);
  const b = Math.floor((total - a * perUnit) / perMin);
  const c = (total - a * perUnit - b * perMin) / scale;
  return [a, b, c];
}

/**
 * Right ascension as text: "17h 57m 47.09s".
 *
 * @param ra Degrees, 0 to 360.
 * @param digits Decimals of the seconds (default 2).
 */
export function formatRa(ra: number, digits = 2): string {
  if (!Number.isFinite(ra)) return '—';
  const hours = (((ra % 360) + 360) % 360) / 15;
  let [h, m, s] = sexa(hours, digits);
  if (h >= 24) h -= 24;
  return `${pad(h, 2, 0)}h ${pad(m, 2, 0)}m ${pad(s, 2, digits)}s`;
}

/**
 * Declination as text with a sign: "+04° 46′ 07.6″", "−07° 14′ 39.9″" (true minus sign).
 *
 * @param dec Degrees, −90 to 90.
 * @param digits Decimals of the seconds (default 1).
 */
export function formatDec(dec: number, digits = 1): string {
  if (!Number.isFinite(dec)) return '—';
  const [d, m, s] = sexa(Math.abs(dec), digits);
  const sign = dec < 0 && d + m + s > 0 ? MINUS : '+';
  return `${sign}${pad(d, 2, 0)}° ${pad(m, 2, 0)}′ ${pad(s, 2, digits)}″`;
}

/**
 * Both, one space apart: "17h 57m 47.09s +04° 46′ 07.6″". The frame title and the pointer
 * readout use this.
 */
export function formatCoords(ra: number, dec: number): string {
  return `${formatRa(ra)} ${formatDec(dec)}`;
}

/**
 * A date as text, UTC:
 * - `month`: "Mar 2026" (Explore's date badge),
 * - `day`: "21 Mar 2026",
 * - `time`: "21 Mar 2026, 06:42 UTC" (Measure's date badge).
 *
 * @param mjd MJD (UTC).
 */
export function formatDate(mjd: number, style: 'month' | 'day' | 'time' = 'day'): string {
  if (!Number.isFinite(mjd)) return '—';
  // Round to the minute first, so 23:59:40 shows as the next day at 00:00, not 23:60.
  const d = mjdToDate(Math.round(mjd * 1440) / 1440);
  const mon = MONTHS[d.getUTCMonth()]!;
  const year = d.getUTCFullYear();
  if (style === 'month') return `${mon} ${year}`;
  const day = `${d.getUTCDate()} ${mon} ${year}`;
  if (style === 'day') return day;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}, ${hh}:${mm} UTC`;
}

/** Numbers in a piece of text, with the sign of each (ASCII or true minus). */
function numbersIn(text: string): { value: number; signed: boolean; negative: boolean }[] {
  const out: { value: number; signed: boolean; negative: boolean }[] = [];
  const re = /([+\-−]?)\s*(\d+(?:\.\d*)?|\.\d+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ value: Number(m[2]), signed: m[1] !== '', negative: m[1] === '-' || m[1] === MINUS });
  }
  return out;
}

/**
 * Coordinates typed by a person → degrees. Accepts decimal degrees ("217.429 -62.680"),
 * sexagesimal ("17 57 48.5 +04 41 36", "17h57m48.5s +4°41′36″", "17:57:48.5 +04:41:36") and a
 * comma between the two. Sexagesimal right ascension is in hours; decimal right ascension is in
 * degrees unless it ends in "h".
 *
 * @param text What the user typed.
 * @returns Degrees, or null when the text is not coordinates.
 */
export function parseCoords(text: string): { ra: number; dec: number } | null {
  const t = text.trim().replace(/[′']/g, 'm').replace(/[″"]/g, 's').replace(/º/g, '°');
  if (!t || /[a-gi-ln-rt-z]/i.test(t.replace(/\b(ra|dec)\b/gi, ''))) return null;
  // Split into the RA part and the Dec part: at a comma, else before the second number of two
  // or the fourth of six.
  let raText: string;
  let decText: string;
  const comma = t.indexOf(',');
  if (comma >= 0) {
    raText = t.slice(0, comma);
    decText = t.slice(comma + 1);
  } else {
    const starts: number[] = [];
    const re = /[+\-\u2212]?\s*(\d+(?:\.\d*)?|\.\d+)/g;
    for (let m = re.exec(t); m; m = re.exec(t)) starts.push(m.index);
    const at = starts.length === 2 ? starts[1] : starts.length === 6 ? starts[3] : undefined;
    if (at === undefined) return null;
    raText = t.slice(0, at);
    decText = t.slice(at);
  }
  const raNums = numbersIn(raText);
  const decNums = numbersIn(decText);
  if (raNums.length < 1 || raNums.length > 3 || decNums.length < 1 || decNums.length > 3) {
    return null;
  }
  const hoursMarked = /[h:]/i.test(raText) || raNums.length > 1;
  const sum = (ns: { value: number }[]): number =>
    ns.reduce((acc, n, i) => acc + n.value / 60 ** i, 0);
  if (raNums.some((n, i) => i > 0 && (n.signed || n.value >= 60))) return null;
  if (decNums.some((n, i) => i > 0 && (n.signed || n.value >= 60))) return null;
  if (raNums[0]!.negative) return null;
  let ra = sum(raNums);
  if (hoursMarked) {
    if (ra >= 24) return null;
    ra *= 15;
  }
  let dec = sum(decNums);
  if (decNums[0]!.negative) dec = -dec;
  if (!(ra >= 0 && ra < 360) || !(dec >= -90 && dec <= 90)) return null;
  return { ra, dec };
}

/**
 * Angle between two sky positions (haversine, safe for tiny angles).
 *
 * @returns Degrees.
 */
export function separation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const p1 = dec1 * D2R;
  const p2 = dec2 * D2R;
  const sdp = Math.sin((p2 - p1) / 2);
  const sda = Math.sin(((ra2 - ra1) * D2R) / 2);
  const h = sdp * sdp + Math.cos(p1) * Math.cos(p2) * sda * sda;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / D2R;
}

/**
 * Offset of a position from a reference, on the sky: east (along RA, times cos dec) and north.
 * Exact on the tangent plane at the reference (gnomonic standard coordinates), so it is the same
 * mapping the exposures use. The Path chart and the motion fit use it.
 *
 * @returns Arcseconds east and north.
 */
export function offsetArcsec(
  ra0: number,
  dec0: number,
  ra: number,
  dec: number,
): { east: number; north: number } {
  const a0 = ra0 * D2R;
  const d0 = dec0 * D2R;
  const a = ra * D2R;
  const d = dec * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
  const xi = (Math.cos(d) * Math.sin(a - a0)) / cosc;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc;
  return { east: (xi / D2R) * 3600, north: (eta / D2R) * 3600 };
}

/**
 * The position at an offset from a reference (the inverse of `offsetArcsec`).
 *
 * @param east Arcseconds east.
 * @param north Arcseconds north.
 * @returns Degrees.
 */
export function offsetBy(
  ra0: number,
  dec0: number,
  east: number,
  north: number,
): { ra: number; dec: number } {
  const xi = (east / 3600) * D2R;
  const eta = (north / 3600) * D2R;
  const a0 = ra0 * D2R;
  const d0 = dec0 * D2R;
  const den = Math.cos(d0) - eta * Math.sin(d0);
  const a = a0 + Math.atan2(xi, den);
  const d = Math.atan2(Math.sin(d0) + eta * Math.cos(d0), Math.hypot(xi, den));
  return { ra: ((((a / D2R) % 360) + 360) % 360), dec: d / D2R };
}

/**
 * Moves a catalogue position by its proper motion (SPEC 7.1.6: positions need the right epoch).
 * A straight line on the tangent plane at the catalogue position: exact enough over decades for
 * every star here (the largest error, for Barnard's Star over 10 years, is far under 0.01″).
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
  const dt = toYear - fromYear;
  if (dt === 0 || (pmra === 0 && pmdec === 0)) return { ra, dec };
  return offsetBy(ra, dec, (pmra * dt) / 1000, (pmdec * dt) / 1000);
}

/**
 * The Sun's geocentric position, astronomical units, equatorial (ICRS axes), from the
 * Astronomical Almanac's low-precision formula (good to about 0.01°, far below what a parallax of
 * a few hundred mas needs).
 */
export function sunVector(mjd: number): { x: number; y: number; z: number } {
  const n = mjd - MJD_J2000;
  const L = (280.46 + 0.9856474 * n) * D2R;
  const g = (357.528 + 0.9856003 * n) * D2R;
  const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 0.0000004 * n) * D2R;
  const R = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  return {
    x: R * Math.cos(lam),
    y: R * Math.cos(eps) * Math.sin(lam),
    z: R * Math.sin(eps) * Math.sin(lam),
  };
}

/**
 * Parallax factors: how far a star at 1 mas parallax is pushed east and north on a date, from a
 * simple formula for the Sun's position (data-format.md, "Parallax"). The star is seen from the
 * Earth, which is opposite the Sun, so it shifts toward the Sun's direction.
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
  const s = sunVector(mjd);
  const a = ra * D2R;
  const d = dec * D2R;
  return {
    east: -s.x * Math.sin(a) + s.y * Math.cos(a),
    north: -s.x * Math.sin(d) * Math.cos(a) - s.y * Math.sin(d) * Math.sin(a) + s.z * Math.cos(d),
  };
}
