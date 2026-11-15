/**
 * Discover's globe: its home view, the mission beacons, the marks of "Try another object", the
 * one-time "Drag to turn the sky" tag, and the keep-clear list of Discover's panels. Owner: lane C.
 *
 * - Home (DESIGN-v2 8.4, mockups 01 and 02): the whole globe, centred in the map's box (sky.ts
 *   `mapBox`: right of the mission list on desktop, between the top row and the sheet on phones),
 *   turned so the missions' targets face us; on a first run, turned to Barnard's Star.
 * - Beacons (DESIGN-v2 9): a 44 px ring in `mark` with a 14 px dot, 48 px hit area; a done
 *   mission's ring is white. A Thin tag names the object and the mission. Things on the far side
 *   are not drawn: starting a mission turns the globe to its target (no limb tags in v2.0).
 * - The objects to try are drawn as place labels (a dot and a name), as in mockup 02, but they are
 *   buttons too.
 * - A press (click, tap, Enter, Space) goes to `onBeaconPress` listeners (Discover's list opens the
 *   same row). With none, or when none takes it, a mission starts through the bus's `start` and an
 *   object opens through `openPlace`, the same ways in as everywhere else.
 */
import { emit } from '../shell/bus.ts';
import { openPlace } from '../shell/shell.ts';
import { targetByKey } from '../core/targets.ts';
import { MISSIONS, MISSION_IDS, type MissionId } from '../explore/missions.ts';
import { onProgress, progress, type Progress } from '../explore/progress.ts';
import { keepClear, setTaken } from './markers.ts';
import { separation } from './project.ts';
import { camera, flyTo, globeCircle, globeFov, mapBox, onZoom, toScreen } from './sky.ts';

/** A mark on the globe: a mission's target or an object to try. */
export interface Beacon {
  /** The mission id, or the object's target key. */
  id: string;
  kind: 'mission' | 'object';
  /** Key in core/targets.ts. */
  target: string;
  /** The object's name ("Barnard's Star"). */
  name: string;
  ra: number;
  dec: number;
  /** A mission's state from progress.ts; objects are always 'object'. */
  state: 'next' | 'progress' | 'done' | 'todo' | 'object';
}

/** The missions on the real sky (Planet X is simulated: it has no place on it) and their names. */
const MISSION_MARKS: readonly { id: MissionId; target: string; title: string }[] = [
  { id: 'runaway', target: 'barnard', title: 'The runaway' },
  { id: 'ghost', target: 'wise-0855', title: 'The ghost' },
];
/** "Try another object" (BEGINNER-AND-MOBILE 5.2), in the list's order. */
const OBJECTS = ['r-dra', 'eps-indi-b', 'rw-aur'] as const;
/** Beacons show only on a wide view: the globe, or close to it. Degrees across. */
const MIN_FOV = 40;
/** Room kept round the window's edge, CSS px. */
const EDGE = 8;

let layer: HTMLElement | null = null;
const els = new Map<string, { el: HTMLButtonElement; tag: HTMLElement; tagW: number }>();
const pressFns = new Set<(b: Beacon) => boolean | void>();
/** The home view last asked for, so a change of the map's box can put the globe back there. */
let home: { ra: number; dec: number; fov: number; first: boolean; box: string } | null = null;
let firstRun = false;
let dragTag: HTMLElement | null = null;
let avoidCache: { at: number; boxes: DOMRect[] } | null = null;
/** Whether the marks were shown at the last placing. */
let shownLast = false;

/** Discover's panels: beacons, labels and the patch stay out from under them. */
const PANELS = ['discover-list', 'mission', 'mission-success', 'sheet', 'coach', 'settings', 'view-switch'];

/**
 * Starts the globe's marks. Called once by main.ts after the sky. In Discover, with no place in
 * the link, the sky opens at home (the intro, when it plays, puts it there itself).
 */
