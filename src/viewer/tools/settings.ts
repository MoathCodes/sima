/**
 * The picture tools' remembered settings (`sima.tools`, SPEC 8.5) and the `pic=` link parameter
 * (TLS-7). Owner: lane E.
 *
 * What is kept in this browser: the picture settings (`S.pic`), the candidate list's filter and
 * order, and the Checked / Reject marks per patch, detector and place. "Original" is never kept
 * (docs/tools.md), so a page never opens with clean-up silently off.
 *
 * Saving happens only when the user changes something in the panel (`setPic`, `setList`,
 * `mark`). Settings that came from a shared link are used but not saved over the visitor's own.
 *
 * The storage functions take a `Storage`-like object, so the tests run them in Node.
 */
import { DEFAULT_PIC, encodePic, type PicSettings } from '../../core/picture.ts';
import { S } from '../state.ts';

/** The storage key (docs/lanes.md). */
export const KEY = 'sima.tools';

/** How the candidate list is ordered. */
export type ListOrder = 'strength' | 'date';
/** A mark the user gave a candidate (as in Fritz and Zooniverse). */
export type Mark = 'checked' | 'reject';

/** Everything kept under `sima.tools`. */
export interface Saved {
  /** Picture settings; only the fields that differ from the default are written. */
  pic: Partial<PicSettings>;
  /** "Hide known, ruled out and rejected". */
  hide: boolean;
  order: ListOrder;
  /** "Mark them on the picture". */
  marks: boolean;
  /** Candidate marks: `<place>|D<det>` → candidate id → mark. */
  checked: Record<string, Record<string, Mark>>;
  /** Layers tab switches. */
  layers: Layers;
}

/** The overlays on the picture (Layers tab). */
export interface Layers {
  gaia: boolean;
  catwise: boolean;
  path: boolean;
  flags: boolean;
  names: boolean;
}

export const DEFAULT_LAYERS: Readonly<Layers> = Object.freeze({
  gaia: true,
  catwise: false,
  path: true,
  flags: false,
  names: true,
});

/** The defaults: what "Reset all" returns to. */
export function defaults(): Saved {
  return {
    pic: {},
    hide: false,
    order: 'strength',
    marks: true,
    checked: {},
    layers: { ...DEFAULT_LAYERS },
  };
}

/** Minimal Storage, so tests can pass a plain object. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // storage can be blocked
  }
}

/**
 * Reads `sima.tools`. Anything missing, malformed or out of range falls back to the default, so
 * an old or hand-edited entry never breaks the page.
 */
export function load(store: Store | null = browserStore()): Saved {
  const out = defaults();
  let raw: unknown = null;
  try {
    const text = store?.getItem(KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    return out;
  }
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  out.pic = cleanPic(r.pic);
  // An older version kept the threshold as `k` (docs/tools.md); it is still read.
  if (out.pic.threshold === undefined && typeof r.k === 'number') {
    const k = cleanPic({ threshold: r.k }).threshold;
    if (k !== undefined) out.pic = { ...out.pic, threshold: k };
  }
  if (typeof r.hide === 'boolean') out.hide = r.hide;
  if (r.order === 'strength' || r.order === 'date') out.order = r.order;
  if (typeof r.marks === 'boolean') out.marks = r.marks;
  if (r.checked && typeof r.checked === 'object') {
    for (const [place, ids] of Object.entries(r.checked as Record<string, unknown>)) {
      if (!ids || typeof ids !== 'object') continue;
      const keep: Record<string, Mark> = {};
      for (const [id, m] of Object.entries(ids as Record<string, unknown>)) {
        if (m === 'checked' || m === 'reject') keep[id] = m;
      }
      out.checked[place] = keep;
    }
  }
  if (r.layers && typeof r.layers === 'object') {
    const l = r.layers as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_LAYERS) as (keyof Layers)[]) {
      if (typeof l[k] === 'boolean') out.layers[k] = l[k];
    }
  }
  return out;
}

/** Writes `sima.tools`. Fails quietly when storage is blocked (the settings last this visit). */
export function save(saved: Saved, store: Store | null = browserStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Blocked or full: nothing to do.
  }
}

/**
 * Keeps only the picture fields that are valid and differ from the default. Validation goes
 * through the link format (core/picture.ts), so storage and links accept exactly the same values.
 */
export function cleanPic(value: unknown): Partial<PicSettings> {
  if (!value || typeof value !== 'object') return {};
  const merged = { ...DEFAULT_PIC, ...(value as Partial<PicSettings>) };
  const full = sane(merged);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_PIC) as (keyof PicSettings)[]) {
    if (JSON.stringify(full[k]) !== JSON.stringify(DEFAULT_PIC[k])) out[k] = full[k];
  }
  return out as Partial<PicSettings>;
}

const LIMITS = ['noise', 'zscale', 'pct', 'minmax', 'custom'] as const;
const STRETCHES = ['linear', 'sqrt', 'log', 'asinh', 'equal'] as const;
const CMAPS = ['band', 'thermal', 'mono', 'viridis'] as const;
const COMBINE = ['mean', 'median', 'clip'] as const;
const MIX = ['r', 'g', 'b', 'off'] as const;
const SMOOTH = [0, 0.5, 1, 2] as const;

function pick<T>(list: readonly T[], v: unknown, fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}

