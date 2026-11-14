// The motion handle on the Stack view (O-V6): the arrow ↔ motion mapping, keyboard nudges, the
// trial track, the stack sharpening near the catalogue motion (WISE 0855−0714), and the update
// rate (10 a second or better for 24 exposures).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_MAX_SPEED,
  NUDGE,
  NUDGE_BIG,
  clampMotion,
  maxSpeed,
  motionToOffset,
  motionWords,
  nudge,
  offsetToMotion,
  sameMotion,
  speedAndAngle,
  trialTrack,
} from '../src/core/motion.ts';
import { stackSteps } from '../src/core/stack.ts';
import { mjdToYear, propagate } from '../src/core/astro.ts';
import { loadField, loadSet } from './core-data.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

const run = <T>(it: Generator<void, T>): T => {
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
};

test('the arrow points the way the object moves on the picture: left is east, up is north', () => {
  const max = 12_000;
  const left = offsetToMotion(-50, 0, 100, max);
  near(left.pmra, 6000);
  near(left.pmdec, 0);
  const up = offsetToMotion(0, -100, 100, max);
  near(up.pmra, 0);
  near(up.pmdec, 12_000);
  // West and south are the negatives.
  assert.ok(offsetToMotion(30, 40, 100, max).pmra < 0 && offsetToMotion(30, 40, 100, max).pmdec < 0);
});

test('the arrow and the motion map both ways, and the arrow stops at its full length', () => {
  const max = 15_000;
  for (const m of [
    { pmra: -8118, pmdec: 680 },
    { pmra: -801.551, pmdec: 10362.394 },
    { pmra: 0, pmdec: 0 },
  ]) {
    const o = motionToOffset(m, 120, max);
    const back = offsetToMotion(o.dx, o.dy, 120, max);
    near(back.pmra, m.pmra, 1e-6);
    near(back.pmdec, m.pmdec, 1e-6);
  }
  // Past the full length the speed is held at the maximum, the direction kept.
  const far = offsetToMotion(-300, -400, 100, max);
  near(Math.hypot(far.pmra, far.pmdec), max, 1e-6);
  near(far.pmra / far.pmdec, 3 / 4, 1e-9);
  assert.deepEqual(clampMotion({ pmra: 3, pmdec: 4 }, 10), { pmra: 3, pmdec: 4 });
});

test('the full length is 12″/yr, or 1.5 times a faster catalogue motion', () => {
  assert.equal(maxSpeed(null), MIN_MAX_SPEED);
  assert.equal(maxSpeed({ pmra: 4000, pmdec: 3000 }), MIN_MAX_SPEED);
  near(maxSpeed({ pmra: 0, pmdec: 10_000 }), 15_000);
});

test('arrow keys nudge the tip the way they point; Shift is ten times bigger; other keys do nothing', () => {
  const m = { pmra: 0, pmdec: 0 };
  assert.deepEqual(nudge(m, 'ArrowLeft', false, 12_000), { pmra: NUDGE, pmdec: 0 });
  assert.deepEqual(nudge(m, 'ArrowRight', false, 12_000), { pmra: -NUDGE, pmdec: 0 });
  assert.deepEqual(nudge(m, 'ArrowUp', true, 12_000), { pmra: 0, pmdec: NUDGE_BIG });
  assert.deepEqual(nudge(m, 'ArrowDown', false, 12_000), { pmra: 0, pmdec: -NUDGE });
  assert.equal(nudge(m, 'Enter', false, 12_000), null);
  // Held at the full length.
  const edge = nudge({ pmra: 0, pmdec: 12_000 }, 'ArrowUp', true, 12_000)!;
  near(edge.pmdec, 12_000);
});

