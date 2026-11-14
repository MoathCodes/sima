/**
 * Blinking: grouping frames into pictures, matching their brightness, blending a group into one
 * picture, and the Difference picture. Owner: lane B. Pure.
 *
 * Borrowed from radiology and ensemble photometry (brightness matching) and from Backyard Worlds
 * and WiseView (one combined picture per pass): SPEC 7.4.
 *
 * PHASE 0 STUB: fixed fake values.
 */
import type { Det, Field, Group } from './types.ts';
import type { CombineHow } from './picture.ts';

/**
 * Brightness-match factors: scale each frame so typical stars match the reference frame of its
 * detector. Brightness is compared per detector, never across wavelengths (SPEC 7.1.2).
 * PHASE 0 STUB: 1 for every frame.
 *
 * @param field The frames.
 * @returns One factor per frame of `field.frames` (1 = as recorded).
 */
export function matchGains(field: Field): number[] {
  return field.frames.map(() => 1);
}

/**
 * The flip-book's pictures for one detector: one group per visit window (Explore's lettered
 * stops) or one per visit (Measure). A window with no exposure in this detector still gets a
 * group, with no frames, so the gap shows (H6). R Draconis's monthly windows with no exposure
 * in this detector are left out (data-format.md).
 * PHASE 0 STUB: no groups.
 *
 * @param by `window` (Explore) or `visit` (Measure).
 */
export function groupFrames(field: Field, det: Det, by: 'window' | 'visit'): Group[] {
  return [];
}

/**
 * "Same wavelength only" (BAR-5): in each group, keep the exposure closest to the reference
 * wavelength if it matches (core/real.ts `colourMatch`); drop groups with none, and name them.
 * It filters; it does not reorder.
 * PHASE 0 STUB: returns the groups unchanged.
 *
 * @param refLam The reference wavelength, µm.
 * @returns The groups kept, and the dropped ones' letters in words ("pass B").
 */
export function sameColourOnly(
  field: Field,
  groups: readonly Group[],
  refLam: number,
): { groups: Group[]; missing: string[] } {
  return { groups: [...groups], missing: [] };
}

/**
 * One picture from a group: its frames, each times its brightness-match gain when `match` is on,
 * combined pixel by pixel.
 * PHASE 0 STUB: an n × n picture of zeros.
 *
 * @returns n × n µJy per pixel, screen order.
 */
export function blend(field: Field, group: Group, how: CombineHow, match: boolean): Float32Array {
  return new Float32Array(field.n * field.n);
}

/**
 * Difference (SPEC 7.1.11): this group's picture minus the median of all the groups' pictures.
 * White where something is on this date; dark where it usually sits.
 * PHASE 0 STUB: zeros.
 *
 * @param groups The flip-book (S.groups).
 * @param i Index of the group on screen.
 * @returns n × n µJy per pixel.
 */
export function difference(
  field: Field,
  groups: readonly Group[],
  i: number,
  how: CombineHow,
  match: boolean,
): Float32Array {
  return new Float32Array(field.n * field.n);
}
