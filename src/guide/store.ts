/**
 * What the guide remembers in the browser, under `sima-guide` (SPEC 8.5): the tour in progress,
 * tours the user ended, the one-time tips already seen, the things tried, and "Show all the
 * numbers". Owner: lane H.
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
  /** "Show all the numbers" in Measure (MSR-2). */
  allNumbers: boolean;
}

export const STORE_KEY = 'sima-guide';

const TOURS: readonly TourId[] = ['main', 'numbers'];

/** An empty store. */
export function emptyStore(): GuideStore {
  return { tour: null, ended: [], finished: [], tips: [], tried: [], allNumbers: false };
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
  out.allNumbers = o.allNumbers === true;
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

/** Changes the store and saves it. */
export function saveStore(change: (s: GuideStore) => void): GuideStore {
  const s = readStore();
  change(s);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // Storage can be blocked: kept for this visit only.
  }
  return s;
}
