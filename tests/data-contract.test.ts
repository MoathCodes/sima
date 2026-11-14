// The shipped data files and the types that read them must agree (docs/data-format.md,
// src/core/types.ts), and core/targets.ts must carry the same catalogue values as each target's
// frames.json. Owner: lane B (written in phase 0). Lane A changes the files; if this fails, the
// types or the targets change with them, in the same merge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TARGETS } from '../src/core/targets.ts';
import type { DataIndex, TargetData } from '../src/core/types.ts';

const read = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8')) as T;

const manifest = read<DataIndex>('data/manifest.json');
const KEYS = ['barnard', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra'];

/** The fields of each type, as docs/data-format.md lists them. Keep in step with types.ts. */
const FIELDS = {
  manifest: ['collections', 'generated', 'source', 'targets', 'version'],
  entry: ['bytes', 'frames', 'label', 'path', 'releases', 'windows'],
  target: [
    'badFlags',
    'catalogue',
    'flagBits',
    'fov',
    'frames',
    'monthly',
    'neighbours',
    'neighboursFrom',
    'perDetPerWindow',
    'size',
    'units',
  ],
  catalogue: ['dec', 'ep', 'from', 'parallax', 'pmdec', 'pmra', 'ra'],
  frame: [
    'badFrac',
    'bw',
    'cutout',
    'dateObs',
    'det',
    'exptime',
    'h',
    'id',
    'lam',
    'mjd',
    'offset',
    'omega',
    'pipeline',
    'release',
    'sigma',
    'url',
    'w',
    'wcs',
    'wcsErr',
    'window',
    'zodi',
  ],
  wcs: ['cd', 'crpix', 'crval'],
  neighbour: ['cat', 'dec', 'ep', 'id', 'mag', 'pmdec', 'pmra', 'ra'],
};

const keysOf = (o: object) => Object.keys(o).sort();

test('the manifest lists the five targets with the documented fields', () => {
  assert.deepEqual(keysOf(manifest), FIELDS.manifest);
  assert.deepEqual(keysOf(manifest.targets).sort(), [...KEYS].sort());
  for (const key of KEYS) {
    const entry = manifest.targets[key]!;
    assert.deepEqual(keysOf(entry), FIELDS.entry);
    assert.equal(entry.path, `data/${key}/`, 'path is relative to the site root');
  }
});

for (const key of KEYS) {
  test(`${key}: frames.json has exactly the fields of TargetData and FrameMeta`, () => {
    const data = read<TargetData>(`data/${key}/frames.json`);
    assert.deepEqual(keysOf(data), FIELDS.target);
    assert.deepEqual(keysOf(data.catalogue), FIELDS.catalogue);
    assert.equal(typeof data.monthly, 'boolean');
    assert.equal(data.frames.length, manifest.targets[key]!.frames);
    let offset = -1;
    for (const f of data.frames) {
      assert.deepEqual(keysOf(f), FIELDS.frame, f.id);
      assert.deepEqual(keysOf(f.wcs), FIELDS.wcs, f.id);
      assert.equal(f.wcs.crval.length, 2);
      assert.equal(f.wcs.crpix.length, 2);
      assert.equal(f.wcs.cd.length, 4);
      assert.ok(Number.isInteger(f.det) && f.det >= 1 && f.det <= 6, `${f.id} det`);
      assert.ok(f.offset > offset, `${f.id}: frames are stored in order`);
      offset = f.offset;
    }
    for (const n of data.neighbours ?? []) {
      const keys = keysOf(n).filter((k) => k !== 'target');
      assert.deepEqual(keys, FIELDS.neighbour, n.id);
      assert.ok(n.cat === 'gaia' || n.cat === 'catwise');
    }
  });

  test(`${key}: core/targets.ts carries the catalogue values of frames.json`, () => {
    const { catalogue } = read<TargetData>(`data/${key}/frames.json`);
    const t = TARGETS.find((x) => x.key === key);
    assert.ok(t, `${key} is in TARGETS`);
    assert.equal(t.name, manifest.targets[key]!.label);
    assert.equal(t.ra, catalogue.ra);
    assert.equal(t.dec, catalogue.dec);
    assert.equal(t.ep, catalogue.ep);
    assert.equal(t.pmra, catalogue.pmra);
    assert.equal(t.pmdec, catalogue.pmdec);
    assert.equal(t.plx, catalogue.parallax);
    assert.equal(t.values, catalogue.from);
  });
}
