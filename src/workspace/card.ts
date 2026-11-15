/**
 * One extra frame's card: the title bar (number, link, type and detector, Compare, the "…" menu,
 * close), the body (a picture, a chart or a table, by type), its own step and play control, and
 * the footer line with source, release, date and wavelength (H2). Owner: integrator (workspace).
 *
 * Pictures come from the main frame's paint code (viewer/paint.ts) and charts from Measure's
 * (viewer/measure/charts.ts), on the frame's own field. Extra frames use the default picture
 * settings: the picture tools act on the main frame only, so nothing here is processed (H8).
 */
import { DEFAULT_PIC } from '../core/picture.ts';
import { formatCoords, formatDate } from '../core/astro.ts';
import { colourMatch } from '../core/real.ts';
import { realCurve } from '../core/fit.ts';
import { channelSpectrum, spotPhotometry, type SpotPoint } from '../core/stats.ts';
import { measure } from '../core/work.ts';
import { TARGETS } from '../core/targets.ts';
import type { Field, Group, Measurement, RealSet, Target } from '../core/types.ts';
import { differenceImage, flipImage, lookFor, picturesReady, stackImage, stackPicture, twoDatesImage } from '../viewer/paint.ts';
import { drawChart, type Pt } from '../viewer/measure/charts.ts';
import { ABSORPTION } from '../viewer/measure/model.ts';
import { token } from '../viewer/tools/dom.ts';
import { S } from '../viewer/state.ts';
import { targetMeasurements, releaseName } from '../viewer/load.ts';
import { icon, type IconName } from '../shell/icons.ts';
import { NO_SERVICE } from './patches.ts';
import { liveWords } from '../viewer/seed.ts';
import { TYPE_WORDS, type FrameType } from './schema.ts';
import { groupLetter, groupOf, isPlaying, mates, numberOf, setAnchor, stepFrame, togglePlay, closeFrame, type Live } from './frames.ts';
import { openCompare, openMenu } from './menu.ts';

export const TYPE_ICONS: { readonly [T in FrameType]: IconName } = {
  blink: 'flip',
  two: 'two',
  diff: 'diff',
  spectrum: 'wave',
  brightness: 'chart',
  stack: 'stack',
  info: 'info',
};

const P = DEFAULT_PIC;
const IMAGE: ReadonlySet<FrameType> = new Set(['blink', 'two', 'diff', 'stack']);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Makes a frame's card and puts it in #frames. */
export function makeCard(f: Live): void {
  const host = document.getElementById('frames') ?? document.body;
  const el = document.createElement('section');
  el.className = 'card panel wf';
  el.dataset.card = `frame-${f.s.id}`;
  el.dataset.frame = f.s.id;
  el.dataset.guide = 'wf-frame';
  el.tabIndex = 0;
  el.innerHTML = `
    <header class="wf-head" data-guide="wf-head">
      <span class="wf-num" aria-hidden="true"></span>
      <button class="wf-link" type="button" hidden data-wf="link"></button>
      <span class="wf-title"></span>
      <span class="wf-acts">
        <button class="icon-btn sm" type="button" data-wf="compare" aria-label="Compare" data-tip="Compare: a copy beside it, one thing different" data-guide="wf-compare">${icon('compare')}</button>
        <button class="icon-btn sm" type="button" data-wf="menu" aria-label="More" aria-haspopup="menu" data-tip="More: type, detector, links…" data-guide="wf-menu">${icon('more')}</button>
        <button class="icon-btn sm" type="button" data-wf="close" aria-label="Close this frame" data-tip="Close this frame" data-guide="wf-close">${icon('close')}</button>
      </span>
    </header>
    <div class="wf-body window">
      <canvas class="wf-canvas" aria-hidden="true"></canvas>
      <div class="wf-table" data-scroll hidden></div>
      <div class="pic-badge window-badge wf-badge" hidden></div>
      <div class="wf-cover" hidden></div>
    </div>
    <div class="wf-ctl">
      <button class="icon-btn sm" type="button" data-wf="prev" aria-label="Previous date" data-tip="Previous date">${icon('prev')}</button>
      <button class="icon-btn sm" type="button" data-wf="play" aria-label="Play" data-tip="Play this frame’s dates" data-guide="wf-play">${icon('play')}</button>
      <button class="icon-btn sm" type="button" data-wf="next" aria-label="Next date" data-tip="Next date" data-guide="wf-next">${icon('next')}</button>
      <span class="wf-date"></span>
      <button class="btn text wf-all" type="button" data-wf="all" hidden></button>
    </div>
    <p class="wf-foot" data-guide="wf-exif"></p>
    <div class="wf-grip" aria-hidden="true" data-wf-grip></div>`;
  el.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-wf]') : null;
    if (!btn) return;
    switch (btn.dataset.wf) {
      case 'close':
        return closeFrame(f);
      case 'menu':
      case 'link':
        return openMenu(f, btn);
      case 'compare':
        return openCompare(f, btn);
      case 'prev':
        return stepFrame(f, -1);
      case 'next':
        return stepFrame(f, 1);
      case 'play':
        return togglePlay(f);
      case 'all':
        f.showAll = !f.showAll;
        return paintFrame(f);
    }
  });
  el.addEventListener('keydown', (e) => onKey(f, e));
  host.append(el);
  f.el = el;
  new ResizeObserver(() => paintFrame(f)).observe(el.querySelector('.wf-body')!);
  headFrame(f);
}