export function startGlobe(): void {
  layer = document.createElement('div');
  layer.id = 'sky-beacons';
  layer.setAttribute('role', 'group');
  layer.setAttribute('aria-label', 'Missions and objects on the sky');
  document.getElementById('sky-marks')?.after(layer);
  for (const id of PANELS) {
    const el = document.getElementById(id);
    if (el) keepClear(el);
  }
  build();
  onProgress(() => refresh());
  onZoom(() => place());
  addEventListener('resize', () => {
    avoidCache = null;
  });
  new MutationObserver(() => {
    avoidCache = null;
    place();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-view', 'data-intro'],
  });
  // The first view: Discover's home, unless the link names a place (the sky then opens on it).
  // Under the intro it is the first-run home, where the intro hands over (it also puts the globe
  // there itself once the map draws, and again after a skip).
  const linked = /[?&](target|ra|dec)=/.test(location.search);
  const html = document.documentElement;
  if (html.dataset.view === 'discover' && !linked) {
    const first = html.dataset.intro !== undefined;
    let once = false;
    const off = onZoom(() => {
      if (once) return;
      once = true;
      queueMicrotask(off);
      globeHome({ first, animate: false });
    });
  }
}

/**
 * Turns the sky to Discover's home: the whole globe in the map's box, sized as DESIGN-v2 8.4
 * says, and turned so the missions' targets face us (the next one first).
 *
 * @param opts `first`: the first run (the welcome card): Barnard's Star faces us and the globe is
 *   a little larger; a "Drag to turn the sky" tag shows until the sky is turned. `animate`
 *   (default true): glide there; false jumps (the intro hands over to a still globe).
 */
export function globeHome(opts: { first?: boolean; animate?: boolean } = {}): void {
  const first = !!opts.first;
  const b = mapBox();
  const H = innerHeight;
  const phone = innerWidth < 700;
  const d = phone
    ? Math.min(b.width - 48, b.height - 60)
    : Math.min(first ? 880 : 800, H - (first ? 140 : 160), b.width - 32);
  const at = first ? targetByKey('barnard') : homeCentre();
  if (!at) return;
  const fov = globeFov(Math.max(120, d));
  home = { ra: at.ra, dec: at.dec, fov, first, box: boxKey() };
  firstRun = first;
  flyTo({ ra: at.ra, dec: at.dec, fov }, { animate: opts.animate ?? true });
  showDragTag(first && !phone);
}

/** The beacons and object marks now, with their states. */
export function beacons(): Beacon[] {
  const p = progress();
  const out: Beacon[] = [];
  for (const m of MISSION_MARKS) {
    const t = targetByKey(m.target);
    if (t) out.push({ id: m.id, kind: 'mission', target: m.target, name: t.name, ra: t.ra, dec: t.dec, state: stateOf(p, m.id) });
  }
  for (const key of OBJECTS) {
    const t = targetByKey(key);
    if (t) out.push({ id: key, kind: 'object', target: key, name: t.name, ra: t.ra, dec: t.dec, state: 'object' });
  }
  return out;
}

/**
 * Hear presses on a beacon or object mark. Return true to take the press (Discover's list opens
 * the row); when no listener takes it, the mission starts (`start`) or the object opens
 * (`openPlace`).
 * @returns Stop listening.
 */
export function onBeaconPress(fn: (b: Beacon) => boolean | void): () => void {
  pressFns.add(fn);
  return () => {
    pressFns.delete(fn);
  };
}

// ----- Home -------------------------------------------------------------------------------------

/**
 * The centre that shows the most missions' targets well inside the visible half, the next
 * mission's first; then the objects. Candidates: each target, and the midpoint of each pair.
 */
