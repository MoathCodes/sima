// Catalogue filters on the sky view (O-V5): the addresses asked of VizieR, the answers read into
// rows, the cuts, the area and the pages. The answers are real VizieR answers fetched on
// 14 November 2026 and trimmed (tests/fixtures/vizier-*.tsv).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAP,
  MAX_RADIUS,
  coldObjects,
  coldUrl,
  fastMovers,
  fastMoverUrl,
  pageOf,
  placeAt,
  readTable,
  rowValues,
  searchArea,
  type FindArea,
} from '../src/core/finds.ts';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const barnardArea: FindArea = { ra: 269.452, dec: 4.693, radius: 1, clipped: false };
const wiseArea: FindArea = { ra: 133.787, dec: -7.244, radius: 0.5, clipped: false };

test('the area is the view out to its corners, never wider than the catalogue allows', () => {
  const a = searchArea('gaia', { ra: 10, dec: 20 }, 0.6, 1600, 900);
  assert.ok(Math.abs(a.radius - 0.3 * Math.hypot(1, 900 / 1600)) < 1e-9);
  assert.equal(a.clipped, false);
  const wide = searchArea('gaia', { ra: 10, dec: 20 }, 40, 1600, 900);
  assert.equal(wide.radius, MAX_RADIUS.gaia);
  assert.equal(wide.clipped, true);
  assert.equal(searchArea('catwise', { ra: 10, dec: 20 }, 3, 1600, 900).radius, MAX_RADIUS.catwise);
});

test('the Gaia address filters on total motion, fastest first, one row over the cap', () => {
  const u = new URL(fastMoverUrl(barnardArea, 250));
  assert.equal(u.searchParams.get('-source'), 'I/355/gaiadr3');
  assert.equal(u.searchParams.get('PM'), '>250');
  assert.equal(u.searchParams.get('-sort'), '-PM');
  assert.equal(u.searchParams.get('-out.max'), String(CAP.gaia + 1));
  assert.equal(u.searchParams.get('-c.rd'), '1.00000');
  assert.match(u.searchParams.get('-c') ?? '', /^269\.452000 \+4\.693000$/);
});

test('the CatWISE address asks for every column with a value (an empty -out.all gives no rows)', () => {
  const u = new URL(coldUrl(wiseArea, 15, 100, 'https://vizier.idia.ac.za/viz-bin/asu-tsv'));
  assert.equal(u.host, 'vizier.idia.ac.za');
  assert.equal(u.searchParams.get('-out.all'), '1');
  assert.equal(u.searchParams.get('W2mproPM'), '<15');
  assert.equal(u.searchParams.get('-sort'), '_r');
  assert.equal(u.searchParams.get('-out.max'), '101');
  assert.match(u.searchParams.get('-c') ?? '', /-7\.244000$/);
});

test('fast movers: Barnard’s Star leads, every row is over the cut, values are the catalogue’s', () => {
  const r = fastMovers(fixture('vizier-gaia-barnard.tsv'), barnardArea, 200);
  assert.equal(r.rows.length, 6);
  assert.equal(r.capped, false);
  const top = r.rows[0]!;
  assert.equal(top.id, 'Gaia DR3 4472832130942575872');
  assert.ok(Math.abs(top.pm - 10393.349) < 1e-6);
  assert.ok(Math.abs(top.plx! - 546.9759) < 1e-6);
  assert.equal(top.ep, 2016);
  assert.ok(r.rows.every((x) => x.pm > 200));
  for (let i = 1; i < r.rows.length; i++) assert.ok(r.rows[i - 1]!.pm >= r.rows[i]!.pm);
  // A stricter cut on the same answer keeps only the rows over it.
  assert.deepEqual(
    fastMovers(fixture('vizier-gaia-barnard.tsv'), barnardArea, 300).rows.map((x) => Math.round(x.pm)),
    [10393, 383, 313],
  );
  assert.deepEqual(rowValues(top), ['10,393 mas/yr', 'G 8.19', 'parallax 547.0 mas']);
  assert.match(r.cut, /faster than 200 mas\/yr/);
});

