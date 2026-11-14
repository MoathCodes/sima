/**
 * Picture tab: how pixel values become brightness (TLS-1, docs/tools.md "Picture tab"): stretch,
 * black and white points with a live histogram, brightness and contrast, colour map, invert, the
 * Color view mix, and saving the picture as a PNG with its label (O-V9). Owner: lane E.
 *
 * "Values in force = values shown": the Black and White boxes always show the points the picture
 * on screen is drawn with, in noise units above the sky, whichever method chose them.
 */
import { S, pic } from '../state.ts';
import { exif, hud, type PictureView } from '../render.ts';
import { histogram } from '../../core/display.ts';
import type { ColourMap, LimitsMode, MixColour, PicSettings, Stretch } from '../../core/picture.ts';
import { clampPoints, setPic } from './settings.ts';
import { lastView, noiseOf, onPaint, rangeOf } from './view.ts';
import { esc, num, pressSeg, seg, setSwitch, sig, sizeCanvas, switchRow, term, token } from './dom.ts';

const STRETCH_LINE: Record<Stretch, string> = {
  linear: 'Linear: brightness in proportion to the value',
  sqrt: 'Square root: a gentle lift for faint things',
  log: 'Log: faint things lifted a lot; bright stars squeezed',
  asinh: 'Asinh: faint things visible, bright stars not burnt out (default)',
  equal: 'Equalise: every brightness level used equally often',
};

const LIMITS_LINE: Record<LimitsMode, string> = {
  noise: 'From the pixel noise: the same for every date, so blinking does not flicker (default)',
  zscale: 'zscale (IRAF): keeps the middle of the sorted values. Good for faint sky',
  pct: '99.5%: the brightest and darkest 0.5% of pixels are clipped',
  minmax: 'Min to max: the full range. Bright stars make everything else dark',
  custom: 'Your own black and white, in noise units above the sky. Drag the handles or type',
};

const CMAPS: [ColourMap, string][] = [
  ['band', 'Band'],
  ['thermal', 'Thermal'],
  ['mono', 'Mono'],
  ['viridis', 'Viridis'],
];

