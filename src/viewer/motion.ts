/**
 * The motion handle on the Stack view (O-V6, SPEC-v1 F9). In Measure's Stack view an arrow sits
 * on the picture, from where the object is at the frames' mean date. Drag its tip (or press the
 * arrow keys with it focused) to try a speed and a direction: the stack along that trial motion
 * is made again while dragging, off the page's thread (core/work.ts `stack`), and the picture,
 * the signal-to-noise and the two controls (not shifted, opposite motion: SPEC 7.1.9) follow.
 *
 * - Only the newest motion is stacked: while one stack is being made, later moves replace each
 *   other, and the newest is made next. So the picture keeps up as fast as the worker allows
 *   (O-V6 asks for 10 updates a second for 24 exposures).
 * - At the catalogue motion it is the ordinary Stack view (its numbers are Measure's). Anywhere
 *   else the picture says "trial motion" and its motion; Measure's numbers never use a trial
 *   (H4: a trial motion is not a catalogue value and not a measurement).
 * - "Snap to catalogue motion" shows when the target has one.
 *
 * The arrow is drawn through `drawHooks` (render.ts) in Path Amber, the colour of things worked
 * out and not observed; its tip is a button over the picture.
 */
import { S, pic, watch } from './state.ts';
import { currentView, draw, drawHooks, stackShown, type PictureView } from './render.ts';
import { lookFor, stackPicture, type StackView } from './paint.ts';
import { stack } from '../core/work.ts';
import { toRgba } from '../core/display.ts';
import {
  maxSpeed,
  motionToOffset,
  motionWords,
  nudge,
  offsetToMotion,
  sameMotion,
  speedAndAngle,
  trialTrack,
  type Motion,
} from '../core/motion.ts';
import type { StackPicture, StackResult } from '../core/stack.ts';
import type { CatalogueTrack, Field } from '../core/types.ts';

/** The trial motion; null means "the catalogue motion" (or none: standing still). */
let trial: Motion | null = null;
/** The newest motion asked for and not yet started. */
let want: Motion | null = null;
let busy = false;
/** The newest trial stack made, for the patch, detector and settings it was made for. */
let shown: { key: string; motion: Motion; view: StackView } | null = null;
/** When each update arrived, ms, for the rate (kept for the last few seconds). */
const updates: number[] = [];
let lastMs = 0;
let dragging = false;

/** The arrow's full length, as a share of the picture's side. */
const REACH = 0.36;

/** Starts the handle. Called once by main.ts. */
export function startMotion(): void {
  drawHooks.add(drawArrow);
  watch(['field', 'det', 'mode', 'level', 'color', 'pic'], () => {
    if (S.field !== shownField) reset();
    // A new detector or way of combining: the trial is stacked again for it.
    if (trial && active() && shown?.key !== keyNow()) {
      want = trial;
      if (!busy) void pump();
    }
    strip();
    draw();
  });
  strip();
}

let shownField: Field | null = null;

function reset(): void {
  trial = null;
  want = null;
  shown = null;
  shownField = S.field;
}

/**
 * True when the handle shows: the Stack view on a patch with pictures, at either level (v2.0
 * contract 4: Discover's ghost mission uses it in Explore).
 */
function active(): boolean {
  return !!S.field && S.mode === 'stack' && !S.color && S.groups.length > 0;
}

function catalogue(): CatalogueTrack | null {
  const c = S.set?.data.catalogue ?? null;
  return c && Number.isFinite(c.pmra) && Number.isFinite(c.pmdec) ? c : null;
}

/** The motion the arrow shows: the trial, else the catalogue's, else standing still. */
function motionNow(): Motion {
  if (trial) return trial;
  const c = catalogue();
  return c ? { pmra: c.pmra, pmdec: c.pmdec } : { pmra: 0, pmdec: 0 };
}

function max(): number {
  return maxSpeed(catalogue());
}

/** What the stack is for: patch, detector and how frames are combined. */
function keyNow(): string {
  return `${S.set?.key ?? 'field'}|${S.field?.ra}|${S.field?.dec}|${S.field?.n}|${S.det}|${pic().combineBy}`;
}

function mjdsNow(): number[] {
  return (S.field?.frames ?? []).filter((f) => f.det === S.det && f.sigma > 0).map((f) => f.mjd);
}

