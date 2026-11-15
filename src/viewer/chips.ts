/**
 * The frame's own play row (v2.0, lane DE). Shown where the bar is not:
 *
 * - **Discover** (BEGINNER-AND-MOBILE 5.3, 7; mockups 03 and 04): previous (48 px), Play (56 px),
 *   next (48 px), then the **date strip**.
 * - **Expert on a phone** (11.5): the compact bar: previous, Play, next, the date strip, the
 *   counter "12 of 72", and the wavelength as a slider row.
 *
 * The date strip (redesign, "Date chips"): a thin line with one dot per picture, placed by date,
 * the one on screen ringed in Marker Magenta and its date written above it; the others say theirs
 * on hover. A tap or a drag picks the nearest date, the arrow keys step (it is a slider). A date
 * with no exposure in this detector is a hollow dot and says "no D3 picture" (H6). The strip is
 * thin to look at and 48 px tall to touch.
 *
 * On a desktop in Expert the bar (bar.ts) does all this, and the row is hidden.
 */
import { S, watch } from './state.ts';
import { pause, play, setEpoch, step } from './playback.ts';
import { groupDate } from './render.ts';
import { waitWhy, where, lamAt } from './bar.ts';
import { showDetector } from './load.ts';
import { icon } from '../shell/icons.ts';
import { layout, onLayout } from '../shell/sheet.ts';
import { formatDate } from '../core/astro.ts';
import { detectorOf, LAM_MAX, LAM_MIN } from '../core/instrument.ts';
import { t } from '../shell/i18n.ts';

/** Which form the row takes now. */
export type PlayRow = 'discover' | 'phone' | 'off';

/** The row's form for a view and a layout. Pure. */
export function playRowFor(view: string | undefined, kind: string): PlayRow {
  if (view === 'discover') return 'discover';
  if (kind !== 'desktop') return 'phone';
  return 'off';
}

let row: HTMLElement | null = null;

/** Makes the row (under the picture) and keeps it current. Called once by main.ts. */
export function startChips(): void {
  const frame = document.getElementById('frame');
  const pic = document.getElementById('frame-pic');
  if (!frame || !pic) return;
  row = document.createElement('div');
  row.id = 'frame-play';
  row.className = 'fp';
  row.dataset.i18n = '';
  row.innerHTML = `
    <div class="fp-controls" role="group" aria-label="${t('bar.playback')}">
      <button type="button" class="icon-btn fp-step" data-fp-step="-1" data-guide="frame-prev" aria-label="${t('bar.prevLabel')}">${icon('prev')}</button>
      <button type="button" class="play-btn fp-play" data-fp-play data-guide="frame-play" aria-label="${t('word.play')}"></button>
      <button type="button" class="icon-btn fp-step" data-fp-step="1" data-guide="frame-next" aria-label="${t('bar.nextLabel')}">${icon('next')}</button>
      <div class="fp-seq" role="slider" tabindex="0" aria-label="${t('fp.date')}" aria-valuemin="1" data-guide="date-strip"></div>
      <span class="fp-count" aria-live="off"></span>
    </div>
    <label class="fp-wl" data-guide="frame-wavelength">
      <span class="fp-wl-name">${t('bar.wavelength')}</span>
      <b class="fp-wl-value"></b>
      <input type="range" min="0" max="1000" step="1" aria-label="${t('bar.wavelength')}" />
    </label>`;
  pic.after(row);
  row.querySelectorAll<HTMLElement>('[data-fp-step]').forEach((b) =>
    b.addEventListener('click', () => step(Number(b.dataset.fpStep))),
  );
  row.querySelector('[data-fp-play]')?.addEventListener('click', () => (S.playing ? pause() : play()));
  const seq = row.querySelector<HTMLElement>('.fp-seq');
  if (seq) startSeq(seq);
  const range = row.querySelector<HTMLInputElement>('.fp-wl input');
  range?.addEventListener('input', () => {
    const lam = Math.max(LAM_MIN, Math.min(LAM_MAX, lamAt(Number(range.value) / 1000)));
    S.color = false;
    showDetector(detectorOf(lam), lam);
  });
  watch(['groups', 'epoch', 'playing', 'field', 'det', 'lam', 'color', 'mode', 'level', 'source', 'ref'], paint);
  onLayout(paint);
  // The view is an attribute on <html> (shell/view.ts); the row follows it.
  new MutationObserver(paint).observe(document.documentElement, { attributeFilter: ['data-view', 'data-layout'] });
  paint();
}

