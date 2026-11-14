/**
 * The shell: the cards on the sky and where they sit. The wordmark, the top-right actions
 * (Guide, Places, Share, About), the map's tool rail and its chooser, the frame's place on the
 * screen, the sky's loading card, the tooltip, page-wide keys and the Escape order (GEN-1).
 * Owner: lane F.
 *
 * The functions exported here are the contract in SPEC 8.4; other lanes call only these.
 *
 * PHASE 0 STUB: the cards are filled with their final words where the screenshots show them,
 * but the frame cannot be dragged or sized yet, and Share and About hold placeholders.
 */
import { emit } from './bus.ts';
import { icon } from './icons.ts';
import { camera, flyTo, grid, retry, setLayer, type SkyLayer } from '../sky/sky.ts';
import { linkFor } from '../viewer/url.ts';

/** A place to look at, from a place card, a tour stop, search or a saved place. */
export interface PlaceRef {
  /** The name to show while it loads. */
  name: string;
  /** Centre, degrees. */
  ra: number;
  dec: number;
  /** The frame's field size, arcminutes (one of FOVS; the frame rounds to the nearest). */
  fov?: number;
  /** A shipped target or practice key (`barnard`, `warm-up`, …), when the place is one. */
  target?: string | null;
}

/** The sky map's loading, as lane C reports it to `skyReady`. */
export interface SkyLoad {
  /** The map's name as the sky note says it ("SPHEREx", "AllWISE 3.4 µm"). */
  layer: string;
  /** Tiles drawn and tiles the current view needs. `loaded === total` means done. */
  loaded: number;
  total: number;
  /** Tiles that still failed after retrying. More than 0 shows Retry (SKY-7). */
  failed: number;
  /** True until the very first view of the visit has drawn once. */
  first: boolean;
}

/**
 * Fills the shell's cards and starts the keys. Called once by main.ts.
 */
export function startShell(): void {
  fill(
    'wordmark',
    `<span lang="ar" dir="rtl" style="font:var(--text-wordmark)">سيما</span>
    <span style="font:var(--text-wordmark-latin)">Sima</span>`,
  );
  const wordmark = document.getElementById('wordmark');
  if (wordmark) {
    wordmark.style.cssText =
      'display:flex;align-items:center;gap:8px;margin:0;padding:0 14px;color:var(--ink)';
    wordmark.setAttribute('aria-label', 'Sima');
  }

  fill(
    'actions',
    `
    <button class="btn quiet" popovertarget="guide-menu" data-guide="guide-button">${icon('compass')}Guide</button>
    <button class="btn quiet" popovertarget="places-menu" data-guide="places-button">${icon('pin')}Places</button>
    <button class="icon-btn" data-open="share" aria-label="Share" data-tip="Share this view">${icon('share')}</button>
    <button class="icon-btn" data-open="about" aria-label="About Sima" data-tip="About Sima">${icon('info')}</button>`,
  );
  style('actions', 'display:flex;align-items:center;gap:2px;padding:0 5px');

  fill(
    'rail',
    `
    <button class="icon-btn" data-zoom="0.5" aria-label="Zoom the sky in" data-tip="Zoom in (+)" data-tip-pos="right">${icon('plus')}</button>
    <button class="icon-btn" data-zoom="2" aria-label="Zoom the sky out" data-tip="Zoom out (−)" data-tip-pos="right">${icon('minus')}</button>
    <button class="icon-btn" popovertarget="sky-layers" aria-label="Sky map" data-tip="Sky map" data-tip-pos="right">${icon('layers')}</button>
    <button class="icon-btn" data-grid aria-pressed="false" aria-label="Coordinate grid" data-tip="Coordinate grid" data-tip-pos="right">${icon('globe')}</button>`,
  );
  style('rail', 'display:grid;gap:2px;padding:5px');

  fill(
    'sky-layers',
    `
    <p class="group-label" style="padding:4px 10px">Sky map</p>
    <button class="menu-item" role="menuitemradio" aria-checked="true" data-layer="spherex">SPHEREx, at the wavelength on the bar</button>
    <button class="menu-item" role="menuitemradio" aria-checked="false" data-layer="wise-w1">AllWISE 3.4 µm</button>
    <button class="menu-item" role="menuitemradio" aria-checked="false" data-layer="wise-w2">AllWISE 4.6 µm</button>`,
  );

  fill(
    'share',
    `
    <h2 style="font:var(--text-title);margin:0 0 12px">Share this view</h2>
    <p style="margin:0 0 6px;color:var(--ink-2);font:var(--text-label)">Link</p>
    <input class="field" readonly style="width:440px" data-link>
    <p style="margin:12px 0 0;color:var(--ink-2)">Placeholder (phase 0): the embed code comes here.</p>
    <form method="dialog" style="margin-top:14px;text-align:right"><button class="btn">Close</button></form>`,
  );

  fill(
    'about',
    `
    <h2 style="font:var(--text-title);margin:0 0 12px">About Sima</h2>
    <p style="margin:0;max-width:var(--reading-measure)">Placeholder (phase 0): how to use it, the method,
      the five test targets, Planet X, the challenge, limits, AI use and sources (GEN-6).</p>
    <form method="dialog" style="margin-top:14px;text-align:right"><button class="btn">Close</button></form>`,
  );

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  startTooltips();
}

