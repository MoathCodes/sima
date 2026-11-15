/**
 * The static seed (viewer/seed.ts): which seeded patch holds a field, and the honest source words
 * for a live patch ("fetched live" only for this visit, else the fetch date).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIVE_FRESH_MS, SEED_BASE, liveTip, liveWords, seedCovering, seedFor } from '../src/viewer/seed.ts';
import type { LiveBlock, SeedEntry, SeedIndex } from '../src/core/types.ts';

const entry = (id: string, ra: number, dec: number, fov: number): SeedEntry => ({
  id,
  ra,
  dec,
  fov,
  size: Math.round((fov / 60 + 0.01) * 100) / 100,
  fetched: '2026-11-15T03:00:00Z',
  frames: 36,
  found: 300,
  places: [id],
});
const index = (...patches: SeedEntry[]): SeedIndex => ({ version: 1, made: '2026-11-15T04:00:00Z', releases: ['spherex_dr1'], patches });

test('a seeded patch holds fields near its centre, as the service decides', () => {
  const ix = index(entry('a', 100, 20, 12));
  assert.equal(seedCovering(ix, 100, 20, 12)?.id, 'a');
  assert.equal(seedCovering(ix, 100, 20 + 2.9 / 60, 6)?.id, 'a'); // a nudge of 2.9′
  assert.equal(seedCovering(ix, 100, 20 + 3.1 / 60, 6), null);
  assert.equal(seedCovering(ix, 100, 20 + 4.4 / 60, 3)?.id, 'a');
  assert.equal(seedCovering(ix, 100, 20, 24), null); // wider than the patch
  assert.equal(seedCovering(ix, 140, 20, 6), null);
});

test('across RA 0, and the narrowest patch wins', () => {
  assert.equal(seedCovering(index(entry('z', 359.98, 0, 12)), 0.02, 0, 6)?.id, 'z');
  const ix = index(entry('wide', 50, 5, 24), entry('narrow', 50, 5.01, 12));
  assert.equal(seedCovering(ix, 50, 5, 6)?.id, 'narrow');
  assert.equal(seedCovering(ix, 50, 5, 12)?.id, 'wide');
});

test('a small field never takes a 48′ patch', () => {
  assert.equal(seedCovering(index(entry('big', 10, 10, 48)), 10, 10, 6), null);
  assert.equal(seedCovering(index(entry('big', 10, 10, 48)), 10, 10, 24)?.id, 'big');
});

test('no seed base: no seed, and nothing is fetched', async () => {
  assert.equal(SEED_BASE, '');
  assert.equal(await seedFor(100, 20, 6), null);
});

const block = (fetched: string, ahead?: boolean): LiveBlock => ({
  id: '0123456789abcdef',
  step: 'full',
  fetched,
  found: 300,
  windows: 2,
  ...(ahead === undefined ? {} : { ahead }),
});

test('a seeded patch says its fetch date, never "fetched live"', () => {
  const now = Date.parse('2026-11-15T03:10:00Z');
  assert.equal(liveWords(block('2026-11-15T03:00:00Z', true), now), 'fetched 15 Nov 2026');
  assert.doesNotMatch(liveTip(block('2026-11-15T03:00:00Z', true), now), /just now/);
  assert.match(liveTip(block('2026-11-15T03:00:00Z', true), now), /ahead of time/);
});

test('a patch fetched for this visit is "fetched live"; an older one gives its date', () => {
  const now = Date.parse('2026-11-15T03:10:00Z');
  assert.equal(liveWords(block('2026-11-15T03:00:00Z'), now), 'fetched live');
  assert.equal(liveWords(block('2026-11-15T03:00:00Z', false), now), 'fetched live');
  assert.equal(liveWords(block('2026-11-14T09:32:41Z'), now), 'fetched 14 Nov 2026');
  assert.equal(liveWords(block('2026-11-15T03:00:00Z'), Date.parse('2026-11-15T03:00:00Z') + LIVE_FRESH_MS + 1), 'fetched 15 Nov 2026');
  assert.equal(liveWords(undefined, now), 'fetched live'); // a set without a live block (older files)
});