export function buildPicture(root: HTMLElement): void {
  root.innerHTML = `
    <p class="tl-intro">How pixel values become brightness on screen. The values themselves do not change.</p>
    <p class="tl-line" data-guide="box-stats">Point at the picture to read one pixel. Hold <span class="kbd">Shift</span> and drag a box for its statistics; pixels flagged on every exposure are left out and counted.</p>
    <p class="group-label tl-group">Stretch</p>
    ${seg('stretch', 'Stretch', [
      ['linear', 'Linear'],
      ['sqrt', 'Sqrt'],
      ['log', 'Log'],
      ['asinh', 'Asinh'],
      ['equal', 'Equalise'],
    ])}
    <p class="tl-line" data-stretch-line></p>
    <p class="group-label tl-group">Black and white points</p>
    ${seg('limits', 'Black and white points', [
      ['noise', 'Noise'],
      ['zscale', 'zscale'],
      ['pct', '99.5%'],
      ['minmax', 'Min–max'],
      ['custom', 'Custom'],
    ])}
    <p class="tl-line" data-limits-line></p>
    <div class="window tl-hist" data-hist>
      <canvas aria-hidden="true"></canvas>
      <button type="button" class="tl-handle" data-handle="black" aria-label="Black point"></button>
      <button type="button" class="tl-handle" data-handle="white" aria-label="White point"></button>
    </div>
    <div class="tl-points">
      <label>Black <input class="field tl-num" type="number" step="any" data-point="black"></label>
      <label>White <input class="field tl-num" type="number" step="any" data-point="white"></label>
    </div>
    <p class="tl-line" data-unit></p>
    <label class="tl-slider"><span>${term('Brightness', 'Moves the whole curve darker or brighter, like DS9’s bias. Double-click to reset.')}</span>
      <output data-out="brightness"></output>
      <input type="range" min="-1" max="1" step="0.02" data-range="brightness"></label>
    <label class="tl-slider"><span>${term('Contrast', 'Makes the curve steeper (more contrast) or flatter. Double-click to reset.')}</span>
      <output data-out="contrast"></output>
      <input type="range" min="-1" max="1" step="0.02" data-range="contrast"></label>
    <p class="group-label tl-group">Colour map</p>
    <div class="tl-cmaps" role="group" aria-label="Colour map">${CMAPS.map(
      ([v, t]) =>
        `<button type="button" class="tl-cmap" data-cmap="${v}" aria-pressed="false"><span class="tl-swatch tl-sw-${v}"></span>${t}</button>`,
    ).join('')}</div>
    ${switchRow('invert', 'Invert', 'Dark stars on a light sky, as on survey plates')}
    <p class="group-label tl-group">Color view: which detectors make red, green and blue</p>
    <div class="tl-mix">${[1, 2, 3, 4, 5, 6]
      .map(
        (d) => `<label>D${d} <select class="field tl-select" data-mix="${d - 1}">
          <option value="r">Red</option><option value="g">Green</option><option value="b">Blue</option><option value="off">Off</option></select></label>`,
      )
      .join('')}</div>
    <p class="tl-line">Used by the Color view (all six detectors in one picture).</p>
    <button type="button" class="btn tl-png" data-png>Save the picture (PNG)</button>`;

  root.querySelectorAll<HTMLElement>('[data-stretch]').forEach((b) =>
    b.addEventListener('click', () => setPic({ stretch: b.dataset.stretch as Stretch })),
  );
  root.querySelectorAll<HTMLElement>('[data-limits]').forEach((b) =>
    b.addEventListener('click', () => {
      const mode = b.dataset.limits as LimitsMode;
      // Custom starts from the points in force, so the picture does not jump.
      if (mode === 'custom') setPic({ limits: 'custom', ...pointsInForce() });
      else setPic({ limits: mode });
    }),
  );
  root.querySelectorAll<HTMLInputElement>('[data-point]').forEach((input) =>
    input.addEventListener('change', () => {
      const now = pointsInForce();
      const v = Number(input.value);
      const next =
        input.dataset.point === 'black'
          ? clampPoints(v, now.white ?? pic().white)
          : clampPoints(now.black ?? pic().black, v);
      setPic({ limits: 'custom', ...next });
      updatePicture(root);
    }),
  );
  for (const name of ['brightness', 'contrast'] as const) {
    const input = root.querySelector<HTMLInputElement>(`[data-range="${name}"]`);
    input?.addEventListener('input', () => {
      const v = Number(input.value);
      setPic(name === 'brightness' ? { brightness: v } : { contrast: 10 ** v });
    });
    input?.addEventListener('dblclick', () =>
      setPic(name === 'brightness' ? { brightness: 0 } : { contrast: 1 }),
    );
  }
  root.querySelectorAll<HTMLElement>('[data-cmap]').forEach((b) =>
    b.addEventListener('click', () => setPic({ cmap: b.dataset.cmap as ColourMap })),
  );
  root
    .querySelector('[data-switch="invert"]')
    ?.addEventListener('click', () => setPic({ invert: !pic().invert }));
  root.querySelectorAll<HTMLSelectElement>('[data-mix]').forEach((sel) =>
    sel.addEventListener('change', () => {
      const mix = [...S.pic.mix] as MixColour[];
      mix[Number(sel.dataset.mix)] = sel.value as MixColour;
      if (mix.every((m) => m === 'off')) {
        sel.value = S.pic.mix[Number(sel.dataset.mix)] ?? 'b';
        return; // never empty (docs/tools.md)
      }
      setPic({ mix: mix as unknown as PicSettings['mix'] });
    }),
  );
  root.querySelector('[data-png]')?.addEventListener('click', savePng);
  dragHandles(root);
  host = root;
  if (!listening) {
    listening = true;
    onPaint(() => {
      if (host?.isConnected && host.dataset.tab === 'picture') drawHistogram(host);
    });
  }
}

/** The body the tab was last built in; the one paint listener updates it while it shows Picture. */
let host: HTMLElement | null = null;
let listening = false;

