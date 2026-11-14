// Tests for the sky's tile and channel rules (src/sky/hips.ts), the service worker's copy of them
// (public/sky-tiles-sw.js) and the shipped low-resolution sky (public/sky-seed). Owner: lane C.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import {
  ALLSKY_HEIGHT,
  ALLSKY_WIDTH,
  CHANNELS,
  CHANNEL_LAM,
  DEFAULT_CHANNEL,
  allskyBox,
  channelFor,
  deinterleave,
  faceOf,
  irsaTileUrl,
  subTilePosition,
} from '../src/sky/hips.ts';

test('100 channels hold a map; 50 and 51 are skipped (SKY-2)', () => {
  assert.equal(CHANNEL_LAM.length, 102);
  assert.equal(CHANNELS.length, 100);
  assert.ok(!CHANNELS.includes(50) && !CHANNELS.includes(51));
  for (let lam = 0.75; lam <= 5.0; lam += 0.01) {
    const ch = channelFor(lam);
    assert.ok(ch !== 50 && ch !== 51, `${lam} µm gave blank channel ${ch}`);
  }
});

test('a wavelength picks its nearest channel', () => {
  assert.equal(channelFor(2.0), 42); // 1.995 µm
  assert.equal(DEFAULT_CHANNEL, 42);
  assert.equal(channelFor(0.1), 0);
  assert.equal(channelFor(9), 101);
  assert.equal(CHANNEL_LAM[channelFor(3.3)], 3.293);
});

test('tile nesting: child c sits at row c&1, column c>>1', () => {
  assert.deepEqual(subTilePosition(0), { row: 0, col: 0 });
  assert.deepEqual(subTilePosition(1), { row: 1, col: 0 });
  assert.deepEqual(subTilePosition(2), { row: 0, col: 1 });
  assert.deepEqual(subTilePosition(3), { row: 1, col: 1 });
  assert.equal(deinterleave(0b0101), 0b11);
  // Every order-3 position inside a face is used exactly once.
  const seen = new Set<string>();
  for (let n = 0; n < 64; n++) {
    const f = faceOf(3, n);
    assert.equal(f.face, 0);
    seen.add(`${f.row},${f.col}`);
  }
  assert.equal(seen.size, 64);
});

test('Allsky layout: 27 tiles of 64 px a row, 1728 × 1856', () => {
  assert.equal(ALLSKY_WIDTH, 1728);
  assert.equal(ALLSKY_HEIGHT, 1856);
  assert.deepEqual(allskyBox(28), { x: 64, y: 64, size: 64 });
  assert.equal(
    irsaTileUrl(40, 5, 12345),
    'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/Norder5/Dir10000/Npix12345_40.png',
  );
  assert.ok(irsaTileUrl(0, 1, 3).endsWith('/Norder1/Dir0/Npix3.png'));
});

test('the service worker repeats the same tile rules', () => {
  const code = readFileSync('public/sky-tiles-sw.js', 'utf8');
  const self = {
    addEventListener() {},
    registration: { scope: 'http://localhost/' },
    location: { origin: 'http://localhost' },
  };
  const sw = runInNewContext(
    `${code}\n;({ deinterleave, subTilePosition, allskyBox, irsaTileUrl })`,
    { self, URL, caches: {}, Response: class {}, fetch() {}, console },
  ) as {
    subTilePosition: typeof subTilePosition;
    allskyBox: (n: number) => { x: number; y: number };
    irsaTileUrl: typeof irsaTileUrl;
  };
  for (let s = 0; s < 4096; s += 7) {
    assert.deepEqual({ ...sw.subTilePosition(s) }, subTilePosition(s));
  }
  for (let n = 0; n < 768; n += 13) {
    const box = allskyBox(n);
    assert.deepEqual({ ...sw.allskyBox(n) }, { x: box.x, y: box.y });
  }
  for (const [ch, k, n] of [
    [0, 0, 5],
    [42, 5, 12287],
    [101, 4, 3071],
  ] as const) {
    assert.equal(sw.irsaTileUrl(ch, k, n), irsaTileUrl(ch, k, n));
  }
});

function size(dir: string): number {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    total += statSync(p).isDirectory() ? size(p) : statSync(p).size;
  }
  return total;
}

test('the shipped low-resolution sky fits its budget and matches IRSA (SPEC 6.2)', (t) => {
  const file = 'public/sky-seed/manifest.json';
  if (!existsSync(file)) return t.skip('no public/sky-seed yet: run npm run seed:sky');
  const m = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(m.defaultChannel, DEFAULT_CHANNEL);
  assert.deepEqual(
    m.channels.map((c: { lam: number }) => c.lam),
    CHANNELS.map((i) => CHANNEL_LAM[i]),
  );
  assert.ok(size('public/sky-seed') <= 13_000_000, 'public/sky-seed is over 13 MB');
  for (const a of m.allsky ?? []) {
    assert.ok(existsSync(`public/sky-seed/allsky/${a.channel}.webp`));
  }
  assert.equal(m.base.channel, DEFAULT_CHANNEL);
  assert.ok(existsSync(`public/sky-seed/tiles/${DEFAULT_CHANNEL}/Norder0/Npix11.webp`));
});
