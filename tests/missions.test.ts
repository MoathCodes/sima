import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkStep,
  checkMotion,
  currentStep,
  MISSIONS,
  objectLine,
  type MissionInputs,
} from '../src/explore/missions.ts';
import { runawayLines, ghostLines, planetLines } from '../src/explore/plain.ts';
import { planetEdges } from '../src/explore/plan-x.ts';
import { measureTarget, wcsSky2Pix } from '../src/core/real.ts';
import { fitMotion } from '../src/core/fit.ts';
import { trialTrack } from '../src/core/motion.ts';
import { stackAlong, psfWidth } from '../src/core/stack.ts';
import { answer, verdict, DEFAULT_PLANET } from '../src/core/sandbox.ts';
import { tapReach, targetAt } from '../src/explore/track.ts';
import { blend, groupFrames } from '../src/core/blink.ts';
import { loadField, loadSet, target } from './core-data.ts';

const base: MissionInputs = { key: 'current', keyNow: 'current' };

test('MSN-1: every step rejects an old key, even with terminal error', () => {
  for (const m of Object.values(MISSIONS))
    for (const s of m.steps)
      assert.equal(
        checkStep(m.id, s, { ...base, key: 'old', unavailable: 'Worker failed.' }).state,
        'checking',
      );
});

test('MSN-2: play requires an action and three changes; ghost requires a full loop', () => {
  assert.equal(
    checkStep('runaway', 'play', { ...base, acted: false, dateChanges: 3 }).state,
    'waiting',
  );
  assert.equal(
    checkStep('runaway', 'play', { ...base, acted: true, dateChanges: 2 }).state,
    'waiting',
  );
  assert.equal(
    checkStep('runaway', 'play', { ...base, acted: true, dateChanges: 3 }).state,
    'done',
  );
  assert.equal(checkStep('ghost', 'play', { ...base, acted: true, loops: 0 }).state, 'waiting');
  assert.equal(checkStep('ghost', 'play', { ...base, acted: true, loops: 1 }).state, 'done');
  assert.equal(checkStep('ghost', 'stack', { ...base, mode: 'stack' }).state, 'done');
});

test('MSN-2/3: real Barnard track tap, miss, and fit from shipped pixels', async () => {
  const set = await loadSet('barnard');
  const field = await loadField('barnard');
  const fit = fitMotion(measureTarget(set, target('barnard')), target('barnard'));
  assert.equal(checkMotion({ ...base, fit }).state, 'done');
  assert.equal(fit.total.toFixed(2), '10.50');
  assert.equal(fit.totalErr.toFixed(2), '0.26');
  assert.equal(fit.used, 71);
  assert.equal(fit.of, 72);
  assert.equal(fit.matches, true);
  assert.match(runawayLines(fit).catalogue, /10.39/);
  assert.match(runawayLines(fit).measured, /10.50 ± 0.26/);
  assert.equal(checkMotion({ ...base, key: 'old', fit }).state, 'checking');
  for (const f of field.frames) {
    const p = targetAt(field, 'barnard', f.mjd)!;
    const tap = wcsSky2Pix(field.wcs, p.ra, p.dec);
    assert.equal(
      checkStep('runaway', 'tap', { ...base, tap, points: [tap], radius: 2 }).state,
      'done',
    );
    assert.equal(
      checkStep('runaway', 'tap', {
        ...base,
        tap: { x: tap.x + 6, y: tap.y },
        points: [tap],
        radius: 2,
      }).state,
      'failed',
    );
  }
  const missing = { ...fit, ok: false, reason: 'Too few usable positions.' };
  assert.equal(checkMotion({ ...base, fit: missing }).state, 'unavailable');
  assert.match(runawayLines(missing).measured, /Not measured: Too few/);
  assert.doesNotMatch(runawayLines(missing).measured, /10.50/);
});

test('MSN-4: shipped ghost passes at catalogue motion, fails at zero and opposite', async () => {
  const set = await loadSet('wise-0855');
  const field = await loadField('wise-0855');
  for (const sign of [0, 1, -1]) {
    const motion = { pmra: sign * set.data.catalogue.pmra, pmdec: sign * set.data.catalogue.pmdec };
    const track =
      sign === 1
        ? set.data.catalogue
        : trialTrack(
            field.frames.filter((f) => f.det === 5).map((f) => f.mjd),
            set.data.catalogue,
            motion,
          );
    const result = stackAlong(field, 5, track, 'mean', set);
    const trial = { key: base.keyNow, motion, atCatalogue: sign === 1, result };
    const check = checkStep('ghost', 'motion', { ...base, mode: 'stack', trial });
    assert.equal(check.state, sign === 1 ? 'done' : 'failed', `${sign}: ${result.note}`);
    assert.equal(check.state === 'done', /Something at this place moves with/.test(result.note));
    assert.equal(
      checkStep('ghost', 'motion', { ...base, mode: 'stack', trial: { ...trial, key: 'old' } })
        .state,
      'checking',
    );
    if (sign === 1) {
      assert.equal(result.along.snr.toFixed(1), '15.3');
      assert.equal(result.controls[0].snr.toFixed(1), '5.7');
      assert.equal(result.controls[1].snr.toFixed(1), '2.3');
      assert.match(ghostLines(result, '3.83–4.41', null).measured, /15.3×/);
    }
    assert.equal(
      checkStep('ghost', 'motion', {
        ...base,
        mode: 'stack',
        trial: { ...trial, result: { ...result, frames: 1 } },
      }).state,
      'unavailable',
    );
  }
});

