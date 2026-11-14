// The work API (lane B). Node has no Web Worker, so this runs the page fallback: the same steps
// in slices, with a turn between them, and cancelling.
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
  assert.ok(field.longestMs < 100, `held ${field.longestMs} ms`);
  await assert.rejects(searchChanges(5, 5), /usePatch/);
  usePatch('wise-0855', field, set);
  const s = await searchChanges(5, 5);
  assert.equal(s.status, findChanges(field, set, 5, 5).status);
  assert.ok(s.longestMs < 100, `held ${s.longestMs} ms`);
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
