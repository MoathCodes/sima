/**
 * The chips under the search field and what each one lists (SPEC 4.6). Owner: lane G.
 * Pure: the tests check every filter on the real catalogue.
 */
import type { Place, PlaceKind } from '../../data/schema.ts';
import type { IconName } from '../icons.ts';
import { hasCommonName, motionPerYear } from '../objects.ts';

/** A sub-filter inside a list. */
export interface Filter {
  name: string;
  keep(p: Place): boolean;
}

/** A chip that opens a list of one kind of place. */
export interface KindChip {
  id: string;
  name: string;
  icon: IconName;
  /** Kinds whose dots all show at any zoom while the list is open (PLC-2). */
  kinds: readonly PlaceKind[];
  /** Whether a place belongs in the list (a little wider than `kinds` for Nearby). */
  has(p: Place): boolean;
  filters: readonly Filter[];
  /** "1,037 stars on the map": the noun for the count. */
  noun: string;
}

const all: Filter = { name: 'All', keep: () => true };
const kindIs =
  (...kinds: PlaceKind[]) =>
  (p: Place) =>
    kinds.includes(p.kind);
const near = (ly: number) => (p: Place) => (p.distance?.ly ?? Infinity) <= ly;

const STARS: PlaceKind[] = ['star', 'nearby-star', 'fast-star', 'variable-star'];
const NEARBY: PlaceKind[] = ['nearby-star', 'fast-star', 'brown-dwarf'];
const NEBULAE: PlaceKind[] = [
  'emission-nebula',
  'reflection-nebula',
  'dark-nebula',
  'planetary-nebula',
  'supernova-remnant',
];
const GALAXIES: PlaceKind[] = ['spiral-galaxy', 'elliptical-galaxy', 'galaxy'];

export const KIND_CHIPS: readonly KindChip[] = [
  {
    id: 'stars',
    name: 'Stars',
    icon: 'star',
    kinds: STARS,
    has: kindIs(...STARS),
    noun: 'stars',
    filters: [
      all,
      { name: 'Arabic names', keep: (p) => !!p.names.arabic },
      { name: 'With a name', keep: hasCommonName },
    ],
  },
  {
    id: 'nearby',
    name: 'Nearby',
    icon: 'pin',
    kinds: NEARBY,
    has: (p) => NEARBY.includes(p.kind) || (p.distance !== undefined && p.distance.ly <= 30),
    noun: 'nearby stars and brown dwarfs',
    filters: [
      all,
      { name: 'Within 15 light-years', keep: near(15) },
      { name: 'Fast movers', keep: (p) => (motionPerYear(p) ?? 0) >= 1 },
      { name: 'Brown dwarfs', keep: kindIs('brown-dwarf') },
    ],
  },
  {
    id: 'changing',
    name: 'Changing',
    icon: 'chart',
    kinds: ['variable-star'],
    has: kindIs('variable-star'),
    noun: 'changing stars',
    filters: [
      all,
      { name: 'With a name', keep: hasCommonName },
      { name: 'Seen by eye', keep: (p) => p.magnitude?.band === 'V' && p.magnitude.value <= 6 },
    ],
  },
  {
    id: 'clusters',
    name: 'Clusters',
    icon: 'two',
    kinds: ['open-cluster', 'globular-cluster'],
    has: kindIs('open-cluster', 'globular-cluster'),
    noun: 'star clusters',
    filters: [
      all,
      { name: 'Open', keep: kindIs('open-cluster') },
      { name: 'Globular', keep: kindIs('globular-cluster') },
    ],
  },
  {
    id: 'nebulae',
    name: 'Nebulae',
    icon: 'layers',
    kinds: NEBULAE,
    has: kindIs(...NEBULAE),
    noun: 'clouds and shells',
    filters: [
      all,
      { name: 'Glowing gas', keep: kindIs('emission-nebula') },
      { name: 'Reflecting', keep: kindIs('reflection-nebula') },
      { name: 'Dark dust', keep: kindIs('dark-nebula') },
      { name: 'Dying stars', keep: kindIs('planetary-nebula') },
      { name: 'Exploded stars', keep: kindIs('supernova-remnant') },
    ],
  },
  {
    id: 'galaxies',
    name: 'Galaxies',
    icon: 'globe',
    kinds: GALAXIES,
    has: kindIs(...GALAXIES),
    noun: 'galaxies',
    filters: [
      all,
      { name: 'Spiral', keep: kindIs('spiral-galaxy') },
      { name: 'Elliptical', keep: kindIs('elliptical-galaxy') },
      { name: 'Other', keep: kindIs('galaxy') },
    ],
  },
];
