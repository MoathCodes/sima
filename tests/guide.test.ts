// Tests for lane H's pure parts: card placement, the shared sima-guide entry, where a task's
// object is on each date, and that every word in explore/copy.ts is used (O-W5). Owner: lane H.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { overlaps, placeBeside, placeNear } from '../src/guide/place.ts';
import { mergeStore, parseStore } from '../src/guide/store.ts';
import { hits, ringSource, targetAt } from '../src/explore/track.ts';
import * as copy from '../src/explore/copy.ts';
import { TARGETS } from '../src/core/targets.ts';
import { SCENARIOS } from '../src/core/field.ts';
import type { Field } from '../src/core/types.ts';

const WIN = { width: 1366, height: 768 };

test('placeNear: beside the target, never over it, never over a card it can avoid', () => {
  const target = { left: 600, top: 300, width: 40, height: 40 };
  const card = { left: 560, top: 352, width: 200, height: 200 }; // fills the space below
  const spot = placeNear(target, { width: 280, height: 150 }, WIN, [card]);
  assert.ok(spot);
  assert.ok(!overlaps(spot.box, target));
  assert.ok(!overlaps(spot.box, card));
  assert.notEqual(spot.side, 'below');
});

test('placeNear: stays level with the target instead of sliding far away', () => {
  const target = { left: 1000, top: 700, width: 40, height: 40 };
  const bar = { left: 300, top: 690, width: 900, height: 70 };
  const spot = placeNear(target, { width: 300, height: 200 }, WIN, [bar]);
  assert.ok(spot);
  // Above the target, and overlapping its span across.
  assert.equal(spot.side, 'above');
  assert.ok(spot.box.left < target.left + target.width && spot.box.left + 300 > target.left);
});

test('placeNear: null when nothing is free, unless forced', () => {
  const target = { left: 600, top: 300, width: 40, height: 40 };
  const wall = { left: 0, top: 0, width: 1366, height: 768 };
  assert.equal(placeNear(target, { width: 280, height: 150 }, WIN, [wall]), null);
  const forced = placeNear(target, { width: 280, height: 150 }, WIN, [wall], { force: true });
  assert.ok(forced && !overlaps(forced.box, target));
});

test('placeBeside: outside the card that holds the target', () => {
  const frame = { left: 900, top: 76, width: 450, height: 560 };
  const button = { left: 1100, top: 560, width: 120, height: 32 };
  const spot = placeBeside(button, frame, { width: 300, height: 200 }, WIN, [frame]);
  assert.ok(spot);
  assert.ok(!overlaps(spot.box, frame));
  assert.equal(spot.side, 'left');
});

test('parseStore: reads its own fields, drops junk, an ended tour is not in progress (O-G9)', () => {
  assert.deepEqual(parseStore('not json').tips, []);
  const s = parseStore(
    JSON.stringify({ tour: { id: 'main', step: 3 }, ended: ['main', 'x'], tips: ['mover', 4] }),
  );
  assert.equal(s.tour, null);
  assert.deepEqual(s.ended, ['main']);
  assert.deepEqual(s.tips, ['mover']);
  assert.deepEqual(parseStore(JSON.stringify({ tour: { id: 'numbers', step: 1 } })).tour, {
    id: 'numbers',
    step: 1,
  });
});

test('mergeStore: keeps the other lanes’ fields in sima-guide (lane E’s allNumbers)', () => {
  const s = parseStore(null);
  s.tips.push('mover');
  const out = mergeStore({ allNumbers: true, tips: ['old'] }, s);
  assert.equal(out.allNumbers, true);
  assert.deepEqual(out.tips, ['mover']);
});

test('targetAt: Barnard’s Star moves north about 10.4″ a year by its catalogue motion', () => {
  const barnard = TARGETS.find((t) => t.key === 'barnard')!;
  const field = { simulated: false, target: barnard, frames: [] } as unknown as Field;
  const a = targetAt(field, 'barnard', 60676)!; // 2025-01-01
  const b = targetAt(field, 'barnard', 60676 + 365.25)!;
  const dDec = (b.dec - a.dec) * 3600;
  assert.ok(Math.abs(dDec - 10.36) < 0.05, `moved ${dDec}″ north`);
  assert.equal(targetAt(field, 'r-dra', 60676), null);
  assert.match(ringSource(field), /Gaia DR3/);
});

test('targetAt: a practice patch follows its made-up mover; a real one never uses it', () => {
  const sc = SCENARIOS['warm-up']!;
  const field = {
    simulated: true,
    target: null,
    frames: [{ mjd: 60500 }],
  } as unknown as Field;
  const p0 = targetAt(field, 'warm-up', 60500)!;
  const p1 = targetAt(field, 'warm-up', 60700)!;
  assert.ok(Math.abs(p0.dec - sc.dec) < 0.1);
  assert.notDeepEqual(p0, p1);
  assert.match(ringSource(field), /simulation/);
});

test('hits: a tap near the path between dates counts; one far away does not', () => {
  const path = [
    { x: 100, y: 100 },
    { x: 120, y: 100 },
  ];
  assert.ok(hits(path, { x: 110, y: 110 }, 12));
  assert.ok(!hits(path, { x: 160, y: 100 }, 12));
  assert.ok(!hits([], { x: 0, y: 0 }, 99));
});

test('explore/copy.ts: every export is used somewhere in src (O-W5)', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('copy.ts')) files.push(p);
    }
  };
  walk(new URL('../src', import.meta.url).pathname);
  const code = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const name of Object.keys(copy)) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(code), `${name} is not used`);
  }
  // Every task's hints are short sentences, and practice words never claim to be real.
  for (const [key, t] of Object.entries(copy.TASKS)) {
    assert.equal(t.hints.length, 2, key);
    if (SCENARIOS[key]) assert.match(t.line, /[Mm]ade[- ]up/, key);
  }
});

test('placeNear: never covers a hover card, even when forced (O-G1)', () => {
  const target = { left: 600, top: 300, width: 40, height: 40 };
  const wall = { left: 0, top: 0, width: 1366, height: 768 };
  const hover = { left: 500, top: 150, width: 300, height: 140 };
  const spot = placeNear(target, { width: 280, height: 150 }, WIN, [wall], {
    force: true,
    never: [hover],
  });
  assert.ok(spot && !overlaps(spot.box, hover) && !overlaps(spot.box, target));
});

test('movedLine: one measured sentence, arcseconds and pixels between the first and last date', () => {
  const line = copy.movedLine('A (Aug 2025)', 'C (Aug 2026)', 10.5, 0.26, 6.15);
  assert.equal(
    line,
    'Measured: from A (Aug 2025) to C (Aug 2026) it moved 10.5 ± 0.3″, about 1.7 pixels.',
  );
  assert.match(copy.movedLine('A', 'B', 6.15, 0.1, 6.15), /about 1\.0 pixel\.$/);
  // No discovery words (H7).
  assert.doesNotMatch(line, /discover|new |found a/i);
});
