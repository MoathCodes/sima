/**
 * Picture settings: what the picture tools set, and how they travel in a link (`pic=`).
 * Owner: lane B. Pure: no page access. docs/tools.md defines every setting.
 *
 * The types, DEFAULT_PIC and withoutCleanup are the contract (phase 0) and are final.
 */

/** How the black and white points are chosen (Picture tab, "Black and white points"). */
export type LimitsMode = 'noise' | 'zscale' | 'pct' | 'minmax' | 'custom';
/** How values between black and white become brightness. */
export type Stretch = 'linear' | 'sqrt' | 'log' | 'asinh' | 'equal';
/** Colour map: Band (the detector's own hue), Thermal (inferno), Mono, Viridis. */
export type ColourMap = 'band' | 'thermal' | 'mono' | 'viridis';
/** How the exposures of one pass become one picture (also used by Stack). */
export type CombineHow = 'mean' | 'median' | 'clip';
/** Which colour a detector adds to in the Color view, or `off`. */
export type MixColour = 'r' | 'g' | 'b' | 'off';
/** Gaussian smoothing, sigma in pixels; 0 is off. */
export type Smooth = 0 | 0.5 | 1 | 2;

/** Every picture setting. Readonly: change it by assigning a new object (`S.pic = {...}`). */
export interface PicSettings {
  /** How the black and white points are chosen. */
  readonly limits: LimitsMode;
  /** Custom black point, noise units above the sky, from −50. Used when limits is 'custom'. */
  readonly black: number;
  /** Custom white point, noise units above the sky, up to 100,000, always above black. */
  readonly white: number;
  readonly stretch: Stretch;
  /** Brightness (DS9 bias), −1 to 1; 0 changes nothing. */
  readonly brightness: number;
  /** Contrast, a factor; 1 changes nothing. */
  readonly contrast: number;
  readonly cmap: ColourMap;
  /** Dark stars on a light sky, as on survey plates. */
  readonly invert: boolean;
  /** Color view: the colour each detector D1…D6 adds to (index 0 is D1). */
  readonly mix: readonly [MixColour, MixColour, MixColour, MixColour, MixColour, MixColour];
  /** Clean up: scale each exposure so typical stars match the reference. On by default. */
  readonly match: boolean;
  /** Clean up: subtract a smooth background (SExtractor mesh method). */
  readonly background: boolean;
  /** Clean up: 3 × 3 median filter. */
  readonly median: boolean;
  /** Clean up: Gaussian smoothing, sigma in pixels; 0 is off. */
  readonly smooth: Smooth;
  /** Clean up: blink one combined picture per pass instead of single exposures. */
  readonly combinePass: boolean;
  /** How a pass (and the Stack view) is combined. */
  readonly combineBy: CombineHow;
  /** Find changes: report spots above this many times the noise, 3 to 10. */
  readonly threshold: number;
}

/**
 * The default look: what newcomers see, and what "Reset all" returns to. The Explore game always
 * shows this, unless a shared link brought other settings (docs/tools.md).
 */
export const DEFAULT_PIC: PicSettings = Object.freeze({
  limits: 'noise',
  black: 0,
  white: 800,
  stretch: 'asinh',
  brightness: 0,
  contrast: 1,
  cmap: 'band',
  invert: false,
  mix: Object.freeze(['b', 'b', 'g', 'g', 'r', 'r'] as const),
  match: true,
  background: false,
  median: false,
  smooth: 0,
  combinePass: false,
  combineBy: 'mean',
  threshold: 5,
});

/**
 * The same settings with every clean-up step off: what "Original" (and the `\` key) shows, the
 * pixels as recorded (H8). The display settings (limits, stretch, colour map…) are kept.
 *
 * @param p Settings in force.
 * @returns A new settings object; `p` is not changed.
 */
export function withoutCleanup(p: PicSettings): PicSettings {
  return { ...p, match: false, background: false, median: false, smooth: 0, combinePass: false };
}

/** Combine methods in words, for the "Processed:" label. */
const COMBINE_WORDS: Readonly<Record<CombineHow, string>> = Object.freeze({
  mean: 'mean',
  median: 'median',
  clip: 'sigma clip',
});

