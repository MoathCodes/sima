/**
 * Where the cards sit (SPEC 4.1, DESIGN.md "Layout" and "Motion"). Owner: lane F.
 *
 * - The frame hangs from its top right corner, 76 px from the top. The user drags it by its
 *   header and sizes it from its bottom left corner; its box is remembered (`frame-box`, FRM-5).
 *   It never reaches under the bar: when it would, it gets narrower, and at its narrowest its
 *   picture gets smaller.
 * - When Measure opens, the frame glides left (0.42 s) and Measure fades in beside it after the
 *   glide: one movement at a time. When Measure closes, it fades out first and the frame glides
 *   back. With reduced motion the frame does not slide; it fades in at its new place (GEN-5).
 * - The picture tools hang under the chips row, left of the frame.
 * - The chips row gets the room left of the nearest card, as its max-width; lane G hides the
 *   chips that do not fit and offers them in its "More" menu.
 * - The welcome card and the picture tools share the left column: where they would overlap, the
 *   one opened last stays and the other closes. (Lane G's places/room.ts does the same for the
 *   places list and card.)
 *
 * Nothing here runs in embed mode (the cards are in the page flow) or under 700 px (O-W3).
 */
import { layout } from './sheet.ts';
import { keepClear } from '../sky/markers.ts';

/** The frame's box, as remembered. CSS pixels. */
export interface FrameBox {
  /** From the window's right edge to the frame's right edge. */
  right: number;
  /** From the window's top to the frame's top. */
  top: number;
  /** The frame's width; its picture is this minus 20 px, and square. */
  width: number;
}

const KEY = 'frame-box';
const GUTTER = 16;
const FRAME_TOP = 76;
const GAP = 10;
/** Cards keep right of the rail: 16 px gutter, 46 px rail, 10 px gap. */
const RAIL_RIGHT = 72;
/** Cards end this far above the bar. */
const ABOVE_BAR = 14;
const MIN_WIDTH = 300;
/**
 * Narrower than this the frame's lines wrap faster than its picture shrinks, so a frame that is
 * too tall stops getting narrower here and its picture gets smaller instead.
 */
const FIT_MIN = 340;
/** The picture's smallest side when the window is too short for the frame at its narrowest. */
const PIC_MIN = 120;
const TOOLS_WIDTH = 320;
const TOOLS_MIN = 280;
/** The column at the left that holds one card at a time. */
/** Left-column cards that lane G's places/room.ts does not already keep apart. */
const LEFT_COLUMN = ['welcome', 'tools'];

const DEFAULT_BOX: FrameBox = { right: GUTTER, top: FRAME_TOP, width: 500 };

let box: FrameBox = { ...DEFAULT_BOX };
/** The frame's horizontal offset while Measure is open (negative: to the left). */
let shift = 0;
let measureOpen = false;
let moving = false;
const moveFns = new Set<() => void>();

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const off = () => document.documentElement.hasAttribute('data-embed') || layout().kind !== 'desktop';
const byId = (id: string) => document.getElementById(id);

/**
 * Calls `fn` whenever the frame moves or changes size: while it is dragged or sized, at each
 * step of the glide, and once it has settled. For the tether and the tour's ring.
 * @returns Stop listening.
 */
export function onFrameMove(fn: () => void): () => void {
  moveFns.add(fn);
  return () => moveFns.delete(fn);
}

/** Starts placing the cards. Called once by shell.ts. */
export function startLayout(): void {
  const frame = byId('frame');
  if (!frame) return;
  box = readBox();
  measureOpen = isShown(byId('measure'));

  frame.classList.add('placed');
  startDrag(frame);
  startGrip(frame);
  startChips();
  startLeftColumn();

  const toasts = byId('toasts');
  if (toasts) keepClear(toasts);

  // The first placement jumps; later ones glide.
  moving = true;
  place();
  requestAnimationFrame(() => (moving = false));

  new MutationObserver(() => {
    const open = isShown(byId('measure'));
    if (open !== measureOpen) {
      measureOpen = open;
      place({ glide: true, closing: !open });
    } else place();
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', () => place());
  // The frame's contents change height (a task line, the loading line, Measure's explanation).
  // Placed on the next drawn frame, not inside the observer, so a size change made here is not
  // reported back in the same frame (a ResizeObserver loop).
  let queued = false;
  new ResizeObserver(() => {
    if (moving || queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!moving) place();
    });
  }).observe(frame);
  // Between 700 and 900 px the bar wraps onto two rows: cards and toasts keep clear of its real
  // height (--bar-room in app.css), and the frame is placed again above it.
  const bar = byId('bar');
  if (bar) {
    let barH = 0;
    new ResizeObserver(() => {
      if (bar.offsetHeight === barH) return;
      barH = bar.offsetHeight;
      set(document.documentElement, '--bar-room', `${barH}px`);
      place();
    }).observe(bar);
  }
}

