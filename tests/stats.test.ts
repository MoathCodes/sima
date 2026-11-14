// Statistics (lane B): weighted means, χ², line fits, visit test, spectrum, rounding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  channelSpectrum,
  chi2Tail,
  chi2Test,
  lineFit,
  median,
  robustSigma,
  roundToError,
  spotPhotometry,
  visitTest,
  weightedMean,
} from '../src/core/stats.ts';
import { loadSet, target } from './core-data.ts';

const near = (a: number, b: number, tol: number): void => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('weighted mean and its error; bad values skipped', () => {
  const m = weightedMean([1, 3, NaN], [1, 1, 1]);
  near(m.mean, 2, 1e-12);
  near(m.err, Math.SQRT1_2, 1e-12);
  assert.ok(Number.isNaN(weightedMean([], []).mean));
});

test('the χ² tail matches known values', () => {
  near(chi2Tail(3.841, 1), 0.05, 1e-3);
  near(chi2Tail(18.307, 10), 0.05, 1e-3);
  near(chi2Tail(2, 2), Math.exp(-1), 1e-9);
  near(chi2Tail(150, 100), 0.000897, 5e-5);
  assert.equal(chi2Tail(0, 3), 1);
  assert.ok(Number.isNaN(chi2Tail(1, 0)));
});

test('"did it change?": steady points pass, a jump fails', () => {
  assert.ok(chi2Test([10, 10.1, 9.9, 10], [0.1, 0.1, 0.1, 0.1]).p > 0.3);
  assert.ok(chi2Test([10, 10, 12, 12], [0.1, 0.1, 0.1, 0.1]).p < 1e-6);
});

test('line fit recovers slope and intercept with errors', () => {
  const x = [0, 1, 2, 3, 4];
  const f = lineFit(x, x.map((v) => 2 + 0.5 * v), [0.1, 0.1, 0.1, 0.1, 0.1]);
  near(f.a, 2, 1e-12);
  near(f.b, 0.5, 1e-12);
  near(f.eb, 0.1 / Math.sqrt(10), 1e-12);
  assert.equal(f.dof, 3);
  assert.ok(Number.isNaN(lineFit([1, 1], [1, 2], [1, 1]).b), 'one x only');
});

test('visit test: steady passes, a jump fails, scatter inside a visit widens the errors', () => {
  const pts = (vals: number[][], err: number) =>
    vals.flatMap((vs, w) => vs.map((value) => ({ window: w, value, err })));
  assert.ok(visitTest(pts([[0, 0.01], [0.01, 0], [0, -0.01]], 0.02)).test.p > 0.3);
  assert.ok(visitTest(pts([[0, 0.01], [0.5, 0.51], [0, -0.01]], 0.02)).test.p < 1e-6);
  const wide = visitTest(pts([[0, 0.3], [0.1, -0.2], [0, 0.25]], 0.02));
  assert.ok(wide.widenedBy > 5);
  assert.equal(wide.visits.length, 3);
});

test('median and robust sigma ignore NaN and outliers', () => {
  assert.equal(median([3, 1, NaN, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  near(robustSigma([-1, 0, 1, 100, -1, 0, 1]), 1.4826, 1e-9);
});

test('rounded to the error: two significant figures, true minus sign', () => {
  assert.equal(roundToError(0.5234, 0.163), '0.52 ± 0.16');
  assert.equal(roundToError(-10.394, 0.2547), '−10.39 ± 0.25');
  assert.equal(roundToError(1234.5, 47), '1235 ± 47');
  assert.equal(roundToError(12345, 678), '12350 ± 680');
  assert.equal(roundToError(1.23, 0.0996), '1.23 ± 0.10');
  assert.equal(roundToError(-0.001, 0.5), '0.00 ± 0.50');
});

test('channel spectrum: one point per channel, weighted, weak ones marked', () => {
  const s = channelSpectrum([
    { lam: 1.0, det: 1, flux: 10, err: 1 },
    { lam: 1.0005, det: 1, flux: 12, err: 1 },
    { lam: 4.6, det: 6, flux: 1, err: 1 },
  ]);
  assert.equal(s.length, 2);
  near(s[0]!.flux, 11, 1e-12);
  assert.equal(s[0]!.n, 2);
  assert.equal(s[1]!.weak, true);
  assert.ok(s[1]!.channel >= 85);
});

test('spot photometry on the original exposures: the target is bright, its core flagged', async () => {
  const set = await loadSet('rw-aur');
  const t = target('rw-aur');
  const pts = spotPhotometry(set, t.ra, t.dec, 1);
  assert.equal(pts.length, set.frames.filter((f) => f.meta.det === 1).length);
  assert.ok(pts.every((p) => p.det === 1));
  assert.ok(pts.some((p) => p.flagged || p.flux > 10000));
});
