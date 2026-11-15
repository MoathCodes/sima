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
 *    `prefers-reduced-transparency: reduce`, a phone (coarse pointer under 700 px), an earlier
 *    visit's slow result (`sima-panels-auto`), a software renderer.
 * 4. Otherwise Glass, and the governor times the first 1.5 s of glass over the sky once. If the
 *    sky was slow it turns Solid for the rest of the visit and remembers it for this browser. It
 *    never turns Glass back on by itself (GLS-8).
 *
 * The decisions are pure functions (`decideLevel`, `judgeFrames`, `softwareRenderer`), tested in
 * Node (tests/glass.test.ts).
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
  | 'slow'
  | 'software'
  | 'default';

/** The browser key for the visitor's own choice (Settings → Panels). */
export const PANELS_KEY = 'sima-panels';
/** The browser key for the governor's result: `solid` when the sky was slow with glass on. */
export const PANELS_AUTO_KEY = 'sima-panels-auto';

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
  /** An earlier visit found the sky slow with glass on. */
  slowBefore: boolean;
  /** The WebGL renderer string, when the browser tells it. */
  renderer: string | null;
}

/** The decision before any timing. `time` is true when the governor should time the sky. */
export interface GlassDecision {
  level: GlassLevel;
  reason: GlassReason;
  time: boolean;
}

/** True for a software renderer's WebGL name (SwiftShader, llvmpipe, "Software"). Pure. */
export function softwareRenderer(renderer: string | null): boolean {
  return !!renderer && /swiftshader|llvmpipe|software/i.test(renderer);
}

/** Glass or Solid at start, and why (DESIGN-v2 section 5's order). Pure. */
export function decideLevel(i: GlassInputs): GlassDecision {
  const solid = (reason: GlassReason): GlassDecision => ({ level: 'solid', reason, time: false });
  if (i.forcedColors) return solid('forced-colors');
  if (i.contrastMore) return solid('contrast');
  if (i.choice) return { level: i.choice, reason: 'choice', time: false };
  if (i.embed) return solid('embed');
  if (!i.supported) return solid('unsupported');
  if (i.reducedTransparency) return solid('reduced-transparency');
  if (i.phone) return solid('phone');
  if (i.slowBefore) return solid('slow');
  if (softwareRenderer(i.renderer)) return solid('software');
  return { level: 'glass', reason: 'default', time: true };
}

/** How long the governor watches, in ms of visible frames. */
export const WATCH_MS = 1500;
/** A frame is dropped when its gap is over this many times the display's pace. */
const DROP_FACTOR = 1.5;
/** Solid when more than this share of frames dropped. */
const DROP_SHARE = 0.25;
/** … or when this many gaps were over 50 ms. */
const STALL_MS = 50;
const STALLS = 2;
/** Gaps over this are a hidden tab or a resume, not a slow frame: ignored. */
const PAUSE_MS = 400;

/**
 * Judges frame gaps (ms between animation frames) against the display's own pace: the shortest
 * gap seen. Solid if more than 25% of frames dropped (gap > 1.5 × pace), or if two gaps were over
 * 50 ms. Gaps over 400 ms (a hidden tab, a resume) are ignored. Pure.
 * @returns 'solid' or 'glass'; 'glass' too when there are under 10 gaps to judge.
 */
export function judgeFrames(gaps: readonly number[]): GlassLevel {
  const seen = gaps.filter((g) => Number.isFinite(g) && g > 0 && g < PAUSE_MS);
  if (seen.length < 10) return 'glass';
  const pace = Math.min(...seen);
  const dropped = seen.filter((g) => g > DROP_FACTOR * pace).length;
  const stalls = seen.filter((g) => g > STALL_MS).length;
  return dropped / seen.length > DROP_SHARE || stalls >= STALLS ? 'solid' : 'glass';
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

/**
 * "Try glass again" (after the governor chose Solid): forgets the slow result and shows glass
 * now. The governor does not run again in this visit.
 */
export function tryGlassAgain(): void {
  remove(PANELS_AUTO_KEY);
  if (!inputs) return;
  inputs = { ...inputs, slowBefore: false, renderer: null };
  const d = decideLevel(inputs);
  set(d.level, d.reason);
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
    slowBefore: read(PANELS_AUTO_KEY) === 'solid',
  };
  // The renderer is asked only when nothing before it already decided (it costs a context).
  const before = decideLevel({ ...base, renderer: null });
  inputs = { ...base, renderer: before.time ? rendererName() : null };
  const d = decideLevel(inputs);
  set(d.level, d.reason);
  if (d.time) watch();
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

/**
 * Times the first 1.5 s of visible glass after the page has landed (the intro gone): the welcome
 * fading in while the sky settles, or a repeat visit's landing. Frames while the tab is hidden
 * are not counted. Decides once.
 */
function watch(): void {
  const gaps: number[] = [];
  let last = 0;
  let watched = 0;
  const frame = (t: number) => {
    if (level !== 'glass' || reason !== 'default') return; // the visitor chose meanwhile
    const landed = !document.documentElement.dataset.intro && document.visibilityState === 'visible';
    if (!landed) {
      last = 0;
      requestAnimationFrame(frame);
      return;
    }
    if (last) {
      const gap = t - last;
      gaps.push(gap);
      if (gap < PAUSE_MS) watched += gap;
    }
    last = t;
    if (watched < WATCH_MS) {
      requestAnimationFrame(frame);
      return;
    }
    if (judgeFrames(gaps) === 'solid') {
      write(PANELS_AUTO_KEY, 'solid');
      if (inputs) inputs = { ...inputs, slowBefore: true };
      set('solid', 'slow');
    }
  };
  document.addEventListener('visibilitychange', () => {
    last = 0;
  });
  requestAnimationFrame(frame);
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

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Blocked storage.
  }
}
