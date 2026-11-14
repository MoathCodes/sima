/**
 * Builds public/sky-seed/: the low-resolution sky the service worker shows first (SKY-8, SPEC
 * 6.2). Owner: lane C. Run with `npm run seed:sky [all|allsky|base]` (default all).
 *
 * Everything is fetched fresh from NASA IRSA's SPHEREx DR1 HiPS cube (SPEC 6.1):
 *
 * - `allsky/<channel>.webp`: one 1728×1856 Allsky image (order 3, 64-pixel tiles) for each of the
 *   100 channels that hold a map. Budget 8 MB in all.
 * - `tiles/<channel>/Norder<k>/Npix<n>.webp`: full 512-pixel base tiles of the default channel,
 *   orders 0 to 2. Budget 5 MB.
 * - `manifest.json`: what was built, from where, when, and how it was processed.
 *
 * Processing, in this order, the same for both kinds:
 * 1. Holes (transparent pixels: the map leaves bright star centres empty) are filled from their
 *    rim, inward, one ring at a time.
 * 2. Tiles are put back together into the 12 base faces of the sphere and each face is smoothed
 *    as one picture (Gaussian), so no line shows along tile borders (O-I13).
 * 3. WebP with `-quality 80 -define webp:filter-strength=0` (ImageMagick): without the last
 *    setting the encoder's loop filter draws lines along tile borders.
 *
 * The Allsky images are smoothed until each fits its share of the budget; the manifest records
 * the amount. Downloads are kept in .cache/sky-seed/ so a broken run can resume.
 *
 * Needs ImageMagick 7 (`magick`) with WebP support.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ALLSKY_HEIGHT,
  ALLSKY_TILE,
  ALLSKY_WIDTH,
  CHANNEL_LAM,
  CHANNELS,
  DEFAULT_CHANNEL,
  SPHEREX_HIPS,
  allskyBox,
  faceOf,
  irsaAllskyUrl,
  irsaTileUrl,
} from '../src/sky/hips.ts';

const OUT = 'public/sky-seed';
const CACHE = '.cache/sky-seed';
const UA = 'sima-sky-viewer/1.0';
const ALLSKY_BUDGET = 8_000_000;
const BASE_BUDGET = 5_000_000;
const BASE_ORDER = 2; // base tiles for orders 0..BASE_ORDER
const PARALLEL = 6;
/** Smoothing tried for the Allsky images, in Allsky pixels (σ), weakest first. */
const ALLSKY_SIGMAS = [1.2, 1.5, 1.8, 2.1, 2.5, 3, 3.6];
/** Smoothing of the base tiles, in pixels of the deepest order shipped (σ). */
const BASE_SIGMAS = [1.1, 1.3, 1.6, 2];

/** A grey picture with a mask of the pixels that hold data. */
interface Grey {
  w: number;
  h: number;
  v: Float32Array;
  ok: Uint8Array;
}

// ----- Network --------------------------------------------------------------------------------

async function download(url: string): Promise<Buffer> {
  const file = join(CACHE, url.replace(/^https:\/\/[^/]+\//, ''));
  if (existsSync(file)) return readFileSync(file);
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const body = Buffer.from(await res.arrayBuffer());
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
      return body;
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`could not fetch ${url}: ${String(last)}`);
}

async function pool<T>(items: readonly T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
}

// ----- Pixels ---------------------------------------------------------------------------------

/** Decodes a PNG into grey values and a data mask (alpha > 0). */
function decode(png: Buffer): Grey {
  const [w, h] = execFileSync('magick', ['png:-', '-format', '%w %h', 'info:'], { input: png })
    .toString()
    .split(' ')
    .map(Number) as [number, number];
  const rgba = execFileSync('magick', ['png:-', '-depth', '8', 'rgba:-'], {
    input: png,
    maxBuffer: 64 << 20,
  });
  const v = new Float32Array(w * h);
  const ok = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    v[i] = rgba[i * 4] ?? 0; // the map is grey: r = g = b
    ok[i] = (rgba[i * 4 + 3] ?? 0) > 0 ? 1 : 0;
  }
  return { w, h, v, ok };
}

function blank(w: number, h: number): Grey {
  return { w, h, v: new Float32Array(w * h), ok: new Uint8Array(w * h) };
}

/** Copies a square block from one picture into another. */
function blit(
  src: Grey,
  sx: number,
  sy: number,
  size: number,
  dst: Grey,
  dx: number,
  dy: number,
): void {
  for (let y = 0; y < size; y++) {
    const s = (sy + y) * src.w + sx;
    const d = (dy + y) * dst.w + dx;
    dst.v.set(src.v.subarray(s, s + size), d);
    dst.ok.set(src.ok.subarray(s, s + size), d);
  }
}

/**
 * Fills holes from their rim: each pass gives every empty pixel that touches data the mean of
 * its filled neighbours. Returns how many pixels were filled.
 */
