// The change search (lane B): TLS-3, TLS-4, O-T2 on the shipped data, and its parts on made-up
// pictures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeSteps, expectedWords, falseAlarms, findChanges, normalTail } from '../src/core/detect.ts';
import { fieldGrid } from '../src/core/real.ts';
import { gauss, rng } from '../src/core/math.ts';
import type { Field, Frame } from '../src/core/types.ts';
import { loadField, loadSet } from './core-data.ts';

/** A made-up patch: `dates` passes of `per` exposures of D1, Gaussian noise, and sources. */
function madeUp(opts: {
  n?: number;
  dates?: number;
  per?: number;
  seed?: number;
  sources?: (date: number, exposure: number) => { x: number; y: number; flux: number }[];
}): Field {
  const n = opts.n ?? 41;
  const g = fieldGrid(150, 2, (n * 6.15) / 60);
  const R = rng(opts.seed ?? 7);
  const frames: Frame[] = [];
  for (let d = 0; d < (opts.dates ?? 3); d++) {
    for (let e = 0; e < (opts.per ?? 3); e++) {
      const pix = new Float32Array(g.n * g.n);
      for (let i = 0; i < pix.length; i++) pix[i] = 10 * gauss(R);
      for (const s of opts.sources?.(d, e) ?? []) {
        for (let y = 0; y < g.n; y++) {
          for (let x = 0; x < g.n; x++) {
            pix[y * g.n + x] += (s.flux / (2 * Math.PI * 0.8 * 0.8)) * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * 0.64));
          }
        }
      }
      frames.push({
        i: frames.length,
        id: `SIMULATED_TEST_${d}_${e}`,
        det: 1,
        mjd: 61000 + d * 180 + e,
        lam: 0.9,
        bw: 0.02,
        window: d,
        visit: e,
        release: 'simulated',
        pix,
        bad: new Uint8Array(pix.length),
        sigma: 10,
        sky: 0,
        gain: 1,
        src: null,
      });
    }
  }
  return {
    ra: 150,
    dec: 2,
    fov: (g.n * 6.15) / 60,
    n: g.n,
    scale: 6.15,
    wcs: g.wcs,
    simulated: true,
    frames,
    windows: opts.dates ?? 3,
    monthly: false,
    noise: [10, NaN, NaN, NaN, NaN, NaN],
    target: null,
    neighbours: [],
    releases: ['simulated'],
  };
}

