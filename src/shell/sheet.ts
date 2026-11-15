/**
 * Phones: the layout and the sheet (v2.0, BEGINNER-AND-MOBILE.md section 11). Owner: lane M.
 *
 * The contract (section 13), as built:
 *
 * - `layout()` says which layout the page uses, and `onLayout(fn)` hears it change (resize,
 *   rotation, the on-screen keyboard, the sheet's height). `src/shell/phone.ts` decides it from
 *   the visual viewport and sets `html[data-layout="desktop" | "phone-fit" | "phone-scroll"]` and
 *   the CSS variables `--pic` (the picture's side), `--sheet-h` (the sheet's height) and
 *   `--sheet-top` (where the sheet starts, under the frame) on `<html>`.
 *   - `desktop`: a window at least 700 px wide and 500 px tall. Nothing changes from v1; `pic` and
 *     `sheetH` are 0 and the sheet is not shown (only full-height pages are).
 *   - `phone-fit`: the top row, the frame under it, the sheet under the frame. The picture is
 *     never covered and never under 240 px: `pic` shrinks to make room for the sheet.
 *   - `phone-scroll`: one scrolling column (rotated phones, short windows, 400% zoom). No sheet:
 *     its content sits in the page's flow under the frame and the bar; `sheetH` is 0.
 * - `openSheet(el, { height, label, back })` shows `el` in the sheet (the `#sheet` mount point).
 *   - `height` is `peek` (one line and one button), `half` or `full`. A tap on the grabber steps
 *     up (and from the top back to peek); a drag on the grabber or the Back row moves one step
 *     in its direction. The choice is kept with that content, so Back restores it. The content
 *     marks where its peek part ends with a `[data-peek-end]` element (phone.ts measures it).
 *   - Without `back`, `el` replaces what the sheet showed and the Back history is cleared. With
 *     `back: true` (a place card from the sky, the hint box), the current content, its height
 *     and the control that opened the new content are kept for `back()`.
 *   - `el` is moved into the sheet. When it leaves the sheet for good (replaced, closed or gone
 *     back from), it is put back where it came from, so a mount point such as `#mission` stays
 *     in the page. Content kept for Back stays in the sheet, hidden, so ids still resolve.
 *   - Focus: content opened with `back: true` takes focus (its first heading or control); other
 *     content takes it only when focus was in the sheet before. The sheet is a labelled region.
 * - `openPage(el, { label })` shows a full-height Slate page (Settings, About and Find on phones,
 *   section 11.2) with a Back button. It is modal: the rest of the page is inert. It sits on the
 *   same Back history as the sheet, so `back()` from a page returns to the sheet's content.
 * - `back()` goes one step back and returns focus to the control that opened what was left.
 *   Escape does one Back (order 30) while there is something to go back to; otherwise Escape is
 *   left to the content (a mission card closes itself, as on desktop).
 * - `closeSheet()` empties the sheet and its Back history.
 *
 * The Back history itself is `SheetStack`, a plain class with no DOM, tested in Node.
 */
import { closable, RANK } from './escape.ts';
import { t as tr } from './i18n.ts';

/**
 * The sheet's heights. `peek`: the content's first part only (down to its `[data-peek-end]`
 * element: one line and one button); `half`: up to about half the screen; `full`: up to the top
 * row. Full is offered only while the frame is closed (the globe behind); with the frame open,
 * full is laid out as half.
 */
export type SheetHeight = 'peek' | 'half' | 'full';

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

/** How to open a full-height page. */
export interface PageOptions {
  /** Its title, shown beside Back and read as the page's name ("Settings"). */
  label: string;
}

// ----- The Back history (no DOM) -------------------------------------------------------------

/** One thing the sheet has shown. `T` is the content (an element in the page). */
export interface StackEntry<T, O = unknown> {
  content: T;
  /** `peek` or `half` for sheet content; `page` for a full-height page. */
  height: SheetHeight | 'page';
  label: string;
  /** What had focus when this was opened: focus returns there when it is left. */
  opener: O | null;
}

/**
 * The sheet's Back history (11.2's return rule).
 * - `open` without `back` replaces everything; with `back` it keeps what was there.
 * - `back` leaves the top entry and shows the one under it, at the height it had.
 * - `toggle` switches the top entry between peek and half, and it is remembered there.
 */
export class SheetStack<T, O = unknown> {
  private items: StackEntry<T, O>[] = [];

  /** What is shown now. */
  top(): StackEntry<T, O> | undefined {
    return this.items[this.items.length - 1];
  }

  /** Everything kept, oldest first. */
  all(): readonly StackEntry<T, O>[] {
    return this.items;
  }