test('a capped answer says so: one row more than the cap means the list stops short', () => {
  const r = fastMovers(fixture('vizier-gaia-barnard.tsv'), barnardArea, 200, 5);
  assert.equal(r.capped, true);
  assert.equal(r.rows.length, 5);
});

test('cold objects: WISE 0855−0714’s detections lead, the colour is W1−W2 worked out here', () => {
  const r = coldObjects(fixture('vizier-catwise-wise0855.tsv'), wiseArea, 1.5);
  assert.ok(r.rows.length >= 4, `${r.rows.length}`);
  const top3 = r.rows.slice(0, 3).map((x) => x.id);
  assert.deepEqual(top3.sort(), [
    'CWISE J085506.91-071437.5',
    'CWISE J085507.96-071439.3',
    'CWISE J085508.34-071439.2',
  ]);
  for (const x of r.rows) {
    assert.ok(x.colour! > 1.5);
    assert.ok(Math.abs(x.colour! - (x.w1! - x.w2!)) < 1e-9);
    assert.ok(x.w2! < 15);
  }
  // CatWISE motions are arcsec/yr; rows hold mas/yr like Gaia's.
  const w = r.rows.find((x) => x.id === 'CWISE J085508.34-071439.2')!;
  assert.ok(w.pm > 1000, `${w.pm}`);
  assert.match(r.cut, /W1−W2 above 1\.5 mag/);
});

test('a CatWISE row with no W1 has no colour: left out of the list and counted (H5)', () => {
  const text = fixture('vizier-catwise-wise0855.tsv');
  const t = readTable(text);
  const i1 = t.header.indexOf('W1mproPM');
  // Blank the W1 of the first data row.
  const lines = text.split('\n');
  const first = lines.findIndex((l, i) => i > 0 && !l.startsWith('#') && /^\d/.test(l.trim()));
  const cells = lines[first]!.split('\t');
  cells[i1] = '      ';
  lines[first] = cells.join('\t');
  const r = coldObjects(lines.join('\n'), wiseArea, 0.5);
  assert.equal(r.noColour, 1);
  assert.ok(r.rows.every((x) => Number.isFinite(x.colour!)));
});

test('an answer with column notes and no table is a failure, not "none found"', () => {
  const notes = '#Column\tPM\t(F9.3)\tTotal proper motion\n#\n\nContent-Type: application/x-votable+xml\n';
  assert.throws(() => fastMovers(notes, barnardArea, 200), /no table/);
  assert.throws(() => coldObjects('', wiseArea, 1.5), /no table/);
});

test('an empty table is a real "none found": no rows, not capped', () => {
  const text = fixture('vizier-gaia-barnard.tsv')
    .split('\n')
    .filter((l) => !l.startsWith('Gaia DR3'))
    .join('\n');
  const r = fastMovers(text, barnardArea, 200);
  assert.equal(r.rows.length, 0);
  assert.equal(r.capped, false);
});

test('pages: 20 rows each, clamped, with from and to', () => {
  const rows = Array.from({ length: 45 }, (_, i) => i);
  assert.deepEqual(pageOf(rows, 0), { rows: rows.slice(0, 20), page: 0, pages: 3, from: 1, to: 20, total: 45 });
  const last = pageOf(rows, 9);
  assert.equal(last.page, 2);
  assert.deepEqual([last.from, last.to], [41, 45]);
  assert.deepEqual(pageOf([], 0), { rows: [], page: 0, pages: 1, from: 0, to: 0, total: 0 });
});

test('"Look with the frame" moves a fast star to the middle of SPHEREx’s dates', () => {
  const r = fastMovers(fixture('vizier-gaia-barnard.tsv'), barnardArea, 200);
  const p = placeAt(r.rows[0]!);
  // Barnard's Star moves 10.36″/yr north: 10 years from 2016 is about 104″ north.
  assert.ok(Math.abs((p.dec - r.rows[0]!.dec) * 3600 - 103.6) < 0.5);
});
