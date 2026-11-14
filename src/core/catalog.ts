/**
 * Gaia DR3 and CatWISE2020 rows, moved to the date of the picture: the overlays (Layers tab),
 * known-star matching and the neighbour rule (docs/data-format.md, "neighbours"). Owner: lane B.
 * Pure apart from `fetchCatalog`, which calls VizieR.
 */
import type { Neighbour, Target } from './types.ts';
import { mjdToYear, propagate, separation } from './astro.ts';

/** VizieR's tab-separated query service at CfA (callable from the browser; not always up). */
export const VIZIER_ASU_TSV = 'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv';

/** How far the measurement looks for the target: 2 pixels, 12.3″. */
export const BLEND_RADIUS_ARCSEC = 12.3;
/** A neighbour matters when it is at most this many magnitudes fainter than the target. */
export const BLEND_MAG = 2.5;

/**
 * A catalogue source's position on a date, moved by its own motion from its epoch.
 *
 * @param n The source.
 * @param mjd The picture's date.
 * @returns Degrees.
 */
export function atDate(n: Neighbour, mjd: number): { ra: number; dec: number } {
  return propagate(n.ra, n.dec, n.pmra, n.pmdec, n.ep, mjdToYear(mjd));
}

/**
 * The neighbour that makes an exposure unfit for measuring the target: a listed source within
 * 12.3″ of where the target should be on that date and at most 2.5 mag fainter than the
 * target's own entry in the same catalogue (with the stand-ins of data-format.md: where CatWISE
 * does not list the target, its Gaia G stands in for W1; where Gaia does not list it, a Gaia
 * neighbour of any brightness counts). The target's own entries never count. When several
 * qualify, the nearest is named.
 *
 * @returns The neighbour (named on screen), or null when the exposure can be measured.
 */
export function blendedWith(
  target: Target,
  neighbours: readonly Neighbour[],
  mjd: number,
): Neighbour | null {
  const own = (cat: 'gaia' | 'catwise'): number => {
    let best = Infinity;
    for (const n of neighbours) if (n.target && n.cat === cat && n.mag < best) best = n.mag;
    return best;
  };
  const gaiaMag = own('gaia');
  const wiseMag = own('catwise');
  const limit = (cat: 'gaia' | 'catwise'): number => {
    if (cat === 'gaia') return Number.isFinite(gaiaMag) ? gaiaMag + BLEND_MAG : Infinity;
    if (Number.isFinite(wiseMag)) return wiseMag + BLEND_MAG;
    return Number.isFinite(gaiaMag) ? gaiaMag + BLEND_MAG : Infinity;
  };
  const year = mjdToYear(mjd);
  const t = propagate(target.ra, target.dec, target.pmra, target.pmdec, target.ep, year);
  let found: Neighbour | null = null;
  let bestSep = Infinity;
  for (const n of neighbours) {
    if (n.target) continue;
    if (!(n.mag <= limit(n.cat))) continue;
    const p = atDate(n, mjd);
    const sep = separation(p.ra, p.dec, t.ra, t.dec) * 3600;
    if (sep <= BLEND_RADIUS_ARCSEC && sep < bestSep) {
      bestSep = sep;
      found = n;
    }
  }
  return found;
}

/** The VizieR columns asked for, per catalogue. */
const COLUMNS = {
  gaia: { table: 'I/355/gaiadr3', cols: ['DR3Name', 'RA_ICRS', 'DE_ICRS', 'pmRA', 'pmDE', 'Gmag'] },
  catwise: {
    table: 'II/365/catwise',
    cols: ['Name', 'RAPMdeg', 'DEPMdeg', 'pmRA', 'pmDE', 'W1mproPM', 'W2mproPM'],
  },
} as const;

