import type { Field, MotionFit, Det } from '../core/types.ts';
import type { Motion } from '../core/motion.ts';
import type { StackResult } from '../core/stack.ts';
import type { DetectorNoise, PretendPlanet, Verdict } from '../core/sandbox.ts';
import { hits } from './track.ts';

/**
 * Discover's missions (v2.0, BEGINNER-AND-MOBILE.md section 6): their ids, steps and the shape of
 * their checks. Owner: lane H. Lane K draws the screens from this; nothing here touches the page.
 *
 * `checkStep` and `currentStep` are pure. The caller supplies action counts and the current
 * trialResult()/sandboxState() reading; Show me only returns an instruction, never progress.
 */

/** A mission (section 6). Also the link's `mission=` value. */
export type MissionId = 'runaway' | 'ghost' | 'planet-x';

/** The missions in the order the list shows them. */
export const MISSION_IDS: readonly MissionId[] = ['runaway', 'ghost', 'planet-x'];

/** True when `s` is a mission id. */
export function isMissionId(s: string | null | undefined): s is MissionId {
  return MISSION_IDS.includes(s as MissionId);
}

/**
 * A step's check result. Four states the visitor sees, plus `waiting` before the visitor acts:
 * - `waiting`: the visitor has not done the action yet;
 * - `checking`: the value the check needs is being made ("Measuring…"), or the value on hand is
 *   for an older key (another patch, detector or setting) and a new one is coming;
 * - `done`: passed;
 * - `unavailable`: cannot be checked here (no measurement), with the reason; offer the finish;
 * - `failed`: the action was checked and missed (a calm note, try again).
 */
export type CheckState = 'waiting' | 'checking' | 'done' | 'unavailable' | 'failed';

/** What a check says. `reason` is a plain sentence for `unavailable` and `failed`, else ''. */
export interface CheckResult {
  state: CheckState;
  reason: string;
}

/**
 * The inputs every check gets. `keyNow` is what is on screen now; `key` is what the value the
 * check reads was made for (for example `trialResult().key`), or null when there is no value yet.
 */
export interface CheckInputs {
  keyNow: string;
  key: string | null;
}

/** A check: a pure function of its inputs (tested in Node). */
export type Check<I extends CheckInputs = CheckInputs> = (inputs: I) => CheckResult;

/**
 * The key rule every check starts with: no value yet → `checking`; a value for an older key →
 * `checking` (it is rejected, never passed). Null when the key matches and the check can go on.
 */
export function keyCheck(inputs: CheckInputs): CheckResult | null {
  if (inputs.key === null || inputs.key !== inputs.keyNow) return { state: 'checking', reason: '' };
  return null;
}

/** Words and a pointing instruction for one step. Showing help never records completion. */
export interface MissionStep {
  id: string;
  title: string;
  line: string;
  hints: readonly string[];
  showMe: { guide: string; label: string };
  done?: string;
}

/** What the list and the success card need. Existing step ids remain storage keys. */
export interface Mission {
  id: MissionId;
  skill: string;
  simulated: boolean;
  steps: readonly string[];
  title?: string;
  target?: string;
  det?: Det;
  band?: string;
  heading?: string;
  lesson?: string;
  instructions?: readonly MissionStep[];
}

const step = (
  id: string,
  title: string,
  line: string,
  hints: readonly string[],
  guide: string,
  label = 'Show me',
  done?: string,
): MissionStep => ({ id, title, line, hints, showMe: { guide, label }, done });

