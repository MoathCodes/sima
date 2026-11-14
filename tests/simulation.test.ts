// Tests for the labelled practice simulation (src/core/schedule.ts, field.ts, frames.ts).
// Owner: lane B.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAND_EDGES } from '../src/core/instrument.ts';
import {
  PASS_DAYS,
  RESOLVING_POWER,
  SIM_START,
  SIM_VISITS,
  SIM_WINDOWS,
  simSchedule,
} from '../src/core/schedule.ts';
import { MOVER_JUMP_PX, PLANET_JUMP_PX, SCENARIOS, simSources } from '../src/core/field.ts';
import { simulate } from '../src/core/frames.ts';
import type { Field, Frame } from '../src/core/types.ts';

const TARGETS = [
  [269.45, 4.74],
  [331.08, -56.79],
  [133.79, -7.24],
  [76.96, 30.4],
  [248.17, 66.76],
];

/** Flux-weighted centre of (pixel − sky) in a 7 × 7 box around (x, y), skipping flagged pixels. */
function centreNear(f: Frame, n: number, x: number, y: number): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let s = 0;
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let j = cy - 3; j <= cy + 3; j++) {
    for (let i = cx - 3; i <= cx + 3; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n || f.bad[j * n + i]) continue;
      const v = Math.max(0, f.pix[j * n + i]! - f.sky);
      sx += v * i;
      sy += v * j;
      s += v;
    }
  }
  return { x: sx / s, y: sy / s };
}

/** The brightest usable pixel within r pixels of (x, y). */
function brightestNear(
  f: Frame,
  n: number,
  x: number,
  y: number,
  r: number,
): { x: number; y: number } {
  let best = -Infinity;
  let bx = x;
  let by = y;
  for (let j = Math.max(0, Math.round(y - r)); j <= Math.min(n - 1, Math.round(y + r)); j++) {
    for (let i = Math.max(0, Math.round(x - r)); i <= Math.min(n - 1, Math.round(x + r)); i++) {
      if (f.bad[j * n + i]) continue;
      const v = f.pix[j * n + i]!;
      if (v > best) {
        best = v;
        bx = i;
        by = j;
      }
    }
  }
  return { x: bx, y: by };
}

/** Mean of the frames of one detector and window. */
function stackOf(field: Field, det: number, window: number): Frame {
  const fs = field.frames.filter((f) => f.det === det && f.window === window);
  const pix = new Float32Array(field.n * field.n);
  const bad = new Uint8Array(field.n * field.n);
  for (const f of fs) {
    for (let k = 0; k < pix.length; k++) {
      pix[k] = pix[k]! + f.pix[k]! / fs.length;
      if (f.bad[k]) bad[k] = 1;
    }
  }
  const sky = fs.reduce((a, f) => a + f.sky, 0) / fs.length;
  return { ...fs[0]!, pix, bad, sky };
}

test('schedule: every detector at every visit, passes half a year apart, visits days apart', () => {
  const s = simSchedule({ start: 60000, windows: 3, visits: 2, seed: 5 });
  assert.equal(s.length, 3 * 2 * 6);
  for (let w = 0; w < 3; w++) {
    for (let v = 0; v < 2; v++) {
      const dets = s.filter((e) => e.window === w && e.visit === v).map((e) => e.det);
      assert.deepEqual(dets.sort(), [1, 2, 3, 4, 5, 6]);
    }
    const first = s.filter((e) => e.window === w && e.visit === 0)[0]!;
    assert.ok(Math.abs(first.mjd - (60000 + w * PASS_DAYS)) <= 0.5);
    const second = s.filter((e) => e.window === w && e.visit === 1)[0]!;
    const gap = second.mjd - first.mjd;
    assert.ok(gap >= 2 && gap <= 4, `visit gap ${gap}`);
  }
  for (let k = 1; k < s.length; k++) assert.ok(s[k]!.mjd >= s[k - 1]!.mjd, 'time order');
});

test('schedule: each wavelength lies in its detector band with bw = lam / R', () => {
  const s = simSchedule({ start: 60000, windows: 4, visits: 3, seed: 9 });
  for (const e of s) {
    assert.ok(e.lam > BAND_EDGES[e.det - 1]! && e.lam < BAND_EDGES[e.det]!, `D${e.det} ${e.lam}`);
    assert.ok(Math.abs(e.bw - e.lam / RESOLVING_POWER[e.det - 1]!) < 1e-12);
  }
  // The wavelength changes between visits, like the real survey.
  const d3 = s.filter((e) => e.det === 3).map((e) => e.lam);
  assert.ok(new Set(d3).size === d3.length);
});