/** Where the arrow starts: the object at the frames' mean date (or the patch's middle). */
function anchor(): { ra: number; dec: number } | null {
  const f = S.field;
  if (!f) return null;
  const t = trialTrack(mjdsNow(), catalogue() ?? { ra: f.ra, dec: f.dec }, { pmra: 0, pmdec: 0 });
  return { ra: t.ra, dec: t.dec };
}

/**
 * The trial stack to paint, for render.ts's Stack view: the newest one made for this patch,
 * detector and settings, even while a newer one is being made (so the picture never blanks).
 * Null when the arrow is at the catalogue motion: the ordinary stack is shown then.
 */
export function trialView(): StackView | null {
  if (!active() || !trial || !shown || shown.key !== keyNow()) return null;
  return shown.view;
}

/** The trial motion on screen, for tests and the guide; null at the catalogue motion. */
export function trialMotion(): Motion | null {
  return trial ? { ...trial } : null;
}

/** The stack on screen along a motion, for a mission's check (v2.0 contract 4). */
export interface TrialResult {
  /** What it was made for: patch, detector and how frames are combined (`keyNow()`). */
  key: string;
  /** The motion it was stacked along, ″/yr. */
  motion: Motion;
  /** True when this is the ordinary stack along the catalogue motion. */
  atCatalogue: boolean;
  /** The stack and its two controls; read `along.snr` and `controls[i].snr`. */
  result: StackResult;
}

/**
 * The stack result for the arrow's motion right now, for Discover's ghost mission (v2.0
 * contract 4). Null when the Stack view is not on, while the newest stack is still being made, or
 * when the one on hand was made for an older key (another patch, detector or way of combining).
 * At the catalogue motion it is the ordinary stack's result (render.ts `stackShown()`).
 */
export function trialResult(): TrialResult | null {
  if (!active()) return null;
  const key = keyNow();
  const c = catalogue();
  let ordinary: { key: string; result: StackResult | null } | null = null;
  if (!trial && c && S.field) {
    const onScreen = stackShown();
    // The one on screen counts only if it is the stack for the patch and settings now.
    const now = stackPicture(S.field, S.groups, S.det, c, pic(), draw);
    if (onScreen && onScreen === now) ordinary = { key, result: onScreen.result };
  }
  return pickTrialResult(
    key,
    trial,
    shown ? { key: shown.key, motion: shown.motion, result: shown.view.result } : null,
    c ? { pmra: c.pmra, pmdec: c.pmdec } : null,
    ordinary,
  );
}

/**
 * The decision behind `trialResult()`, pure so it can be tested in Node.
 *
 * @param key What the stack must be for now (`keyNow()`).
 * @param trial The arrow's trial motion; null at the catalogue motion.
 * @param made The newest trial stack made, with the key and motion it was made for.
 * @param cat The catalogue motion, ″/yr; null when the target has none.
 * @param ordinary The ordinary stack on screen and the key it is for; null when not ready.
 * @returns The result, or null when the one on hand is not for `key` and `trial` (old or pending).
 */
export function pickTrialResult(
  key: string,
  trial: Motion | null,
  made: { key: string; motion: Motion; result: StackResult | null } | null,
  cat: Motion | null,
  ordinary: { key: string; result: StackResult | null } | null,
): TrialResult | null {
  if (trial) {
    if (!made || made.key !== key || !made.result) return null;
    if (made.motion.pmra !== trial.pmra || made.motion.pmdec !== trial.pmdec) return null;
    return { key, motion: { ...made.motion }, atCatalogue: false, result: made.result };
  }
  if (!cat || !ordinary || ordinary.key !== key || !ordinary.result) return null;
  return { key, motion: { ...cat }, atCatalogue: true, result: ordinary.result };
}

/** How fast the stack follows the handle: updates in the last 2 s, per second, and the last one's time. */
export function motionRate(): { perSecond: number; lastMs: number; count: number } {
  const now = performance.now();
  const recent = updates.filter((t) => now - t < 2000);
  return { perSecond: recent.length / 2, lastMs, count: updates.length };
}

/**
 * Sets the trial motion (the arrow's tip), and stacks along it.
 * @param m The motion, or null for the catalogue motion.
 */
export function setTrial(m: Motion | null): void {
  const c = catalogue();
  const atCatalogue = m && c ? sameMotion(m, c) : false;
  trial = !m || atCatalogue ? null : m;
  if (!c && m && Math.hypot(m.pmra, m.pmdec) < 1) trial = null;
  if (trial) {
    want = trial;
    if (!busy) void pump();
  }
  strip();
  draw();
}