function fillHoles(g: Grey, maxPasses = 64): number {
  let holes: number[] = [];
  for (let i = 0; i < g.w * g.h; i++) if (!g.ok[i]) holes.push(i);
  let filled = 0;
  for (let pass = 0; pass < maxPasses && holes.length; pass++) {
    const add: [number, number][] = [];
    const left: number[] = [];
    for (const i of holes) {
      const x = i % g.w;
      const y = (i - x) / g.w;
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= g.w || yy >= g.h) continue;
          const j = yy * g.w + xx;
          if (g.ok[j]) {
            sum += g.v[j] ?? 0;
            n++;
          }
        }
      }
      if (n) add.push([i, sum / n]);
      else left.push(i);
    }
    if (!add.length) break;
    for (const [i, value] of add) {
      g.v[i] = value;
      g.ok[i] = 1;
    }
    filled += add.length;
    holes = left;
  }
  return filled;
}

/** Gaussian smoothing, separable, with the picture's edge mirrored. */
function smooth(g: Grey, sigma: number): Grey {
  if (sigma <= 0) return g;
  const r = Math.ceil(sigma * 3);
  const k: number[] = [];
  let total = 0;
  for (let i = -r; i <= r; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(w);
    total += w;
  }
  const kern = k.map((w) => w / total);
  const mirror = (i: number, n: number) => (i < 0 ? -i - 1 : i >= n ? 2 * n - i - 1 : i);
  const tmp = new Float32Array(g.w * g.h);
  const out = new Float32Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += (kern[i + r] ?? 0) * (g.v[y * g.w + mirror(x + i, g.w)] ?? 0);
      tmp[y * g.w + x] = s;
    }
  }
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += (kern[i + r] ?? 0) * (tmp[mirror(y + i, g.h) * g.w + x] ?? 0);
      out[y * g.w + x] = s;
    }
  }
  return { w: g.w, h: g.h, v: out, ok: g.ok };
}

/** Shrinks by a whole factor, averaging blocks. */
function shrink(g: Grey, f: number): Grey {
  const w = g.w / f;
  const h = g.h / f;
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) s += g.v[(y * f + dy) * g.w + x * f + dx] ?? 0;
      }
      out.v[y * w + x] = s / (f * f);
      out.ok[y * w + x] = 1;
    }
  }
  return out;
}

/** WebP, quality 80, loop filter off (SPEC 6.2). */
function webp(g: Grey): Buffer {
  const bytes = Buffer.alloc(g.w * g.h);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.max(0, Math.min(255, Math.round(g.v[i] ?? 0)));
  }
  return execFileSync(
    'magick',
    [
      '-size',
      `${g.w}x${g.h}`,
      '-depth',
      '8',
      'gray:-',
      '-quality',
      '80',
      '-define',
      'webp:filter-strength=0',
      'webp:-',
    ],
    { input: bytes, maxBuffer: 64 << 20 },
  );
}

// ----- Allsky ---------------------------------------------------------------------------------

/** Puts an Allsky image's 768 order-3 tiles into the 12 base faces (512×512 each). */
function allskyFaces(all: Grey): Grey[] {
  const faces = Array.from({ length: 12 }, () => blank(512, 512));
  for (let n = 0; n < 768; n++) {
    const box = allskyBox(n);
    const { face, row, col } = faceOf(3, n);
    blit(all, box.x, box.y, ALLSKY_TILE, faces[face] as Grey, col * ALLSKY_TILE, row * ALLSKY_TILE);
  }
  return faces;
}

function facesToAllsky(faces: Grey[]): Grey {
  const all = blank(ALLSKY_WIDTH, ALLSKY_HEIGHT);
  for (let n = 0; n < 768; n++) {
    const box = allskyBox(n);
    const { face, row, col } = faceOf(3, n);
    blit(faces[face] as Grey, col * ALLSKY_TILE, row * ALLSKY_TILE, ALLSKY_TILE, all, box.x, box.y);
  }
  return all;
}

interface AllskyResult {
  channel: number;
  sigma: number;
  bytes: number;
  filled: number;
}

async function buildAllsky(): Promise<AllskyResult[]> {
  const share = Math.floor(ALLSKY_BUDGET / CHANNELS.length);
  const results: AllskyResult[] = [];
  mkdirSync(join(OUT, 'allsky'), { recursive: true });
  await pool(CHANNELS, async (channel) => {
    const raw = decode(await download(irsaAllskyUrl(channel)));
    const faces = allskyFaces(raw);
    let filled = 0;
    for (const f of faces) filled += fillHoles(f);
    let best: { sigma: number; data: Buffer } | null = null;
    for (const sigma of ALLSKY_SIGMAS) {
      const data = webp(facesToAllsky(faces.map((f) => smooth(f, sigma))));
      best = { sigma, data };
      if (data.length <= share) break;
    }
    if (!best) return;
    writeFileSync(join(OUT, 'allsky', `${channel}.webp`), best.data);
    results.push({ channel, sigma: best.sigma, bytes: best.data.length, filled });
    console.log(
      `allsky ${channel} (${CHANNEL_LAM[channel]} µm): σ ${best.sigma}, ${(best.data.length / 1e3).toFixed(0)} kB, ${filled} px filled`,
    );
  });
  return results.sort((a, b) => a.channel - b.channel);
}