/**
 * The clean-up steps that are on, in words, in the order they run, for the "Processed:" label on
 * the picture (H8), e.g. ["background removed", "smoothed 1 px"]. Empty when nothing is
 * processed.
 *
 * Order: combining a pass (it runs first, in core/blink.ts), then background, median, smoothing.
 *
 * Brightness match is not listed. docs/tools.md says each clean-up step "is off by default" and
 * that "the default look is the same as before the tools existed"; match is the one switch that is
 * on by default, and it only scales a whole exposure to the reference sky level so dates blink
 * alike. Listing it would put "Processed:" on every default picture, which would make the label
 * mean nothing. Original still turns it off (withoutCleanup), so the pixels as recorded stay one
 * press away.
 *
 * @param p Settings in force (usually `pic()` from viewer/state.ts).
 */
export function cleanupSteps(p: PicSettings): string[] {
  const steps: string[] = [];
  if (p.combinePass) steps.push(`each pass combined (${COMBINE_WORDS[p.combineBy]})`);
  if (p.background) steps.push('background removed');
  if (p.median) steps.push('3 × 3 median filter');
  if (p.smooth > 0) steps.push(`smoothed ${p.smooth} px`);
  return steps;
}

/** Mutable copy of the settings, for decoding. */
type Draft = { -readonly [K in keyof PicSettings]: PicSettings[K] };

/** One `pic=` key: its name in words, how to read it, how to write it. */
interface Field {
  words: string;
  /** Sets the value on the draft, or returns false when the text is not a valid value. */
  read: (d: Draft, text: string) => boolean;
  /** The text to write, or null when the setting is the default (not written). */
  write: (p: PicSettings) => string | null;
}

const NUM = /^-?(\d+(\.\d*)?|\.\d+)(e-?\d+)?$/i;
const num = (text: string): number => (NUM.test(text) ? Number(text) : Number.NaN);

/** A setting with a fixed list of values. */
function choice<K extends keyof PicSettings>(
  key: K,
  words: string,
  values: readonly PicSettings[K][],
): Field {
  return {
    words,
    read: (d, t) => {
      const v = values.find((x) => String(x) === t);
      if (v === undefined) return false;
      d[key] = v;
      return true;
    },
    write: (p) => (p[key] === DEFAULT_PIC[key] ? null : String(p[key])),
  };
}

/** An on/off setting, written 1 or 0. */
function flag(
  key: 'invert' | 'match' | 'background' | 'median' | 'combinePass',
  words: string,
): Field {
  return {
    words,
    read: (d, t) => {
      if (t !== '1' && t !== '0') return false;
      d[key] = t === '1';
      return true;
    },
    write: (p) => (p[key] === DEFAULT_PIC[key] ? null : p[key] ? '1' : '0'),
  };
}

/** A number setting kept in [min, max]. */
function numeric(
  key: 'black' | 'white' | 'brightness' | 'contrast' | 'threshold',
  words: string,
  ok: (v: number) => boolean,
  always?: (p: PicSettings) => boolean,
): Field {
  return {
    words,
    read: (d, t) => {
      const v = num(t);
      if (!Number.isFinite(v) || !ok(v)) return false;
      d[key] = v;
      return true;
    },
    write: (p) => (p[key] === DEFAULT_PIC[key] && !always?.(p) ? null : String(p[key])),
  };
}

const MIX_CODE: Readonly<Record<MixColour, string>> = Object.freeze({
  r: 'r',
  g: 'g',
  b: 'b',
  off: 'x',
});

/** Custom black and white are written together whenever limits are custom. */
const isCustom = (p: PicSettings): boolean => p.limits === 'custom';

/**
 * Every `pic=` key, in the order written. Keys: st stretch, lim limits, lo / hi custom black and
 * white (noise units above the sky), br brightness, ct contrast, cm colour map, inv invert,
 * mix Color view mix (six letters r, g, b or x for off, D1 first), mt brightness match,
 * bg background, med median, sm smoothing, cp combine each pass, cb combine by, fk threshold.
 */
