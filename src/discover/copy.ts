/**
 * Discover's words (BEGINNER-AND-MOBILE.md sections 5, 6 and 8). Owner: lane K.
 *
 * Voice: plain, warm, exact. No sentence claims a discovery (H7): known objects are "caught",
 * "found" or "made appear"; Planet X is "tested" and "pretend", and says "Simulated" first (H3).
 * Result sentences are templates filled from measured values (src/discover/success.ts); a missing
 * value prints "Not measured" and why (H5). Mission data and checks are lane H's
 * (src/explore/missions.ts); these are only the words the screens show.
 */
import type { MissionId } from '../explore/missions.ts';

/** What a mission says on the list, its card and its success card. */
export interface MissionCopy {
  title: string;
  /** One line on the list. */
  line: string;
  minutes: number;
  /** The object line on the mission card, without its source. */
  object: string;
  /** The target the mission opens (core/targets.ts). */
  target: string;
  /** The detector it opens on, and the field size (arcminutes). */
  det: 3 | 5;
  /** Per step id: the step's sentence and its "how" line. */
  steps: Readonly<Record<string, { say: string; how: string; label: string; done?: string }>>;
  /** The two written hints (Hint, Another hint), then Look closer and Show me. */
  hints: readonly [string, string];
  /** Success heading. */
  win: string;
  /** What the learned skill does. */
  skillLine: string;
}

export const MISSION_COPY: Readonly<Record<MissionId, MissionCopy>> = {
  runaway: {
    title: 'The runaway',
    line: "Catch Barnard's Star moving",
    minutes: 1,
    object: "Barnard's Star",
    target: 'barnard',
    det: 3,
    steps: {
      play: { say: 'Press Play.', how: 'These pictures were taken months apart.', label: 'Press Play' },
      tap: { say: 'One star jumps. Tap it.', how: "Stars stay put. Look for the one that doesn't.", label: 'Tap the star that jumps' },
    },
    hints: ['Look near the middle.', 'Step from A to C with the arrow keys and watch closely.'],
    win: 'You caught a runaway star.',
    skillLine: 'Flip between dates to catch what moves.',
  },
  ghost: {
    title: 'The ghost',
    line: 'Add the pictures up to make it appear',
    minutes: 3,
    object: 'WISE 0855−0714',
    target: 'wise-0855',
    det: 5,
    steps: {
      play: {
        say: 'Press Play and look inside the circle.',
        how: 'The dashed circle is where the catalogue says it is.',
        label: 'Press Play and look inside the circle',
        done: 'It is hard to pick out in a single picture. Adding pictures up can help.',
      },
      stack: { say: 'Press Stack.', how: 'Stack adds all the pictures into one.', label: 'Press Stack' },
      motion: {
        say: 'It moves. Turn and stretch the arrow until the stack beats both checks.',
        how: 'The arrow starts at no motion. Two checks sit beside the stack: not shifted, and the opposite motion.',
        label: 'Turn and stretch the arrow',
      },
    },
    hints: [
      'It moves west: to the right in these pictures (north up, east left), and fast.',
      'Make the arrow long: it moves more than 8″ a year.',
    ],
    win: 'You made a faint brown dwarf appear.',
    skillLine: 'Add pictures up along a path to see faint movers.',
  },
  'planet-x': {
    title: 'Planet X',
    line: 'A pretend planet',
    minutes: 2,
    object: "A pretend planet, against the measured noise of Barnard's Star's pictures",
    target: 'barnard',
    det: 3,
    steps: {
      check: {
        say: 'Simulated: could SPHEREx see a Neptune-sized planet 500 times farther from the Sun than Earth?',
        how: "The sandbox card works it out from this patch's measured noise.",
        label: 'Could SPHEREx see it at 500 AU?',
      },
      closer: {
        say: 'Bring it closer until one picture would show it.',
        how: 'Change the distance on the sandbox card.',
        label: 'Bring it closer',
      },
      bigger: {
        say: 'Or keep it at 500 AU and make it bigger.',
        how: 'Change the size on the sandbox card.',
        label: 'Or make it bigger at 500 AU',
      },
    },
    hints: [
      'Closer planets look brighter: make the distance smaller.',
      'Watch the verdict on the sandbox card. "One picture" means it would show without stacking.',
    ],
    win: 'Simulated: you tested a pretend Planet X.',
    skillLine: 'Ask the model what SPHEREx could see.',
  },
};

/** "Try another object" (5.5). The first part of each line comes from SIMBAD at runtime (H9). */
export interface ObjectCopy {
  key: string;
  name: string;
  look: string;
  /** Which tab of Measure fits it in Expert. */
  tab: 'brightness' | 'path' | 'spectrum';
}

export const OBJECTS: readonly ObjectCopy[] = [
  {
    key: 'r-dra',
    name: 'R Draconis',
    look: 'Step from the first date to the last. Expert shows its measured brightness over time.',
    tab: 'brightness',
  },
  {
    key: 'eps-indi-b',
    name: 'Epsilon Indi B',
    look: "Try Two dates: it moves, like Barnard's Star. Expert shows its colours.",
    tab: 'spectrum',
  },
  {
    key: 'rw-aur',
    name: 'RW Aurigae',
    look: 'Play the pictures. Does its light change from date to date? Expert shows what Sima measured.',
    tab: 'brightness',
  },
];

export const WELCOME = {
  heading: 'This is the real infrared sky.',
  body: "NASA's SPHEREx telescope photographs the whole sky again and again. Put its pictures side by side and you can catch stars that move.",
  start: 'Start your first mission',
  startLine: 'One star jumps · about 1 minute',
  look: 'Look around first',
  expert: 'Show me every number',
  fine: 'Pictures here are real and say where they came from. Anything made up says “Simulated” first. Your progress stays in this browser.',
};

export const MISS = "Not that one. That star stays put.";
export const SHOWN = "It's inside the ring. Tap it.";
export const MEASURING = 'Measuring…';
export const LEAVE_ASK = 'Leave the mission? Your step is kept.';
export const KEYS = 'Tab into the picture: the arrow keys move a crosshair, Enter answers. H: a hint.';

export const COACH = {
  title: "You're in Expert view",
  body: 'Every number, picture tool, frame and workspace. Same star, date and wavelength as before.',
  kept: 'Your missions are kept.',
  back: 'Switch back to Discover here.',
};

/** A detector in words, with its number for the small type (section 8: "colour band"). */
export function bandWords(det: number): string {
  if (det <= 3) return 'near infrared';
  if (det === 4) return 'infrared';
  return 'deep infrared';
}

/** SIMBAD's type, in plain words, from the shipped `kind` field ("Red dwarf (M4V)"). */
export function plainKind(kind: string): string {
  return kind.replace(/\s*\([^)]*\)\s*$/, '');
}
