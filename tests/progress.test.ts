// v2.0 contract "Progress" (src/explore/progress.ts): recorded in `sima-missions`, in memory when
// storage is blocked (MSN-8), "unavailable" never counts as or overwrites "done" (MSN-6), and
// Reset clears only its own key.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRESS_KEY,
  _forgetForTests,
  leaveMission,
  onProgress,
  progress,
  resetProgress,
  startMission,
  stepDone,
} from '../src/explore/progress.ts';

/** A small in-memory Storage. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

function useStorage(s: Storage | 'blocked'): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      if (s === 'blocked') throw new DOMException('The operation is insecure.', 'SecurityError');
      return s;
    },
  });
  _forgetForTests();
}

beforeEach(() => useStorage(memoryStorage()));

test('a fresh profile has no mission open and nothing learned', () => {
  const p = progress();
  assert.equal(p.current, null);
  assert.deepEqual(p.learned, []);
  assert.deepEqual(p.steps.runaway, {});
});

test('steps are recorded, saved, and a mission with every step recorded is learned', () => {
  startMission('runaway');
  stepDone('runaway', 'play', 'done');
  assert.deepEqual(progress().learned, []);
  stepDone('runaway', 'tap', 'unavailable');
  assert.deepEqual(progress().learned, ['runaway']);
  assert.equal(progress().steps.runaway.tap, 'unavailable');
  // Survives a reload: read back from storage.
  _forgetForTests();
  assert.equal(progress().current, 'runaway');
  assert.equal(progress().steps.runaway.play, 'done');
  leaveMission();
  assert.equal(progress().current, null);
});

test('"unavailable" never overwrites "done"', () => {
  stepDone('ghost', 'motion', 'done');
  stepDone('ghost', 'motion', 'unavailable');
  assert.equal(progress().steps.ghost.motion, 'done');
});

test('blocked storage: progress works in memory for the visit', () => {
  useStorage('blocked');
  const seen: (string | null)[] = [];
  const stop = onProgress((p) => seen.push(p.current));
  startMission('planet-x');
  stepDone('planet-x', 'check', 'done');
  assert.equal(progress().current, 'planet-x');
  assert.equal(progress().steps['planet-x'].check, 'done');
  resetProgress();
  assert.equal(progress().current, null);
  assert.deepEqual(seen, ['planet-x', 'planet-x', null]);
  stop();
});

test('Reset clears only sima-missions', () => {
  const s = memoryStorage();
  useStorage(s);
  s.setItem('sima-view', 'expert');
  startMission('runaway');
  assert.ok(s.getItem(PROGRESS_KEY));
  resetProgress();
  assert.equal(s.getItem(PROGRESS_KEY), null);
  assert.equal(s.getItem('sima-view'), 'expert');
});

test('damaged saved progress is ignored, not trusted', () => {
  const s = memoryStorage();
  s.setItem(PROGRESS_KEY, JSON.stringify({ current: 'nope', steps: { runaway: { play: 'yes', tap: 'done' } } }));
  useStorage(s);
  const p = progress();
  assert.equal(p.current, null);
  assert.deepEqual(p.steps.runaway, { tap: 'done' });
});

test('only real mission steps count; all steps including unavailable teach the skill', () => {
  stepDone('planet-x', 'invented', 'done');
  assert.deepEqual(progress().steps['planet-x'], {});
  for (const step of ['check', 'closer', 'bigger']) stepDone('planet-x', step, 'unavailable');
  assert.deepEqual(progress().learned, ['planet-x']);
});
