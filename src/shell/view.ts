/**
 * The view: Discover (the beginner view) or Expert (today's app at the Measure level).
 * v2.0 contract 1 (BEGINNER-AND-MOBILE.md section 13). Owner: lane F.
 *
 * - Sets `html[data-view="discover" | "expert"]`: every lane styles views from that attribute.
 * - Remembers the view in `sima-view`. The old `b102-level` is read once to migrate it
 *   (`measure` → Expert); after that `sima-view` wins.
 * - `setView` calls lane H's `setLevel`: Discover is the Explore level, Expert the Measure level.
 *
 * Step 0: Discover is not built yet, so a visit opens Expert unless the link says `ui=discover`
 * (`DISCOVER_FIRST` is false), and at start the level is left as today's code restores it. When
 * Discover is ready, the integrator sets `DISCOVER_FIRST` to true (B-2: a first visit opens it).
 */
import { setLevel } from '../explore/game.ts';
import { viewFor, type Link, type View } from '../viewer/link.ts';

/** The two views, Discover and Expert. Also the link's `ui=` values. */
export type { View };

/** The browser key (SPEC 8.5). */
export const VIEW_KEY = 'sima-view';
const OLD_LEVEL_KEY = 'b102-level';

/** False until Discover is built: then a first visit opens Discover. */
export const DISCOVER_FIRST = false;

let view: View = 'expert';
const fns = new Set<(v: View) => void>();

/** The view now. */
export function getView(): View {
  return view;
}

/**
 * Switches the view: sets `html[data-view]`, remembers it, sets the level and tells listeners.
 * Keeps target, date, detector and field size (VIEW-2): only the level changes.
 */
export function setView(v: View): void {
  apply(v);
  setLevel(v === 'discover' ? 'explore' : 'measure');
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // Storage can be blocked: the view then lasts for this visit only.
  }
}

/**
 * Hear view changes.
 * @returns A function that stops listening.
 */
export function onView(fn: (v: View) => void): () => void {
  fns.add(fn);
  return () => {
    fns.delete(fn);
  };
}

/**
 * The remembered view: `sima-view`, else the old `b102-level` (`measure` → Expert, written over
 * to `sima-view` once), else null (a first visit).
 */
export function rememberedView(): View | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'discover' || v === 'expert') return v;
    if (localStorage.getItem(OLD_LEVEL_KEY) === 'measure') {
      localStorage.setItem(VIEW_KEY, 'expert');
      return 'expert';
    }
  } catch {
    // Blocked storage: nothing is remembered.
  }
  return null;
}

/**
 * Chooses the view at start from the link and the remembered view (VIEW-4) and applies it.
 * Called once by main.ts, after lane H's game has started. In step 0 an Expert start leaves the
 * level as it was restored, so the app looks as it did; only `ui=discover` changes the level.
 */
export function startView(link: Link, hash: string): View {
  const remembered = rememberedView();
  const v = viewFor(link, hash, remembered ?? (DISCOVER_FIRST ? 'discover' : 'expert'));
  // A chosen Expert (remembered, or asked for in the link) sets the Measure level itself now that
  // game.ts no longer restores b102-level. A first visit keeps today's start until Discover is first.
  if (remembered === null && link.ui === null && v === 'expert' && !DISCOVER_FIRST) apply(v);
  else setView(v);
  return v;
}

function apply(v: View): void {
  const changed = v !== view || document.documentElement.dataset.view !== v;
  view = v;
  document.documentElement.dataset.view = v;
  if (!changed) return;
  for (const fn of [...fns]) {
    try {
      fn(v);
    } catch (err) {
      console.error('view: an onView listener failed', err);
    }
  }
}
