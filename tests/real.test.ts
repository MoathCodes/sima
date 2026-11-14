// Real exposures: decoding, flags, sky ↔ pixel, centroids, the field grid, and the SPEC 7.3
// results that come from measuring the target (lane B). Runs on the shipped data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  badMaskOf,
  colourMatch,
  detectorsIn,
  fieldGrid,
  measureTarget,
  wcsPix2Sky,
  wcsSky2Pix,
} from '../src/core/real.ts';
import { fitMotion, foldCurve, lowerLimits, realCurve } from '../src/core/fit.ts';
import { channelSpectrum } from '../src/core/stats.ts';
import { loadField, loadSet, target } from './core-data.ts';

test('decodes every shipped target: one picture per exposure, flags kept, values in range', async () => {
  for (const key of ['barnard', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra']) {
    const set = await loadSet(key);
    assert.equal(set.frames.length, set.data.frames.length, key);
    for (const f of set.frames) {
      assert.equal(f.pix.length, f.meta.w * f.meta.h);
      assert.equal(f.flags.length, f.meta.w * f.meta.h);
    }
    // The median pixel sits near zero (zodiacal light subtracted) and some stars are bright.
    const f = set.frames[0]!;
    const sorted = [...f.pix].filter(Number.isFinite).sort((a, b) => a - b);
    assert.ok(Math.abs(sorted[sorted.length >> 1]!) < 1, `${key} sky near 0 MJy/sr`);
    assert.ok(sorted[sorted.length - 1]! > 1, `${key} has a star`);
  }
});

test('the bad-flag mask holds the bad flags and not SOURCE', async () => {
  const set = await loadSet('barnard');
  const mask = badMaskOf(set.data);
  const bit = (name: string): number =>
    1 << Number(Object.entries(set.data.flagBits).find(([, n]) => n === name)![0]);
  assert.ok(mask & bit('OVERFLOW'));
  assert.ok(mask & bit('TRANSIENT'));
  assert.equal(mask & bit('SOURCE'), 0);
  assert.equal(mask & bit('FULLSAMPLE'), 0);
});

test('sky ↔ pixel round trip is exact to a thousandth of a pixel', async () => {
  const set = await loadSet('eps-indi-b');
  for (const f of set.frames.slice(0, 5)) {
    for (const [x, y] of [
      [0, 0],
      [10.3, 77.7],
      [f.meta.w - 1, f.meta.h - 1],
    ] as const) {
      const s = wcsPix2Sky(f.meta.wcs, x, y);
      const p = wcsSky2Pix(f.meta.wcs, s.ra, s.dec);
      assert.ok(Math.abs(p.x - x) < 1e-3 && Math.abs(p.y - y) < 1e-3);
    }
  }
});

test('the field grid is north up, east left, 6.15″ pixels, odd and centred', () => {
  const g = fieldGrid(269.45, 4.74, 6);
  assert.equal(g.n % 2, 1);
  assert.ok(g.n * 6.15 >= 360);
  const c = wcsPix2Sky(g.wcs, (g.n - 1) / 2, (g.n - 1) / 2);
  assert.ok(Math.abs(c.ra - 269.45) < 1e-9 && Math.abs(c.dec - 4.74) < 1e-9);
  const north = wcsPix2Sky(g.wcs, (g.n - 1) / 2, 0);
  const east = wcsPix2Sky(g.wcs, 0, (g.n - 1) / 2);
  assert.ok(north.dec > 4.74, 'row 0 is north');
  assert.ok(east.ra > 269.45, 'column 0 is east');
});

test('the field: every exposure resampled, visits numbered, noise per detector, gains in range', async () => {
  const field = await loadField('barnard');
  assert.equal(field.frames.length, 72);
  assert.deepEqual(detectorsIn(field), [1, 2, 3, 4, 5, 6]);
  assert.equal(field.windows, 3);
  for (const f of field.frames) {
    assert.ok(f.visit >= 0 && f.visit < 4);
    assert.ok(f.gain >= 0.25 && f.gain <= 4, `gain ${f.gain}`);
    assert.ok(f.sigma > 0);
  }
  assert.ok(field.noise.every((v) => v > 0));
});

test('same colour: within half a channel width', () => {
  assert.equal(colourMatch({ lam: 2.0, bw: 0.05 }, { lam: 2.02, bw: 0.05 }), true);
  assert.equal(colourMatch({ lam: 2.0, bw: 0.05 }, { lam: 2.03, bw: 0.05 }), false);
});

test("SPEC 7.3: Barnard's Star moves 10.39 ± 0.25″/yr from about 69 of 72 exposures", async () => {
  const set = await loadSet('barnard');
  const t = target('barnard');
  const ms = measureTarget(set, t);
  assert.equal(ms.length, 72);
  const fit = fitMotion(ms, t);
  assert.ok(fit.ok, fit.reason ?? '');
  // Spec: 10.39 ± 0.25 from 69 of 72; catalogue 10.39. Measured here (re-fetched data, 14 Nov
  // 2026): 10.49 ± 0.25 from 71 of 72.
  assert.ok(Math.abs(fit.total - 10.39) <= 2 * 0.25, `${fit.total} ± ${fit.totalErr}`);
  assert.ok(fit.totalErr > 0.1 && fit.totalErr < 0.4, `error ${fit.totalErr}`);
  assert.ok(fit.used >= 66 && fit.of === 72, `${fit.used} of ${fit.of}`);
  assert.equal(fit.matches, true);
  assert.ok(Math.abs(fit.catalogue!.total - 10.39) < 0.01);
  // Parallax is fitted but not shown from three passes (SPEC 7.1.8).
  assert.ok(fit.parallax && !fit.parallax.shown && fit.parallax.why.length > 0);
  // Its core is saturated: positions come from a profile around it, brightness from the glow.
  assert.ok(ms.filter((m) => m.method === 'profile').length > 60);
});

test('SPEC 7.3: Epsilon Indi B moves 4.57 ± 0.09″/yr (catalogue 4.68), with water and methane dips', async () => {
  const set = await loadSet('eps-indi-b');
  const t = target('eps-indi-b');
  const ms = measureTarget(set, t);
  const fit = fitMotion(ms, t);
  assert.ok(fit.ok);
  // Measured here: 4.56 ± 0.09 from 78 of 87.
  assert.ok(Math.abs(fit.total - 4.57) <= 2 * 0.09, `${fit.total} ± ${fit.totalErr}`);
  assert.ok(fit.totalErr < 0.15);
  assert.ok(Math.abs(fit.catalogue!.total - 4.68) < 0.01);
  assert.equal(fit.matches, true);
  // The spectrum from apertures with no flagged pixel.
  const spec = channelSpectrum(
    ms.filter((m) => !m.skipped && !m.lower).map((m) => ({ lam: m.lam, det: m.det, flux: m.flux, err: m.fluxErr })),
  );
  const near = (lam: number): number => {
    const p = spec.reduce((a, b) => (Math.abs(b.lam - lam) < Math.abs(a.lam - lam) ? b : a));
    assert.ok(Math.abs(p.lam - lam) < 0.06, `a channel near ${lam} µm`);
    return p.flux;
  };
  // Water at 1.35–1.4 µm: far below the J and H peaks either side.
  assert.ok(near(1.37) < 0.5 * near(1.11) && near(1.37) < 0.25 * near(1.58), 'water dip');
  // Methane (3.3 µm band, its blue side at 3.0 µm): far below the 4.1 µm peak.
  assert.ok(near(3.04) < 0.5 * near(4.11), 'methane dip');
});

test('SPEC 7.3: R Draconis changes by up to about 0.98 mag in D6', async () => {
  const set = await loadSet('r-dra');
  const t = target('r-dra');
  const curves = realCurve(measureTarget(set, t), t);
  const d6 = curves.find((c) => c.det === 6)!;
  assert.ok(d6.shown);
  assert.ok(d6.points.every((p) => p.glow), 'saturated: the outer glow');
  const v = d6.visits.map((x) => x.dmag);
  const hi = d6.visits[v.indexOf(Math.max(...v))]!;
  const lo = d6.visits[v.indexOf(Math.min(...v))]!;
  const range = hi.dmag - lo.dmag;
  const err = Math.hypot(hi.err, lo.err);
  // Measured here: 1.04 ± 0.07 mag over 10 months.
  assert.ok(Math.abs(range - 0.98) <= 2 * err + 0.02, `${range} ± ${err}`);
  assert.ok(d6.test && d6.test.p < 1e-6, 'it changed');
  // A Mira with a catalogue period: no straight trend, the note points to Folded.
  assert.equal(d6.trend, null);
  assert.match(d6.note ?? '', /Folded/);
  assert.equal(foldCurve(d6.points, t.period!).length, d6.points.length);
});

test('SPEC 7.3: RW Aurigae changes by up to about 0.82 mag', async () => {
  const set = await loadSet('rw-aur');
  const t = target('rw-aur');
  const curves = realCurve(measureTarget(set, t), t).filter((c) => c.shown && c.visits.length >= 2);
  let best = { range: 0, err: 0, det: 0 };
  for (const c of curves) {
    const v = c.visits.map((x) => x.dmag);
    const hi = c.visits[v.indexOf(Math.max(...v))]!;
    const lo = c.visits[v.indexOf(Math.min(...v))]!;
    if (hi.dmag - lo.dmag > best.range) best = { range: hi.dmag - lo.dmag, err: Math.hypot(hi.err, lo.err), det: c.det };
  }
  // Measured here: 0.85 ± 0.11 mag in D6 (0.83 ± 0.15 in D5).
  assert.ok(Math.abs(best.range - 0.82) <= 2 * best.err, `D${best.det}: ${best.range} ± ${best.err}`);
});

test('lower limits are the exposures with a flagged pixel in the aperture', async () => {
  const set = await loadSet('eps-indi-b');
  const ms = measureTarget(set, target('eps-indi-b'));
  const low = lowerLimits(ms);
  assert.ok(low.length > 0 && low.every((m) => m.lower));
});
