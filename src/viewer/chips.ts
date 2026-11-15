/**
 * The frame's own play row (v2.0, lane DE). Shown where the bar is not:
 *
 * - **Discover** (BEGINNER-AND-MOBILE 5.3, 7; mockups 03 and 04): previous (48 px), Play (56 px),
 *   next (48 px), then one **date chip** per date group: the letter in its pass tint, the month
 *   and year, the current one ringed in Marker Magenta. A date with no exposure in this detector
 *   is a dotted "Missing" chip (H6). Every target is at least 48 px tall.
 * - **Expert on a phone** (11.5): the compact bar: previous, Play, next, a date scale for display
 *   only (the buttons step, so there are no tiny targets), the counter "12 of 72", and the
 *   wavelength as a slider row.
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
  row.innerHTML = `
    <div class="fp-controls" role="group" aria-label="Playback">
      <button type="button" class="icon-btn fp-step" data-fp-step="-1" data-guide="frame-prev" aria-label="Previous picture">${icon('prev')}</button>
      <button type="button" class="play-btn fp-play" data-fp-play data-guide="frame-play" aria-label="Play"></button>
      <button type="button" class="icon-btn fp-step" data-fp-step="1" data-guide="frame-next" aria-label="Next picture">${icon('next')}</button>
      <div class="fp-scale" aria-hidden="true"></div>
      <span class="fp-count" aria-live="off"></span>
    </div>
    <div class="fp-chips" role="group" aria-label="Dates" data-guide="date-chips"></div>
    <label class="fp-wl" data-guide="frame-wavelength">
      <span class="fp-wl-name">Wavelength</span>
      <b class="fp-wl-value"></b>
      <input type="range" min="0" max="1000" step="1" aria-label="Wavelength" />
    </label>`;
  pic.after(row);
  row.querySelectorAll<HTMLElement>('[data-fp-step]').forEach((b) =>
    b.addEventListener('click', () => step(Number(b.dataset.fpStep))),
  );
  row.querySelector('[data-fp-play]')?.addEventListener('click', () => (S.playing ? pause() : play()));
  row.querySelector('.fp-chips')?.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest<HTMLElement>('[data-epoch]');
    if (!b) return;
    pause();
    setEpoch(Number(b.dataset.epoch));
  });
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
    playBtn.setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
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
  const chips = row.querySelector<HTMLElement>('.fp-chips');
  if (chips) {
    chips.hidden = form !== 'discover';
    if (form === 'discover') paintChips(chips);
  }
  const scale = row.querySelector<HTMLElement>('.fp-scale');
  if (scale) {
    scale.hidden = form !== 'phone';
    if (form === 'phone') paintScale(scale);
  }
  const wl = row.querySelector<HTMLElement>('.fp-wl');
  if (wl) {
    wl.hidden = form !== 'phone';
    const v = wl.querySelector('.fp-wl-value');
    if (v) v.textContent = S.color ? 'All six detectors' : `${S.lam.toFixed(2)} µm · D${S.det}`;
    const input = wl.querySelector<HTMLInputElement>('input');
    if (input && document.activeElement !== input) input.value = String(Math.round(where(S.lam) * 1000));
    input?.setAttribute('aria-valuetext', `${S.lam.toFixed(2)} µm, detector ${S.det}`);
  }
}

/** One chip per date group (Discover). Redrawn only when what it shows changes. */
function paintChips(box: HTMLElement): void {
  const groups = S.groups;
  const key = `${groups.map((g) => `${g.key}:${g.frames.length}`).join(',')}|${S.epoch}|${S.det}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  if (!groups.length) {
    box.innerHTML = `<p class="fp-why">${waitWhy() || 'No pictures yet'}</p>`;
    return;
  }
  box.innerHTML = groups
    .map((g, i) => {
      const t = groupDate(S.field, g);
      const month = Number.isFinite(t) ? formatDate(t, 'month') : 'No date';
      const missing = !g.frames.length;
      const on = i === S.epoch;
      const label = `Date ${g.letter}, ${month}${missing ? `: missing, no D${g.det} exposure` : ''}, picture ${i + 1} of ${groups.length}`;
      return `<button type="button" class="fp-chip${missing ? ' missing' : ''}" data-epoch="${i}" aria-pressed="${on}" aria-label="${label}"><span class="fp-letter" style="--tint:var(--p${(g.window % 4) + 1})">${g.letter}</span><span class="fp-month">${missing ? 'Missing' : month}</span></button>`;
    })
    .join('');
  box.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** The phone's date scale: a dot per picture at its date, the one on screen in magenta. Display only. */
function paintScale(box: HTMLElement): void {
  const groups = S.groups;
  const ts = groups.map((g) => groupDate(S.field, g));
  const ok = ts.filter(Number.isFinite);
  const key = `${groups.map((g) => g.key).join(',')}|${S.epoch}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  if (!ok.length) {
    box.innerHTML = '';
    return;
  }
  const lo = Math.min(...ok);
  const hi = Math.max(...ok);
  const x = (t: number) => `${hi > lo ? ((t - lo) / (hi - lo)) * 100 : 50}%`;
  box.innerHTML =
    '<span class="fp-line"></span>' +
    ts
      .map((t, i) =>
        Number.isFinite(t) ? `<span class="fp-dot${i === S.epoch ? ' on' : ''}" style="left:${x(t)}"></span>` : '',
      )
      .join('') +
    `<span class="fp-end first">${formatDate(lo, 'month')}</span><span class="fp-end last">${formatDate(hi, 'month')}</span>`;
}
