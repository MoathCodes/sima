/**
 * The workspace as data (SPEC 10 O-V4; SPEC-v1 8.4 and F8): the main frame, the extra frames,
 * their link groups and the sky's view, with a schema version. Owner: integrator (workspace).
 *
 * Pure: no page access, so tests run in Node. The page side is store.ts (saving in the browser,
 * named workspaces, files) and share links (`#w=`, encoded here).
 *
 * Versions:
 * - 1: the draft in docs/SPEC-v1-workspace-plan.md 8.4 (frames with `size`, detectors 0 to 5 or
 *   `colour`, a `step` index, saved places). Migrated to 2 with a note for what cannot come along.
 * - 2: this file. The main frame is part of the workspace; a frame keeps its date as an MJD, not
 *   an index, so it survives a patch whose dates differ.
 *
 * Anything else (no version, a newer one, not an object) is refused with a plain message.
 */
import { FOVS, nearestFov, type Fov, type Mode } from '../viewer/state.ts';

export const SCHEMA_VERSION = 2;
/** At most this many extra frames (SPEC-v1 F4: performance and screen space). */
export const MAX_FRAMES = 6;
/** The smallest an extra frame may be sized, CSS pixels (SPEC-v1 F4). */
export const MIN_W = 220;
export const MIN_H = 220;
/** A share link longer than this offers the JSON file instead (SPEC-v1 F8). */
export const LINK_LIMIT = 4000;

/** What an extra frame shows (SPEC-v1 F5). */
export type FrameType = 'blink' | 'two' | 'diff' | 'spectrum' | 'brightness' | 'stack' | 'info';

export const FRAME_TYPES: readonly FrameType[] = [
  'blink',
  'two',
  'diff',
  'spectrum',
  'brightness',
  'stack',
  'info',
];

/** Each type's name and one plain line, for the tray, the title bar and the menus. */
export const TYPE_WORDS: { readonly [T in FrameType]: { name: string; line: string } } = {
  blink: { name: 'Blink', line: 'The dates one after another, as a little video' },
  two: { name: 'Two dates', line: 'The earliest date in red, this one in cyan' },
  diff: { name: 'Difference', line: 'This date minus the typical sky' },
  spectrum: { name: 'Spectrum', line: 'Light against wavelength, built as the dates play' },
  brightness: { name: 'Brightness', line: 'Change over time, each detector against itself' },
  stack: { name: 'Stack', line: 'Every exposure added up, to see what is too faint for one' },
  info: { name: 'Info', line: 'The exposures behind the picture, with their files' },
};

/** Pinned frames follow their spot on the sky as it pans; docked frames stay put on screen. */
export type FrameMode = 'pinned' | 'docked';

/** One extra frame. Angles in degrees, field size in arcminutes, dates in MJD. */
export interface FrameState {
  /** Unique within the workspace: `f1`, `f2`… */
  id: string;
  type: FrameType;
  /** Where it looks. */
  anchor: { ra: number; dec: number };
  fov: Fov;
  mode: FrameMode;
  /**
   * The window, CSS pixels. Docked: its top left on screen. Pinned: its top left relative to the
   * anchor's point on screen. `w` and `h` at least MIN_W and MIN_H.
   */
  box: { x: number; y: number; w: number; h: number };
  /** Detector, 1 to 6. */
  det: number;
  /** The date on screen (the middle of its exposures); null for the first. */
  mjd: number | null;
  /** "Same wavelength only" (SPEC-v1 F5: on by default in Blink). */
  sameColour: boolean;
  /** Link group id, or null. */
  link: string | null;
}

/** Frames that move together (DS9's "lock frames", SPEC-v1 F7). */
export interface LinkGroup {
  id: string;
  /** Step through the dates together. */
  time: boolean;
  /** Look at the same spot. */
  position: boolean;
  /** Show the same detector. */
  detector: boolean;
}

/** The main frame: the one the bar, Measure, the tools and the guide drive. */
export interface MainState {
  ra: number;
  dec: number;
  fov: Fov;
  /** A shipped target key, when it shows one. */
  target: string | null;
  det: number;
  mode: Mode;
  mjd: number | null;
  link: string | null;
}

/** Everything a workspace restores. */
export interface Workspace {
  v: typeof SCHEMA_VERSION;
  name: string;
  /** The sky's view: centre in degrees, width in DEGREES. Null keeps the sky where it is. */
  camera: { ra: number; dec: number; fov: number } | null;
  /** Null keeps the main frame as it is. */
  main: MainState | null;
  frames: FrameState[];
  links: LinkGroup[];
}

