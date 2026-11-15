/**
 * The bar: previous, Play/Pause, next, the date scale, loop style and speed, then the wavelength
 * scale with its six detector colours and "Same wavelength only" (BAR-1 to BAR-6). Owner: lane D.
 *
 * The wavelength scale drives both the frame's detector and the sky map's channel (BAR-4): it
 * writes `S.lam` and `S.det` and tells the sky with `shown`.
 *
 * Keys (BAR-1): Space plays or pauses, the left and right arrows step, anywhere on the page, but
 * not while typing, not in a dialog, not on a button (Space) and not on a slider (arrows). A key
 * handled here is marked with preventDefault, so the shell's own key handler leaves it alone.
 */
import { S, SPEEDS, watch } from './state.ts';
import { pause, play, retime, step } from './playback.ts';
import { missingPasses, showDetector } from './load.ts';
import { paintDates, watchDates } from './scrub.ts';
import { icon } from '../shell/icons.ts';
import { BAND_EDGES, detectorOf, LAM_MAX, LAM_MIN } from '../core/instrument.ts';
import { colourMatch } from '../core/real.ts';
import { t } from '../shell/i18n.ts';

/** Plain names for parts of the wavelength range, shown beside the value (hidden below 1420px). */
function plainName(lam: number): string {
  if (lam < 1.1) return t('bar.lamRed');
  if (lam < 1.6) return t('bar.lamNear');
  if (lam < 2.4) return t('bar.lamDeeper');
  if (lam < 3.8) return t('bar.lamLonger');
  return t('bar.lamHeat');
}