test('speed, direction and words', () => {
  const w = speedAndAngle({ pmra: -8118, pmdec: 680 });
  near(w.speed, Math.hypot(8118, 680) / 1000);
  assert.equal(Math.round(w.pa), 275);
  assert.equal(motionWords({ pmra: -8118, pmdec: 680 }), '8.15″/yr toward the west (position angle 275°)');
  assert.equal(motionWords({ pmra: 0, pmdec: 0 }), 'standing still');
  assert.ok(sameMotion({ pmra: 100, pmdec: 200 }, { pmra: 100.4, pmdec: 199.7 }));
  assert.ok(!sameMotion({ pmra: 100, pmdec: 200 }, { pmra: 102, pmdec: 200 }));
});

test('a trial track starts where the catalogue puts the object at the frames’ mean date', async () => {
  const set = await loadSet('wise-0855');
  const cat = set.data.catalogue;
  const mjds = set.data.frames.filter((f) => f.det === 5).map((f) => f.mjd);
  const t = trialTrack(mjds, cat, { pmra: 1000, pmdec: -500 });
  const epoch = mjds.map(mjdToYear).reduce((a, b) => a + b, 0) / mjds.length;
  near(t.ep, epoch, 1e-9);
  const p = propagate(cat.ra, cat.dec, cat.pmra, cat.pmdec, cat.ep, epoch);
  near(t.ra, p.ra, 1e-12);
  near(t.dec, p.dec, 1e-12);
  assert.equal(t.pmra, 1000);
  assert.match(t.from, /trial motion.*not a catalogue value/);
  // Without a catalogue, it starts at the place given.
  const free = trialTrack(mjds, { ra: 10, dec: -5 }, { pmra: 0, pmdec: 0 });
  assert.deepEqual([free.ra, free.dec], [10, -5]);
});

test('WISE 0855−0714: the stack is strongest near the catalogue motion, and the checks stay put', async () => {
  const set = await loadSet('wise-0855');
  const field = await loadField('wise-0855');
  const cat = set.data.catalogue;
  const mjds = field.frames.filter((f) => f.det === 5).map((f) => f.mjd);
  const snr = (k: number) =>
    run(stackSteps(field, 5, trialTrack(mjds, cat, { pmra: cat.pmra * k, pmdec: cat.pmdec * k }), 'mean', set, 'trial motion'));
  const at = snr(1);
  const still = snr(0);
  const half = snr(0.5);
  const fast = snr(1.5);
  // Measured here: 15.3σ at the catalogue motion, 10.3σ at half of it, 10.1σ at 1.5 times.
  assert.ok(at.along.snr > 13, `${at.along.snr}`);
  assert.ok(at.along.snr > half.along.snr + 3 && at.along.snr > fast.along.snr + 3);
  assert.ok(still.along.snr < 7);
  // The "not shifted" check is the same whatever the trial (it does not move with the handle).
  near(at.controls[0].snr, half.controls[0].snr, 1e-9);
  near(at.controls[0].snr, still.along.snr, 1e-9);
  assert.equal(at.along.label, 'Along the trial motion');
  assert.match(at.note, /moves with the trial motion/);
});

test('update rate: a trial stack of 24 or more exposures takes well under 100 ms (10 a second)', async () => {
  // R Draconis has 30 exposures in D3, on a 119-pixel grid (the largest shipped).
  const set = await loadSet('r-dra');
  const field = await loadField('r-dra');
  const det = 3;
  const n = field.frames.filter((f) => f.det === det).length;
  assert.ok(n >= 24, `${n}`);
  const mjds = field.frames.filter((f) => f.det === det).map((f) => f.mjd);
  const cat = set.data.catalogue;
  run(stackSteps(field, det, trialTrack(mjds, cat, { pmra: 0, pmdec: 0 }), 'mean', set, 'trial motion'));
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    run(
      stackSteps(field, det, trialTrack(mjds, cat, { pmra: 500 * i, pmdec: -300 * i }), 'mean', set, 'trial motion'),
    );
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[5]!;
  // The worker gets this plus a copy of the pictures back; on a quiet machine about 25 ms.
  if (process.env.SIMA_TIMING) console.log(`trial stack: median ${median.toFixed(1)} ms over ${n} exposures`);
  assert.ok(median < 100, `median ${median.toFixed(0)} ms over ${n} exposures`);
});
