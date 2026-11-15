/**
 * The picture tools panel beside the frame, in Measure only: Picture, Clean up, Find changes and
 * Layers (TLS-1 to TLS-8, docs/tools.md). Also over the picture (#pic-tools): "Original" and the
 * "Processed:" label (H8), and the value under the pointer (TLS-6, O-T4); and the legend under
 * the picture (#frame-legend, tools/overlays.ts). Owner: lane E.
 *
 * Settings go in `S.pic` (read the ones in force with `pic()`) and are kept in `sima.tools`
 * (tools/settings.ts). Anything drawn on the picture goes through render.ts `drawHooks`.
 *
 * Links (TLS-7) carry `S.pic` as `pic=`: lane F's url.ts reads and writes it, and names what a
 * link had that was not understood.
 */
import { S, pic, watch, type ToolsTab } from './state.ts';
import { draw, type PictureView } from './render.ts';
import { icon } from '../shell/icons.ts';
import { cleanupSteps } from '../core/picture.ts';
import { formatDec, formatRa } from '../core/astro.ts';
import { median, robustSigma } from '../core/stats.ts';
import {
  anyChanged,
  onSettings,
  resetAll,
  startSettings,
} from './tools/settings.ts';
import { lastView, noiseOf, onPaint, startView } from './tools/view.ts';
import { startCatalogue, onCatalogue } from './tools/catalogue.ts';
import { startSearch } from './tools/search.ts';
import { startOverlays } from './tools/overlays.ts';
import { buildPicture, updatePicture } from './tools/tab-picture.ts';
import { buildClean, updateClean } from './tools/tab-clean.ts';
import { buildFind, updateFind } from './tools/tab-find.ts';
import { buildLayers, updateLayers } from './tools/tab-layers.ts';
import { esc, num, sig } from './tools/dom.ts';

const TABS: readonly [ToolsTab, string][] = [
  ['picture', 'Picture'],
  ['clean', 'Clean up'],
  ['find', 'Find changes'],
  ['layers', 'Layers'],
];

const PARTS: Record<ToolsTab, [(root: HTMLElement) => void, (root: HTMLElement) => void]> = {
  picture: [buildPicture, updatePicture],
  clean: [buildClean, updateClean],
  find: [buildFind, updateFind],
  layers: [buildLayers, updateLayers],
};

let builtTab: ToolsTab | null = null;

/** Fills the tools panel and #pic-tools. Called once by main.ts. */
export function startTools(): void {
  startSettings();
  startView();
  startCatalogue();
  startSearch();
  startOverlays();
  watch(['tools', 'level', 'toolsTab'], render);
  watch(['pic', 'original', 'field', 'det', 'color', 'mode', 'epoch', 'picLinked'], update);
  watch(['pic', 'original', 'level', 'picLinked', 'mode', 'field'], picTools);
  onSettings(update);
  onCatalogue(update);
  onPaint(() => picTools());
  keys();
  pointer();
  render();
  picTools();
}

function render(): void {
  const panel = document.getElementById('tools');
  if (!panel) return;
  const show = S.tools && S.level === 'measure';
  panel.hidden = !show;
  panel.classList.add('tl-panel', 'appear', 'slate');
  if (!show) {
    builtTab = null;
    return;
  }
  if (!panel.firstElementChild) {
    panel.innerHTML = `
      <div class="tl-head">
        <div class="tabs tl-tabs" role="tablist" aria-label="Picture tools">${TABS.map(
          ([key, label]) =>
            `<button type="button" role="tab" id="tl-tab-${key}" data-tab="${key}" data-guide="tools-tab-${key}" aria-controls="tl-body" aria-selected="false" tabindex="-1">${label}</button>`,
        ).join('')}</div>
        <button type="button" class="icon-btn sm" data-close aria-label="Close the picture tools" data-tip="Close (Esc)">${icon('close')}</button>
      </div>
      <div class="tl-body" id="tl-body" role="tabpanel" data-body></div>
      <div class="tl-foot">
        <button type="button" class="btn text" data-reset>Reset all</button>
        <span class="tl-foot-line" data-foot>Kept in this browser and in shared links</span>
      </div>`;
    panel.querySelector('[data-close]')?.addEventListener('click', () => (S.tools = false));
    panel.querySelector('[data-reset]')?.addEventListener('click', () => {
      resetAll();
      draw();
    });
    const tabs = [...panel.querySelectorAll<HTMLElement>('[data-tab]')];
    tabs.forEach((b, i) => {
      b.addEventListener('click', () => (S.toolsTab = b.dataset.tab as ToolsTab));
      // The usual tab keys: arrows, Home and End (docs/tools.md).
      b.addEventListener('keydown', (e) => {
        const to =
          e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (to === null) return;
        e.preventDefault();
        e.stopPropagation();
        const t = tabs[(to + tabs.length) % tabs.length];
        t?.focus();
        if (t) S.toolsTab = t.dataset.tab as ToolsTab;
      });
    });
  }
  panel.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
    const on = b.dataset.tab === S.toolsTab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const body = panel.querySelector<HTMLElement>('[data-body]');
  if (body && builtTab !== S.toolsTab) {
    body.className = 'tl-body';
    body.setAttribute('aria-labelledby', `tl-tab-${S.toolsTab}`);
    // The Find tab keeps its status in view and scrolls only its list (O-T3).
    if (S.toolsTab === 'find') body.removeAttribute('data-scroll');
    else body.setAttribute('data-scroll', '');
    body.dataset.tab = S.toolsTab;
    PARTS[S.toolsTab][0](body);
    builtTab = S.toolsTab;
  }
  update();
}

