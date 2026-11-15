/**
 * The shell: the cards on the sky and where they sit. The wordmark, the top-right actions
 * (Guide, Places, Share, About), the map's tool rail and its chooser, the frame's place on the
 * screen, the sky's loading card, the tooltip, page-wide keys and the Escape order (GEN-1).
 * Owner: lane F.
 *
 * The functions exported here are the contract in SPEC 8.4; other lanes call only these.
 * Placement, dragging and the glide are in layout.ts; the Escape order is in escape.ts.
 */
import { emit } from './bus.ts';
import { icon } from './icons.ts';
import { t } from './i18n.ts';
import { closeTop, nativeOpen, startEscape } from './escape.ts';
import { phonePage } from './pages.ts';
import { onView } from './view.ts';
import { startLayout } from './layout.ts';
import { camera, flyTo, grid, retry, setLayer, type SkyLayer } from '../sky/sky.ts';
import { openShare, startShare } from '../viewer/share.ts';
import { openAbout, startAbout } from '../page/about.ts';
import { startSettings } from './settings.ts';
import { startMotion } from './motion.ts';

export { onFrameMove } from './layout.ts';
export { toast } from './toast.ts';

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
  /** The sky's width to fly to, degrees ("Zoom to it"'s), so a big place does not open as fog. */
  skyFov?: number;
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
  /** Why the sharp map is slow, when the sky can tell (O-I15). Replaces the "meanwhile" line. */
  why?: string;
}

/**
 * Fills the shell's cards and starts the keys. Called once by main.ts.
 */
export function startShell(): void {
  startMotion();
  fill(
    'wordmark',
    `<span lang="ar" dir="rtl" class="wordmark-ar">سيما</span><span class="wordmark-latin">Sima</span>`,
  );
  document.getElementById('wordmark')?.setAttribute('aria-label', 'Sima');

  fill(
    'actions',
    `
    <button class="btn quiet" popovertarget="guide-menu" data-guide="guide-button" data-expert-only>${icon('compass')}<span class="action-word">${t('top.guide')}</span></button>
    <button class="btn quiet" popovertarget="places-menu" data-guide="places-button" data-expert-only>${icon('pin')}<span class="action-word">${t('top.places')}</span></button>
    <button class="icon-btn" data-open="share" aria-label="${t('word.share')}" data-tip="${t('top.shareTip')}" data-guide="share-button" data-expert-only>${icon('share')}</button>
    <button class="icon-btn" data-open="settings" aria-label="${t('word.settings')}" aria-expanded="false" aria-controls="settings" data-tip="${t('word.settings')}" data-guide="settings-button">${icon('settings')}</button>
    <button class="icon-btn" data-open="about" aria-label="${t('about.title')}" data-tip="${t('about.title')}" data-guide="about-button">${icon('info')}</button>
    <button class="icon-btn phone-menu-btn" popovertarget="phone-menu" aria-label="${t('top.menu')}" data-guide="phone-menu">${icon('menu')}</button>`,
  );

  fill(
    'rail',
    `
    <button class="icon-btn" data-zoom="0.5" aria-label="${t('rail.zoomInLabel')}" data-tip="${t('rail.zoomIn')}" data-tip-pos="right" data-guide="zoom-in">${icon('plus')}</button>
    <button class="icon-btn" data-zoom="2" aria-label="${t('rail.zoomOutLabel')}" data-tip="${t('rail.zoomOut')}" data-tip-pos="right" data-guide="zoom-out">${icon('minus')}</button>
    <hr class="rail-rule">
    <button class="icon-btn" popovertarget="sky-layers" aria-label="${t('rail.skyMap')}" data-tip="${t('rail.skyMap')}" data-tip-pos="right" data-guide="sky-map-button">${icon('layers')}</button>
    <button class="icon-btn" data-grid aria-pressed="false" aria-label="${t('rail.grid')}" data-tip="${t('rail.grid')}" data-tip-pos="right" data-guide="grid-button">${icon('globe')}</button>
    <hr class="rail-rule">
    <button class="icon-btn" popovertarget="workspace" aria-label="${t('rail.framesLabel')}" data-tip="${t('rail.frames')}" data-tip-pos="right" data-guide="workspace-button">${icon('add-frame')}</button>`,
  );

  fill(
    'sky-layers',
    `
    <p class="group-label layers-label">Sky map</p>
    <div role="radiogroup" aria-label="Sky map">
      ${layerItem('spherex', 'SPHEREx', 'At the wavelength on the bar', true)}
      ${layerItem('wise-w1', 'AllWISE 3.4 µm', 'The WISE all-sky map, band W1', false)}
      ${layerItem('wise-w2', 'AllWISE 4.6 µm', 'The WISE all-sky map, band W2', false)}
    </div>`,
  );

  fill(
    'phone-menu',
    `
    <button class="menu-item" data-find data-guide="phone-find">${icon('search')}Find</button>
    <button class="menu-item" data-open="settings" data-guide="phone-settings">${icon('settings')}Settings</button>
    <button class="menu-item" data-open="share" data-guide="phone-share">${icon('share')}Share</button>
    <button class="menu-item" data-open="about" data-guide="phone-about">${icon('info')}About</button>`,
  );
  startFind();

  fill(
    'frame-show',
    `<button class="btn quiet" data-show-frame data-guide="frame-show">${icon('flip')}Show the frame</button>`,
  );

  startShare();
  startAbout();
  startSettings();
  startEscape();
  startLayout();
  startPopovers();
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  // A trackpad pinch arrives as a wheel with Ctrl held. Over the sky it zooms the sky (sky.ts);
  // over a card it would zoom the whole page, so there it does nothing (the page never moves).
  document.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });
  startTooltips();
  const loading = document.getElementById('sky-loading');
  if (loading) {
    placeLoading(loading);
    addEventListener('resize', () => placeLoading(loading));
    onView(() => placeLoading(loading)); // Discover's top-right card is shorter
  }
}