/** Puts the frame back where it first was, at its first size, and forgets the user's box. */
export function resetFrame(): void {
  box = { ...DEFAULT_BOX };
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked.
  }
  place();
}

// ----- Placing -------------------------------------------------------------------------------

let placing = false;

/**
 * Places the frame, the frame's "show" button and the picture tools from the remembered box,
 * the window and whether Measure is open.
 */
function place(opts: { glide?: boolean; closing?: boolean } = {}): void {
  const frame = byId('frame');
  if (!frame || placing) return;
  if (off()) {
    for (const k of ['width', 'left', 'top', 'right', 'translate', 'transitionDelay'])
      set(frame, k, '');
    return;
  }
  placing = true;
  try {
    const vw = innerWidth;
    const bottom = barTop() - ABOVE_BAR;

    // Width: the user's, but never past the rail and never under the bar.
    let width = clamp(box.width, MIN_WIDTH, vw - box.right - RAIL_RIGHT);
    set(frame, 'width', `${width}px`);
    set(frame, '--pic-max', '');
    let height = frame.offsetHeight;
    const narrowest = Math.min(width, FIT_MIN);
    for (let i = 0; i < 3 && height > bottom - FRAME_TOP && width > narrowest; i++) {
      width = Math.max(narrowest, width - (height - (bottom - FRAME_TOP)));
      set(frame, 'width', `${width}px`);
      height = frame.offsetHeight;
    }
    // At its narrowest the lines around the picture wrap and grow, so the picture itself gets
    // smaller (still square) until the whole frame is above the bar.
    const pic = byId('frame-pic');
    if (pic && height > bottom - FRAME_TOP) {
      set(frame, '--pic-max', `${Math.max(PIC_MIN, pic.offsetWidth - (height - (bottom - FRAME_TOP)))}px`);
      height = frame.offsetHeight;
    }
    const top = clamp(box.top, FRAME_TOP, bottom - height);
    const right = clamp(vw - box.right, RAIL_RIGHT + width, vw - GUTTER);

    // Measure takes the right; the frame glides left of it.
    const measureLeft = vw - GUTTER - measureWidth();
    const nextShift = measureOpen ? Math.min(0, measureLeft - GAP - right) : 0;
    const glides = opts.glide && nextShift !== shift && !moving;

    set(frame, 'left', `${right - width}px`);
    set(frame, 'top', `${top}px`);
    set(frame, 'right', 'auto');
    set(frame, 'transitionDelay', glides && opts.closing ? 'var(--t-fade)' : '');
    if (frame.hasAttribute('data-moving') !== (moving || !glides)) {
      frame.toggleAttribute('data-moving', moving || !glides);
    }
    if (glides && reduced()) {
      frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'linear' });
    }
    set(frame, 'translate', `${Math.round(nextShift)}px`);
    if (glides && !reduced()) followGlide(frame);
    shift = nextShift;

    placeTools(
      right + nextShift - width,
      right + nextShift,
      measureOpen ? measureLeft : vw - GUTTER,
    );
    placeShowButton(frame, nextShift);
  } finally {
    placing = false;
  }
  for (const fn of moveFns) fn();
}

/** Tells the listeners at every drawn frame while the glide runs, and once at its end. */
function followGlide(frame: HTMLElement): void {
  const end = performance.now() + 900;
  const tick = () => {
    for (const fn of moveFns) fn();
    if (performance.now() < end && frame.getAnimations().length) requestAnimationFrame(tick);
    else for (const fn of moveFns) fn();
  };
  requestAnimationFrame(tick);
}