  /** True when `back` has somewhere to go: a kept entry under the top, or a page to close. */
  canGoBack(): boolean {
    return this.items.length > 1 || this.top()?.height === 'page';
  }

  /**
   * Opens content.
   * @returns The entries that left for good (replaced without `back`).
   */
  open(entry: StackEntry<T, O>, back: boolean): StackEntry<T, O>[] {
    const gone = back ? [] : this.items.splice(0);
    // The same content opened again moves to the top instead of being kept twice.
    const i = this.items.findIndex((e) => e.content === entry.content);
    if (i >= 0) this.items.splice(i, 1);
    this.items.push(entry);
    return gone.filter((e) => e.content !== entry.content);
  }

  /** Leaves the top entry. @returns It, or undefined when nothing is shown. */
  back(): StackEntry<T, O> | undefined {
    return this.items.pop();
  }

  /**
   * Moves the shown content one height up or down among `levels` (lowest first). Up from the
   * highest goes back to the lowest when `wrap` (a tap on the grabber), else stays (a drag);
   * down from the lowest stays.
   * @returns The new height.
   */
  step(
    dir: 1 | -1,
    levels: readonly SheetHeight[] = ['peek', 'half'],
    wrap = true,
  ): SheetHeight | undefined {
    const t = this.top();
    if (!t || t.height === 'page') return undefined;
    // A height that is not offered now (full while the frame is open) counts as the highest.
    let i = levels.indexOf(t.height);
    if (i < 0) i = levels.length - 1;
    const j = i + dir;
    t.height = j >= levels.length ? levels[wrap ? 0 : levels.length - 1]! : levels[Math.max(0, j)]!;
    return t.height;
  }

  /** Switches the shown content between peek and half. @returns The new height. */
  toggle(): SheetHeight | undefined {
    return this.step(1);
  }

  /** Empties it. @returns Everything that was kept. */
  clear(): StackEntry<T, O>[] {
    return this.items.splice(0);
  }
}

// ----- The sheet in the page -----------------------------------------------------------------

const stack = new SheetStack<HTMLElement, HTMLElement>();
/** Where each element came from, to put it back when it leaves the sheet. */
const homes = new WeakMap<HTMLElement, { parent: Node; next: Node | null }>();
/** Each element's wrapper in the sheet's body. */
const wraps = new WeakMap<HTMLElement, HTMLElement>();
let now: Layout = { kind: 'desktop', pic: 0, sheetH: 0 };
const fns = new Set<(l: Layout) => void>();
const sheetFns = new Set<() => void>();
let unEscape: (() => void) | null = null;
/** Elements made inert while a page is open. */
let inerted: HTMLElement[] = [];

interface Parts {
  root: HTMLElement;
  grab: HTMLButtonElement;
  head: HTMLElement;
  backBtn: HTMLButtonElement;
  title: HTMLElement;
  body: HTMLElement;
}
let parts: Parts | null = null;

function build(): Parts | null {
  if (parts?.root.isConnected) return parts;
  const root = document.getElementById('sheet');
  if (!root) return null;
  root.classList.add('sheet');
  const grab = document.createElement('button');
  grab.type = 'button';
  grab.className = 'sheet-grab';
  grab.dataset.guide = 'sheet-grabber';
  grab.setAttribute('aria-controls', 'sheet-body');
  grab.append(Object.assign(document.createElement('span'), { className: 'sheet-grab-bar' }));
  startDrag(grab);
  const head = document.createElement('div');
  head.className = 'sheet-head';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'sheet-back';
  backBtn.dataset.guide = 'sheet-back';
  backBtn.innerHTML =
    `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" data-icon="back"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${tr('word.back')}</span>`;
  backBtn.addEventListener('click', () => back());
  const title = document.createElement('h2');
  title.className = 'sheet-title';
  title.id = 'sheet-title';
  head.append(backBtn, title);
  startDrag(head);
  const body = document.createElement('div');
  body.className = 'sheet-body';
  body.id = 'sheet-body';
  root.replaceChildren(grab, head, body);
  parts = { root, grab, head, backBtn, title, body };
  return parts;
}

/** The heights a tap or drag moves between now (phone.ts: full only while the frame is closed). */
let levels: readonly SheetHeight[] = ['peek', 'half'];

/** For lane M's phone.ts: which heights the grabber moves between now. */
export function setSheetLevels(l: readonly SheetHeight[]): void {
  levels = l;
}

/** Changes the height of what the sheet shows (a tap, a drag, or content asking for room). */
export function setSheetHeight(h: SheetHeight): void {
  const t = stack.top();
  if (!t || t.height === 'page' || t.height === h) return;
  t.height = h;
  show();
}

