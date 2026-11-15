/**
 * Starters and tasks: the starting points ("Runaway star", …), the practice, the task line in
 * the frame with its hints, the close-up once the object is found, and the two levels, Explore
 * and Measure (GDE-4, GDE-5). Owner: lane H.
 *
 * The task line follows the patch on screen, not the last starter: it names the task of the
 * target or practice patch in the frame, says something true on a spot fetched live, and is
 * empty (hidden) while a spot loads or has no pictures.
 *
 * The guide may read any part, but only through the functions in SPEC 8.4.
 */
import { getView, onView } from '../shell/view.ts';
import { startMission, leaveMission, progress } from './progress.ts';
import { MISSIONS, isMissionId } from './missions.ts';
import { setTrial } from '../viewer/motion.ts';
import { pause, setEpoch } from '../viewer/playback.ts';
import { S, VIEWS, watch, type Level } from '../viewer/state.ts';
import { currentView, draw, groupDate, onTap } from '../viewer/render.ts';
import { targetMeasurements } from '../viewer/load.ts';
import { detail } from '../viewer/detail.ts';
import { on, emit } from '../shell/bus.ts';
import { openPlace } from '../shell/shell.ts';
import { icon } from '../shell/icons.ts';
import { fitMotion } from '../core/fit.ts';
import { formatDate } from '../core/astro.ts';
import { targetByKey } from '../core/targets.ts';
import { SCENARIOS } from '../core/field.ts';
import { ring, type PointAt } from '../guide/ring.ts';
import {
  HINT_LABELS,
  KEYS_LINE,
  movedLine,
  LIVE_LINE,
  LOOK_CLOSER,
  LOOK_CLOSER_FAINT,
  MEASURING,
  MISSED,
  SHOW_ME,
  SHOW_ME_FAINT,
  TASKS,
  type TaskCopy,
} from './copy.ts';
import { hits, ringSource, targetAt } from './track.ts';
import { setMarks, startCloseup } from './closeup.ts';
import { pickerOn, startKeyPick, sync as syncKeyPick } from './keypick.ts';

export type { PointAt } from '../guide/ring.ts';

/**
 * A starting point or a practice, as the welcome card and the Places menu offer them.
 * `too-faint` is the old name of `ghost` (v2.0 contract 3), kept so old links and messages still
 * open it; menus and copy use `ghost` only. Use `starterOf` to resolve it.
 */
export type StarterId = 'runaway' | 'made-of' | 'ghost' | 'warm-up' | 'planet-x' | 'too-faint';

/** A starter's own name: `too-faint` becomes `ghost`; every other id is itself. */
export function starterOf(id: StarterId): Exclude<StarterId, 'too-faint'> {
  return id === 'too-faint' ? 'ghost' : id;
}

/** What a starter says and opens. */
export interface Starter {
  /** Its name ("Runaway star"). */
  title: string;
  /** Its one plain line, as the welcome card and the Places menu show it. */
  line: string;
  /** The target or practice key it loads (core/targets.ts or core/field.ts). */
  target: string;
  /** A practice on simulated pictures: labelled "Simulated" wherever it is offered (H3). */
  simulated: boolean;
}