/** The black and white points in force, noise units above the sky; nulls when not known. */
function pointsInForce(): { black: number; white: number } {
  const view = lastView();
  const noise = view ? noiseOf(view) : null;
  const range = view ? rangeOf(view) : null;
  if (!noise || !range) return { black: pic().black, white: pic().white };
  return clampPoints((range.lo - noise.sky) / noise.sigma, (range.hi - noise.sky) / noise.sigma);
}

export function updatePicture(root: HTMLElement): void {
  const p = pic();
  pressSeg(root, 'stretch', p.stretch);
  pressSeg(root, 'limits', p.limits);
  root.querySelector('[data-stretch-line]')!.textContent = STRETCH_LINE[p.stretch];
  root.querySelector('[data-limits-line]')!.textContent = LIMITS_LINE[p.limits];
  pressSeg(root, 'cmap', p.cmap);
  setSwitch(root, 'invert', p.invert);
  const b = root.querySelector<HTMLInputElement>('[data-range="brightness"]');
  const c = root.querySelector<HTMLInputElement>('[data-range="contrast"]');
  if (b && document.activeElement !== b) b.value = String(p.brightness);
  if (c && document.activeElement !== c) c.value = String(Math.log10(p.contrast));
  root.querySelector('[data-out="brightness"]')!.textContent = num(p.brightness, 2);
  root.querySelector('[data-out="contrast"]')!.textContent = `×${num(p.contrast, 2)}`;
  root.querySelectorAll<HTMLSelectElement>('[data-mix]').forEach((sel) => {
    sel.value = S.pic.mix[Number(sel.dataset.mix)] ?? 'off';
  });
  drawHistogram(root);
}

/** The live histogram with the black and white points in force, and the boxes under it. */
function drawHistogram(root: HTMLElement): void {
  const box = root.querySelector<HTMLElement>('[data-hist]');
  const canvas = box?.querySelector('canvas');
  if (!box || !canvas) return;
  const view = lastView();
  const noise = view ? noiseOf(view) : null;
  const range = view ? rangeOf(view) : null;
  const unit = root.querySelector('[data-unit]');
  const inputs = root.querySelectorAll<HTMLInputElement>('[data-point]');
  const ctx = sizeCanvas(canvas);
  const why = !view?.values
    ? 'No single picture on screen (Two dates shows two). Pick another view to see its values.'
    : !noise || !range
      ? 'Not measured: the sky level and noise of this picture are not known yet.'
      : '';
  if (why) {
    if (unit) unit.textContent = why;
    if (ctx) {
      ctx.fillStyle = token('--st-ink-2', '#aab2d0');
      ctx.font = '500 12px Archivo, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No histogram for this picture', canvas.clientWidth / 2, canvas.clientHeight / 2 + 4);
    }
    box.classList.add('tl-hist-off');
    inputs.forEach((i) => {
      if (document.activeElement !== i) i.value = String(i.dataset.point === 'black' ? pic().black : pic().white);
    });
    return;
  }
  box.classList.remove('tl-hist-off');
  const lo = (range!.lo - noise!.sky) / noise!.sigma;
  const hi = (range!.hi - noise!.sky) / noise!.sigma;
  inputs.forEach((i) => {
    if (document.activeElement === i) return;
    i.value = sig(i.dataset.point === 'black' ? lo : hi, 3).replace('−', '-');
  });
  if (unit) {
    unit.innerHTML = `${term('× noise', 'Noise units: how many times the pixel noise above the sky level. One setting then suits every date and detector.')} above the sky; 1 unit = ${esc(sig(noise!.sigma, 3))} µJy a pixel here`;
  }
  const h = histogram(view!.values!, 64, noise!);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const ax = axis(h.edges);
  if (ctx && h.counts.length) {
    const peak = Math.max(...h.counts.map((c) => Math.log1p(c)));
    ctx.fillStyle = token('--st-ink-2', '#aab2d0');
    h.counts.forEach((c, i) => {
      const x0 = ax.x(h.edges[i] ?? 0) * W;
      const x1 = ax.x(h.edges[i + 1] ?? 0) * W;
      const bh = (Math.log1p(c) / (peak || 1)) * (H - 16);
      ctx.fillRect(x0, H - 14 - bh, Math.max(1, x1 - x0 - 0.5), bh);
    });
    ctx.fillStyle = token('--st-ink-3', '#7c86ab');
    ctx.font = '400 11px Archivo, sans-serif';
    ctx.textAlign = 'center';
    for (const t of [0, 10, 100, 1000, 10000]) {
      const x = ax.x(t);
      if (x > 0.02 && x < 0.98) ctx.fillText(String(t), x * W, H - 2);
    }
  } else if (ctx) {
    ctx.fillStyle = token('--st-ink-2', '#aab2d0');
    ctx.font = '500 12px Archivo, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No histogram: the pixel values are not counted yet', W / 2, H / 2);
  }
  const place = (name: string, v: number) => {
    const el = box.querySelector<HTMLElement>(`[data-handle="${name}"]`);
    if (el) el.style.left = `${Math.min(1, Math.max(0, ax.x(v))) * 100}%`;
  };
  place('black', lo);
  place('white', hi);
  box.dataset.axis = JSON.stringify([ax.a, ax.b]);
}