test('false alarms: the Gaussian tail and the beam count', () => {
  assert.ok(Math.abs(normalTail(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalTail(3) - 1.3499e-3) < 1e-6);
  assert.ok(Math.abs(normalTail(5) - 2.8665e-7) < 1e-9);
  // 3481 pixels at 5× is far under 0.1.
  assert.ok(falseAlarms(3481, 5) < 0.1);
  assert.ok(Math.abs(falseAlarms(25.1327 * 1000, 3) - 1000 * 2 * 1.3499e-3) < 0.01);
  assert.equal(expectedWords(0.01), 'fewer than 0.1 expected from noise');
  assert.equal(expectedWords(13.4), 'about 13 expected from noise');
});

test('pure noise gives few false alarms at 5×', () => {
  const r = findChanges(madeUp({ seed: 3 }), null, 1, 5);
  assert.ok(r.candidates.filter((c) => c.verdict !== 'weak').length <= 1, r.status);
  assert.match(r.status, /^\d+ candidates? in D1 · \d+ unexplained · /);
});

test('a source that appears on one date is found as brighter, on that date', () => {
  const f = madeUp({ seed: 4, sources: (d) => (d === 1 ? [{ x: 20, y: 20, flux: 400 }] : []) });
  const r = findChanges(f, null, 1, 5);
  const c = r.candidates.find((x) => Math.hypot(x.x - 20, x.y - 20) <= 1.5);
  assert.ok(c, r.status);
  assert.equal(c.kind, 'brighter');
  assert.equal(c.window, 1);
  assert.ok(c.verdict === 'strong' || c.verdict === 'possible');
  assert.match(c.why, /Not a discovery/);
});

test('a steady source gives no candidate; a source that jumps gives a moved pair', () => {
  const steady = findChanges(madeUp({ seed: 5, sources: () => [{ x: 15, y: 15, flux: 2000 }] }), null, 1, 5);
  assert.equal(steady.candidates.filter((c) => Math.hypot(c.x - 15, c.y - 15) < 3).length, 0);
  const jump = findChanges(
    madeUp({ seed: 6, sources: (d) => [{ x: 15 + 2 * d, y: 20, flux: 1500 }] }),
    null,
    1,
    5,
  );
  assert.ok(jump.candidates.some((c) => c.kind === 'moved'), jump.status);
});

test('a cosmic ray on one exposure of a date is a likely artefact', () => {
  // With three exposures a date, sigma clipping already drops it; with two it stays in the
  // combined picture, and the check on each exposure has to catch it.
  const f = madeUp({ seed: 8, per: 2, sources: (d, e) => (d === 2 && e === 1 ? [{ x: 25, y: 12, flux: 1500 }] : []) });
  const r = findChanges(f, null, 1, 5);
  const c = r.candidates.find((x) => Math.hypot(x.x - 25, x.y - 12) <= 1.5);
  assert.ok(c, r.status);
  assert.equal(c.verdict, 'artefact');
  assert.match(c.checks.eachExposure, /on 1 of 2 exposures only/);
});

test('the search in steps gives the same answer as in one go', () => {
  const f = madeUp({ seed: 4, sources: (d) => (d === 1 ? [{ x: 20, y: 20, flux: 400 }] : []) });
  const it = changeSteps(f, null, 1, 5);
  let r = it.next();
  let steps = 0;
  while (!r.done) {
    r = it.next();
    steps++;
  }
  assert.ok(steps > 3);
  assert.equal(r.value.status, findChanges(f, null, 1, 5).status);
});

test("TLS-3: Barnard's Star is found by the change search and labelled Known", async () => {
  const field = await loadField('barnard');
  const set = await loadSet('barnard');
  for (const det of [5, 6]) {
    const r = findChanges(field, set, det, 5);
    const me = r.candidates.find((c) => c.kind === 'mover' && c.known?.cat === 'target');
    assert.ok(me, `D${det}: ${r.status}`);
    assert.equal(me.verdict, 'known');
    assert.equal(me.known!.id, "Barnard's Star");
    assert.ok(me.motion && Math.abs(me.motion.total - 10.39) < 3 * me.motion.totalErr + 0.2);
    assert.match(r.target, /Barnard's Star: moves/);
    assert.ok(r.candidates.every((c) => !/discover/i.test(c.why.replace('Not a discovery', ''))));
  }
});

test('TLS-4: R Draconis D3 at 3× gives the honest status line, with weak spots labelled', async () => {
  const field = await loadField('r-dra');
  const set = await loadSet('r-dra');
  const r = findChanges(field, set, 3, 3);
  // "60 candidates in D3 · 52 unexplained · about 14 expected from noise" on 14 Nov 2026.
  assert.match(r.status, /^\d+ candidates in D3 · \d+ unexplained · about \d+ expected from noise$/);
  assert.ok(r.expected > 5 && r.expected < 30, `expected ${r.expected}`);
  assert.equal(r.unexplained, r.candidates.filter((c) => !c.known && !c.glare && c.verdict !== 'artefact').length);
  const weak = r.candidates.filter((c) => c.verdict === 'weak');
  assert.ok(weak.length > 0);
  assert.ok(weak.every((c) => /Weak:/.test(c.why)));
  // Ranked: clear ones, then weak, then not confirmed, then likely artefacts.
  const order = { strong: 0, possible: 0, known: 0, blended: 0, weak: 1, 'not-confirmed': 2, artefact: 3 };
  for (let i = 1; i < r.candidates.length; i++) {
    assert.ok(order[r.candidates[i - 1]!.verdict] <= order[r.candidates[i]!.verdict]);
  }
  assert.match(r.target, /R Draconis/);
});

test("O-T2: spots 53–72″ from a saturated star are demoted to Weak: in a bright star's glow", async () => {
  const field = await loadField('r-dra');
  const set = await loadSet('r-dra');
  const r = findChanges(field, set, 3, 3);
  const inGlow = r.candidates.filter(
    (c) => c.nearSaturated !== null && c.nearSaturated >= 53 && c.nearSaturated <= 72 && !c.glare && !c.known,
  );
  assert.ok(inGlow.length > 0);
  for (const c of inGlow) {
    assert.ok(['weak', 'not-confirmed', 'artefact'].includes(c.verdict), `${c.verdict} at ${c.nearSaturated}″`);
  }
});
