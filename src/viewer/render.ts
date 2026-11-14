/**
 * Painting the frame's picture: the six views, the date badge, the scale bar and north/east
 * (FRM-7 to FRM-9), and the one data line under the views (FRM-10, H2). Owner: lane D.
 *
 * Other lanes draw on the picture only through `drawHooks` (rule 4 in SPEC 9.4): add a function
 * and it runs after every paint, in the picture's own coordinates. Never edit this file for it.
 *
 * PHASE 0 STUB: a plain asinh stretch in the detector's colour, simple Two dates and Difference,
 * and "Not built yet" for Swipe, Stack and Trail. The badge reads "Placeholder" whenever the
 * pictures are the phase 0 placeholder.
 */
import { S, pic, type Mode } from './state.ts';
import { cleanupSteps } from '../core/picture.ts';
import { formatDate } from '../core/astro.ts';
import { wcsPix2Sky, wcsSky2Pix } from '../core/real.ts';
import type { Det, Field, Group } from '../core/types.ts';

/** The picture on screen, for draw hooks and taps. */
export interface PictureView {
  /** The canvas's side, CSS pixels (the picture is square). */
  size: number;
  /** Field pixels across. */
  n: number;
  /** CSS pixels per field pixel. */
  k: number;
  /** Field pixel (integer = pixel centre) → canvas CSS pixel. */
  toPic(x: number, y: number): { x: number; y: number };
  /** Canvas CSS pixel → field pixel. */
  toField(px: number, py: number): { x: number; y: number };
  /** Sky position (degrees) → canvas CSS pixel; null without a field. */
  skyToPic(ra: number, dec: number): { x: number; y: number } | null;
  /** Canvas CSS pixel → sky position (degrees); null without a field. */
  picToSky(px: number, py: number): { ra: number; dec: number } | null;
  field: Field | null;
  /** The flip-book picture on screen; null when there is none. */
  group: Group | null;
  /** Its middle date, MJD; null when there is none. */
  mjd: number | null;
  det: Det;
  mode: Mode;
  /** The values on screen, n × n µJy after processing (Difference: the difference); null when the view shows no single picture (Two dates). */
  values: Float32Array | null;
  /** The clean-up steps in force, in words (H8); empty when the picture is as recorded. */
  processed: string[];
}

/** Draws over the picture after each paint. The context is in CSS pixels; save and restore. */
export type DrawHook = (ctx: CanvasRenderingContext2D, view: Readonly<PictureView>) => void;

/** Everything drawn over the picture by other lanes (catalogue circles, candidates, rings…). */
export const drawHooks = new Set<DrawHook>();

/** What the date badge says. */
export interface Hud {
  /** The window's letter: `A`, `B`, `C`… */
  letter: string;
  /** Explore: the month ("Mar 2026"). Measure: date and time. */
  title: string;
  /** Plain lines under it (Measure adds pass, detector, wavelength and colour match). */
  lines: string[];
}

const tapFns = new Set<(p: { x: number; y: number; ra: number; dec: number }) => void>();
let queued = false;
let view: PictureView | null = null;

/**
 * Repaints the picture and its labels on the next animation frame. Call it after changing
 * anything the picture shows; several calls in one frame paint once.
 */
export function draw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    paint();
  });
}

/**
 * Calls `fn` when the user taps the picture without dragging (the task's "Tap it", selecting a
 * source in Measure).
 * @returns Unsubscribe.
 */
export function onTap(
  fn: (p: { x: number; y: number; ra: number; dec: number }) => void,
): () => void {
  tapFns.add(fn);
  return () => tapFns.delete(fn);
}

/** What the date badge says now; null when there is no picture. */
export function hud(): Hud | null {
  const g = S.groups[S.epoch];
  if (!g || !S.field) return null;
  const lines = S.field.simulated
    ? ['Placeholder: made-up pictures (phase 0)']
    : [`Blends ${g.frames.length} shots`];
  return {
    letter: g.letter,
    title: formatDate(g.mjd, S.level === 'measure' ? 'time' : 'month'),
    lines,
  };
}

