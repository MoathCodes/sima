/**
 * Catalogue filters on the sky view (O-V5, SPEC-v1 F2): "fast movers" from Gaia DR3 and "cold
 * objects" from CatWISE2020, asked of VizieR from the browser. Pure: the addresses to ask, the
 * answers read into rows, the cuts, the area searched and the pages of the list. The page side is
 * shell/finds.ts.
 *
 * What VizieR can do, measured on 14 November 2026 from the CfA mirror (SPEC 6.1):
 * - Gaia DR3 (`I/355/gaiadr3`) filters on its total motion column `PM` and sorts by it. A circle
 *   of 1° radius answered in 4 to 13 s; 2° and wider gave up after 60 s with no rows. So Gaia is
 *   searched within 1° of the view's middle at most.
 * - CatWISE2020 (`II/365/catwise`) has no W1−W2 column, so the colour is worked out here from its
 *   W1 and W2. The mirror answers it only with `-out.all` (a list of columns gives no rows), about
 *   600 bytes a row. A W2 limit keeps the answer small and the colour meaningful; within 0.5° of
 *   WISE 0855−0714, W2 under 15 gave 1,961 rows in 12 s. So CatWISE is searched within 0.5°, the
 *   nearest rows first, and the list says when it stopped before the edge of the circle.
 *
 * Results are catalogue sources, never discoveries (H7). Every value shown is the catalogue's
 * (H4): nothing is measured here.
 */
import { formatCoords, propagate } from './astro.ts';
import { VIZIER_ASU_TSV } from './catalog.ts';

/**
 * The VizieR mirrors asked, in order: CfA (SPEC 6.1), then IDIA in Cape Town. Both answer the
 * browser (CORS `*`). On 14 November 2026 either one sometimes sent its column notes and no table
 * for a query the other answered, so a failed answer is asked again of the next mirror.
 */
export const MIRRORS: readonly { name: string; url: string }[] = [
  { name: 'VizieR (CfA mirror)', url: VIZIER_ASU_TSV },
  { name: 'VizieR (IDIA mirror)', url: 'https://vizier.idia.ac.za/viz-bin/asu-tsv' },
];

export type FindCat = 'gaia' | 'catwise';

/** The circle searched: degrees. */
export interface FindArea {
  ra: number;
  dec: number;
  /** Radius searched, degrees. */
  radius: number;
  /** True when the view reaches further than the radius searched. */
  clipped: boolean;
}

/** The widest circle each catalogue is searched in, degrees (see the module note). */
export const MAX_RADIUS: Readonly<Record<FindCat, number>> = { gaia: 1, catwise: 0.5 };
/** Rows asked for at most: Gaia's fastest first, CatWISE's nearest first. */
export const CAP: Readonly<Record<FindCat, number>> = { gaia: 300, catwise: 2000 };
/** CatWISE rows fainter than this in W2 are not asked for, magnitudes. */
export const W2_LIMIT = 15;
/** Defaults and limits of the two cuts the user sets. */
export const CUTS = {
  pm: { value: 200, min: 20, max: 5000, step: 10, unit: 'mas/yr' },
  colour: { value: 1.5, min: 0.5, max: 4, step: 0.1, unit: 'mag' },
} as const;
/** The year "Look with the frame" moves a source to: the middle of SPHEREx's dates (2025 to 2026). */
export const SPHEREX_YEAR = 2026.0;
/** Rows per page of the list. */
export const PAGE_SIZE = 20;

/** One catalogue source that passed the cut. All values are the catalogue's (H4). */
export interface CatalogueFind {
  cat: FindCat;
  /** Stable id: the catalogue's name for it. */
  id: string;
  /** Degrees at `ep`. */
  ra: number;
  dec: number;
  /** Decimal year of the position. */
  ep: number;
  /** mas/yr, east motion times cos dec; NaN when the catalogue lists none. */
  pmra: number;
  pmdec: number;
  /** Total motion, mas/yr; NaN when not listed. */
  pm: number;
  /** Gaia: G magnitude and parallax (mas, NaN when not listed). */
  g?: number;
  plx?: number;
  /** CatWISE: W1, W2 and W1−W2, magnitudes (W1 NaN when not listed). */
  w1?: number;
  w2?: number;
  colour?: number;
}

/** What one search gave. */
export interface FindResult {
  cat: FindCat;
  area: FindArea;
  /** The cut, in words, as the list states it. */
  cut: string;
  /** Sources that passed, in list order (Gaia: fastest first; CatWISE: reddest first). */
  rows: CatalogueFind[];
  /** Rows VizieR sent (before the colour cut, for CatWISE). */
  looked: number;
  /** True when VizieR had more rows than were asked for (the list stops short). */
  capped: boolean;
  /** CatWISE rows with no W1 value, so no colour: left out, and counted here. */
  noColour: number;
}

/**
 * The circle to search for a sky view: its middle, out to the view's corners, at most the
 * catalogue's widest circle.
 *
 * @param fov The view's width, degrees.
 * @param width The map's width on screen, CSS pixels.
 * @param height Its height.
 */