/** Arrow keys nudge the frame's spot by a quarter of its field; Space plays (SPEC-v1 F14). */
function onKey(f: Live, e: KeyboardEvent): void {
  if (e.target !== f.el || e.altKey || e.ctrlKey || e.metaKey) return;
  const step = f.s.fov / 60 / 4;
  const cos = Math.max(0.05, Math.cos((f.s.anchor.dec * Math.PI) / 180));
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [step / cos, 0],
    ArrowRight: [-step / cos, 0],
    ArrowUp: [0, step],
    ArrowDown: [0, -step],
  };
  const m = moves[e.key];
  if (m) {
    e.preventDefault();
    e.stopPropagation();
    setAnchor(f, f.s.anchor.ra + m[0], f.s.anchor.dec + m[1]);
  } else if (e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    togglePlay(f);
  }
}

// ----- Words ----------------------------------------------------------------------------------

function framesOf(field: Field, groups: readonly (Group | null | undefined)[]) {
  return groups.flatMap((g) => (g?.frames ?? []).map((i) => field.frames[i]!).filter(Boolean));
}

function lamText(lams: number[]): string {
  const ok = lams.filter(Number.isFinite);
  if (!ok.length) return '';
  const lo = Math.min(...ok);
  const hi = Math.max(...ok);
  return hi - lo < 0.005 ? `${lo.toFixed(2)} µm` : `${lo.toFixed(2)}–${hi.toFixed(2)} µm`;
}

/** The groups the frame's view shows now. */
function shownGroups(f: Live): Group[] {
  const g = f.groups[f.epoch];
  if (f.s.type === 'stack') return f.groups;
  if (f.s.type === 'two') return [f.groups[0], laterOf(f)].filter((x): x is Group => !!x);
  if (f.s.type === 'spectrum' || f.s.type === 'brightness') return f.showAll ? f.groups : f.groups.slice(0, f.epoch + 1);
  return g ? [g] : [];
}

function laterOf(f: Live): Group | undefined {
  return f.epoch > 0 ? f.groups[f.epoch] : f.groups[f.groups.length - 1];
}

/** The footer: source, release, date and wavelength of what is on screen (H2). */
export function footLine(f: Live): string {
  const st = f.status;
  if (st.source === 'loading') return 'Loading real SPHEREx exposures…';
  if (!st.field) return 'No pictures here: nothing is shown as data';
  const groups = shownGroups(f);
  const frames = framesOf(st.field, groups);
  const releases = [...new Set(frames.map((x) => releaseName(x.release)))].join(' + ');
  const parts = [`Real SPHEREx data${st.source === 'live' || st.set?.origin === 'live' ? `, ${liveWords(st.set?.data.live)}` : ''}${releases ? `, ${releases}` : ''}`];
  const mjds = frames.map((x) => x.mjd).filter(Number.isFinite);
  if (!mjds.length) parts.push(`no D${f.s.det} exposure on this date`);
  else {
    const a = formatDate(Math.min(...mjds), 'day');
    const b = formatDate(Math.max(...mjds), 'day');
    parts.push(a === b ? a : `${a} to ${b}`);
  }
  const lam = lamText(frames.map((x) => x.lam));
  if (f.s.type === 'spectrum') parts.push(`D1–D6`);
  else parts.push(lam ? `D${f.s.det} ${lam}` : `D${f.s.det}`);
  if (st.step) parts.push(st.step);
  return parts.join(' · ');
}

