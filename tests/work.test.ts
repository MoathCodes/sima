// The work API (lane B). Node has no Web Worker, so this runs the page fallback: the same steps
// in slices, with a turn between them, and cancelling.
//
// Slices aim at 20 ms. The bound below is loose because `npm test` runs every file at once on a
// machine shared with other work, where a slice can stall; the 100 ms budget itself was checked
// in headless Chromium (no long task while building, searching and stacking WISE 0855).
const HELD_MS = 250;
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildField, searchChanges, stack, usePatch } from '../src/core/work.ts';
import { findChanges } from '../src/core/detect.ts';
import { loadSet, target } from './core-data.ts';

test('builds, searches and stacks on the page in slices, and agrees with the plain functions', async () => {
  const set = await loadSet('wise-0855');
  const t = target('wise-0855');
  const field = await buildField(set, { ra: t.ra, dec: t.dec, fov: 6, target: t });
  assert.equal(field.ranOn, 'page');
  assert.equal(field.frames.length, 70);
  assert.ok(field.longestMs < HELD_MS, `held ${field.longestMs} ms`);
  await assert.rejects(searchChanges(5, 5), /usePatch/);
  usePatch('wise-0855', field, set);
  const s = await searchChanges(5, 5);
  assert.equal(s.status, findChanges(field, set, 5, 5).status);
  assert.ok(s.longestMs < HELD_MS, `held ${s.longestMs} ms`);
  const st = await stack(5, set.data.catalogue, 'mean');
  assert.ok(st.along.snr > 10);
});

test('a cancelled job rejects with AbortError', async () => {
  const set = await loadSet('wise-0855');
  const t = target('wise-0855');
  const ctl = new AbortController();
  const p = buildField(set, { ra: t.ra, dec: t.dec, fov: 6, target: t }, { signal: ctl.signal });
  ctl.abort();
  await assert.rejects(p, (e: Error) => e.name === 'AbortError');
  const already = new AbortController();
  already.abort();
  await assert.rejects(searchChanges(5, 5, { signal: already.signal }), (e: Error) => e.name === 'AbortError');
});

test('measures the target in slices, the same as measureTarget', async () => {
  const { measure } = await import('../src/core/work.ts');
  const { measureTarget } = await import('../src/core/real.ts');
  const set = await loadSet('rw-aur');
  const t = target('rw-aur');
  const ms = await measure(set, t);
  assert.equal(ms.ranOn, 'page');
  assert.ok(ms.longestMs < HELD_MS, `held ${ms.longestMs} ms`);
  assert.deepEqual(
    ms.map((m) => m.ra),
    measureTarget(set, t).map((m) => m.ra),
  );
});

test('makes the frame’s cleaned-up pictures, the same as groupPicture, for the patch in use only', async () => {
  const { pictures } = await import('../src/core/work.ts');
  const { groupFrames, groupPicture } = await import('../src/core/blink.ts');
  const { DEFAULT_PIC } = await import('../src/core/picture.ts');
  const set = await loadSet('wise-0855');
  const t = target('wise-0855');
  const field = await buildField(set, { ra: t.ra, dec: t.dec, fov: 6, target: t });
  const groups = groupFrames(field, 5, 'window').filter((g) => g.frames.length).slice(0, 2);
  const p = { ...DEFAULT_PIC, background: true, median: true, smooth: 1 as const };
  await assert.rejects(pictures(field, groups, p), /usePatch/);
  usePatch('wise-0855-pictures', field, set);
  const pics = await pictures(field, groups, p);
  assert.equal(pics.ranOn, 'page');
  assert.equal(pics.length, 2);
  groups.forEach((g, i) => assert.deepEqual(pics[i], groupPicture(field, g, p)));
});
