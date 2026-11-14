/**
 * SPHEREx facts the code needs: detectors, bands, channels, pixel size. Owner: lane B. Pure.
 * Part of the labelled practice simulation (SPEC 7.2), and used by the bar and the spectrum.
 *
 * PHASE 0 STUB: BAND_EDGES are the tick values printed on the wavelength scale in the spec's
 * screenshots (DESIGN.md "seven ticks at the band edges"); lane B checks them against the SPHEREx
 * Explanatory Supplement. The functions return fixed fake values.
 */
import type { Det } from './types.ts';

/** Number of detectors (D1 to D6). */
export const DETECTORS = 6;
/** Spectral channels per detector. */
export const CHANNELS_PER_DETECTOR = 17;
/** Spectral channels in all: 6 detectors × 17. */
export const CHANNELS = DETECTORS * CHANNELS_PER_DETECTOR;
/** Size of one detector pixel on the sky, arcseconds. */
export const PIXEL_ARCSEC = 6.15;
/** Shortest and longest wavelength SPHEREx sees, µm. */
export const LAM_MIN = 0.75;
export const LAM_MAX = 5.0;

/**
 * Band edges in µm, shortest first: detector d covers BAND_EDGES[d − 1] to BAND_EDGES[d].
 * The wavelength scale draws its seven ticks here.
 */
export const BAND_EDGES: readonly number[] = Object.freeze([0.75, 1.1, 1.6, 2.4, 3.8, 4.4, 5.0]);

/**
 * The detector that sees a wavelength.
 *
 * PHASE 0 STUB: always 3.
 *
 * @param lam Wavelength, µm. Values outside 0.75 to 5.0 give the nearest end's detector.
 * @returns Detector 1 to 6.
 */
export function detectorOf(lam: number): Det {
  return 3;
}

/**
 * The spectral channel nearest a wavelength, for the 102-channel spectrum (MSR-3).
 *
 * PHASE 0 STUB: always 0.
 *
 * @param lam Wavelength, µm.
 * @param det The detector that took it (a wavelength near a band edge belongs to its detector).
 * @returns Channel 0 to 101: (det − 1) × 17 + the channel inside the detector.
 */
export function channelOf(lam: number, det: Det): number {
  return 0;
}

/**
 * The central wavelength of a spectral channel.
 *
 * PHASE 0 STUB: always NaN.
 *
 * @param channel 0 to 101.
 * @returns µm.
 */
export function channelLam(channel: number): number {
  return Number.NaN;
}
