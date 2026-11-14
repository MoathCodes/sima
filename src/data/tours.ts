/**
 * The seven tours (PLC-6): themed trips of stops across the sky. Owner: lane G.
 *
 * A stop names a place by its catalogue id (src/data/places.json) and the facts its note uses.
 * The note's words are built from the catalogue at run time (shell/objects.ts `stopNote`), so
 * every fact in it has a named source (H9). `look` is an instruction for the frame, never a fact.
 * The tests check that every stop is found and says at least one fact.
 */

/** A fact a stop's note can use. `fastest` and `nearest` are ranks within this catalogue. */
export type Say =
  | 'kind'
  | 'distance'
  | 'motion'
  | 'arabic'
  | 'size'
  | 'brightness'
  | 'text'
  | 'fastest'
  | 'nearest';

export interface TourStop {
  /** Place id in places.json. */
  place: string;
  /** The facts its note says, in order; a fact the catalogue lacks is left out. */
  say: Say[];
  /** What to do in the frame at this stop. An instruction, not a fact. */
  look?: string;
}

export interface Tour {
  id: string;
  title: string;
  /** One line under the title. A theme, not a fact about any place. */
  line: string;
  stops: TourStop[];
}

const JUMP = 'Look with the frame and play the dates: watch for the jump.';
const SLIDE = 'Look with the frame and slide the wavelength.';
const PLAY = 'Look with the frame and play the dates.';

export const TOURS: readonly Tour[] = [
  {
    id: 'movers',
    title: 'How moving things are found',
    line: 'Planet X would be faint and would move. These stars move fast enough to catch between dates.',
    stops: [
      { place: 'barnard', say: ['fastest', 'motion', 'distance'], look: JUMP },
      { place: 'simbad-2966222', say: ['motion', 'distance'], look: JUMP },
      { place: 'wise-0855', say: ['kind', 'motion'], look: JUMP },
      { place: 'simbad-1191721', say: ['motion', 'distance'], look: JUMP },
      { place: 'simbad-837', say: ['motion', 'distance'], look: JUMP },
      { place: 'eps-indi-b', say: ['kind', 'motion', 'distance'], look: JUMP },
      { place: 'simbad-3379714', say: ['motion', 'distance'], look: JUMP },
      { place: 'simbad-1769389', say: ['motion', 'distance'], look: JUMP },
      { place: 'simbad-8399845', say: ['motion', 'arabic'], look: JUMP },
    ],
  },
  {
    id: 'neighbours',
    title: 'Our nearest neighbours',
    line: 'The stars and brown dwarfs closest to the Sun, by the distances SIMBAD lists.',
    stops: [
      { place: 'simbad-3379714', say: ['nearest', 'distance', 'kind'] },
      { place: 'barnard', say: ['distance', 'motion'] },
      { place: 'simbad-1769389', say: ['distance', 'brightness'] },
      { place: 'simbad-1764001', say: ['distance', 'brightness'] },
      { place: 'simbad-2523169', say: ['distance', 'brightness'] },
      { place: 'simbad-643684', say: ['distance', 'kind'] },
      { place: 'simbad-1191721', say: ['distance', 'motion'] },
      { place: 'simbad-837', say: ['distance', 'motion'] },
      { place: 'eps-indi-b', say: ['distance', 'kind'] },
      { place: 'simbad-2966222', say: ['distance', 'motion'] },
    ],
  },
  {
    id: 'arabic',
    title: 'Arabic names in the sky',
    line: 'Bright stars with Arabic names: each stop gives the name, how it is said and what it means.',
    stops: [
      { place: 'simbad-719377', say: ['arabic', 'brightness'] },
      { place: 'simbad-265823', say: ['arabic', 'distance'] },
      { place: 'simbad-2708379', say: ['arabic', 'brightness'] },
      { place: 'simbad-2900336', say: ['arabic', 'brightness'] },
      { place: 'simbad-92338', say: ['arabic', 'brightness'] },
      { place: 'simbad-1235748', say: ['arabic', 'brightness'] },
      { place: 'simbad-771345', say: ['arabic', 'brightness'] },
      { place: 'simbad-843879', say: ['arabic', 'brightness'] },
      { place: 'simbad-51431', say: ['arabic', 'brightness'] },
      { place: 'simbad-2997002', say: ['arabic', 'brightness'] },
    ],
  },
  {
    id: 'born',
    title: 'Where stars are born',
    line: 'Clouds of gas and dust. At each stop, slide the wavelength and compare.',
    stops: [
      { place: 'simbad-810146', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-3204806', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-890791', say: ['kind', 'size'], look: SLIDE },
      { place: 'simbad-59950', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-127449', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-825922', say: ['kind', 'size'], look: SLIDE },
      { place: 'simbad-750205', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-828287', say: ['kind'], look: SLIDE },
      { place: 'simbad-2512349', say: ['kind'], look: SLIDE },
    ],
  },
  {
    id: 'die',
    title: 'How stars die',
    line: 'Shells shed by dying stars, and the remains of stars that exploded.',
    stops: [
      { place: 'simbad-2868878', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-2808552', say: ['kind', 'text', 'distance'], look: SLIDE },
      { place: 'simbad-1283906', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-11673229', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-552802', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-795871', say: ['kind', 'text', 'distance'], look: SLIDE },
      { place: 'simbad-2908143', say: ['kind', 'size'], look: SLIDE },
      { place: 'simbad-870083', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-3117197', say: ['kind'], look: SLIDE },
    ],
  },
  {
    id: 'galaxies',
    title: 'Beyond our galaxy',
    line: 'Other galaxies, from the closest to tens of millions of light-years away.',
    stops: [
      { place: 'simbad-3133169', say: ['kind', 'distance'], look: SLIDE },
      { place: 'simbad-3253618', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-1575544', say: ['text', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-1522778', say: ['text', 'distance'], look: SLIDE },
      { place: 'simbad-434630', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-433918', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-3392496', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-2049151', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-529086', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-587337', say: ['kind', 'distance', 'size'], look: SLIDE },
      { place: 'simbad-1971559', say: ['text', 'distance'], look: SLIDE },
      { place: 'simbad-1937204', say: ['kind', 'distance', 'size'], look: SLIDE },
    ],
  },
  {
    id: 'changing',
    title: 'Stars that change',
    line: 'Stars SIMBAD classes as changing in brightness. Play the dates and compare.',
    stops: [
      { place: 'r-dra', say: ['kind', 'distance'], look: PLAY },
      { place: 'rw-aur', say: ['kind', 'brightness'], look: PLAY },
      { place: 'simbad-1359450', say: ['kind', 'brightness'], look: PLAY },
      { place: 'simbad-122671', say: ['kind', 'distance'], look: PLAY },
      { place: 'simbad-317713', say: ['kind', 'brightness'], look: PLAY },
      { place: 'simbad-643684', say: ['kind', 'distance'], look: PLAY },
      { place: 'simbad-180100', say: ['kind', 'arabic'], look: PLAY },
      { place: 'simbad-1428414', say: ['kind', 'arabic'], look: PLAY },
      { place: 'simbad-2347504', say: ['kind', 'arabic'], look: PLAY },
      { place: 'simbad-2482758', say: ['kind', 'distance'], look: PLAY },
    ],
  },
];
