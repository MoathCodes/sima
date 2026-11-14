// Catalogue rows moved to a date, the neighbour rule, VizieR answers, and the targets (lane B).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atDate, blendedWith, parseVizierTsv } from '../src/core/catalog.ts';
import { offsetArcsec, yearToMjd } from '../src/core/astro.ts';
import { TARGETS, targetByKey } from '../src/core/targets.ts';
import type { Neighbour } from '../src/core/types.ts';

const nb = (o: Partial<Neighbour>): Neighbour => ({
  cat: 'gaia',
  id: 'x',
  ra: 100,
  dec: 0,
  ep: 2016,
  pmra: 0,
  pmdec: 0,
  mag: 15,
  ...o,
});

test('a catalogue row moves with its motion to the picture date', () => {
  const p = atDate(nb({ pmdec: 1000 }), yearToMjd(2026));
  const o = offsetArcsec(100, 0, p.ra, p.dec);
  assert.ok(Math.abs(o.north - 10) < 1e-6 && Math.abs(o.east) < 1e-6);
});

test('the neighbour rule: within 12.3″ and at most 2.5 mag fainter than the target', () => {
  const t = { ...targetByKey('rw-aur')!, ra: 100, dec: 0, ep: 2016, pmra: 0, pmdec: 0 };
  const own = nb({ id: 'own', mag: 12, target: true });
  const mjd = yearToMjd(2016);
  const close = (dArcsec: number, mag: number, cat: 'gaia' | 'catwise' = 'gaia'): Neighbour =>
    nb({ id: `n${dArcsec}-${mag}`, dec: dArcsec / 3600, mag, cat });
  assert.equal(blendedWith(t, [own, close(10, 14)], mjd)?.id, 'n10-14');
  assert.equal(blendedWith(t, [own, close(10, 15)], mjd), null, 'too faint');
  assert.equal(blendedWith(t, [own, close(13, 12)], mjd), null, 'too far');
  // CatWISE without the target in it: the Gaia G stands in for W1.
  assert.equal(blendedWith(t, [own, close(5, 14.4, 'catwise')], mjd)?.cat, 'catwise');
  // Gaia without the target in it: any brightness counts.
  const wiseOnly = nb({ id: 'w', cat: 'catwise', mag: 14, target: true });
  assert.equal(blendedWith(t, [wiseOnly, close(5, 20)], mjd)?.id, 'n5-20');
});

test('VizieR answers become neighbours: CatWISE motions times 1000, W2 when W1 is empty', () => {
  const gaia = [
    '#comment',
    'DR3Name\tRA_ICRS\tDE_ICRS\tpmRA\tpmDE\tGmag',
    '\tdeg\tdeg\tmas/yr\tmas/yr\tmag',
    '-----\t-----\t-----\t-----\t-----\t-----',
    'Gaia DR3 1\t10.0\t-5.0\t1.5\t-2.5\t12.3',
    'Gaia DR3 2\t10.1\t-5.1\t\t\t18.0',
    '',
  ].join('\n');
  const g = parseVizierTsv('gaia', gaia);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0]!.id, g[0]!.ep, g[0]!.pmra, g[1]!.pmra], ['Gaia DR3 1', 2016, 1.5, 0]);
  const cw = [
    'Name\tRAPMdeg\tDEPMdeg\tpmRA\tpmDE\tW1mproPM\tW2mproPM',
    '\tdeg\tdeg\tarcsec/yr\tarcsec/yr\tmag\tmag',
    '----\t----\t----\t----\t----\t----\t----',
    'J000000.00+000000.0\t1.0\t2.0\t-8.0\t0.7\t\t14.2',
  ].join('\n');
  const c = parseVizierTsv('catwise', cw);
  assert.equal(c[0]!.id, 'CWISE J000000.00+000000.0');
  assert.equal(c[0]!.pmra, -8000);
  assert.equal(c[0]!.mag, 14.2);
  assert.ok(Math.abs(c[0]!.ep - 2015.4019) < 1e-3);
});

test('targets: every kind and period says where it comes from (H4, H9)', () => {
  for (const t of TARGETS) {
    assert.ok(t.kind.length > 0, t.key);
    assert.match(t.kindFrom ?? '', /SIMBAD/);
    assert.ok((t.periodFrom ?? '').length > 0);
  }
  assert.equal(targetByKey('r-dra')!.period, 246.12);
  assert.match(targetByKey('r-dra')!.periodFrom!, /VSX/);
  assert.equal(targetByKey('rw-aur')!.period, null);
  assert.equal(targetByKey('nope'), null);
});