function update(): void {
  const panel = document.getElementById('tools');
  if (!panel || panel.hidden || !builtTab) return;
  const body = panel.querySelector<HTMLElement>('[data-body]');
  if (body) PARTS[builtTab][1](body);
  const reset = panel.querySelector<HTMLButtonElement>('[data-reset]');
  if (reset) reset.disabled = !anyChanged();
  const foot = panel.querySelector('[data-foot]');
  if (foot) foot.textContent = 'Kept in this browser and in shared links';
}

// ----- Over the picture: Original, Processed, the value under the pointer -------------------

/**
 * "Original" (press and hold, or hold `\`) and the "Processed:" label (H8). Offered in Measure,
 * and in Explore only when a shared link brought picture settings (docs/tools.md).
 */
function picTools(): void {
  const box = document.getElementById('pic-tools');
  if (!box) return;
  const offered = !!S.field && (S.level === 'measure' || S.picLinked);
  box.hidden = !offered;
  if (!offered) return;
  if (!box.firstElementChild) {
    box.className = 'tl-pic';
    box.innerHTML = `
      <p class="window-badge tl-processed" data-processed hidden></p>
      <p class="window-badge tl-readout" data-readout hidden></p>
      <button type="button" class="window-badge tl-original" data-original data-guide="original" aria-pressed="false"
        data-tip="Hold to see the pixels as recorded (or hold \\)" data-tip-pos="above">Original</button>`;
    const btn = box.querySelector<HTMLElement>('[data-original]');
    const hold = (on: boolean) => (e: Event) => {
      if (on && e instanceof PointerEvent) btn?.setPointerCapture(e.pointerId);
      setOriginal(on);
    };
    btn?.addEventListener('pointerdown', hold(true));
    btn?.addEventListener('pointerup', hold(false));
    btn?.addEventListener('pointercancel', hold(false));
    btn?.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) setOriginal(true);
      }
    });
    btn?.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') setOriginal(false);
    });
  }
  const btn = box.querySelector<HTMLElement>('[data-original]');
  btn?.setAttribute('aria-pressed', String(S.original));
  const label = box.querySelector<HTMLElement>('[data-processed]');
  if (!label) return;
  const steps = cleanupSteps(pic());
  const display = displayChanges();
  const lines: string[] = [];
  if (S.original) {
    lines.push('Original: the pixels as recorded');
    if (display) lines.push(`Display kept: ${display}`);
  } else if (steps.length) {
    lines.push(`Processed: ${steps.join(', ')}`);
    if (pic().median && (S.mode === 'diff' || S.mode === 'two')) {
      lines.push('The median filter can erase faint stars and movers here');
    }
  }
  label.hidden = !lines.length;
  label.innerHTML = lines.map(esc).join('<br>');
}

/** The display settings that differ from the default look, in words, for the Original label. */
function displayChanges(): string {
  const p = pic();
  const out: string[] = [];
  if (p.stretch !== 'asinh') out.push(`${p.stretch} stretch`);
  if (p.limits !== 'noise') out.push(`${p.limits === 'pct' ? '99.5%' : p.limits} limits`);
  if (p.cmap !== 'band') out.push(`${p.cmap} colours`);
  if (p.invert) out.push('inverted');
  return out.join(', ');
}

function setOriginal(on: boolean): void {
  if (S.original === on) return;
  S.original = on;
  draw();
}

/** Keys: hold `\` for Original (TLS-2). Not while typing. */
function keys(): void {
  const typing = (e: KeyboardEvent) =>
    e.target instanceof HTMLElement && !!e.target.closest('input, textarea, select, [contenteditable]');
  document.addEventListener('keydown', (e) => {
    if (e.key !== '\\' || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!S.field || (S.level !== 'measure' && !S.picLinked)) return;
    e.preventDefault();
    setOriginal(true);
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === '\\') setOriginal(false);
  });
  window.addEventListener('blur', () => setOriginal(false));
}

/**
 * The value under the pointer, in Measure (TLS-6, as DS9's pixel readout): µJy, times the noise,
 * flags, RA and Dec, pixel. Shift-drag a box for its statistics (O-T4); a plain drag is lane D's
 * (it pans the field, FRM-12).
 */