/** Makes the newest wanted stack, then the next newest, until none is wanted. */
async function pump(): Promise<void> {
  busy = true;
  try {
    while (want && active()) {
      const m = want;
      want = null;
      const key = keyNow();
      const field = S.field;
      const at = catalogue() ?? (field ? { ra: field.ra, dec: field.dec } : null);
      if (!at) break;
      const t0 = performance.now();
      try {
        const r = await stack(S.det, trialTrack(mjdsNow(), at, m), pic().combineBy, { name: 'trial motion' });
        if (key !== keyNow()) continue;
        lastMs = performance.now() - t0;
        updates.push(performance.now());
        while (updates.length > 200) updates.shift();
        const { speed, pa } = speedAndAngle(m);
        shown = {
          key,
          motion: m,
          view: {
            pix: r.along.pix,
            // The label names the motion: it is also how the picture's cache tells trials apart.
            label: `Along a trial motion of ${speed.toFixed(2)}″/yr, position angle ${Math.round(pa)}°`,
            frames: r.frames,
            result: r,
          },
        };
        draw();
        strip();
      } catch (err) {
        if ((err as DOMException)?.name !== 'AbortError') console.warn('motion: the trial stack failed', err);
      }
    }
  } finally {
    busy = false;
  }
}

// ----- The arrow on the picture -------------------------------------------------------------

let knob: HTMLButtonElement | null = null;

function drawArrow(ctx: CanvasRenderingContext2D, view: Readonly<PictureView>): void {
  const k = ensureKnob();
  if (!active() || view.mode !== 'stack') {
    if (k) k.hidden = true;
    return;
  }
  const a = anchor();
  const tail = a ? view.skyToPic(a.ra, a.dec) : null;
  if (!tail || !k) return;
  const radius = view.size * REACH;
  const m = motionNow();
  const off = motionToOffset(m, radius, max());
  const tip = { x: tail.x + off.dx, y: tail.y + off.dy };
  const css = getComputedStyle(document.documentElement);
  const amber = css.getPropertyValue('--st-accent-2').trim() || '#ffb03a';
  const ink = css.getPropertyValue('--st-ink-3').trim() || '#7d7d86';

  // The reach of the handle: a faint dotted ring, so the scale reads at a glance.
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.arc(tail.x, tail.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // The catalogue motion's tip, when there is one and the arrow is elsewhere: a small dashed ring.
  const c = catalogue();
  if (c && trial) {
    const co = motionToOffset(c, radius, max());
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = amber;
    ctx.beginPath();
    ctx.arc(tail.x + co.dx, tail.y + co.dy, 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The arrow.
  ctx.setLineDash([]);
  ctx.strokeStyle = amber;
  ctx.fillStyle = amber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tail.x, tail.y, 3, 0, Math.PI * 2);
  ctx.fill();
  const len = Math.hypot(off.dx, off.dy);
  if (len > 6) {
    const ux = off.dx / len;
    const uy = off.dy / len;
    const end = { x: tip.x - ux * 9, y: tip.y - uy * 9 };
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tip.x - ux * 2, tip.y - uy * 2);
    ctx.lineTo(end.x - uy * 5, end.y + ux * 5);
    ctx.lineTo(end.x + uy * 5, end.y - ux * 5);
    ctx.closePath();
    ctx.fill();
  }
  if (stripFor !== (stackShown()?.result ?? null)) strip();
  k.hidden = false;
  k.style.left = `${tip.x}px`;
  k.style.top = `${tip.y}px`;
  const words = motionWords(m);
  k.setAttribute(
    'aria-label',
    `Motion handle: ${trial ? 'trial motion' : c ? 'catalogue motion' : 'no motion'}, ${words}. Drag it, or use the arrow keys (Shift for bigger steps).`,
  );
}

function ensureKnob(): HTMLButtonElement | null {
  if (knob?.isConnected) return knob;
  const host = document.getElementById('frame-pic');
  if (!host) return null;
  const b = document.createElement('button');
  b.className = 'mh-knob';
  b.type = 'button';
  b.hidden = true;
  b.dataset.guide = 'motion-handle';
  host.append(b);
  knob = b;

  let start: { x: number; y: number; tip: { x: number; y: number } } | null = null;
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    b.focus();
    try {
      b.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer cannot be captured; the drag still works over the knob.
    }
    const r = b.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, tip: { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
    dragging = true;
    document.documentElement.toggleAttribute('data-motion-drag', true);
  });
  b.addEventListener('pointermove', (e) => {
    if (!start) return;
    const view = currentView();
    const a = anchor();
    const canvas = document.querySelector<HTMLCanvasElement>('#frame-pic canvas');
    if (!view || !a || !canvas) return;
    const tail = view.skyToPic(a.ra, a.dec);
    if (!tail) return;
    const cr = canvas.getBoundingClientRect();
    // The tip follows the pointer, keeping the grab offset.
    const x = start.tip.x + (e.clientX - start.x) - cr.left;
    const y = start.tip.y + (e.clientY - start.y) - cr.top;
    setTrial(offsetToMotion(x - tail.x, y - tail.y, view.size * REACH, max()));
  });
  const end = (e: PointerEvent) => {
    if (!start) return;
    start = null;
    dragging = false;
    document.documentElement.toggleAttribute('data-motion-drag', false);
    e.stopPropagation();
  };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  b.addEventListener('click', (e) => e.stopPropagation());
  b.addEventListener('keydown', (e) => {
    const next = nudge(motionNow(), e.key, e.shiftKey, max());
    if (!next) return;
    // The page's arrow keys step the dates; on the handle they move it instead.
    e.preventDefault();
    e.stopPropagation();
    setTrial(next);
  });
  return b;
}