/**
 * The frame card's box on screen, for the tether, the tour ring and placement.
 * @returns CSS pixels, or null while the frame is hidden.
 */
export function frameRect(): DOMRect | null {
  const frame = document.getElementById('frame');
  if (!frame?.checkVisibility()) return null; // offsetParent is always null for a fixed card
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
  emit('aim', { ra: place.ra, dec: place.dec, fov: place.fov, target: place.target ?? null, name: place.name });
  if (opts.fly !== false) flyTo({ ra: place.ra, dec: place.dec, fov: place.skyFov });
}

/**
 * Hides or shows the frame (FRM-5). The patch stays on the sky. While the frame is hidden, a
 * small "Show the frame" card sits in its place.
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

// ----- The sky's loading card (GEN-4) ----------------------------------------------------------

/** What the card shows now, so its percentage never goes back. */
let sky = { layer: '', pct: 0, timer: 0, firstDone: false };

/**
 * The sky map reports its loading. The card at the top centre says what is loading, how far it
 * is, and that the rest of the page works meanwhile. It appears only if the wait lasts 0.3 s,
 * except for the very first map of the visit, whose card is on screen from the first paint.
 * Failed tiles show Retry (SKY-7). When done, the card fades out keeping its words.
 */
export function skyReady(load: SkyLoad): void {
  const card = document.getElementById('sky-loading');
  if (!card) return;
  const done = load.total > 0 && load.loaded >= load.total && load.failed === 0;
  if (load.layer !== sky.layer) sky = { ...sky, layer: load.layer, pct: 0 };
  if (done) {
    clearTimeout(sky.timer);
    sky.timer = 0;
    sky.pct = 0;
    if (!load.first) sky.firstDone = true;
    if (!card.hidden) {
      // Say it is done, then fade out with those words.
      setCard(card, load, 100);
      card.hidden = true;
    }
    return;
  }
  const pct =
    load.total > 0 ? Math.floor((100 * Math.min(load.loaded, load.total)) / load.total) : 0;
  sky.pct = Math.max(sky.pct, pct);
  setCard(card, load, sky.pct);
  placeLoading(card);
  if (!card.hidden || sky.timer) return;
  // Placed again once shown: only then does it have a height to fit (placeLoading).
  if (load.first && !sky.firstDone) {
    card.hidden = false;
    placeLoading(card);
  } else {
    sky.timer = window.setTimeout(() => {
      sky.timer = 0;
      card.hidden = false;
      placeLoading(card);
    }, 300);
  }
}

