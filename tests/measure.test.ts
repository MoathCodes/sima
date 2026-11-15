// Tests for what Measure says (src/viewer/measure/model.ts, words.ts): the headline, its pill,
// the chart that fits it, plain words for statistics, and "not measured" with a reason.
// Owner: lane E. The science results here are made up: these tests check wording and honesty,
// not lane B's numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moverLine, pathLine, targetHeadline, spotHeadline, targetStats, type TargetInput } from '../src/viewer/measure/model.ts';
import { chance, plainP, verdictOf, trendWords } from '../src/viewer/measure/words.ts';
import { targetByKey } from '../src/core/targets.ts';
import type { MotionFit } from '../src/core/types.ts';
import type { DetectorCurve } from '../src/core/fit.ts';
import type { SpotPoint } from '../src/core/stats.ts';

const barnard = targetByKey('barnard')!;

function fit(over: Partial<MotionFit> = {}): MotionFit {
  return {
    ok: true,
    reason: null,
    pmra: -800,
    pmdec: 10360,
    pmraErr: 250,
    pmdecErr: 250,
    total: 10.39,
    totalErr: 0.25,
    pa: 356,
    ra: 269.45,
    dec: 4.74,
    ep: 2026,
    used: 69,
    of: 72,
    visits: 3,
    outliers: [],
    stability: 1.22,
    parallax: { value: 500, err: 300, shown: false, why: 'three passes cannot pin it down' },
    catalogue: { total: 10.39, pmra: -801, pmdec: 10362, source: 'Gaia DR3' },
    matches: true,
    ...over,
  };
}

function input(over: Partial<TargetInput> = {}): TargetInput {
  return { target: barnard, fit: null, curves: null, spectrum: null, stacks: null, exposures: 72, error: null, ...over };
}

/** No bare χ², p or "degrees of freedom" outside a hover (MSR-4, O-G5). */
function visibleText(html: string): string {
  return html.replace(/data-tip="[^"]*"/g, '').replace(/<[^>]+>/g, '');
}

test('a mover leads with its motion, the Path chart and "matches catalogue" (MSR-1, O-G4)', () => {
  const h = targetHeadline(input({ fit: fit() }));
  assert.equal(h.value, '10.39″/yr');
  assert.deepEqual(h.pill, { text: 'matches catalogue', tone: 'good' });
  assert.equal(h.chart, 'path');
  assert.match(visibleText(h.sub), /69 of 72 real exposures · catalogue 10\.39″\/yr/);
  assert.match(visibleText(h.para), /Parallax is not shown/);
});

test('a motion that disagrees with the catalogue says so, in brown with words', () => {
  const h = targetHeadline(input({ fit: fit({ matches: false, total: 7.7 }) }));
  assert.deepEqual(h.pill, { text: 'differs from catalogue', tone: 'warn' });
});

test('an unmeasured motion says "Not measured" and why, never the catalogue value (H5)', () => {
  const h = targetHeadline(input({ fit: fit({ ok: false, reason: 'Seen on only 2 exposures.' }) }));
  assert.equal(h.value, 'Not measured');
  assert.equal(h.chart, 'path');
  assert.match(h.sub, /Seen on only 2 exposures/);
  assert.doesNotMatch(h.value + h.sub, /10\.39/);
  const failed = targetHeadline(input({ error: 'no target with real exposures' }));
  assert.equal(failed.value, 'Not measured');
});

test('the stack lead gives the strongest detector and the cutouts (WISE 0855)', () => {
  const wise = targetByKey('wise-0855')!;
  const pic = (snr: number) => ({ label: 'x', pix: new Float32Array(1), snr });
  const stacks = [3, 5, 6].map((det, i) => ({
    det,
    frames: 10,
    how: 'mean' as const,
    along: pic([1.2, 15.6, 7.2][i]!),
    controls: [pic(0.5), pic(0.4)] as [ReturnType<typeof pic>, ReturnType<typeof pic>],
    note: 'Seen only along the motion.',
  }));
  const h = targetHeadline(input({ target: wise, stacks }));
  assert.equal(h.value, '15.6σ in D5');
  assert.equal(h.chart, 'cutouts');
  assert.equal(h.pill.text, 'seen only when stacked');
  assert.match(visibleText(h.sub), /D6 7\.2σ/);
});

