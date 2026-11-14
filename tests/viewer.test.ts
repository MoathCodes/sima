// Tests for lane D's pure helpers: the sky-map preview's HEALPix lookup (src/viewer/preview.ts)
// and the picture cache's median (src/viewer/paint.ts). Owner: lane D.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameFor, healpixXY, hipsPixel } from '../src/viewer/preview.ts';

test('healpixXY: the poles and the equator land on the right faces', () => {
  assert.equal(healpixXY(0, 89.9, 3).face, 0); // north polar cap, first quarter
  assert.equal(healpixXY(100, 89.9, 3).face, 1);
  assert.equal(healpixXY(0, -89.9, 3).face, 8); // south polar cap
  assert.equal(healpixXY(1, 0, 3).face, 4); // equatorial face centred on RA 0°
  assert.equal(healpixXY(91, 0, 3).face, 5); // centred on RA 90°
});

test('healpixXY: pixel indices stay inside the face', () => {
  for (let ra = 0; ra < 360; ra += 17.3) {
    for (let dec = -89; dec <= 89; dec += 11.7) {
      const { face, x, y } = healpixXY(ra, dec, 14);
      assert.ok(face >= 0 && face < 12, `face at ${ra}, ${dec}`);
      assert.ok(x >= 0 && x < 2 ** 14 && y >= 0 && y < 2 ** 14, `x, y at ${ra}, ${dec}`);
    }
  }
});

test('hipsPixel: nearby points share a tile and sit about 12.9″ apart per map pixel', () => {
  const a = hipsPixel(279.2347, 38.7837);
  const b = hipsPixel(279.2347, 38.7837 + 12.88 / 3600);
  assert.equal(a.tile, b.tile);
  const step = Math.hypot(a.col - b.col, a.row - b.row);
  assert.ok(step > 0.5 && step < 1.6, `one map pixel, got ${step}`);
});

test('frameFor: the cube frame nearest a wavelength, never the blank frames 50 and 51', () => {
  assert.equal(frameFor(0.75), 0);
  assert.equal(frameFor(5.0), 101);
  assert.equal(frameFor(2.0), 42);
  for (let lam = 2.3; lam < 2.6; lam += 0.01) assert.ok(![50, 51].includes(frameFor(lam)));
});