/**
 * The one line under the views: source, release, dates, exposure count and detector range
 * (FRM-10, H2).
 */
export function exif(): string {
  const f = S.field;
  if (!f) return S.source === 'loading' ? 'Loading pictures…' : 'No pictures here';
  if (f.simulated) {
    return `Simulated placeholder · ${f.windows} made-up dates · ${f.frames.length} pictures · D1–D6`;
  }
  return `Real SPHEREx data, ${f.releases.join(', ')} · ${f.frames.length} exposures`;
}

// ----- Phase 0 painting -------------------------------------------------------------------------

function ensureCanvas(): HTMLCanvasElement | null {
  const host = document.getElementById('frame-pic');
  if (!host) return null;
  let canvas = host.querySelector<HTMLCanvasElement>('canvas[data-picture]');
  if (!canvas) {
    host.style.cssText =
      'position:relative;aspect-ratio:1;border-radius:var(--r-window);overflow:hidden;background:#000';
    canvas = document.createElement('canvas');
    canvas.dataset.picture = '';
    canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated';
    host.prepend(canvas);
    watchTaps(canvas);
    for (const name of ['badge', 'placeholder', 'scale']) {
      const el = document.createElement('div');
      el.dataset[name] = '';
      host.append(el);
    }
    new ResizeObserver(draw).observe(host);
  }
  return canvas;
}

function paint(): void {
  const canvas = ensureCanvas();
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const size = canvas.clientWidth || 1;
  const field = S.field;
  const n = field?.n ?? 1;
  const k = size / n;
  canvas.width = Math.round(size * devicePixelRatio);
  canvas.height = canvas.width;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  const group = S.groups[S.epoch] ?? null;
  let values: Float32Array | null = null;
  if (field && group) {
    const img = new ImageData(n, n);
    const hue = detectorHue(S.det);
    if (S.mode === 'two') {
      const later = S.groups[S.ref === S.epoch ? S.groups.length - 1 : S.epoch];
      const a = mean(field, S.groups[S.ref]);
      const b = mean(field, later);
      for (let i = 0; i < n * n; i++) {
        const r = stretch(a[i] ?? 0, field);
        const c = stretch(b[i] ?? 0, field);
        img.data.set([255 * r, 255 * c, 255 * c, 255], i * 4);
      }
    } else {
      values = mean(field, group);
      if (S.mode === 'diff') {
        const all = S.groups.map((g) => mean(field, g));
        values = values.map((v, i) => v - all.reduce((s, p) => s + (p[i] ?? 0), 0) / all.length);
      }
      for (let i = 0; i < n * n; i++) {
        const v = values[i] ?? 0;
        if (S.mode === 'diff') {
          const t = 128 + 127 * Math.tanh(v / 80);
          img.data.set([t, t, t, 255], i * 4);
        } else {
          const t = stretch(v, field);
          img.data.set([hue[0] * t, hue[1] * t, hue[2] * t, 255], i * 4);
        }
      }
    }
    const tmp = new OffscreenCanvas(n, n);
    tmp.getContext('2d')?.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, size, size);
  }

  view = {
    size,
    n,
    k,
    toPic: (x, y) => ({ x: (x + 0.5) * k, y: (y + 0.5) * k }),
    toField: (px, py) => ({ x: px / k - 0.5, y: py / k - 0.5 }),
    skyToPic: (ra, dec) => {
      if (!field) return null;
      const p = wcsSky2Pix(field.wcs, ra, dec);
      return { x: (p.x + 0.5) * k, y: (p.y + 0.5) * k };
    },
    picToSky: (px, py) => (field ? wcsPix2Sky(field.wcs, px / k - 0.5, py / k - 0.5) : null),
    field,
    group,
    mjd: group ? group.mjd : null,
    det: S.det,
    mode: S.mode,
    values,
    processed: S.original ? [] : cleanupSteps(pic()),
  };
  for (const hook of drawHooks) {
    ctx.save();
    try {
      hook(ctx, view);
    } catch (err) {
      console.error('render: a draw hook failed', err);
    }
    ctx.restore();
  }
  labels(canvas.parentElement, size, k);
}

