/**
 * The message bus between the two halves of the page (SPEC 8.3). Owner: integrator (contract).
 *
 * - The sky half (src/sky, src/shell) knows the map, the patch, cards and places.
 * - The frame half (src/viewer, src/core) knows exposures, pictures and measurements.
 *
 * The halves talk only through these five messages. Units: degrees for positions, arcminutes for
 * field size, micrometres for wavelength, MJD for dates, detectors 1 to 6.
 *
 * Delivery is synchronous, in the order listeners subscribed. Each listener gets the same frozen
 * copy of the message. A listener that throws is reported with console.error and the others
 * still run. A message with a value out of range (a unit mix-up, NaN) is reported with
 * console.error and still delivered, so the smoke test fails but the page keeps working.
 */

/** Every message on the bus, by name. Exactly SPEC 8.3: change only with the integrator. */
export interface BusEvents {
  /**
   * Sky → frame: point the frame at this spot.
   *
   * Emitted by the sky half when the user drops the patch square, presses "Move the frame
   * here", or opens a place with the frame (shell.ts `openPlace`). viewer/load.ts aims there: a
   * shipped target when `target` names one, else the live service, else the labelled
   * simulation or "no pictures" (FRM-11).
   *
   * - `ra`, `dec`: degrees (ICRS).
   * - `fov`: arcminutes. Optional: without it the frame keeps its field size; with it the frame
   *   snaps it to the nearest step of FOVS.
   * - `target`: a shipped target key (`barnard`, …) when the spot is one of the five; else
   *   null or absent.
   * - `name`: optional, the place's name ("Andromeda Galaxy"): the frame's title, with the
   *   coordinates on the line under it (UX audit #5). Without it the title is the coordinates.
   */
  aim: { ra: number; dec: number; fov?: number; target?: string | null; name?: string };

  /**
   * Frame → sky: the patch the frame looks at now, and what it holds.
   *
   * Emitted by the frame (lane D) whenever any of these change, including each loading step.
   * The sky (lane C) draws the square from it: solid magenta for `real` and `live`, dashed amber
   * for `simulated`, dotted grey for `none`, dashed pale for `loading` (FRM-1).
   *
   * - `ra`, `dec`: patch centre, degrees.
   * - `fov`: field size, arcminutes (one of FOVS).
   * - `label`: the frame's title for the patch: a target's name or the coordinates.
   * - `target`: the shipped target key, or null.
   */
  patch: {
    ra: number;
    dec: number;
    fov: number;
    source: 'real' | 'live' | 'simulated' | 'none' | 'loading';
    label: string;
    target: string | null;
  };

  /**
   * Page → frame: the user chose a starter ("Runaway star", "Warm-up", …).
   *
   * Emitted by explore/game.ts `openStarter(id)` (lane H); other lanes call that function rather
   * than emitting this themselves. explore/game.ts handles it: it closes the welcome card, sets
   * the task in the frame and loads the starter's patch through viewer/load.ts.
   *
   * - `starter`: a starter id from explore/game.ts (`StarterId`).
   */
  start: { starter: string };

  /**
   * Bar → frame: show this detector.
   *
   * Emitted by the wavelength scale and the detector strip (lane D), and by anyone who wants
   * another detector (the guide's "Show me", the link). The frame sets `S.det` and moves the
   * wavelength handle into that band.
   *
   * - `det`: 1 to 6.
   */
  band: { det: number };

  /**
   * Frame → sky: what is on screen now.
   *
   * Emitted by the frame (lane D) whenever the picture on screen or the wavelength scale
   * changes. The sky (lane C) sets the map's channel from `lam`, because one wavelength scale
   * drives both (SKY-2, BAR-4), and names it in the sky note.
   *
   * - `lam`: µm, the wavelength scale's value; null in the Color view (the map keeps its channel).
   * - `mjd`: date of the picture on screen; null when there is none.
   * - `det`: detector on screen, 1 to 6.
   */
  shown: { lam: number | null; mjd: number | null; det: number };
}

/** The name of a bus message. */
export type BusEvent = keyof BusEvents;

/** What the patch holds, as the sky draws it. */
export type PatchSource = BusEvents['patch']['source'];

/** A listener for one kind of message. The message is frozen: do not change it. */
export type Listener<K extends BusEvent> = (msg: Readonly<BusEvents[K]>) => void;

/** Options for `on`. */
export interface OnOptions {
  /**
   * Call the listener at once with the last message of this type, if one was sent before.
   * Use it for the state-like messages (`patch`, `band`, `shown`) so the order in which parts
   * start does not matter. Do not use it for the actions (`aim`, `start`).
   */
  replay?: boolean;
}

