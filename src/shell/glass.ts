/**
 * Glass or Solid panels (v2.0, DESIGN-v2.md sections 5 and 6). Owner: lane F.
 *
 * The page sets `html[data-glass="glass" | "solid"]`; every glass rule keys off that attribute and
 * no other lane reads the media queries itself. Other lanes read the level with `glassLevel()`
 * and hear changes with `onGlass()`.
 *
 * Who decides, strongest first (DESIGN-v2 section 5):
 * 1. Accessibility: `forced-colors: active` and `prefers-contrast: more` always give Solid.
 * 2. The visitor's own choice in Settings (`sima-panels`).
 * 3. Any of these gives Solid: `embed=1`, no `backdrop-filter` support,
 *    `prefers-reduced-transparency: reduce`, a phone (coarse pointer under 700 px), a software
 *    renderer.
 * 4. Otherwise Glass.
 *
 * This is the spec's cut rule for the governor (BEGINNER-AND-MOBILE.md section 14, step 1, and
 * SPEED.md): no frame-time check. It decides once and never changes by itself during a visit.
 * The decision is a pure function (`decideLevel`, `softwareRenderer`), tested in Node
 * (tests/glass.test.ts).
 */

/** Glass panels, or the opaque fallback. */
export type GlassLevel = 'glass' | 'solid';

/** Why the page shows what it shows. Settings words it. */
export type GlassReason =
  | 'forced-colors'
  | 'contrast'
  | 'choice'
  | 'embed'
  | 'unsupported'
  | 'reduced-transparency'
  | 'phone'
  | 'software'
  | 'default';

/** The browser key for the visitor's own choice (Settings → Panels). */
export const PANELS_KEY = 'sima-panels';

/** What the page knows at start. Every field is a plain fact, so `decideLevel` is pure. */
export interface GlassInputs {
  forcedColors: boolean;
  contrastMore: boolean;
  /** The visitor's choice, if any. */
  choice: GlassLevel | null;
  embed: boolean;
  supported: boolean;
  reducedTransparency: boolean;
  phone: boolean;
  /** The WebGL renderer string, when the browser tells it. */
  renderer: string | null;
}

/** The decision, and why. */
export interface GlassDecision {
  level: GlassLevel;
  reason: GlassReason;
}

/** True for a software renderer's WebGL name (SwiftShader, llvmpipe, "Software"). Pure. */
export function softwareRenderer(renderer: string | null): boolean {
  return !!renderer && /swiftshader|llvmpipe|software/i.test(renderer);
}

/** Glass or Solid at start, and why (DESIGN-v2 section 5's order). Pure. */
export function decideLevel(i: GlassInputs): GlassDecision {
  const solid = (reason: GlassReason): GlassDecision => ({ level: 'solid', reason });
  if (i.forcedColors) return solid('forced-colors');
  if (i.contrastMore) return solid('contrast');
  if (i.choice) return { level: i.choice, reason: 'choice' };
  if (i.embed) return solid('embed');
  if (!i.supported) return solid('unsupported');
  if (i.reducedTransparency) return solid('reduced-transparency');
  if (i.phone) return solid('phone');
  if (softwareRenderer(i.renderer)) return solid('software');
  return { level: 'glass', reason: 'default' };
}

let level: GlassLevel = 'solid';
let reason: GlassReason = 'default';
let inputs: GlassInputs | null = null;
const fns = new Set<(g: GlassLevel) => void>();

/** Glass or Solid, as the page shows it now. */
export function glassLevel(): GlassLevel {
  return level;
}

/** Why the page shows `glassLevel()` (for Settings). */
export function glassReason(): GlassReason {
  return reason;
}

/**
 * Hear changes (the governor, the setting, an accessibility setting turned on).
 * @returns A function that stops listening.
 */
export function onGlass(fn: (g: GlassLevel) => void): () => void {
  fns.add(fn);
  return () => {
    fns.delete(fn);
  };
}

/**
 * The visitor's own choice (Settings → Panels). Remembered in `sima-panels`. It wins over
 * everything except forced colours and more contrast.
 */
export function setPanels(choice: GlassLevel): void {
  write(PANELS_KEY, choice);
  if (!inputs) return;
  inputs = { ...inputs, choice };
  const d = decideLevel(inputs);
  set(d.level, d.reason);
}

/** The visitor's choice, or null when they never chose. */
export function panelsChoice(): GlassLevel | null {
  const v = read(PANELS_KEY);
  return v === 'glass' || v === 'solid' ? v : null;
}

/** Decides the level once and sets `html[data-glass]`. Called once by main.ts, first. */
export function startGlass(): void {
  const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  const supports =
    typeof CSS !== 'undefined' &&
    (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));
  const base: Omit<GlassInputs, 'renderer'> = {
    forcedColors: mq('(forced-colors: active)'),
    contrastMore: mq('(prefers-contrast: more)'),
    choice: panelsChoice(),
    embed: new URLSearchParams(location.search).get('embed') === '1',
    supported: supports,
    reducedTransparency: mq('(prefers-reduced-transparency: reduce)'),
    phone: mq('(pointer: coarse) and (max-width: 699px)'),
  };
  // The renderer is asked only when nothing before it already decided (it costs a context).
  const before = decideLevel({ ...base, renderer: null });
  inputs = { ...base, renderer: before.reason === 'default' ? rendererName() : null };
  const d = decideLevel(inputs);
  set(d.level, d.reason);
  // Accessibility settings turned on mid-visit always win (they are not the governor backing up).
  for (const [q, key] of [
    ['(forced-colors: active)', 'forcedColors'],
    ['(prefers-contrast: more)', 'contrastMore'],
  ] as const) {
    if (typeof matchMedia !== 'function') break;
    matchMedia(q).addEventListener('change', (e) => {
      if (!inputs) return;
      inputs = { ...inputs, [key]: e.matches };
      const next = decideLevel(inputs);
      set(next.level, next.reason);
    });
  }
}

/** The WebGL renderer's name, or null. */
function rendererName(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name || null;
  } catch {
    return null;
  }
}

function set(g: GlassLevel, why: GlassReason): void {
  reason = why;
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

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Blocked storage: nothing remembered.
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the choice lasts for this visit only.
  }
}