export function searchArea(
  cat: FindCat,
  centre: { ra: number; dec: number },
  fov: number,
  width: number,
  height: number,
): FindArea {
  const aspect = width > 0 ? height / width : 1;
  const corner = (fov / 2) * Math.hypot(1, aspect);
  const max = MAX_RADIUS[cat];
  return { ra: centre.ra, dec: centre.dec, radius: Math.min(corner, max), clipped: corner > max };
}

function cone(area: FindArea): Record<string, string> {
  return {
    '-c': `${area.ra.toFixed(6)} ${area.dec >= 0 ? '+' : ''}${area.dec.toFixed(6)}`,
    '-c.rd': area.radius.toFixed(5),
  };
}

/**
 * The VizieR address for Gaia DR3 sources in the circle moving faster than `minPm`, fastest first.
 * One row more than the cap is asked for, so a full list can be told from a capped one.
 */
export function fastMoverUrl(
  area: FindArea,
  minPm: number,
  cap = CAP.gaia,
  base = VIZIER_ASU_TSV,
): string {
  const params = new URLSearchParams({
    '-source': 'I/355/gaiadr3',
    ...cone(area),
    '-out': 'DR3Name,RA_ICRS,DE_ICRS,pmRA,pmDE,PM,Gmag,Plx',
    PM: `>${minPm}`,
    '-sort': '-PM',
    '-out.max': String(cap + 1),
  });
  return `${base}?${params}`;
}

/**
 * The VizieR address for CatWISE2020 sources in the circle brighter than `maxW2` in W2, nearest
 * first (the colour cut is made here, by `coldObjects`). One row more than the cap is asked for.
 */
export function coldUrl(
  area: FindArea,
  maxW2 = W2_LIMIT,
  cap = CAP.catwise,
  base = VIZIER_ASU_TSV,
): string {
  const params = new URLSearchParams({
    '-source': 'II/365/catwise',
    ...cone(area),
    '-out.all': '1', // an empty value (`-out.all=`) gives no rows
    W2mproPM: `<${maxW2}`,
    '-sort': '_r',
    '-out.max': String(cap + 1),
  });
  return `${base}?${params}`;
}

/** A VizieR TSV answer as a header and rows of cells. */
export interface Table {
  header: string[];
  rows: string[][];
}

/**
 * Reads VizieR's tab-separated answer: comment lines (#), the header, a units line and a dashes
 * line, then the data. Throws when there is no header line: VizieR then sent its column notes
 * and nothing else, which is a failure, not "nothing found" (H5).
 */
export function readTable(text: string): Table {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const head = lines[0];
  if (!head || !head.includes('\t')) throw new Error('VizieR sent no table');
  const header = head.split('\t').map((s) => s.trim());
  // The data start after the dashes under the header (a units line comes between them).
  const dashes = lines.findIndex((l, i) => i > 0 && i <= 2 && /^[-\t ]+$/.test(l));
  const rows = lines.slice(dashes > 0 ? dashes + 1 : 1).map((l) => l.split('\t'));
  return { header, rows };
}

const num = (s: string | undefined): number => {
  const t = (s ?? '').trim();
  return t === '' ? Number.NaN : Number(t);
};

function column(t: Table, name: string): (row: string[]) => string | undefined {
  const i = t.header.indexOf(name);
  if (i < 0) throw new Error(`VizieR's table has no ${name} column`);
  return (row) => row[i];
}

/**
 * Gaia DR3 rows faster than `minPm` (mas/yr), fastest first. The cut is checked here too, so the
 * list never holds a row VizieR should not have sent.
 */
export function fastMovers(text: string, area: FindArea, minPm: number, cap = CAP.gaia): FindResult {
  const t = readTable(text);
  const [name, ra, dec, pmra, pmdec, pm, g, plx] = [
    'DR3Name',
    'RA_ICRS',
    'DE_ICRS',
    'pmRA',
    'pmDE',
    'PM',
    'Gmag',
    'Plx',
  ].map((c) => column(t, c));
  const all: CatalogueFind[] = [];
  for (const r of t.rows) {
    const p: CatalogueFind = {
      cat: 'gaia',
      id: (name!(r) ?? '').trim(),
      ra: num(ra!(r)),
      dec: num(dec!(r)),
      ep: 2016.0,
      pmra: num(pmra!(r)),
      pmdec: num(pmdec!(r)),
      pm: num(pm!(r)),
      g: num(g!(r)),
      plx: num(plx!(r)),
    };
    if (!p.id || !Number.isFinite(p.ra) || !Number.isFinite(p.dec)) continue;
    all.push(p);
  }
  const capped = all.length > cap;
  const rows = all
    .slice(0, cap)
    .filter((p) => p.pm > minPm)
    .sort((a, b) => b.pm - a.pm);
  return {
    cat: 'gaia',
    area,
    cut: `Gaia DR3 sources moving faster than ${minPm} mas/yr in total`,
    rows,
    looked: Math.min(all.length, cap),
    capped,
    noColour: 0,
  };
}