/** The histogram's asinh axis over its edges: value (noise units) → 0..1 across. */
function axis(edges: number[]): { a: number; b: number; x(v: number): number; v(x: number): number } {
  const a = Math.asinh(edges.length ? Math.min(...edges) : -5);
  const b = Math.asinh(edges.length ? Math.max(...edges) : 10000);
  const span = b - a || 1;
  return {
    a,
    b,
    x: (v) => (Math.asinh(v) - a) / span,
    v: (x) => Math.sinh(a + x * span),
  };
}

/** Dragging a handle sets a custom point (clamped, white above black). */
function dragHandles(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-handle]').forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      const box = root.querySelector<HTMLElement>('[data-hist]');
      if (!box) return;
      h.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const [a, b] = JSON.parse(box.dataset.axis ?? '[-2.3,9.9]') as [number, number];
        const r = box.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        const v = Math.sinh(a + x * (b - a));
        const now = pointsInForce();
        setPic({
          limits: 'custom',
          ...(h.dataset.handle === 'black' ? clampPoints(v, now.white) : clampPoints(now.black, v)),
        });
      };
      const up = () => {
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointerup', up);
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
    });
    h.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      const now = pointsInForce();
      const f = e.key === 'ArrowRight' ? 1.1 : 1 / 1.1;
      const step = (v: number) => (Math.abs(v) < 1 ? v + (f > 1 ? 0.5 : -0.5) : v * f);
      setPic({
        limits: 'custom',
        ...(h.dataset.handle === 'black'
          ? clampPoints(step(now.black), now.white)
          : clampPoints(now.black, step(now.white))),
      });
    });
  });
}

/** Saves the picture on screen as a PNG with its label under it: source, release, date, wavelength (H2, O-V9). */
function savePng(): void {
  const src = document.querySelector<HTMLCanvasElement>('#frame-pic canvas');
  const view: Readonly<PictureView> | null = lastView();
  if (!src || !view) return;
  const label = [hud()?.title ?? '', exif()].filter(Boolean);
  const processed = view.processed.length ? `Processed: ${view.processed.join(', ')}` : '';
  if (processed) label.push(processed);
  if (S.field?.simulated) label.unshift('SIMULATED: not real data');
  const pad = 10;
  const lineH = 16;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height + pad * 2 + lineH * label.length;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = token('--st-bg', '#090d1c');
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0);
  ctx.fillStyle = token('--st-ink', '#eef0f8');
  ctx.font = '500 12px Archivo, sans-serif';
  label.forEach((l, i) => ctx.fillText(l, pad, src.height + pad + lineH * (i + 0.8), out.width - 2 * pad));
  out.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(S.target ?? 'sima-spot').replace(/[^\w-]+/g, '-')}-D${S.det}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}