test('the spectrum lead names the brightest colour, never an empty spectrum', () => {
  const eps = targetByKey('eps-indi-b')!;
  const spectrum = [1.0, 2.0, 4.1].map((lam, i) => ({ channel: i, det: 1 + i, lam, flux: [10, 30, 90][i]!, err: 1, n: 3, weak: false }));
  const h = targetHeadline(input({ target: eps, spectrum }));
  assert.equal(h.value, 'Brightest at 4.10 µm');
  assert.equal(h.chart, 'spectrum');
  const few = targetHeadline(input({ target: eps, spectrum: spectrum.slice(0, 2) }));
  assert.equal(few.value, 'Not measured');
});

test('the brightness lead gives the largest change between visits with the test in words', () => {
  const rdra = targetByKey('r-dra')!;
  const curve = (det: number, dmags: number[], p: number): DetectorCurve => ({
    det,
    points: [],
    visits: dmags.map((dmag, w) => ({ window: w, mjd: 61000 + 30 * w, dmag, err: 0.01 })),
    test: { chi2: 300, dof: dmags.length - 1, p },
    widenedBy: 1.6,
    trend: null,
    shown: true,
    note: null,
  });
  const h = targetHeadline(input({ target: rdra, curves: [curve(3, [0, 0.3], 0.5), curve(6, [-0.5, 0.48], 1e-9)] }));
  assert.equal(h.value, '0.98 mag');
  assert.equal(h.chart, 'brightness');
  assert.equal(h.pill.text, 'changed beyond noise');
  assert.match(h.sub, /D6/);
});

test('a spot with every exposure flagged is not measured, and says why', () => {
  const pts: SpotPoint[] = [1, 2].map((i) => ({ frame: i, mjd: 61000 + i, det: 3, lam: 2, window: i, flux: Number.NaN, err: Number.NaN, flagged: true, nearSaturated: null }));
  const h = spotHeadline(pts, 3, null, null, { mean: Number.NaN, err: Number.NaN });
  assert.equal(h.value, 'Not measured');
  assert.match(h.sub, /flagged pixel/);
});