/**
 * A tap on the grabber steps up (from the top back to peek). A drag on the grabber or the Back
 * row follows the finger and, once let go, moves one height in its direction; phone.ts animates
 * the sheet from where the finger left it to its new place.
 */
function startDrag(handle: HTMLElement): void {
  let start: { y: number; id: number; t: number } | null = null;
  let dy = 0;
  let dragged = false;
  const root = () => parts?.root;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || layout().kind !== 'phone-fit' || stack.top()?.height === 'page') return;
    if (handle !== parts?.grab && (e.target as Element).closest('button')) return;
    start = { y: e.clientY, id: e.pointerId, t: performance.now() };
    dy = 0;
    dragged = false;
    // Captured at once: the finger leaves the small handle with its first move.
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer cannot be captured.
    }
  });
  handle.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    dy = e.clientY - start.y;
    if (!dragged && Math.abs(dy) < 6) return;
    if (!dragged) {
      dragged = true;
      root()?.setAttribute('data-dragging', '');
    }
    // Past the top it resists (a third of the finger's travel).
    const r = root();
    if (r) r.style.transform = `translateY(${dy < 0 ? dy / 3 : dy}px)`;
  });
  const end = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const fast = Math.abs(dy) / Math.max(1, performance.now() - start.t) > 0.5;
    start = null;
    const r = root();
    r?.removeAttribute('data-dragging');
    if (!dragged) return;
    // The finger's last place stays as the transform; phone.ts animates from it.
    if (Math.abs(dy) > 36 || fast) {
      // Up from the top does not wrap to peek on a drag.
      const before = stack.top()?.height;
      if (stack.step(dy < 0 ? 1 : -1, levels, false) !== before) show();
    }
    dropDrag(r ?? null);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  // A drag is not a tap: only a press without movement steps the height.
  handle.addEventListener('click', (e) => {
    if (dragged) {
      dragged = false;
      e.preventDefault();
      return;
    }
    if (handle === parts?.grab && stack.step(1, levels)) show();
  });
}

/** Lets go of a drag: the sheet glides from the finger back to its (maybe new) place. */
function dropDrag(r: HTMLElement | null): void {
  if (!r || !r.style.transform) return;
  const from = r.style.transform;
  r.style.transform = '';
  for (const fn of [...dropFns]) fn(from);
}
const dropFns = new Set<(from: string) => void>();

/** For lane M's phone.ts: a drag ended at `from` (a transform); animate the sheet from there. */
export function onSheetDrop(fn: (from: string) => void): () => void {
  dropFns.add(fn);
  return () => {
    dropFns.delete(fn);
  };
}

/** Puts an element that left the sheet back where it came from (or just takes it out). */
function release(el: HTMLElement): void {
  const w = wraps.get(el);
  const home = homes.get(el);
  if (home && home.parent.isConnected) {
    const next = home.next && home.next.parentNode === home.parent ? home.next : null;
    home.parent.insertBefore(el, next);
  } else el.remove();
  w?.remove();
  wraps.delete(el);
  homes.delete(el);
}

function wrapFor(el: HTMLElement, body: HTMLElement): HTMLElement {
  let w = wraps.get(el);
  if (!w) {
    if (el.parentNode && !body.contains(el))
      homes.set(el, { parent: el.parentNode, next: el.nextSibling });
    w = document.createElement('div');
    w.className = 'sheet-item';
    w.append(el);
    wraps.set(el, w);
  }
  if (w.parentNode !== body) body.append(w);
  return w;
}

/** Shows the top of the stack, sets the labels, the Escape entry and the inert page. */
function show(): void {
  const p = build();
  if (!p) return;
  const t = stack.top();
  for (const e of stack.all()) {
    const w = wrapFor(e.content, p.body);
    w.hidden = e !== t;
  }
  const page = t?.height === 'page';
  p.root.hidden = !t;
  p.root.dataset.height = t ? t.height : '';
  if (!t) delete p.root.dataset.height;
  // A labelled region; a page is a modal dialog.
  if (page) {
    p.root.setAttribute('role', 'dialog');
    p.root.setAttribute('aria-modal', 'true');
  } else {
    p.root.setAttribute('role', 'region');
    p.root.removeAttribute('aria-modal');
  }
  // A card for the smoke test's overlap check (the frame and the sheet never overlap, MOB-3);
  // a page covers everything on purpose, so it is not one.
  if (t && !page) p.root.dataset.card = 'sheet';
  else delete p.root.dataset.card;
  if (t) p.root.setAttribute('aria-label', t.label);
  else p.root.removeAttribute('aria-label');
  p.title.textContent = page ? t.label : '';
  p.head.hidden = !stack.canGoBack();
  p.backBtn.setAttribute('aria-label', page ? tr('sh.backFrom', { name: t.label }) : tr('word.back'));
  const open = !!t && t.height !== 'peek';
  const top = !!t && levels.indexOf(t.height as SheetHeight) === levels.length - 1;
  p.grab.hidden = !t || page;
  p.grab.setAttribute('aria-expanded', String(open));
  p.grab.setAttribute('aria-label', top ? tr('sh.less') : tr('sh.more'));
  // At peek only the content's first part shows: never a scrolled middle.
  if (t?.height === 'peek') p.body.scrollTop = 0;
  setInert(page);
  // Escape does one Back while there is one to do (order 30). Registered again each time it
  // becomes possible, so it counts as the newest card at its rank.
  if (stack.canGoBack() && !unEscape) unEscape = closable(p.root, RANK.list, () => back());
  else if (!stack.canGoBack() && unEscape) {
    unEscape();
    unEscape = null;
  }
  for (const fn of [...sheetFns]) fn();
}

