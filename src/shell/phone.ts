/**
 * The phone layout (BEGINNER-AND-MOBILE.md section 11.1). Owner: lane M. The contract that other
 * lanes read is `layout()` / `onLayout()` in `sheet.ts`; this file decides it and applies it.
 *
 * - `decide()` is a pure function of the visual viewport's size, the safe areas and the sheet.
 *   It is the whole rule, tested in Node:
 *   - **desktop** when the space is at least 700 px wide and 500 px tall;
 *   - else **phone-fit** when the picture can be at least 240 px with the sheet at peek:
 *     `pic = min(width − 24, height − fixed − sheet)`, the sheet 120 px at peek, or its content
 *     height up to half the height at half; at half the picture stops at 240 px and the sheet
 *     takes what is left. The sheet always reaches from under the frame to the bottom edge;
 *   - else **phone-scroll**: one column, `pic = min(width − 24, max(240, height − 72))`. Expert on
 *     a phone is always phone-scroll (11.5).
 *   - **Globe first** (redesign): while the frame is closed, Discover on a phone is the globe
 *     with the sheet over its bottom edge (`html[data-phone="globe"]`). The sheet is then peek
 *     (its content down to `[data-peek-end]`), half (its content, up to half the height) or full
 *     (up to the top row). With the frame open (`data-phone="frame"`) the rule above holds, with
 *     the measured peek in place of the spec's 120 px, and full counts as half.
 *   `fixed` is the top row and the frame's parts other than the picture (244 px in the spec);
 *   `startPhone()` measures the real frame when it is shown.
 * - `startPhone()` reads `window.visualViewport` (it leaves out browser bars and the on-screen
 *   keyboard), recomputes on resize, rotation, keyboard and sheet changes, and sets
 *   `html[data-layout]`, `--pic`, `--sheet-h` and `--sheet-top`. In phone-fit, the sheet's top is
 *   set from the frame's real bottom edge, so the picture is never covered (MOB-3).
 */
import {
  onSheet,
  onSheetDrop,
  setLayout,
  setSheetLevels,
  sheetContent,
  sheetHeight,
  type Layout,
  type SheetHeight,
} from './sheet.ts';

/** The numbers of section 11.1, in CSS pixels. */
export const PHONE = {
  /** Narrower than this is a phone. */
  minDesktopW: 700,
  /** Shorter than this is a phone too (a rotated phone, a short window, 400% zoom). */
  minDesktopH: 500,
  /** The top row. */
  topRow: 56,
  /** The top row, the frame's header, controls and date chips, and the gaps. */
  fixed: 244,
  /** The sheet at peek. */
  peek: 120,
  /** The picture's smallest side. */
  picMin: 240,
  /** Page gutters on phones: 12 px each side. */
  sideRoom: 24,
  /** In the scroll layout, the picture leaves this much of the height for the top row. */
  scrollRoom: 72,
  /** The gap between the frame and the sheet. */
  gap: 8,
} as const;