/** The starters, in the order they are offered. Words from the reference screenshots. */
export const STARTERS: Readonly<Record<Exclude<StarterId, 'too-faint'>, Starter>> = Object.freeze({
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
  ghost: {
    title: 'The ghost',
    line: 'It is hard to pick out in a single picture. Add pictures along its path.',
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

// ----- Task state ------------------------------------------------------------------------------

/** The patch the task belongs to; a new patch starts the task over. */
let patchKey = '';
/** A mission entry waits for its own pictures before pausing on date A. */
let missionEntry: import('./missions.ts').MissionId | null = null;
let startGhostArrow = false;
/** Help used so far: 0 none, 1 Hint, 2 Another hint, 3 Look closer, 4 Show me. */
let help = 0;
let found = false;
/** The close-up is shown without the user having found it (revealTarget). */
let revealed = false;
/** A short note in place of the help line (a missed tap), and its timer. */
let note = '';
let noteTimer = 0;
/** The measured result, as HTML, once found (filled in when the measurement arrives). */
let result = '';
/** One measured sentence under it: how far the object moved between the first and last date. */
let moved = '';
let pointTimer = 0;

const foundFns = new Set<(key: string) => void>();

/** Restores the level and "all numbers", answers `start`, and keeps the task line. */
export function startGame(): void {
  on('start', (m) => {
    const id = m.starter as StarterId;
    const starter = Object.hasOwn(STARTERS, starterOf(id)) ? STARTERS[starterOf(id)] : undefined;
    if (!starter) return;
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.hidden = true;
    const mission = starterOf(id);
    if (getView() === 'discover' && isMissionId(mission)) {
      missionEntry = mission;
      startGhostArrow = mission === 'ghost';
      startMission(mission);
      pause();
      S.mode = 'flip';
      emit('band', { det: MISSIONS[mission].det! });
      openTarget(MISSIONS[mission].target!);
      setEpoch(0);
    } else {
      if (getView() === 'discover') leaveMission();
      openTarget(starter.target);
    }
  });
  onView(renderTask);
  watch(['field', 'groups', 'source'], () => {
    if (!missionEntry || getView() !== 'discover') return;
    if (progress().current !== missionEntry) {
      missionEntry = null;
      return;
    }
    const m = MISSIONS[missionEntry];
    if (S.field?.target?.key !== m.target || !S.groups.length || S.source === 'loading') return;
    missionEntry = null;
    pause();
    setEpoch(0);
  });
  startCloseup();
  onTap(tapped);
  startKeyPick({
    open: () => {
      const t = task();
      return getView() === 'expert' && !!t && !found && t.kind !== 'faint';
    },
    pick: tapped,
    aim: ringNow,
    focus: renderTask,
    name: () => S.field?.target?.name ?? task()?.title ?? '',
    missed: MISSED,
  });
  watch(['target', 'field', 'source', 'groups', 'level'], renderTask);
  watch(['mode'], () => {
    if (
      getView() === 'discover' &&
      progress().current === 'ghost' &&
      S.mode === 'stack' &&
      startGhostArrow
    ) {
      startGhostArrow = false;
      setTrial({ pmra: 0, pmdec: 0 });
    }
    if (getView() === 'expert' && task()?.kind === 'faint' && S.mode === 'stack' && !found)
      markFound();
  });
  renderTask();
}

/**
 * Switches between Explore and Measure. Keeps the view if the level has it, else Flip.
 * Measure opens the Measure panel and the frame's picture tools button (lanes E and D draw them
 * from `S.level`). The view module owns persistence.
 */
export function setLevel(level: Level): void {
  S.level = level;
  if (!VIEWS[level].includes(S.mode)) S.mode = 'flip';
  if (level === 'explore') S.tools = false;
}

/** Opens a starter: loads its target and sets its task (through the bus's `start`). */
export function openStarter(id: StarterId): void {
  emit('start', { starter: id });
}

/** Lane K's Show me action: rings only. It never snaps, taps, or records a step.
 * For the ghost's last step this points to the snap button; the visitor still presses it.
 */
export function showMissionStep(id: import('./missions.ts').MissionId, step: string): string {
  const instruction = MISSIONS[id].instructions?.find((s) => s.id === step);
  if (!instruction) return '';
  if (id === 'runaway' && step === 'tap') {
    setMarks('ring');
    draw();
  } else {
    pointOut({ guide: instruction.showMe.guide });
  }
  return instruction.showMe.label;
}

/**
 * Opens a target or practice patch in the frame and moves the sky to it. A patch already on
 * screen is kept as it is (it keeps playing).
 */
export function openTarget(key: string): void {
  if (S.target === key && S.field && S.source !== 'loading') {
    renderTask();
    return;
  }
  const t = targetByKey(key);
  const sc = SCENARIOS[key];
  const where = t ?? sc;
  if (!where) return;
  openPlace({
    name: t?.name ?? sc?.title ?? key,
    ra: where.ra,
    dec: where.dec,
    target: key,
    ...(getView() === 'discover' ? { fov: 6 } : {}),
  });
}

/**
 * Gives the answer to the task on screen: rings the object in the picture on every date, shows
 * the close-up, and says where the rings come from (GDE-4, H4). The user has not found it, so
 * nothing is counted as found.
 */
export function revealTarget(): void {
  if (!task()) return;
  revealed = true;
  setMarks('closeup');
  draw();
  renderTask();
}

/**
 * Points at something (the tour's ring, "Show me", "Explain the screen"); null stops pointing.
 * The ring follows the part when it moves (GDE-2).
 */
export function pointOut(what: PointAt | null): void {
  ring(what);
}

/** Hears when the user finds the task's object (the tour waits for it). */
export function onFound(fn: (key: string) => void): () => void {
  foundFns.add(fn);
  return () => foundFns.delete(fn);
}

/** True once the task on screen is done. */
export function taskDone(): boolean {
  return found;
}

/** The next help button's label, or null when all help is given or there is no task. */
export function nextHintLabel(): string | null {
  return task() && !found && help < HINT_LABELS.length ? HINT_LABELS[help]! : null;
}

/** Gives the next help (Hint, Another hint, Look closer, Show me) and says it in words. */
export function nextHint(): string {
  const t = task();
  if (!t || found || help >= HINT_LABELS.length) return helpText();
  help += 1;
  clearTimeout(pointTimer);
  if (help === 3) {
    if (t.kind === 'faint') pointBriefly(S.level === 'measure' ? 'view-stack' : 'measure');
    else setMarks('circle');
  } else if (help === 4) {
    setMarks('ring');
    if (t.kind === 'faint') pointBriefly(S.level === 'measure' ? 'view-stack' : 'measure');
  }
  draw();
  renderTask();
  return helpText();
}

/** The words of the help given so far (the latest step). */
export function helpText(): string {
  const t = task();
  if (!t || help === 0) return '';
  if (help <= 2) return t.hints[help - 1]!;
  if (help === 3) return t.kind === 'faint' ? LOOK_CLOSER_FAINT : LOOK_CLOSER;
  return t.kind === 'faint' ? SHOW_ME_FAINT : SHOW_ME;
}

// ----- The task line ---------------------------------------------------------------------------

/** The task of the patch on screen, or null (loading, no pictures, a spot fetched live). */
function task(): (TaskCopy & { key: string; simulated: boolean }) | null {
  const key = S.target;
  if (!key || !S.field || !S.groups.length) return null;
  if (S.source !== 'real' && S.source !== 'simulated') return null;
  const copy = TASKS[key];
  return copy ? { ...copy, key, simulated: S.field.simulated } : null;
}

function pointBriefly(name: string): void {
  ring({ guide: name });
  clearTimeout(pointTimer);
  pointTimer = window.setTimeout(() => ring(null), 4000);
}

function resetIfNewPatch(): void {
  const key = `${S.target ?? ''}|${S.source}|${S.field ? S.field.ra.toFixed(5) : ''}`;
  if (key === patchKey) return;
  patchKey = key;
  help = 0;
  found = false;
  revealed = false;
  result = '';
  moved = '';
  note = '';
  setMarks('none');
}

function renderTask(): void {
  if (getView() === 'discover') {
    document.getElementById('frame-task')?.replaceChildren();
    return;
  }
  const box = document.getElementById('frame-task');
  if (!box) return;
  resetIfNewPatch();
  const t = task();
  if (!t) {
    if (S.source === 'live' && S.field && S.groups.length) {
      box.innerHTML = `<div class="task"><div class="task-text"><p class="task-line"></p></div></div>`;
      box.querySelector('.task-line')!.textContent = LIVE_LINE;
    } else if (box.firstChild) box.replaceChildren();
    return;
  }
  const label = nextHintLabel();
  const numbers = found && !t.simulated;
  const focused = box.contains(document.activeElement)
    ? (document.activeElement as HTMLElement).dataset.hint !== undefined
    : false;
  box.innerHTML = `
    <div class="task${t.simulated ? ' sim' : ''}${found ? ' done' : ''}">
      <div class="task-text">
        <p class="task-title">${t.simulated ? '<span class="pill warn">Simulated</span>' : ''}<span data-title></span>${
          numbers
            ? `<button class="btn text task-hint task-numbers" data-numbers data-guide="task-numbers" data-tip="Open Measure on it">${icon('chart')}See the numbers</button>`
            : ''
        }</p>
        <p class="task-line" data-line></p>
        <p class="task-help" data-help hidden></p>
        <p class="task-big" data-result hidden></p>
        <p class="task-note" data-caption hidden></p>
      </div>
      ${label ? `<button class="btn text task-hint" data-hint data-guide="hint">${icon('bulb')}<span></span></button>` : ''}
    </div>`;
  const set = (sel: string, text: string) => {
    const el = box.querySelector<HTMLElement>(sel);
    if (el) {
      el.textContent = text;
      el.hidden = !text;
    }
  };
  const name = S.field?.target?.name ?? (t.simulated ? SCENARIOS[t.key]?.title : '') ?? t.title;
  set('[data-title]', found ? name : t.title);
  // With the keyboard crosshair on, the keys take the place of "Tap it" (no jump in height).
  set('[data-line]', found ? '' : pickerOn() ? KEYS_LINE : t.line);
  set('[data-help]', note || (found ? '' : helpText()));
  syncKeyPick();
  const hint = box.querySelector<HTMLElement>('[data-hint]');
  if (hint) {
    hint.querySelector('span')!.textContent = label ?? '';
    hint.dataset.tip = label === 'Show me' ? 'Rings it; you tap it' : 'A little more help';
    hint.addEventListener('click', () => nextHint());
    if (focused) hint.focus();
  }
  box.querySelector('[data-numbers]')?.addEventListener('click', () => {
    setLevel('measure');
    detail({ kind: 'target' });
  });
  if (found || revealed) showResult(box, t);
}

/** The close-up's words: the result once found, and where the rings come from (GDE-4, H4). */
function showResult(box: HTMLElement, t: TaskCopy & { key: string; simulated: boolean }): void {
  const num = box.querySelector<HTMLElement>('[data-result]');
  if (num && found) {
    num.hidden = false;
    if (result) num.innerHTML = result;
    else num.textContent = MEASURING;
    // The big type is for a measured number only.
    num.className = result.startsWith('<b>') ? 'task-big' : 'task-line';
  }
  const cap = box.querySelector<HTMLElement>('[data-caption]');
  if (!cap) return;
  cap.hidden = false;
  const where = `Rings: ${ringSource(S.field)}. Worked out, not observed. The bold ring is the date on screen; the letters in the close-up are the first and last dates.${
    t.simulated ? ' Practice exposure IDs start with SIMULATED.' : ''
  }`;
  // The measured sentence first (what moved, how far), then where the rings come from. Only in
  // Explore: Measure says it in full beside the frame, and there the frame is too narrow for it.
  const say = found && moved && S.level === 'explore';
  cap.innerHTML = `${say ? '<span class="task-moved"></span> ' : ''}<span class="term" tabindex="0"></span>${
    t.key === 'planet-x' ? ' · contrast raised in the close-up only' : ''
  }`;
  const said = cap.querySelector<HTMLElement>('.task-moved');
  if (said) said.textContent = moved;
  const term = cap.querySelector<HTMLElement>('.term')!;
  term.textContent = t.simulated ? 'Rings: where the simulation put it' : 'Rings: catalogue predictions';
  term.dataset.tip = where;
}

// ----- Tapping the picture ----------------------------------------------------------------------

/** A tap, or Enter on the keyboard crosshair (keypick.ts): true when it hit the object. */
function tapped(p: { x: number; y: number; ra: number; dec: number }): boolean {
  if (getView() === 'discover') return false;
  const t = task();
  const view = currentView();
  if (!t || found || t.kind === 'faint' || !view?.field) return false;
  const pts = S.groups
    .map((g) => targetAt(view.field, S.target, groupDate(view.field, g)))
    .map((at) => (at ? view.skyToPic(at.ra, at.dec) : null))
    .filter((q): q is { x: number; y: number } => !!q);
  const tap = view.toPic(p.x, p.y);
  if (hits(pts, tap, Math.max(18, 3 * view.k))) {
    markFound();
    return true;
  }
  note = MISSED;
  clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => {
    note = '';
    renderTask();
  }, 3500);
  renderTask();
  return false;
}

/**
 * Where "Show me" points, for the keyboard crosshair: the middle of the object's path over every
 * date, field pixels (it stays put while the pictures play, and a pick there hits); null before
 * Show me.
 */
function ringNow(): { x: number; y: number } | null {
  const view = currentView();
  if (help < 4 || !view?.field) return null;
  const pts = S.groups
    .map((g) => targetAt(view.field, S.target, groupDate(view.field, g)))
    .map((at) => (at ? view.skyToPic(at.ra, at.dec) : null))
    .filter((q): q is { x: number; y: number } => !!q)
    .map((q) => view.toField(q.x, q.y));
  if (!pts.length) return null;
  return {
    x: pts.reduce((a, q) => a + q.x, 0) / pts.length,
    y: pts.reduce((a, q) => a + q.y, 0) / pts.length,
  };
}

function markFound(): void {
  const t = task();
  if (!t || found) return;
  found = true;
  note = '';
  clearTimeout(noteTimer);
  ring(null);
  setMarks('closeup');
  draw();
  result = '';
  moved = '';
  renderTask();
  for (const fn of foundFns) fn(t.key);
  void measureResult(t).then((r) => {
    if (task()?.key !== t.key || !found) return;
    result = r.html;
    moved = r.moved;
    renderTask();
  });
}

/** What the found object measures, from the pixels (H4, H5): never a model value. */
async function measureResult(
  t: TaskCopy & { key: string; simulated: boolean },
): Promise<{ html: string; moved: string }> {
  const term = (text: string, tip: string) =>
    `<span class="term" tabindex="0" data-tip="${esc(tip)}">${esc(text)}</span>`;
  const only = (html: string) => ({ html, moved: '' });
  if (t.simulated) {
    const what = t.key === 'planet-x' ? 'the made-up planet' : 'the made-up moving dot';
    return only(
      term(
        `You found ${what}`,
        'Practice pictures are made up. They are never measured or mixed with real results.',
      ),
    );
  }
  if (t.kind === 'variable') {
    return only(
      term(
        'Its brightness changes between dates',
        'Measure shows by how much, measured from the pixels of each exposure.',
      ),
    );
  }
  if (t.kind === 'faint') {
    return only(
      term(
        'Stacked along its path',
        'Measure says how clearly it shows in each detector once the dates are added up.',
      ),
    );
  }
  const pending = targetMeasurements();
  if (!pending) return only(term('Not measured', 'This patch has no real exposures to measure.'));
  try {
    const ms = await pending;
    const fit = fitMotion(ms, S.field?.target ?? null);
    if (!fit.ok) return only(term('Not measured', fit.reason ?? 'The motion could not be measured.'));
    const pill =
      fit.matches === true
        ? '<span class="pill good">matches catalogue</span>'
        : fit.matches === false
          ? '<span class="pill warn">differs from catalogue</span>'
          : '<span class="pill">no catalogue value</span>';
    const cat = fit.catalogue
      ? ` ${fit.catalogue.source.startsWith('Gaia DR3') ? 'Gaia DR3' : 'The catalogue'} says ${fit.catalogue.total.toFixed(2)}″/yr.`
      : '';
    const html = `<b>${term(
      `${fit.total.toFixed(2)}″/yr`,
      `Moves ${fit.total.toFixed(2)} ± ${fit.totalErr.toFixed(2)} arcseconds a year, measured from the pixels of ${fit.used} of ${fit.of} real exposures.${cat}`,
    )}</b> ${pill}`;
    // How far that is between the first and last date on the date scale, the step the rings show.
    const field = S.field;
    const dated = field
      ? S.groups
          .map((g) => ({ letter: g.letter, mjd: groupDate(field, g) }))
          .filter((d) => Number.isFinite(d.mjd))
          .sort((a, b) => a.mjd - b.mjd)
      : [];
    const first = dated[0];
    const last = dated[dated.length - 1];
    if (!field || !first || !last || last.mjd <= first.mjd) return { html, moved: '' };
    const years = (last.mjd - first.mjd) / 365.25;
    return {
      html,
      moved: movedLine(
        `${first.letter} (${formatDate(first.mjd, 'month')})`,
        `${last.letter} (${formatDate(last.mjd, 'month')})`,
        fit.total * years,
        fit.totalErr * years,
        field.scale,
      ),
    };
  } catch (err) {
    console.warn('game: measuring the target failed', err);
    return only(term('Not measured', 'The measurement could not run on this page.'));
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
