/**
 * Small sky-map pictures for tour stops (O-P2): a square cut out of NASA's SPHEREx all-sky map,
 * read straight from IRSA's HiPS tiles (CORS is open) and drawn north up, east left.
 * Owner: lane G.
 *
 * The map is the average of all dates (H1), at one channel near 2.0 µm. `CUTOUT_SOURCE` is the
 * caption every picture carries (H2: source, release, dates, wavelength).
 *
 * HiPS keeps the sky in HEALPix cells (nested numbering). A tile at order k is one cell; its
 * 512 × 512 pixels are the cell's sub-cells at order k + 9. `cellOf` finds, for a sky position,
 * the tile and the pixel inside it.
 */

/** IRSA's SPHEREx DR1 all-sky cube (SPEC 6.1). */
const HIPS = 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube';
/** The cube's frame nearest 2.0 µm: frame 42 is 1.995 µm (the cube's `properties`). */
const CHANNEL = 42;
const TILE = 512;
const ORDER_MAX = 5;
/** Pixel size at the deepest order, degrees (`hips_pixel_scale`). */
const SCALE_MAX = 0.0035786;

/** What every cutout says about itself. */
export const CUTOUT_SOURCE =
  'SPHEREx all-sky map (DR1, NASA/IRSA) at 2.0 µm: the average of all dates, April 2025 to May 2026';

/** Where a sky position falls: the tile and the pixel inside its image. */
export interface Cell {
  order: number;
  npix: number;
  /** Column and row in the tile image, 0 at the top left. */
  col: number;
  row: number;
}

/**
 * HEALPix ang2pix (nested), split into the tile at `order` and the pixel inside it.
 * @param ra Degrees.
 * @param dec Degrees.
 */
export function cellOf(ra: number, dec: number, order: number): Cell {
  const nside = 2 ** (order + 9);
  const z = Math.sin((dec * Math.PI) / 180);
  const za = Math.abs(z);
  const tt = ((((ra % 360) + 360) % 360) / 90) % 4; // phi / (pi / 2), 0 to 4
  let face: number;
  let ix: number;
  let iy: number;
  if (za <= 2 / 3) {
    const t1 = nside * (0.5 + tt);
    const t2 = nside * z * 0.75;
    const jp = Math.floor(t1 - t2);
    const jm = Math.floor(t1 + t2);
    const ifp = Math.floor(jp / nside);
    const ifm = Math.floor(jm / nside);
    face = ifp === ifm ? (ifp % 4) + 4 : ifp < ifm ? ifp % 4 : (ifm % 4) + 8;
    ix = jm % nside;
    iy = nside - (jp % nside) - 1;
  } else {
    const ntt = Math.min(3, Math.floor(tt));
    const tp = tt - ntt;
    const tmp = nside * Math.sqrt(3 * (1 - za));
    const jp = Math.min(nside - 1, Math.floor(tp * tmp));
    const jm = Math.min(nside - 1, Math.floor((1 - tp) * tmp));
    if (z >= 0) {
      face = ntt;
      ix = nside - jm - 1;
      iy = nside - jp - 1;
    } else {
      face = ntt + 8;
      ix = jp;
      iy = jm;
    }
  }
  const tx = Math.floor(ix / TILE);
  const ty = Math.floor(iy / TILE);
  const sx = ix % TILE;
  const sy = iy % TILE;
  return { order, npix: face * 4 ** order + interleave(tx, ty), ...inTile(sx, sy) };
}

/**
 * A sub-cell's place in the tile image: HiPS images put the cell's HEALPix x down the rows and
 * its y along the columns. Checked on 14 November 2026 against eight bright stars (Betelgeuse,
 * Sirius, Vega, Aldebaran, Antares, Polaris, Canopus, Arcturus): each lands on a saturated pixel
 * of its order-3 tile; the seven other flips and swaps miss most of them.
 */
function inTile(sx: number, sy: number): { col: number; row: number } {
  return { col: sy, row: sx };
}

/** Morton interleave: x in the even bits, y in the odd bits. */
function interleave(x: number, y: number): number {
  let out = 0;
  for (let b = 0; b < 16; b++) {
    out += ((x >> b) & 1) * 2 ** (2 * b) + ((y >> b) & 1) * 2 ** (2 * b + 1);
  }
  return out;
}