test('statistics are words first; the exact numbers wait in the hover (MSR-4)', () => {
  const changed = plainP({ chi2: 80, dof: 3, p: 1e-6 });
  const text = visibleText(changed);
  assert.match(text, /Did it change\? Yes, more than noise allows/);
  assert.doesNotMatch(text, /χ²|chi|degrees of freedom|\bp\b/i);
  assert.match(changed, /data-tip="A chi-square test/);
  assert.match(visibleText(plainP({ chi2: 2, dof: 3, p: 0.57 })), /Not beyond its error bars: .* about 57 in 100 times/);
  assert.match(visibleText(plainP({ chi2: 0.1, dof: 5, p: 0.9999 })), /error bars are probably too big/);
  assert.match(visibleText(plainP(null)), /Not tested/);
  assert.equal(verdictOf({ chi2: 1, dof: 0, p: Number.NaN }), 'untested');
});

test('chances and notes read as people say them', () => {
  assert.equal(chance(0.0001), 'less than 1 in 1,000');
  assert.equal(chance(0.05), 'about 1 in 20');
  assert.equal(chance(0.34), 'about 34 in 100');
  assert.equal(trendWords({ slope: 0.05, err: 0.01, drawn: true }), 'fading 0.05 ± 0.01 mag a year');
  assert.equal(trendWords({ slope: -0.05, err: 0.01, drawn: false }), '');
});

test('the stats column labels each number measured or catalogue (H4)', () => {
  const coords = (ra: number, dec: number): [string, string] => [String(ra), String(dec)];
  const rows = targetStats(barnard, fit(), 3, coords);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(byName['Motion RA (measured)']?.from, 'measured');
  assert.equal(byName['Motion RA (catalogue)']?.from, 'catalogue');
  assert.equal(byName['Parallax (catalogue)']?.from, 'catalogue');
  assert.equal(byName['RA']?.from, 'measured');
  const none = targetStats(barnard, fit({ ok: false }), 3, coords);
  assert.equal(none.find((r) => r.name === 'Motion RA (measured)')?.value, 'Not measured');
  assert.equal(none.find((r) => r.name === 'RA')?.from, 'catalogue');
  for (const r of rows) assert.ok(r.tip.length > 10, `${r.name} explains itself`);
});

test('the headline is about the detector on screen, and offers the strongest (MSR-1, O-T6)', () => {
  const rdra = targetByKey('r-dra')!;
  const curve = (det: number, dmags: number[], p: number, shown = true): DetectorCurve => ({
    det,
    points: [],
    visits: dmags.map((dmag, w) => ({ window: w, mjd: 61000 + 30 * w, dmag, err: 0.01 })),
    test: { chi2: 3, dof: dmags.length - 1, p },
    widenedBy: 1,
    trend: null,
    shown,
    note: shown ? null : 'The core is saturated on every exposure.',
  });
  const curves = [curve(3, [0, 0.1], 0.5), curve(6, [-0.5, 0.48], 1e-9), curve(4, [0, 0], 0.5, false)];
  const best = targetHeadline(input({ target: rdra, curves }));
  assert.equal(best.det, 6);
  assert.equal(best.best, 6);
  const d3 = targetHeadline(input({ target: rdra, curves, det: 3 }));
  assert.equal(d3.value, '0.10 mag');
  assert.equal(d3.pill.text, 'steady within noise');
  assert.equal(d3.det, 3);
  assert.equal(d3.best, 6);
  assert.match(d3.sub, /data-do="det" data-det="6"/);
  const d4 = targetHeadline(input({ target: rdra, curves, det: 4 }));
  assert.equal(d4.value, 'Not measured');
  assert.match(visibleText(d4.sub), /Not measured in D4: The core is saturated on every exposure\./);
  assert.match(d4.sub, /data-det="6"/);
});

test('still working says "Measuring…", never "Not measured" (H5)', () => {
  const h = targetHeadline(input({ target: targetByKey('rw-aur')! }));
  assert.equal(h.value, 'Measuring…');
  assert.equal(h.pending, true);
  assert.equal(h.pill.text, '');
  assert.equal(targetHeadline(input()).value, 'Measuring…');
});

test('Path states the fitted total with its error, next to the named catalogue (MSR-3)', () => {
  const eps = targetByKey('eps-indi-b')!;
  const line = visibleText(pathLine(eps, fit({ total: 4.56, totalErr: 0.09, catalogue: { total: 4.68, pmra: 0, pmdec: 0, source: 'Gaia DR3' } })));
  assert.match(line, /Measured: 4\.56 ± 0\.09″\/yr/);
  assert.match(line, /Catalogue: 4\.68″\/yr \(Gaia DR3\)/);
  const not = visibleText(pathLine(eps, fit({ ok: false, reason: 'Too faint on single exposures.' })));
  assert.match(not, /Motion not measured: Too faint on single exposures\./);
  assert.doesNotMatch(not, /Measured:/);
  const rows = targetStats(eps, fit({ total: 4.56, totalErr: 0.09 }), 3, (a, b) => [String(a), String(b)]);
  assert.equal(rows.find((r) => r.name === 'Motion (measured)')?.value, '4.56 ± 0.09″/yr');
});

test('a mover candidate states its measured motion and the catalogue it matches', () => {
  const c = {
    motion: { pmra: 0, pmdec: 0, total: 11.47, totalErr: 0.73 },
    path: [{ frame: 0, mjd: 61000, east: 0, north: 0, err: 1 }],
    known: { cat: 'gaia' as const, id: 'Gaia DR3 1', pmTotal: 10.39 },
  } as unknown as Parameters<typeof moverLine>[0];
  const t = visibleText(moverLine(c, 3));
  assert.match(t, /Measured: 11\.47 ± 0\.73″\/yr from 1 position in D3/);
  assert.match(t, /Catalogue: 10\.39″\/yr \(Gaia DR3\)/);
});