test('MSN-5: Planet X uses real patch noise; both model edges are reachable', async () => {
  const field = await loadField('barnard');
  const noises = [1, 2, 3, 4, 5, 6].map((det) => ({
    det,
    pixelNoise: field.noise[det - 1]!,
    width: psfWidth(field, det),
    exposures: field.frames.filter((f) => f.det === det).length,
  }));
  const edges = planetEdges(noises);
  assert.ok(edges.distance! > 5 && edges.distance! < 500);
  assert.ok(edges.radius! > 3.9 && edges.radius! < 30);
  const reading = (distance: number, radius: number) => {
    const planet = { ...DEFAULT_PLANET, distance, radius };
    return { planet, verdict: verdict(answer(planet, noises)), patchKey: base.keyNow };
  };
  const first = reading(500, 3.9);
  assert.equal(
    checkStep('planet-x', 'check', { ...base, acted: true, sandbox: first }).state,
    'done',
  );
  assert.equal(checkStep('planet-x', 'closer', { ...base, sandbox: first }).state, 'waiting');
  assert.equal(
    checkStep('planet-x', 'closer', { ...base, sandbox: reading(edges.distance! - 0.01, 3.9) })
      .state,
    'done',
  );
  assert.equal(
    checkStep('planet-x', 'closer', { ...base, sandbox: reading(edges.distance! + 0.01, 3.9) })
      .state,
    'waiting',
  );
  assert.equal(
    checkStep('planet-x', 'bigger', { ...base, sandbox: reading(500, edges.radius! + 0.01) }).state,
    'done',
  );
  assert.equal(
    checkStep('planet-x', 'bigger', { ...base, sandbox: reading(500, edges.radius! - 0.01) }).state,
    'waiting',
  );
  assert.equal(
    checkStep('planet-x', 'check', { ...base, acted: true, sandbox: { ...first, patchKey: 'old' } })
      .state,
    'checking',
  );
  assert.match(planetLines(edges).distance, /^Simulated · Model:/);
});

test('MSN-6/7: unavailable always has a reason and Continue; help is read only', () => {
  for (const m of Object.values(MISSIONS))
    for (const s of m.steps) {
      const check = checkStep(m.id, s, {
        ...base,
        key: null,
        unavailable: 'Pictures could not be loaded.',
      });
      assert.equal(check.state, 'unavailable');
      assert.ok(check.reason);
      const recorded = {};
      const current = currentStep(m.id, recorded, base)!;
      assert.ok(current.hints.length);
      assert.ok(current.showMe.guide);
      assert.equal(current.continueLabel, 'Continue without it');
      assert.deepEqual(recorded, {});
    }
  const sandbox = { planet: { ...DEFAULT_PLANET }, verdict: verdict([]), patchKey: base.keyNow };
  for (const step of MISSIONS['planet-x'].steps)
    assert.equal(checkStep('planet-x', step, { ...base, sandbox }).state, 'unavailable');
  assert.deepEqual(planetEdges([]), {
    distance: null,
    radius: null,
    reason: 'This patch has no measured noise to compare with.',
  });
});

test('object templates count the pictures actually shown and take catalogue type at runtime', async () => {
  const field = await loadField('r-dra');
  assert.match(
    objectLine('r-dra', field, 'Mira variable'),
    new RegExp(`${field.frames.length} pictures over`),
  );
  assert.match(objectLine('rw-aur', field, null), /Type not available/);
});

test("UX-1: a tap anywhere on Barnard's Star's glow hits it; a tap on another star does not", async () => {
  const field = await loadField('barnard');
  const groups = groupFrames(field, 5, 'window');
  const k = 8; // CSS pixels per field pixel, as in the audit (old reach max(18, 3k) = 24 px)
  const path = groups.map((g) => {
    const p = targetAt(field, 'barnard', g.mjd)!;
    return wcsSky2Pix(field.wcs, p.ra, p.dec);
  });
  const points = path.map((q) => ({ x: q.x * k, y: q.y * k }));
  // The audit's taps, CSS px from the star's middle on the date shown.
  const offsets = [[0, 0], [16, -15], [0, 25], [40, -12], [-2, 50], [-30, 0], [0, -30]] as const;
  // The other catalogue stars in the picture (not Barnard's Star's own 2016 entry).
  const t = target('barnard');
  const own = wcsSky2Pix(field.wcs, t.ra, t.dec);
  const away = (q: { x: number; y: number }) =>
    Math.min(...path.map((c) => Math.hypot(q.x - c.x, q.y - c.y)));
  const others = field.neighbours
    .map((s) => wcsSky2Pix(field.wcs, s.ra, s.dec))
    .filter((q) => Math.hypot(q.x - own.x, q.y - own.y) > 1);
  for (let i = 0; i < groups.length; i++) {
    // As the tour measures it: on the date's own picture, whichever view is on screen.
    const radius = tapReach(blend(field, groups[i]!, 'median', false), field.n, path, k);
    assert.ok(radius <= (field.n / 3) * k, 'at most a third of the picture');
    for (const [dx, dy] of offsets) {
      const tap = { x: points[i]!.x + dx, y: points[i]!.y + dy };
      const state = checkStep('runaway', 'tap', { ...base, tap, points, radius }).state;
      assert.equal(state, 'done', `tap ${dx},${dy} on date ${i}`);
    }
    // Stars outside its glow are told "Not that one".
    const clear = others.filter((q) => away(q) * k > radius + k);
    assert.ok(clear.length >= 3, 'other stars outside the reach');
    for (const q of clear) {
      const tap = { x: q.x * k, y: q.y * k };
      assert.equal(checkStep('runaway', 'tap', { ...base, tap, points, radius }).state, 'failed');
    }
  }
  // No picture: the old least reach.
  assert.equal(tapReach(null, field.n, path, k), 24);
});