function paint(): void {
  if (!row) return;
  const form = playRowFor(document.documentElement.dataset.view, layout().kind);
  row.hidden = form === 'off';
  row.dataset.form = form;
  if (form === 'off') return;
  const many = S.groups.length > 1;
  const playBtn = row.querySelector<HTMLButtonElement>('[data-fp-play]');
  if (playBtn) {
    const html = icon(S.playing ? 'pause' : 'play');
    if (playBtn.dataset.icon !== (S.playing ? 'pause' : 'play')) {
      playBtn.innerHTML = html;
      playBtn.dataset.icon = S.playing ? 'pause' : 'play';
    }
    playBtn.setAttribute('aria-label', S.playing ? t('word.pause') : t('word.play'));
    playBtn.disabled = !many;
    playBtn.title = many ? '' : waitWhy();
  }
  row.querySelectorAll<HTMLButtonElement>('[data-fp-step]').forEach((b) => (b.disabled = !many));
  const count = row.querySelector<HTMLElement>('.fp-count');
  if (count) {
    count.hidden = form !== 'phone';
    count.textContent = S.groups.length ? `${S.epoch + 1} of ${S.groups.length}` : '';
    count.style.minWidth = `calc(${String(S.groups.length || 1).length * 2}ch + 1.6em)`;
  }
  const seq = row.querySelector<HTMLElement>('.fp-seq');
  if (seq) paintSeq(seq);
  const wl = row.querySelector<HTMLElement>('.fp-wl');
  if (wl) {
    wl.hidden = form !== 'phone';
    const v = wl.querySelector('.fp-wl-value');
    if (v) v.textContent = S.color ? t('fp.allSix') : `${S.lam.toFixed(2)} µm · D${S.det}`;
    const input = wl.querySelector<HTMLInputElement>('input');
    if (input && document.activeElement !== input) input.value = String(Math.round(where(S.lam) * 1000));
    input?.setAttribute('aria-valuetext', `${S.lam.toFixed(2)} µm, detector ${S.det}`);
  }
}

/** The dates of the groups, MJD (NaN when a group has none), and where each sits on the strip, 0 to 1. */
function places(): { ts: number[]; at: number[] } {
  const ts = S.groups.map((g) => groupDate(S.field, g));
  const ok = ts.filter(Number.isFinite);
  const lo = Math.min(...ok);
  const hi = Math.max(...ok);
  // Undated groups keep their order between their neighbours (evenly spaced as a fallback).
  const at = ts.map((t, i) =>
    Number.isFinite(t) && hi > lo ? (t - lo) / (hi - lo) : ts.length > 1 ? i / (ts.length - 1) : 0.5,
  );
  return { ts, at };
}

/** Picks the date nearest a point on the strip, and the keys of a slider. */
function startSeq(box: HTMLElement): void {
  let dragging = false;
  const pick = (x: number) => {
    const r = box.getBoundingClientRect();
    const inner = r.width - 24; // 12 px inset each side, as the dots
    if (!S.groups.length || inner <= 0) return;
    const f = (x - r.left - 12) / inner;
    const { at } = places();
    let best = 0;
    at.forEach((a, i) => {
      if (Math.abs(a - f) < Math.abs((at[best] ?? 0) - f)) best = i;
    });
    if (best !== S.epoch) setEpoch(best);
  };
  box.addEventListener('pointerdown', (e) => {
    if (S.groups.length < 2) return;
    dragging = true;
    box.setPointerCapture(e.pointerId);
    pause();
    pick(e.clientX);
  });
  box.addEventListener('pointermove', (e) => {
    if (dragging) pick(e.clientX);
  });
  const end = () => (dragging = false);
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('keydown', (e) => {
    const n = S.groups.length;
    if (n < 2) return;
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? S.epoch + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? S.epoch - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    pause();
    setEpoch(Math.max(0, Math.min(n - 1, to)));
  });
}

/** Paints the strip. The dots are redrawn only when the dates change; the ring and the date slide. */
function paintSeq(box: HTMLElement): void {
  const groups = S.groups;
  if (!groups.length) {
    if (box.dataset.key !== 'none') {
      box.dataset.key = 'none';
      box.innerHTML = `<p class="fp-why">${waitWhy() || t('fp.noneYet')}</p>`;
    }
    box.removeAttribute('aria-valuenow');
    return;
  }
  const { ts, at } = places();
  const day = (i: number) => (Number.isFinite(ts[i]) ? formatDate(ts[i]!, 'day') : t('fp.noDate'));
  const key = `${groups.map((g) => `${g.key}:${g.frames.length}`).join(',')}|${S.det}`;
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    box.innerHTML =
      '<span class="fp-line"></span>' +
      groups
        .map((g, i) => {
          const missing = !g.frames.length;
          return `<span class="fp-dot${missing ? ' missing' : ''}" style="--x:${at[i]}" data-tip="${day(i)}${missing ? t('fp.missing', { det: `D${g.det}` }) : ''}"></span>`;
        })
        .join('') +
      '<span class="fp-head" aria-hidden="true"><span class="fp-ring"></span></span><span class="fp-now" aria-hidden="true"><span></span></span>';
  }
  const i = Math.min(S.epoch, groups.length - 1);
  const g = groups[i];
  const missing = !!g && !g.frames.length;
  const x = String(at[i] ?? 0);
  box.style.setProperty('--now', x);
  box.querySelectorAll<HTMLElement>('.fp-dot').forEach((d, k) => d.classList.toggle('on', k === i));
  const now = box.querySelector<HTMLElement>('.fp-now > span');
  const words = `${day(i)}${missing && g ? ` · no D${g.det} picture` : ''}`;
  if (now && now.textContent !== words) now.textContent = words;
  box.classList.toggle('missing', missing);
  box.setAttribute('aria-valuemax', String(groups.length));
  box.setAttribute('aria-valuenow', String(i + 1));
  box.setAttribute('aria-valuetext', `${words}, picture ${i + 1} of ${groups.length}`);
}
