/**
 * The intro's sphere maths (src/intro/sphere.ts): HEALPix pixels against healpy, Allsky
 * positions, and the camera that ends on Barnard's Star with north up and east to the left.
 */
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import {
  allskyPixel,
  lookAt,
  nestPixel,
  radec,
  slerp,
  toSky,
} from '../src/intro/sphere.ts';
import { introWanted } from '../src/intro/wanted.ts';

// healpy 1.18: ang2pix(nside, ra, dec, lonlat=True, nest=True) at nside 512 and 8.
const HEALPY: [number, number, number, number][] = [
  [269.452, 4.693, 2034008, 496],
  [0, 0, 1245184, 304],
  [45, 89, 262092, 63],
  [300, -60, 2930384, 715],
  [120, 30, 398950, 97],
  [200, -89.5, 2621473, 640],
  [10, 41.8, 173418, 42],
  [359.9, -41.9, 2970964, 725],
  [90, 0.1, 1507328, 368],
  [180, 70, 765630, 186],
];

test('nested HEALPix pixels match healpy', () => {
  for (const [ra, dec, p512, p8] of HEALPY) {
    assert.equal(nestPixel(512, ra, dec), p512, `nside 512 at ${ra}, ${dec}`);
    assert.equal(nestPixel(8, ra, dec), p8, `nside 8 at ${ra}, ${dec}`);
  }
});

test('an Allsky position lands in its order-3 tile, on the pixel healpy names', () => {
  for (const [ra, dec, p512, p8] of HEALPY) {
    const at = allskyPixel(ra, dec);
    assert.equal(at.tile, p8);
    // The order-9 pixel inside the 64×64 tile: rows carry the x bits, columns the y bits.
    const sub = p512 - p8 * 4096;
    let row = 0;
    let col = 0;
    for (let bit = 0; bit < 6; bit++) {
      row |= ((sub >> (2 * bit)) & 1) << bit;
      col |= ((sub >> (2 * bit + 1)) & 1) << bit;
    }
    assert.equal(Math.floor(at.x) - (p8 % 27) * 64, col, `column at ${ra}, ${dec}`);
    assert.equal(Math.floor(at.y) - Math.floor(p8 / 27) * 64, row, `row at ${ra}, ${dec}`);
  }
});

test('the camera looks at its target with north up and east to the left', () => {
  const q = lookAt(269.452, 4.693);
  const centre = radec(toSky(q, [0, 0, 1]));
  assert.ok(Math.abs(centre.ra - 269.452) < 1e-5 && Math.abs(centre.dec - 4.693) < 1e-5);
  const up = radec(toSky(q, [0, 0.01, 1]));
  assert.ok(up.dec > 4.693, 'up is north');
  const left = radec(toSky(q, [0.01, 0, 1])); // +x is east, drawn on the left
  assert.ok(left.ra > 269.452, 'left is east');
});

test('turning the globe ends exactly on the target view', () => {
  const a = lookAt(10, 20);
  const b = lookAt(100, -5);
  assert.deepEqual(slerp(a, b, 1).map((v) => +v.toFixed(9)), b.map((v) => +v.toFixed(9)));
  assert.deepEqual(slerp(a, b, 0).map((v) => +v.toFixed(9)), a.map((v) => +v.toFixed(9)));
});

test("index.html's early check and introWanted agree on when the intro plays", () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = /<script>\s*(\(function \(\) \{[\s\S]*?\}\)\(\);)\s*<\/script>/.exec(html)?.[1];
  assert.ok(script, 'index.html has the inline intro check');
  const cases: [string, string, boolean | null][] = [];
  for (const search of ['', '?intro=1', '?intro=0', '?embed=1', '?embed=1&intro=1', '?ra=10&dec=5'])
    for (const hash of ['', '#w=abc', '#x=1&w=abc', '#nothing'])
      for (const seen of [true, false, null]) cases.push([search, hash, seen]);
  for (const [search, hash, seen] of cases) {
    const dataset: Record<string, string> = {};
    runInNewContext(script!, {
      URLSearchParams,
      location: { search, hash },
      localStorage: {
        getItem: () => {
          if (seen === null) throw new Error('blocked');
          return seen ? '1' : null;
        },
      },
      document: { documentElement: { dataset } },
    });
    assert.equal('intro' in dataset, introWanted(search, hash, seen), `${search} ${hash} ${seen}`);
  }
  assert.equal(introWanted('', '', false), true, 'a first visit plays it');
  assert.equal(introWanted('?intro=1', '#w=abc', true), false, 'a workspace link never plays it');
});