/** The title bar, the link tag, the play button, the date and the footer. */
export function headFrame(f: Live): void {
  const el = f.el;
  if (!el) return;
  const words = TYPE_WORDS[f.s.type];
  const n = numberOf(f);
  el.setAttribute('aria-label', `Frame ${n}: ${words.name}, D${f.s.det}`);
  el.querySelector('.wf-num')!.textContent = n;
  const src = f.status.source === 'real' || f.status.source === 'live' ? 'real' : f.status.source;
  const srcWords = src === 'real' ? 'Real data' : src === 'loading' ? 'Loading' : 'No pictures here';
  el.querySelector('.wf-title')!.innerHTML = `<span class="frame-source ${src}" data-tip="${esc(srcWords)}"><span class="frame-dot"></span></span><b>${esc(words.name)}</b><span class="wf-det">${f.s.type === 'spectrum' ? 'D1–D6' : `D${f.s.det}`}</span><span class="wf-where" data-tip="${esc(formatCoords(f.s.anchor.ra, f.s.anchor.dec))}">${esc(placeName(f))}</span>`;
  const g = groupOf(f);
  const link = el.querySelector<HTMLElement>('.wf-link')!;
  link.hidden = !g;
  el.classList.toggle('linked', !!g);
  if (g) {
    const kinds = [g.time && 'time', g.position && 'position', g.detector && 'detector'].filter(Boolean).join(', ') || 'nothing yet';
    const withWho = mates(f).map((m) => (m === 'main' ? 'the main frame' : `frame ${numberOf(m)}`)).join(', ');
    link.innerHTML = `${icon('chain')}<span>${groupLetter(g)}</span>`;
    link.setAttribute('aria-label', `Linked (${kinds}) with ${withWho}`);
    link.dataset.tip = `Link ${groupLetter(g)}: ${kinds}, with ${withWho}`;
    el.dataset.link = groupLetter(g);
  } else delete el.dataset.link;

  const steps = f.s.type !== 'stack' && f.s.type !== 'info' ? f.groups.length : 0;
  const ctl = el.querySelector<HTMLElement>('.wf-ctl')!;
  for (const b of ctl.querySelectorAll<HTMLButtonElement>('[data-wf="prev"], [data-wf="next"], [data-wf="play"]')) {
    b.disabled = steps < 2;
  }
  const playing = isPlaying(f);
  const play = ctl.querySelector<HTMLElement>('[data-wf="play"]')!;
  play.innerHTML = icon(playing ? 'pause' : 'play');
  play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  const grp = f.groups[f.epoch];
  const date = el.querySelector<HTMLElement>('.wf-date')!;
  if (f.s.type === 'stack') date.textContent = f.groups.length ? `All ${f.groups.length} dates` : '';
  else if (grp && f.s.type !== 'two') {
    date.innerHTML = `${esc(formatDate(grp.mjd, 'month'))}${steps ? ` <span class="wf-count">${f.epoch + 1} / ${steps}</span>` : ''}`;
  } else if (grp) {
    const a = f.groups[0];
    const b = laterOf(f);
    date.textContent = a && b ? `${formatDate(a.mjd, 'month')} and ${formatDate(b.mjd, 'month')}` : '';
  } else date.textContent = '';
  const all = ctl.querySelector<HTMLElement>('[data-wf="all"]')!;
  all.hidden = f.s.type !== 'spectrum' || !f.status.field;
  all.textContent = f.showAll ? 'Build as it plays' : 'Show all at once';
  const foot = el.querySelector<HTMLElement>('.wf-foot')!;
  foot.textContent = footLine(f);
  const n2 = f.status.field ? framesOf(f.status.field, shownGroups(f)).length : 0;
  foot.title = n2 ? `${foot.textContent} · ${n2} exposure${n2 === 1 ? '' : 's'}` : foot.textContent;
}

