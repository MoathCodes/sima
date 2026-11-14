/**
 * Starters and tasks: the starting points ("Runaway star", …), the practice, the task line in
 * the frame with its hints, the reveal, and the two levels, Explore and Measure (GDE-1, GDE-5).
 * Owner: lane H.
 *
 * The guide may read any part, but only through the functions in SPEC 8.4.
 *
 * PHASE 0 STUB: a starter loads its target and shows its task line; Hint, the reveal and
 * pointing do nothing yet.
 */
import { S, VIEWS, type Level } from '../viewer/state.ts';
import { loadTarget } from '../viewer/load.ts';
import { on, emit } from '../shell/bus.ts';
import { icon } from '../shell/icons.ts';

/** A starting point or a practice, as the welcome card and the Places menu offer them. */
export type StarterId = 'runaway' | 'made-of' | 'too-faint' | 'warm-up' | 'planet-x';

/** What a starter says and opens. */
export interface Starter {
  /** Its name ("Runaway star"). */
  title: string;
  /** Its one plain line, which is also the task in the frame. */
  line: string;
  /** The target or practice key it loads (core/targets.ts or core/field.ts). */
  target: string;
  /** A practice on simulated pictures: labelled "Simulated" wherever it is offered (H3). */
  simulated: boolean;
}

/** The starters, in the order they are offered. Words from the reference screenshots. */
export const STARTERS: Readonly<Record<StarterId, Starter>> = Object.freeze({
  runaway: {
    title: 'Runaway star',
    line: 'One dot jumps. Tap it.',
    target: 'barnard',
    simulated: false,
  },
  'made-of': {
    title: 'What is it made of?',
    line: 'Watch the dips appear. Those are water and methane.',
    target: 'eps-indi-b',
    simulated: false,
  },
  'too-faint': {
    title: 'Too faint to see',
    line: 'Nothing in any single picture. Add them along its path.',
    target: 'wise-0855',
    simulated: false,
  },
  'warm-up': { title: 'Warm-up', line: '20-second practice', target: 'warm-up', simulated: true },
  'planet-x': {
    title: 'The hidden planet',
    line: 'Made up: it jumps',
    target: 'planet-x',
    simulated: true,
  },
});

/** Something to point at: a part of the page by its `data-guide` name, or a spot on the sky. */
export type PointAt = { guide: string } | { ra: number; dec: number; label?: string };

let task: Starter | null = null;

/** Restores the level, shows the task line and answers `start`. Called once by main.ts. */
export function startGame(): void {
  on('start', (m) => {
    const starter = STARTERS[m.starter as StarterId];
    if (!starter) return;
    task = starter;
    renderTask();
    void loadTarget(starter.target);
  });
  try {
    if (localStorage.getItem('b102-level') === 'measure') setLevel('measure');
  } catch {
    // Storage can be blocked: start in Explore.
  }
  task = STARTERS.runaway;
  renderTask();
}

/**
 * Switches between Explore and Measure. Keeps the view if the level has it, else Flip.
 * Remembered in `b102-level`.
 */
export function setLevel(level: Level): void {
  S.level = level;
  if (!VIEWS[level].includes(S.mode)) S.mode = 'flip';
  if (level === 'explore') S.tools = false;
  try {
    localStorage.setItem('b102-level', level);
  } catch {
    // Storage can be blocked; the level then lasts for this visit only.
  }
}

/** Opens a starter: loads its target and sets its task (through the bus's `start`). */
export function openStarter(id: StarterId): void {
  emit('start', { starter: id });
}

/**
 * Gives the answer to the task on screen: rings the target in the picture and names it, with
 * where the ring comes from (GDE-4, H4).
 * PHASE 0 STUB: does nothing.
 */
export function revealTarget(): void {}

/**
 * Points at something (the tour's ring, "Show me", "Explain the screen"); null stops pointing.
 * The pointer follows the part when it moves (GDE-2).
 * PHASE 0 STUB: does nothing.
 */
export function pointOut(what: PointAt | null): void {}

function renderTask(): void {
  const box = document.getElementById('frame-task');
  if (!box) return;
  box.hidden = !task;
  if (!task) return;
  box.style.cssText = 'display:flex;align-items:start;gap:8px';
  box.innerHTML = `
    <div style="flex:1">
      <p data-title style="margin:0;font:var(--text-control);font-weight:600"></p>
      <p data-line style="margin:0;color:var(--ink-2)"></p>
    </div>
    <button class="btn text" data-hint data-guide="hint">${icon('bulb')}Hint</button>`;
  const title = box.querySelector('[data-title]');
  const line = box.querySelector('[data-line]');
  if (title) title.textContent = task.simulated ? `Simulated: ${task.title}` : task.title;
  if (line) line.textContent = task.line;
}