/** The picture tools: left of the frame if there is room, else right of it. */
function placeTools(frameLeft: number, frameRight: number, limit: number): void {
  const tools = byId('tools');
  if (!tools) return;
  const leftRoom = frameLeft - GAP - RAIL_RIGHT;
  let left: number;
  let width: number;
  if (leftRoom >= TOOLS_MIN) {
    width = Math.min(TOOLS_WIDTH, leftRoom);
    left = frameLeft - GAP - width;
  } else {
    left = frameRight + GAP;
    width = clamp(limit - GAP - left, TOOLS_MIN, TOOLS_WIDTH);
  }
  // On :root, not on the panel: lane E rewrites the panel's own style when it draws.
  const root = document.documentElement;
  set(root, '--tools-left', `${left}px`);
  set(root, '--tools-width', `${width}px`);
}

/** While the frame is hidden, a small card in its place (left of Measure) shows it again (FRM-5). */
function placeShowButton(frame: HTMLElement, shift: number): void {
  const show = byId('frame-show');
  if (!show) return;
  hide(show, !frame.hidden);
  if (!frame.hidden) return;
  set(show, 'top', `${clamp(box.top, FRAME_TOP, innerHeight)}px`);
  set(show, 'right', `${Math.max(GUTTER, box.right - shift)}px`);
}

function measureWidth(): number {
  const m = byId('measure');
  if (m && isShown(m)) return m.getBoundingClientRect().width;
  return clamp(0.4 * innerWidth, 380, 760); // DESIGN.md: clamp(380px, 40vw, 760px)
}

function barTop(): number {
  const bar = byId('bar');
  // Discover hides the bar: the frame may then reach the window's bottom.
  if (bar && getComputedStyle(bar).display === 'none') return innerHeight - GUTTER;
  return bar ? bar.getBoundingClientRect().top : innerHeight - 30 - 84;
}

// ----- Dragging and sizing (FRM-5) -----------------------------------------------------------

/** Drag the frame by its header; buttons and fields in the header keep their clicks. */
function startDrag(frame: HTMLElement): void {
  const head = byId('frame-head');
  if (!head) return;
  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || off()) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('button, a, input, select, textarea, [role="button"], [data-no-drag]')) return;
    const r = frame.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
    head.setPointerCapture(e.pointerId);
    moving = true;
    frame.setAttribute('data-moving', '');
    shift = 0;
    set(frame, 'translate', '0px');
    const move = (ev: PointerEvent) => {
      const width = frame.offsetWidth;
      const maxRight = measureOpen
        ? innerWidth - GUTTER - measureWidth() - GAP
        : innerWidth - GUTTER;
      const left = clamp(start.left + ev.clientX - start.x, RAIL_RIGHT, maxRight - width);
      const top = clamp(
        start.top + ev.clientY - start.y,
        FRAME_TOP,
        barTop() - ABOVE_BAR - frame.offsetHeight,
      );
      box = { ...box, right: innerWidth - left - width, top };
      set(frame, 'left', `${left}px`);
      set(frame, 'top', `${top}px`);
      placeTools(left, left + width, innerWidth - GUTTER);
      for (const fn of moveFns) fn();
    };
    const up = () => {
      head.removeEventListener('pointermove', move);
      moving = false;
      saveBox();
      place();
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up, { once: true });
    head.addEventListener('pointercancel', up, { once: true });
  });
}

/** Size the frame from its bottom left corner; it stays hung from its top right corner. */
function startGrip(frame: HTMLElement): void {
  const grip = byId('frame-grip');
  if (!grip) return;
  grip.innerHTML = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4v6h6M2 10l6-6"/></svg>`;
  grip.title = 'Drag to size the frame. Double-click for its first size.';
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || off()) return;
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, width: frame.offsetWidth };
    moving = true;
    frame.setAttribute('data-moving', '');
    const move = (ev: PointerEvent) => {
      const dx = start.x - ev.clientX;
      const dy = ev.clientY - start.y;
      box = { ...box, width: start.width + (Math.abs(dx) > Math.abs(dy) ? dx : dy) };
      moving = false;
      place();
      moving = true;
      box = { ...box, width: frame.offsetWidth };
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      moving = false;
      saveBox();
      place();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once: true });
    grip.addEventListener('pointercancel', up, { once: true });
  });
  grip.addEventListener('dblclick', resetFrame);
}