function homeCentre(): { ra: number; dec: number } | null {
  const all = beacons();
  if (!all.length) return null;
  const weight = (b: Beacon) =>
    b.state === 'next' || b.state === 'progress' ? 10 : b.kind === 'mission' ? 4 : 1;
  const cands: { ra: number; dec: number }[] = all.map((b) => ({ ra: b.ra, dec: b.dec }));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const m = midpoint(all[i] as Beacon, all[j] as Beacon);
      if (m) cands.push(m);
    }
  }
  let best = cands[0] as { ra: number; dec: number };
  let bestScore = -Infinity;
  for (const c of cands) {
    let score = 0;
    for (const b of all) {
      const s = separation(c.ra, c.dec, b.ra, b.dec);
      // Well inside the facing half (not squeezed at the limb), and nearer the centre is better.
      if (s < 72) score += weight(b) * (1 + (72 - s) / 72);
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** The point halfway between two sky positions along the shorter arc; null when opposite. */
function midpoint(a: { ra: number; dec: number }, b: { ra: number; dec: number }): { ra: number; dec: number } | null {
  const R = Math.PI / 180;
  const v = (p: { ra: number; dec: number }) => [
    Math.cos(p.dec * R) * Math.cos(p.ra * R),
    Math.cos(p.dec * R) * Math.sin(p.ra * R),
    Math.sin(p.dec * R),
  ];
  const [x1, y1, z1] = v(a) as [number, number, number];
  const [x2, y2, z2] = v(b) as [number, number, number];
  const x = x1 + x2;
  const y = y1 + y2;
  const z = z1 + z2;
  const n = Math.hypot(x, y, z);
  if (n < 1e-6) return null;
  return { ra: ((Math.atan2(y, x) / R) % 360 + 360) % 360, dec: Math.asin(z / n) / R };
}

function boxKey(): string {
  const b = mapBox();
  return `${b.x} ${b.y} ${b.width} ${b.height}`;
}

/** Still at home (the visitor has not turned or zoomed the globe since). */
function atHome(): boolean {
  if (!home) return false;
  const c = camera();
  return separation(c.ra, c.dec, home.ra, home.dec) < 0.5;
}

// ----- Marks ------------------------------------------------------------------------------------

function stateOf(p: Progress, id: MissionId): Beacon['state'] {
  if (p.learned.includes(id)) return 'done';
  if (p.current === id || Object.keys(p.steps[id]).length) return 'progress';
  const next = MISSION_IDS.find((m) => !p.learned.includes(m));
  return next === id ? 'next' : 'todo';
}

/** The tag's small line and the words a screen reader hears. */
function words(b: Beacon, p: Progress): { small: string; label: string } {
  if (b.kind === 'object') {
    return { small: '', label: `${b.name}: try this object, no mission` };
  }
  const id = b.id as MissionId;
  const n = MISSION_IDS.indexOf(id) + 1;
  const title = MISSION_MARKS.find((m) => m.id === id)?.title ?? '';
  const total = MISSIONS[id].steps.length;
  const did = Object.keys(p.steps[id]).length;
  const none = MISSION_IDS.every((m) => !Object.keys(p.steps[m]).length);
  let small: string;
  if (b.state === 'done') small = `Mission ${n} · done`;
  else if (b.state === 'progress') small = `Mission ${n} · step ${Math.min(total, did + 1)} of ${total}`;
  else if (b.state === 'next' && firstRun && none && id === 'runaway') small = 'Your first mission';
  else if (b.state === 'next') small = `Mission ${n} · next`;
  else small = `Mission ${n}`;
  return { small, label: `${b.name}: ${title}, ${small.replace(' · ', ', ')}` };
}

function build(): void {
  if (!layer) return;
  for (const b of beacons()) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `sky-beacon ${b.kind === 'object' ? 'is-object' : 'is-mission'}`;
    el.dataset.guide = b.kind === 'mission' ? `beacon-${b.id}` : `beacon-object-${b.id}`;
    el.dataset.id = b.id;
    el.hidden = true;
    const ring = document.createElement('span');
    ring.className = 'sky-beacon-ring';
    ring.setAttribute('aria-hidden', 'true');
    const tag = document.createElement('span');
    tag.className = b.kind === 'mission' ? 'sky-beacon-tag glass-thin' : 'sky-beacon-tag';
    el.append(ring, tag);
    el.addEventListener('click', () => press(b.id));
    layer.append(el);
    els.set(b.id, { el, tag, tagW: 0 });
    keepClear(tag);
  }
  refresh();
}

/** Updates states and words from progress. */
function refresh(): void {
  const p = progress();
  for (const b of beacons()) {
    const e = els.get(b.id);
    if (!e) continue;
    const w = words(b, p);
    e.el.dataset.state = b.state;
    e.el.setAttribute('aria-label', w.label);
    const html = w.small ? `${esc(b.name)} <small>${esc(w.small)}</small>` : esc(b.name);
    if (e.tag.innerHTML !== html) {
      e.tag.innerHTML = html;
      e.tagW = 0;
    }
  }
  place();
}

function press(id: string): void {
  const b = beacons().find((x) => x.id === id);
  if (!b) return;
  for (const fn of [...pressFns]) {
    try {
      if (fn(b) === true) return;
    } catch (err) {
      console.error('globe: an onBeaconPress listener failed', err);
    }
  }
  if (b.kind === 'mission') emit('start', { starter: b.id });
  else openPlace({ name: b.name, ra: b.ra, dec: b.dec, target: b.target });
}

/** Boxes beacons stay out from under: Discover's panels and every visible card. */
function avoidBoxes(): DOMRect[] {
  const now = performance.now();
  if (avoidCache && now - avoidCache.at < 250) return avoidCache.boxes;
  const els = [
    ...document.querySelectorAll('[data-card]'),
    ...PANELS.map((id) => document.getElementById(id)),
  ].filter((el): el is Element => !!el && el.checkVisibility());
  avoidCache = { at: now, boxes: els.map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height) };
  return avoidCache.boxes;
}