/** Fills the bar. Called once by main.ts. */
export function startBar(): void {
  const bar = document.getElementById('bar');
  if (!bar) return;
  // Regular glass (lane F's material class in app.css gives the blur; frame.css the tint).
  bar.classList.add('sima-bar', 'glass');
  bar.dataset.i18n = '';
  bar.innerHTML = `
    <div class="bar-play" role="group" aria-label="${t('bar.playback')}">
      <button class="icon-btn" data-step="-1" data-guide="prev" aria-label="${t('bar.prevLabel')}" data-tip="${t('bar.prev')}" data-tip-pos="above">${icon('prev')}</button>
      <button class="play-btn" data-play data-guide="play" aria-label="${t('word.play')}" data-tip="${t('bar.playTip')}" data-tip-pos="above"></button>
      <button class="icon-btn" data-step="1" data-guide="next" aria-label="${t('bar.nextLabel')}" data-tip="${t('bar.next')}" data-tip-pos="above">${icon('next')}</button>
    </div>
    <div class="bar-dates" data-dates data-guide="dates" aria-label="${t('bar.dates')}"></div>
    <span class="bar-count term" data-count tabindex="0" data-tip="${t('bar.countTip')}" data-tip-pos="above"></span>
    <div class="bar-loop">
      <button class="icon-btn" data-loop aria-label="${t('bar.loopStyle')}" data-tip-pos="above"></button>
      <button class="btn text bar-speed" data-speed data-tip="${t('bar.speed')}" data-tip-pos="above"></button>
    </div>
    <span class="bar-rule" aria-hidden="true"></span>
    <div class="wl" data-guide="wavelength">
      <div class="wl-head">
        <span class="term" tabindex="0" data-tip="${t('bar.wavelengthTip')}" data-tip-pos="above">${t('bar.wavelength')}</span>
        <b class="wl-value" data-lam></b>
        <span class="wl-name" data-name></span>
        <span class="wl-gap"></span>
        <button class="btn text wl-same" data-same role="switch" aria-checked="false" data-tip="${t('bar.sameTip')}" data-tip-pos="above"><span class="switch sm" aria-hidden="true"></span>${t('bar.same')}</button>
      </div>
      <div class="wl-strip" data-strip>
        ${[1, 2, 3, 4, 5, 6].map((d) => `<span class="wl-band" style="--hue:var(--d${d});--i:${d - 1}"></span>`).join('')}
        ${BAND_EDGES.map((_, i) => `<span class="wl-tick" style="left:${(i * 100) / 6}%"></span>`).join('')}
        <span class="wl-handle" data-guide="wavelength-handle" role="slider" tabindex="0" aria-label="${t('bar.wavelength')}" aria-valuemin="${LAM_MIN}" aria-valuemax="${LAM_MAX}"></span>
      </div>
      <div class="wl-ticks">${BAND_EDGES.map((lam, i) => {
        const text = i === BAND_EDGES.length - 1 ? `${lam.toFixed(1)} µm` : String(lam);
        return `<span class="${i === 0 ? 'first' : i === BAND_EDGES.length - 1 ? 'last' : ''}" style="left:${(i * 100) / 6}%">${text}</span>`;
      }).join('')}</div>
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
    retime();
  });
  bar.querySelector('[data-same]')?.addEventListener('click', () => {
    if (!S.sameColour) {
      // The reference is the wavelength of the picture on screen, so something always matches.
      const g = S.groups[S.epoch];
      const f = g && S.field ? S.field.frames[g.frames[0] ?? -1] : undefined;
      if (f && Number.isFinite(f.lam)) S.lam = f.lam;
    }
    S.sameColour = !S.sameColour;
  });
  const dates = bar.querySelector<HTMLElement>('[data-dates]');
  if (dates) watchDates(dates);
  watchStrip(bar.querySelector<HTMLElement>('[data-strip]'));
  document.addEventListener('keydown', onKey);
  watch(
    [
      'playing',
      'loop',
      'speed',
      'sameColour',
      'lam',
      'det',
      'color',
      'groups',
      'epoch',
      'ref',
      'mode',
      'level',
      'field',
      'source',
    ],
    () => paint(bar),
  );
  addEventListener('resize', () => paint(bar));
  paint(bar);
}

/** Position of a wavelength on the scale, 0 to 1: each detector gets an equal sixth. */
export function where(lam: number): number {
  const e = BAND_EDGES;
  for (let d = 0; d < 6; d++) {
    const lo = e[d] ?? LAM_MIN;
    const hi = e[d + 1] ?? LAM_MAX;
    if (lam <= hi || d === 5) return (d + Math.max(0, Math.min(1, (lam - lo) / (hi - lo)))) / 6;
  }
  return 1;
}

/** The wavelength at a position on the scale (the inverse of `where`). */
export function lamAt(t: number): number {
  const x = Math.max(0, Math.min(0.99999, t)) * 6;
  const d = Math.floor(x);
  const lo = BAND_EDGES[d] ?? LAM_MIN;
  const hi = BAND_EDGES[d + 1] ?? LAM_MAX;
  return lo + (x - d) * (hi - lo);
}

function paint(bar: HTMLElement): void {
  const ready = !!S.field && S.groups.length > 0;
  const many = S.groups.length > 1;
  const measure = S.level === 'measure';
  bar.classList.toggle('measure', measure);
  bar.classList.toggle('waiting', !ready);

  const playBtn = bar.querySelector<HTMLButtonElement>('[data-play]');
  if (playBtn) {
    playBtn.innerHTML = icon(S.playing ? 'pause' : 'play');
    playBtn.setAttribute('aria-label', S.playing ? t('word.pause') : t('word.play'));
    playBtn.dataset.tip = many ? (S.playing ? t('bar.pauseTip') : t('bar.playTip')) : waitWhy();
    playBtn.disabled = !many;
  }
  // BAR-6: what needs pictures is dimmed and cannot be pressed while there are none.
  bar.querySelectorAll<HTMLButtonElement>('[data-step], [data-loop], [data-speed]').forEach((b) => {
    b.disabled = !many;
  });
  const loop = bar.querySelector<HTMLElement>('[data-loop]');
  if (loop) {
    loop.innerHTML = icon(S.loop === 'forward' ? 'forward' : 'bounce');
    loop.dataset.tip = S.loop === 'forward' ? t('bar.loopForward') : t('bar.loopBounce');
    loop.setAttribute('aria-label', loop.dataset.tip);
  }
  const speed = bar.querySelector<HTMLElement>('[data-speed]');
  if (speed) {
    speed.textContent = `${S.speed}×`;
    speed.setAttribute('aria-label', `${t('bar.speed')} ${S.speed}×`);
  }
  const count = bar.querySelector<HTMLElement>('[data-count]');
  if (count) {
    count.hidden = !measure;
    count.textContent = ready ? `${S.epoch + 1} / ${S.groups.length}` : '– / –';
    // As wide as its widest number ("12 / 12"), so the bar does not change width while it plays.
    count.style.minWidth = `calc(${String(S.groups.length || 1).length * 2}ch + 1.1em)`;
  }

  const same = bar.querySelector<HTMLButtonElement>('[data-same]');
  if (same) {
    // BAR-5: shown only where it applies: real exposures whose wavelengths differ in a detector.
    const frames =
      S.field && !S.field.simulated ? S.field.frames.filter((f) => f.det === S.det) : [];
    const first = frames[0];
    const applies = !S.color && !!first && frames.some((f) => !colourMatch(f, first));
    same.hidden = !applies && !S.sameColour;
    same.setAttribute('aria-checked', String(S.sameColour));
    same.querySelector('.switch')?.setAttribute('aria-checked', String(S.sameColour));
    same.dataset.tip = missingPasses.length
      ? t('bar.sameMissing', { passes: missingPasses.join(', ') })
      : t('bar.sameTip');
  }
  const lam = bar.querySelector<HTMLElement>('[data-lam]');
  if (lam) lam.textContent = S.color ? t('bar.allSix') : `${S.lam.toFixed(2)} µm`;
  const name = bar.querySelector<HTMLElement>('[data-name]');
  if (name) name.textContent = S.color ? t('bar.color') : plainName(S.lam);
  const handle = bar.querySelector<HTMLElement>('.wl-handle');
  if (handle) {
    handle.style.left = `${where(S.lam) * 100}%`;
    handle.setAttribute('aria-valuenow', S.lam.toFixed(2));
    handle.setAttribute('aria-valuetext', t('bar.handleText', { lam: `${S.lam.toFixed(2)} µm`, det: S.det }));
  }
  bar
    .querySelectorAll<HTMLElement>('.wl-band')
    .forEach((b, i) => b.classList.toggle('on', i + 1 === S.det));

  const dates = bar.querySelector<HTMLElement>('[data-dates]');
  if (dates) paintDates(dates, ready ? '' : waitWhy());
}

/** BAR-6: why the bar cannot play now, in a few words (shown on the date scale and as the tip). */
export function waitWhy(): string {
  if (S.source === 'loading') {
    return S.load?.step === 'shipped'
      ? t('bar.waitLoad')
      : t('bar.waitArchive');
  }
  if (!S.field || !S.groups.length) {
    return S.source === 'none' ? t('bar.noPictures') : t('bar.noDetPictures', { det: `D${S.det}` });
  }
  return S.groups.length < 2 ? t('bar.oneDate') : '';
}

function setLam(lam: number): void {
  const clamped = Math.max(LAM_MIN, Math.min(LAM_MAX, lam));
  S.color = false;
  showDetector(detectorOf(clamped), clamped);
}

function watchStrip(strip: HTMLElement | null): void {
  if (!strip) return;
  const at = (e: PointerEvent) => {
    const r = strip.getBoundingClientRect();
    setLam(lamAt((e.clientX - r.left) / r.width));
  };
  strip.addEventListener('pointerdown', (e) => {
    capture(strip, e.pointerId);
    at(e);
  });
  strip.addEventListener('pointermove', (e) => {
    if (strip.hasPointerCapture(e.pointerId)) at(e);
  });
  strip.querySelector('.wl-handle')?.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    const d =
      k === 'ArrowLeft' || k === 'ArrowDown' ? -1 : k === 'ArrowRight' || k === 'ArrowUp' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    // One step is about one SPHEREx channel: a seventeenth of a detector's band.
    setLam(lamAt(where(S.lam) + d / (6 * 17)));
  });
}

function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target instanceof Element ? e.target : null;
  if (t?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], dialog'))
    return;
  if (document.querySelector('dialog[open]')) return;
  if (e.key === ' ' || e.code === 'Space') {
    if (t?.closest('button, a, [role="button"], [role="switch"], [role="slider"]')) return;
    if (S.groups.length < 2) return;
    e.preventDefault();
    if (S.playing) pause();
    else play();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (t?.closest('[role="slider"], [role="tab"], input[type="range"]')) return;
    if (!S.groups.length) return;
    e.preventDefault();
    step(e.key === 'ArrowLeft' ? -1 : 1);
  }
}

/** Captures the pointer when the browser allows it (a synthetic or ended pointer cannot be). */
function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    // Nothing to capture: the drag still works while the pointer stays over the element.
  }
}
