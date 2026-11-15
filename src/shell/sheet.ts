/**
 * Phones: the layout and the sheet (v2.0, BEGINNER-AND-MOBILE.md section 11). Owner: lane M.
 *
 * - `layout()` says which layout the page uses: `desktop`, `phone-fit` (the picture above a Slate
 *   sheet) or `phone-scroll` (one scrolling column, no sheet), with the picture side and the
 *   sheet height in CSS pixels. Lane M sets `html[data-layout]` and `--pic`, `--sheet-h` from it.
 * - The sheet has two heights, peek and half. It is never glass and never over the picture.
 * - The Back rule (11.2): opening secondary content with `back: true` saves what the sheet showed,
 *   its height and the control that opened it; `back()` restores them and returns focus.
 *
 * Step 0 stub: the layout is always `desktop` and the sheet keeps its stack in memory inside the
 * hidden `#sheet` mount point. Lane M builds the layouts, the grabber and the styles
 * (`src/styles/sheet.css`). Lane M's phone layout code goes in `src/shell/phone.ts`, because
 * `src/shell/layout.ts` is lane F's desktop card placement.
 */

/** The sheet's two heights (no drag and no full height in v2.0). */
export type SheetHeight = 'peek' | 'half';

/** The page's layout, chosen by the visual viewport (11.1). */
export type LayoutKind = 'desktop' | 'phone-fit' | 'phone-scroll';

/** The layout now. `pic` and `sheetH` are CSS pixels; 0 when they do not apply (desktop). */
export interface Layout {
  kind: LayoutKind;
  /** The picture's side. */
  pic: number;
  /** The sheet's height; 0 without a sheet. */
  sheetH: number;
}

/** How to open content in the sheet. */
export interface SheetOptions {
  height: SheetHeight;
  /** Its accessible name ("Mission: the runaway"). */
  label: string;
  /** Secondary content (a place card, the hint): save the current content for `back()`. */
  back?: boolean;
}

interface Entry {
  el: HTMLElement;
  opts: SheetOptions;
  opener: HTMLElement | null;
}

const stack: Entry[] = [];
let now: Layout = { kind: 'desktop', pic: 0, sheetH: 0 };
const fns = new Set<(l: Layout) => void>();

function mount(): HTMLElement | null {
  return document.getElementById('sheet');
}

function show(e: Entry | undefined): void {
  const m = mount();
  if (!m) return;
  m.replaceChildren(...(e ? [e.el] : []));
  if (e) {
    m.setAttribute('aria-label', e.opts.label);
    m.dataset.height = e.opts.height;
  } else {
    m.removeAttribute('aria-label');
    delete m.dataset.height;
  }
}

/**
 * Shows content in the sheet. Without `back`, it replaces what the sheet showed (and clears the
 * Back history); with `back: true`, the current content is kept for `back()`.
 */
export function openSheet(el: HTMLElement, opts: SheetOptions): void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!opts.back) stack.length = 0;
  stack.push({ el, opts, opener });
  show(stack[stack.length - 1]);
}

/**
 * One step back: the content opened before, at its height, and focus to the control that opened
 * the content being left. Escape calls it (order 30).
 * @returns False when there was nothing to go back from.
 */
export function back(): boolean {
  const left = stack.pop();
  if (!left) return false;
  show(stack[stack.length - 1]);
  left.opener?.focus();
  return true;
}

/** Empties the sheet and its Back history. */
export function closeSheet(): void {
  stack.length = 0;
  show(undefined);
}

/** The layout now. */
export function layout(): Layout {
  return { ...now };
}

/**
 * Hear layout changes (resize, rotation, the on-screen keyboard).
 * @returns A function that stops listening.
 */
export function onLayout(fn: (l: Layout) => void): () => void {
  fns.add(fn);
  return () => {
    fns.delete(fn);
  };
}

/** For lane M: sets the layout and tells listeners. */
export function setLayout(l: Layout): void {
  if (l.kind === now.kind && l.pic === now.pic && l.sheetH === now.sheetH) return;
  now = { ...l };
  for (const fn of [...fns]) {
    try {
      fn(layout());
    } catch (err) {
      console.error('sheet: an onLayout listener failed', err);
    }
  }
}
