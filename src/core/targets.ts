/**
 * The five test targets of the challenge (SPEC 1). Owner: lane B. Pure: no page access.
 *
 * The catalogue numbers (ra, dec, ep, pmra, pmdec, plx, values) are copied exactly from the
 * `catalogue` block of each target's public/data/<key>/frames.json, which lane A's prebake.py
 * wrote from the ESA Gaia archive (WISE 0855−0714: SPEC 7.1 rule 6, checked against CatWISE2020).
 * docs/data-format.md requires the two to stay equal; tests/data-contract.test.ts checks it.
 *
 * PHASE 0 STUB: names, lines and the Measure lead come from the spec and its screenshots. `kind`
 * is filled only where a screenshot shows it, and `period` is null everywhere until lane B fetches
 * R Draconis's period from a named catalogue (H9: never from memory). The UI must not show an
 * empty kind: it leaves the line out.
 */
import type { Target } from './types.ts';

/** The five targets, in the order the Places menu lists them. */
export const TARGETS: readonly Target[] = Object.freeze([
  {
    key: 'barnard',
    name: "Barnard's Star",
    kind: 'Red dwarf (M4 V)',
    line: 'The runaway star',
    ra: 269.44850252543836,
    dec: 4.739420051112412,
    ep: 2016.0,
    pmra: -801.5509783684709,
    pmdec: 10362.394206546573,
    plx: 546.975939730948,
    period: null,
    values: 'Gaia DR3 4472832130942575872 (ESA Gaia archive, gaiadr3.gaia_source)',
    lead: 'motion',
  },
  {
    key: 'eps-indi-b',
    name: 'Epsilon Indi B',
    kind: '',
    line: 'The twin failed stars',
    ra: 331.07645259656397,
    dec: -56.79381206688221,
    ep: 2016.0,
    pmra: 3981.97666296105,
    pmdec: -2466.8318147663504,
    plx: 270.6580324694526,
    period: null,
    values: 'Gaia DR3 6412596012146801152 (ESA Gaia archive, gaiadr3.gaia_source)',
    lead: 'spectrum',
  },
  {
    key: 'wise-0855',
    name: 'WISE 0855−0714',
    kind: '',
    line: 'The coldest failed star',
    ra: 133.787082,
    dec: -7.244433,
    ep: 2014.0,
    pmra: -8118,
    pmdec: 680,
    plx: 449,
    period: null,
    values:
      'SPEC 7.1 rule 6 (too cold for Gaia); checked against CatWISE2020, which lists it three times near this track',
    lead: 'stack',
  },
  {
    key: 'rw-aur',
    name: 'RW Aurigae',
    kind: '',
    line: 'The flickering newborn',
    ra: 76.95608119552952,
    dec: 30.401204589097233,
    ep: 2016.0,
    pmra: 2.6406431770317083,
    pmdec: -27.397582540455325,
    plx: 6.406249329219477,
    period: null,
    values: 'Gaia DR3 156430822114424576 (ESA Gaia archive, gaiadr3.gaia_source)',
    lead: 'brightness',
  },
  {
    key: 'r-dra',
    name: 'R Draconis',
    kind: '',
    line: 'The breathing giant',
    ra: 248.1673783672889,
    dec: 66.75500674547219,
    ep: 2016.0,
    pmra: -20.642811719160797,
    pmdec: 6.148818852711324,
    plx: 1.2509180143740992,
    period: null,
    values: 'Gaia DR3 1648328016354496384 (ESA Gaia archive, gaiadr3.gaia_source)',
    lead: 'brightness',
  },
]);

/**
 * One target by its key.
 *
 * @param key `barnard`, `eps-indi-b`, `wise-0855`, `rw-aur` or `r-dra`.
 * @returns The target, or null for any other key.
 */
export function targetByKey(key: string): Target | null {
  return TARGETS.find((t) => t.key === key) ?? null;
}