function readBox(): FrameBox {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const b = raw as Record<string, unknown>;
      const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
      if (ok(b.right) && ok(b.top) && ok(b.width)) {
        return { right: b.right as number, top: b.top as number, width: b.width as number };
      }
    }
  } catch {
    // Storage can be blocked, or hold something else: use the first box.
  }
  return { ...DEFAULT_BOX };
}

function saveBox(): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        right: Math.round(box.right),
        top: Math.round(box.top),
        width: Math.round(box.width),
      }),
    );
  } catch {
    // Storage can be blocked: the box is kept for this visit only.
  }
}

// ----- The chips row ---------------------------------------------------------------------------

/**
 * The chips row gets the room left of the nearest card in its band (the frame, when Measure
 * pushes it left, or the frame at 1366), as its `max-width`. Lane G hides the chips that do not
 * fit in that room and offers them in its own "More" menu.
 */
function startChips(): void {
  const chips = byId('chips');
  if (!chips) return;
  let queued = false;
  const fit = () => {
    queued = false;
    if (off()) return;
    const row = chips.getBoundingClientRect();
    let right = innerWidth - GUTTER;
    for (const el of document.querySelectorAll<HTMLElement>('[data-card]')) {
      if (el.closest('#top-left') || !el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (r.top < row.bottom && r.bottom > row.top && r.right > row.left) {
        right = Math.min(right, r.left - GAP);
      }
    }
    set(chips, 'maxWidth', `${Math.max(0, Math.floor(right - row.left))}px`);
  };
  const later = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(fit);
    }
  };
  const sizes = new ResizeObserver(later);
  for (const id of ['frame', 'measure', 'tools', 'places-list', 'place-card', 'welcome']) {
    const el = byId(id);
    if (el) sizes.observe(el);
  }
  new MutationObserver((records) => {
    const card = (n: Node) => n instanceof Element && n.matches('[data-card]:not(#top-left *)');
    if (records.some((r) => card(r.target))) later();
  }).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'style'],
  });
  onFrameMove(later);
  // A card that fades out is still in the way until its fade ends.
  document.addEventListener('transitionend', (e) => {
    if (e.target instanceof Element && e.target.matches('[data-card]')) later();
  });
  addEventListener('resize', later);
  void document.fonts?.ready.then(later);
  later();
}

// ----- One card at a time in the left column -------------------------------------------------

function startLeftColumn(): void {
  const cards = LEFT_COLUMN.map(byId).filter((el): el is HTMLElement => el !== null);
  const was = new Map(cards.map((el) => [el, isShown(el)]));
  new MutationObserver(() => {
    if (off()) return;
    for (const el of cards) {
      const now = isShown(el);
      const opened = now && !was.get(el);
      was.set(el, now);
      if (!opened) continue;
      const r = el.getBoundingClientRect();
      for (const other of cards) {
        if (other === el || !isShown(other)) continue;
        const o = other.getBoundingClientRect();
        const overlap =
          r.left < o.right && o.left < r.right && r.top < o.bottom && o.top < r.bottom;
        if (overlap) other.querySelector<HTMLElement>('[data-close]')?.click();
      }
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
}

// ----- Helpers -------------------------------------------------------------------------------

/**
 * Sets one inline style property (camelCase, or a `--custom` property), unless it already holds
 * that value: observers watch the style attribute, and a write that changes nothing would wake
 * them again. Pixel values are rounded so they read back as written.
 */
function set(el: HTMLElement, prop: string, value: string): void {
  const v = value.replace(/-?\d+\.\d+px/g, (n) => `${Math.round(parseFloat(n))}px`);
  if (prop.startsWith('--')) {
    if (el.style.getPropertyValue(prop) !== v) el.style.setProperty(prop, v);
    return;
  }
  const style = el.style as unknown as Record<string, string>;
  if (style[prop] !== v) style[prop] = v;
}

/** Sets `hidden`, unless it already has that value. */
function hide(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

function isShown(el: HTMLElement | null): boolean {
  return !!el && !el.hidden && el.checkVisibility();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
