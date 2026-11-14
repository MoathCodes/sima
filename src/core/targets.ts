/**
 * The five test targets of the challenge (SPEC 1). Owner: lane B. Pure: no page access.
 *
 * The catalogue values here must equal the `catalogue` block of each target's frames.json, which
 * lane A's prebake.py writes from the same sources (docs/data-format.md).
 *
 * PHASE 0 STUB: names, lines and the Measure lead come from the spec. Catalogue numbers are
 * filled only where the spec states them (WISE 0855−0714 in SPEC 7.1, R Draconis's period in
 * docs/data-format.md); everything else is NaN or null until lane B fetches it from SIMBAD,
 * Gaia DR3 and CatWISE2020 (H9: never from memory). The UI must not show a NaN: it says "not
 * known yet".
 */
import type { Target } from './types.ts';

/** The five targets, in the order the Places menu lists them. */
export const TARGETS: readonly Target[] = Object.freeze([
  {
    key: 'barnard',
    name: "Barnard's Star",
    kind: 'Red dwarf (M4 V)',
    line: 'The runaway star',
    ra: Number.NaN,
    dec: Number.NaN,
    ep: 2016.0,
    pmra: Number.NaN,
    pmdec: Number.NaN,
    plx: null,
    period: null,
    values: 'Gaia DR3',
    lead: 'motion',
  },
  {
    key: 'eps-indi-b',
    name: 'Epsilon Indi B',
    kind: '',
    line: 'The twin failed stars',
    ra: Number.NaN,
    dec: Number.NaN,
    ep: 2016.0,
    pmra: Number.NaN,
    pmdec: Number.NaN,
    plx: null,
    period: null,
    values: '',
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
    values: '',
    lead: 'stack',
  },
  {
    key: 'rw-aur',
    name: 'RW Aurigae',
    kind: '',
    line: 'The flickering newborn',
    ra: Number.NaN,
    dec: Number.NaN,
    ep: 2016.0,
    pmra: Number.NaN,
    pmdec: Number.NaN,
    plx: null,
    period: null,
    values: '',
    lead: 'brightness',
  },
  {
    key: 'r-dra',
    name: 'R Draconis',
    kind: '',
    line: 'The breathing giant',
    ra: Number.NaN,
    dec: Number.NaN,
    ep: 2016.0,
    pmra: Number.NaN,
    pmdec: Number.NaN,
    plx: null,
    period: 245.5,
    values: '',
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
