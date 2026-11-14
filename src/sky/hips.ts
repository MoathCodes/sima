/**
 * Facts about NASA SPHEREx's all-sky map and its tiles, shared by the sky (sky.ts), the seed
 * script (scripts/seed-tiles.ts) and the tests. Pure: no page, no network. Owner: lane C.
 *
 * The map is IRSA's SPHEREx DR1 HiPS cube (SPEC 6.1): 102 channels, order 5, 512-pixel tiles.
 * public/sky-tiles-sw.js repeats the few tile rules it needs (it cannot import TypeScript);
 * tests/sky-hips.test.ts checks the two agree.
 */

/** IRSA's SPHEREx all-sky cube (SPEC 6.1). Tiles of channel i end in `_i` (none for 0). */
export const SPHEREX_HIPS = 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube';
/** AllWISE maps at IRSA (SKY-4). */
export const WISE_HIPS = {
  'wise-w1': 'https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/W1',
  'wise-w2': 'https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/W2',
} as const;

/**
 * Wavelength of each cube channel, µm, index 0 to 101, as IRSA's `properties` file lists them
 * (`data_cube_crval3_arr`, read 14 November 2026). Channel = 17 × (detector − 1) + (step − 1).
 */
export const CHANNEL_LAM: readonly number[] = [
  0.753, 0.771, 0.79, 0.809, 0.828, 0.848, 0.868, 0.889, 0.91, 0.932, 0.955, 0.978, 1.001, 1.025,
  1.05, 1.075, 1.102, 1.113, 1.139, 1.167, 1.195, 1.224, 1.254, 1.284, 1.315, 1.346, 1.378, 1.412,
  1.446, 1.481, 1.517, 1.554, 1.592, 1.631, 1.656, 1.695, 1.735, 1.775, 1.818, 1.861, 1.905, 1.949,
  1.995, 2.041, 2.089, 2.139, 2.189, 2.24, 2.292, 2.345, 2.399, 2.445, 2.506, 2.575, 2.646, 2.719,
  2.794, 2.871, 2.951, 3.033, 3.118, 3.204, 3.293, 3.383, 3.476, 3.57, 3.667, 3.768, 3.833, 3.867,
  3.901, 3.935, 3.97, 4.005, 4.04, 4.076, 4.112, 4.148, 4.184, 4.22, 4.257, 4.294, 4.331, 4.368,
  4.405, 4.435, 4.467, 4.5, 4.533, 4.566, 4.6, 4.635, 4.669, 4.704, 4.739, 4.773, 4.808, 4.843,
  4.879, 4.915, 4.951, 4.988,
];

/** Channels 50 and 51 (the dichroic edge between detectors 3 and 4) are blank in the cube. */
export const BLANK_CHANNELS: ReadonlySet<number> = new Set([50, 51]);

/** The 100 channels that hold a map. */
export const CHANNELS: readonly number[] = CHANNEL_LAM.map((_, i) => i).filter(
  (i) => !BLANK_CHANNELS.has(i),
);

/** The wavelength the page opens on (the reference pictures show 2.00 µm). */
export const DEFAULT_LAM = 2.0;

/**
 * The channel that shows a wavelength: the nearest one that holds a map (SKY-2).
 * @param lam µm.
 * @returns A channel index, 0 to 101, never 50 or 51.
 */
export function channelFor(lam: number): number {
  let best = CHANNELS[0] ?? 0;
  for (const i of CHANNELS) {
    if (Math.abs((CHANNEL_LAM[i] ?? 0) - lam) < Math.abs((CHANNEL_LAM[best] ?? 0) - lam)) best = i;
  }
  return best;
}

/** The channel shipped with full base tiles (scripts/seed-tiles.ts). */
export const DEFAULT_CHANNEL = channelFor(DEFAULT_LAM);

/** The detector (1 to 6) a channel belongs to. */
export function detectorOf(channel: number): number {
  return Math.floor(channel / 17) + 1;
}

/** Even bits of `v` packed together: 0b0101 → 0b11. */
export function deinterleave(v: number): number {
  let out = 0;
  for (let bit = 0; v > 0; bit++, v = Math.floor(v / 4)) out |= (v & 1) << bit;
  return out;
}

/**
 * Where a descendant tile sits inside its ancestor, in descendant-sized steps. HiPS nests four
 * children per tile: child c sits at row `c & 1`, column `(c >> 1) & 1` (checked against IRSA's
 * own tiles: an order-0 tile matches its four order-1 children laid out this way).
 *
 * @param sub The descendant's index inside the ancestor, 0 to 4^depth − 1.
 * @returns Row and column, 0 to 2^depth − 1.
 */
export function subTilePosition(sub: number): { row: number; col: number } {
  return { row: deinterleave(sub), col: deinterleave(Math.floor(sub / 2)) };
}

/** Order-3 tiles in an Allsky image, per row (HiPS standard: 27 × 64 px = 1728 px wide). */
export const ALLSKY_COLUMNS = 27;
/** Pixels per order-3 tile in an Allsky image (512-pixel tiles shrunk 8 times). */
export const ALLSKY_TILE = 64;
export const ALLSKY_WIDTH = ALLSKY_COLUMNS * ALLSKY_TILE; // 1728
export const ALLSKY_HEIGHT = Math.ceil(768 / ALLSKY_COLUMNS) * ALLSKY_TILE; // 1856

/** The box of an order-3 tile inside an Allsky image, pixels. */
export function allskyBox(n3: number): { x: number; y: number; size: number } {
  return {
    x: (n3 % ALLSKY_COLUMNS) * ALLSKY_TILE,
    y: Math.floor(n3 / ALLSKY_COLUMNS) * ALLSKY_TILE,
    size: ALLSKY_TILE,
  };
}

/**
 * Where a tile of any order sits inside its base face (one of the 12 order-0 tiles), in tiles
 * of that order. Base faces are smoothed as one picture so no line shows at tile borders (O-I13).
 */
export function faceOf(order: number, n: number): { face: number; row: number; col: number } {
  const per = 4 ** order;
  const { row, col } = subTilePosition(n % per);
  return { face: Math.floor(n / per), row, col };
}

/** HiPS directory of a tile: Dir = 10000 × floor(n / 10000). */
export function tileDir(n: number): number {
  return Math.floor(n / 10000) * 10000;
}

/** IRSA's address of one tile of one channel. */
export function irsaTileUrl(channel: number, order: number, n: number): string {
  const suffix = channel === 0 ? '' : `_${channel}`;
  return `${SPHEREX_HIPS}/Norder${order}/Dir${tileDir(n)}/Npix${n}${suffix}.png`;
}

/** IRSA's address of one channel's Allsky image (order 3). */
export function irsaAllskyUrl(channel: number): string {
  return `${SPHEREX_HIPS}/Norder3/Allsky${channel === 0 ? '' : `_${channel}`}.png`;
}
