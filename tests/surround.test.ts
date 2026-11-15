// Tests for the frame's fields wider than the exposures (src/viewer/surround.ts): which real set
// covers a field, which wider patch to ask the live service for, and which grid pixels no
// exposure covers. Owner: lane D.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  centreOf,
  coverageMask,
  covers,
  liveFov,
  maskOutline,
  offsetArcmin,
  overlaps,
  widerPatch,
} from '../src/viewer/surround.ts';
import { buildRealField } from '../src/core/real.ts';
import { loadSet, target } from './core-data.ts';
import type { TargetData } from '../src/core/types.ts';

/** A point `east`, `north` arcmin from a centre. */
function moved(c: { ra: number; dec: number }, east: number, north: number) {
  return {
    ra: c.ra + east / 60 / Math.cos((c.dec * Math.PI) / 180),
    dec: c.dec + north / 60,
  };
}

test('offsetArcmin: east and north in arcmin, across RA 0', () => {
  const o = offsetArcmin({ ra: 359.99, dec: 0 }, 0.01, 0.5);
  assert.ok(Math.abs(o.x - 1.2) < 1e-6, `x ${o.x}`);
  assert.ok(Math.abs(o.y - 30) < 1e-6, `y ${o.y}`);
});

test('covers: a 6′ shipped patch holds 3′ and 6′ in its middle, not 12′, 24′ or a pan', async () => {
  const set = await loadSet('barnard');
  const c = centreOf(set.data);
  assert.ok(covers(set.data, c.ra, c.dec, 3));
  assert.ok(covers(set.data, c.ra, c.dec, 6));
  assert.ok(!covers(set.data, c.ra, c.dec, 12));
  assert.ok(!covers(set.data, c.ra, c.dec, 24));
  const p = moved(c, 1, 0);
  assert.ok(covers(set.data, p.ra, p.dec, 3), 'a 3′ field 1′ off still fits');
  assert.ok(!covers(set.data, p.ra, p.dec, 6), 'a 6′ field 1′ off sticks out');
});

test('covers: a live 24′ patch (0.41° cutouts) holds 24′ at its centre', async () => {
  const set = await loadSet('barnard');
  const c = centreOf(set.data);
  const wide: TargetData = { ...set.data, fov: 24, size: 0.41 };
  assert.ok(covers(wide, c.ra, c.dec, 24));
  assert.ok(!covers(wide, c.ra, c.dec, 48));
  const p = moved(c, 5, 5);
  assert.ok(covers(wide, p.ra, p.dec, 12));
});

test('overlaps: a pan still on the exposures, and one off them', async () => {
  const set = await loadSet('barnard');
  const c = centreOf(set.data);
  const near = moved(c, 4, 0);
  const far = moved(c, 0, -20);
  assert.ok(overlaps(set.data, near.ra, near.dec, 6));
  assert.ok(!overlaps(set.data, far.ra, far.dec, 6));
});

test('liveFov: the smallest live field size that holds a field', () => {
  assert.equal(liveFov(3), 3);
  assert.equal(liveFov(5), 6);
  assert.equal(liveFov(12), 12);
  assert.equal(liveFov(24), 24);
  assert.equal(liveFov(30), 48);
  assert.equal(liveFov(100), 48);
});

test('widerPatch: centred on the spot when one step up holds the field, else on the field', () => {
  const home = { ra: 269.446, dec: 4.769 };
  assert.deepEqual(widerPatch(home, home.ra, home.dec, 12), { ...home, fov: 12 });
  assert.deepEqual(widerPatch(home, home.ra, home.dec, 48), { ...home, fov: 48 });
  // A 6′ field panned 2′: one 12′ patch around the spot holds it, and every small pan after it.
  const p = moved(home, 2, 0);
  assert.deepEqual(widerPatch(home, p.ra, p.dec, 6), { ...home, fov: 12 });
  // Panned 10′: a patch around the spot would be 26′ or more, so the field gets its own 6′.
  const q = moved(home, 10, 0);
  assert.deepEqual(widerPatch(home, q.ra, q.dec, 6), { ra: q.ra, dec: q.dec, fov: 6 });
  // A 24′ field panned 5′ fits a 48′ patch around the spot.
  const r = moved(home, 0, 5);
  assert.deepEqual(widerPatch(home, r.ra, r.dec, 24), { ...home, fov: 48 });
});

test('coverageMask: a field inside the cutouts is all covered; a panned one is bare on one side', async () => {
  const set = await loadSet('barnard');
  const t = target('barnard');
  const c = centreOf(set.data);
  const inside = buildRealField(set, { ra: c.ra, dec: c.dec, fov: 3, target: t });
  assert.equal(coverageMask(set, inside), null);

  const p = moved(c, 3, 0); // 3′ east: the east half of a 6′ field is past the cutouts
  const panned = buildRealField(set, { ra: p.ra, dec: p.dec, fov: 6, target: t });
  const mask = coverageMask(set, panned);
  assert.ok(mask, 'some pixels are bare');
  const n = panned.n;
  const mid = (n - 1) / 2;
  // East is left on the grid (cd[0] < 0): the left columns are bare, the right ones covered.
  assert.equal(mask[mid * n + 1], 0, 'east edge bare');
  assert.equal(mask[mid * n + n - 2], 1, 'west edge covered');
  assert.equal(coverageMask(set, panned), mask, 'kept per field');
});

test('maskOutline: the border of a bare corner, runs joined', () => {
  // 3 × 3, the top-left 2 × 2 bare.
  const mask = Uint8Array.from([0, 0, 1, 0, 0, 1, 1, 1, 1]);
  const segs = maskOutline(mask, 3);
  const len = segs.reduce((s, [x0, y0, x1, y1]) => s + Math.abs(x1 - x0) + Math.abs(y1 - y0), 0);
  // The covered L: its outer border (3 + 3 + 1 + 1, with the grid edge) plus the inner corner (2 + 2).
  assert.equal(len, 12);
  assert.ok(segs.length <= 6, `joined into runs, got ${segs.length}`);
});
