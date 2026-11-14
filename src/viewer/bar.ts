/**
 * The bar: previous, Play/Pause, next, the date scale, loop style and speed, then the wavelength
 * scale with its six detector colours and "Same wavelength only" (BAR-1 to BAR-6). Owner: lane D.
 *
 * The wavelength scale drives both the frame's detector and the sky map's channel (BAR-4): it
 * writes `S.lam` and `S.det` and tells the sky with `shown`.
 *
 * PHASE 0 STUB: lettered stops spaced evenly (no month ruling, no visit dots, no counter); the
 * handle can be dragged; nothing dims while loading.
 */
import { S, SPEEDS, watch } from './state.ts';
import { pause, play, setEpoch, step } from './playback.ts';
import { groupsFor } from './load.ts';
import { emit } from '../shell/bus.ts';
import { icon } from '../shell/icons.ts';
import { BAND_EDGES, detectorOf, LAM_MAX, LAM_MIN } from '../core/instrument.ts';

/** Fills the bar. Called once by main.ts. */
export function startBar(): void {
  const bar = document.getElementById('bar');
  if (!bar) return;
  bar.style.cssText =
    'display:flex;align-items:center;gap:var(--bar-gap);height:var(--bar-h);padding:0 18px;width:1080px';
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px">
      <button class="icon-btn" data-step="-1" aria-label="Previous picture" data-tip="Previous (←)" data-tip-pos="above">${icon('prev')}</button>
      <button class="play-btn" data-play data-guide="play" aria-label="Play"></button>
      <button class="icon-btn" data-step="1" aria-label="Next picture" data-tip="Next (→)" data-tip-pos="above">${icon('next')}</button>
    </div>
    <div data-dates data-guide="dates" style="position:relative;flex:1 1 300px;height:44px"></div>
    <div style="display:flex;align-items:center;gap:6px">
      <button class="icon-btn" data-loop aria-label="Loop style" data-tip-pos="above"></button>
      <button class="btn text" data-speed aria-label="Speed"></button>
    </div>
    <div style="align-self:stretch;width:1px;margin:14px 0;background:var(--rule)"></div>
    <div data-guide="wavelength" style="display:grid;gap:6px;width:340px">
      <div style="display:flex;align-items:baseline;gap:8px;font:var(--text-label);color:var(--ink-2)">
        <span class="term" data-tip="The colour of infrared light the pictures were taken in" data-tip-pos="above">Wavelength</span>
        <b data-lam style="font:var(--text-control);color:var(--ink)"></b>
        <span style="flex:1"></span>
        <button class="switch sm" role="switch" data-same aria-label="Same wavelength only"></button>
        <span>Same wavelength only</span>
      </div>
      <div data-strip style="position:relative;height:20px;cursor:pointer;touch-action:none"></div>
      <div data-ticks style="position:relative;height:11px;font:var(--text-scale);color:var(--ink-3)"></div>
    </div>`;

  bar
    .querySelectorAll<HTMLElement>('[data-step]')
    .forEach((b) => b.addEventListener('click', () => step(Number(b.dataset.step))));
  bar.querySelector('[data-play]')?.addEventListener('click', () => (S.playing ? pause() : play()));
  bar.querySelector('[data-loop]')?.addEventListener('click', () => {
    S.loop = S.loop === 'forward' ? 'bounce' : 'forward';
  });
  bar.querySelector('[data-speed]')?.addEventListener('click', () => {
    S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length] ?? 1;
    if (S.playing) play();
  });
  bar.querySelector('[data-same]')?.addEventListener('click', () => (S.sameColour = !S.sameColour));
  watchStrip(bar.querySelector<HTMLElement>('[data-strip]'));
  paintTicks(bar.querySelector<HTMLElement>('[data-ticks]'));
  watch(['playing', 'loop', 'speed', 'sameColour', 'lam', 'groups', 'epoch'], () => paint(bar));
  paint(bar);
}

/** Position of a wavelength on the scale, 0 to 1: each detector gets an equal sixth. */
function where(lam: number): number {
  const e = BAND_EDGES;
  for (let d = 0; d < 6; d++) {
    const lo = e[d] ?? LAM_MIN;
    const hi = e[d + 1] ?? LAM_MAX;
    if (lam <= hi || d === 5) return (d + Math.max(0, Math.min(1, (lam - lo) / (hi - lo)))) / 6;
  }
  return 1;
}

/** The wavelength at a position on the scale (the inverse of `where`). */
function lamAt(t: number): number {
  const x = Math.max(0, Math.min(0.99999, t)) * 6;
  const d = Math.floor(x);
  const lo = BAND_EDGES[d] ?? LAM_MIN;
  const hi = BAND_EDGES[d + 1] ?? LAM_MAX;
  return lo + (x - d) * (hi - lo);
}

function paint(bar: HTMLElement): void {
  const playBtn = bar.querySelector<HTMLElement>('[data-play]');
  if (playBtn) {
    playBtn.innerHTML = icon(S.playing ? 'pause' : 'play');
    playBtn.setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
  }
  const loop = bar.querySelector<HTMLElement>('[data-loop]');
  if (loop) {
    loop.innerHTML = icon(S.loop === 'forward' ? 'forward' : 'bounce');
    loop.dataset.tip = S.loop === 'forward' ? 'Loop: forward' : 'Loop: forward, then back';
  }
  const speed = bar.querySelector<HTMLElement>('[data-speed]');
  if (speed) speed.textContent = `${S.speed}×`;
  const same = bar.querySelector<HTMLElement>('[data-same]');
  same?.setAttribute('aria-checked', String(S.sameColour));
  const lam = bar.querySelector<HTMLElement>('[data-lam]');
  if (lam) lam.textContent = `${S.lam.toFixed(2)} µm`;

  const strip = bar.querySelector<HTMLElement>('[data-strip]');
  if (strip) {
    const bands = [1, 2, 3, 4, 5, 6]
      .map(
        (d) =>
          `<span style="position:absolute;top:7px;height:var(--band-strip);left:calc(${((d - 1) * 100) / 6}% + 1px);width:calc(${100 / 6}% - 2px);border-radius:2px;background:var(--d${d})"></span>`,
      )
      .join('');
    strip.innerHTML = `${bands}<span data-guide="wavelength-handle" style="position:absolute;top:0;left:calc(${where(S.lam) * 100}% - 7px);width:14px;height:20px;border-radius:var(--r-handle);background:var(--mark-ink);box-shadow:var(--shadow-handle)"></span>`;
  }

  const dates = bar.querySelector<HTMLElement>('[data-dates]');
  if (dates) {
    const count = S.groups.length;
    dates.innerHTML =
      `<span style="position:absolute;left:0;right:0;top:26px;height:2px;background:var(--rule)"></span>` +
      S.groups
        .map((g, i) => {
          const left = count > 1 ? 8 + (84 * i) / (count - 1) : 50;
          const on = i === S.epoch;
          return `<button data-epoch="${i}" aria-label="Date ${g.letter}" aria-current="${on}" style="position:absolute;top:16px;left:calc(${left}% - 10px);width:var(--stop);height:var(--stop);border:0;border-radius:var(--r-stop);background:var(--action-soft);color:var(--action);font:var(--text-label);${on ? 'box-shadow:var(--ring-mark)' : ''}">${g.letter}</button>`;
        })
        .join('');
    dates.querySelectorAll<HTMLElement>('[data-epoch]').forEach((b) =>
      b.addEventListener('click', () => {
        pause();
        setEpoch(Number(b.dataset.epoch));
      }),
    );
  }
}

function paintTicks(box: HTMLElement | null): void {
  if (!box) return;
  box.innerHTML = BAND_EDGES.map((lam, i) => {
    const text = i === BAND_EDGES.length - 1 ? `${lam.toFixed(1)} µm` : String(lam);
    const shift = i === 0 ? '0' : i === BAND_EDGES.length - 1 ? '-100%' : '-50%';
    return `<span style="position:absolute;left:${(i * 100) / 6}%;translate:${shift} 0;white-space:nowrap">${text}</span>`;
  }).join('');
}

function watchStrip(strip: HTMLElement | null): void {
  if (!strip) return;
  const set = (e: PointerEvent) => {
    const r = strip.getBoundingClientRect();
    const lam = lamAt((e.clientX - r.left) / r.width);
    const det = detectorOf(lam);
    S.lam = lam;
    if (det !== S.det) {
      S.det = det;
      S.groups = groupsFor(S.field, det);
    }
    const g = S.groups[S.epoch];
    emit('shown', { lam: S.color ? null : lam, mjd: g ? g.mjd : null, det });
  };
  strip.addEventListener('pointerdown', (e) => {
    strip.setPointerCapture(e.pointerId);
    set(e);
  });
  strip.addEventListener('pointermove', (e) => {
    if (strip.hasPointerCapture(e.pointerId)) set(e);
  });
}