export const MISSIONS: Readonly<Record<MissionId, Mission>> = Object.freeze({
  runaway: {
    id: 'runaway',
    skill: 'Blink',
    simulated: false,
    steps: ['play', 'tap'],
    title: 'The runaway',
    target: 'barnard',
    det: 3,
    band: 'Near infrared · 1.67–1.79 µm',
    heading: 'You caught a runaway star.',
    lesson: 'Flip between dates to catch what moves.',
    instructions: [
      step(
        'play',
        'Press Play.',
        'These pictures were taken months apart.',
        ['Press Play or step through the dates with the arrow keys.'],
        'play',
      ),
      step(
        'tap',
        'One star jumps. Tap it.',
        "Stars stay put. Look for the one that doesn't.",
        ['Look near the middle.', 'Step from the first date to the last with the arrow keys and watch closely.'],
        'picture',
        "It's inside the ring. Tap it.",
      ),
    ],
  },
  ghost: {
    id: 'ghost',
    skill: 'Stack',
    simulated: false,
    steps: ['play', 'stack', 'motion'],
    title: 'The ghost',
    target: 'wise-0855',
    det: 5,
    band: 'Deep infrared · 3.83–4.41 µm',
    heading: 'You made a faint brown dwarf appear.',
    lesson: 'Add pictures up along a path to see faint movers.',
    instructions: [
      step(
        'play',
        'Press Play and look inside the circle.',
        'Where the catalogue says it is.',
        ['Watch one full loop of the pictures.'],
        'play',
        'Show me',
        'It is hard to pick out in a single picture. Adding pictures up can help.',
      ),
      step(
        'stack',
        'Press Stack.',
        'Add pictures up along a trial motion. Both checks stay visible.',
        ['Start with no motion.'],
        'view-stack',
      ),
      step(
        'motion',
        'It moves. Turn and stretch the arrow until the stack beats both checks.',
        'Compare the stack with not shifted and opposite motion.',
        [
          'It moves west: to the right in these pictures (north up, east left), and fast.',
          'Make the arrow long: it moves more than 8″ a year.',
        ],
        'motion-snap',
        'Snap to the catalogue motion',
      ),
    ],
  },
  'planet-x': {
    id: 'planet-x',
    skill: 'What-if',
    simulated: true,
    steps: ['check', 'closer', 'bigger'],
    title: 'Simulated: Planet X',
    target: 'barnard',
    det: 3,
    band: 'Model against measured patch noise',
    heading: 'Simulated: you tested a pretend Planet X.',
    lesson: 'Ask the model what SPHEREx could see.',
    instructions: [
      step(
        'check',
        'Simulated: could SPHEREx see a Neptune-sized planet 500 times farther from the Sun than Earth?',
        'Press Check. Nothing here was observed.',
        ['This is a model compared with measured noise.'],
        'sandbox',
      ),
      step(
        'closer',
        'Simulated: bring it closer until one picture would show it.',
        'Model: change the distance.',
        ['Move the distance slider toward the Sun.'],
        'sandbox-distance',
      ),
      step(
        'bigger',
        'Simulated: or keep it at 500 AU and make it bigger.',
        "Model: change the size, in times Earth's width.",
        ['Set the distance to 500 AU, then increase the size.'],
        'sandbox-radius',
      ),
    ],
  },
});

/** Inputs from the caller's existing viewer readings. No check reads page or saved state.
 * `unavailable` is a terminal loading/worker error, never a pending measurement.
 * Action counts are reset on mission entry; Show me must not increment them.
 * For the ghost, keyNow is patch|ra|dec|n|det|combineBy (viewer/motion.ts).
 * For Planet X, it is patch|ra|dec|n (shell/sandbox.ts).
 * For action checks, key is the patch where the action happened, never the old result key.
 */
export interface MissionInputs extends CheckInputs {
  unavailable?: string;
  acted?: boolean;
  dateChanges?: number;
  loops?: number;
  mode?: string;
  tap?: { x: number; y: number } | null;
  points?: readonly { x: number; y: number }[];
  /** How far a tap still counts, in the tap's units: tapReach (track.ts), as the tour uses. */
  radius?: number;
  trial?: { key: string; motion: Motion; atCatalogue: boolean; result: StackResult } | null;
  sandbox?: {
    planet: PretendPlanet;
    verdict: Verdict;
    patchKey: string;
    noises?: readonly DetectorNoise[];
  } | null;
  fit?: MotionFit | null;
}

const result = (state: CheckState, reason = ''): CheckResult => ({ state, reason });