/**
 * The loading card sits in the top row's free gap, between the search field and the actions,
 * as wide as that gap allows (UX audit #9: at 1280 px a fixed width cut its words, at 1024 it
 * sat on the search field), centred on the row's middle line: in a narrow gap its words wrap to
 * three lines, which hung from the row's top reach past the 76 px line where the frame and
 * Measure hang. When its words wrap so far that, even centred, it reaches that line, it hangs
 * under the search field instead, left of the frame, and the chips row gives way to it
 * (layout.ts). While hidden it has no height: skyReady places it again once shown.
 */
function placeLoading(card: HTMLElement): void {
  const search = document.getElementById('search')?.getBoundingClientRect();
  const actions = document.getElementById('actions')?.getBoundingClientRect();
  if (!search || !actions || !search.width || !actions.width) return;
  const left = search.right + 10;
  const right = actions.left - 10;
  const room = right - left;
  const middle = (search.top + search.bottom) / 2;
  if (room > 0) {
    const w = Math.min(320, room);
    card.style.left = `${Math.round(left + (room - w) / 2)}px`;
    card.style.top = `${Math.round(middle)}px`;
    card.style.transform = 'translateY(-50%)';
    card.style.width = `${Math.round(w)}px`;
  }
  if (room <= 0 || middle + card.offsetHeight / 2 > 76) {
    card.style.transform = '';
    const frame = frameRect();
    const end = frame ? Math.min(search.right, frame.left - 10) : search.right;
    const w = Math.min(320, end - search.left);
    card.style.left = `${Math.round(end - w)}px`;
    card.style.top = `${Math.round(search.bottom + 8)}px`;
    card.style.width = `${Math.round(w)}px`;
  }
}

function setCard(card: HTMLElement, load: SkyLoad, pct: number): void {
  const name = load.layer ?? '';
  const failed = load.failed > 0 && load.loaded + load.failed >= load.total;
  const head = failed
    ? t(name ? 'load.failed' : 'load.failedMap', { name })
    : pct >= 100
      ? t(name ? 'load.done' : 'load.doneMap', { name })
      : `${t(name ? 'load.loading' : 'load.loadingMap', { name })} · ${pct}%`;
  const meanwhile = failed
    ? t('load.rest')
    : load.why
      ? load.why
      : load.first
        ? t('load.meanwhile')
        : t('load.keepWorking');
  card.innerHTML = `
    <p class="sky-loading-head"></p>
    <p class="sky-loading-line"></p>
    ${failed ? `<button class="btn text" data-retry>${t('load.retry')}</button>` : ''}
    <span class="sky-loading-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>`;
  card.querySelector('.sky-loading-head')!.textContent = head;
  card.querySelector('.sky-loading-line')!.textContent = meanwhile;
  card.querySelector('[data-retry]')?.addEventListener('click', retry);
}

// ----- Find on phones (BEGINNER-AND-MOBILE.md 11.2, 11.3) ---------------------------------------

/**
 * In a phone layout the search field lives behind the menu's Find: lane M's full-height page with
 * Back, the field at its top and the suggestions under it. Back puts the field back home.
 */
function startFind(): void {
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-find]')) return;
    const search = document.getElementById('search');
    if (!search) return;
    document.getElementById('phone-menu')?.hidePopover();
    phonePage(search, 'Find a star or RA Dec', () => {
      document.getElementById('search-results')?.hidePopover();
    });
    search.querySelector<HTMLInputElement>('input')?.focus();
  });
}

// ----- Clicks, keys, popovers and tooltips ------------------------------------------------------

function layerItem(layer: SkyLayer, name: string, line: string, on: boolean): string {
  return `<button class="menu-item layer-item" role="radio" aria-checked="${on}" data-layer="${layer}" data-guide="sky-map-${layer}">
    <span class="layer-ring" aria-hidden="true"></span><span><span>${name}</span><span class="line">${line}</span></span></button>`;
}

