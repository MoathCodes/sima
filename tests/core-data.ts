// Loads the shipped real exposures for the core tests (lane B). Not a test file itself.
import { readFileSync } from 'node:fs';
import { buildRealField, decodeFrames } from '../src/core/real.ts';
import { targetByKey } from '../src/core/targets.ts';
import type { Field, RealSet, Target, TargetData } from '../src/core/types.ts';

const sets = new Map<string, Promise<RealSet>>();
const fields = new Map<string, Promise<Field>>();

/** The decoded patch of one shipped target (cached per test file). */
export function loadSet(key: string): Promise<RealSet> {
  let p = sets.get(key);
  if (!p) {
    const dir = new URL(`../public/data/${key}/`, import.meta.url);
    const data = JSON.parse(readFileSync(new URL('frames.json', dir), 'utf8')) as TargetData;
    const bytes = new Uint8Array(readFileSync(new URL('frames.bin.gz', dir)));
    p = decodeFrames(data, bytes, { key, origin: 'shipped' });
    sets.set(key, p);
  }
  return p;
}

/** The target, which every shipped key has. */
export function target(key: string): Target {
  const t = targetByKey(key);
  if (!t) throw new Error(`No target ${key}`);
  return t;
}

/** The patch on the viewer's grid, centred on the catalogue position at its field size. */
export function loadField(key: string): Promise<Field> {
  let p = fields.get(key);
  if (!p) {
    p = loadSet(key).then((set) => {
      const t = target(key);
      return buildRealField(set, { ra: t.ra, dec: t.dec, fov: set.data.fov, target: t });
    });
    fields.set(key, p);
  }
  return p;
}