function placeName(f: Live): string {
  return f.status.target?.name ?? formatCoords(f.s.anchor.ra, f.s.anchor.dec);
}

// ----- Painting -------------------------------------------------------------------------------

const queued = new Set<Live>();
let frameReq = 0;

/** Repaints a frame on the next drawn frame; several calls paint once. */
export function paintFrame(f: Live): void {
  queued.add(f);
  if (frameReq) return;
  frameReq = requestAnimationFrame(() => {
    frameReq = 0;
    const all = [...queued];
    queued.clear();
    for (const x of all) if (x.el) paintNow(x);
  });
}

function paintNow(f: Live): void {
  const el = f.el!;
  const body = el.querySelector<HTMLElement>('.wf-body')!;
  const canvas = body.querySelector<HTMLCanvasElement>('canvas')!;
  const badge = body.querySelector<HTMLElement>('.wf-badge')!;
  const table = body.querySelector<HTMLElement>('.wf-table')!;
  const st = f.status;
  cover(f, body.querySelector<HTMLElement>('.wf-cover')!);
  el.dataset.source = st.source;
  el.dataset.type = f.s.type;
  table.hidden = f.s.type !== 'info' || !st.field;
  canvas.hidden = !table.hidden;
  badge.hidden = true;
  if (!st.field || !st.set) {
    clearCanvas(canvas, body);
    return;
  }
  if (f.s.type === 'info') return void (table.innerHTML = infoTable(f, st.field, st.set));
  if (f.s.type === 'spectrum' || f.s.type === 'brightness') return chart(f, canvas, body);
  if (IMAGE.has(f.s.type)) picture(f, canvas, body, badge);
}