/** A workspace with no extra frames. */
export function emptyWorkspace(name = 'My workspace'): Workspace {
  return { v: SCHEMA_VERSION, name, camera: null, main: null, frames: [], links: [] };
}

// ----- Reading a workspace from outside (a link, a file, the browser) ------------------------

const MODES: readonly Mode[] = ['flip', 'swipe', 'two', 'diff', 'stack', 'trail'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrapRa = (ra: number) => (ra >= 0 && ra < 360 ? ra : ((ra % 360) + 360) % 360);

function position(o: unknown): { ra: number; dec: number } | null {
  if (!isObj(o)) return null;
  const ra = num(o.ra);
  const dec = num(o.dec);
  if (ra === null || dec === null || dec < -90 || dec > 90) return null;
  return { ra: wrapRa(ra), dec };
}

function detOf(v: unknown): number | null {
  const d = num(v);
  return d !== null && Number.isInteger(d) && d >= 1 && d <= 6 ? d : null;
}

function fovOf(v: unknown): Fov {
  const f = num(v);
  return f !== null && (FOVS as readonly number[]).includes(f) ? (f as Fov) : nearestFov(f ?? 6);
}

function boxOf(v: unknown): FrameState['box'] {
  const b = isObj(v) ? v : {};
  return {
    x: Math.round(num(b.x) ?? 0),
    y: Math.round(num(b.y) ?? 0),
    w: Math.round(clamp(num(b.w) ?? 260, MIN_W, 2000)),
    h: Math.round(clamp(num(b.h) ?? 320, MIN_H, 2000)),
  };
}

function frameOf(o: unknown, ids: Set<string>): FrameState | null {
  if (!isObj(o)) return null;
  const anchor = position(o.anchor);
  const type = FRAME_TYPES.find((t) => t === o.type);
  if (!anchor || !type) return null;
  let id = typeof o.id === 'string' && /^[\w-]{1,24}$/.test(o.id) ? o.id : '';
  if (!id || ids.has(id)) {
    let k = 1;
    while (ids.has(`f${k}`)) k++;
    id = `f${k}`;
  }
  ids.add(id);
  return {
    id,
    type,
    anchor,
    fov: fovOf(o.fov),
    mode: o.mode === 'docked' ? 'docked' : 'pinned',
    box: boxOf(o.box),
    det: detOf(o.det) ?? 3,
    mjd: num(o.mjd),
    sameColour: o.sameColour === true,
    link: typeof o.link === 'string' ? o.link : null,
  };
}

function linkOf(o: unknown): LinkGroup | null {
  if (!isObj(o) || typeof o.id !== 'string' || !o.id) return null;
  return { id: o.id, time: o.time === true, position: o.position === true, detector: o.detector === true };
}

function mainOf(o: unknown): MainState | null {
  const at = position(o);
  if (!at || !isObj(o)) return null;
  return {
    ...at,
    fov: fovOf(o.fov),
    target: typeof o.target === 'string' ? o.target : null,
    det: detOf(o.det) ?? 3,
    mode: MODES.find((m) => m === o.mode) ?? 'flip',
    mjd: num(o.mjd),
    link: typeof o.link === 'string' ? o.link : null,
  };
}

function cameraOf(o: unknown): Workspace['camera'] {
  const at = position(o);
  const fov = isObj(o) ? num(o.fov) : null;
  // Past 180 the sky is a whole globe (src/sky/project.ts), so a saved globe view reopens as one.
  return at && fov !== null && fov > 0 ? { ...at, fov: clamp(fov, 0.05, 360) } : null;
}

/** Checks a version-2 workspace field by field; what is wrong is dropped and named. */
function check(o: Obj, notes: string[]): Workspace {
  const ids = new Set<string>();
  const rawFrames = Array.isArray(o.frames) ? o.frames : [];
  const frames = rawFrames.map((f) => frameOf(f, ids)).filter((f): f is FrameState => !!f);
  if (frames.length < rawFrames.length) {
    const n = rawFrames.length - frames.length;
    notes.push(`${n} frame${n === 1 ? ' was' : 's were'} damaged and left out`);
  }
  if (frames.length > MAX_FRAMES) {
    notes.push(`only the first ${MAX_FRAMES} frames are opened`);
    frames.length = MAX_FRAMES;
  }
  const links = (Array.isArray(o.links) ? o.links : []).map(linkOf).filter((l): l is LinkGroup => !!l);
  const main = mainOf(o.main);
  // A link to a group that does not exist is no link.
  const known = new Set(links.map((l) => l.id));
  for (const f of frames) if (f.link && !known.has(f.link)) f.link = null;
  if (main?.link && !known.has(main.link)) main.link = null;
  return {
    v: SCHEMA_VERSION,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 60) : 'Shared workspace',
    camera: cameraOf(o.camera),
    main,
    frames,
    links: links.filter((l) => frames.some((f) => f.link === l.id) || main?.link === l.id),
  };
}

