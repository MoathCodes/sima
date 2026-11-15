// At wide fields the picture draws only the brightest catalogue marks (viewer/tools/limit.ts),
// and says how many it left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brightest, MARK_LIMIT } from '../src/viewer/tools/limit.ts';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, mag: 10 + (i % 97) / 10 }));

test('few rows are all kept, with no cut', () => {
  const k = brightest(rows(40));
  assert.equal(k.rows.length, 40);
  assert.equal(k.faintest, null);
});

test('many rows: only the brightest are kept, in their order, and the cut is named', () => {
  const all = rows(4000);
  const k = brightest(all);
  assert.equal(k.rows.length, MARK_LIMIT);
  assert.equal(k.total, 4000);
  assert.ok(k.faintest !== null);
  for (const r of k.rows) assert.ok(r.mag <= k.faintest!);
  const left = all.filter((r) => !k.rows.includes(r));
  for (const r of left) assert.ok(r.mag >= k.faintest!);
  const ids = k.rows.map((r) => r.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test("the target's own rows are always kept, even when faint", () => {
  const all = [...rows(1000), { id: -1, mag: 25, target: true }];
  const k = brightest(all, 10);
  assert.ok(k.rows.some((r) => r.id === -1));
  assert.equal(k.rows.length, 10);
  assert.ok(k.faintest! < 25);
});

test('rows with no magnitude count as faintest', () => {
  const k = brightest([{ mag: Number.NaN }, { mag: 12 }, { mag: 14 }], 2);
  assert.deepEqual(k.rows.map((r) => r.mag), [12, 14]);
});
