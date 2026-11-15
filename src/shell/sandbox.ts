/**
 * The sandbox (O-V7): a pretend planet on the frame's picture, and whether SPHEREx would show it.
 * The model is core/sandbox.ts; this is the card (#sandbox, in the left column where the places
 * list sits), the pretend planet drawn on the picture, and the ways in (the search words
 * "planet x" or "sandbox", and About's Planet X section).
 *
 * Honesty (H3, H4): everything on the card is labelled a model and "Pretend". The planet is drawn
 * only over the picture, dashed, with a "Pretend" tag, through render.ts's `drawHooks`. It is never
 * added to the pixels, to `S`, or to anything Measure, the picture tools or a download read; no
 * module that measures, lists, charts or exports imports this one (tests/sandbox.test.ts).
 */
import { S, watch } from '../viewer/state.ts';
import { draw, drawHooks, onTap, type PictureView } from '../viewer/render.ts';
import { addSearchSource, type SearchHit } from '../viewer/omnibox.ts';
import { psfWidth } from '../core/stack.ts';
import { wcsPix2Sky } from '../core/real.ts';
import { offsetBy, parallaxFactors } from '../core/astro.ts';
import {
  DEFAULT_PLANET,
  LIMITS,
  answer,
  clampPlanet,
  fmtFlux,
  fmtTimes,
  placeOn,
  temperature,
  verdict,
  yearlyShift,
  type DetectorNoise,
  type PretendPlanet,
  type Verdict,
} from '../core/sandbox.ts';
import type { Det, Field } from '../core/types.ts';
import { icon } from './icons.ts';
import { closeAll as closePlaces } from './places/panels.ts';
import { makeRoom, watchRoom } from './places/room.ts';
import { layout } from './sheet.ts';

/** Neptune where it is, from NASA's Neptune Fact Sheet (read 15 November 2026). */
const NEPTUNE: PretendPlanet = { radius: 24_622 / 6_371.0, distance: 30.07, albedo: 0.442, ownHeat: 0 };
const NEPTUNE_SOURCE = 'NASA Neptune Fact Sheet (nssdc.gsfc.nasa.gov): mean radius 24,622 km, 30.07 AU, geometric albedo 0.442';

let planet: PretendPlanet = { ...DEFAULT_PLANET };
/** Its mean place (degrees), per patch; set when the card opens or the user places it. */
let place: { field: Field; ra: number; dec: number } | null = null;
let placing = false;
/** Measured point-source widths, per patch and detector (each measured in its own task). */
const widths = new WeakMap<Field, Map<number, number>>();

function card(): HTMLElement | null {
  return document.getElementById('sandbox');
}

/** True while the sandbox is open. */
export function sandboxOpen(): boolean {
  return !(card()?.hidden ?? true);
}

