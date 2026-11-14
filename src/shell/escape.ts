/**
 * The Escape order (GEN-1): one place that decides what Escape closes. Owner: lane F.
 *
 * Escape closes the topmost open thing, in this order:
 *
 * 1. an open popover (menus, the sky map chooser, search suggestions),
 * 2. an open dialog (Share, About),
 * 3. the open `[data-escape]` element with the highest rank: 50 small cards (the click card,
 *    tips, "Explain the screen"), 30 lists and cards (places list, place card, welcome),
 *    20 the picture tools, 10 Measure.
 *
 * Between two open elements of the same rank, the one opened last closes first.
 *
 * How a lane takes part:
 * - Declare it: give the element `data-escape="<rank>"` (index.html does this for every mount
 *   point) and put `data-close` on the button that closes it. Escape clicks that button, so
 *   closing by key and by mouse run the same code.
 * - Or register it in code with `closable(el, rank, close)`, for an element made at run time or
 *   one whose closing is not a button.
 * - A part that handles Escape itself (a field that clears its text first) calls
 *   `preventDefault()` on the keydown event; the page then does nothing more.
 *
 * Native popovers (`popover="auto"`) and modal dialogs close themselves on Escape. Manual
 * popovers (`popover="manual"`, such as the search suggestions) are closed here.
 *
 * The stacking order on screen is the z-index tokens in app.css (`--z-…`), which follow
 * DESIGN.md: sky, marks, sky notes, frame and rail, bar, top row, popovers, tour, tip, toast.
 */

/** Ranks for `data-escape` and `closable`. Higher closes first. */
export const RANK = {
  /** Small cards: the sky's click card, a tip, "Explain the screen". */
  small: 50,
  /** Lists and cards: the places list, a place card, the welcome card. */
  list: 30,
  /** The picture tools. */
  tools: 20,
  /** The Measure panel. */
  measure: 10,
} as const;

/** Close functions given to `closable`, by element. */
const closers = new Map<HTMLElement, () => void>();
/** When each `[data-escape]` element was last seen to open, for ties in rank. */
const openedAt = new WeakMap<Element, number>();
let clock = 0;

/**
 * Registers an element in the Escape order.
 *
 * @param el The element. It counts as open while it is rendered (not `hidden`, not
 *   `display: none`, not inside a hidden parent).
 * @param rank One of RANK, or a number between them.
 * @param close How to close it. Leave out to click its `[data-close]` button.
 * @returns Remove it from the Escape order again.
 */
export function closable(el: HTMLElement, rank: number, close?: () => void): () => void {
  el.dataset.escape = String(rank);
  if (close) closers.set(el, close);
  if (isOpen(el)) openedAt.set(el, ++clock);
  return () => {
    delete el.dataset.escape;
    closers.delete(el);
  };
}

/**
 * The open `[data-escape]` elements, topmost first: by rank, then the last opened first.
 */
export function openOrder(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-escape]')]
    .filter(isOpen)
    .sort(
      (a, b) =>
        Number(b.dataset.escape) - Number(a.dataset.escape) ||
        (openedAt.get(b) ?? 0) - (openedAt.get(a) ?? 0),
    );
}

/**
 * Closes the topmost open thing, as Escape does. The Escape key itself leaves open popovers and
 * dialogs to the browser (see `nativeOpen`); this function closes them too, for callers such as
 * the guide.
 * @returns True when something was closed.
 */
export function closeTop(): boolean {
  // 1. Manual popovers do not close on Escape by themselves; auto popovers and dialogs do.
  const manual = [...document.querySelectorAll<HTMLElement>('[popover="manual"]')].filter(
    (p) => p.id !== 'tooltip' && p.matches(':popover-open'),
  );
  const last = manual.at(-1);
  if (last) {
    last.hidePopover();
    return true;
  }
  const auto = [
    ...document.querySelectorAll<HTMLElement>('[popover]:not([popover="manual"])'),
  ].filter((p) => p.matches(':popover-open'));
  const pop = auto.at(-1);
  if (pop) {
    pop.hidePopover();
    return true;
  }
  const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (dialog instanceof HTMLDialogElement) {
    dialog.close();
    return true;
  }
  // 2. The topmost card.
  const top = openOrder()[0];
  if (!top) return false;
  const close = closers.get(top);
  if (close) close();
  else top.querySelector<HTMLElement>('[data-close]')?.click();
  return true;
}

/**
 * True while a popover the browser closes on Escape, or a dialog, is open: then the Escape key
 * is left to the browser.
 */
export function nativeOpen(): boolean {
  return !!document.querySelector('dialog[open], [popover]:not([popover="manual"]):popover-open');
}

/**
 * Starts watching which `[data-escape]` elements open, so ties close the newest first.
 * Called once by shell.ts.
 */
export function startEscape(): void {
  const seen = new WeakSet<Element>();
  const scan = () => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-escape]')) {
      const open = isOpen(el);
      if (open && !seen.has(el)) openedAt.set(el, ++clock);
      if (open) seen.add(el);
      else seen.delete(el);
    }
  };
  new MutationObserver(scan).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class', 'data-escape'],
  });
  scan();
}

function isOpen(el: HTMLElement): boolean {
  return !el.hidden && el.checkVisibility();
}