function clearCanvas(canvas: HTMLCanvasElement, body: HTMLElement): void {
  const ctx = sizeTo(canvas, body, true);
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/** Sizes the canvas: square for a picture (the largest that fits), the whole body for a chart. */
function sizeTo(canvas: HTMLCanvasElement, body: HTMLElement, square: boolean): CanvasRenderingContext2D | null {
  const w = body.clientWidth;
  const h = body.clientHeight;
  if (!w || !h) return null;
  const side = Math.min(w, h);
  canvas.style.width = `${square ? side : w}px`;
  canvas.style.height = `${square ? side : h}px`;
  const dpr = devicePixelRatio || 1;
  const pw = Math.round((square ? side : w) * dpr);
  const ph = Math.round((square ? side : h) * dpr);
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function cover(f: Live, el: HTMLElement): void {
  const st = f.status;
  if (st.source === 'loading') {
    const pct = st.total ? Math.round((100 * (st.done ?? 0)) / st.total) : null;
    el.className = 'wf-cover loading';
    el.innerHTML = `<p>${esc(st.what)}</p>${pct === null ? '<span class="wf-bar moving"><span></span></span>' : `<span class="wf-bar"><span style="width:${pct}%"></span></span>`}<p class="wf-meanwhile">${st.what.startsWith('Loading') ? '' : 'This can take a few minutes. The sky and the other frames work meanwhile.'}</p>`;
    el.hidden = false;
  } else if (!st.field) {
    el.className = 'wf-cover none';
    const targets = st.why === NO_SERVICE ? `<p class="wf-meanwhile">Drop a frame on ${TARGETS.map((t) => esc(t.name)).join(', ')}.</p>` : '';
    el.innerHTML = `<p><b>No real pictures here.</b> ${esc(st.why ?? '')}</p>${targets}`;
    el.hidden = false;
  } else el.hidden = true;
}

// Pictures --------------------------------------------------------------------------------------

let scratch: OffscreenCanvas | null = null;

function picture(f: Live, canvas: HTMLCanvasElement, body: HTMLElement, badge: HTMLElement): void {
  const field = f.status.field!;
  const groups = f.groups;
  const g = groups[f.epoch];
  if (!g) {
    clearCanvas(canvas, body);
    return;
  }
  const later = laterOf(f);
  const needed = f.s.type === 'two' ? [groups[0], later] : f.s.type === 'stack' ? groups : f.s.type === 'diff' ? groups : [groups[0], g];
  // The pictures are made in the worker first; the one on screen stays until then (TLS-8).
  if (!picturesReady(field, needed, P, () => paintFrame(f))) return;
  const look = lookFor(field, groups, 0, P, f.s.det);
  let img: ImageData | null = null;
  const lines: string[] = [];
  let title = '';
  let warn = '';
  if (f.s.type === 'blink') {
    img = flipImage(field, g, look, P);
    title = formatDate(g.mjd, 'month');
    const frames = framesOf(field, [g]);
    const ref = groups[0] ? framesOf(field, [groups[0]])[0] : undefined;
    const x = frames[0];
    if (!x) warn = `No D${f.s.det} exposure on this date: nothing is filled in`;
    else if (ref && g === groups[0]) lines.push(`The reference date (${ref.lam.toFixed(2)} µm)`);
    else if (ref) {
      lines.push(colourMatch(x, ref) ? `Same colour as the reference (${ref.lam.toFixed(2)} µm)` : `Different colour: ${x.lam.toFixed(2)} vs ${ref.lam.toFixed(2)} µm`);
    }
    if (f.missing.length) lines.push(`Skipped, no same-colour exposure: ${f.missing.join(', ')}`);
  } else if (f.s.type === 'two') {
    const a = groups[0];
    if (a && later) img = twoDatesImage(field, a, later, look, P);
    title = 'Two dates in one picture';
    lines.push(`Red: ${a ? formatDate(a.mjd, 'month') : '–'} · Cyan: ${later ? formatDate(later.mjd, 'month') : '–'}`);
  } else if (f.s.type === 'diff') {
    img = differenceImage(field, groups, f.epoch, look, P);
    title = formatDate(g.mjd, 'month');
    lines.push('This date minus the typical sky');
  } else {
    const t = f.status.target;
    const track = t && f.status.set ? f.status.set.data.catalogue : null;
    const st = stackPicture(field, groups, f.s.det, track, P, () => paintFrame(f));
    if (!st) {
      title = 'Stacking every exposure…';
    } else {
      img = stackImage(field, st, look, P);
      title = `Stack of ${st.frames} exposure${st.frames === 1 ? '' : 's'}`;
      lines.push(st.label);
      if (st.result) {
        const [c1, c2] = st.result.controls;
        lines.push(`Checks beside it: ${c1.label.toLowerCase()}, ${c2.label.toLowerCase()}`);
      }
    }
  }
  const ctx = sizeTo(canvas, body, true);
  if (!ctx) return;
  const size = parseFloat(canvas.style.width) || 1;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const n = field.n;
  const across = Math.max(n, (f.s.fov * 60) / field.scale);
  const k = size / across;
  const o = (size - n * k) / 2;
  if (img) {
    if (!scratch || scratch.width !== img.width || scratch.height !== img.height) scratch = new OffscreenCanvas(img.width, img.height);
    scratch.getContext('2d')?.putImageData(img, 0, 0);
    ctx.drawImage(scratch, o, o, n * k, n * k);
  }
  if (o > 0.5) {
    // The exposures stop here: outline what they cover, leave the rest empty (H6).
    ctx.strokeStyle = token('--st-ink-3');
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(o + 0.5, o + 0.5, n * k - 1, n * k - 1);
    ctx.setLineDash([]);
  }
  if (f.s.type === 'blink' && !f.missing.length) {
    // The pass tint inside the edge while the dates flip (DESIGN "Data windows").
    ctx.strokeStyle = token(`--p${(g.window % 4) + 1}`);
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  }
  badge.innerHTML = `${warn ? `<span class="pic-warn">${esc(warn)}</span>` : ''}<span class="pic-title"><b>${esc(title)}</b></span>${lines.map((l) => `<span>${esc(l)}</span>`).join('')}`;
  badge.hidden = false;
  if (f.s.type === 'blink' || f.s.type === 'diff') warmNext(f);
}

/** Prepares the next pictures while the page is idle, so a step is a cache hit (under 50 ms). */
function warmNext(f: Live): void {
  const field = f.status.field;
  if (!field || f.groups.length < 2) return;
  const next = f.groups[(f.epoch + 1) % f.groups.length];
  idle(() => {
    if (f.status.field !== field || !next) return;
    if (!picturesReady(field, [next], P, () => warmNext(f))) return;
    const look = lookFor(field, f.groups, 0, P, f.s.det);
    if (f.s.type === 'diff') differenceImage(field, f.groups, (f.epoch + 1) % f.groups.length, look, P);
    else flipImage(field, next, look, P);
  });
}

const idle = (fn: () => void): void => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 300 });
  else setTimeout(fn, 30);
};