/**
 * The frame card's box on screen, for the tether, the tour ring and placement.
 * @returns CSS pixels, or null while the frame is hidden.
 */
export function frameRect(): DOMRect | null {
  const frame = document.getElementById('frame');
  if (!frame || frame.hidden || frame.offsetParent === null) return null;
  return frame.getBoundingClientRect();
}

/**
 * Puts the frame on a place ("Look with the frame") and shows it on the sky. Asks the frame
 * half through the bus (`aim`).
 *
 * @param place Where and what.
 * @param opts `fly` (default true): also move the sky to show the place.
 */
export function openPlace(place: PlaceRef, opts: { fly?: boolean } = {}): void {
  hideFrame(false);
  emit('aim', { ra: place.ra, dec: place.dec, fov: place.fov, target: place.target ?? null });
  if (opts.fly !== false) flyTo({ ra: place.ra, dec: place.dec });
}

/**
 * Hides or shows the frame (FRM-5). The patch stays on the sky.
 * @param hidden True hides, false shows.
 */
export function hideFrame(hidden = true): void {
  const frame = document.getElementById('frame');
  if (frame) frame.hidden = hidden;
}

/**
 * Moves only the sky ("Zoom to it"); the frame stays where it is.
 * @param ra Degrees.
 * @param dec Degrees.
 * @param fov Width of the view, DEGREES; leave out to keep the zoom.
 */
export function flyFree(ra: number, dec: number, fov?: number): void {
  flyTo({ ra, dec, fov });
}

/**
 * Shows the welcome card (lane H fills it), unless the page is embedded.
 */
export function greet(): void {
  const welcome = document.getElementById('welcome');
  if (welcome && !document.documentElement.hasAttribute('data-embed')) welcome.hidden = false;
}

/**
 * The sky map reports its loading. The card at the top centre shows it only if the wait lasts
 * 0.3 s (GEN-4), with Retry when tiles failed (SKY-7).
 * PHASE 0 STUB: shows the card while not done; no delay.
 */
export function skyReady(load: SkyLoad): void {
  const card = document.getElementById('sky-loading');
  if (!card) return;
  const done = load.total > 0 && load.loaded >= load.total && load.failed === 0;
  card.hidden = done;
  if (done) return;
  const pct = load.total > 0 ? Math.round((100 * load.loaded) / load.total) : 0;
  card.style.cssText = 'padding:8px 12px;font:var(--text-label)';
  card.innerHTML = load.failed
    ? `Some of the ${load.layer} map did not load. <button class="btn text" data-retry>Retry</button>`
    : `Loading more sky · ${pct}%`;
  card.querySelector('[data-retry]')?.addEventListener('click', retry);
}

