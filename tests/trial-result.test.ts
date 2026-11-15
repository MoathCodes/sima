// v2.0 contract 4: `trialResult()` (viewer/motion.ts) gives the stack along the arrow's motion
// only when it was made for the patch and settings on screen now. A mission check must never pass
// on a stack made for an older key, or on an older motion while the newest is still being made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTrialResult } from '../src/viewer/motion.ts';
import type { StackResult } from '../src/core/stack.ts';

const result = { det: 3, frames: 24 } as unknown as StackResult;
const KEY = 'wise-0855|133.8|-7.2|64|3|mean';
const OLD = 'wise-0855|133.8|-7.2|64|2|mean';
const cat = { pmra: -8.1, pmdec: 0.7 };

test('a trial stack made for the key and motion now is returned', () => {
  const m = { pmra: 0, pmdec: 0 };
  const r = pickTrialResult(KEY, m, { key: KEY, motion: m, result }, cat, null);
  assert.ok(r);
  assert.equal(r.key, KEY);
  assert.equal(r.atCatalogue, false);
  assert.deepEqual(r.motion, m);
  assert.equal(r.result, result);
});

test('a trial stack made for an older key is rejected', () => {
  const m = { pmra: 0, pmdec: 0 };
  assert.equal(pickTrialResult(KEY, m, { key: OLD, motion: m, result }, cat, null), null);
});

test('while the newest motion is still being stacked, the older one is not returned', () => {
  const was = { pmra: 0, pmdec: 0 };
  const now = { pmra: -4, pmdec: 0.3 };
  assert.equal(pickTrialResult(KEY, now, { key: KEY, motion: was, result }, cat, null), null);
  assert.equal(pickTrialResult(KEY, now, null, cat, null), null);
});

test('at the catalogue motion the ordinary stack is returned, only for the key now', () => {
  const r = pickTrialResult(KEY, null, null, cat, { key: KEY, result });
  assert.ok(r);
  assert.equal(r.atCatalogue, true);
  assert.deepEqual(r.motion, cat);
  assert.equal(pickTrialResult(KEY, null, null, cat, { key: OLD, result }), null);
  assert.equal(pickTrialResult(KEY, null, null, cat, null), null);
});

test('no result without controls, or at the catalogue motion of a target that has none', () => {
  const m = { pmra: 1, pmdec: 1 };
  assert.equal(pickTrialResult(KEY, m, { key: KEY, motion: m, result: null }, cat, null), null);
  assert.equal(pickTrialResult(KEY, null, null, null, { key: KEY, result }), null);
  assert.equal(pickTrialResult(KEY, null, null, cat, { key: KEY, result: null }), null);
});