function hits(a: { l: number; t: number; r: number; b: number }, boxes: readonly DOMRect[]): boolean {
  return boxes.some((c) => a.l < c.right && a.r > c.left && a.t < c.bottom && a.b > c.top);
}

/** Puts every mark on its spot, each frame the sky moves. */
function place(): void {
  if (!layer) return;
  const html = document.documentElement;
  const c = camera();
  // A change of the map's box (the view switch, the phone sheet) puts an untouched home back.
  if (home && home.box !== boxKey() && atHome() && html.dataset.view === 'discover') {
    globeHome({ first: home.first, animate: false });
  }
  if (dragTag && !dragTag.hidden && home && !atHome()) dragTag.hidden = true;
  placeDragTag();
  const show = html.dataset.view === 'discover' && c.fov >= MIN_FOV;
  if (show !== shownLast) {
    shownLast = show;
    setTaken(show ? beacons() : []);
  }
  const W = innerWidth;
  const H = innerHeight;
  const box = mapBox();
  const avoid = show ? avoidBoxes() : [];
  const phone = W < 700;
  const all = show ? beacons() : [];
  for (const [id, e] of els) {
    const b = all.find((x) => x.id === id);
    const p = show && b ? toScreen(b.ra, b.dec) : null;
    const r = e.el.classList.contains('is-object') ? 10 : 24;
    const visible =
      !!p &&
      p.x >= box.left + r &&
      p.x <= box.right - r &&
      p.y >= box.top + r &&
      p.y <= box.bottom - r &&
      !hits({ l: p.x - r, t: p.y - r, r: p.x + r, b: p.y + r }, avoid);
    if (e.el.hidden === visible) e.el.hidden = !visible;
    if (!visible || !p) continue;
    e.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    // The tag: right of the mark, else left, below or above; inside the window, off the panels
    // and the sky note, never over its own mark (DESIGN-v2 9).
    if (!e.tagW) e.tagW = e.tag.offsetWidth;
    const w = e.tagW;
    const th = e.tag.offsetHeight || 30;
    const gap = r + 6;
    const tries: [string, number, number][] = [
      ['right', p.x + gap, p.y - th / 2],
      ['left', p.x - gap - w, p.y - th / 2],
      ['below', p.x - w / 2, p.y + gap],
      ['above', p.x - w / 2, p.y - gap - th],
    ];
    if (phone && !e.el.classList.contains('is-object')) tries.unshift(tries.splice(2, 1)[0]!);
    const fit = tries.find(
      ([, x, y]) =>
        x >= EDGE && y >= EDGE && x + w <= W - EDGE && y + th <= H - EDGE && !hits({ l: x, t: y, r: x + w, b: y + th }, avoid),
    );
    const side = fit?.[0] ?? 'none';
    if (e.el.dataset.side !== side) e.el.dataset.side = side;
  }
}

// ----- "Drag to turn the sky" -------------------------------------------------------------------

function showDragTag(on: boolean): void {
  if (!on) {
    if (dragTag) dragTag.hidden = true;
    return;
  }
  if (!dragTag && layer) {
    dragTag = document.createElement('p');
    dragTag.className = 'sky-drag-tag glass-thin';
    dragTag.textContent = 'Drag to turn the sky';
    layer.append(dragTag);
    keepClear(dragTag);
  }
  if (dragTag) dragTag.hidden = false;
}

/** At the globe's upper right, inside the window. */
function placeDragTag(): void {
  if (!dragTag || dragTag.hidden) return;
  const g = globeCircle();
  if (!g || document.documentElement.dataset.view !== 'discover') {
    dragTag.style.visibility = 'hidden';
    return;
  }
  dragTag.style.visibility = '';
  const w = dragTag.offsetWidth;
  const x = Math.min(innerWidth - w - EDGE, g.x + g.r * 0.62);
  const y = Math.max(76, g.y - g.r * 0.92);
  dragTag.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
}

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