function pointer(): void {
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** The last box drawn: its statistics stay (and follow the date) until the pointer moves on. */
  let kept: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let last: { x: number; y: number } | null = null;
  const host = () => document.getElementById('frame-pic');
  const readout = () => document.querySelector<HTMLElement>('#pic-tools [data-readout]');
  const off = () => {
    const r = readout();
    if (r) r.hidden = true;
  };
  document.addEventListener('pointermove', (e) => {
    const h = host();
    const canvas = h?.querySelector('canvas');
    if (!h || !canvas || S.level !== 'measure') return off();
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (px < 0 || py < 0 || px > r.width || py > r.height) {
      if (!box) off();
      return;
    }
    if (kept && last && Math.hypot(px - last.x, py - last.y) < 3) return;
    kept = null;
    last = { x: px, y: py };
    if (box) {
      box.x1 = px;
      box.y1 = py;
    }
    show(px, py);
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      const canvas = host()?.querySelector('canvas');
      if (!canvas || !e.shiftKey || S.level !== 'measure' || e.target !== canvas) return;
      const r = canvas.getBoundingClientRect();
      box = { x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top };
      e.stopPropagation(); // a box, not a pan
    },
    true,
  );
  document.addEventListener('pointerup', () => {
    if (box && Math.abs(box.x1 - box.x0) > 4) kept = box;
    if (box && last) show(last.x, last.y);
    box = null;
  });
  onPaint(() => {
    if (last && !readout()?.hidden) show(last.x, last.y);
  });

  function show(px: number, py: number): void {
    const el = readout();
    const view = lastView();
    if (!el || !view?.field) return;
    el.hidden = false;
    // Two lines that wrap, never cut off (TLS-6): the value, then where it is.
    const b = box ?? kept;
    const lines = b && Math.abs(b.x1 - b.x0) > 4 ? region(view, b) : pixelLine(view, px, py);
    el.innerHTML = lines.filter(Boolean).map((l) => `<span>${esc(l)}</span>`).join('');
  }
}

/** One pixel, in words: ["123 µJy · 4.2× noise · flagged pixel", "RA Dec · pixel (31, 40)"]. */
function pixelLine(view: Readonly<PictureView>, px: number, py: number): string[] {
  if (view.field?.simulated) return ['Simulated pictures: no real pixel values'];
  if (S.color) return ['The Color view mixes six detectors: pick one to read a value'];
  const f = view.toField(px, py);
  const x = Math.round(f.x);
  const y = Math.round(f.y);
  const n = view.n;
  const sky = view.picToSky(px, py);
  // RA and Dec each stay whole when the line wraps.
  const whole = (t: string) => t.replace(/ /g, '\u00a0');
  const where = `${sky ? `${whole(formatRa(sky.ra))} ${whole(formatDec(sky.dec))} · ` : ''}pixel (${x}, ${y})`;
  if (x < 0 || y < 0 || x >= n || y >= n) return ['', where];
  const frames = (view.group?.frames ?? []).map((i) => view.field?.frames[i]).filter((fr) => !!fr);
  if (!frames.length) return ['No exposure in this detector on this date', where];
  const flagged = frames.filter((fr) => fr.bad[y * n + x]).length;
  if (!view.values) return ['Two dates shows two pictures: pick one view to read a value', where];
  const v = view.values[y * n + x] ?? Number.NaN;
  if (!Number.isFinite(v)) return ['No data here', where];
  const noise = noiseOf(view);
  const times = noise ? ` · ${num((v - noise.sky) / noise.sigma, 1)}× noise` : '';
  const flag = flagged ? ` · flagged pixel (${flagged} of ${frames.length} exposures)` : '';
  const diff = view.mode === 'diff' ? ' change against the typical sky' : '';
  const proc = view.processed.length ? ' (processed)' : '';
  return [`${sig(v, 3)} µJy${diff}${proc}${times}${flag}`, where];
}

/**
 * Statistics of a dragged box (O-T4), as two lines. Pixels flagged on every exposure of the date
 * are left out and counted (H6); where only some exposures are flagged, the picture already uses
 * the clean ones.
 */
function region(view: Readonly<PictureView>, b: { x0: number; y0: number; x1: number; y1: number }): string[] {
  if (!view.values) return ['Pick a view with one picture to measure a box'];
  const a = view.toField(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1));
  const z = view.toField(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
  const frames = (view.group?.frames ?? []).map((i) => view.field?.frames[i]).filter((fr) => !!fr);
  const vals: number[] = [];
  let flagged = 0;
  for (let y = Math.max(0, Math.round(a.y)); y <= Math.min(view.n - 1, Math.round(z.y)); y++) {
    for (let x = Math.max(0, Math.round(a.x)); x <= Math.min(view.n - 1, Math.round(z.x)); x++) {
      const k = y * view.n + x;
      if (frames.length && frames.every((fr) => fr.bad[k])) {
        flagged += 1;
        continue;
      }
      const v = view.values[k];
      if (v !== undefined && Number.isFinite(v)) vals.push(v);
    }
  }
  const left = flagged ? `, ${flagged} flagged left out` : '';
  if (!vals.length) return [`No clean data in this box${left}`];
  const sum = vals.reduce((s, v) => s + v, 0);
  return [
    `Box of ${vals.length} pixels${left}`,
    `middle ${sig(median(vals), 3)} µJy · spread ${sig(robustSigma(vals), 3)} µJy (robust) · total ${sig(sum, 3)} µJy · brightest ${sig(Math.max(...vals), 3)} µJy`,
  ];
}
