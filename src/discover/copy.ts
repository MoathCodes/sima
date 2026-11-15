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

/**
 * What Discover adds to lane H's mission words (src/explore/missions.ts: titles, step sentences,
 * hints, Show me, headings, lessons and the objects are lane H's): the list's name, line and
 * minutes, the object line for Planet X, and a short label per step for the done and next rows.
 */
export interface MissionCopy {
  /** The list's name (Planet X's card title says "Simulated:" first; the list uses a pill). */
  name: string;
  line: string;
  minutes: number;
  object?: string;
  labels: Readonly<Record<string, string>>;
}

export const MISSION_COPY: Readonly<Record<MissionId, MissionCopy>> = {
  runaway: {
    name: 'The runaway',
    line: "Catch Barnard's Star moving",
    minutes: 1,
    labels: { play: 'Press Play', tap: 'Tap the star that jumps' },
  },
  ghost: {
    name: 'The ghost',
    line: 'Add the pictures up to make it appear',
    minutes: 3,
    labels: { play: 'Press Play and look inside the circle', stack: 'Press Stack', motion: 'Turn and stretch the arrow' },
  },
  'planet-x': {
    name: 'Planet X',
    line: 'A pretend planet',
    minutes: 2,
    object: "A pretend planet, against the measured noise of Barnard's Star's pictures",
    labels: { check: 'Could SPHEREx see it at 500 AU?', closer: 'Bring it closer', bigger: 'Or make it bigger at 500 AU' },
  },
};

export const WELCOME = {
  heading: 'This is the real infrared sky.',
  body: "NASA's SPHEREx photographs the whole sky again and again. Compare the dates and catch stars that move.",
  start: 'Start your first mission',
  startLine: 'One star jumps · 1 min',
  look: 'Look around first',
};

export const MEASURING = 'Measuring…';
export const LEAVE_ASK = 'Leave the mission? Your step is kept.';
export const KEYS = 'Tab into the picture: the arrow keys move a crosshair, Enter answers. H: a hint.';

/** SIMBAD's type, in plain words, from the shipped `kind` field ("Red dwarf (M4V)"). */
export function plainKind(kind: string): string {
  return kind.replace(/\s*\([^)]*\)\s*$/, '');
}