// ----- The readout under the views ----------------------------------------------------------

/** The stack the readout shows, to redo it when the stack on screen changes. */
let stripFor: StackResult | null = null;

function strip(): void {
  stripFor = active() ? (stackShown()?.result ?? null) : null;
  const host = document.getElementById('frame-motion');
  if (!host) return;
  const on = active();
  host.hidden = !on;
  document.getElementById('frame-explain')?.toggleAttribute('data-motion', on);
  if (!on) return;
  host.classList.add('mh-strip');
  host.dataset.guide = 'motion-readout';
  const c = catalogue();
  const m = motionNow();
  const result = trial ? (shown?.key === keyNow() ? shown.view.result : null) : catalogueResult();
  const pending = trial && (!shown || !sameMotion(shown.motion, trial));

  // One line: what the arrow is, its speed and direction (the full words on hover), and Snap.
  const head = document.createElement('div');
  head.className = 'mh-head';
  const words = document.createElement('p');
  words.className = 'mh-words term';
  words.tabIndex = 0;
  const what = document.createElement('b');
  what.textContent = trial ? 'Trial motion' : c ? 'Catalogue motion' : 'No motion';
  const { speed, pa } = speedAndAngle(m);
  words.append(what, speed < 0.005 ? ' none' : ` ${speed.toFixed(2)}″/yr, ${pointOf(pa)}`);
  words.dataset.tip = `${what.textContent}: ${motionWords(m)}. ${
    trial ? 'Set with the handle: not a catalogue value or a measurement.' : c ? `From ${c.from}.` : ''
  } Drag the arrow’s tip, or focus it and press the arrow keys. The two checks never move with it: a real mover is strongest along its own motion and weaker in both.`;
  head.append(words);
  if (trial) {
    const snap = document.createElement('button');
    snap.className = 'btn text mh-snap';
    snap.textContent = c ? 'Snap to catalogue motion' : 'Standing still';
    if (c) {
      snap.dataset.guide = 'motion-snap';
      snap.dataset.tip = `Back to the catalogue’s motion, from ${c.from}`;
    }
    snap.addEventListener('click', () => setTrial(null));
    head.append(snap);
  }

  const row = document.createElement('div');
  row.className = 'mh-row';
  row.classList.toggle('pending', !!pending);
  const parts: [string, StackPicture | null][] = [
    ['Along', result?.along ?? null],
    ['Not shifted', result?.controls[0] ?? null],
    ['Opposite', result?.controls[1] ?? null],
  ];
  const scale = result && S.field ? thumbScale(S.field, result) : null;
  for (const [label, sp] of parts) row.append(cell(label, sp, result, scale));

  host.replaceChildren(head, row);
  const rate = motionRate();
  host.dataset.rate = rate.perSecond.toFixed(1);
  host.dataset.lastMs = lastMs.toFixed(0);
  host.dataset.count = String(rate.count);
}

/** "west", "north-east"…: the nearest of eight directions on the sky. */
function pointOf(pa: number): string {
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][
    Math.round(pa / 45) % 8
  ]!;
}

/** The ordinary catalogue stack on screen (render.ts's), if it is ready. */
function catalogueResult(): StackResult | null {
  return stackShown()?.result ?? null;
}