const FIELDS: Readonly<Record<string, Field>> = Object.freeze({
  st: choice('stretch', 'stretch', ['linear', 'sqrt', 'log', 'asinh', 'equal']),
  lim: choice('limits', 'black and white points', ['noise', 'zscale', 'pct', 'minmax', 'custom']),
  lo: numeric('black', 'black point', (v) => v >= -50 && v < 100_000, isCustom),
  hi: numeric('white', 'white point', (v) => v > -50 && v <= 100_000, isCustom),
  br: numeric('brightness', 'brightness', (v) => v >= -1 && v <= 1),
  ct: numeric('contrast', 'contrast', (v) => v > 0 && v <= 10),
  cm: choice('cmap', 'colour map', ['band', 'thermal', 'mono', 'viridis']),
  inv: flag('invert', 'invert'),
  mix: {
    words: 'Color view mix',
    read: (d, t) => {
      const codes = Object.entries(MIX_CODE) as [MixColour, string][];
      const mix = [...t].map((ch) => codes.find(([, c]) => c === ch)?.[0]);
      if (mix.length !== 6 || mix.some((m) => m === undefined) || mix.every((m) => m === 'off')) {
        return false;
      }
      d.mix = mix as unknown as PicSettings['mix'];
      return true;
    },
    write: (p) =>
      p.mix.every((m, i) => m === DEFAULT_PIC.mix[i])
        ? null
        : p.mix.map((m) => MIX_CODE[m]).join(''),
  },
  mt: flag('match', 'brightness match'),
  bg: flag('background', 'background removal'),
  med: flag('median', 'median filter'),
  sm: choice('smooth', 'smoothing', [0, 0.5, 1, 2]),
  cp: flag('combinePass', 'combine each pass'),
  cb: choice('combineBy', 'combine by', ['mean', 'median', 'clip']),
  fk: numeric('threshold', 'change threshold', (v) => v >= 3 && v <= 10),
});

/**
 * Settings → the value of the `pic=` link parameter. Only settings that differ from DEFAULT_PIC
 * are written, e.g. `st.log_lim.zscale_cm.mono_inv.1`, or `lim.custom_lo.0_hi.41.3`; the change
 * search's threshold is `fk.3`. Returns '' when everything is the default.
 *
 * With custom limits, black and white are both written even when one is the default (as in the
 * example above), so the link names the custom range in full.
 *
 * @param p Settings to write.
 */
export function encodePic(p: PicSettings): string {
  const parts: string[] = [];
  for (const [key, f] of Object.entries(FIELDS)) {
    const v = f.write(p);
    if (v !== null) parts.push(`${key}.${v}`);
  }
  return parts.join('_');
}

/**
 * The `pic=` link parameter → settings. Unknown or out-of-range values are left at their
 * defaults and named in `unknown`, in words ("stretch, white point"), so the page can say so.
 * A threshold stored by an older version (`k`) is still read.
 *
 * A key the app does not know is named as `setting "<key>"`. A white point that ends up not
 * above the black point is dropped (and named), and then the black point too if still needed.
 *
 * @param text The parameter's value, without `pic=`.
 */
export function decodePic(text: string): { pic: PicSettings; unknown: string[] } {
  const d: Draft = { ...DEFAULT_PIC };
  const unknown: string[] = [];
  const name = (w: string): void => {
    if (!unknown.includes(w)) unknown.push(w);
  };
  for (const part of text.split('_')) {
    if (part === '') continue;
    const dot = part.indexOf('.');
    const key = dot < 0 ? part : part.slice(0, dot);
    const value = dot < 0 ? '' : part.slice(dot + 1);
    const f = FIELDS[key === 'k' ? 'fk' : key];
    if (!f) name(`setting "${key}"`);
    else if (!f.read(d, value)) name(f.words);
  }
  if (!(d.white > d.black)) {
    d.white = DEFAULT_PIC.white;
    name(FIELDS.hi.words);
    if (!(d.white > d.black)) {
      d.black = DEFAULT_PIC.black;
      name(FIELDS.lo.words);
    }
  }
  return { pic: d, unknown };
}