/** Wires the card, the drawing and the search words. Called once by main.ts. */
export function startSandbox(): void {
  const c = card();
  if (!c) return;
  c.classList.add('sb-panel');
  c.setAttribute('aria-label', 'Sandbox: a pretend planet');
  watchRoom([c], closeSandbox);
  const others = ['places-list', 'place-card', 'finds'].map((id) => document.getElementById(id));
  new MutationObserver(() => {
    if (!c.hidden && others.some((o) => o && !o.hidden)) closeSandbox();
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  drawHooks.add(drawPlanet);
  watch(['field', 'det'], () => {
    if (!sandboxOpen()) return;
    measureWidths();
    fill();
  });
  onTap((p) => {
    if (!placing || !sandboxOpen() || !S.field) return;
    placing = false;
    setPlace(S.field, p.ra, p.dec, mjdOnScreen());
    fill();
    draw();
  });
  addSearchSource({ name: 'sandbox', label: 'Sandbox', search: searchWords });
}

/** What the sandbox shows now, for Discover's Planet X mission (v2.0 contract "Sandbox reading"). */
export interface SandboxReading {
  /** The pretend planet as set on the card (a model input, never data). */
  planet: PretendPlanet;
  /** The model's verdict against this patch's measured noise (core/sandbox.ts). */
  verdict: Verdict;
  /** The patch the verdict is for: a check rejects a reading for another patch. */
  patchKey: string;
  /** The patch's measured noise per detector, for lane H's `planetEdges()` (Planet X's result). */
  noises: DetectorNoise[];
}

const sandboxFns = new Set<(r: SandboxReading | null) => void>();

/**
 * The card's reading now. Null while the card is closed, without a patch, or while the patch's
 * noise is still being measured (so a check never reads a half-made "unknown").
 */
export function sandboxState(): SandboxReading | null {
  const field = S.field;
  if (!sandboxOpen() || !field || !field.frames.length) return null;
  const m = widths.get(field);
  const pending = ([1, 2, 3, 4, 5, 6] as Det[]).some((d) => !m?.has(d) && field.frames.some((f) => f.det === d));
  if (pending) return null;
  const measured = noises(field);
  return {
    planet: { ...planet },
    verdict: verdict(answer(planet, measured)),
    noises: measured,
    patchKey: `${S.set?.key ?? 'field'}|${field.ra}|${field.dec}|${field.n}`,
  };
}

/**
 * Hear the reading change (the card filled again, opened or closed).
 * @returns A function that stops listening.
 */
export function onSandbox(fn: (r: SandboxReading | null) => void): () => void {
  sandboxFns.add(fn);
  return () => {
    sandboxFns.delete(fn);
  };
}

function tellSandbox(): void {
  const r = sandboxState();
  for (const fn of [...sandboxFns]) {
    try {
      fn(r);
    } catch (err) {
      console.error('sandbox: an onSandbox listener failed', err);
    }
  }
}

/**
 * Opens the sandbox card (the search words, About's Planet X section, Discover's Planet X).
 * @param opts `under` (v2.0): the element the card opens under. On a desktop the card hangs
 *   8 px under it, as wide as it, and follows it while it moves or changes size (Discover's
 *   mission card). Inside the phone sheet or a phone layout, the card is put in the page flow
 *   right after it. Without `under`, the card opens in the left column, as before.
 */
export function openSandbox(opts: { under?: HTMLElement } = {}): void {
  const c = card();
  if (!c) return;
  closePlaces();
  document.querySelector<HTMLElement>('#finds:not([hidden]) [data-close]')?.click();
  c.hidden = false;
  if (S.field && place?.field !== S.field) defaultPlace(S.field);
  measureWidths();
  fill();
  makeRoom(c);
  if (opts.under) hangUnder(c, opts.under);
  else unhang();
  draw();
}

/** Where the card goes back to when it stops hanging under something. */
let home: Comment | null = null;
let stopHanging: (() => void) | null = null;

/** Keeps the card under `under`: fixed under it on a desktop, in the flow after it on a phone. */
function hangUnder(c: HTMLElement, under: HTMLElement): void {
  unhang();
  const inFlow = !!under.closest('#sheet') || layout().kind !== 'desktop';
  if (inFlow) {
    home = document.createComment('sandbox');
    c.before(home);
    under.after(c);
    Object.assign(c.style, { position: 'static', width: 'auto', maxHeight: 'none', top: '', left: '' });
    c.dataset.under = 'flow';
    stopHanging = () => undefined;
    return;
  }
  const place = () => {
    if (c.hidden || !under.isConnected) return;
    const r = under.getBoundingClientRect();
    const top = Math.round(r.bottom + 8);
    Object.assign(c.style, {
      top: `${top}px`,
      left: `${Math.round(r.left)}px`,
      width: `${Math.round(r.width)}px`,
      maxHeight: `calc(100vh - ${top}px - var(--bar-bottom) - var(--bar-room) - 14px)`,
    });
  };
  c.dataset.under = 'fixed';
  place();
  const ro = new ResizeObserver(place);
  ro.observe(under);
  addEventListener('resize', place);
  const mo = new MutationObserver(place);
  mo.observe(under, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  stopHanging = () => {
    ro.disconnect();
    mo.disconnect();
    removeEventListener('resize', place);
  };
}

/** Puts the card back in its own place. */
function unhang(): void {
  const c = card();
  stopHanging?.();
  stopHanging = null;
  if (!c || !c.dataset.under) return;
  if (home) {
    home.replaceWith(c);
    home = null;
  }
  for (const k of ['position', 'width', 'maxHeight', 'top', 'left'] as const) c.style[k] = '';
  delete c.dataset.under;
}

/** Closes the card; the pretend planet leaves the picture with it. */
export function closeSandbox(): void {
  const c = card();
  if (!c || c.hidden) return;
  c.hidden = true;
  placing = false;
  unhang();
  draw();
  tellSandbox();
}

// ----- Where it is ----------------------------------------------------------------------------

function mjdOnScreen(): number | null {
  const g = S.groups[S.epoch];
  return S.mode === 'stack' || S.mode === 'two' || !g || !Number.isFinite(g.mjd) ? null : g.mjd;
}

/** Puts it a quarter of the way to the north-east corner of the picture, on the date on screen. */
function defaultPlace(field: Field): void {
  const c = (field.n - 1) / 2;
  const at = wcsPix2Sky(field.wcs, c - field.n / 5, c - field.n / 5);
  setPlace(field, at.ra, at.dec, mjdOnScreen());
}

/** Places it so that on date `mjd` (or at its mean place) it is at (ra, dec). */
function setPlace(field: Field, ra: number, dec: number, mjd: number | null): void {
  if (mjd === null) {
    place = { field, ra, dec };
    return;
  }
  const plx = yearlyShift(planet).parallax;
  const f = parallaxFactors(mjd, ra, dec);
  const mean = offsetBy(ra, dec, -plx * f.east, -plx * f.north);
  place = { field, ...mean };
}

// ----- The noise of the patch -----------------------------------------------------------------

/** Measures each detector's point-source width, one detector per task (TLS-8). */
function measureWidths(): void {
  const field = S.field;
  if (!field) return;
  let m = widths.get(field);
  if (!m) widths.set(field, (m = new Map()));
  const todo = ([1, 2, 3, 4, 5, 6] as Det[]).filter((d) => !m.has(d) && field.frames.some((f) => f.det === d));
  const next = () => {
    const d = todo.shift();
    if (d === undefined || S.field !== field) return;
    m.set(d, psfWidth(field, d));
    if (sandboxOpen()) fill();
    window.setTimeout(next, 0);
  };
  window.setTimeout(next, 0);
}

function noises(field: Field): DetectorNoise[] {
  const m = widths.get(field);
  return ([1, 2, 3, 4, 5, 6] as Det[]).map((det) => ({
    det,
    pixelNoise: field.noise[det - 1] ?? Number.NaN,
    width: m?.get(det) ?? Number.NaN,
    exposures: field.frames.filter((f) => f.det === det).length,
  }));
}

// ----- The card -------------------------------------------------------------------------------

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function numberRow(
  label: string,
  key: keyof PretendPlanet,
  unit: string,
  digits: number,
  tip: string,
): HTMLElement {
  const row = h('label', 'sb-input');
  const name = h('span', 'sb-input-name term', label);
  name.dataset.tip = tip;
  const input = h('input', 'field sb-num');
  input.type = 'number';
  input.min = String(LIMITS[key].min);
  input.max = String(LIMITS[key].max);
  input.step = String(LIMITS[key].step);
  input.value = planet[key].toFixed(digits);
  input.dataset.guide = `sandbox-${key}`;
  input.setAttribute('aria-label', `${label}, ${unit}`);
  input.addEventListener('change', () => {
    const was = yearlyShift(planet).parallax;
    planet = clampPlanet({ ...planet, [key]: Number(input.value) });
    // Keep its place on the date on screen when its parallax changes with the distance.
    if (key === 'distance' && place && was !== yearlyShift(planet).parallax) {
      const mjd = mjdOnScreen();
      if (mjd !== null) {
        const f = parallaxFactors(mjd, place.ra, place.dec);
        const now = offsetBy(place.ra, place.dec, was * f.east, was * f.north);
        setPlace(place.field, now.ra, now.dec, mjd);
      }
    }
    fill();
    draw();
  });
  row.append(name, input, h('span', 'sb-unit', unit));
  return row;
}

function fill(): void {
  const c = card();
  if (!c || c.hidden) return;
  const keep = c.querySelector('.sb-body')?.scrollTop ?? 0;
  const focused = (document.activeElement as HTMLElement | null)?.dataset.guide;

  const close = h('button', 'icon-btn sm');
  close.innerHTML = icon('close');
  close.dataset.close = '';
  close.setAttribute('aria-label', 'Close');
  close.dataset.tip = 'Close (Esc)';
  close.addEventListener('click', closeSandbox);
  const head = h('div', 'sb-head');
  head.append(h('h2', 'sb-title', 'Sandbox: a pretend planet'), close);

  const lede = h('p', 'sb-lede');
  lede.append(
    h('span', 'pill warn', 'Pretend'),
    ' Could SPHEREx see a planet far beyond Neptune? Set one up. Nothing here is observed: the numbers come from a simple model.',
  );

  const inputs = h('div', 'sb-inputs');
  inputs.append(
    numberRow('Size', 'radius', 'Earth radii', 1, 'Its radius. Neptune is 3.9 Earth radii.'),
    numberRow('Distance', 'distance', 'AU from the Sun', 0, 'One AU is the Earth’s distance from the Sun. Neptune is at 30.'),
    numberRow('Reflectivity', 'albedo', '0 to 1', 2, 'Its geometric albedo: how much sunlight it reflects back. Neptune: 0.44.'),
    numberRow('Own heat', 'ownHeat', 'K', 0, 'A temperature for heat of its own, as giant planets have. 0: warmed by sunlight only.'),
  );

  const actions = h('div', 'sb-actions');
  const move = h('button', `btn${placing ? ' on' : ''}`, placing ? 'Tap the picture…' : 'Place it on the picture');
  move.dataset.guide = 'sandbox-place';
  move.setAttribute('aria-pressed', String(placing));
  move.addEventListener('click', () => {
    placing = !placing;
    fill();
  });
  const nep = h('button', 'btn text', 'Neptune, where it is');
  nep.dataset.tip = NEPTUNE_SOURCE;
  nep.addEventListener('click', () => {
    planet = { ...NEPTUNE };
    fill();
    draw();
  });
  const far = h('button', 'btn text', 'Reset');
  far.addEventListener('click', () => {
    planet = { ...DEFAULT_PLANET };
    fill();
    draw();
  });
  actions.append(move, nep, far);

  const body = h('div', 'sb-body');
  body.dataset.scroll = '';
  body.append(...results());

  c.replaceChildren(head, lede, inputs, actions, body);
  const b = c.querySelector('.sb-body');
  if (b) b.scrollTop = keep;
  if (focused) c.querySelector<HTMLElement>(`[data-guide="${focused}"]`)?.focus();
  tellSandbox();
}

function results(): HTMLElement[] {
  const field = S.field;
  if (!field || !field.frames.length)
    return [h('p', 'sb-line', 'Open real pictures in the frame first: the answer compares the planet with the noise measured in them.')];
  const ans = answer(planet, noises(field));
  const v = verdict(ans);
  const out: HTMLElement[] = [];
  const say = h('p', `sb-verdict ${v.kind}`);
  say.dataset.guide = 'sandbox-verdict';
  say.append(h('span', 'pill', 'Model'), ` ${v.text}`);
  out.push(say);
  if (field.simulated)
    out.push(h('p', 'sb-line', 'These pictures are simulated, so the noise compared with is made up too.'));

  const table = h('table', 'sb-table');
  const n = Math.max(...ans.map((a) => a.exposures));
  table.innerHTML = `<thead><tr><th>Detector</th><th class="num">µJy</th><th class="num">One</th><th class="num">Stack of ${n}</th></tr></thead>`;
  const tb = h('tbody', '');
  for (const a of ans) {
    const tr = h('tr', v.best?.det === a.det ? 'best' : '');
    tr.append(
      h('td', '', `D${a.det} · ${a.lam.toFixed(2)} µm`),
      h('td', 'num', fmtFlux(a.total)),
      h('td', 'num', Number.isFinite(a.one) ? fmtTimes(a.one) : 'not measured'),
      h('td', 'num', Number.isFinite(a.stacked) ? (a.exposures === n ? fmtTimes(a.stacked) : `${fmtTimes(a.stacked)} of ${a.exposures}`) : '–'),
    );
    tr.title = `Reflected ${fmtFlux(a.reflected)} µJy, own glow ${fmtFlux(a.glow)} µJy. One exposure's noise for a point source here: ${fmtFlux(a.noise)} µJy (measured pixel noise × √(4π s²)).`;
    tb.append(tr);
  }
  table.append(tb);
  out.push(table);
  out.push(
    h(
      'p',
      'sb-line',
      `Brightness is reflected sunlight plus its own glow, in µJy. “One” (one exposure) and “Stack” are times the noise measured in this patch; 5× counts as seen. A stack adds as the square root of the count: the best case.`,
    ),
  );

  const t = temperature(planet);
  const y = yearlyShift(planet);
  const across = (S.fov * 60) / 2;
  out.push(
    h(
      'p',
      'sb-line',
      `Its temperature: ${Math.round(t.total)} K. Each year its parallax swings it ${fmtArc(y.parallax)} (${Math.round(y.parallaxPixels)} pixels) to each side of its mean place${
        y.parallax > across ? ', further than this patch reaches, so each pass sees it in a different place' : ''
      }; its own orbit adds about ${fmtArc(y.orbit)} a year. A stack must follow that path.`,
    ),
  );
  out.push(
    h(
      'p',
      'sb-line sb-honest',
      'The pretend planet is drawn dashed on the picture only. It is never added to the pixels, a measurement, a list, a chart or a download.',
    ),
  );
  return out;
}

function fmtArc(arcsec: number): string {
  if (arcsec >= 3600) return `${(arcsec / 3600).toFixed(1)}°`;
  if (arcsec >= 120) return `${(arcsec / 60).toFixed(1)}′`;
  return `${arcsec.toFixed(arcsec < 10 ? 1 : 0)}″`;
}

// ----- On the picture ---------------------------------------------------------------------------

function drawPlanet(ctx: CanvasRenderingContext2D, view: Readonly<PictureView>): void {
  if (!sandboxOpen() || !place || place.field !== view.field) return;
  const mjd = view.mode === 'stack' || view.mode === 'two' ? null : view.mjd;
  const at = mjd === null ? place : placeOn(planet, place, mjd);
  const p = view.skyToPic(at.ra, at.dec);
  if (!p) return;
  const css = getComputedStyle(document.documentElement);
  const amber = css.getPropertyValue('--st-accent-2').trim() || '#ffb03a';
  const r = Math.max(7, 1.6 * view.k);
  const inside = p.x > 0 && p.y > 0 && p.x < view.size && p.y < view.size;
  ctx.strokeStyle = amber;
  ctx.fillStyle = amber;
  ctx.lineWidth = 1.6;
  ctx.font = `600 12px ${css.getPropertyValue('--font').trim() || 'sans-serif'}`;
  ctx.textBaseline = 'middle';
  const tag = (x: number, y: number, text: string) => {
    const w = ctx.measureText(text).width + 12;
    const tx = Math.min(view.size - w - 4, Math.max(4, x - w / 2));
    const ty = Math.min(view.size - 14, Math.max(14, y));
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(9, 13, 28, 0.82)';
    ctx.beginPath();
    ctx.roundRect(tx, ty - 10, w, 20, 7);
    ctx.fill();
    ctx.fillStyle = amber;
    ctx.fillText(text, tx + 6, ty);
    ctx.restore();
  };
  if (inside) {
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    tag(p.x, p.y - r - 14, mjd === null ? 'Pretend planet (mean place)' : 'Pretend planet');
    return;
  }
  // Off the picture on this date (its parallax): an arrow at the edge pointing to it.
  const c = view.size / 2;
  const dx = p.x - c;
  const dy = p.y - c;
  const s = (c - 16) / Math.max(Math.abs(dx), Math.abs(dy));
  const ex = c + dx * s;
  const ey = c + dy * s;
  const ux = dx / Math.hypot(dx, dy);
  const uy = dy / Math.hypot(dx, dy);
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(ex - ux * 16, ey - uy * 16);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ex + ux * 2, ey + uy * 2);
  ctx.lineTo(ex - ux * 7 - uy * 5, ey - uy * 7 + ux * 5);
  ctx.lineTo(ex - ux * 7 + uy * 5, ey - uy * 7 - ux * 5);
  ctx.closePath();
  ctx.fill();
  const away = Math.hypot(dx, dy) / view.k;
  tag(ex - ux * 40, ey - uy * 40, `Pretend planet: ${fmtArc(away * (view.field?.scale ?? 6.15))} this way`);
}

// ----- Search words -----------------------------------------------------------------------------

function searchWords(query: string): SearchHit[] {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const words = ['planet x', 'planet nine', 'planet 9', 'sandbox', 'pretend planet', 'pretend'];
  if (q.length < 3 || !words.some((w) => w.startsWith(q) || q.startsWith(w))) return [];
  return [
    {
      name: 'Could SPHEREx see Planet X?',
      line: 'Sandbox: place a pretend planet and see',
      icon: 'planet',
      score: 0.92,
      choose: () => openSandbox(),
    },
  ];
}