/** One check: a small picture around the object and its signal-to-noise. */
function cell(
  label: string,
  sp: StackPicture | null,
  r: StackResult | null,
  scale: { lo: number; hi: number } | null,
): HTMLElement {
  const box = document.createElement('figure');
  box.className = 'mh-cell';
  const cv = document.createElement('canvas');
  cv.className = 'mh-thumb';
  const cap = document.createElement('figcaption');
  const snr = sp && Number.isFinite(sp.snr) ? `${sp.snr.toFixed(1)}×` : sp ? 'not measured' : '…';
  const b = document.createElement('b');
  b.textContent = snr;
  cap.append(`${label} `, b);
  box.dataset.tip = `${label === 'Along' ? 'Stacked along the motion shown' : label === 'Not shifted' ? 'Check: the same exposures not shifted' : 'Check: shifted along the opposite motion'}. ${
    sp && Number.isFinite(sp.snr)
      ? `${sp.snr.toFixed(1)} times the noise at the object’s place (forced photometry).`
      : sp
        ? 'Not measured: the pixels at the object’s place are flagged or missing.'
        : 'Being stacked.'
  } The three small pictures share one scale.`;
  box.append(cv, cap);
  if (sp && r && scale && S.field) paintThumb(cv, S.field, sp.pix, centre(S.field, r), scale);
  return box;
}

const HALF = 10;
const SIDE = 2 * HALF + 1;

function centre(field: Field, r: StackResult): { x: number; y: number } {
  return { x: r.x ?? (field.n - 1) / 2, y: r.y ?? (field.n - 1) / 2 };
}

/** A 21 × 21 pixel crop around the object (NaN beyond the grid). */
function cropAt(field: Field, pix: Float32Array, at: { x: number; y: number }): Float32Array {
  const crop = new Float32Array(SIDE * SIDE).fill(Number.NaN);
  const cx = Math.round(at.x);
  const cy = Math.round(at.y);
  for (let j = 0; j < SIDE; j++)
    for (let i = 0; i < SIDE; i++) {
      const xx = cx - HALF + i;
      const yy = cy - HALF + j;
      if (xx >= 0 && yy >= 0 && xx < field.n && yy < field.n) crop[j * SIDE + i] = pix[yy * field.n + xx] ?? Number.NaN;
    }
  return crop;
}

/**
 * One black and white point for the three small pictures, so they compare fairly: black at the
 * median of the three crops, white at the brightest pixel within 2 pixels of the object in any of
 * them (at least 5 times the crops' noise above black).
 */
function thumbScale(field: Field, r: StackResult): { lo: number; hi: number } {
  const at = centre(field, r);
  const values: number[] = [];
  let peak = -Infinity;
  for (const sp of [r.along, ...r.controls]) {
    const crop = cropAt(field, sp.pix, at);
    crop.forEach((v, k) => {
      if (!Number.isFinite(v)) return;
      values.push(v);
      const dx = (k % SIDE) - HALF;
      const dy = Math.floor(k / SIDE) - HALF;
      if (dx * dx + dy * dy <= 4) peak = Math.max(peak, v);
    });
  }
  if (!values.length) return { lo: 0, hi: 1 };
  values.sort((a, b) => a - b);
  const lo = values[values.length >> 1]!;
  const mad = values.map((v) => Math.abs(v - lo)).sort((a, b) => a - b)[values.length >> 1]! * 1.4826;
  return { lo, hi: Math.max(peak, lo + 5 * (mad || 1)) };
}

/** Draws the crop through the frame's colour map, on the shared scale, with hard pixel edges. */
function paintThumb(
  cv: HTMLCanvasElement,
  field: Field,
  pix: Float32Array,
  at: { x: number; y: number },
  scale: { lo: number; hi: number },
): void {
  const side = SIDE;
  const crop = cropAt(field, pix, at);
  const look = lookFor(field, S.groups, Math.min(S.ref, S.groups.length - 1), pic(), S.det);
  const rgba = new Uint8ClampedArray(toRgba(crop, scale, look.lut));
  for (let i = 0; i < crop.length; i++) {
    if (Number.isFinite(crop[i] ?? Number.NaN)) continue;
    rgba.set([0x1a, 0x22, 0x40, 255], i * 4); // --st-raise: no value here (H6)
  }
  cv.width = side;
  cv.height = side;
  cv.getContext('2d')?.putImageData(new ImageData(rgba, side, side), 0, 0);
}

/** True while the handle is being dragged (for tests). */
export function motionDragging(): boolean {
  return dragging;
}