/** Clamps every field into its documented range (docs/tools.md); bad values become defaults. */
export function sane(p: PicSettings): PicSettings {
  const d = DEFAULT_PIC;
  const num = (v: unknown, lo: number, hi: number, fb: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb;
  const { black, white } = clampPoints(num(p.black, -50, 1e5, d.black), num(p.white, -50, 1e5, d.white));
  const mix = Array.isArray(p.mix) && p.mix.length === 6 ? p.mix : d.mix;
  return {
    limits: pick(LIMITS, p.limits, d.limits),
    black,
    white,
    stretch: pick(STRETCHES, p.stretch, d.stretch),
    brightness: num(p.brightness, -1, 1, d.brightness),
    contrast: num(p.contrast, 0.1, 10, d.contrast),
    cmap: pick(CMAPS, p.cmap, d.cmap),
    invert: typeof p.invert === 'boolean' ? p.invert : d.invert,
    mix: mix.map((m, i) => pick(MIX, m, d.mix[i] ?? 'off')) as unknown as PicSettings['mix'],
    match: typeof p.match === 'boolean' ? p.match : d.match,
    background: typeof p.background === 'boolean' ? p.background : d.background,
    median: typeof p.median === 'boolean' ? p.median : d.median,
    smooth: pick(SMOOTH, p.smooth, d.smooth),
    combinePass: typeof p.combinePass === 'boolean' ? p.combinePass : d.combinePass,
    combineBy: pick(COMBINE, p.combineBy, d.combineBy),
    threshold: Math.round(num(p.threshold, 3, 10, d.threshold) * 2) / 2,
  };
}

/**
 * Custom black and white points, kept in range: black from −50, white up to 100,000, and white
 * always above black (docs/tools.md). Noise units above the sky.
 */
export function clampPoints(black: number, white: number): { black: number; white: number } {
  const b = Math.min(99_999, Math.max(-50, Number.isFinite(black) ? black : 0));
  const rb = round(b);
  const step = Math.abs(rb) >= 100 ? 1 : 0.1;
  const w = round(Math.min(100_000, Number.isFinite(white) ? white : 800));
  // Rounding must not put white on or below black.
  return { black: rb, white: w > rb ? w : round(rb + step) };
}

function round(v: number): number {
  return Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
}

// ----- The live store: one copy for the page -------------------------------------------------

let saved: Saved = defaults();
const listeners = new Set<() => void>();

/** Reads the browser's copy once at start and puts its picture settings in force. */
export function startSettings(): void {
  saved = load();
  // A link's settings win over saved ones (lane F's url.ts sets S.pic and S.picLinked later).
  if (!S.picLinked) S.pic = { ...DEFAULT_PIC, ...saved.pic };
}

/** The current list and layer settings (read-only copy). */
export function current(): Readonly<Saved> {
  return saved;
}

/** Hear changes to the list, layer or mark settings. */
export function onSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed(): void {
  save(saved);
  for (const fn of listeners) fn();
}

/** Changes picture settings from the panel: in force at once, and kept in this browser. */
export function setPic(change: Partial<PicSettings>): void {
  const next = sane({ ...S.pic, ...change });
  S.pic = next;
  saved = { ...saved, pic: cleanPic(next) };
  changed();
}

/** Changes the candidate list's filter, order or "Mark them on the picture". */
export function setList(change: Partial<Pick<Saved, 'hide' | 'order' | 'marks'>>): void {
  saved = { ...saved, ...change };
  changed();
}

/** Turns a layer on or off. */
export function setLayer(name: keyof Layers, on: boolean): void {
  saved = { ...saved, layers: { ...saved.layers, [name]: on } };
  changed();
}

/** The key candidate marks are kept under: the place and the detector. */
export function markPlace(): string {
  const place = S.target ?? `${S.ra.toFixed(4)},${S.dec.toFixed(4)},${S.fov}`;
  return `${place}|D${S.det}`;
}

/** The user's mark on a candidate, if any. */
export function markOf(id: string): Mark | null {
  return saved.checked[markPlace()]?.[id] ?? null;
}

/** Marks a candidate Checked or Reject; the same mark again takes it off. */
export function mark(id: string, m: Mark): void {
  const place = markPlace();
  const marks = { ...(saved.checked[place] ?? {}) };
  if (marks[id] === m) delete marks[id];
  else marks[id] = m;
  saved = { ...saved, checked: { ...saved.checked, [place]: marks } };
  changed();
}

/**
 * "Reset all": the picture, the clean-up, the change search's threshold, the candidate list's
 * filter and order, and the layers go back to the defaults. Marks are kept: they are the user's
 * work, not a setting.
 */
export function resetAll(): void {
  S.pic = DEFAULT_PIC;
  S.picLinked = false;
  saved = { ...defaults(), checked: saved.checked };
  changed();
}

/** True when anything differs from the defaults (so "Reset all" has something to do). */
export function anyChanged(): boolean {
  const d = defaults();
  return (
    encodePic(S.pic) !== '' ||
    JSON.stringify(S.pic) !== JSON.stringify(DEFAULT_PIC) ||
    saved.hide !== d.hide ||
    saved.order !== d.order ||
    saved.marks !== d.marks ||
    JSON.stringify(saved.layers) !== JSON.stringify(d.layers)
  );
}