// Charts ----------------------------------------------------------------------------------------

const measured = new WeakMap<RealSet, Promise<Measurement[]>>();
const spots = new WeakMap<RealSet, Map<string, SpotPoint[] | null>>();

/** The patch's target on every exposure (lane B's worker), shared with Measure when it can be. */
function targetMs(set: RealSet, target: Target): Promise<Measurement[]> {
  if (S.set === set && S.field?.target?.key === target.key) {
    const shared = targetMeasurements();
    if (shared) return shared;
  }
  let p = measured.get(set);
  if (!p) {
    p = measure(set, target);
    measured.set(set, p);
  }
  return p;
}

/** A fixed spot's light on every exposure; null until it has been measured (next task). */
function spotPoints(f: Live, set: RealSet): SpotPoint[] | null {
  let m = spots.get(set);
  if (!m) spots.set(set, (m = new Map()));
  const key = `${f.s.anchor.ra.toFixed(5)},${f.s.anchor.dec.toFixed(5)}`;
  if (m.has(key)) return m.get(key) ?? null;
  m.set(key, null);
  setTimeout(() => {
    m.set(key, spotPhotometry(set, f.s.anchor.ra, f.s.anchor.dec));
    paintFrame(f);
  }, 0);
  return null;
}

const msCache = new WeakMap<Promise<Measurement[]>, Measurement[]>();

