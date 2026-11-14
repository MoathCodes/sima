/**
 * The frame half's one state object (SPEC 8.4). Owner: lane D. A contract: change the shape only
 * with the integrator (AGENTS.md); adding an optional field is fine if you tell the lanes.
 *
 * Who may write: every field below says which lane writes it. Everyone may read S (the guide
 * reads it to know what the user did). The sky half (src/sky, src/shell) learns about the frame
 * through the bus, not through S.
 *
 * How to write: assign a whole field (`S.mode = 'diff'`). Objects and arrays in S are treated as
 * read-only: to change one, assign a new one (`S.pic = { ...S.pic, invert: true }`), because
 * only assignments are noticed.
 *
 * How to hear changes: `watch(['epoch', 'mode'], redraw)`. Changes are batched: the listener runs
 * once, in a microtask after the writes, with every key that changed.
 *
 * Pure: no page access, so tests run in Node. Saving to the browser is done by the lane that owns
 * each storage key (docs/lanes.md), not here.
 */
import type { Det, Field, Group, RealSet } from '../core/types.ts';
import { DEFAULT_PIC, withoutCleanup, type PicSettings } from '../core/picture.ts';
import type { PatchSource } from '../shell/bus.ts';

/** Field size steps, arcminutes (FRM-6). */
export const FOVS = [3, 6, 12, 24, 48] as const;
/** A field size step, arcminutes. */
export type Fov = (typeof FOVS)[number];

/** How the frame shows the dates (FRM-7): Flip, Swipe, Two dates, Difference, Stack, Trail. */
export type Mode = 'flip' | 'swipe' | 'two' | 'diff' | 'stack' | 'trail';

/** Explore (the default: simple controls, lettered dates) or Measure (the expert level). */
export type Level = 'explore' | 'measure';

/** The views each level offers, in the order they are shown. The link's `view=` uses these names. */
export const VIEWS: { readonly [L in Level]: readonly Mode[] } = {
  explore: ['flip', 'two', 'diff'],
  measure: ['flip', 'swipe', 'two', 'diff', 'stack', 'trail'],
};

/** Loop style: forward, or forward then back (BAR-3). */
export type Loop = 'forward' | 'bounce';

/** Playback speeds (BAR-3). At 1× a picture lasts 600 ms; never faster than 2.5 a second. */
export const SPEEDS = [0.6, 1, 1.5] as const;
export type Speed = (typeof SPEEDS)[number];

/** The four tabs of the picture tools (docs/tools.md). */
export type ToolsTab = 'picture' | 'clean' | 'find' | 'layers';

/** The chart tabs of Measure (MSR-3). */
export type MeasureTab = 'spectrum' | 'brightness' | 'folded' | 'path' | 'cutouts' | 'exposure';

/** What Measure is about. With nothing selected it shows "The picture on screen" (MSR-5). */
export type Selection =
  /** The patch's own test target. */
  | { kind: 'target' }
  /** A catalogue source in the picture. Positions in degrees at the catalogue's epoch. */
  | { kind: 'source'; cat: 'gaia' | 'catwise'; id: string; ra: number; dec: number }
  /** A candidate from the change search (core/detect.ts), by its id. */
  | { kind: 'candidate'; id: string; ra: number; dec: number }
  /** Any other spot the user picked in the picture, measured as a fixed spot. */
  | { kind: 'spot'; ra: number; dec: number };

/** What the frame waits for while it loads (GEN-4: what, how far, what works meanwhile). */
export interface LoadState {
  /** In words, e.g. "Searching NASA's archive for SPHEREx exposures of this spot…". */
  what: string;
  /** Exposures fetched so far and wanted in this step; null while not known. */
  done: number | null;
  total: number | null;
  /** Shipped data, or the live service's step (docs/live-service.md). */
  step: 'shipped' | 'queued' | 'searching' | 'first' | 'rest';
  /** performance.now() when it started: a cover shows only if the wait lasts 0.25 s. */
  since: number;
}