// ----- Phase 0 helpers --------------------------------------------------------------------------

function fill(id: string, html: string): void {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function style(id: string, css: string): void {
  const el = document.getElementById(id);
  if (el) el.style.cssText = css;
}

function onClick(e: MouseEvent): void {
  const el = e.target instanceof Element ? e.target : null;
  const zoom = el?.closest<HTMLElement>('[data-zoom]');
  if (zoom) flyTo({ fov: camera().fov * Number(zoom.dataset.zoom) });
  const gridBtn = el?.closest<HTMLElement>('[data-grid]');
  if (gridBtn) gridBtn.setAttribute('aria-pressed', String(grid(!grid())));
  const layer = el?.closest<HTMLElement>('[data-layer]');
  if (layer) {
    setLayer(layer.dataset.layer as SkyLayer);
    for (const item of document.querySelectorAll('#sky-layers [data-layer]')) {
      item.setAttribute('aria-checked', String(item === layer));
    }
  }
  const open = el?.closest<HTMLElement>('[data-open]');
  const dialog = open && document.getElementById(open.dataset.open ?? '');
  if (dialog instanceof HTMLDialogElement) {
    const link = dialog.querySelector<HTMLInputElement>('[data-link]');
    if (link) link.value = linkFor();
    dialog.showModal();
  }
}

/**
 * Page-wide keys (BAR-1 and GEN-1 list them all). PHASE 0 STUB: `/` and Escape only.
 * Escape closes the visible `[data-escape]` element with the highest rank by clicking its
 * `[data-close]` button. Open popovers and modal dialogs close themselves first. A part that
 * handles Escape itself calls `preventDefault()` on the event.
 */
function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented) return; // a part handled it already (search closes its suggestions)
  const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select');
  if (e.key === '/' && !typing) {
    e.preventDefault();
    document.querySelector<HTMLInputElement>('#search input')?.focus();
  }
  if (e.key !== 'Escape' || document.querySelector('dialog[open], :popover-open:not(#tooltip)')) {
    return;
  }
  const open = [...document.querySelectorAll<HTMLElement>('[data-escape]')]
    .filter((el) => !el.hidden)
    .sort((a, b) => Number(b.dataset.escape) - Number(a.dataset.escape));
  open[0]?.querySelector<HTMLElement>('[data-close]')?.click();
}

/** One tooltip for every `[data-tip]`, after 0.35 s, below (or `data-tip-pos`: right, above). */
function startTooltips(): void {
  const tip = document.getElementById('tooltip');
  if (!tip) return;
  let timer = 0;
  const hide = () => {
    clearTimeout(timer);
    if (tip.matches(':popover-open')) tip.hidePopover();
  };
  const show = (el: HTMLElement) => {
    hide();
    timer = window.setTimeout(() => {
      tip.textContent = el.dataset.tip ?? '';
      tip.showPopover();
      const r = el.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const pos = el.dataset.tipPos;
      const x = pos === 'right' ? r.right + 8 : r.left + r.width / 2 - t.width / 2;
      const y =
        pos === 'right'
          ? r.top + r.height / 2 - t.height / 2
          : pos === 'above'
            ? r.top - t.height - 8
            : r.bottom + 8;
      tip.style.left = `${Math.max(8, Math.min(innerWidth - t.width - 8, x))}px`;
      tip.style.top = `${Math.max(8, Math.min(innerHeight - t.height - 8, y))}px`;
    }, 350);
  };
  const find = (e: Event) =>
    e.target instanceof Element ? e.target.closest<HTMLElement>('[data-tip]') : null;
  document.addEventListener('pointerover', (e) => {
    const el = find(e);
    if (el) show(el);
  });
  document.addEventListener('pointerout', (e) => {
    if (find(e)) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = find(e);
    if (el?.matches(':focus-visible')) show(el);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide);
}