test('schedule: every pass has a same-colour partner in every other pass, per detector', () => {
  for (const seed of [1, 2, 3, 42, 1234]) {
    const s = simSchedule({ start: 60000, windows: 4, visits: 3, seed });
    for (let d = 1; d <= 6; d++) {
      for (let a = 0; a < 4; a++) {
        for (let b = 0; b < 4; b++) {
          if (a === b) continue;
          const A = s.filter((e) => e.det === d && e.window === a);
          const B = s.filter((e) => e.det === d && e.window === b);
          const ok = A.some((x) =>
            B.some((y) => Math.abs(x.lam - y.lam) <= Math.min(x.bw, y.bw) / 2),
          );
          assert.ok(ok, `seed ${seed} D${d} passes ${a} and ${b}`);
        }
      }
    }
  }
});

test('schedule: the same seed gives the same schedule; another seed does not', () => {
  const a = simSchedule({ start: 60000, windows: 3, visits: 2, seed: 7 });
  const b = simSchedule({ start: 60000, windows: 3, visits: 2, seed: 7 });
  const c = simSchedule({ start: 60000, windows: 3, visits: 2, seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('scenarios: real practice spots, away from the five real targets', () => {
  for (const sc of Object.values(SCENARIOS)) {
    assert.ok(sc.dec < -20, `${sc.key} near the south galactic pole`);
    for (const [ra, dec] of TARGETS) {
      assert.ok(Math.hypot(sc.ra - ra!, sc.dec - dec!) > 10, `${sc.key} far from ${ra}`);
    }
  }
});

test('sources: seeded, stars fade to long wavelengths, one special source per scenario', () => {
  const w = simSources(SCENARIOS['warm-up']!);
  assert.deepEqual(w, simSources(SCENARIOS['warm-up']!));
  assert.equal(w.filter((s) => s.kind === 'mover').length, 1);
  assert.equal(w.filter((s) => s.kind === 'planet').length, 0);
  const stars = w.filter((s) => s.kind === 'star');
  assert.ok(stars.length > 15);
  for (const s of stars) {
    assert.equal(s.pmra, 0);
    for (let d = 1; d < 5; d++) assert.ok(s.flux[d + 1]! < s.flux[d]!, 'falls past D2');
  }
  const fluxes = stars.map((s) => s.flux[1]).sort((a, b) => a - b);
  assert.ok(fluxes[fluxes.length - 1]! > 20 * fluxes[0]!, 'a few bright, many faint');

  const p = simSources(SCENARIOS['planet-x']!);
  const planet = p.filter((s) => s.kind === 'planet');
  assert.equal(planet.length, 1);
  assert.equal(p.filter((s) => s.kind === 'mover').length, 0);
  const f = planet[0]!.flux;
  assert.ok(f[4] > 10 * f[0] && f[5] > 10 * f[0], 'brighter in D5 and D6 than D1');
});

test('simulate: labelled Simulated everywhere (H3, O-G11)', () => {
  for (const sc of Object.values(SCENARIOS)) {
    const field = simulate(sc);
    assert.equal(field.simulated, true);
    assert.deepEqual(field.releases, ['simulated']);
    assert.equal(field.target, null);
    assert.deepEqual(field.neighbours, []);
    assert.equal(field.monthly, false);
    assert.equal(field.windows, SIM_WINDOWS);
    assert.equal(field.frames.length, SIM_WINDOWS * SIM_VISITS * 6);
    assert.equal(new Set(field.frames.map((f) => f.id)).size, field.frames.length);
    field.frames.forEach((f, i) => {
      assert.ok(f.id.startsWith('SIMULATED'), f.id);
      assert.equal(f.release, 'simulated');
      assert.equal(f.src, null);
      assert.equal(f.gain, 1);
      assert.equal(f.i, i);
      assert.equal(f.pix.length, field.n * field.n);
      assert.equal(f.bad.length, field.n * field.n);
      const flagged = f.bad.reduce((a, b) => a + b, 0);
      assert.ok(flagged > 0 && flagged <= 10, `flagged ${flagged}`);
      assert.ok(f.mjd >= SIM_START - 1);
      assert.ok(Number.isFinite(f.sky) && f.sigma > 0);
    });
    for (let d = 0; d < 6; d++) assert.ok(field.noise[d]! > 0);
  }
});

test('simulate: deterministic per seed', () => {
  const a = simulate(SCENARIOS['planet-x']!);
  const b = simulate(SCENARIOS['planet-x']!);
  assert.equal(a.frames.length, b.frames.length);
  for (let k = 0; k < a.frames.length; k++) {
    assert.deepEqual(a.frames[k]!.pix, b.frames[k]!.pix);
    assert.deepEqual(a.frames[k]!.bad, b.frames[k]!.bad);
  }
  const c = simulate({ ...SCENARIOS['planet-x']!, seed: 99 });
  assert.notDeepEqual(a.frames[0]!.pix, c.frames[0]!.pix);
});

test('simulate: the warm-up mover jumps the expected pixels between passes', () => {
  const sc = SCENARIOS['warm-up']!;
  const field = simulate(sc);
  const mover = simSources(sc).find((s) => s.kind === 'mover')!;
  // Start from the brightest pixel near the catalogued first position, then follow it.
  const c = (field.n - 1) / 2;
  const scale = field.scale / 3600;
  const guessX = c - ((mover.ra - sc.ra) * Math.cos((sc.dec * Math.PI) / 180)) / scale;
  const guessY = c - (mover.dec - sc.dec) / scale;
  let prev: { x: number; y: number } | null = null;
  for (let w = 0; w < SIM_WINDOWS; w++) {
    const st = stackOf(field, 2, w);
    const near: { x: number; y: number } = prev ?? { x: guessX, y: guessY };
    const peak = brightestNear(st, field.n, near.x, near.y, prev ? 4 : 2);
    const at = centreNear(st, field.n, peak.x, peak.y);
    if (prev) {
      const jump = Math.hypot(at.x - prev.x, at.y - prev.y);
      assert.ok(Math.abs(jump - MOVER_JUMP_PX) < 0.3, `pass ${w}: jump ${jump.toFixed(2)} px`);
    }
    prev = at;
  }
});

test('simulate: the pretend planet moves a few pixels and shines in D5/D6, not D1', () => {
  const sc = SCENARIOS['planet-x']!;
  const field = simulate(sc);
  const planet = simSources(sc).find((s) => s.kind === 'planet')!;
  assert.ok(Math.hypot(planet.pmra, planet.pmdec) > 0);
  const c = (field.n - 1) / 2;
  const scale = field.scale / 3600;
  const x = c - ((planet.ra - sc.ra) * Math.cos((sc.dec * Math.PI) / 180)) / scale;
  const y = c - (planet.dec - sc.dec) / scale;
  // Light in a 3 × 3 box above sky, in units of its noise, at the first position (pass 0 stacks).
  const snr = (det: number): number => {
    const st = stackOf(field, det, 0);
    let sum = 0;
    for (let j = Math.round(y) - 1; j <= Math.round(y) + 1; j++) {
      for (let i = Math.round(x) - 1; i <= Math.round(x) + 1; i++)
        sum += st.pix[j * field.n + i]! - st.sky;
    }
    return sum / ((3 * st.sigma) / Math.sqrt(SIM_VISITS));
  };
  assert.ok(snr(5) > 5, `D5 ${snr(5).toFixed(1)}σ`);
  assert.ok(snr(6) > 5, `D6 ${snr(6).toFixed(1)}σ`);
  assert.ok(snr(1) < 3, `D1 ${snr(1).toFixed(1)}σ`);
  // And it jumps between passes in D6.
  const a = stackOf(field, 6, 0);
  const b = stackOf(field, 6, 1);
  const pa = centreNear(a, field.n, x, y);
  const pb = brightestNear(b, field.n, pa.x, pa.y, 5);
  const cb = centreNear(b, field.n, pb.x, pb.y);
  const jump = Math.hypot(cb.x - pa.x, cb.y - pa.y);
  assert.ok(Math.abs(jump - PLANET_JUMP_PX) < 0.8, `jump ${jump.toFixed(2)} px`);
});

test('simulate: fast (under 50 ms for a 6′ patch)', () => {
  simulate(SCENARIOS['warm-up']!); // warm the JIT
  let ms = Infinity; // best of three, so a busy machine does not fail it
  for (let k = 0; k < 3; k++) {
    const t = performance.now();
    simulate(SCENARIOS['planet-x']!);
    ms = Math.min(ms, performance.now() - t);
  }
  assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
});