/** The picture's own labels: date badge, the placeholder tag, scale bar and north/east. */
function labels(host: HTMLElement | null, size: number, k: number): void {
  if (!host) return;
  const badge = host.querySelector<HTMLElement>('[data-badge]');
  const tag = host.querySelector<HTMLElement>('[data-placeholder]');
  const scale = host.querySelector<HTMLElement>('[data-scale]');
  const h = hud();
  if (badge) {
    badge.className = 'window-badge';
    badge.hidden = !h;
    badge.style.cssText = 'position:absolute;top:8px;left:8px;pointer-events:none';
    badge.innerHTML = h
      ? `<b style="font:var(--text-control)">${h.letter} · ${h.title}</b><br>${h.lines.join('<br>')}`
      : '';
    if (!h) badge.textContent = '';
  }
  if (tag) {
    tag.hidden = !S.field?.simulated;
    tag.className = 'window-badge';
    tag.style.cssText =
      'position:absolute;top:8px;right:8px;color:var(--st-accent-2);font:var(--text-control);pointer-events:none';
    tag.textContent =
      S.mode === 'swipe' || S.mode === 'stack' || S.mode === 'trail'
        ? `Placeholder · ${S.mode} view not built yet`
        : 'Placeholder';
  }
  if (scale) {
    const arcminPx = (60 / 6.15) * k;
    scale.style.cssText = `position:absolute;left:10px;bottom:10px;width:${arcminPx}px;border-bottom:1.5px solid var(--st-ink);color:var(--st-ink);font:var(--text-scale);padding-bottom:3px;pointer-events:none`;
    // North up, east left: an L of two arrows, lettered N and E, just right of the scale bar.
    scale.innerHTML = `1 arcmin<svg viewBox="0 0 30 30" width="30" height="30" aria-label="North up, east left"
      style="position:absolute;left:calc(100% + 12px);bottom:-1px;overflow:visible;stroke:currentColor;fill:none;stroke-width:1.5">
      <path d="M24 28V8M24 28H4"/><text x="21" y="5" fill="currentColor" stroke="none">N</text>
      <text x="-6" y="31" fill="currentColor" stroke="none">E</text></svg>`;
    scale.hidden = !S.field;
  }
}

function mean(field: Field, group: Group | undefined): Float32Array {
  const out = new Float32Array(field.n * field.n);
  const frames = group?.frames ?? [];
  for (const i of frames) {
    const f = field.frames[i];
    if (!f) continue;
    for (let p = 0; p < out.length; p++) out[p] = (out[p] ?? 0) + (f.pix[p] ?? 0) / frames.length;
  }
  return out;
}

function stretch(v: number, field: Field): number {
  const sigma = field.noise[S.det - 1] ?? 5;
  return Math.max(0, Math.min(1, Math.asinh(Math.max(0, v - 30) / (2 * sigma)) / Math.asinh(150)));
}

function detectorHue(det: Det): [number, number, number] {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(`--d${det}`).trim();
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1] ?? 'ff', 16), parseInt(m[2] ?? 'ff', 16), parseInt(m[3] ?? 'ff', 16)]
    : [255, 255, 255];
}

function watchTaps(canvas: HTMLCanvasElement): void {
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || !view || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
    down = null;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const f = view.toField(px, py);
    const sky = view.picToSky(px, py);
    if (!sky) return;
    for (const fn of tapFns) fn({ x: f.x, y: f.y, ra: sky.ra, dec: sky.dec });
  });
}
