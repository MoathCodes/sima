/**
 * The workspace's extra frames (SPEC 10 O-V1 to O-V3; SPEC-v1 F4 to F7): up to six frames beside
 * the main one, each on its own spot, with its own type, detector and date. Owner: integrator
 * (workspace).
 *
 * The main frame stays the main frame: the bar, Measure, the tools, the guide and the task line
 * drive it as before (viewer/*). An extra frame joins it only through a link group: time (step
 * through the dates together, DS9's "lock frames"), position (look at the same spot) and detector.
 * The bar drives the main frame and every frame time-linked to it; each extra frame also has a
 * small step and play control of its own.
 *
 * This file keeps the frames' state and the rules between them. card.ts draws a frame, place.ts
 * puts it on the screen, menu.ts holds its menus, store.ts saves the workspace.
 */
import { S, watch, type Fov } from '../viewer/state.ts';
import { pause as pauseMain, play as playMain, reducedMotion, setEpoch, END_HOLD, MIN_STEP_MS, STEP_MS } from '../viewer/playback.ts';
import { emit, on } from '../shell/bus.ts';
import { groupFrames, sameColourOnly } from '../core/blink.ts';
import type { Group } from '../core/types.ts';
import { loadingStatus, openPatch, type PatchStatus } from './patches.ts';
import { MAX_FRAMES, MIN_H, MIN_W, type FrameMode, type FrameState, type FrameType, type LinkGroup, type Workspace } from './schema.ts';

/** One extra frame: its saved state and what it shows now. */
export interface Live {
  s: FrameState;
  /** The card; set by card.ts. */
  el: HTMLElement | null;
  status: PatchStatus;
  /** The flip-book for the detector on screen (one picture per pass). */
  groups: Group[];
  epoch: number;
  /** Passes "Same wavelength only" left out, in words ("pass C"). */
  missing: string[];
  /** The reference wavelength, µm (the first date's exposure): what "same colour" means here. */
  refLam: number | null;
  /** Playing: the timer of this frame's clock. */
  clock: number;
  /** Spectrum: every date at once, not only those played so far. */
  showAll: boolean;
  /** Snap the anchor to the shipped patch's centre when it arrives (a fresh drop on a target). */
  snap: boolean;
  /** The load in force, by anchor and field size, and its abort. */
  loadKey: string;
  ctl: AbortController | null;
}

/** A member of a link group: the main frame, or an extra frame. */
export type Member = Live | 'main';

const list: Live[] = [];
let links: LinkGroup[] = [];
let mainLink: string | null = null;

/** What draws a frame (card.ts) and asks which to close (menu.ts): set by index.ts. */
export const hooks = {
  paint: (_f: Live) => {},
  make: (_f: Live) => {},
  drop: (_f: Live) => {},
  head: (_f: Live) => {},
  full: (_then: () => void) => {},
};

const changeFns = new Set<(what: 'frames' | 'state') => void>();
let queued: 'frames' | 'state' | null = null;

/**
 * Hears changes: `frames` when a frame is added, closed or moved to another spot (the sky's rings
 * and the placement follow), `state` for anything that is saved (autosave).
 */
export function onChange(fn: (what: 'frames' | 'state') => void): () => void {
  changeFns.add(fn);
  return () => changeFns.delete(fn);
}

function changed(what: 'frames' | 'state' = 'state'): void {
  if (queued === 'frames') return;
  const first = queued === null;
  queued = what;
  if (!first) return;
  queueMicrotask(() => {
    const w = queued ?? 'state';
    queued = null;
    for (const fn of changeFns) fn(w);
    if (w === 'frames') for (const fn of changeFns) fn('state');
  });
}

export function frames(): readonly Live[] {
  return list;
}

export function frameById(id: string): Live | null {
  return list.find((f) => f.s.id === id) ?? null;
}

/** The frame's number as people see it ("Frame 2"): from its id. */
export function numberOf(f: Live): string {
  return f.s.id.replace(/^f/, '');
}

function freeId(): string {
  let k = 1;
  while (list.some((f) => f.s.id === `f${k}`)) k++;
  return `f${k}`;
}

// ----- Adding and closing ---------------------------------------------------------------------

export interface AddOptions {
  box?: Partial<FrameState['box']>;
  mode?: FrameMode;
  det?: number;
  fov?: Fov;
  mjd?: number | null;
  sameColour?: boolean;
  link?: string | null;
  /** True for a fresh drop: snap to a shipped target's own patch, and play. */
  fresh?: boolean;
}

