/**
 * The static seed: real patches fetched ahead of time for the tour stops and the top places
 * (scripts/seed_live.py, docs/live-service.md "Seed"), served by any static host from
 * `VITE_SEED_BASE`. The frame opens a seeded spot from there before it asks the live service,
 * so these spots open at once, even when NASA's archive or the service is down. Without
 * `VITE_SEED_BASE` nothing here does anything. Owner: lane D.
 *
 * Also the honest words for a live patch's source: "fetched live" only for files fetched for
 * this visit, else the date they were fetched.
 */
import { formatDate } from '../core/astro.ts';
import { offsetArcmin } from './surround.ts';
import type { LiveBlock, SeedEntry, SeedIndex } from '../core/types.ts';

/** Where the seed folder is served (`…/index.json`, `…/<id>/full/`), or '' when there is none. */
export const SEED_BASE: string = (import.meta.env?.VITE_SEED_BASE ?? '').replace(/\/$/, '');

/** Files written this long ago or less, and not fetched ahead, count as fetched live, ms. */
export const LIVE_FRESH_MS = 60 * 60 * 1000;

/**
 * The seeded patch whose cutouts hold a field, or null: the narrowest, then the nearest. The same
 * rule as the live service's coverage reuse (scripts/live.py `covers`): the field fits inside the
 * cutout less its margin, and a patch is used only up to two steps wider than asked (at least
 * 12′), so a small field never downloads a 48′ patch.
 *
 * @param fov Field side, arcmin (the live service's size, 3 to 48).
 */
export function seedCovering(index: SeedIndex, ra: number, dec: number, fov: number): SeedEntry | null {
  let best: SeedEntry | null = null;
  let bestKey = [Infinity, Infinity];
  for (const e of index.patches) {
    if (e.fov > Math.max(12, 2 * fov)) continue;
    const o = offsetArcmin(e, ra, dec);
    const reach = (e.size * 60 - 0.6) / 2 - fov / 2;
    if (Math.abs(o.x) > reach || Math.abs(o.y) > reach) continue;
    const key = [e.fov, Math.hypot(o.x, o.y)];
    if (key[0]! < bestKey[0]! || (key[0] === bestKey[0] && key[1]! < bestKey[1]!)) {
      best = e;
      bestKey = key;
    }
  }
  return best;
}

let index: Promise<SeedIndex | null> | null = null;

/** The seed's index, fetched once (again after a failure); null without a seed. */
export function seedIndex(): Promise<SeedIndex | null> {
  if (!SEED_BASE) return Promise.resolve(null);
  index ??= fetch(`${SEED_BASE}/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<SeedIndex>) : null))
    .then((d) => (d && d.version === 1 && Array.isArray(d.patches) ? d : null))
    .catch(() => null)
    .then((d) => {
      if (!d) index = null;
      return d;
    });
  return index;
}

/**
 * The folder of a seeded patch that holds a field (`<base>/<id>/full/`), with its id; null when
 * there is no seed or no seeded patch holds it.
 */
export async function seedFor(ra: number, dec: number, fov: number): Promise<{ id: string; folder: string } | null> {
  const ix = await seedIndex();
  const e = ix && seedCovering(ix, ra, dec, fov);
  return e ? { id: e.id, folder: `${SEED_BASE}/${e.id}/full/` } : null;
}

/**
 * How a live patch was fetched, in words for the source label: "fetched live" when its files were
 * fetched for this visit (in the last hour, not ahead), else "fetched 14 Nov 2026". Never
 * "fetched live" for a patch the seed job fetched ahead.
 */
export function liveWords(live: LiveBlock | undefined, now = Date.now()): string {
  const t = live ? Date.parse(live.fetched) : Number.NaN;
  if (!live || !Number.isFinite(t)) return 'fetched live';
  if (!live.ahead && now - t <= LIVE_FRESH_MS) return 'fetched live';
  return `fetched ${formatDate(t / 86_400_000 + 40_587, 'day')}`;
}

/** The longer note for the same: where the exposures came from and when. */
export function liveTip(live: LiveBlock | undefined, now = Date.now()): string {
  const words = liveWords(live, now);
  if (words === 'fetched live') return 'Real exposures fetched from NASA’s archive (IRSA) for this spot just now';
  return `Real exposures from NASA’s archive (IRSA), ${words}${live?.ahead ? ', ahead of time for this spot' : ''}`;
}
