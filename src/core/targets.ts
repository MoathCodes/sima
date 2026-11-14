/**
 * The five test targets of the challenge (SPEC 1). Owner: lane B. Pure: no page access.
 *
 * The catalogue numbers (ra, dec, ep, pmra, pmdec, plx, values) are copied exactly from the
 * `catalogue` block of each target's public/data/<key>/frames.json, which lane A's prebake.py
 * wrote from the ESA Gaia archive (WISE 0855−0714, too cold for Gaia: Luhman & Esplin 2016 for the
 * motion and parallax; its 2014.0 position is the challenge spec's, source not verified).
 * docs/data-format.md requires the two to stay equal; tests/data-contract.test.ts checks it.
 *
 * Names, lines and the Measure lead come from the spec and its screenshots.
 *
 * `kind` and `period` come from named catalogues, fetched on 14 November 2026 (H4, H9: never
 * from memory), and each target says where in `kindFrom` and `periodFrom`:
 * - Kind: SIMBAD's object type and spectral type (`basic.otype`, `basic.sp_type`), from SIMBAD's
 *   TAP service at its CfA mirror (simbad.cfa.harvard.edu/simbad/sim-tap; the Strasbourg host
 *   answered with an error page that day). The plain words are ours; the class in brackets is
 *   SIMBAD's spectral type as written there.
 * - Period: the AAVSO International Variable Star Index (VSX), VizieR table B/vsx/vsx at CfA.
 *   Only a pulsation period is kept (it drives the Folded tab and turns off the straight trend).
 *   R Draconis is a Mira with 246.12 days. VSX also lists a 2.64-day period for RW Aurigae
 *   (type CTTS/ROT, a rotation period) and 130 days for Barnard's Star (V2500 Oph, type BY, a
 *   starspot period); neither is a pulsation, so both stay null, and `periodFrom` says why.
 */
import type { Target } from './types.ts';

/** The five targets, in the order the Places menu lists them. */
export const TARGETS: readonly Target[] = Object.freeze([
  {
    key: 'barnard',
    name: "Barnard's Star",
    kind: 'Red dwarf (M4V)',
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
    kindFrom: "SIMBAD, fetched 14 Nov 2026: main id “NAME Barnard's star”, type BY* (a BY Draconis variable), spectral type M4V",
    periodFrom: 'No pulsation period: VSX (B/vsx/vsx) lists it as V2500 Oph, type BY, with a 130-day starspot period',
  },
  {
    key: 'eps-indi-b',
    name: 'Epsilon Indi B',
    kind: 'Pair of brown dwarfs (T1V+T6V)',
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
    kindFrom: 'SIMBAD, fetched 14 Nov 2026: main id “* eps Ind B”, type BD* (brown dwarf), spectral type T1V+T6V',
    periodFrom: 'No period: VSX (VizieR B/vsx/vsx) lists no variable star within 1′ of it (searched 14 Nov 2026)',
  },
  {
    key: 'wise-0855',
    name: 'WISE 0855−0714',
    kind: 'Brown dwarf (Y2)',
    line: 'The coldest failed star',
    ra: 133.787082,
    dec: -7.244433,
    ep: 2014.0,
    pmra: -8118,
    pmdec: 680,
    plx: 449,
    period: null,
    values:
      'Luhman & Esplin 2016, AJ 152, 78, Table 4 (https://doi.org/10.3847/0004-6256/152/3/78) for the motion and parallax (too cold for Gaia); the 2014.0 position is the challenge spec’s, source not verified, within 0.1″ of their Spitzer position of 20 Jan 2014 (Luhman & Esplin 2014, ApJ 796, 6)',
    lead: 'stack',
    kindFrom: 'SIMBAD, fetched 14 Nov 2026: main id “WISEA J085510.74-071442.5”, type BD* (brown dwarf), spectral type Y2',
    periodFrom: 'No period: VSX (VizieR B/vsx/vsx) lists no variable star within 1′ of it (searched 14 Nov 2026)',
  },
  {
    key: 'rw-aur',
    name: 'RW Aurigae',
    kind: 'Young T Tauri star (K1/5e+K5e)',
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
    kindFrom: 'SIMBAD, fetched 14 Nov 2026: main id “V* RW Aur”, type TT* (T Tauri star), spectral type K1/5e+K5e',
    periodFrom: 'No pulsation period: VSX (B/vsx/vsx) lists type CTTS/ROT with a 2.64-day rotation period, which does not fold changes sampled months apart',
  },
  {
    key: 'r-dra',
    name: 'R Draconis',
    kind: 'Mira variable giant (M4.5-6+e)',
    line: 'The breathing giant',
    ra: 248.1673783672889,
    dec: 66.75500674547219,
    ep: 2016.0,
    pmra: -20.642811719160797,
    pmdec: 6.148818852711324,
    plx: 1.2509180143740992,
    period: 246.12,
    values: 'Gaia DR3 1648328016354496384 (ESA Gaia archive, gaiadr3.gaia_source)',
    lead: 'brightness',
    kindFrom: 'SIMBAD, fetched 14 Nov 2026: main id “V* R Dra”, type Mi* (Mira variable), spectral type M4.5-6+e',
    periodFrom: 'VSX (AAVSO International Variable Star Index, VizieR B/vsx/vsx), fetched 14 Nov 2026: type M (Mira), period 246.12 days, epoch of maximum JD 2457370',
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