/**
 * VizieR's TSV answer → rows in the shape of frames.json's neighbours (docs/data-format.md):
 * Gaia at 2016.0, CatWISE at MJD 57170 (2015.4019) with its arcsec/yr motions times 1000, W1, or
 * W2 when W1 is empty. Rows with no magnitude are left out.
 */
export function parseVizierTsv(cat: 'gaia' | 'catwise', text: string): Neighbour[] {
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  // Header, units line, dashes line, then data.
  const header = lines[0]?.split('\t').map((s) => s.trim()) ?? [];
  const idx = (name: string): number => header.indexOf(name);
  const out: Neighbour[] = [];
  const num = (s: string | undefined): number => {
    const t = (s ?? '').trim();
    return t === '' ? Number.NaN : Number(t);
  };
  for (const line of lines.slice(1)) {
    if (/^[-\s]+$/.test(line) || /^(deg|mas|mag|"|arcsec)/.test(line.trim())) continue;
    const c = line.split('\t');
    if (cat === 'gaia') {
      const ra = num(c[idx('RA_ICRS')]);
      const dec = num(c[idx('DE_ICRS')]);
      const mag = num(c[idx('Gmag')]);
      if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(mag)) continue;
      const pmra = num(c[idx('pmRA')]);
      const pmdec = num(c[idx('pmDE')]);
      const name = (c[idx('DR3Name')] ?? '').trim();
      out.push({
        cat,
        id: name || `Gaia DR3 at ${ra.toFixed(5)} ${dec.toFixed(5)}`,
        ra,
        dec,
        ep: 2016.0,
        pmra: Number.isFinite(pmra) ? pmra : 0,
        pmdec: Number.isFinite(pmdec) ? pmdec : 0,
        mag,
      });
    } else {
      const ra = num(c[idx('RAPMdeg')]);
      const dec = num(c[idx('DEPMdeg')]);
      const w1 = num(c[idx('W1mproPM')]);
      const w2 = num(c[idx('W2mproPM')]);
      const mag = Number.isFinite(w1) ? w1 : w2;
      if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(mag)) continue;
      const pmra = num(c[idx('pmRA')]) * 1000;
      const pmdec = num(c[idx('pmDE')]) * 1000;
      out.push({
        cat,
        id: `CWISE ${(c[idx('Name')] ?? '').trim()}`,
        ra,
        dec,
        ep: mjdToYear(57170),
        pmra: Number.isFinite(pmra) ? pmra : 0,
        pmdec: Number.isFinite(pmdec) ? pmdec : 0,
        mag,
      });
    }
  }
  return out;
}

/**
 * Catalogue sources around a position, from VizieR (Gaia DR3 `I/355/gaiadr3`, CatWISE2020
 * `II/365/catwise`), in the same shape as frames.json's neighbours. Anonymous request (the
 * browser's own headers; nothing about the user is sent). Rejects on a network error or an
 * answer that is not a table, so the caller can say the catalogue is unavailable (H5) rather
 * than show an empty sky.
 *
 * @param cat Which catalogue.
 * @param ra Degrees.
 * @param dec Degrees.
 * @param radius Degrees.
 * @param signal To cancel the request.
 */
export async function fetchCatalog(
  cat: 'gaia' | 'catwise',
  ra: number,
  dec: number,
  radius: number,
  signal?: AbortSignal,
): Promise<Neighbour[]> {
  const spec = COLUMNS[cat];
  const params = new URLSearchParams({
    '-source': spec.table,
    '-c': `${ra.toFixed(6)} ${dec >= 0 ? '+' : ''}${dec.toFixed(6)}`,
    '-c.rd': radius.toFixed(5),
    '-out': spec.cols.join(','),
    '-out.max': '2000',
    '-sort': '_r',
  });
  const res = await fetch(`${VIZIER_ASU_TSV}?${params}`, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`VizieR answered ${res.status}`);
  const text = await res.text();
  if (!text.includes('\t')) throw new Error('VizieR sent no table');
  return parseVizierTsv(cat, text);
}