test('the globe hands over to the sky map at the map’s own scale, and lands on its view', async () => {
  const { sceneAt, handFov, mapScale, T } = await import('../src/intro/scene.ts');
  for (const [w, h] of [
    [1900, 1030],
    [1366, 768],
    [390, 844],
  ] as const) {
    const fov = 1.9;
    const from = handFov(w, h, fov);
    const land = { q: lookAt(269.4485, 4.7394), fov, x: w / 2, y: h / 2, from, fromScale: mapScale(w, from) };
    const plan = { reduced: false, skyChannel: 42, revealAt: 3, handAt: null, land };
    const has = () => true;
    const before = sceneAt(plan, 3 + T.hand - 1e-6, w, h, has);
    const after = sceneAt({ ...plan, handAt: 3 + T.hand }, 3 + T.hand, w, h, has);
    assert.ok(Math.abs(before.radius / land.fromScale - 1) < 1e-3, `${w}: the globe reaches the map's scale`);
    assert.ok(Math.abs(after.radius / land.fromScale - 1) < 1e-9, `${w}: the landing starts there`);
    assert.ok(Math.hypot(w, h) / 2 < land.fromScale, `${w}: the globe fills the window first`);
    const end = sceneAt({ ...plan, handAt: 3 + T.hand }, 3 + T.hand + T.land + 1e-9, w, h, has);
    assert.ok(end.done && Math.abs(end.radius / mapScale(w, fov) - 1) < 1e-9, `${w}: lands on 1.9°`);
  }
});

test('the ring fades in from when its first picture is ready, never popping in half bright', async () => {
  const { sceneAt, T } = await import('../src/intro/scene.ts');
  const [w, h] = [1366, 768];
  const land = { q: lookAt(269.4485, 4.7394), fov: 1.9, x: w / 2, y: h / 2, from: 55, fromScale: 2000 };
  const plan = { reduced: false, skyChannel: 42, revealAt: null, handAt: null, land };
  const has = () => true;
  // On time: as before.
  assert.equal(sceneAt(plan, T.ringIn[0], w, h, has, 0).ring, 0);
  // A picture that comes late, at 1.2 s: still dark then, and the full fade-in from there.
  assert.equal(sceneAt(plan, 1.2, w, h, has, 1.2).ring, 0);
  assert.ok(sceneAt(plan, 1.3, w, h, has, 1.2).ring < 0.05, 'a gentle start');
  const span = T.ringIn[1] - T.ringIn[0];
  assert.ok(Math.abs(sceneAt(plan, 1.2 + span, w, h, has, 1.2).ring - 1) < 1e-9, 'full after the fade');
});

test("on a phone the disc rests where Discover's globe will, and lands without sliding", async () => {
  const { sceneAt, phoneBox, phoneDisc, T } = await import('../src/intro/scene.ts');
  const { lookAt } = await import('../src/intro/sphere.ts');
  const [w, h] = [390, 844];
  // The sky's box (sky.ts freeBox): under the top row and its note, above the sheet's third.
  assert.deepEqual(phoneBox(w, h), { x: 0, y: 91, w: 390, h: 472 });
  const home = phoneDisc(phoneBox(w, h));
  assert.deepEqual(home, { x: 195, y: 327, r: 171 });
  // Discover's globe at exactly that place: the disc never moves or grows on the way there.
  const land = { q: lookAt(269.45, 4.69), fov: 60, x: home.x, y: home.y, from: 60, fromScale: home.r };
  const plan = { reduced: false, skyChannel: 42, revealAt: 4.1, handAt: null, land, home };
  const has = () => true;
  for (const t of [0.5, 3, 4.1 + T.turn[0], 4.1 + T.turn[1] - 0.1]) {
    const s = sceneAt(plan, t, w, h, has);
    assert.deepEqual([s.cx, s.cy, Math.round(s.radius)], [home.x, home.y, home.r], `at ${t} s`);
  }
  // A short window (a phone held sideways) keeps room under the disc for the two lines.
  const { globeRadius } = await import('../src/intro/scene.ts');
  assert.ok(390 / 2 + globeRadius(844, 390) < 390 - 85, "the disc ends 85 px above the bottom");
  assert.equal(globeRadius(1366, 650), 195, 'desktop unchanged');
});
