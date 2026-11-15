/**
 * Small helpers shared by Discover's screens: escaping, the few icons Discover adds, the
 * live region, and putting a screen on the page: a panel on desktop, lane M's sheet on phones
 * (BEGINNER-AND-MOBILE.md section 11; `src/shell/sheet.ts`). Owner: lane K.
 */
import { closeSheet, layout, openSheet, sheetContent, type SheetHeight } from '../shell/sheet.ts';
import { icon as shellIcon, type IconName } from '../shell/icons.ts';

/** Escapes text for HTML. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const EXTRA = {
  // Show me: an eye. The keys: a keyboard. Discover: a small sun. Expert: a line chart is the shell's `chart`.
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7.5 14h9"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>',
} as const;

/** An icon: the shell's set, plus the two Discover adds. Decorative (aria-hidden). */
export function icon(name: IconName | keyof typeof EXTRA): string {
  if (name in EXTRA)
    return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${EXTRA[name as keyof typeof EXTRA]}</svg>`;
  return shellIcon(name as IconName);
}

/** True when the page uses lane M's phone layout: then screens go in the sheet. */
export function phone(): boolean {
  return layout().kind !== 'desktop';
}

/** The body each mount shows, so a re-render updates in place instead of re-opening. */
const shown = new WeakMap<HTMLElement, HTMLElement>();

/**
 * Puts `body` on the page: inside `mount` on desktop, or in the sheet on phones.
 * Calling it again with the same body does nothing, so re-renders keep focus and scroll.
 */
export function present(mount: HTMLElement, body: HTMLElement, opts: { height: SheetHeight; label: string }): void {
  if (phone()) {
    mount.hidden = true;
    // The sheet moves the element in, and puts it back when it leaves (shell/sheet.ts).
    if (sheetContent() === body || body.closest('#sheet')) return;
    openSheet(body, opts);
    return;
  }
  if (body.closest('#sheet')) closeSheet();
  if (shown.get(mount) !== body || body.parentElement !== mount) {
    mount.replaceChildren(body);
    shown.set(mount, body);
  }
  mount.setAttribute('aria-label', opts.label);
  mount.hidden = false;
}

/** Takes a screen off the page (its panel, or the sheet when it shows this body). */
export function dismiss(mount: HTMLElement, body: HTMLElement | null): void {
  mount.hidden = true;
  if (body && sheetContent() === body) closeSheet();
}

/** A polite live region (A11Y-2): each message is announced once. */
export function liveRegion(): HTMLElement {
  const el = document.createElement('p');
  el.className = 'dsc-sr';
  el.setAttribute('aria-live', 'polite');
  return el;
}

/** Says `text` once in a live region. */
export function say(region: HTMLElement, text: string): void {
  region.textContent = '';
  // A new text node in a later task, so the same words twice are still announced.
  window.setTimeout(() => (region.textContent = text), 30);
}

const drawn = new WeakMap<HTMLElement, string>();

/**
 * Replaces `body`'s content and keeps keyboard focus on the same control (`data-k`). When that
 * control is gone (it finished the step), focus moves to `fallback` (section 10: focus moves only
 * when it was on the control that finished the step).
 */
export function rerender(body: HTMLElement, html: string, fallback: string): void {
  // Nothing changed: keep the nodes, so a press in progress is never swapped out from under it.
  if (drawn.get(body) === html) return;
  drawn.set(body, html);
  const a = document.activeElement;
  const k = a instanceof HTMLElement && body.contains(a) ? (a.dataset.k ?? null) : null;
  body.innerHTML = html;
  if (!k) return;
  const same = body.querySelector<HTMLElement>(`[data-k="${k}"]`);
  (same ?? body.querySelector<HTMLElement>(fallback))?.focus({ preventScroll: true });
}