type ListenerSets = { [K in BusEvent]: Set<Listener<K>> };

const listeners: ListenerSets = {
  aim: new Set(),
  patch: new Set(),
  start: new Set(),
  band: new Set(),
  shown: new Set(),
};
/** The last message of each type, for `replay`. */
const last = new Map<BusEvent, unknown>();

/**
 * Listen to one kind of message.
 *
 * @param type Message name.
 * @param fn Called synchronously with each message, in subscription order. Adding the same
 *   function twice for one type keeps one subscription.
 * @param opts `{ replay: true }` also calls `fn` at once with the last message, if any.
 * @returns A function that stops listening (the same as `off(type, fn)`).
 */
export function on<K extends BusEvent>(type: K, fn: Listener<K>, opts: OnOptions = {}): () => void {
  listeners[type].add(fn);
  const previous = last.get(type) as Readonly<BusEvents[K]> | undefined;
  if (opts.replay && previous !== undefined) deliver(type, fn, previous);
  return () => off(type, fn);
}

/**
 * Stop listening. Does nothing if `fn` was not listening to `type`.
 *
 * @param type Message name.
 * @param fn The function given to `on`.
 */
export function off<K extends BusEvent>(type: K, fn: Listener<K>): void {
  listeners[type].delete(fn);
}

/**
 * Send a message to every listener of its type, synchronously.
 *
 * The message is copied and frozen first, and kept as the last message of its type (for
 * `replay`). Values out of range are reported with console.error and still delivered.
 *
 * @param type Message name.
 * @param msg The message, in the units of BusEvents.
 */
export function emit<K extends BusEvent>(type: K, msg: BusEvents[K]): void {
  const frozen: Readonly<BusEvents[K]> = Object.freeze({ ...msg });
  const problem = check(type, frozen as unknown as Record<string, unknown>);
  if (problem) console.error(`bus: "${type}" message ${problem}`, frozen);
  last.set(type, frozen);
  // A copy, so listeners that subscribe or unsubscribe while this runs do not change this round.
  for (const fn of [...listeners[type]]) deliver(type, fn, frozen);
}

function deliver<K extends BusEvent>(type: K, fn: Listener<K>, msg: Readonly<BusEvents[K]>): void {
  try {
    fn(msg);
  } catch (err) {
    console.error(`bus: a "${type}" listener failed`, err);
  }
}

// ----- Range checks: they catch unit mix-ups (radians, degrees for arcmin, JD for MJD) --------

const SOURCES: readonly PatchSource[] = ['real', 'live', 'simulated', 'none', 'loading'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDet = (v: unknown): boolean =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 6;

function checkPosition(m: Record<string, unknown>): string | null {
  if (!isNum(m.ra) || m.ra < 0 || m.ra >= 360) return 'has ra outside 0 ≤ ra < 360 degrees';
  if (!isNum(m.dec) || m.dec < -90 || m.dec > 90) return 'has dec outside −90 to 90 degrees';
  return null;
}

/** Field size in arcminutes: one pixel is 0.1′, so anything under 1′ is a unit mix-up. */
function checkFov(fov: unknown): string | null {
  return isNum(fov) && fov >= 1 && fov <= 600 ? null : 'has fov outside 1 to 600 arcminutes';
}

/** Returns what is wrong with a message, or null when it looks right. */
function check(type: BusEvent, m: Record<string, unknown>): string | null {
  switch (type) {
    case 'aim':
      return checkPosition(m) ?? (m.fov === undefined ? null : checkFov(m.fov));
    case 'patch':
      if (!SOURCES.includes(m.source as PatchSource))
        return `has an unknown source "${String(m.source)}"`;
      if (typeof m.label !== 'string') return 'has no label';
      if (m.target !== null && typeof m.target !== 'string')
        return 'has a target that is not a string or null';
      return checkPosition(m) ?? checkFov(m.fov);
    case 'start':
      return typeof m.starter === 'string' && m.starter ? null : 'has no starter id';
    case 'band':
      return isDet(m.det) ? null : 'has det outside 1 to 6';
    case 'shown':
      if (m.lam !== null && !(isNum(m.lam) && m.lam >= 0.5 && m.lam <= 5.5)) {
        return 'has lam outside 0.5 to 5.5 µm';
      }
      if (m.mjd !== null && !(isNum(m.mjd) && m.mjd >= 40000 && m.mjd <= 90000)) {
        return 'has mjd outside 40000 to 90000 (MJD, not JD or a year)';
      }
      return isDet(m.det) ? null : 'has det outside 1 to 6';
    default:
      return 'is not a known message';
  }
}