/** Safe-area insets (notches, rounded corners, the home indicator). */
export interface Safe {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutInput {
  /** The visual viewport's width and height, unzoomed. */
  w: number;
  h: number;
  safe?: Safe;
  /** The sheet's height now (null when it is empty: laid out as peek). */
  height?: SheetHeight | 'page' | null;
  /** The sheet content's own height, for half. */
  content?: number;
  /** The top row and frame without the picture; defaults to the spec's 244 px. */
  fixed?: number;
  /** The widest the picture can be inside the frame (the frame's inner width), when known. */
  maxPic?: number;
  /** Expert view: on a phone it is the scroll layout, always (11.5). */
  expert?: boolean;
  /** The frame is open. False: the globe fills the screen and the sheet sits over its bottom. */
  frame?: boolean;
  /** The sheet at peek, measured from its content (`[data-peek-end]`); defaults to 120 px. */
  peek?: number;
}

const NO_SAFE: Safe = { top: 0, right: 0, bottom: 0, left: 0 };

/** Section 11.1's rule. Pure. */
export function decide(input: LayoutInput): Layout {
  const s = input.safe ?? NO_SAFE;
  const w = Math.max(0, input.w - s.left - s.right);
  const h = Math.max(0, input.h - s.top - s.bottom);
  if (w >= PHONE.minDesktopW && h >= PHONE.minDesktopH)
    return { kind: 'desktop', pic: 0, sheetH: 0 };
  const fixed = input.fixed ?? PHONE.fixed;
  const peek = Math.max(input.peek ?? PHONE.peek, 64);
  const maxW = Math.min(w - PHONE.sideRoom, input.maxPic ?? Infinity);
  const atPeek = Math.floor(Math.min(maxW, h - fixed - peek));
  if (input.frame === false && !input.expert) {
    // The globe behind; the picture's side is kept for when the frame opens.
    const room = h - PHONE.topRow - PHONE.gap;
    const want =
      input.height === 'full'
        ? room
        : input.height === 'half'
          ? Math.min(Math.max(input.content ?? 0, peek), Math.round(h / 2))
          : peek;
    return { kind: 'phone-fit', pic: Math.max(0, atPeek), sheetH: Math.floor(Math.min(room, want)) };
  }
  if (atPeek < PHONE.picMin || input.expert) {
    const pic = Math.floor(Math.min(maxW, Math.max(PHONE.picMin, h - PHONE.scrollRoom)));
    return { kind: 'phone-scroll', pic: Math.max(0, pic), sheetH: 0 };
  }
  let pic = atPeek;
  if (input.height === 'half' || input.height === 'full') {
    const want = Math.min(Math.max(input.content ?? 0, peek), h / 2);
    pic = Math.max(PHONE.picMin, Math.floor(Math.min(maxW, h - fixed - want)));
  }
  return { kind: 'phone-fit', pic, sheetH: Math.floor(h - fixed - pic) };
}

// ----- In the page ---------------------------------------------------------------------------

let probe: HTMLElement | null = null;

function safeAreas(): Safe {
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;inset:0 auto auto 0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

/** The visual viewport's size, without pinch zoom (zooming in must not change the layout). */
function viewport(): { w: number; h: number } {
  const vv = window.visualViewport;
  if (!vv) return { w: innerWidth, h: innerHeight };
  return { w: Math.round(vv.width * vv.scale), h: Math.round(vv.height * vv.scale) };
}

const shown = (el: HTMLElement | null): el is HTMLElement =>
  !!el && !el.hidden && el.checkVisibility();

/** The sheet content's own height plus the sheet's grabber, head and padding. */
function contentHeight(): number {
  const sheet = document.getElementById('sheet');
  const el = sheetContent();
  const body = sheet?.querySelector<HTMLElement>('.sheet-body');
  if (!sheet || !el || !body || !shown(sheet)) return 0;
  const cs = getComputedStyle(body);
  const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const chrome = sheet.offsetHeight - body.offsetHeight;
  return chrome + pad + el.offsetHeight;
}

/**
 * The frame as it is: the top row and the frame without its picture (`fixed`), and the widest
 * the picture can be inside it (`maxPic`). Undefined when the frame is not shown.
 */
function frameParts(top: number): { fixed?: number; maxPic?: number } {
  const frame = document.getElementById('frame');
  const pic = document.getElementById('frame-pic');
  if (!shown(frame) || !shown(pic)) return {};
  const cs = getComputedStyle(frame);
  const inner =
    frame.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  return {
    fixed: top + frame.offsetHeight - pic.offsetHeight + PHONE.gap,
    maxPic: Math.floor(inner),
  };
}

const set = (k: string, v: string) => {
  const s = document.documentElement.style;
  if (s.getPropertyValue(k) !== v) s.setProperty(k, v);
};

/**
 * The sheet at peek: its chrome, then its content down to the bottom of `[data-peek-end]`
 * (the content's one line and one button), and a little room under it.
 */
function peekHeight(): number | undefined {
  const sheet = document.getElementById('sheet');
  const el = sheetContent();
  const body = sheet?.querySelector<HTMLElement>('.sheet-body');
  if (!sheet || !el || !body || !shown(sheet)) return undefined;
  const end = el.querySelector<HTMLElement>('[data-peek-end]');
  if (!end || !end.checkVisibility()) return undefined;
  const chrome = body.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
  const pad = parseFloat(getComputedStyle(body).paddingTop) || 0;
  return Math.ceil(chrome + pad + end.getBoundingClientRect().bottom - el.getBoundingClientRect().top + 16);
}

// ----- Motion: the sheet snaps, the frame rises, the picture resizes without a jump ----------

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const DUR = 320;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The next layout comes from the visitor (a sheet change, a drag, the frame opening): animate. */
let animateNext = false;
/** Where a drag let go of the sheet, as a vertical offset from its old place. */
let dropOffset = 0;
let frameWas = false;

type Box = { top: number; left: number; width: number; height: number };
const boxOf = (el: HTMLElement | null): Box | null => {
  if (!el || !shown(el)) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};
const FRAME_PARTS = ['frame-pic', 'frame-play', 'frame-views', 'frame-motion'];

/** Glides `el` from its old box to where it is now (transform only). */
function glide(el: HTMLElement, from: Box | null, scale = false): void {
  const to = boxOf(el);
  if (!from || !to) return;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const s = scale && to.width ? from.width / to.width : 1;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < 0.01) return;
  if (reduced()) return;
  el.animate(
    [
      { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${s})` },
      { transformOrigin: 'top left', transform: 'none' },
    ],
    { duration: DUR, easing: EASE },
  );
}

let last = '';

function apply(): void {
  const root = document.documentElement;
  const safe = safeAreas();
  const { w, h } = viewport();
  const height = sheetHeight();
  const expert = root.dataset.view === 'expert';
  const frameEl = document.getElementById('frame');
  const frameOpen = shown(frameEl);
  const sheetEl = document.getElementById('sheet');
  const motion = animateNext;
  animateNext = false;
  // What is on screen now, to animate from (FLIP).
  const sheetFrom = motion && sheetEl && shown(sheetEl) ? boxOf(sheetEl) : null;
  if (sheetFrom) sheetFrom.top += dropOffset;
  dropOffset = 0;
  const partsFrom =
    motion && frameOpen && frameWas ? FRAME_PARTS.map((id) => boxOf(document.getElementById(id))) : [];
  const opened = frameOpen && !frameWas;
  frameWas = frameOpen;

  const sheetH0 = height === 'page' ? null : height;
  const first = decide({ w, h, safe, height: sheetH0, expert, frame: frameOpen });
  // The frame's real parts (a header on two lines, a task line) decide the fixed part; it is only
  // known once the phone styles apply, so the kind is set first.
  if (root.dataset.layout !== first.kind) root.dataset.layout = first.kind;
  const phoneState = first.kind === 'desktop' ? '' : frameOpen || expert ? 'frame' : 'globe';
  if ((root.dataset.phone ?? '') !== phoneState) {
    if (phoneState) root.dataset.phone = phoneState;
    else delete root.dataset.phone;
  }
  setSheetLevels(phoneState === 'globe' ? ['peek', 'half', 'full'] : ['peek', 'half']);
  const measured = first.kind === 'desktop' ? {} : frameParts(PHONE.topRow);
  const l =
    first.kind === 'desktop'
      ? first
      : decide({
          w,
          h,
          safe,
          height: sheetH0,
          content: contentHeight(),
          peek: peekHeight(),
          expert,
          frame: frameOpen,
          ...(first.kind === 'phone-fit' ? measured : { maxPic: measured.maxPic }),
        });
  if (root.dataset.layout !== l.kind) root.dataset.layout = l.kind;
  set('--pic', l.kind === 'desktop' ? '' : `${l.pic}px`);
  let sheetH = l.sheetH;
  if (l.kind === 'phone-fit') {
    const vh = h - safe.bottom;
    let top = vh - sheetH;
    // With the frame open, the sheet starts under the frame's real bottom edge, never over the
    // picture (MOB-3).
    if (frameOpen && frameEl)
      top = Math.max(top, Math.ceil(frameEl.getBoundingClientRect().bottom) + PHONE.gap);
    sheetH = Math.max(0, Math.floor(vh - top));
    set('--sheet-top', `${top}px`);
    set('--sheet-h', `${sheetH}px`);
  } else {
    set('--sheet-top', '');
    set('--sheet-h', '');
  }
  const key = `${l.kind} ${l.pic} ${sheetH}`;
  if (key !== last) {
    last = key;
    setLayout({ kind: l.kind, pic: l.pic, sheetH });
  }
  if (l.kind === 'desktop') return;
  // Animate from what was on screen to the new layout: transform and opacity only.
  if (sheetEl && sheetFrom) glide(sheetEl, sheetFrom);
  if (partsFrom.length)
    FRAME_PARTS.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) glide(el, partsFrom[i] ?? null, id === 'frame-pic');
    });
  if (opened && frameEl && l.kind === 'phone-fit') {
    frameEl.animate(
      reduced()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'translateY(24px) scale(0.97)' },
            { opacity: 1, transform: 'none' },
          ],
      { duration: reduced() ? 160 : DUR, easing: EASE },
    );
  }
}

let queued = false;
function schedule(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    apply();
  });
}

/** Starts choosing the layout. Called once from main.ts, before the parts that read it. */
export function startPhone(): void {
  const root = document.documentElement;
  if (root.hasAttribute('data-embed')) return; // embeds stack their cards in the page flow
  apply();
  window.visualViewport?.addEventListener('resize', schedule);
  addEventListener('resize', schedule);
  addEventListener('orientationchange', schedule);
  // A change the visitor made (content, height, a drag) animates; a resize does not.
  const moved = () => {
    animateNext = true;
    schedule();
  };
  onSheet(moved);
  onSheetDrop((from) => {
    dropOffset = Number(/translateY\((-?[\d.]+)px\)/.exec(from)?.[1] ?? 0);
    moved();
  });
  // The frame's header wraps, a task line appears, the sheet's content grows: lay out again.
  const ro = new ResizeObserver(schedule);
  const watch = () => {
    for (const id of ['frame', 'frame-head', 'sheet']) {
      const el = document.getElementById(id);
      if (el) ro.observe(el);
    }
    const c = sheetContent();
    if (c) ro.observe(c);
  };
  watch();
  onSheet(watch);
  // The frame opening or closing moves the sheet.
  new MutationObserver(schedule).observe(root, {
    attributes: true,
    attributeFilter: ['data-view'],
  });
  const frame = document.getElementById('frame');
  if (frame) {
    new MutationObserver(moved).observe(frame, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(schedule).observe(frame, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }
}
