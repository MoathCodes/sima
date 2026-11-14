/**
 * Gaia DR3 and CatWISE2020 rows, moved to the date of the picture: the overlays (Layers tab),
 * known-star matching and the neighbour rule (docs/data-format.md, "neighbours"). Owner: lane B.
 * Pure apart from `fetchCatalog`, which calls VizieR.
 *
 * PHASE 0 STUB: fixed fake values; fetchCatalog makes no request.
 */
import type { Neighbour, Target } from './types.ts';

/** VizieR's tab-separated query service at CfA (callable from the browser; not always up). */
export const VIZIER_ASU_TSV = 'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv';

/**
 * A catalogue source's position on a date, moved by its own motion from its epoch.
 * PHASE 0 STUB: the catalogue position, not moved.
 *
 * @param n The source.
 * @param mjd The picture's date.
 * @returns Degrees.
 */
export function atDate(n: Neighbour, mjd: number): { ra: number; dec: number } {
  return { ra: n.ra, dec: n.dec };
}

/**
 * The neighbour that makes an exposure unfit for measuring the target: a listed source within
 * 12.3″ of where the target should be on that date and at most 2.5 mag fainter than the
 * target's own entry in the same catalogue (with the stand-ins of data-format.md).
 * PHASE 0 STUB: never any.
 *
 * @returns The neighbour (named on screen), or null when the exposure can be measured.
 */
export function blendedWith(
  target: Target,
  neighbours: readonly Neighbour[],
  mjd: number,
): Neighbour | null {
  return null;
}

/**
 * Catalogue sources around a position, from VizieR (Gaia DR3 `I/355/gaiadr3`, CatWISE2020
 * `II/365/catwise`), in the same shape as frames.json's neighbours. Anonymous request.
 * PHASE 0 STUB: no request; always [].
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
  return [];
}