/**
 * Adds a frame looking at a spot. With six open it asks which to close first (menu.ts), then adds.
 *
 * @returns The frame, or null while the user chooses which to close.
 */
export function addFrame(type: FrameType, anchor: { ra: number; dec: number }, opts: AddOptions = {}): Live | null {
  if (list.length >= MAX_FRAMES) {
    hooks.full(() => addFrame(type, anchor, opts));
    return null;
  }
  const s: FrameState = {
    id: freeId(),
    type,
    anchor: { ra: anchor.ra, dec: anchor.dec },
    fov: opts.fov ?? S.fov,
    mode: opts.mode ?? 'pinned',
    box: { x: 24, y: -150, w: 260, h: 330, ...opts.box },
    det: opts.det ?? S.det,
    mjd: opts.mjd ?? null,
    sameColour: opts.sameColour ?? type === 'blink',
    link: opts.link ?? null,
  };
  s.box.w = Math.max(MIN_W, s.box.w);
  s.box.h = Math.max(MIN_H, s.box.h);
  return adopt(s, !!opts.fresh);
}

function adopt(s: FrameState, fresh: boolean): Live {
  const f: Live = {
    s,
    el: null,
    status: loadingStatus('Looking for exposures…'),
    groups: [],
    epoch: 0,
    missing: [],
    refLam: null,
    clock: 0,
    showAll: false,
    snap: fresh,
    loadKey: '',
    ctl: null,
  };
  list.push(f);
  hooks.make(f);
  load(f, fresh);
  changed('frames');
  return f;
}

/** Closes a frame. Its link group goes when only one member is left. */
export function closeFrame(f: Live): void {
  const i = list.indexOf(f);
  if (i < 0) return;
  stop(f);
  f.ctl?.abort();
  list.splice(i, 1);
  hooks.drop(f);
  f.el?.remove();
  f.el = null;
  tidyLinks();
  changed('frames');
}

/** Closes every extra frame (switching workspaces). */
export function closeAll(): void {
  for (const f of [...list]) closeFrame(f);
  links = [];
  mainLink = null;
}

// ----- Loading --------------------------------------------------------------------------------

function load(f: Live, play: boolean): void {
  const key = `${f.s.anchor.ra.toFixed(6)}|${f.s.anchor.dec.toFixed(6)}|${f.s.fov}`;
  if (key === f.loadKey) return;
  f.loadKey = key;
  f.ctl?.abort();
  const ctl = new AbortController();
  f.ctl = ctl;
  stop(f);
  f.status = loadingStatus('Looking for exposures…');
  f.groups = [];
  hooks.paint(f);
  hooks.head(f);
  void openPatch(f.s.id, f.s.anchor, f.s.fov, (st) => {
    if (ctl.signal.aborted) return;
    const first = !f.status.field && !!st.field;
    if (f.snap && st.centre) {
      // A fresh drop on a shipped target: look at the target's own patch, as the main frame does.
      f.snap = false;
      f.s.anchor = { ...st.centre };
      f.loadKey = `${f.s.anchor.ra.toFixed(6)}|${f.s.anchor.dec.toFixed(6)}|${f.s.fov}`;
      changed('frames');
      void openPatch(f.s.id, f.s.anchor, f.s.fov, (again) => {
        if (!ctl.signal.aborted) arrived(f, again, first && play);
      }, ctl.signal);
      return;
    }
    if (st.source !== 'loading') f.snap = false;
    arrived(f, st, first && play);
  }, ctl.signal);
}

function arrived(f: Live, st: PatchStatus, play: boolean): void {
  f.status = st;
  regroup(f);
  hooks.head(f);
  hooks.paint(f);
  changed('frames');
  if (!st.field) return;
  if (timeMate(f, 'main')) {
    const g = S.groups[S.epoch];
    if (g) showMjd(f, g.mjd, true);
  }
  if (play && !reducedMotion() && f.groups.length > 1 && (f.s.type === 'blink' || f.s.type === 'diff')) startPlay(f);
}

/**
 * The flip-book: one picture per pass in the frame's detector. "Same wavelength only" keeps the
 * exposure that matches the first date's wavelength in each pass, and names the passes it drops.
 */
