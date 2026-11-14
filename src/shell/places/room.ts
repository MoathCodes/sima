/**
 * Keeping the places list and card clear of the other cards (O-P5, smoke test rule: no two
 * visible cards overlap). Owner: lane G.
 *
 * The list and the card open at the left, beside the rail (app.css). The newest thing the user
 * opened wins:
 * - Opening a list or card closes the welcome card, the picture tools or a tip when they are in
 *   the way, by pressing their own close button (the `[data-close]` contract in docs/lanes.md).
 * - If the tools or the welcome card open later over the list, the list closes.
 * - The frame and Measure are never closed: the list gets narrower to stay clear of them (down
 *   to MIN_W), and shorter if the frame sits under it.
 */

/** Cards that give way when a list or card opens over them. */
const YIELD = ['welcome', 'tools', 'tip'];
/** Cards that never give way: the list fits around them. */
const STAY = ['frame', 'measure'];
const GAP = 10;
const MIN_W = 280;

function visible(id: string): HTMLElement | null {
  const e = document.getElementById(id);
  return e && !e.hidden && e.checkVisibility() ? e : null;
}

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Fits a just-opened list or card (`panel`) among the other cards. */
export function makeRoom(panel: HTMLElement): void {
  if (panel.hidden) return;
  panel.style.width = '';
  for (const id of YIELD) {
    const other = visible(id);
    if (other && overlaps(panel.getBoundingClientRect(), other.getBoundingClientRect())) {
      other.querySelector<HTMLElement>('[data-close]')?.click();
    }
  }
  fit(panel);
}

/** Narrows the panel so it ends before any card that stays. */
function fit(panel: HTMLElement): void {
  if (panel.hidden) return;
  panel.style.width = '';
  const mine = panel.getBoundingClientRect();
  let right = mine.right;
  for (const id of STAY) {
    const other = visible(id);
    if (!other) continue;
    const r = other.getBoundingClientRect();
    if (r.top < mine.bottom && r.bottom > mine.top && r.left < right) right = r.left - GAP;
  }
  if (right < mine.right) panel.style.width = `${Math.max(MIN_W, Math.floor(right - mine.left))}px`;
}

/**
 * Watches the other cards while a panel is open: a yielding card that opens over it closes the
 * panel (by `close`); a card that stays and moves makes it fit again.
 */
export function watchRoom(panels: HTMLElement[], close: () => void): void {
  const check = (changed: Element | null) => {
    for (const panel of panels) {
      if (panel.hidden) continue;
      const id = changed?.id ?? '';
      if (YIELD.includes(id)) {
        const other = visible(id);
        if (other && overlaps(panel.getBoundingClientRect(), other.getBoundingClientRect())) {
          close();
          return;
        }
      } else {
        fit(panel);
      }
    }
  };
  new MutationObserver((records) => {
    for (const r of records) check(r.target instanceof Element ? r.target : null);
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  const sizes = new ResizeObserver(() => check(null));
  for (const id of STAY) {
    const e = document.getElementById(id);
    if (e) sizes.observe(e);
  }
  addEventListener('resize', () => check(null));
}
