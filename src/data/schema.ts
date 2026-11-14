/** Data facts are optional. Never replace an absent fact with a guessed value. */
export type PlaceKind =
  | 'star' | 'nearby-star' | 'fast-star' | 'brown-dwarf' | 'variable-star'
  | 'open-cluster' | 'globular-cluster' | 'emission-nebula'
  | 'reflection-nebula' | 'dark-nebula' | 'planetary-nebula'
  | 'supernova-remnant' | 'spiral-galaxy' | 'elliptical-galaxy' | 'galaxy';

export interface PlaceSource { name: string; url: string }
export interface Place {
  /** Stable SIMBAD object key, except the five shared challenge target keys. */
  id: string;
  simbad: string;
  names: {
    common?: string;
    arabic?: string;
    transliteration?: string;
    meaning?: string;
    catalogue: string[];
  };
  kind: PlaceKind;
  /** Degrees, ICRS at J2000. Do not treat as a position at an exposure's epoch. */
  ra: number;
  dec: number;
  /** Editorial dot visibility: 0 is widest; 4 is closest. */
  tier: 0 | 1 | 2 | 3 | 4;
  magnitude?: { value: number; band: 'V' | 'K' };
  size?: { major: number; minor?: number; unit: 'arcmin' };
  /** OpenNGC Hubble code, retained even when the kind is the general 'galaxy'. */
  morphology?: string;
  distance?: {
    /** Median, minimum and maximum of the listed measurements, all light-years. */
    ly: number;
    low: number;
    high: number;
    /** (high - low) / median > 0.30. The range is not a confidence interval. */
    disagree: boolean;
    measurements: number;
  };
  /** SIMBAD proper motion, mas/year; ra includes cos(dec). */
  properMotion?: { ra: number; dec: number };
  text?: string;
  inSpherex?: string;
  /** Per-fact indices into PlacesCatalogue.sources, each containing name + URL.
   * 'names' covers common/catalogue; Arabic, meaning and transliteration have
   * their own keys. 'position' covers ra and dec. Tier is editorial.
   */
  sources: Partial<Record<
    'names' | 'arabic' | 'transliteration' | 'meaning' | 'kind' | 'position'
    | 'magnitude' | 'size' | 'morphology' | 'distance' | 'properMotion'
    | 'text' | 'inSpherex', number[]>>;
}
export interface PlacesCatalogue {
  version: 1;
  frame: 'ICRS/J2000';
  kinds: Record<PlaceKind, string>;
  sources: PlaceSource[];
  places: Place[];
}