function regroup(f: Live): void {
  const field = f.status.field;
  const keep = f.groups[f.epoch]?.mjd ?? f.s.mjd;
  f.missing = [];
  f.refLam = null;
  if (!field) {
    f.groups = [];
    f.epoch = 0;
    return;
  }
  let groups = groupFrames(field, f.s.det, 'window');
  const first = groups.find((g) => g.frames.length);
  const ref = first ? field.frames[first.frames[0]!] : undefined;
  f.refLam = ref ? ref.lam : null;
  if (f.s.sameColour && ref && f.s.type !== 'stack') {
    const kept = sameColourOnly(field, groups, ref.lam);
    groups = kept.groups;
    f.missing = kept.missing;
  }
  f.groups = groups;
  f.epoch = keep === null ? 0 : nearest(groups, keep);
}

function nearest(groups: readonly Group[], mjd: number | null): number {
  if (mjd === null || !Number.isFinite(mjd)) return 0;
  let best = 0;
  let gap = Infinity;
  groups.forEach((g, i) => {
    const d = Math.abs(g.mjd - mjd);
    if (Number.isFinite(d) && d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

// ----- What a frame shows ---------------------------------------------------------------------

/** Changes what the frame shows. The patch stays: no new fetch (SPEC-v1 F5). */
export function setType(f: Live, type: FrameType): void {
  if (f.s.type === type) return;
  f.s.type = type;
  regroup(f);
  if (type === 'stack' || type === 'info' || type === 'spectrum' || type === 'brightness') stop(f);
  hooks.head(f);
  hooks.paint(f);
  changed();
}

/** Shows another detector (and every frame detector-linked to it). */
export function setDet(f: Member, det: number, fromLink = false): void {
  if (f === 'main') {
    if (S.det !== det) emit('band', { det });
    if (!fromLink) forMates('main', 'detector', (m) => setDet(m, det, true));
    return;
  }
  if (f.s.det !== det) {
    f.s.det = det;
    regroup(f);
    hooks.head(f);
    hooks.paint(f);
    changed();
  }
  if (!fromLink) forMates(f, 'detector', (m) => setDet(m, det, true));
}

/** "Same wavelength only" on or off. */
export function setSameColour(f: Live, on: boolean): void {
  f.s.sameColour = on;
  regroup(f);
  hooks.paint(f);
  changed();
}

/** Moves the frame's spot (dragging its ring, the arrow keys, a position link). */
export function setAnchor(f: Member, ra: number, dec: number, fov?: Fov, fromLink = false): void {
  const at = { ra: ((ra % 360) + 360) % 360, dec: Math.max(-90, Math.min(90, dec)) };
  if (f === 'main') {
    const same = Math.abs(S.ra - at.ra) < 1e-6 && Math.abs(S.dec - at.dec) < 1e-6 && (fov === undefined || fov === S.fov);
    if (!same) emit('aim', { ...at, fov });
    if (!fromLink) forMates('main', 'position', (m) => setAnchor(m, at.ra, at.dec, fov, true));
    return;
  }
  f.s.anchor = at;
  if (fov !== undefined) f.s.fov = fov;
  f.snap = false;
  load(f, false);
  changed('frames');
  if (!fromLink) forMates(f, 'position', (m) => setAnchor(m, at.ra, at.dec, f.s.fov, true));
}

/** Pinned to the sky, or docked on the screen. */
export function setMode(f: Live, mode: FrameMode, box: FrameState['box']): void {
  f.s.mode = mode;
  f.s.box = box;
  changed('frames');
}

/** Keeps the window's box (place.ts, after a drag or a resize). */
export function setBox(f: Live, box: FrameState['box']): void {
  f.s.box = box;
  changed();
}

// ----- Dates: stepping and playing ------------------------------------------------------------

/** Steps through the frame's dates (its own control): wraps around and stops playing. */
export function stepFrame(f: Live, n: number): void {
  if (timeMate(f, 'main')) {
    pauseMain();
    const count = S.groups.length;
    if (count) setEpoch((((S.epoch + n) % count) + count) % count);
    return;
  }
  stopGroup(f);
  move(f, n);
}

function move(f: Live, n: number): void {
  const count = f.groups.length;
  if (!count) return;
  f.epoch = (((f.epoch + n) % count) + count) % count;
  shown(f);
}

/** Shows the date nearest an MJD; tells the frames time-linked to it unless it came from them. */
export function showMjd(f: Live, mjd: number, fromLink = false): void {
  const i = nearest(f.groups, mjd);
  if (i !== f.epoch || f.s.mjd === null) {
    f.epoch = i;
    f.s.mjd = f.groups[i]?.mjd ?? null;
    hooks.paint(f);
    hooks.head(f);
  }
  if (!fromLink) forMates(f, 'time', (m) => m !== 'main' && showMjd(m, mjd, true));
}

function shown(f: Live): void {
  const g = f.groups[f.epoch];
  f.s.mjd = g?.mjd ?? null;
  hooks.paint(f);
  hooks.head(f);
  changed();
  if (g) forMates(f, 'time', (m) => m !== 'main' && showMjd(m, g.mjd, true));
}

/** True while the frame's dates play: its own clock, a time-linked mate's, or the bar's. */
export function isPlaying(f: Live): boolean {
  if (timeMate(f, 'main')) return S.playing;
  return !!f.clock || mates(f, 'time').some((m) => m !== 'main' && !!m.clock);
}

/** Play or pause (the frame's own control). Time-linked to the main frame, it is the bar's Play. */
export function togglePlay(f: Live): void {
  if (timeMate(f, 'main')) {
    if (S.playing) pauseMain();
    else playMain();
    return;
  }
  if (isPlaying(f)) stopGroup(f);
  else startPlay(f);
}

function startPlay(f: Live): void {
  if (timeMate(f, 'main') || f.groups.length < 2) return;
  stopGroup(f);
  const tick = () => {
    move(f, 1);
    f.clock = window.setTimeout(tick, stepMs(f));
  };
  f.clock = window.setTimeout(tick, stepMs(f));
  headGroup(f);
}

/** The same pace as the bar: never faster than 2.5 pictures a second (FRM-8). */
function stepMs(f: Live): number {
  const base = Math.max(MIN_STEP_MS, STEP_MS / S.speed);
  return f.epoch === 0 || f.epoch === f.groups.length - 1 ? base * END_HOLD : base;
}

function stop(f: Live): void {
  if (!f.clock) return;
  clearTimeout(f.clock);
  f.clock = 0;
}

function stopGroup(f: Live): void {
  stop(f);
  for (const m of mates(f, 'time')) if (m !== 'main') stop(m);
  headGroup(f);
}

function headGroup(f: Live): void {
  hooks.head(f);
  for (const m of mates(f, 'time')) if (m !== 'main') hooks.head(m);
}

// ----- Link groups (SPEC-v1 F7) ---------------------------------------------------------------

function linkOf(m: Member): string | null {
  return m === 'main' ? mainLink : m.s.link;
}

function setLinkOf(m: Member, id: string | null): void {
  if (m === 'main') mainLink = id;
  else m.s.link = id;
}

/** The link group a frame is in, or null. */
export function groupOf(m: Member): LinkGroup | null {
  const id = linkOf(m);
  return id ? (links.find((l) => l.id === id) ?? null) : null;
}

/** The other members of a frame's group, if the group links this kind; [] otherwise. */
export function mates(m: Member, kind?: 'time' | 'position' | 'detector'): Member[] {
  const g = groupOf(m);
  if (!g || (kind && !g[kind])) return [];
  const out: Member[] = list.filter((f) => f !== m && f.s.link === g.id);
  if (m !== 'main' && mainLink === g.id) out.unshift('main');
  return out;
}

function timeMate(f: Live, other: Member): boolean {
  return mates(f, 'time').includes(other);
}

function forMates(m: Member, kind: 'time' | 'position' | 'detector', fn: (m: Member) => void): void {
  for (const x of mates(m, kind)) fn(x);
}

/** The letter people see for a group (A, B…), by its place in the list. */
export function groupLetter(g: LinkGroup): string {
  return String.fromCharCode(65 + Math.max(0, links.indexOf(g)));
}

export function linkGroups(): readonly LinkGroup[] {
  return links;
}

/**
 * Links two frames (merging their groups). A new group links time; the frame being linked takes
 * the other's date, detector or spot for each kind the group links.
 */
export function linkTogether(a: Member, b: Member, kinds: Partial<Omit<LinkGroup, 'id'>> = {}): LinkGroup {
  let g = groupOf(b) ?? groupOf(a);
  if (!g) {
    let k = 1;
    while (links.some((l) => l.id === `g${k}`)) k++;
    g = { id: `g${k}`, time: true, position: false, detector: false, ...kinds };
    links.push(g);
  } else Object.assign(g, kinds);
  const old = [groupOf(a), groupOf(b)].filter((x): x is LinkGroup => !!x && x !== g);
  for (const o of old) {
    for (const f of list) if (f.s.link === o.id) f.s.link = g.id;
    if (mainLink === o.id) mainLink = g.id;
  }
  setLinkOf(a, g.id);
  setLinkOf(b, g.id);
  tidyLinks();
  follow(a, b, g);
  changed('frames');
  for (const f of list) hooks.head(f);
  return g;
}

/** Turns one kind of link on or off for a whole group; the group follows `leader` when on. */
export function setLinkKind(g: LinkGroup, kind: 'time' | 'position' | 'detector', on: boolean, leader: Member): void {
  g[kind] = on;
  if (on) for (const m of mates(leader)) follow(m, leader, g, kind);
  if (kind === 'time' && on) for (const f of list) if (f.s.link === g.id && f !== leader) stop(f);
  changed('frames');
  for (const f of list) hooks.head(f);
}

/** Takes a frame out of its group. */
export function unlink(m: Member): void {
  setLinkOf(m, null);
  tidyLinks();
  changed('frames');
  for (const f of list) hooks.head(f);
}

/** `m` takes `leader`'s date, spot or detector for each kind the group links. */
function follow(m: Member, leader: Member, g: LinkGroup, only?: 'time' | 'position' | 'detector'): void {
  const want = (k: 'time' | 'position' | 'detector') => g[k] && (!only || only === k);
  const lead = leader === 'main'
    ? { det: S.det, ra: S.ra, dec: S.dec, fov: S.fov, mjd: S.groups[S.epoch]?.mjd ?? null }
    : { det: leader.s.det, ra: leader.s.anchor.ra, dec: leader.s.anchor.dec, fov: leader.s.fov, mjd: leader.groups[leader.epoch]?.mjd ?? null };
  if (want('detector')) setDet(m, lead.det, true);
  if (want('position')) setAnchor(m, lead.ra, lead.dec, lead.fov, true);
  if (want('time') && lead.mjd !== null) {
    if (m === 'main') {
      const i = nearest(S.groups, lead.mjd);
      if (i !== S.epoch) setEpoch(i);
    } else {
      stop(m);
      showMjd(m, lead.mjd, true);
    }
  }
}

function tidyLinks(): void {
  links = links.filter((g) => {
    const n = list.filter((f) => f.s.link === g.id).length + (mainLink === g.id ? 1 : 0);
    if (n >= 2) return true;
    for (const f of list) if (f.s.link === g.id) f.s.link = null;
    if (mainLink === g.id) mainLink = null;
    return false;
  });
}

// ----- The main frame drives its mates ----------------------------------------------------------

/** Starts listening to the main frame. Called once by index.ts. */
export function startFrames(): void {
  watch(['epoch', 'groups'], () => {
    const g = S.groups[S.epoch];
    if (g && Number.isFinite(g.mjd)) forMates('main', 'time', (m) => m !== 'main' && showMjd(m, g.mjd, true));
  });
  watch(['playing'], () => forMates('main', 'time', (m) => m !== 'main' && hooks.head(m)));
  watch(['det'], () => forMates('main', 'detector', (m) => setDet(m, S.det, true)));
  on('patch', (p) => {
    if (p.source === 'loading') return;
    forMates('main', 'position', (m) => {
      if (m === 'main') return;
      const same = Math.abs(m.s.anchor.ra - p.ra) < 1e-6 && Math.abs(m.s.anchor.dec - p.dec) < 1e-6 && m.s.fov === p.fov;
      if (!same) setAnchor(m, p.ra, p.dec, p.fov as Fov, true);
    });
  });
}

// ----- Copies: duplicate, compare, make main --------------------------------------------------

/** Duplicates a frame, docked beside it (place.ts finds the room). */
export function duplicate(f: Live, change: Partial<FrameState> = {}): Live | null {
  const box = f.el?.getBoundingClientRect();
  return addFrame(change.type ?? f.s.type, change.anchor ?? f.s.anchor, {
    mode: 'docked',
    box: { x: Math.round((box?.right ?? 200) + 10), y: Math.round(box?.top ?? 120), w: f.s.box.w, h: f.s.box.h },
    det: change.det ?? f.s.det,
    fov: f.s.fov,
    mjd: change.mjd !== undefined ? change.mjd : f.s.mjd,
    sameColour: change.sameColour ?? f.s.sameColour,
  });
}

/** What Compare makes different. */
export type CompareWhat = 'det' | 'date' | 'type';

/** The detector a comparison shows: far from this one, so the colours differ. */
export function otherDet(det: number): number {
  return det <= 3 ? det + 3 : det - 3;
}

/**
 * Compare (SPEC-v1 F7): a copy docked beside the frame with time linked and one thing different.
 * Another date is not time-linked (it would follow back to the same date); it starts at the
 * first date and keeps the spot and detector linked instead.
 */
export function compare(src: Member, what: CompareWhat): Live | null {
  const base = src === 'main'
    ? { type: mainType(), anchor: { ra: S.ra, dec: S.dec }, det: S.det, fov: S.fov, w: 260, h: 330, mjd: S.groups[S.epoch]?.mjd ?? null }
    : { type: src.s.type, anchor: src.s.anchor, det: src.s.det, fov: src.s.fov, w: src.s.box.w, h: src.s.box.h, mjd: src.s.mjd };
  const r = src === 'main' ? document.getElementById('frame')?.getBoundingClientRect() : src.el?.getBoundingClientRect();
  const type: FrameType = what === 'type' ? (base.type === 'blink' ? 'diff' : 'blink') : base.type;
  const copy = addFrame(type, base.anchor, {
    mode: 'docked',
    box: { x: Math.round((r?.left ?? 600) - base.w - 10), y: Math.round(r?.top ?? 120), w: base.w, h: base.h },
    det: what === 'det' ? otherDet(base.det) : base.det,
    fov: base.fov,
    mjd: what === 'date' ? null : base.mjd,
    sameColour: type === 'blink',
  });
  if (!copy) return null;
  if (what === 'date') linkTogether(copy, src, { time: false, position: true, detector: true });
  else linkTogether(copy, src, { time: true });
  return copy;
}

/** The frame type that matches the main frame's view. */
export function mainType(): FrameType {
  return S.mode === 'two' ? 'two' : S.mode === 'diff' ? 'diff' : S.mode === 'stack' ? 'stack' : 'blink';
}

/**
 * Makes an extra frame the main one: the main frame moves to its spot, detector and date, and the
 * extra frame takes the main frame's old spot (so nothing is lost).
 */
export function makeMain(f: Live): void {
  const old = { ra: S.ra, dec: S.dec, fov: S.fov, det: S.det, mjd: S.groups[S.epoch]?.mjd ?? null, target: S.target };
  const mine = { ...f.s.anchor, fov: f.s.fov, det: f.s.det, mjd: f.s.mjd, type: f.s.type };
  const stopWait = on('patch', (p) => {
    if (p.source === 'loading') return;
    stopWait();
    setTimeout(() => {
      if (S.det !== mine.det) emit('band', { det: mine.det });
      if (mine.type === 'two' || mine.type === 'diff') S.mode = mine.type;
      if (mine.mjd !== null) setEpoch(nearest(S.groups, mine.mjd));
    }, 0);
  });
  emit('aim', { ra: mine.ra, dec: mine.dec, fov: mine.fov });
  f.s.type = 'blink';
  f.s.det = old.det;
  f.s.mjd = old.mjd;
  f.snap = !!old.target;
  setAnchor(f, old.ra, old.dec, old.fov as Fov, true);
}

// ----- Saving and restoring -------------------------------------------------------------------

/** The workspace now, for autosave, a link, a file or a named workspace. */
export function snapshot(name: string, camera: Workspace['camera']): Workspace {
  return {
    v: 2,
    name,
    camera,
    main: {
      ra: S.ra,
      dec: S.dec,
      fov: S.fov,
      target: S.target,
      det: S.det,
      mode: S.mode,
      mjd: S.groups[S.epoch]?.mjd ?? null,
      link: mainLink,
    },
    frames: list.map((f) => ({ ...f.s, anchor: { ...f.s.anchor }, box: { ...f.s.box } })),
    links: links.map((g) => ({ ...g })),
  };
}

/**
 * Opens a workspace's frames and links, replacing the extra frames on screen. The main frame and
 * the sky are restored by the caller (store.ts), which decides whether they should move.
 */
export function restoreFrames(ws: Workspace): void {
  closeAll();
  links = ws.links.map((g) => ({ ...g }));
  mainLink = ws.main?.link ?? null;
  for (const s of ws.frames) adopt({ ...s, anchor: { ...s.anchor }, box: { ...s.box } }, false);
  tidyLinks();
  changed('frames');
}
