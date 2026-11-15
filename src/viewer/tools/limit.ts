/**
 * How many catalogue marks the picture draws (lane DE). At wide fields a patch holds thousands of
 * Gaia DR3 stars; drawing a circle for each hides the picture and makes every frame slow. So
 * the picture draws only the brightest ones, and its legend says so (H2: say what is shown).
 * Pure, so it is tested in Node.
 */
import type { Neighbour } from '../../core/types.ts';

/** The most marks of one catalogue drawn on the picture at once. */
export const MARK_LIMIT = 250;

/** What `brightest` kept. */
export interface Kept<T> {
  rows: T[];
  /** How many there were before the cut. */
  total: number;
  /** The faintest magnitude kept, when rows were left out; null when all are drawn. */
  faintest: number | null;
}

/**
 * Keeps at most `limit` rows, the brightest first (smallest magnitude). The target's own rows
 * are always kept; rows with no magnitude count as faintest. Order of the kept rows is kept.
 */
export function brightest<T extends Pick<Neighbour, 'mag' | 'target'>>(rows: readonly T[], limit = MARK_LIMIT): Kept<T> {
  if (rows.length <= limit) return { rows: [...rows], total: rows.length, faintest: null };
  const mag = (r: T) => (Number.isFinite(r.mag) ? r.mag : Infinity);
  const order = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(!!b.r.target) - Number(!!a.r.target) || mag(a.r) - mag(b.r));
  const keep = order.slice(0, limit);
  const faintest = Math.max(...keep.filter((k) => !k.r.target).map((k) => mag(k.r)).filter(Number.isFinite));
  return {
    rows: keep.sort((a, b) => a.i - b.i).map((k) => k.r),
    total: rows.length,
    faintest: Number.isFinite(faintest) ? faintest : null,
  };
}