/**
 * CatWISE2020 rows redder than `minColour` in W1−W2 (magnitudes), reddest first. Rows with no
 * W1 value have no colour: they are left out and counted (H5: not measured is not a value).
 */
export function coldObjects(
  text: string,
  area: FindArea,
  minColour: number,
  maxW2 = W2_LIMIT,
  cap = CAP.catwise,
): FindResult {
  const t = readTable(text);
  const [name, ra, dec, pmra, pmdec, w1, w2] = [
    'Name',
    'RAPMdeg',
    'DEPMdeg',
    'pmRA',
    'pmDE',
    'W1mproPM',
    'W2mproPM',
  ].map((c) => column(t, c));
  const all: CatalogueFind[] = [];
  for (const r of t.rows) {
    const mag1 = num(w1!(r));
    const mag2 = num(w2!(r));
    // CatWISE lists motions in arcsec/yr.
    const ma = num(pmra!(r)) * 1000;
    const md = num(pmdec!(r)) * 1000;
    const p: CatalogueFind = {
      cat: 'catwise',
      id: `CWISE ${(name!(r) ?? '').trim()}`,
      ra: num(ra!(r)),
      dec: num(dec!(r)),
      ep: 2015.4019, // MJD 57170 (docs/data-format.md)
      pmra: ma,
      pmdec: md,
      pm: Math.hypot(ma, md),
      w1: mag1,
      w2: mag2,
      colour: mag1 - mag2,
    };
    if (p.id === 'CWISE ' || !Number.isFinite(p.ra) || !Number.isFinite(p.dec)) continue;
    all.push(p);
  }
  const capped = all.length > cap;
  const kept = all.slice(0, cap).filter((p) => (p.w2 ?? Number.NaN) < maxW2);
  const noColour = kept.filter((p) => !Number.isFinite(p.colour ?? Number.NaN)).length;
  const rows = kept
    .filter((p) => (p.colour ?? Number.NaN) > minColour)
    .sort((a, b) => (b.colour ?? 0) - (a.colour ?? 0));
  return {
    cat: 'catwise',
    area,
    cut: `CatWISE2020 sources brighter than ${maxW2} in W2 with W1−W2 above ${minColour.toFixed(1)} mag`,
    rows,
    looked: kept.length,
    capped,
    noColour,
  };
}

/** One page of a list: rows `from` to `to` (1-based, inclusive) of `total`. */
export function pageOf<T>(
  rows: readonly T[],
  page: number,
  size = PAGE_SIZE,
): { rows: T[]; page: number; pages: number; from: number; to: number; total: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.max(0, Math.min(pages - 1, Math.floor(page)));
  const slice = rows.slice(p * size, p * size + size);
  return {
    rows: slice,
    page: p,
    pages,
    from: slice.length ? p * size + 1 : 0,
    to: p * size + slice.length,
    total: rows.length,
  };
}

/** Where a source is at `year` (degrees), moved by its catalogue motion (none when not listed). */
export function placeAt(f: CatalogueFind, year = SPHEREX_YEAR): { ra: number; dec: number } {
  const pmra = Number.isFinite(f.pmra) ? f.pmra : 0;
  const pmdec = Number.isFinite(f.pmdec) ? f.pmdec : 0;
  return propagate(f.ra, f.dec, pmra, pmdec, f.ep, year);
}

/** The values of one row, in words, as the list shows them (all from the catalogue, H4). */
export function rowValues(f: CatalogueFind): string[] {
  const out: string[] = [];
  const fixed = (v: number | undefined, d: number): string | null =>
    v !== undefined && Number.isFinite(v) ? v.toFixed(d) : null;
  if (f.cat === 'gaia') {
    out.push(`${Math.round(f.pm).toLocaleString('en')} mas/yr`);
    const g = fixed(f.g, 2);
    if (g) out.push(`G ${g}`);
    const plx = fixed(f.plx, 1);
    out.push(plx ? `parallax ${plx} mas` : 'no parallax listed');
  } else {
    const c = fixed(f.colour, 2);
    if (c) out.push(`W1−W2 ${c}`);
    const w2 = fixed(f.w2, 2);
    if (w2) out.push(`W2 ${w2}`);
    const w1 = fixed(f.w1, 2);
    if (w1) out.push(`W1 ${w1}`);
    if (Number.isFinite(f.pm)) out.push(`${Math.round(f.pm).toLocaleString('en')} mas/yr`);
  }
  return out;
}

/** The circle searched, in words ("within 0.50° of 8h 55m … −7° 14′ …"). */
export function areaWords(area: FindArea): string {
  const r = area.radius >= 0.1 ? `${area.radius.toFixed(2)}°` : `${(area.radius * 60).toFixed(1)}′`;
  return `within ${r} of ${formatCoords(area.ra, area.dec)}`;
}
