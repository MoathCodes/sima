/**
 * The sky map's own picture of a spot, shown under the frame's cover while a new spot loads
 * (SPEC 4.4, O-I3). Owner: lane D.
 *
 * It reads the same all-sky SPHEREx map the sky shows (IRSA's HiPS cube, order 5, 512-pixel PNG
 * tiles, 12.9″ pixels) and resamples the patch from it. It is an average of a year of dates, so
 * the frame tags it "Preview from the sky map (all dates averaged)" and never shows it as the
 * dated pictures (DESIGN.md "Interaction").
 *
 * Tile layout (IRSA's `properties` file for the cube, read 14 November 2026): frame i of the cube
 * is `Npix{n}_{i}.png` (frame 0 is `Npix{n}.png`); 102 frames in ascending wavelength; frames 50
 * and 51 (the dichroic channels) are blank.
 */
import { wcsPix2Sky } from '../core/real.ts';
import type { Wcs } from '../core/types.ts';

export const HIPS_URL = 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube';
const ORDER = 5;
const TILE = 512;
const TILE_BITS = 9;
/** Arcseconds per map pixel at the deepest order. */
export const MAP_PIXEL_ARCSEC = 12.88;

/** Wavelength of each cube frame, µm (`data_cube_crval3_arr`). */
const FRAME_LAM = [
  0.753, 0.771, 0.79, 0.809, 0.828, 0.848, 0.868, 0.889, 0.91, 0.932, 0.955, 0.978, 1.001, 1.025,
  1.05, 1.075, 1.102, 1.113, 1.139, 1.167, 1.195, 1.224, 1.254, 1.284, 1.315, 1.346, 1.378, 1.412,
  1.446, 1.481, 1.517, 1.554, 1.592, 1.631, 1.656, 1.695, 1.735, 1.775, 1.818, 1.861, 1.905, 1.949,
  1.995, 2.041, 2.089, 2.139, 2.189, 2.24, 2.292, 2.345, 2.399, 2.445, 2.506, 2.575, 2.646, 2.719,
  2.794, 2.871, 2.951, 3.033, 3.118, 3.204, 3.293, 3.383, 3.476, 3.57, 3.667, 3.768, 3.833, 3.867,
  3.901, 3.935, 3.97, 4.005, 4.04, 4.076, 4.112, 4.148, 4.184, 4.22, 4.257, 4.294, 4.331, 4.368,
  4.405, 4.435, 4.467, 4.5, 4.533, 4.566, 4.6, 4.635, 4.669, 4.704, 4.739, 4.773, 4.808, 4.843,
  4.879, 4.915, 4.951, 4.988,
];
const BLANK = new Set([50, 51]);

/** The cube frame nearest a wavelength, skipping the blank ones. */
export function frameFor(lam: number): number {
  let best = 0;
  FRAME_LAM.forEach((l, i) => {
    if (!BLANK.has(i) && Math.abs(l - lam) < Math.abs((FRAME_LAM[best] ?? 0) - lam)) best = i;
  });
  return best;
}

/** Interleaves the bits of x (even) and y (odd): a HEALPix nested index inside one face. */
function interleave(x: number, y: number): number {
  let out = 0;
  for (let b = 0; b < 16; b++) {
    out += (((x >> b) & 1) << (2 * b)) >>> 0;
    out += (((y >> b) & 1) << (2 * b + 1)) >>> 0;
  }
  return out >>> 0;
}

/**
 * HEALPix nested position of a sky point: face 0 to 11 and the x, y pixel inside the face at
 * nside = 2^order (Górski et al. 2005, the healpix_base `loc2pix` method). Pure.
 *
 * @param ra Degrees.
 * @param dec Degrees.
 */
