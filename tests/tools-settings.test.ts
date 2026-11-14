// Tests for the picture tools' remembered settings (src/viewer/tools/settings.ts, TLS-7):
// sima.tools reading and writing, clamping, and old entries. Owner: lane E.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PIC } from '../src/core/picture.ts';
import { KEY, clampPoints, cleanPic, defaults, load, sane, save, type Store } from '../src/viewer/tools/settings.ts';

function memory(initial: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

test('nothing stored gives the defaults', () => {
  assert.deepEqual(load(memory()), defaults());
  assert.deepEqual(load(null), defaults());
});

test('a malformed or hand-edited entry never breaks the page', () => {
  assert.deepEqual(load(memory({ [KEY]: '{not json' })), defaults());
  const odd = load(memory({ [KEY]: JSON.stringify({ pic: { stretch: 'wobbly', smooth: 3, threshold: 99 }, order: 'random', hide: 'yes' }) }));
  assert.deepEqual(odd.pic, { threshold: 10 });
  assert.equal(odd.order, 'strength');
  assert.equal(odd.hide, false);
});

test('settings survive a save and a load; only changes from the default are written', () => {
  const store = memory();
  const s = defaults();
  s.pic = cleanPic({ ...DEFAULT_PIC, stretch: 'log', cmap: 'mono', threshold: 3 });
  s.hide = true;
  s.order = 'date';
  s.checked = { 'barnard|D3': { c1: 'checked', c2: 'reject' } };
  s.layers.flags = true;
  save(s, store);
  assert.deepEqual(load(store), s);
  assert.deepEqual(Object.keys(JSON.parse(store.data[KEY]!).pic).sort(), ['cmap', 'stretch', 'threshold']);
});

test('a threshold stored by an older version (k) is still read', () => {
  assert.equal(load(memory({ [KEY]: JSON.stringify({ k: 3.5 }) })).pic.threshold, 3.5);
});

test('custom black and white are kept in range, white always above black', () => {
  assert.deepEqual(clampPoints(-80, 200), { black: -50, white: 200 });
  assert.deepEqual(clampPoints(10, 5), { black: 10, white: 10.1 });
  assert.deepEqual(clampPoints(0, 1e9), { black: 0, white: 100000 });
  const s = sane({ ...DEFAULT_PIC, black: 500, white: 100 });
  assert.ok(s.white > s.black);
});

test('sane() leaves good settings alone and the Color view mix never empty-typed', () => {
  assert.deepEqual(sane(DEFAULT_PIC), { ...DEFAULT_PIC, mix: [...DEFAULT_PIC.mix] });
  const bad = sane({ ...DEFAULT_PIC, mix: ['x', 'g'] as unknown as typeof DEFAULT_PIC.mix });
  assert.deepEqual(bad.mix, [...DEFAULT_PIC.mix]);
});
