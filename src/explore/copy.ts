/**
 * The words of the starters and the task line in the frame. Owner: lane H.
 *
 * Every string here is used (O-W5): tests/guide.test.ts checks that each export is imported
 * somewhere in src/. Words follow SPEC 4.1, 4.2 and the reference screenshots. Nothing here
 * claims a discovery (H7), and practice words say "Simulated" first (H3).
 */

/** What a task asks for, by the kind of change its target shows. */
export type TaskKind = 'mover' | 'spectrum' | 'variable' | 'faint';

/** The task for one target or practice patch. */
export interface TaskCopy {
  /** Short name, as on the starter ("Runaway star"). */
  title: string;
  /** What to do, in one or two short sentences. The last one is the action. */
  line: string;
  kind: TaskKind;
  /** Hint, then Another hint: each gives a little more (GDE-5). Look closer and Show me draw. */
  hints: [string, string];
}

/** Tasks for the five test targets and the two practice patches, by key. */
export const TASKS: Readonly<Record<string, TaskCopy>> = {
  barnard: {
    title: 'Runaway star',
    line: 'One dot jumps. Tap it.',
    kind: 'mover',
    hints: [
      'Watch the middle while the pictures play. Most dots stay put; one is in a different place on each date.',
      'Press Difference. A star that moved shows as a white dot beside a dark one.',
    ],
  },
  'eps-indi-b': {
    title: 'What is it made of?',
    line: 'A faint pair of failed stars creeps across this patch. Tap it to see its colours.',
    kind: 'spectrum',
    hints: [
      'It is near the middle, and moves only about one pixel between the first and last date.',
      'Press Two dates. Something that moved shows red on one side and cyan on the other.',
    ],
  },
  'wise-0855': {
    title: 'Too faint to see',
    line: 'Nothing in any single picture. Add them along its path: press Measure, then Stack.',
    kind: 'faint',
    hints: [
      'One picture is too short to show it. Adding many pictures makes faint things build up while the noise evens out.',
      'Stack is one of the six views in Measure.',
    ],
  },
  'rw-aur': {
    title: 'The flickering newborn',
    line: 'One star brightens and fades between dates. Tap it.',
    kind: 'variable',
    hints: [
      'Watch the brightest dots while the pictures play. One grows and shrinks; the others stay the same.',
      'Press Two dates. A star that changed brightness looks red or cyan instead of white.',
    ],
  },
  'r-dra': {
    title: 'The breathing giant',
    line: 'One star brightens and fades from month to month. Tap it.',
    kind: 'variable',
    hints: [
      'Watch the brightest dot while the pictures play. It grows and shrinks; the others stay the same.',
      'Its change is largest at long wavelengths: drag the wavelength handle to the right.',
    ],
  },
  'warm-up': {
    title: 'Warm-up',
    line: 'Made-up pictures for practice. One dot jumps. Tap it.',
    kind: 'mover',
    hints: [
      'Watch while the pictures play. Most dots stay put; one jumps.',
      'Press Difference. The dot that moved shows as a white dot beside a dark one.',
    ],
  },
  'planet-x': {
    title: 'The hidden planet',
    line: 'A made-up faint, cold planet jumps between dates. Tap it.',
    kind: 'mover',
    hints: [
      'It is cold, so it shines most at long wavelengths: drag the wavelength handle to the right end.',
      'Press Difference. It shows as a faint white dot beside a dark one.',
    ],
  },
};

/** The line for a spot fetched live: no task, only what is true of it. */
export const LIVE_LINE =
  'Real pictures of this spot, fetched just now. Play them and look for anything that moves or changes.';

/** The four steps of help, in order (GDE-5). */
export const HINT_LABELS = ['Hint', 'Another hint', 'Look closer', 'Show me'] as const;

/** What Look closer and Show me say while they draw on the picture. */
export const LOOK_CLOSER = 'It is inside the dashed circle.';
export const LOOK_CLOSER_FAINT = 'Stack is under Measure. It is ringed.';
export const SHOW_ME = 'It is ringed. Now tap it yourself.';
export const SHOW_ME_FAINT = 'The ring is where the catalogue says it is. Now press Measure, then Stack.';

/** A tap that missed. */
export const MISSED = 'Not that one: that dot stays put. Try again, or ask for a hint.';
/** A tap while the found star is shown. */
export const MEASURING = 'Measuring it from the pixels…';