export function healpixXY(
  ra: number,
  dec: number,
  order: number,
): { face: number; x: number; y: number } {
  const nside = 2 ** order;
  const z = Math.sin((dec * Math.PI) / 180);
  const za = Math.abs(z);
  const tt = ((((ra % 360) + 360) % 360) / 90) % 4; // in [0, 4)
  if (za <= 2 / 3) {
    const t1 = nside * (0.5 + tt);
    const t2 = nside * z * 0.75;
    const jp = Math.floor(t1 - t2);
    const jm = Math.floor(t1 + t2);
    const ifp = Math.floor(jp / nside);
    const ifm = Math.floor(jm / nside);
    const face = ifp === ifm ? (ifp % 4) + 4 : ifp < ifm ? ifp % 4 : (ifm % 4) + 8;
    return {
      face,
      x: ((jm % nside) + nside) % nside,
      y: nside - (((jp % nside) + nside) % nside) - 1,
    };
  }
  const ntt = Math.min(3, Math.floor(tt));
  const tp = tt - ntt;
  const tmp = nside * Math.sqrt(3 * (1 - za));
  const jp = Math.min(nside - 1, Math.floor(tp * tmp));
  const jm = Math.min(nside - 1, Math.floor((1 - tp) * tmp));
  return z >= 0
    ? { face: ntt, x: nside - jm - 1, y: nside - jp - 1 }
    : { face: ntt + 8, x: jp, y: jm };
}

/** Where a sky point is in the HiPS: tile number and pixel in the tile image (column, row). */
export function hipsPixel(ra: number, dec: number): { tile: number; col: number; row: number } {
  const { face, x, y } = healpixXY(ra, dec, ORDER + TILE_BITS);
  const tile = face * 4 ** ORDER + interleave(x >> TILE_BITS, y >> TILE_BITS);
  const px = x & (TILE - 1);
  const py = y & (TILE - 1);
  // In the tile image the nested y runs along the columns and x down the rows. Checked on
  // 14 November 2026 against Vega, Achernar and Barnard's Star in IRSA's tiles: each is the
  // brightest pixel there, and Betelgeuse falls on the map's blank (filled) centre.
  return { tile, col: py, row: px };
}

function tileUrl(tile: number, frame: number): string {
  const dir = Math.floor(tile / 10000) * 10000;
  return `${HIPS_URL}/Norder${ORDER}/Dir${dir}/Npix${tile}${frame ? `_${frame}` : ''}.png`;
}

const tiles = new Map<string, Promise<ImageData | null>>();

/**
 * One tile, shared by every caller that needs it. Its fetch is not tied to any caller's signal:
 * a cancelled picture must not leave the next one, waiting on the same tile, without it.
 */
function loadTile(tile: number, frame: number): Promise<ImageData | null> {
  const url = tileUrl(tile, frame);
  let p = tiles.get(url);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const bmp = await createImageBitmap(await res.blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, bmp.width, bmp.height);
      } catch {
        tiles.delete(url); // a failed tile is asked again next time
        return null;
      }
    })();
    tiles.set(url, p);
    if (tiles.size > 64) tiles.delete(tiles.keys().next().value ?? '');
  }
  return p;
}

/**
 * The sky map's picture of a patch, as grey levels on a small canvas (one pixel per map pixel,
 * drawn with hard edges). Null when no tile could be read (offline, blocked): the cover then
 * says what it waits for without a preview.
 *
 * @param grid The patch's grid (core/real.ts `fieldGrid`): n pixels across and its sky mapping.
 * @param lam The wavelength on the bar, µm: the map's channel.
 */
export async function skyPreview(
  grid: { n: number; wcs: Wcs },
  lam: number,
  signal?: AbortSignal,
): Promise<OffscreenCanvas | null> {
  const frame = frameFor(lam);
  const fieldArcsec = grid.n * Math.abs(grid.wcs.cd[0]) * 3600;
  const m = Math.max(8, Math.min(256, Math.round(fieldArcsec / MAP_PIXEL_ARCSEC)));
  const step = grid.n / m;
  const where: { tile: number; col: number; row: number }[] = [];
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const sky = wcsPix2Sky(grid.wcs, (i + 0.5) * step - 0.5, (j + 0.5) * step - 0.5);
      where.push(hipsPixel(sky.ra, sky.dec));
    }
  }
  const need = [...new Set(where.map((w) => w.tile))];
  const got = new Map<number, ImageData | null>();
  await Promise.all(need.map(async (t) => got.set(t, await loadTile(t, frame))));
  if (signal?.aborted || ![...got.values()].some(Boolean)) return null;
  const canvas = new OffscreenCanvas(m, m);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(m, m);
  where.forEach((w, k) => {
    const t = got.get(w.tile);
    if (!t) return; // no tile: left see-through, never drawn as black sky
    const v = t.data[(w.row * t.width + w.col) * 4] ?? 0;
    img.data.set([v, v, v, 255], k * 4);
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
}
