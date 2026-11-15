/**
 * Discover's missions (v2.0, BEGINNER-AND-MOBILE.md section 6): their ids, steps and the shape of
 * their checks. Owner: lane H. Lane K draws the screens from this; nothing here touches the page.
 *
 * Step 0 stub: the exported types and names are the contract (section 13, "Mission results").
 * Lane H fills in the data and the checks themselves (`checkStep`), with tests in
 * `tests/missions.test.ts`. Pure: no page access.
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

/** What the list and the success card need about a mission. Lane H owns the words. */
export interface Mission {
  id: MissionId;
  /** The skill it teaches (section 6): Blink, Stack, What-if. */
  skill: string;
  /** Simulated from start to end (Planet X, H3). */
  simulated: boolean;
  /** Its steps, in order. A mission is finished when every step is recorded (done or unavailable). */
  steps: readonly string[];
}

/** Step 0 stub data: ids and skills from section 6. Lane H may rename steps (they are not in links). */
export const MISSIONS: Readonly<Record<MissionId, Mission>> = Object.freeze({
  runaway: { id: 'runaway', skill: 'Blink', simulated: false, steps: ['play', 'tap'] },
  ghost: { id: 'ghost', skill: 'Stack', simulated: false, steps: ['play', 'stack', 'motion'] },
  'planet-x': { id: 'planet-x', skill: 'What-if', simulated: true, steps: ['check', 'closer'] },
});
