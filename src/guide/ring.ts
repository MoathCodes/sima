/**
 * Pointing at things: the magenta ring around one control, and the tour's dimmer with holes
 * for what stays usable (GDE-2). Owner: lane H. Lives in the `#tour` overlay.
 *
 * The ring follows its part on every drawn frame while it is shown, so it never drifts when the
 * frame is dragged, sized or glides (`onFrameMove` also asks for an update at once). The dimmer
 * never catches the pointer: everything under it stays live (O-G3).
 */
import { currentView } from '../viewer/render.ts';
import { toScreen } from '../sky/sky.ts';
import { onFrameMove } from '../shell/shell.ts';

/** Something to point at: a part by its `data-guide` name, or a spot on the sky. */
export type PointAt = { guide: string } | { ra: number; dec: number; label?: string };

export interface RingOptions {
  /** Dim the rest of the page (the tour). */
  dim?: boolean;
  /** More parts, by `data-guide` name, left undimmed (the bar during the find step). */
  holes?: readonly string[];
  /** Hears the ringed part's box when it changes; null while it is not on screen. */
  onBox?: (box: DOMRect | null) => void;
}

const PAD = 4;
let what: PointAt | null = null;
let options: RingOptions = {};
let raf = 0;
let lastKey = '';
let stopMove: (() => void) | null = null;

/**
 * Rings one part, or a spot on the sky or in the picture; null stops.
 */
export function ring(next: PointAt | null, opts: RingOptions = {}): void {
  what = next;
  options = opts;
  lastKey = '';
  const layer = parts();
  if (!layer) return;
  if (!next) {
    cancelAnimationFrame(raf);
    raf = 0;
    stopMove?.();
    stopMove = null;
    layer.ring.hidden = true;
    layer.dim.toggleAttribute('hidden', true);
    layer.label.hidden = true;
    sync();
    return;
  }
  stopMove ??= onFrameMove(update);
  if (!raf) raf = requestAnimationFrame(loop);
  update();
}

/** The element a `data-guide` name points at: the first one that is on screen. */
export function find(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-guide="${CSS.escape(name)}"]`)) {
    if (el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

/** Shows or hides `#tour` as a whole: it is shown while any of its parts is. */
export function sync(): void {
  const tour = document.getElementById('tour');
  if (!tour) return;
  const any = [...tour.children].some((c) => !c.hasAttribute('hidden'));
  if (tour.hidden === any) tour.hidden = !any;
}

function loop(): void {
  raf = 0;
  if (!what) return;
  update();
  raf = requestAnimationFrame(loop);
}

function boxOf(p: PointAt): DOMRect | null {
  if ('guide' in p) return find(p.guide)?.getBoundingClientRect() ?? null;
  const view = currentView();
  const canvas = document.querySelector<HTMLCanvasElement>('#frame-pic canvas[data-picture]');
  const at = view?.skyToPic(p.ra, p.dec);
  if (at && canvas?.checkVisibility()) {
    const c = canvas.getBoundingClientRect();
    if (at.x >= 0 && at.y >= 0 && at.x <= c.width && at.y <= c.height) {
      const r = Math.max(12, 2.5 * (view?.k ?? 4));
      return new DOMRect(c.left + at.x - r, c.top + at.y - r, 2 * r, 2 * r);
    }
  }
  const s = toScreen(p.ra, p.dec);
  return s ? new DOMRect(s.x - 16, s.y - 16, 32, 32) : null;
}

function update(): void {
  const layer = parts();
  if (!layer || !what) return;
  const box = boxOf(what);
  const holes = (options.holes ?? [])
    .map((n) => find(n)?.getBoundingClientRect())
    .filter((r): r is DOMRect => !!r);
  const key = [box, ...holes]
    .map((r) => (r ? `${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0}` : '-'))
    .join(';');
  const size = `${innerWidth}x${innerHeight}`;
  if (key + size === lastKey) return;
  lastKey = key + size;

  const round = 'ra' in what;
  layer.ring.hidden = !box;
  layer.ring.classList.toggle('round', round);
  if (box) {
    Object.assign(layer.ring.style, {
      left: `${box.left - PAD}px`,
      top: `${box.top - PAD}px`,
      width: `${box.width + 2 * PAD}px`,
      height: `${box.height + 2 * PAD}px`,
    });
  }
  const label = 'ra' in what ? what.label : undefined;
  layer.label.hidden = !box || !label;
  if (box && label) {
    layer.label.textContent = label;
    layer.label.style.left = `${box.left + box.width + PAD + 4}px`;
    layer.label.style.top = `${box.top + box.height / 2 - 10}px`;
  }

  layer.dim.toggleAttribute('hidden', !options.dim);
  if (options.dim) {
    const cut = [box, ...holes]
      .filter((r): r is DOMRect => !!r)
      .map((r) => {
        const x = r.left - PAD;
        const y = r.top - PAD;
        const w = r.width + 2 * PAD;
        const h = r.height + 2 * PAD;
        return `M${x} ${y}h${w}v${h}h${-w}z`;
      })
      .join('');
    layer.dim.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    layer.path.setAttribute('d', `M0 0H${innerWidth}V${innerHeight}H0z${cut}`);
  }
  sync();
  options.onBox?.(box);
}

interface Parts {
  dim: SVGSVGElement;
  path: SVGPathElement;
  ring: HTMLElement;
  label: HTMLElement;
}
let made: Parts | null = null;

function parts(): Parts | null {
  if (made?.ring.isConnected) return made;
  const tour = document.getElementById('tour');
  if (!tour) return null;
  const ns = 'http://www.w3.org/2000/svg';
  const dim = document.createElementNS(ns, 'svg');
  dim.classList.add('tour-dim');
  dim.setAttribute('aria-hidden', 'true');
  dim.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('fill-rule', 'evenodd');
  dim.append(path);
  const ringEl = document.createElement('div');
  ringEl.className = 'tour-ring';
  ringEl.setAttribute('aria-hidden', 'true');
  const label = document.createElement('div');
  label.className = 'tour-ring-label';
  dim.toggleAttribute('hidden', true);
  ringEl.hidden = true;
  label.hidden = true;
  tour.prepend(dim, ringEl, label);
  made = { dim, path, ring: ringEl, label };
  return made;
}
