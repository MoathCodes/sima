// Tests for the sky's projection and the dots and labels on it (src/sky/project.ts,
// src/sky/layout.ts): PLC-2, PLC-3, PLC-8. Owner: lane C.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calibrate,
  fovOf,
  globeScale,
  makeView,
  plane,
  project,
  separation,
  widestFov,
  zoomOf,
} from '../src/sky/project.ts';
import { layout, maxTier, type Box, type LayoutInput } from '../src/sky/layout.ts';

const W = 1900;
const H = 1030;

/** The view Aladin shows `fov` degrees wide: SIN puts fov/2 from the centre at the edge. */
function viewOf(ra: number, dec: number, fov: number) {
  return makeView(ra, dec, globeScale(W, fov), W / 2, H / 2, -1);
}

test('the centre projects to the middle; east is left, north is up', () => {
  const v = viewOf(269.45, 4.69, 2);
  const c = project(v, 269.45, 4.69);
  assert.ok(c && Math.abs(c.x - W / 2) < 1e-6 && Math.abs(c.y - H / 2) < 1e-6);
  const east = project(v, 269.95, 4.69);
  const north = project(v, 269.45, 5.19);
  assert.ok(east && east.x < W / 2);
  assert.ok(north && north.y < H / 2);
});

test('a globe: at 180° the half-width point sits on the window edge, the far side is hidden (SKY-1)', () => {
  const v = viewOf(0, 0, 180);
  const edge = project(v, 90, 0); // 90° east of the centre: the left edge
  assert.ok(edge && Math.abs(edge.x) < 1e-6);
  assert.equal(plane(v, 100, 40), null);
  assert.equal(project(v, 180, 0), null);
});

test('zoom factor and width agree with Aladin, continuous through 180° (SKY-1)', () => {
  assert.ok(Math.abs(zoomOf(60) - 0.5) < 1e-12);
  assert.equal(zoomOf(180), 1);
  assert.equal(zoomOf(360), 2);
  for (const f of [0.05, 2, 60, 179, 180, 181, 300, 360]) assert.ok(Math.abs(fovOf(zoomOf(f)) - f) < 1e-9);
  // The widest view: the whole globe fits the window's shorter side, with room round it.
  const wide = widestFov(W, H);
  assert.equal(wide, 360);
  assert.ok(2 * globeScale(W, wide) < H);
  const phone = widestFov(390, 844);
  assert.ok(phone > 180 && 2 * globeScale(390, phone) < 390);
});

test('calibrate recovers the scale and the east-left flip', () => {
  const v = viewOf(10, -30, 40);
  const p = project(v, 18, -25);
  assert.ok(p);
  const cal = calibrate(makeView(10, -30, 1, W / 2, H / 2), 18, -25, p.x, p.y);
  assert.ok(cal);
  assert.ok(Math.abs(cal.scale / v.scale - 1) < 1e-9);
  assert.equal(cal.flip, -1);
});

test('separation', () => {
  assert.ok(Math.abs(separation(0, 0, 90, 0) - 90) < 1e-9);
  assert.ok(Math.abs(separation(10, 89, 190, 89) - 2) < 1e-9);
});

interface Place {
  ra: number;
  dec: number;
  tier: number;
  kind: string;
  names: { common?: string; catalogue: string[] };
}
const places = (
  JSON.parse(readFileSync('src/data/places.json', 'utf8')) as { places: Place[] }
).places
  .slice()
  .sort((a, b) => a.tier - b.tier);
const inputs = (kind: string | null): LayoutInput[] =>
  places.map((p) => ({
    ra: p.ra,
    dec: p.dec,
    tier: p.tier,
    always: p.kind === kind,
    width: 6.5 * (p.names.common ?? p.names.catalogue[0] ?? '').length + 2,
  }));

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('more places appear as the view narrows, like cities then towns (PLC-2)', () => {
  assert.equal(maxTier(180), 0);
  assert.equal(maxTier(70), 1);
  assert.equal(maxTier(1.9), 4);
  const wide = layout(inputs(null), viewOf(266, -29, 180), W, H, 180, []);
  assert.ok(wide.every((p) => (places[p.index]?.tier ?? 9) === 0));
  assert.ok(wide.length > 3);
});

test('with a kind chip on, all of that kind show at any zoom: brown dwarfs at 70° (PLC-2)', () => {
  const all = inputs('brown-dwarf');
  // A wide view over the most brown dwarfs: count those that should be in it.
  const v = viewOf(180, 0, 70);
  const placed = layout(all, v, W, H, 70, []);
  const dwarfs = placed.filter((p) => places[p.index]?.kind === 'brown-dwarf');
  const inside = places.filter((p) => {
    if (p.kind !== 'brown-dwarf') return false;
    const s = project(v, p.ra, p.dec);
    return s && s.x >= -4 && s.y >= -4 && s.x <= W + 4 && s.y <= H + 4;
  });
  assert.ok(inside.length > 0);
  assert.equal(dwarfs.length, inside.length);
  const off = layout(inputs(null), v, W, H, 70, []).filter(
    (p) => places[p.index]?.kind === 'brown-dwarf',
  );
  assert.ok(off.length < dwarfs.length);
});