/** A failed or missing value always has a reason, for Continue without it. */
export function checkStep(id: MissionId, stepId: string, i: MissionInputs): CheckResult {
  const stale = keyCheck(i);
  // An old result can never turn a new patch into a success or an unavailable measurement.
  if (i.key !== null && stale) return stale;
  if (i.unavailable) return result('unavailable', i.unavailable);
  if (stale) return stale;
  if (!MISSIONS[id].steps.includes(stepId))
    return result('failed', 'This step is not part of the mission.');
  if (id === 'runaway') {
    if (stepId === 'play') return result(i.acted && (i.dateChanges ?? 0) >= 3 ? 'done' : 'waiting');
    if (!i.tap) return result('waiting');
    if (!i.points?.length || !(i.radius! > 0))
      return result('unavailable', 'The catalogue track is not available on this picture.');
    return hits(i.points, i.tap, i.radius!)
      ? result('done')
      : result('failed', 'Not that one. That star stays put.');
  }
  if (id === 'ghost') {
    if (stepId === 'play') return result(i.acted && (i.loops ?? 0) >= 1 ? 'done' : 'waiting');
    if (stepId === 'stack') return result(i.mode === 'stack' ? 'done' : 'waiting');
    if (i.mode !== 'stack') return result('waiting');
    if (!i.trial || i.trial.key !== i.keyNow) return result('checking');
    const s = i.trial.result;
    if (s.frames < 2) return result('unavailable', 'Too few pictures to make the stack.');
    // Exactly core/stack.ts's "moves with" rule, including its finite-value requirement.
    const [still, opposite] = s.controls;
    if (![s.along.snr, still.snr, opposite.snr].every(Number.isFinite))
      return result('unavailable', 'The pixels at this place are flagged or missing.');
    return s.along.snr >= 5 && s.along.snr >= still.snr + 2 && s.along.snr >= opposite.snr + 2
      ? result('done')
      : result('failed', 'The stack does not yet beat both checks. Try another motion.');
  }
  if (!i.sandbox || i.sandbox.patchKey !== i.keyNow) return result('checking');
  const { planet, verdict } = i.sandbox;
  if (verdict.kind === 'unknown')
    return result('unavailable', 'This patch has no measured noise to compare with.');
  if (stepId === 'check') return result(i.acted ? 'done' : 'waiting');
  if (stepId === 'closer')
    return result(verdict.kind === 'one' && planet.distance < 500 ? 'done' : 'waiting');
  return result(verdict.kind === 'one' && planet.distance >= 500 ? 'done' : 'waiting');
}

/** The fit is a separate reading: the catalogue tap can pass even if motion was not measured. */
export function checkMotion(i: MissionInputs): CheckResult {
  const stale = keyCheck(i);
  if (i.key !== null && stale) return stale;
  if (i.unavailable) return result('unavailable', i.unavailable);
  if (stale || !i.fit) return result('checking');
  return i.fit.ok
    ? result('done')
    : result('unavailable', i.fit.reason ?? 'Motion could not be measured.');
}

/** Lane K: first unrecorded step, its check, hints and Show me instruction. Null means finished.
 * Pass progress().steps[id]. Render help only; call stepDone explicitly after done or the
 * visitor's Continue without it. Neither this function nor showing help records progress.
 */
export function currentStep(
  id: MissionId,
  recorded: Readonly<Record<string, 'done' | 'unavailable'>>,
  inputs: MissionInputs,
) {
  const instruction = MISSIONS[id].instructions!.find((s) => !Object.hasOwn(recorded, s.id));
  return instruction
    ? {
        ...instruction,
        check: checkStep(id, instruction.id, inputs),
        continueLabel: 'Continue without it',
      }
    : null;
}

/** Ungraded objects. Fill descriptions from catalogue fields and count the pictures shown. */
export const OBJECTS = [
  {
    target: 'rw-aur',
    title: 'RW Aurigae',
    det: 3 as Det,
    skill: 'Try Blink',
    tab: 'brightness',
    look: 'Play the pictures. Does its light change from date to date? Expert shows what Sima measured.',
  },
  {
    target: 'r-dra',
    title: 'R Draconis',
    det: 6 as Det,
    tab: 'brightness',
    look: 'Step from the first date to the last. Expert shows its measured brightness over time.',
  },
  {
    target: 'eps-indi-b',
    title: 'Epsilon Indi B',
    det: 3 as Det,
    tab: 'spectrum',
    look: "Try Two dates: it moves, like Barnard's Star. Expert shows its colours.",
  },
] as const;

export function objectLine(key: string, field: Field, plainType: string | null): string {
  const type = plainType || 'Type not available from the catalogue';
  const n = field.frames.length;
  if (key === 'eps-indi-b') return `${type}, next to the star Epsilon Indi A.`;
  if (key === 'r-dra') {
    const dates = field.frames.map((f) => f.mjd).filter(Number.isFinite);
    if (!dates.length) return `${type}. No dated pictures available.`;
    const months = Math.round((Math.max(...dates) - Math.min(...dates)) / (365.25 / 12));
    return `${type}. ${n} pictures over ${months} months.`;
  }
  return `${type}. ${n} real pictures.`;
}