/** The frame half's state. Units as on the bus: degrees, arcminutes, µm, MJD. */
export interface State {
  // ----- The patch: where the frame looks. Written by lane D (load.ts, field size, dragging
  // ----- inside the picture). Lane F's url.ts and lane H's game ask through aimAt/loadTarget.

  /** Patch centre, degrees. */
  ra: number;
  dec: number;
  /** Field size, arcminutes. */
  fov: Fov;
  /** Shipped target key (`barnard`, …) or practice key (`warm-up`, …); null for any other spot. */
  target: string | null;
  /** The frame's title: the target's name, or the coordinates. */
  label: string;
  /** What the frame shows now; the same values as the bus's `patch.source`. */
  source: PatchSource;

  // ----- The data. Written by lane D (load.ts).

  /** Decoded real exposures in their own pixels; null when simulated or none. */
  set: RealSet | null;
  /** Every exposure on the viewer's grid (real or simulated); null when there are none. */
  field: Field | null;
  /** Loading progress; null when nothing loads. */
  load: LoadState | null;

  // ----- Playback. Written by lane D (playback.ts and the bar); others call playback.ts.

  /**
   * The flip-book: the pictures to step through, built from `field` for the detector on screen.
   * Explore: one group per visit window (A, B, C). Measure: one per visit. "Same wavelength only"
   * leaves out the ones whose colour does not match the reference.
   */
  groups: Group[];
  /** Index into `groups` of the picture on screen. */
  epoch: number;
  /** Index into `groups` of the reference: the earlier date in Two dates and Swipe (red). */
  ref: number;
  playing: boolean;
  loop: Loop;
  speed: Speed;

  // ----- What is shown. Written by lane D, except `level` (lane H's setLevel) and `mode`
  // ----- (lane D's views; lane H's tour may switch it; lane F's url.ts sets it from a link).

  level: Level;
  /** The view. Must be one of VIEWS[level]. */
  mode: Mode;
  /** Detector on screen, 1 to 6. Follows `lam`; to change it from outside, emit `band`. */
  det: Det;
  /** The wavelength scale's value, µm (0.75 to 5.0). It also sets the sky map's channel. */
  lam: number;
  /** Color view: all six detectors as one colour picture (the link's `det=color`). */
  color: boolean;
  /** "Same wavelength only" (BAR-5). */
  sameColour: boolean;
  /** Swipe divider, 0 (all reference) to 1 (all current). */
  swipe: number;

  // ----- Picture settings. Written by lane E (tools), and by lane F's url.ts from a link.

  /** Saved picture settings. Read the settings in force with `pic()`, not this. */
  pic: PicSettings;
  /** True when `pic` came from a shared link: then Explore uses it too (docs/tools.md). */
  picLinked: boolean;
  /** "Original": show the pixels as recorded, every clean-up step off. Never saved. */
  original: boolean;

  // ----- Selection and panels. Written by lane E, except where noted.

  /** What Measure is about; null for "the picture on screen". Lane H's game may set it. */
  selected: Selection | null;
  /** The picture tools panel is open (Measure only). The frame's sliders button (lane D) sets it. */
  tools: boolean;
  toolsTab: ToolsTab;
  /** The chart tab in Measure; null means the one chart that fits the headline (MSR-1). */
  measureTab: MeasureTab | null;
  /** "Show all the numbers" is on. Lane H keeps it in `sima-guide` and restores it at start. */
  allNumbers: boolean;

  // ----- The page. Written by lane F's url.ts at start.

  /** `embed=1`: only the frame, the bar and Measure, in the page flow (GEN-3). */
  embed: boolean;
}

/** The name of a field of S. */
export type StateKey = keyof State;