test('labels never overlap each other, a card, or the window edge (PLC-3)', () => {
  const cards: Box[] = [
    { left: 1384, top: 76, right: 1884, bottom: 740 }, // frame
    { left: 410, top: 916, right: 1490, bottom: 1000 }, // bar
    { left: 16, top: 14, right: 547, bottom: 98 }, // top left
  ];
  for (const [ra, dec, fov] of [
    [266, -29, 180],
    [83, -5, 60],
    [269.45, 4.69, 12],
    [10.7, 41.3, 1.9],
  ] as const) {
    const placed = layout(inputs('open-cluster'), viewOf(ra, dec, fov), W, H, fov, cards);
    const labels = placed.flatMap((p) => (p.label ? [p.label] : []));
    for (let i = 0; i < labels.length; i++) {
      const a = labels[i] as Box;
      assert.ok(a.left >= 0 && a.top >= 0 && a.right <= W && a.bottom <= H);
      for (const c of cards) assert.ok(!overlaps(a, c), 'a label touches a card');
      for (let j = i + 1; j < labels.length; j++)
        assert.ok(!overlaps(a, labels[j] as Box), 'labels overlap');
    }
  }
});

test(`laying out all ${places.length} places takes well under 4 ms (PLC-8)`, () => {
  const all = inputs('open-cluster');
  const views = [
    [266, -29, 180],
    [83, -5, 60],
    [269.45, 4.69, 12],
    [10.7, 41.3, 1.9],
  ] as const;
  const times: number[] = [];
  for (let round = 0; round < 40; round++) {
    for (const [ra, dec, fov] of views) {
      const t0 = performance.now();
      layout(all, viewOf(ra + round * 0.01, dec, fov), W, H, fov, []);
      times.push(performance.now() - t0);
    }
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
  console.log(
    `# layout of ${all.length} dots: median ${median.toFixed(3)} ms, 95th percentile ${p95.toFixed(3)} ms`,
  );
  assert.ok(median < 2, `median ${median} ms`);
});

test('labels stay calm while the view moves: kept sides, nothing new until it stops', () => {
  const all = inputs(null);
  const before = layout(all, viewOf(269.45, 4.69, 30), W, H, 30, []);
  const sides = new Map(before.filter((p) => p.side >= 0).map((p) => [all[p.index]!, p.side]));
  assert.ok(sides.size > 3);
  // A small zoom in, as one wheel step: no label changes side and none is added.
  const moving = layout(all, viewOf(269.45, 4.69, 26), W, H, 26, [], sides, false);
  for (const p of moving) {
    if (p.side < 0) continue;
    assert.equal(sides.get(all[p.index]!), p.side, 'a label flipped side mid-zoom');
  }
  // Once the view stops, labels may be added; the kept ones still keep their side.
  const kept = new Map(moving.filter((p) => p.side >= 0).map((p) => [all[p.index]!, p.side]));
  const rest = layout(all, viewOf(269.45, 4.69, 26), W, H, 26, [], kept, true);
  for (const [d, side] of kept) assert.equal(rest.find((p) => all[p.index] === d)?.side, side);
  assert.ok(rest.filter((p) => p.side >= 0).length >= kept.size);
});

test('ux-audit #7: a label never runs through another place\'s dot; a ringed dot\'s label clears its ring', () => {
  const v = viewOf(0, 0, 10);
  const c = project(v, 0, 0)!;
  // Two dots 30 px apart on one line: the first's label (60 px wide, to the right) would cross
  // the second dot.
  const degPerPx = 10 / W;
  const a: LayoutInput = { ra: 0, dec: 0, tier: 0, always: true, width: 60 };
  const b: LayoutInput = { ra: -30 * degPerPx, dec: 0, tier: 0, always: true, width: 60 };
  const placed = layout([a, b], v, W, H, 10, []);
  const dots = placed.map((p) => ({ x: p.x, y: p.y }));
  assert.ok(Math.abs((dots[1]?.x ?? 0) - (dots[0]?.x ?? 0)) > 20, 'the two dots are apart on screen');
  for (const p of placed) {
    if (!p.label) continue;
    for (const d of dots) {
      if (d.x === p.x && d.y === p.y) continue;
      const inside = d.x >= p.label.left && d.x <= p.label.right && d.y >= p.label.top && d.y <= p.label.bottom;
      assert.ok(!inside, `a label covers another dot at ${d.x},${d.y}`);
    }
  }
  const ringed = layout([{ ...a, gap: 11 }], v, W, H, 10, [])[0]!;
  assert.ok(ringed.label, 'the ringed dot is labelled');
  const l = ringed.label!;
  const dx = Math.max(l.left - c.x, 0, c.x - l.right);
  const dy = Math.max(l.top - c.y, 0, c.y - l.bottom);
  assert.ok(Math.hypot(dx, dy) > 8, 'the label starts outside the 8 px ring');
});