/** Version 1 (the draft spec) → version 2. */
function fromV1(o: Obj, notes: string[]): Obj {
  const frames = (Array.isArray(o.frames) ? o.frames : []).map((f) => {
    if (!isObj(f)) return f;
    const det = f.det === 'colour' ? 3 : (num(f.det) ?? 2) + 1;
    if (f.det === 'colour') notes.push('a colour frame opens in D3: frames show one detector');
    return { ...f, fov: num(f.size) ?? 6, det, mjd: null };
  });
  if (frames.length) notes.push('frames start at their first date (version 1 kept a step number)');
  if (Array.isArray(o.places) && o.places.length) {
    notes.push('saved places are not part of a workspace now; save them with Places');
  }
  return { ...o, v: 2, frames, main: null };
}

/**
 * Reads a workspace from outside (a link, a file, the browser): migrates older versions and
 * checks every field. Pure.
 *
 * @returns The workspace, or null when it cannot be read; `note` says in words what was
 *   migrated, left out or refused (null when everything came through as it was).
 */
export function migrate(raw: unknown): { ws: Workspace | null; note: string | null } {
  if (!isObj(raw)) return { ws: null, note: 'This is not a Sima workspace.' };
  const v = num(raw.v);
  if (v === null) return { ws: null, note: 'This workspace has no version number, so it cannot be read.' };
  if (v > SCHEMA_VERSION) {
    return { ws: null, note: `This workspace was made by a newer Sima (version ${v}); this page reads up to version ${SCHEMA_VERSION}.` };
  }
  const notes: string[] = [];
  let o: Obj = raw;
  if (v === 1) o = fromV1(o, notes);
  else if (v !== SCHEMA_VERSION) return { ws: null, note: `Sima cannot read workspace version ${v}.` };
  const ws = check(o, notes);
  const unique = [...new Set(notes)];
  return { ws, note: unique.length ? `${v < SCHEMA_VERSION ? `Opened an older workspace (version ${v}): ` : ''}${unique.join('; ')}.` : null };
}

// ----- Links: #w=<base64url of the deflated JSON> --------------------------------------------

/** Rounds the numbers that need not be exact, so the link stays short. */
function compact(ws: Workspace): Workspace {
  const r = (v: number, d: number) => Number(v.toFixed(d));
  return {
    ...ws,
    camera: ws.camera && { ra: r(ws.camera.ra, 5), dec: r(ws.camera.dec, 5), fov: r(ws.camera.fov, 4) },
    main: ws.main && { ...ws.main, ra: r(ws.main.ra, 5), dec: r(ws.main.dec, 5), mjd: ws.main.mjd === null ? null : r(ws.main.mjd, 4) },
    frames: ws.frames.map((f) => ({
      ...f,
      anchor: { ra: r(f.anchor.ra, 5), dec: r(f.anchor.dec, 5) },
      mjd: f.mjd === null ? null : r(f.mjd, 4),
    })),
  };
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The workspace as the text after `#w=`: deflated JSON in base64url. */
export async function encodeWorkspace(ws: Workspace): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(compact(ws)));
  return toBase64Url(await through(json, new CompressionStream('deflate-raw')));
}

/**
 * Reads the text after `#w=`. A damaged link gives null and a plain note; never throws.
 */
export async function decodeWorkspace(text: string): Promise<{ ws: Workspace | null; note: string | null }> {
  try {
    const bytes = await through(fromBase64Url(text.trim()), new DecompressionStream('deflate-raw'));
    return migrate(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return { ws: null, note: 'The workspace in this link is damaged, so it could not be opened.' };
  }
}

/** The `#w=` part of a page address, or null. */
export function workspaceInHash(hash: string): string | null {
  const m = /(?:^#|&)w=([^&]*)/.exec(hash);
  return m?.[1] ?? null;
}
