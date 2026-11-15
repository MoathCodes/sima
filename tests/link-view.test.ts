// v2.0 contract "Links" (src/viewer/link.ts, re-exported by url.ts): `ui=` and `mission=` are read, and the view a link
// opens follows the order `ui` → Expert settings in the link → the remembered view (VIEW-4, B-2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLink, viewFor } from '../src/viewer/link.ts';

test('ui= and mission= are read; bad values are named in the note', () => {
  const l = readLink('?ui=discover&mission=ghost');
  assert.equal(l.ui, 'discover');
  assert.equal(l.mission, 'ghost');
  assert.deepEqual(l.unknown, []);
  const bad = readLink('?ui=beginner&mission=hunt');
  assert.equal(bad.ui, null);
  assert.equal(bad.mission, null);
  assert.equal(bad.unknown.length, 2);
  assert.match(bad.unknown[0]!, /^ui=beginner/);
  assert.match(bad.unknown[1]!, /^mission=hunt/);
});

test('ui= wins over everything', () => {
  assert.equal(viewFor(readLink('?ui=discover&view=stack&det=D5'), '#w=abc', 'expert'), 'discover');
  assert.equal(viewFor(readLink('?ui=expert'), '', 'discover'), 'expert');
});

test('Expert settings in the link mean Expert', () => {
  for (const q of ['?view=two', '?pic=g1', '?det=D3', '?date=2025-09-01']) {
    assert.equal(viewFor(readLink(q), '', 'discover'), 'expert', q);
  }
  assert.equal(viewFor(readLink(''), '#w=abc', 'discover'), 'expert');
  assert.equal(viewFor(readLink(''), 'x=1&w=abc', 'discover'), 'expert');
});

test('otherwise the remembered view (or the first-visit default)', () => {
  assert.equal(viewFor(readLink('?target=barnard&fov=6'), '', 'discover'), 'discover');
  assert.equal(viewFor(readLink('?mission=runaway'), '', 'expert'), 'expert');
  assert.equal(viewFor(readLink(''), '#nothing', 'discover'), 'discover');
});

test('a shared link keeps the view and, in Discover, the open mission; never progress', async () => {
  const { viewParams } = await import('../src/viewer/link.ts');
  const q = (pairs: [string, string][]) => new URLSearchParams(pairs).toString();
  assert.equal(q(viewParams('discover', 'ghost')), 'ui=discover&mission=ghost');
  assert.equal(q(viewParams('discover', null)), 'ui=discover');
  assert.equal(q(viewParams('expert', 'ghost')), 'ui=expert');
  // Round trip: the link opens the same view and mission, whatever was remembered.
  const back = readLink(`?target=barnard&view=flip&det=D3&${q(viewParams('discover', 'runaway'))}`);
  assert.equal(viewFor(back, '', 'expert'), 'discover');
  assert.equal(back.mission, 'runaway');
  assert.equal(viewFor(readLink(`?${q(viewParams('expert', null))}`), '', 'discover'), 'expert');
});