function fill(id: string, html: string): void {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function onClick(e: MouseEvent): void {
  const el = e.target instanceof Element ? e.target : null;
  if (!el) return;
  const zoom = el.closest<HTMLElement>('[data-zoom]');
  if (zoom) flyTo({ fov: camera().fov * Number(zoom.dataset.zoom) });
  const gridBtn = el.closest<HTMLElement>('[data-grid]');
  if (gridBtn) gridBtn.setAttribute('aria-pressed', String(grid(!grid())));
  const layer = el.closest<HTMLElement>('[data-layer]');
  if (layer) {
    setLayer(layer.dataset.layer as SkyLayer);
    for (const item of document.querySelectorAll('#sky-layers [data-layer]')) {
      item.setAttribute('aria-checked', String(item === layer));
    }
    document.getElementById('sky-layers')?.hidePopover();
  }
  const open = el.closest<HTMLElement>('[data-open]');
  if (open?.closest('#phone-menu')) document.getElementById('phone-menu')?.hidePopover();
  if (open?.dataset.open === 'share') openShare();
  if (open?.dataset.open === 'about') openAbout();
  if (el.closest('[data-show-frame]')) hideFrame(false);
}

/**
 * Page-wide keys that belong to the shell: `/` goes to search, `+` and `−` zoom the sky, and
 * Escape closes the topmost open thing (escape.ts). Space and the arrows belong to the bar
 * (lane D). Not while typing; `/` and the zoom keys not in a dialog either. A part that handled
 * the key already calls `preventDefault()`.
 */
function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return;
  if (e.key === 'Escape') {
    // Open popovers and dialogs close themselves on Escape; the rest close here.
    if (!nativeOpen() && closeTop()) e.preventDefault();
    return;
  }
  const t = e.target instanceof HTMLElement ? e.target : null;
  const typing = t?.closest('input, textarea, select, [contenteditable="true"]');
  if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) {
    return;
  }
  if (e.key === '/') {
    e.preventDefault();
    document.querySelector<HTMLInputElement>('#search input')?.focus();
  } else if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '−') {
    e.preventDefault();
    flyTo({ fov: camera().fov * (e.key === '-' || e.key === '−' ? 2 : 0.5) });
  }
}

/**
 * Popovers opened from the shell's buttons hang next to their button: the menus under the top
 * right card (right-aligned with it), the sky map chooser to the right of the rail.
 */
function startPopovers(): void {
  const under = (id: string, anchor: () => DOMRect | undefined, align: 'left' | 'right') => {
    const pop = document.getElementById(id);
    pop?.addEventListener('beforetoggle', (e) => {
      if ((e as ToggleEvent).newState !== 'open') return;
      const r = anchor();
      if (!r) return;
      pop.style.top = `${r.bottom + 6}px`;
      if (align === 'right') {
        pop.style.right = `${innerWidth - r.right}px`;
        pop.style.left = 'auto';
      } else {
        pop.style.left = `${r.left}px`;
        pop.style.right = 'auto';
      }
    });
  };
  const actions = () => document.getElementById('actions')?.getBoundingClientRect();
  under('places-menu', actions, 'right');
  under('guide-menu', actions, 'right');
  under('phone-menu', () => document.querySelector('[data-guide="phone-menu"]')?.getBoundingClientRect(), 'right');
  const layers = document.getElementById('sky-layers');
  layers?.addEventListener('beforetoggle', (e) => {
    if ((e as ToggleEvent).newState !== 'open') return;
    const btn = document.querySelector('[data-guide="sky-map-button"]')?.getBoundingClientRect();
    const rail = document.getElementById('rail')?.getBoundingClientRect();
    if (!btn || !rail) return;
    layers.style.left = `${rail.right + 8}px`;
    layers.style.top = `${btn.top - 5}px`;
  });
  // Menu buttons look pressed while their popover is open.
  for (const btn of document.querySelectorAll<HTMLElement>('[popovertarget]')) {
    const pop = document.getElementById(btn.getAttribute('popovertarget') ?? '');
    pop?.addEventListener('toggle', (e) => {
      btn.setAttribute('aria-expanded', String((e as ToggleEvent).newState === 'open'));
    });
  }
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
      // A control whose menu or card is open says nothing: its tip would cover what it opened.
      if (!el.isConnected || !el.dataset.tip || el.getAttribute('aria-expanded') === 'true') return;
      tip.textContent = el.dataset.tip;
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
}
