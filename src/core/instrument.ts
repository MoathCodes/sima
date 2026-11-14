/**
 * SPHEREx facts the code needs: detectors, bands, channels, pixel size. Owner: lane B. Pure.
 * Part of the labelled practice simulation (SPEC 7.2), and used by the bar and the spectrum.
 *
 * Where the numbers come from (H4):
 * - Band edges: measured from the shipped exposures. Every exposure records the wavelength at the
 *   target (`lam` in frames.json, read from each file's WCS-WAVE table). Across the 445 exposures
 *   baked on 2026-11-14 the detectors cover 0.744–1.119, 1.093–1.629, 1.625–2.413, 2.414–3.848,
 *   3.811–4.407 and 4.408–5.003 µm; neighbouring detectors overlap a little, and each edge here is
 *   the middle of that overlap, rounded to 0.01 µm. The ends are the 0.75 and 5.0 µm of SPEC 3.
 * - Channels: 17 per detector, equal steps in log wavelength between the band edges. That gives a
 *   resolving power λ/Δλ of about 43 (D1–D4) and 120 (D5, D6), the same as the bandwidths `bw` the
 *   files record (λ/bw is 37–54 in D1–D4 and 107–137 in D5 and D6).
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
 * The wavelength scale draws its seven ticks here. Measured from the shipped exposures (above).
 */
export const BAND_EDGES: readonly number[] = Object.freeze([0.75, 1.11, 1.63, 2.41, 3.83, 4.41, 5.0]);

/**
 * The detector that sees a wavelength.
 *
 * @param lam Wavelength, µm. Values outside 0.75 to 5.0 give the nearest end's detector.
 * @returns Detector 1 to 6.
 */
export function detectorOf(lam: number): Det {
  if (!Number.isFinite(lam)) return 1;
  for (let d = 1; d < DETECTORS; d++) if (lam < BAND_EDGES[d]!) return d;
  return DETECTORS;
}

/**
 * The spectral channel nearest a wavelength, for the 102-channel spectrum (MSR-3).
 *
 * @param lam Wavelength, µm.
 * @param det The detector that took it (a wavelength near a band edge belongs to its detector).
 * @returns Channel 0 to 101: (det − 1) × 17 + the channel inside the detector.
 */
export function channelOf(lam: number, det: Det): number {
  const d = Math.min(DETECTORS, Math.max(1, Math.round(det)));
  const lo = Math.log(BAND_EDGES[d - 1]!);
  const hi = Math.log(BAND_EDGES[d]!);
  const k = Math.floor(((Math.log(lam) - lo) / (hi - lo)) * CHANNELS_PER_DETECTOR);
  const inside = Number.isFinite(k) ? Math.min(CHANNELS_PER_DETECTOR - 1, Math.max(0, k)) : 0;
  return (d - 1) * CHANNELS_PER_DETECTOR + inside;
}

/**
 * The central wavelength of a spectral channel (the middle of its step in log wavelength).
 *
 * @param channel 0 to 101.
 * @returns µm; NaN outside 0 to 101.
 */
export function channelLam(channel: number): number {
  if (!(channel >= 0 && channel < CHANNELS)) return Number.NaN;
  const c = Math.floor(channel);
  const d = Math.floor(c / CHANNELS_PER_DETECTOR) + 1;
  const k = c % CHANNELS_PER_DETECTOR;
  const lo = Math.log(BAND_EDGES[d - 1]!);
  const hi = Math.log(BAND_EDGES[d]!);
  return Math.exp(lo + ((k + 0.5) / CHANNELS_PER_DETECTOR) * (hi - lo));
}

/**
 * The width of a spectral channel, µm (one step in log wavelength).
 *
 * @param channel 0 to 101.
 */
export function channelWidth(channel: number): number {
  if (!(channel >= 0 && channel < CHANNELS)) return Number.NaN;
  const d = Math.floor(channel / CHANNELS_PER_DETECTOR) + 1;
  const step = (Math.log(BAND_EDGES[d]!) - Math.log(BAND_EDGES[d - 1]!)) / CHANNELS_PER_DETECTOR;
  return channelLam(channel) * (Math.exp(step / 2) - Math.exp(-step / 2));
}

/**
 * µJy per pixel from MJy/sr: a surface brightness times a pixel's solid angle.
 *
 * @param omega The pixel's solid angle, arcsec² (6.15² = 37.82 for the viewer's grid).
 * @returns The factor: µJy per (MJy/sr).
 */
export function mjysrToUjy(omega: number): number {
  const sr = omega * (Math.PI / 180 / 3600) ** 2;
  return 1e12 * sr; // 1 MJy/sr = 1e6 Jy/sr = 1e12 µJy/sr
}