// ----- Base tiles of the default channel -------------------------------------------------------

interface BaseResult {
  channel: number;
  orders: number[];
  sigma: number;
  bytes: number;
  filled: number;
}

async function buildBase(): Promise<BaseResult> {
  const channel = DEFAULT_CHANNEL;
  const side = 512 * 2 ** BASE_ORDER;
  const per = 4 ** BASE_ORDER;
  const faces = Array.from({ length: 12 }, () => blank(side, side));
  const tiles = Array.from({ length: 12 * per }, (_, n) => n);
  await pool(tiles, async (n) => {
    const tile = decode(await download(irsaTileUrl(channel, BASE_ORDER, n)));
    const { face, row, col } = faceOf(BASE_ORDER, n);
    blit(tile, 0, 0, 512, faces[face] as Grey, col * 512, row * 512);
  });
  let filled = 0;
  for (const f of faces) filled += fillHoles(f);

  const dir = join(OUT, 'tiles', String(channel));
  let result: BaseResult | null = null;
  for (const sigma of BASE_SIGMAS) {
    rmSync(dir, { recursive: true, force: true });
    let bytes = 0;
    const smoothed = faces.map((f) => smooth(f, sigma));
    for (let order = 0; order <= BASE_ORDER; order++) {
      const f = 2 ** (BASE_ORDER - order);
      const level = smoothed.map((s) => (f === 1 ? s : shrink(s, f)));
      mkdirSync(join(dir, `Norder${order}`), { recursive: true });
      for (let n = 0; n < 12 * 4 ** order; n++) {
        const { face, row, col } = faceOf(order, n);
        const tile = blank(512, 512);
        blit(level[face] as Grey, col * 512, row * 512, 512, tile, 0, 0);
        const data = webp(tile);
        bytes += data.length;
        writeFileSync(join(dir, `Norder${order}`, `Npix${n}.webp`), data);
      }
    }
    result = { channel, orders: [...Array(BASE_ORDER + 1).keys()], sigma, bytes, filled };
    console.log(`base tiles, channel ${channel}: σ ${sigma}, ${(bytes / 1e6).toFixed(2)} MB`);
    if (bytes <= BASE_BUDGET) break;
  }
  if (!result) throw new Error('no base tiles');
  return result;
}

// ----- Main -----------------------------------------------------------------------------------

function propertiesOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^([a-z_0-9]+)\s*=\s*(.*)$/i.exec(line.trim());
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main(): Promise<void> {
  const what = process.argv[2] ?? 'all';
  if (!['all', 'allsky', 'base'].includes(what)) throw new Error('usage: seed-tiles.ts [all|allsky|base]');
  const props = propertiesOf((await download(`${SPHEREX_HIPS}/properties`)).toString());
  const lams = (props.data_cube_crval3_arr ?? '').split(/\s+/).map(Number);
  if (lams.length !== CHANNEL_LAM.length || lams.some((l, i) => Math.abs(l - (CHANNEL_LAM[i] ?? 0)) > 1e-6)) {
    throw new Error('IRSA lists other channel wavelengths than src/sky/hips.ts: update CHANNEL_LAM');
  }
  mkdirSync(OUT, { recursive: true });
  const manifestFile = join(OUT, 'manifest.json');
  const old = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  const allsky = what === 'base' ? old.allsky : await buildAllsky();
  const base = what === 'allsky' ? old.base : await buildBase();
  const manifest = {
    about:
      'Low-resolution SPHEREx sky shipped with Sima (SPEC 6.2). Built by scripts/seed-tiles.ts.',
    source: SPHEREX_HIPS,
    title: props.obs_title,
    release: props.obs_collection,
    hipsReleaseDate: props.hips_release_date,
    fetched: new Date().toISOString().slice(0, 10),
    processing:
      'Holes (bright star centres) filled from their rim; each of the 12 base faces smoothed (Gaussian, σ in pixels); WebP quality 80, filter-strength 0.',
    defaultChannel: DEFAULT_CHANNEL,
    channels: CHANNELS.map((i) => ({ index: i, lam: CHANNEL_LAM[i] })),
    allsky,
    base,
  };
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 1)}\n`);
  let total = 0;
  const walk = (d: string): void => {
    for (const name of execFileSync('ls', [d]).toString().split('\n').filter(Boolean)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else total += statSync(p).size;
    }
  };
  walk(OUT);
  console.log(`public/sky-seed: ${(total / 1e6).toFixed(2)} MB`);
}

await main();
