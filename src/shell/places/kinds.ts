/**
 * The chips under the search field and what each one lists (SPEC 4.6). Owner: lane G.
 * Pure: the tests check every filter on the real catalogue.
 */
import type { Place, PlaceKind } from '../../data/schema.ts';
import type { IconName } from '../icons.ts';
import { hasCommonName, motionPerYear } from '../objects.ts';
import { t } from '../i18n.ts';

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

const all: Filter = { name: t('kd.all'), keep: () => true };
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
    name: t('kd.stars'),
    icon: 'star',
    kinds: STARS,
    has: kindIs(...STARS),
    noun: t('kd.starsN'),
    filters: [
      all,
      { name: t('kd.arabic'), keep: (p) => !!p.names.arabic },
      { name: t('kd.named'), keep: hasCommonName },
    ],
  },
  {
    id: 'nearby',
    name: t('kd.nearby'),
    icon: 'pin',
    kinds: NEARBY,
    has: (p) => NEARBY.includes(p.kind) || (p.distance !== undefined && p.distance.ly <= 30),
    noun: t('kd.nearbyN'),
    filters: [
      all,
      { name: t('kd.within15'), keep: near(15) },
      { name: t('kd.fast'), keep: (p) => (motionPerYear(p) ?? 0) >= 1 },
      { name: t('kd.bd'), keep: kindIs('brown-dwarf') },
    ],
  },
  {
    id: 'changing',
    name: t('kd.changing'),
    icon: 'chart',
    kinds: ['variable-star'],
    has: kindIs('variable-star'),
    noun: t('kd.changingN'),
    filters: [
      all,
      { name: t('kd.named'), keep: hasCommonName },
      { name: t('kd.eye'), keep: (p) => p.magnitude?.band === 'V' && p.magnitude.value <= 6 },
    ],
  },
  {
    id: 'clusters',
    name: t('kd.clusters'),
    icon: 'two',
    kinds: ['open-cluster', 'globular-cluster'],
    has: kindIs('open-cluster', 'globular-cluster'),
    noun: t('kd.clustersN'),
    filters: [
      all,
      { name: t('kd.open'), keep: kindIs('open-cluster') },
      { name: t('kd.globular'), keep: kindIs('globular-cluster') },
    ],
  },
  {
    id: 'nebulae',
    name: t('kd.nebulae'),
    icon: 'layers',
    kinds: NEBULAE,
    has: kindIs(...NEBULAE),
    noun: t('kd.nebulaeN'),
    filters: [
      all,
      { name: t('kd.glow'), keep: kindIs('emission-nebula') },
      { name: t('kd.reflect'), keep: kindIs('reflection-nebula') },
      { name: t('kd.dark'), keep: kindIs('dark-nebula') },
      { name: t('kd.dying'), keep: kindIs('planetary-nebula') },
      { name: t('kd.exploded'), keep: kindIs('supernova-remnant') },
    ],
  },
  {
    id: 'galaxies',
    name: t('kd.galaxies'),
    icon: 'globe',
    kinds: GALAXIES,
    has: kindIs(...GALAXIES),
    noun: t('kd.galaxiesN'),
    filters: [
      all,
      { name: t('kd.spiral'), keep: kindIs('spiral-galaxy') },
      { name: t('kd.elliptical'), keep: kindIs('elliptical-galaxy') },
      { name: t('kd.other'), keep: kindIs('galaxy') },
    ],
  },
];
