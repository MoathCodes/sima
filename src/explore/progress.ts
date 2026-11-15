/**
 * Discover's progress (v2.0, BEGINNER-AND-MOBILE.md sections 1 and 13): which mission is open,
 * which steps are recorded, which skills are learned. Owner: lane H.
 *
 * - Kept in the browser under `sima-missions`. When storage is blocked it lives in memory for the
 *   visit (MSN-8). Never in a link (B-10). Nothing in Expert depends on it (VIEW-3).
 * - No locks (B-4): progress only records; it never decides what may be used.
 *
 * Step 0: a working implementation of the contract. Lane H may change the insides freely.
 */
import { MISSIONS, MISSION_IDS, isMissionId, type MissionId } from './missions.ts';

/** How a step ended: passed, or not available here (with a finish). Never "done" for the latter. */
export type StepState = 'done' | 'unavailable';

/** A snapshot of the progress. Treat as read-only; a new object is made on every change. */
export interface Progress {
  /** The mission in progress, or null. */
  current: MissionId | null;
  /** Per mission, each recorded step and how it ended. */
  steps: Readonly<Record<MissionId, Readonly<Record<string, StepState>>>>;
  /** Missions with every step recorded: their skill counts as learned. */
  learned: readonly MissionId[];
}

/** The browser key (SPEC 8.5). Reset clears only this key. */
export const PROGRESS_KEY = 'sima-missions';

type Stored = { current: MissionId | null; steps: Record<MissionId, Record<string, StepState>> };

function empty(): Stored {
  return { current: null, steps: { runaway: {}, ghost: {}, 'planet-x': {} } };
}

let state: Stored | null = null;
const fns = new Set<(p: Progress) => void>();

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function load(): Stored {
  if (state) return state;
  state = empty();
  try {
    const raw = storage()?.getItem(PROGRESS_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (v && typeof v === 'object') {
      if (isMissionId(v.current)) state.current = v.current;
      for (const id of MISSION_IDS) {
        const s = v.steps?.[id];
        if (!s || typeof s !== 'object') continue;
        for (const [k, how] of Object.entries(s)) if (how === 'done' || how === 'unavailable') state.steps[id][k] = how;
      }
    }
  } catch {
    // Blocked or unreadable storage: start empty, in memory.
  }
  return state;
}

function save(): void {
  try {
    storage()?.setItem(PROGRESS_KEY, JSON.stringify(load()));
  } catch {
    // Storage can be blocked: the progress then lasts for this visit only.
  }
  tell();
}

function tell(): void {
  const p = progress();
  for (const fn of [...fns]) {
    try {
      fn(p);
    } catch (err) {
      console.error('progress: an onProgress listener failed', err);
    }
  }
}

/** The progress now. */
export function progress(): Progress {
  const s = load();
  const steps = Object.fromEntries(MISSION_IDS.map((id) => [id, { ...s.steps[id] }])) as Progress['steps'];
  const learned = MISSION_IDS.filter((id) => MISSIONS[id].steps.every((k) => k in s.steps[id]));
  return { current: s.current, steps, learned };
}

/**
 * Hear changes.
 * @returns A function that stops listening.
 */
export function onProgress(fn: (p: Progress) => void): () => void {
  fns.add(fn);
  return () => {
    fns.delete(fn);
  };
}

/** Marks a mission as the one in progress. Its recorded steps are kept (play it again freely). */
export function startMission(id: MissionId): void {
  load().current = id;
  save();
}

/** Leaves the mission in progress, keeping what was recorded. */
export function leaveMission(): void {
  load().current = null;
  save();
}

/**
 * Records a step. `done` is never overwritten by `unavailable`.
 * @param id The mission.
 * @param step One of `MISSIONS[id].steps`.
 * @param how `done` when it passed; `unavailable` when it was finished without its check (MSN-6).
 */
export function stepDone(id: MissionId, step: string, how: StepState): void {
  const s = load().steps[id];
  if (s[step] === 'done' && how === 'unavailable') return;
  s[step] = how;
  save();
}

/** Clears all progress (Settings → Reset my progress). Only `sima-missions` is removed. */
export function resetProgress(): void {
  state = empty();
  try {
    storage()?.removeItem(PROGRESS_KEY);
  } catch {
    // Blocked storage: the memory copy is cleared all the same.
  }
  tell();
}

/** For tests: forget the copy in memory, so the next read loads from storage again. */
export function _forgetForTests(): void {
  state = null;
}
