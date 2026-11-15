import type { Field, MotionFit, Det } from '../core/types.ts';
import type { Motion } from '../core/motion.ts';
import type { StackResult } from '../core/stack.ts';
import type { DetectorNoise, PretendPlanet, Verdict } from '../core/sandbox.ts';
import { hits } from './track.ts';
import { t } from '../shell/i18n.ts';

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
  label = t('ms.showMe'),
  done?: string,
): MissionStep => ({ id, title, line, hints, showMe: { guide, label }, done });

export const MISSIONS: Readonly<Record<MissionId, Mission>> = Object.freeze({
  runaway: {
    id: 'runaway',
    skill: t('skill.blink'),
    simulated: false,
    steps: ['play', 'tap'],
    title: t('mission.runaway'),
    target: 'barnard',
    det: 3,
    band: `${t('bar.lamNear')} · 1.67–1.79 µm`,
    heading: t('mis.r.heading'),
    lesson: t('mis.r.lesson'),
    instructions: [
      step(
        'play',
        t('mis.r.play'),
        t('mis.r.playLine'),
        [t('mis.r.playHint')],
        'play',
      ),
      step(
        'tap',
        t('mis.r.tap'),
        t('mis.r.tapLine'),
        [t('mis.r.tapHint1'), t('mis.r.tapHint2')],
        'picture',
        t('mis.r.tapShow'),
      ),
    ],
  },
  ghost: {
    id: 'ghost',
    skill: t('skill.stack'),
    simulated: false,
    steps: ['play', 'stack', 'motion'],
    title: t('mission.ghost'),
    target: 'wise-0855',
    det: 5,
    band: `${t('mis.deep')} · 3.83–4.41 µm`,
    heading: t('mis.g.heading'),
    lesson: t('mis.g.lesson'),
    instructions: [
      step(
        'play',
        t('mis.g.play'),
        t('mis.g.playLine'),
        [t('mis.g.playHint')],
        'play',
        t('ms.showMe'),
        t('mis.g.playDone'),
      ),
      step(
        'stack',
        t('mis.g.stack'),
        t('mis.g.stackLine'),
        [t('mis.g.stackHint')],
        'view-stack',
      ),
      step(
        'motion',
        t('mis.g.motion'),
        t('mis.g.motionLine'),
        [t('mis.g.motionHint1'), t('mis.g.motionHint2')],
        'motion-snap',
        t('mis.g.snap'),
      ),
    ],
  },
  'planet-x': {
    id: 'planet-x',
    skill: t('skill.whatIf'),
    simulated: true,
    steps: ['check', 'closer', 'bigger'],
    title: t('mission.planetX'),
    target: 'barnard',
    det: 3,
    band: t('mis.px.band'),
    heading: t('mis.px.heading'),
    lesson: t('mis.px.lesson'),
    instructions: [
      step(
        'check',
        t('mis.px.check'),
        t('mis.px.checkLine'),
        [t('mis.px.checkHint')],
        'sandbox',
      ),
      step(
        'closer',
        t('mis.px.closer'),
        t('mis.px.closerLine'),
        [t('mis.px.closerHint')],
        'sandbox-distance',
      ),
      step(
        'bigger',
        t('mis.px.bigger'),
        t('mis.px.biggerLine'),
        [t('mis.px.biggerHint')],
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
    return result('failed', t('mis.notStep'));
  if (id === 'runaway') {
    if (stepId === 'play') return result(i.acted && (i.dateChanges ?? 0) >= 3 ? 'done' : 'waiting');
    if (!i.tap) return result('waiting');
    if (!i.points?.length || !(i.radius! > 0))
      return result('unavailable', t('mis.noTrack'));
    return hits(i.points, i.tap, i.radius!)
      ? result('done')
      : result('failed', t('mis.notThat'));
  }
  if (id === 'ghost') {
    if (stepId === 'play') return result(i.acted && (i.loops ?? 0) >= 1 ? 'done' : 'waiting');
    if (stepId === 'stack') return result(i.mode === 'stack' ? 'done' : 'waiting');
    if (i.mode !== 'stack') return result('waiting');
    if (!i.trial || i.trial.key !== i.keyNow) return result('checking');
    const s = i.trial.result;
    if (s.frames < 2) return result('unavailable', t('mis.fewPics'));
    // Exactly core/stack.ts's "moves with" rule, including its finite-value requirement.
    const [still, opposite] = s.controls;
    if (![s.along.snr, still.snr, opposite.snr].every(Number.isFinite))
      return result('unavailable', t('mis.flagged'));
    return s.along.snr >= 5 && s.along.snr >= still.snr + 2 && s.along.snr >= opposite.snr + 2
      ? result('done')
      : result('failed', t('mis.notYet'));
  }
  if (!i.sandbox || i.sandbox.patchKey !== i.keyNow) return result('checking');
  const { planet, verdict } = i.sandbox;
  if (verdict.kind === 'unknown')
    return result('unavailable', t('mis.noNoise'));
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
    : result('unavailable', i.fit.reason ?? t('mis.noMotion'));
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
        continueLabel: t('mis.continue'),
      }
    : null;
}

/** Ungraded objects. Fill descriptions from catalogue fields and count the pictures shown. */
export const OBJECTS = [
  {
    target: 'rw-aur',
    title: 'RW Aurigae',
    det: 3 as Det,
    skill: t('mis.tryBlink'),
    tab: 'brightness',
    look: t('mis.o.rw'),
  },
  {
    target: 'r-dra',
    title: 'R Draconis',
    det: 6 as Det,
    tab: 'brightness',
    look: t('mis.o.rdra'),
  },
  {
    target: 'eps-indi-b',
    title: 'Epsilon Indi B',
    det: 3 as Det,
    tab: 'spectrum',
    look: t('mis.o.eps'),
  },
] as const;

export function objectLine(key: string, field: Field, plainType: string | null): string {
  const type = plainType || t('mis.noType');
  const n = field.frames.length;
  if (key === 'eps-indi-b') return t('mis.o.epsLine', { type });
  if (key === 'r-dra') {
    const dates = field.frames.map((f) => f.mjd).filter(Number.isFinite);
    if (!dates.length) return t('mis.o.noDates', { type });
    const months = Math.round((Math.max(...dates) - Math.min(...dates)) / (365.25 / 12));
    return t('mis.o.over', { type, n, months });
  }
  return t('mis.o.real', { type, n });
}
