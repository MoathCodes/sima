/**
 * Lane F's full-height pages on phones (BEGINNER-AND-MOBILE.md 11.2): Settings, About and Find
 * open through lane M's `openPage`, with M's Back. This only adds "tell me when it was left", so
 * each part can tidy up (hide the card, close the dialog) however the page was left: Back,
 * Escape, or something else opened over it. Owner: lane F.
 */
import { back, layout, onSheet, openPage, sheetContent } from './sheet.ts';

/** True when the page uses a phone layout (lane M's `layout()`). */
export function onPhone(): boolean {
  return layout().kind !== 'desktop';
}

/**
 * Opens `el` as a full-height page.
 * @param onLeave Called once, when `el` is no longer in the sheet.
 */
export function phonePage(el: HTMLElement, label: string, onLeave: () => void): void {
  openPage(el, { label });
  const stop = onSheet(() => {
    if (el.closest('#sheet')) return; // shown, or still in the Back history under another page
    stop();
    onLeave();
  });
}

/** Leaves the page `el` (one Back) when it is the one on top. */
export function leavePage(el: HTMLElement): void {
  if (sheetContent() === el) back();
}
