/**
 * Stacking along a catalogue motion: shift each exposure so a mover stays put, then combine, so
 * something too faint for any single picture adds up (WISE 0855−0714 in SPEC 7.3). Owner: lane B.
 * Pure.
 *
 * SPEC 7.1.9: when the object moved about one pixel, a simple aperture cannot tell "along the
 * motion" from "fixed". So every stack comes with two controls, and the UI always shows them.
 *
 * PHASE 0 STUB: empty pictures, nothing measured.
 */
import type { CatalogueTrack, Det, Field } from './types.ts';
import type { CombineHow } from './picture.ts';

/** One stacked picture with its measured strength at the target. */
export interface StackPicture {
  /** What it is, in plain words, e.g. "Along the catalogue motion". */
  label: string;
  /** n × n µJy per pixel, screen order. */
  pix: Float32Array;
  /** Signal-to-noise at the target's position; NaN when not measured. */
  snr: number;
}

/** A stack and its two controls. */
export interface StackResult {
  det: Det;
  /** Frames combined. */
  frames: number;
  how: CombineHow;
  /** Shifted along the motion. */
  along: StackPicture;
  /** The two controls, e.g. not shifted, and shifted along the opposite motion. */
  controls: [StackPicture, StackPicture];
  /** What can and cannot be concluded, in words. */
  note: string;
}

/**
 * Stacks every frame of one detector along a catalogue motion.
 * PHASE 0 STUB: empty pictures.
 *
 * @param field The frames on the viewer's grid.
 * @param det Detector, 1 to 6.
 * @param track Catalogue position (degrees at decimal year ep) and motion (mas/yr).
 * @param how How the shifted frames are combined (PicSettings.combineBy).
 */
export function stackAlong(
  field: Field,
  det: Det,
  track: CatalogueTrack,
  how: CombineHow,
): StackResult {
  const empty = (label: string): StackPicture => ({
    label,
    pix: new Float32Array(field.n * field.n),
    snr: Number.NaN,
  });
  return {
    det,
    frames: 0,
    how,
    along: empty('Along the catalogue motion'),
    controls: [empty('Not shifted'), empty('Along the opposite motion')],
    note: 'Not stacked yet: the science code is a phase 0 stub.',
  };
}
