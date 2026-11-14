/**
 * Picture settings: what the picture tools set, and how they travel in a link (`pic=`).
 * Owner: lane B. Pure: no page access. docs/tools.md defines every setting.
 *
 * PHASE 0 STUB: the types, DEFAULT_PIC and withoutCleanup are the contract and are final.
 * encodePic and decodePic return fixed fake values until lane B writes them.
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

/**
 * The clean-up steps that are on, in words, in the order they run, for the "Processed:" label on
 * the picture (H8), e.g. ["background removed", "smoothed 1 px"]. Empty when nothing is
 * processed.
 *
 * PHASE 0 STUB: always returns [].
 *
 * @param p Settings in force (usually `pic()` from viewer/state.ts).
 */
export function cleanupSteps(p: PicSettings): string[] {
  return [];
}

/**
 * Settings → the value of the `pic=` link parameter. Only settings that differ from DEFAULT_PIC
 * are written, e.g. `st.log_lim.zscale_cm.mono_inv.1`, or `lim.custom_lo.0_hi.41.3`; the change
 * search's threshold is `fk.3`. Returns '' when everything is the default.
 *
 * PHASE 0 STUB: always returns ''.
 *
 * @param p Settings to write.
 */
export function encodePic(p: PicSettings): string {
  return '';
}

/**
 * The `pic=` link parameter → settings. Unknown or out-of-range values are left at their
 * defaults and named in `unknown`, in words ("stretch, white point"), so the page can say so.
 * A threshold stored by an older version (`k`) is still read.
 *
 * PHASE 0 STUB: always returns the defaults and no unknown values.
 *
 * @param text The parameter's value, without `pic=`.
 */
export function decodePic(text: string): { pic: PicSettings; unknown: string[] } {
  return { pic: DEFAULT_PIC, unknown: [] };
}
