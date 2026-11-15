/**
 * Sliding indicators for every segmented control (lane V, DESIGN.md "Motion").
 *
 * One helper for all of them, so no lane writes its own: `.seg` (frame views, Measure, finds,
 * settings, workspace), the Discover | Expert switch and `.tabs`. It watches the page for a
 * chosen child (aria-pressed, aria-checked or aria-selected = true) and writes that child's box
 * into four custom properties on its container (--pill-t, --pill-r, --pill-b, --pill-l, px from
 * each edge). app.css draws the pill (or the tab underline) as the container's ::before, cut
 * to that box with `clip-path: inset()`, and animates the clip: no layout work, nothing but the
 * one pseudo-element repaints. The chosen child's own fill is turned off while the pill shows.
 *
 * The first placement is instant (`data-pill`), later ones slide (`data-pill-anim`, set a frame
 * later). Under reduced motion app.css drops the transition, so the pill jumps.
 */

const BOX = '.seg, #view-switch, .tabs';
const CHOSEN = ':scope > :is([aria-pressed="true"], [aria-checked="true"], [aria-selected="true"])';

const dirty = new Set<HTMLElement>();
let queued = false;
let resize: ResizeObserver | null = null;
const watched = new WeakSet<HTMLElement>();

function place(box: HTMLElement): void {
  if (!box.isConnected) return;
  const on = box.querySelector<HTMLElement>(CHOSEN);
  const w = box.clientWidth;
  const h = box.clientHeight;
  if (!on || w === 0 || h === 0 || on.offsetParent === null) {
    box.removeAttribute('data-pill-on');
    return;
  }
  // offsetLeft/Top are from the box's padding edge (app.css makes the box positioned), the same
  // box the absolutely placed ::before fills.
  const l = on.offsetLeft;
  const t = on.offsetTop;
  const st = box.style;
  st.setProperty('--pill-l', `${l}px`);
  st.setProperty('--pill-t', `${t}px`);
  st.setProperty('--pill-r', `${Math.max(0, w - l - on.offsetWidth)}px`);
  st.setProperty('--pill-b', `${Math.max(0, h - t - on.offsetHeight)}px`);
  box.setAttribute('data-pill-on', '');
  if (!box.hasAttribute('data-pill')) {
    box.setAttribute('data-pill', '');
    // Slide from the next change on, not into the first place.
    requestAnimationFrame(() => requestAnimationFrame(() => box.setAttribute('data-pill-anim', '')));
  }
}

function flush(): void {
  queued = false;
  for (const box of dirty) place(box);
  dirty.clear();
}

function mark(box: HTMLElement): void {
  if (!watched.has(box)) {
    watched.add(box);
    resize?.observe(box);
  }
  dirty.add(box);
  if (!queued) {
    queued = true;
    requestAnimationFrame(flush);
  }
}

function scan(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches(BOX)) mark(root);
  for (const box of root.querySelectorAll<HTMLElement>(BOX)) mark(box);
}

/** Starts the indicators for every segmented control now on the page and any added later. */
export function startMotion(): void {
  if (typeof ResizeObserver !== 'undefined') {
    resize = new ResizeObserver((entries) => {
      for (const e of entries) mark(e.target as HTMLElement);
    });
  }
  scan(document);
  new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target;
      if (r.type === 'childList') {
        if (t instanceof HTMLElement) {
          const box = t.closest<HTMLElement>(BOX);
          if (box) mark(box);
        }
        for (const n of r.addedNodes) if (n instanceof HTMLElement) scan(n);
      } else if (t instanceof HTMLElement) {
        const box = t.parentElement?.closest<HTMLElement>(BOX);
        if (box) mark(box);
        if (r.attributeName === 'hidden') scan(t);
      }
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-pressed', 'aria-checked', 'aria-selected', 'hidden'],
  });
  // Fonts change the width of every word: measure again once they are in.
  document.fonts?.ready.then(() => scan(document)).catch(() => {});
}
