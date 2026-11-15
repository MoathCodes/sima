// Tests for the frame half's state (src/viewer/state.ts): S, watch(), pic() and the constants.
// Owner: lane D (written in phase 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PIC } from '../src/core/picture.ts';
import {
  FOVS,
  S,
  SPEEDS,
  VIEWS,
  emptyPasses,
  nearestFov,
  pic,
  watch,
  type State,
  type StateKey,
} from '../src/viewer/state.ts';

/** Lets every queued microtask run, so watch() listeners have been called. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

const initial: State = { ...S };

/** Puts S back as it started and lets the resulting changes flush. */
async function reset(): Promise<void> {
  for (const key of Object.keys(initial) as StateKey[]) {
    (S as unknown as Record<StateKey, unknown>)[key] = initial[key];
  }
  await settle();
}

test('S starts in the documented state', () => {
  assert.equal(S.fov, 6);
  assert.equal(S.level, 'explore');
  assert.equal(S.mode, 'flip');
  assert.equal(S.det, 3);
  assert.equal(S.lam, 2.0);
  assert.equal(S.source, 'none');
  assert.equal(S.target, null);
  assert.equal(S.field, null);
  assert.deepEqual(S.groups, []);
  assert.equal(S.playing, false);
  assert.equal(S.loop, 'forward');
  assert.equal(S.speed, 1);
  assert.equal(S.pic, DEFAULT_PIC);
  assert.equal(S.original, false);
  assert.equal(S.selected, null);
  assert.equal(S.embed, false);
});

test('field sizes, views and speeds are the ones the spec lists', () => {
  assert.deepEqual([...FOVS], [3, 6, 12, 24, 48]); // FRM-6
  assert.deepEqual(VIEWS.explore, ['flip', 'two', 'diff', 'stack']); // FRM-7; Stack added in v2.0 (contract 4)
  assert.deepEqual(VIEWS.measure, ['flip', 'swipe', 'two', 'diff', 'stack', 'trail']);
  for (const view of VIEWS.explore) assert.ok(VIEWS.measure.includes(view));
  assert.deepEqual([...SPEEDS], [0.6, 1, 1.5]); // BAR-3
});

test('watch batches writes into one call, after the writes, with every changed key', async () => {
  const calls: StateKey[][] = [];
  const stop = watch(null, (changed) => calls.push([...changed].sort()));
  S.epoch = 2;
  S.mode = 'diff';
  S.epoch = 3;
  assert.deepEqual(calls, [], 'nothing is called while the writes run');
  await settle();
  assert.deepEqual(calls, [['epoch', 'mode']]);
  stop();
  await reset();
});

test('watch with keys hears only those keys', async () => {
  let n = 0;
  const stop = watch(['mode'], () => {
    n += 1;
  });
  S.epoch = 5;
  await settle();
  assert.equal(n, 0);
  S.mode = 'two';
  S.epoch = 6;
  await settle();
  assert.equal(n, 1);
  stop();
  await reset();
});

test('writing the value a field already has is not a change', async () => {
  let n = 0;
  const stop = watch(null, () => {
    n += 1;
  });
  S.fov = 6;
  S.level = 'explore';
  await settle();
  assert.equal(n, 0);
  stop();
});

test('the function watch returns stops listening', async () => {
  let n = 0;
  const stop = watch(['epoch'], () => {
    n += 1;
  });
  stop();
  S.epoch = 9;
  await settle();
  assert.equal(n, 0);
  await reset();
});

test('writes inside a listener start a new batch', async () => {
  const seen: string[] = [];
  const stopA = watch(['epoch'], () => {
    seen.push('epoch');
    S.ref = S.epoch - 1;
  });
  const stopB = watch(['ref'], () => seen.push(`ref=${S.ref}`));
  S.epoch = 4;
  await settle();
  assert.deepEqual(seen, ['epoch', 'ref=3']);
  stopA();
  stopB();
  await reset();
});

test('a listener that throws is reported, and the others still run', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  let ran = false;
  const stopA = watch(['epoch'], () => {
    throw new Error('broken listener');
  });
  const stopB = watch(['epoch'], () => {
    ran = true;
  });
  S.epoch = 1;
  await settle();
  assert.equal(ran, true);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0]?.arguments[0]), /listener failed/);
  stopA();
  stopB();
  await reset();
});

test('two listeners that keep changing each other are stopped and reported', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const stopA = watch(['epoch'], () => {
    S.ref = S.ref + 1;
  });
  const stopB = watch(['ref'], () => {
    S.epoch = S.epoch + 1;
  });
  S.epoch = 1;
  await settle();
  stopA();
  stopB();
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0]?.arguments[0]), /keep changing each other/);
  await reset();
});

test('a field that is not part of State cannot be written or deleted', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  (S as unknown as Record<string, unknown>).zoom = 2;
  assert.equal('zoom' in S, false);
  delete (S as unknown as Record<string, unknown>).fov;
  assert.equal(S.fov, 6);
  assert.equal(errors.mock.callCount(), 2);
});

test('pic(): Explore shows the default look unless the settings came from a link', async () => {
  const custom = { ...DEFAULT_PIC, stretch: 'log' as const, invert: true };
  S.pic = custom;
  S.level = 'explore';
  assert.equal(pic(), DEFAULT_PIC);
  S.picLinked = true;
  assert.equal(pic(), custom);
  S.picLinked = false;
  S.level = 'measure';
  assert.equal(pic(), custom);
  await reset();
});

test('pic(): Original turns every clean-up step off and keeps the display settings', async () => {
  S.level = 'measure';
  S.pic = {
    ...DEFAULT_PIC,
    stretch: 'sqrt',
    cmap: 'thermal',
    match: true,
    background: true,
    median: true,
    smooth: 1,
    combinePass: true,
  };
  S.original = true;
  const p = pic();
  assert.equal(p.match, false);
  assert.equal(p.background, false);
  assert.equal(p.median, false);
  assert.equal(p.smooth, 0);
  assert.equal(p.combinePass, false);
  assert.equal(p.stretch, 'sqrt');
  assert.equal(p.cmap, 'thermal');
  assert.equal(S.pic.background, true, 'the saved settings are not changed');
  await reset();
});

test('nearestFov snaps any size to the closest step, by ratio', () => {
  assert.equal(nearestFov(6), 6);
  assert.equal(nearestFov(8), 6);
  assert.equal(nearestFov(9), 12);
  assert.equal(nearestFov(0.5), 3);
  assert.equal(nearestFov(500), 48);
  assert.equal(nearestFov(Number.NaN), 6);
  assert.equal(nearestFov(-3), 6);
});

test('emptyPasses names the windows with no exposure in a detector, in order', () => {
  // R Draconis-like months: window 0 has D1 and D4, window 1 has D2 and D5, window 2 has all six.
  const frame = (det: number, window: number) => ({ det, window });
  const field = {
    windows: 4,
    frames: [frame(1, 0), frame(4, 0), frame(2, 1), frame(5, 1), frame(1, 2), frame(2, 2)],
  } as unknown as Parameters<typeof emptyPasses>[0];
  assert.deepEqual(emptyPasses(field, 1), [1, 3]);
  assert.deepEqual(emptyPasses(field, 2), [0, 3]);
  assert.deepEqual(emptyPasses(field, 6), [0, 1, 2, 3]);
  assert.deepEqual(emptyPasses(null, 3), []);
});
