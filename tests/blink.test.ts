// Blinking (lane B): groups, same colour, blending, Difference, brightness matching.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blend, difference, groupFrames, matchGains, sameColourOnly } from '../src/core/blink.ts';
import { loadField } from './core-data.ts';

test('one group per pass (Explore) and one per visit (Measure), lettered', async () => {
  const field = await loadField('barnard');
  const byWindow = groupFrames(field, 5, 'window');
  assert.deepEqual(byWindow.map((g) => g.letter), ['A', 'B', 'C']);
  assert.ok(byWindow.every((g) => g.frames.length === 4 && g.visit === null));
  const byVisit = groupFrames(field, 5, 'visit');
  assert.equal(byVisit.length, 12);
  assert.ok(byVisit.every((g) => g.frames.length === 1 && g.key === `w${g.window}v${g.visit}`));
  assert.ok(byVisit.every((g, i) => i === 0 || g.mjd >= byVisit[i - 1]!.mjd));
});

test("R Draconis's months with no exposure in a detector are left out", async () => {
  const field = await loadField('r-dra');
  const groups = groupFrames(field, 3, 'window');
  assert.ok(groups.length < field.windows);
  assert.ok(groups.every((g) => g.frames.length > 0));
});

test('same colour only keeps one matching exposure per pass and names the rest', async () => {
  const field = await loadField('wise-0855');
  const groups = groupFrames(field, 5, 'window');
  const ref = field.frames[groups[0]!.frames[0]!]!;
  const r = sameColourOnly(field, groups, ref.lam);
  assert.ok(r.groups.every((g) => g.frames.length === 1));
  for (const g of r.groups) {
    const f = field.frames[g.frames[0]!]!;
    assert.ok(Math.abs(f.lam - ref.lam) <= (f.bw + ref.bw) / 4 + 1e-9);
  }
  assert.equal(r.groups.length + r.missing.length, groups.length);
  assert.ok(r.missing.every((m) => /^pass [A-Z]$/.test(m)));
});

test('blend and Difference: sky taken off when matching; a still star cancels', async () => {
  const field = await loadField('barnard');
  const groups = groupFrames(field, 6, 'window');
  const pic = blend(field, groups[0]!, 'mean', true);
  assert.equal(pic.length, field.n * field.n);
  const vals = [...pic].filter(Number.isFinite).sort((a, b) => a - b);
  assert.ok(Math.abs(vals[vals.length >> 1]!) < 3 * field.noise[5]!, 'sky near zero');
  const diff = difference(field, groups, 0, 'mean', true);
  // Barnard's Star moves about 0.9 pixels between passes: Difference shows a white and dark
  // pair near it, while a bright still star elsewhere nearly cancels.
  const finite = [...diff].filter(Number.isFinite);
  assert.ok(Math.max(...finite) > 50 * field.noise[5]!);
  assert.ok(Math.min(...finite) < -50 * field.noise[5]!);
  const empty = blend(field, { ...groups[0]!, frames: [] }, 'mean', true);
  assert.ok(empty.every((v) => Number.isNaN(v)));
});

test('brightness-match gains: 1 for the reference of each detector', async () => {
  const field = await loadField('rw-aur');
  const gains = matchGains(field);
  for (let det = 1; det <= 6; det++) {
    const first = field.frames.find((f) => f.det === det && f.sigma > 0);
    if (first) assert.equal(gains[first.i], 1);
  }
  assert.ok(gains.every((g) => g >= 0.25 && g <= 4));
});

test('brightness-match gains follow the field stars, not a variable star\'s glow (R Draconis D3)', async () => {
  // June 2026 (QR3): R Draconis is at its faintest, so its glow is 2 to 6 times weaker than in the
  // reference, while field stars agree within about 15% (same calibration files in DR1 and QR3).
  const field = await loadField('r-dra');
  const gains = matchGains(field);
  // MJD 61192 to 61222 is June 2026 (UTC).
  const june = field.frames.filter((f) => f.det === 3 && f.mjd >= 61192 && f.mjd < 61222);
  assert.ok(june.length >= 2);
  for (const f of june) assert.ok(gains[f.i]! > 0.8 && gains[f.i]! < 1.25, `${f.id}: ${gains[f.i]}`);
});
