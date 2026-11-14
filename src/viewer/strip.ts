/**
 * The detector strip: six small pictures of the date on screen, one per detector, D1 to D6, plus
 * Color (all six as one picture). It fills the empty `#detectors` that lane E puts in Measure.
 * Owner: lane D. A press shows that detector everywhere (the `band` message), so the wavelength
 * scale and the sky follow (BAR-4).
 */
import { S, pic, watch } from './state.ts';
import { flipImage, lookFor, picturesReady, refGroup } from './paint.ts';
import { groupFrames } from '../core/blink.ts';
import { BAND_EDGES } from '../core/instrument.ts';
import { emit } from '../shell/bus.ts';
import { draw } from './render.ts';
import { announceShown } from './load.ts';

let host: HTMLElement | null = null;

/** Starts watching for `#detectors`. Called once by frame.ts. */
export function startStrip(): void {
  const find = () => {
    const el = document.getElementById('detectors');
    if (el !== host) {
      host = el;
      if (host) build(host);
    }
  };
  new MutationObserver(find).observe(document.body, { childList: true, subtree: true });
  find();
  watch(['field', 'groups', 'epoch', 'det', 'pic', 'original', 'color', 'level'], () => {
    if (host?.isConnected) paint(host);
  });
}

/**
 * Turns the Color view (all six detectors as one picture) on or off, as the Color button does.
 * For a link's `det=color` too (url.ts).
 */
export function showColour(on: boolean): void {
  if (S.color === on) return;
  S.color = on;
  draw();
  announceShown();
}

function build(el: HTMLElement): void {
  el.classList.add('det-strip');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Detectors');
  el.innerHTML =
    [1, 2, 3, 4, 5, 6]
      .map(
        (d) => `<button class="det-thumb" data-det="${d}" style="--hue:var(--d${d})"
          aria-label="Detector ${d}, ${BAND_EDGES[d - 1]} to ${BAND_EDGES[d]} µm" data-tip="D${d}: ${BAND_EDGES[d - 1]} to ${BAND_EDGES[d]} µm">
          <canvas class="window" width="1" height="1"></canvas>
          <span class="det-name">D${d}</span><span class="det-band">${BAND_EDGES[d - 1]}–${BAND_EDGES[d]}</span>
        </button>`,
      )
      .join('') +
    `<button class="det-thumb det-color" data-color aria-label="Color: all six detectors as one picture" data-tip="All six detectors as one colour picture">
       <span class="det-swatch window" aria-hidden="true"></span><span class="det-name">Color</span><span class="det-band">D1–D6</span>
     </button>`;
  el.querySelectorAll<HTMLElement>('[data-det]').forEach((b) =>
    b.addEventListener('click', () => emit('band', { det: Number(b.dataset.det) })),
  );
  el.querySelector('[data-color]')?.addEventListener('click', () => showColour(!S.color));
  paint(el);
}

/** Thumbnails waiting to be repainted, by detector, and the animation frame that paints one. */
const waiting = new Set<number>();
let frame = 0;

/**
 * Marks the buttons at once, and repaints the thumbnails one per animation frame, only while the
 * strip is on screen (TLS-8: six at once on every picture setting held the page).
 */
function paint(el: HTMLElement): void {
  el.querySelectorAll<HTMLButtonElement>('[data-det]').forEach((b) => {
    b.setAttribute('aria-pressed', String(!S.color && Number(b.dataset.det) === S.det));
  });
  el.querySelector('[data-color]')?.setAttribute('aria-pressed', String(S.color));
  for (const d of [1, 2, 3, 4, 5, 6]) waiting.add(d);
  soon();
}

function soon(): void {
  if (!frame && waiting.size) frame = requestAnimationFrame(next);
}

function next(): void {
  frame = 0;
  const el = host;
  if (!el?.isConnected || !el.checkVisibility()) {
    // Hidden: painted again when Measure opens (the `level` change).
    waiting.clear();
    return;
  }
  // The detector on screen first.
  const d = waiting.has(S.det) ? S.det : waiting.values().next().value;
  if (d === undefined) return;
  waiting.delete(d);
  const b = el.querySelector<HTMLButtonElement>(`[data-det="${d}"]`);
  if (b) thumb(b, d);
  soon();
}

/** Paints one detector's thumbnail; once its pictures are made, if they were not yet. */
function thumb(b: HTMLButtonElement, d: number): void {
  const field = S.field;
  const g = S.groups[S.epoch];
  const p = pic();
  const by = g?.visit === null || g?.visit === undefined ? 'window' : 'visit';
  const canvas = b.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  if (!field || !g) {
    canvas.width = 1;
    canvas.height = 1;
    b.disabled = true;
    return;
  }
  const groups = groupFrames(field, d, by);
  const mine = groups.find((x) => x.window === g.window && x.visit === g.visit);
  b.disabled = !mine?.frames.length;
  b.title = mine?.frames.length ? '' : `No D${d} exposure on this date`;
  if (!mine?.frames.length) {
    canvas.width = field.n;
    canvas.height = field.n;
    ctx.clearRect(0, 0, field.n, field.n);
    return;
  }
  const ready = () => {
    waiting.add(d);
    soon();
  };
  if (!picturesReady(field, [refGroup(groups, 0), mine], p, ready)) return;
  const look = lookFor(field, groups, 0, p, d);
  canvas.width = field.n;
  canvas.height = field.n;
  ctx.putImageData(flipImage(field, mine, look, p), 0, 0);
}
