/**
 * What the guide remembers in the browser, under `sima-guide` (SPEC 8.5): the tour in progress,
 * tours the user ended, the one-time tips already seen and the things tried. Owner: lane H.
 *
 * The entry is shared: lane E keeps "Show all the numbers" (`allNumbers`) in it too. So the
 * guide only ever merges its own fields into what is there, and never writes the whole entry.
 *
 * `parseStore` is pure; `readStore` and `saveStore` wrap storage in `try`, because it can be
 * blocked (then the guide remembers for this visit only).
 */

/** The two tours. */
export type TourId = 'main' | 'numbers';

export interface GuideStore {
  /** The tour in progress and its step (from 0); null when none. Kept for "resume after reload". */
  tour: { id: TourId; step: number } | null;
  /** Tours the user ended with End tour: never offered again by themselves (O-G9). */
  ended: TourId[];
  /** Tours finished to the last step. */
  finished: TourId[];
  /** One-time tips already shown and closed (GDE-8). */
  tips: string[];
  /** Things to try that the user has done (the Guide menu's checklist). */
  tried: string[];
}

export const STORE_KEY = 'sima-guide';

const TOURS: readonly TourId[] = ['main', 'numbers'];

/** An empty store. */
export function emptyStore(): GuideStore {
  return { tour: null, ended: [], finished: [], tips: [], tried: [] };
}

/** Reads what storage held; anything unexpected is dropped, never trusted. */
export function parseStore(raw: string | null): GuideStore {
  const out = emptyStore();
  if (!raw) return out;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!v || typeof v !== 'object') return out;
  const o = v as Record<string, unknown>;
  const strings = (x: unknown) =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(0, 64) : [];
  const tours = (x: unknown) => strings(x).filter((s): s is TourId => TOURS.includes(s as TourId));
  const t = o.tour as Record<string, unknown> | null | undefined;
  if (
    t &&
    typeof t === 'object' &&
    TOURS.includes(t.id as TourId) &&
    Number.isInteger(t.step) &&
    (t.step as number) >= 0
  ) {
    out.tour = { id: t.id as TourId, step: t.step as number };
  }
  out.ended = tours(o.ended);
  out.finished = tours(o.finished);
  out.tips = strings(o.tips);
  out.tried = strings(o.tried);
  // A tour the user ended is never in progress (O-G9).
  if (out.tour && out.ended.includes(out.tour.id)) out.tour = null;
  return out;
}

let cache: GuideStore | null = null;

/** The store, read once per visit. */
export function readStore(): GuideStore {
  if (cache) return cache;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    // Storage can be blocked: start empty.
  }
  cache = parseStore(raw);
  return cache;
}

/** Changes the guide's fields and saves them, keeping every other field in the entry. */
export function saveStore(change: (s: GuideStore) => void): GuideStore {
  const s = readStore();
  change(s);
  let others: Record<string, unknown> = {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) others = raw as Record<string, unknown>;
  } catch {
    // Blocked, or not JSON: there is nothing of anyone's to keep.
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(mergeStore(others, s)));
  } catch {
    // Storage can be blocked: kept for this visit only.
  }
  return s;
}

/** The entry to write: what was there, with the guide's own fields replaced. Pure. */
export function mergeStore(others: Record<string, unknown>, s: GuideStore): Record<string, unknown> {
  return {
    ...others,
    tour: s.tour,
    ended: s.ended,
    finished: s.finished,
    tips: s.tips,
    tried: s.tried,
  };
}