/** While a page is open, everything else in the page is inert (and so hidden from readers). */
function setInert(on: boolean): void {
  if (!on) {
    for (const el of inerted) el.inert = false;
    inerted = [];
    return;
  }
  if (inerted.length) return;
  const keep = new Set(['sheet', 'toasts', 'tooltip']);
  for (const el of document.body.children) {
    if (!(el instanceof HTMLElement) || keep.has(el.id) || el.tagName === 'SCRIPT') continue;
    if (el instanceof HTMLDialogElement || el.inert) continue;
    el.inert = true;
    inerted.push(el);
  }
}

function focusIn(el: HTMLElement): void {
  const target =
    el.querySelector<HTMLElement>('h1, h2, h3, [autofocus]') ??
    el.querySelector<HTMLElement>('button, a[href], input, select, textarea, [tabindex]');
  if (!target) return;
  if (
    !target.matches('button, a[href], input, select, textarea') &&
    !target.hasAttribute('tabindex')
  )
    target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

function activeOpener(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement
    : null;
}

/**
 * Shows content in the sheet. Without `back`, it replaces what the sheet showed (and clears the
 * Back history); with `back: true`, the current content is kept for `back()`.
 */
export function openSheet(el: HTMLElement, opts: SheetOptions): void {
  const p = build();
  const opener = activeOpener();
  const hadFocus = !!p && !!opener && p.root.contains(opener);
  const gone = stack.open(
    { content: el, height: opts.height, label: opts.label, opener },
    !!opts.back,
  );
  for (const e of gone) release(e.content);
  show();
  if (opts.back || hadFocus) focusIn(el);
}

/**
 * Opens a full-height Slate page with Back (Settings, About, Find on phones). Modal: the rest of
 * the page is inert until Back. Kept on the same Back history as the sheet.
 */
export function openPage(el: HTMLElement, opts: PageOptions): void {
  const opener = activeOpener();
  stack.open({ content: el, height: 'page', label: opts.label, opener }, true);
  show();
  parts?.backBtn.focus({ preventScroll: true });
}

/**
 * One step back: the content opened before, at its height, and focus to the control that opened
 * the content being left. Escape calls it (order 30).
 * @returns False when there was nothing to go back from.
 */
export function back(): boolean {
  if (!stack.canGoBack()) {
    // Only one thing in the sheet: Back has nowhere to go, so it does nothing.
    return false;
  }
  const left = stack.back();
  if (!left) return false;
  release(left.content);
  show();
  const to = left.opener;
  if (to?.isConnected && !to.closest('[inert]')) to.focus({ preventScroll: true });
  else {
    const t = stack.top();
    if (t) focusIn(t.content);
  }
  return true;
}

/** Empties the sheet and its Back history. */
export function closeSheet(): void {
  const p = parts;
  const hadFocus = !!p && !!document.activeElement && p.root.contains(document.activeElement);
  const all = stack.clear();
  for (const e of all) release(e.content);
  show();
  if (hadFocus) all[0]?.opener?.focus({ preventScroll: true });
}

/** What the sheet shows now: its height (`page` for a page), or null when it is empty. */
export function sheetHeight(): SheetHeight | 'page' | null {
  return stack.top()?.height ?? null;
}

/** The element shown in the sheet now, or null. */
export function sheetContent(): HTMLElement | null {
  return stack.top()?.content ?? null;
}

/** For lane M's phone.ts: hear the sheet change (content or height). */
export function onSheet(fn: () => void): () => void {
  sheetFns.add(fn);
  return () => {
    sheetFns.delete(fn);
  };
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
