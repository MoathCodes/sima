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
 *   `fixed` is the top row and the frame's parts other than the picture (244 px in the spec);
 *   `startPhone()` measures the real frame when it is shown.
 * - `startPhone()` reads `window.visualViewport` (it leaves out browser bars and the on-screen
 *   keyboard), recomputes on resize, rotation, keyboard and sheet changes, and sets
 *   `html[data-layout]`, `--pic`, `--sheet-h` and `--sheet-top`. In phone-fit, the sheet's top is
 *   set from the frame's real bottom edge, so the picture is never covered (MOB-3).
 */
import {
  onSheet,
  setLayout,
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
  const maxW = Math.min(w - PHONE.sideRoom, input.maxPic ?? Infinity);
  const atPeek = Math.floor(Math.min(maxW, h - fixed - PHONE.peek));
  if (atPeek < PHONE.picMin || input.expert) {
    const pic = Math.floor(Math.min(maxW, Math.max(PHONE.picMin, h - PHONE.scrollRoom)));
    return { kind: 'phone-scroll', pic: Math.max(0, pic), sheetH: 0 };
  }
  let pic = atPeek;
  if (input.height === 'half') {
    const want = Math.min(Math.max(input.content ?? 0, PHONE.peek), h / 2);
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

let last = '';

function apply(): void {
  const root = document.documentElement;
  const safe = safeAreas();
  const { w, h } = viewport();
  const height = sheetHeight();
  const expert = root.dataset.view === 'expert';
  const first = decide({ w, h, safe, height: height === 'page' ? null : height, expert });
  // The frame's real parts (a header on two lines, a task line) decide the fixed part; it is only
  // known once the phone styles apply, so the kind is set first.
  if (root.dataset.layout !== first.kind) root.dataset.layout = first.kind;
  const measured = first.kind === 'desktop' ? {} : frameParts(PHONE.topRow);
  const l =
    first.kind === 'desktop'
      ? first
      : decide({
          w,
          h,
          safe,
          height: height === 'page' ? null : height,
          content: contentHeight(),
          expert,
          ...(first.kind === 'phone-fit' ? measured : { maxPic: measured.maxPic }),
        });
  if (root.dataset.layout !== l.kind) root.dataset.layout = l.kind;
  set('--pic', l.kind === 'desktop' ? '' : `${l.pic}px`);
  let sheetH = l.sheetH;
  if (l.kind === 'phone-fit') {
    // The sheet starts under the frame's real bottom edge, never over the picture.
    const frame = document.getElementById('frame');
    const vh = h - safe.bottom;
    let top = vh - sheetH;
    if (shown(frame))
      top = Math.max(top, Math.ceil(frame.getBoundingClientRect().bottom) + PHONE.gap);
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
  onSheet(schedule);
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
  if (frame)
    new MutationObserver(schedule).observe(frame, {
      attributes: true,
      attributeFilter: ['hidden', 'class', 'style'],
    });
}
