// Coordinates, dates and SPHEREx facts (lane B).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateToMjd,
  formatCoords,
  formatDate,
  formatDec,
  formatRa,
  mjdToDate,
  mjdToYear,
  offsetArcsec,
  offsetBy,
  parallaxFactors,
  parseCoords,
  propagate,
  separation,
  yearToMjd,
} from '../src/core/astro.ts';
import { BAND_EDGES, CHANNELS, channelLam, channelOf, detectorOf, mjysrToUjy } from '../src/core/instrument.ts';
import { gauss, poisson, rng } from '../src/core/math.ts';

const near = (a: number, b: number, tol: number): void => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('dates: MJD, years and text', () => {
  assert.equal(mjdToDate(51544.5).toISOString(), '2000-01-01T12:00:00.000Z');
  near(dateToMjd(new Date('2026-01-01T00:00:00Z')), 61041, 1e-9);
  near(mjdToYear(yearToMjd(2016)), 2016, 1e-12);
  near(yearToMjd(2016), 57388.5, 1e-9);
  assert.equal(formatDate(61120.28, 'month'), 'Mar 2026');
  assert.equal(formatDate(61120.28, 'day'), '21 Mar 2026');
  assert.equal(formatDate(61120.28, 'time'), '21 Mar 2026, 06:43 UTC');
  assert.equal(formatDate(61120.99999), '22 Mar 2026');
});

test('coordinates as text, with carries and the true minus sign', () => {
  assert.equal(formatRa(269.44850252543836), '17h 57m 47.64s');
  assert.equal(formatDec(4.739420051112412), '+04° 44′ 21.9″');
  assert.equal(formatDec(-7.244433), '−07° 14′ 40.0″');
  assert.equal(formatRa(359.99999999), '00h 00m 00.00s');
  assert.equal(formatDec(-0.0000001), '+00° 00′ 00.0″');
  assert.equal(formatCoords(0, 0), '00h 00m 00.00s +00° 00′ 00.0″');
});

test('typed coordinates', () => {
  assert.deepEqual(parseCoords('217.429 -62.680'), { ra: 217.429, dec: -62.68 });
  const s = parseCoords('17 57 48.5 +04 41 36')!;
  near(s.ra, (17 + 57 / 60 + 48.5 / 3600) * 15, 1e-9);
  near(s.dec, 4 + 41 / 60 + 36 / 3600, 1e-9);
  const h = parseCoords('17h57m48.5s +4°41′36″')!;
  near(h.ra, s.ra, 1e-9);
  near(h.dec, s.dec, 1e-9);
  const c = parseCoords('17:57:48.5, −04:41:36')!;
  near(c.dec, -s.dec, 1e-9);
  assert.equal(parseCoords('barnard'), null);
  assert.equal(parseCoords('400 10'), null);
  assert.equal(parseCoords('10 95'), null);
});

test('separations and offsets, small and large', () => {
  near(separation(10, 0, 10, 1), 1, 1e-12);
  near(separation(0, 89.9, 180, 89.9), 0.2, 1e-9);
  near(separation(1, 1, 1 + 1e-7, 1) * 3600, 1e-7 * 3600 * Math.cos((1 * Math.PI) / 180), 1e-6);
  const o = offsetArcsec(100, 30, 100.001, 30.001);
  near(o.north, 3.6, 0.01);
  near(o.east, 3.6 * Math.cos(Math.PI / 6), 0.01);
  const back = offsetBy(100, 30, o.east, o.north);
  near(back.ra, 100.001, 1e-10);
  near(back.dec, 30.001, 1e-10);
});

test("propagate: Barnard's Star moves about 10.4″ a year, mostly north", () => {
  const p = propagate(269.4485, 4.7394, -801.55, 10362.39, 2016, 2026);
  const o = offsetArcsec(269.4485, 4.7394, p.ra, p.dec);
  near(o.north, 103.6239, 1e-3);
  near(o.east, -8.0155, 1e-3);
});

test('parallax factors: a star at the ecliptic pole swings by 1 in a year; size at most 1', () => {
  let max = 0;
  for (let d = 0; d < 365; d += 5) {
    const f = parallaxFactors(61000 + d, 270, 66.56);
    max = Math.max(max, Math.hypot(f.east, f.north));
    assert.ok(Math.hypot(f.east, f.north) < 1.02);
  }
  assert.ok(max > 0.97);
});

test('detectors and channels', () => {
  assert.equal(BAND_EDGES.length, 7);
  assert.equal(detectorOf(0.8), 1);
  assert.equal(detectorOf(2.0), 3);
  assert.equal(detectorOf(4.9), 6);
  assert.equal(detectorOf(9), 6);
  assert.equal(CHANNELS, 102);
  for (let c = 0; c < CHANNELS; c++) assert.equal(channelOf(channelLam(c), Math.floor(c / 17) + 1), c);
  near(mjysrToUjy(6.15 * 6.15), 888.96, 0.1);
});

test('seeded random numbers repeat and look right', () => {
  const a = rng(42);
  const b = rng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const r = rng(1);
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < 20000; i++) {
    const g = gauss(r);
    s += g;
    s2 += g * g;
  }
  near(s / 20000, 0, 0.03);
  near(s2 / 20000, 1, 0.04);
  let p = 0;
  for (let i = 0; i < 5000; i++) p += poisson(r, 4);
  near(p / 5000, 4, 0.1);
});