function initialState(): State {
  return {
    ra: 0,
    dec: 0,
    fov: 6,
    target: null,
    label: '',
    source: 'none',
    set: null,
    field: null,
    load: null,
    groups: [],
    epoch: 0,
    ref: 0,
    playing: false,
    loop: 'forward',
    speed: 1,
    level: 'explore',
    mode: 'flip',
    det: 3,
    lam: 2.0,
    color: false,
    sameColour: false,
    swipe: 0.5,
    pic: DEFAULT_PIC,
    picLinked: false,
    original: false,
    selected: null,
    tools: false,
    toolsTab: 'picture',
    measureTab: null,
    allNumbers: false,
    embed: false,
  };
}

type WatchFn = (changed: ReadonlySet<StateKey>) => void;
interface Watcher {
  keys: ReadonlySet<StateKey> | null;
  fn: WatchFn;
}

const watchers = new Set<Watcher>();
let pending = new Set<StateKey>();
let scheduled = false;
/** Flushes in a row where listeners kept changing S; a loop between listeners is cut at 50. */
let rounds = 0;

function flush(): void {
  scheduled = false;
  const changed: ReadonlySet<StateKey> = pending;
  pending = new Set();
  rounds += 1;
  if (rounds > 50) {
    console.error('state: watch() listeners keep changing each other; stopped at', [...changed]);
    rounds = 0;
    return;
  }
  for (const w of [...watchers]) {
    if (w.keys && ![...changed].some((k) => w.keys!.has(k))) continue;
    try {
      w.fn(changed);
    } catch (err) {
      console.error('state: a watch() listener failed', err);
    }
  }
  if (!scheduled) rounds = 0;
}

const raw = initialState();

/**
 * The one state object. Reading is plain property access. Writing a field that is not part of
 * State, or deleting one, is refused and reported with console.error.
 */
export const S: State = new Proxy(raw, {
  set(target, key, value: unknown) {
    if (typeof key !== 'string' || !Object.hasOwn(target, key)) {
      console.error(`state: S.${String(key)} is not a field of State (viewer/state.ts)`);
      return true;
    }
    const k = key as StateKey;
    if (Object.is(target[k], value)) return true;
    (target as unknown as Record<StateKey, unknown>)[k] = value;
    pending.add(k);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
    return true;
  },
  deleteProperty(_target, key) {
    console.error(`state: S.${String(key)} cannot be deleted`);
    return true;
  },
});

/**
 * Hear changes to S.
 *
 * @param keys The fields to hear about; null for every field.
 * @param fn Called once per batch of writes (in a microtask), with every key that changed in
 *   the batch, if any of them is in `keys`. Writes inside `fn` start a new batch.
 * @returns A function that stops listening.
 */
export function watch(keys: readonly StateKey[] | null, fn: WatchFn): () => void {
  const w: Watcher = { keys: keys ? new Set(keys) : null, fn };
  watchers.add(w);
  return () => {
    watchers.delete(w);
  };
}

/**
 * The picture settings in force right now. Use this, not `S.pic`, to paint and measure:
 * - In Explore the game shows the default look, unless the settings came from a shared link.
 * - With "Original" on, every clean-up step is off; the display settings stay.
 */
export function pic(): PicSettings {
  const base = S.level === 'explore' && !S.picLinked ? DEFAULT_PIC : S.pic;
  return S.original ? withoutCleanup(base) : base;
}

/**
 * The field size step closest to a size in arcminutes, compared by ratio: 8′ gives 6′ and 9′
 * gives 12′. A size that is not a positive number gives 6′.
 *
 * @param arcmin A field size in arcminutes.
 */
export function nearestFov(arcmin: number): Fov {
  if (!Number.isFinite(arcmin) || arcmin <= 0) return 6;
  let best: Fov = FOVS[0];
  for (const f of FOVS) {
    if (Math.abs(Math.log(arcmin / f)) < Math.abs(Math.log(arcmin / best))) best = f;
  }
  return best;
}