/** The tile order to read for a cutout pixel size (degrees): the coarsest that is sharp enough. */
export function orderFor(pixelDeg: number): number {
  for (let k = 0; k < ORDER_MAX; k++) {
    if (SCALE_MAX * 2 ** (ORDER_MAX - k) <= pixelDeg) return k;
  }
  return ORDER_MAX;
}

/** Tile address: channel 0 is `Npix{n}.png`, channel i is `Npix{n}_{i}.png` (SPEC 6.1). */
function tileUrl(order: number, npix: number): string {
  const dir = Math.floor(npix / 10000) * 10000;
  return `${HIPS}/Norder${order}/Dir${dir}/Npix${npix}${CHANNEL ? `_${CHANNEL}` : ''}.png`;
}

// ----- Tiles: fetched at most four at a time, kept as one grey byte per pixel -----------------

const tiles = new Map<string, Promise<Uint8Array>>();
let running = 0;
const waiting: (() => void)[] = [];

function tile(order: number, npix: number): Promise<Uint8Array> {
  const url = tileUrl(order, npix);
  let got = tiles.get(url);
  if (!got) {
    got = slot().then(() => load(url).finally(release));
    got.catch(() => tiles.delete(url)); // a failed tile may be asked for again later
    tiles.set(url, got);
    if (tiles.size > 40) tiles.delete(tiles.keys().next().value as string);
  }
  return got;
}

function slot(): Promise<void> {
  if (running < 4) {
    running++;
    return Promise.resolve();
  }
  return new Promise((go) => waiting.push(() => (running++, go())));
}

function release(): void {
  running--;
  waiting.shift()?.();
}

async function load(url: string): Promise<Uint8Array> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const c = new OffscreenCanvas(TILE, TILE);
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('cutout: no 2D context');
  g.drawImage(img, 0, 0);
  const rgba = g.getImageData(0, 0, TILE, TILE).data;
  const grey = new Uint8Array(TILE * TILE);
  for (let i = 0; i < grey.length; i++) grey[i] = rgba[i * 4] ?? 0;
  return grey;
}

// ----- Drawing --------------------------------------------------------------------------------

/**
 * Draws a cutout centred on a place: gnomonic projection, north up, east left.
 * @param canvas Its width and height are the cutout's size in pixels.
 * @param ra Degrees.
 * @param dec Degrees.
 * @param fov Width of the cutout, degrees.
 * @throws When a tile cannot be read (the caller says "No picture").
 */
export async function drawCutout(
  canvas: HTMLCanvasElement,
  ra: number,
  dec: number,
  fov: number,
): Promise<void> {
  const w = canvas.width;
  const h = canvas.height;
  const step = fov / w; // degrees per cutout pixel
  const order = orderFor(step);
  const cells: Cell[] = [];
  const need = new Set<number>();
  const r = Math.PI / 180;
  const sd = Math.sin(dec * r);
  const cd = Math.cos(dec * r);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      // Tangent-plane offsets in radians: x grows to the east (left), y to the north (up).
      const x = (w / 2 - i - 0.5) * step * r;
      const y = (h / 2 - j - 0.5) * step * r;
      const rho = Math.hypot(x, y);
      let pr = ra;
      let pd = dec;
      if (rho > 0) {
        const c = Math.atan(rho);
        const sc = Math.sin(c);
        const cc = Math.cos(c);
        pd = Math.asin(cc * sd + (y * sc * cd) / rho) / r;
        pr = ra + Math.atan2(x * sc, rho * cd * cc - y * sd * sc) / r;
      }
      const cell = cellOf(pr, pd, order);
      cells.push(cell);
      need.add(cell.npix);
    }
  }
  const got = new Map<number, Uint8Array>();
  await Promise.all([...need].map(async (n) => got.set(n, await tile(order, n))));
  const g = canvas.getContext('2d');
  if (!g) return;
  const out = g.createImageData(w, h);
  cells.forEach((cell, k) => {
    const v = got.get(cell.npix)?.[cell.row * TILE + cell.col] ?? 0;
    out.data[k * 4] = v;
    out.data[k * 4 + 1] = v;
    out.data[k * 4 + 2] = v;
    out.data[k * 4 + 3] = 255;
  });
  g.putImageData(out, 0, 0);
}
