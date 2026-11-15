/**
 * Small helpers shared by Discover's screens: escaping, the few icons Discover adds, the
 * live region, and putting a screen on the page: a panel on desktop, lane M's sheet on phones
 * (BEGINNER-AND-MOBILE.md section 11; `src/shell/sheet.ts`). Owner: lane K.
 */
import { closeSheet, layout, openSheet, type SheetHeight } from '../shell/sheet.ts';
import { icon as shellIcon, type IconName } from '../shell/icons.ts';

/** Escapes text for HTML. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const EXTRA = {
  // Show me: an eye. Discover: a small sun. Expert: a line chart is the shell's `chart`.
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
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
/** The body now in the sheet, if it is one of ours. */
let inSheet: HTMLElement | null = null;

/**
 * Puts `body` on the page: inside `mount` on desktop, or in the sheet on phones.
 * Calling it again with the same body does nothing, so re-renders keep focus and scroll.
 */
export function present(mount: HTMLElement, body: HTMLElement, opts: { height: SheetHeight; label: string }): void {
  if (phone()) {
    mount.hidden = true;
    if (inSheet === body) return;
    inSheet = body;
    openSheet(body, opts);
    return;
  }
  if (inSheet === body) {
    inSheet = null;
    closeSheet();
  }
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
  if (body && inSheet === body) {
    inSheet = null;
    closeSheet();
  }
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

/** True when the visitor asked for less motion. */
export function lessMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
