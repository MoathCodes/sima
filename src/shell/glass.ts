/**
 * Glass or Solid panels (v2.0, DESIGN-v2.md sections 5 and 6). Owner: lane F.
 *
 * The page sets `html[data-glass="glass" | "solid"]`; every glass rule keys off that attribute and
 * no other lane reads the media queries itself. Other lanes read the level with `glassLevel()`
 * and hear changes with `onGlass()`.
 *
 * Step 0 stub: decides once at start from the visitor's setting (`sima-panels`), reduced
 * transparency, `backdrop-filter` support and the phone rule. Lane F adds the governor (section 6),
 * contrast-more and forced colours, and the Settings control. No style uses the attribute yet, so
 * the look does not change.
 */

/** Glass panels, or the opaque fallback. */
export type GlassLevel = 'glass' | 'solid';

/** The browser key for the visitor's own choice (Settings → Panels). */
export const PANELS_KEY = 'sima-panels';

let level: GlassLevel = 'solid';
const fns = new Set<(g: GlassLevel) => void>();

/** Glass or Solid, as the page shows it now. */
export function glassLevel(): GlassLevel {
  return level;
}

/**
 * Hear changes (the governor, the setting).
 * @returns A function that stops listening.
 */
export function onGlass(fn: (g: GlassLevel) => void): () => void {
  fns.add(fn);
  return () => {
    fns.delete(fn);
  };
}

/** Decides the level once and sets `html[data-glass]`. Called once by main.ts. */
export function startGlass(): void {
  set(firstLevel());
}

function firstLevel(): GlassLevel {
  let choice: string | null = null;
  try {
    choice = localStorage.getItem(PANELS_KEY);
  } catch {
    // Blocked storage: no saved choice.
  }
  if (choice === 'glass' || choice === 'solid') return choice;
  const supports =
    typeof CSS !== 'undefined' &&
    (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));
  if (!supports) return 'solid';
  if (matchMedia('(prefers-reduced-transparency: reduce)').matches) return 'solid';
  if (matchMedia('(pointer: coarse) and (max-width: 699px)').matches) return 'solid';
  return 'glass';
}

function set(g: GlassLevel): void {
  const changed = g !== level || document.documentElement.dataset.glass !== g;
  level = g;
  document.documentElement.dataset.glass = g;
  if (!changed) return;
  for (const fn of [...fns]) {
    try {
      fn(g);
    } catch (err) {
      console.error('glass: an onGlass listener failed', err);
    }
  }
}