function chart(f: Live, canvas: HTMLCanvasElement, body: HTMLElement): void {
  const set = f.status.set!;
  const target = f.status.target;
  canvas.style.width = `${body.clientWidth}px`;
  canvas.style.height = `${body.clientHeight}px`;
  let ms: Measurement[] | null = null;
  let spot: SpotPoint[] | null = null;
  if (target) {
    const p = targetMs(set, target);
    ms = msCache.get(p) ?? null;
    if (!ms) {
      void p.then((v) => {
        msCache.set(p, v);
        paintFrame(f);
      }, () => undefined);
    }
  } else spot = spotPoints(f, set);
  const g = f.groups[f.epoch];
  const upTo = f.showAll || !g ? Infinity : (g.mjd1 ?? g.mjd) + 1e-6;
  const what = target ? target.name : 'the spot at the frame’s centre';
  const waiting = target ? !ms : !spot;
  // H5: say why nothing was measured.
  const why = spot?.length && spot.every((p) => p.flagged)
    ? 'Not measured: the frame’s centre is flagged in every exposure (a saturated star’s core, or bad pixels)'
    : spot && !spot.length
      ? 'Not measured: no exposure covers the frame’s centre'
      : null;
  if (f.s.type === 'spectrum') {
    const pts: Pt[] = [];
    if (ms) {
      const clean = ms.filter((m) => m.seen && !m.lower && !m.saturated && !m.skipped && Number.isFinite(m.flux) && m.mjd <= upTo);
      for (const c of channelSpectrum(clean.map((m) => ({ lam: m.lam, det: m.det, flux: m.flux, err: m.fluxErr })))) {
        pts.push({ x: c.lam, y: c.flux, err: c.err, colour: token(`--d${c.det}`), hollow: c.weak });
      }
      // Saturated or flagged: lower limits, never plain points (SPEC-v1 F5, AC 2).
      for (const m of ms) {
        if (m.mjd > upTo || m.skipped || !(m.lower || m.saturated) || !Number.isFinite(m.flux)) continue;
        pts.push({ x: m.lam, y: m.flux, colour: token(`--d${m.det}`), lower: true, hollow: true });
      }
    } else if (spot) {
      const clean = spot.filter((p) => !p.flagged && Number.isFinite(p.flux) && p.mjd <= upTo);
      for (const c of channelSpectrum(clean.map((p) => ({ lam: p.lam, det: p.det, flux: p.flux, err: p.err })))) {
        pts.push({ x: c.lam, y: c.flux, err: c.err, colour: token(`--d${c.det}`), hollow: c.weak });
      }
    }
    drawChart(canvas, {
      points: pts,
      // The water and methane bands are named only where there is room for their names.
      bands: canvas.clientWidth >= 380 ? ABSORPTION : [],
      yLabel: 'µJy',
      xKind: 'lam',
      xRange: [0.7, 5.05],
      empty: waiting ? `Measuring ${what}…` : (why ?? `Not measured: no exposure has a clean measurement of ${what} yet`),
    });
  } else {
    const pts: Pt[] = [];
    if (ms && target) {
      for (const c of realCurve(ms, target)) {
        if (!c.shown) continue;
        for (const p of c.points) if (p.mjd <= upTo) pts.push({ x: p.mjd, y: p.dmag, err: p.err, colour: token(`--d${c.det}`), hollow: p.glow });
      }
    } else if (spot) {
      for (let det = 1; det <= 6; det++) {
        const mine = spot.filter((p) => p.det === det && !p.flagged && p.flux > 0 && p.err > 0);
        if (mine.length < 2) continue;
        const w = mine.map((p) => 1 / p.err ** 2);
        const mean = mine.reduce((a, p, i) => a + p.flux * w[i]!, 0) / w.reduce((a, b) => a + b, 0);
        for (const p of mine) {
          if (p.mjd <= upTo) pts.push({ x: p.mjd, y: -2.5 * Math.log10(p.flux / mean), err: (1.0857 * p.err) / p.flux, colour: token(`--d${det}`) });
        }
      }
    }
    drawChart(canvas, {
      points: pts,
      yLabel: 'Change, mag',
      xKind: 'date',
      invertY: true,
      empty: waiting ? `Measuring ${what}…` : (why ?? `Not measured: no detector has a clean brightness curve of ${what}`),
    });
  }
}

// Info ------------------------------------------------------------------------------------------

function infoTable(f: Live, field: Field, set: RealSet): string {
  const g = f.groups[f.epoch];
  const rows = framesOf(field, g ? [g] : []).map((x) => {
    const meta = x.src !== null ? set.frames[x.src]?.meta : undefined;
    const flagged = meta ? `${Math.round(meta.badFrac * 100)}%` : '–';
    const file = meta?.url ? `<a href="${esc(meta.url)}" target="_blank" rel="noopener" data-tip="The full file at NASA IRSA">file</a>` : '';
    return `<tr><td class="wf-id" title="${esc(x.id)}">${esc(x.id)}</td><td>${esc(formatDate(x.mjd, 'day'))}</td><td>D${x.det} ${x.lam.toFixed(2)} µm</td><td>${esc(releaseName(x.release))}</td><td>${flagged}</td><td>${file}</td></tr>`;
  });
  const t = f.status.target;
  const cat = t ? `<p class="wf-cat"><b>${esc(t.name)}</b>: catalogue position and motion from ${esc(t.values)}.</p>` : '';
  const head = g ? `<p class="wf-cat">${esc(formatDate(g.mjd, 'month'))}: ${rows.length} exposure${rows.length === 1 ? '' : 's'} in D${f.s.det}. Flagged is the share of pixels NASA’s pipeline marks as bad.</p>` : '';
  return `${head}<table class="wf-info"><thead><tr><th>Exposure</th><th>Date</th><th>Detector</th><th>Release</th><th>Flagged</th><th></th></tr></thead><tbody>${rows.join('') || `<tr><td colspan="6">No D${f.s.det} exposure on this date</td></tr>`}</tbody></table>${cat}`;
}
