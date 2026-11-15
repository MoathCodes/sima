/**
 * The mission card and the mission as it runs (BEGINNER-AND-MOBILE.md sections 5.3 and 6).
 * Owner: lane K.
 *
 * - Opens the mission's target on its detector, Flip, 6′, **paused** on the first date.
 * - Shows the steps (done, now, next), the step's sentence, the hint box, Hint / Another hint /
 *   Look closer and Show me, a progress bar and the keys.
 * - Gathers each step's inputs from the page (S, taps on the picture, the stack's trial result,
 *   the sandbox reading) and asks lane H's pure checks (`currentStep`, `checkStep` in
 *   src/explore/missions.ts) what they mean. Lane H owns the step words, hints and Show me.
 * - Records each step with lane H's progress (`stepDone`): `done` when it passed, `unavailable`
 *   only through "Continue without it" (MSN-6). Show me never records anything (MSN-7).
 *
 * Planet X is a model from start to end (H3, H4): its card says "Simulated" first and nothing it
 * reads reaches results or exports (the sandbox keeps it apart, shell/sandbox.ts).
 */
import { MISSIONS, MISSION_IDS, currentStep, type CheckResult, type MissionId, type MissionInputs } from '../explore/missions.ts';
import { progress, startMission, stepDone } from '../explore/progress.ts';
import {
  nextHint,
  nextHintLabel,
  onFound,
  openStarter,
  setDiscoverPick,
  showMissionStep,
} from '../explore/game.ts';
import { setMarks } from '../explore/closeup.ts';
import { focusPicture } from '../explore/keypick.ts';
import { targetAt } from '../explore/track.ts';
import { S, pic, watch } from '../viewer/state.ts';
import { pause, setEpoch } from '../viewer/playback.ts';
import { currentView, draw, groupDate, onTap } from '../viewer/render.ts';
import { setFov } from '../viewer/load.ts';
import { setTrial, trialResult, type TrialResult } from '../viewer/motion.ts';
import { emit } from '../shell/bus.ts';
import { hideFrame } from '../shell/shell.ts';
import { closeSandbox, onSandbox, openSandbox, sandboxState, type SandboxReading } from '../shell/sandbox.ts';
import { targetByKey } from '../core/targets.ts';
import { KEYS, LEAVE_ASK, MEASURING, MISSION_COPY, plainKind } from './copy.ts';
import { esc, icon, liveRegion, rerender, say } from './ui.ts';

/** A mission as it runs on this page. */
interface Run {
  id: MissionId;
  /** Steps recorded during this run (a replay starts empty; a resume starts with the recorded). */
  did: Record<string, 'done' | 'unavailable'>;
  /** The check result of the step now. */
  now: CheckResult;
  /** A short calm note in place of the step's state (a miss), for 3 s. */
  note: string;
  /** Help given on this step: written hints, then Look closer (the runaway's tap). */
  help: number;
  /** Show me's words once pressed on this step. */
  shown: string;
  /** "Leave the mission?" is asked. */
  asking: boolean;
  /** The opening setup (paused, first date, detector, view) was applied to the patch. */
  setUp: boolean;
  /** The step's action counts, reset on each step (missions.ts: Show me never adds to them). */
  acted: boolean;
  dates: number;
  seen: Set<number>;
  /** The runaway: the visitor's tap, picture pixels, until it is checked. */
  tap: { x: number; y: number } | null;
  /** The ghost: the stack read last. Planet X: the reading read last. */
  stack: TrialResult | null;
  reading: SandboxReading | null;
}

let run: Run | null = null;
const body = document.createElement('div');
const live = liveRegion();
let noteTimer = 0;
let pollTimer = 0;
let finished: (id: MissionId, run: { stack: TrialResult | null; reading: SandboxReading | null }) => void = () => {};
let left: () => void = () => {};

/** The card's element (placed by index.ts in `#mission` or the sheet). */
export function missionBody(): HTMLElement {
  return body;
}

/** The mission running now, or null. */
export function running(): MissionId | null {
  return run?.id ?? null;
}

/** Wires the checks. `onFinish` is called once every step is recorded; `onLeave` after Leave. */
export function startMissions(opts: { onFinish: typeof finished; onLeave: () => void }): void {
  finished = opts.onFinish;
  left = opts.onLeave;
  body.className = 'dsc-card dsc-mission';
  body.dataset.material = 'raised';
  body.addEventListener('click', onClick);
  body.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey && !isField(e.target)) {
      e.preventDefault();
      hint();
    }
  });
  watch(['target', 'field', 'groups', 'source', 'epoch', 'mode', 'playing', 'det'], (keys) => {
    if (!run) return;
    if (keys.has('groups') || keys.has('field')) resetCounts();
    else if (keys.has('epoch') && run.setUp) {
      run.acted = true;
      run.dates += 1;
      run.seen.add(S.epoch);
    }
    if (keys.has('playing') && S.playing && run.setUp) run.acted = true;
    evaluate();
  });
  // A pick with the keyboard crosshair (keypick.ts) passed the game's own check of the same track.
  onFound(() => {
    if (!run || step() !== 'tap') return;
    const t = track();
    run.tap = t?.points[Math.min(S.epoch, t.points.length - 1)] ?? null;
    evaluate();
  });
  onSandbox(() => evaluate());
  onTap((p) => {
    if (!run || step() !== 'tap') return;
    const view = currentView();
    if (!view) return;
    run.tap = view.toPic(p.x, p.y);
    evaluate();
  });
}

/** GATE-2: on the runaway's tap step, a keyboard pick (keypick.ts) is a tap at the crosshair. */
function keyPick(p: { x: number; y: number; ra: number; dec: number }): boolean {
  const view = currentView();
  if (!run || step() !== 'tap' || !view) return false;
  run.tap = view.toPic(p.x, p.y);
  evaluate();
  return run.now.state !== 'failed';
}

/** Opens a mission: records it as in progress and opens its target, paused. */
export function openMission(id: MissionId): void {
  const recorded = progress().steps[id];
  const all = MISSIONS[id].steps.every((k) => k in recorded);
  run = {
    id,
    did: all ? {} : { ...recorded },
    now: { state: 'waiting', reason: '' },
    note: '',
    help: 0,
    shown: '',
    asking: false,
    setUp: false,
    acted: false,
    dates: 0,
    seen: new Set(),
    tap: null,
    stack: null,
    reading: null,
  };
  startMission(id);
  const m = MISSIONS[id];
  // The one way in (contract 3): the game opens the target at its detector, Flip, 6′, paused.
  openStarter(id);
  hideFrame(false);
  if (S.target === m.target && S.field && S.fov !== 6) void setFov(6);
  evaluate();
  render();
  say(live, `${m.title}. Step ${index() + 1}: ${instruction()?.title ?? ''}`);
}

/** Stops the mission on this page (Leave). Progress keeps what was recorded. */
export function stopMission(): void {
  if (run?.id === 'planet-x') closeSandbox();
  run = null;
  clearInterval(pollTimer);
  pollTimer = 0;
  render();
}

/** Asks for the next hint (the H key, the Hint button). */
export function hint(): void {
  if (!run || run.asking) return;
  const labels = hintLabels();
  if (run.help >= labels.length) return;
  run.help += 1;
  // Look closer: the game's dashed circle and close-up (closeup.ts).
  if (run.id === 'runaway' && step() === 'tap' && run.help > (instruction()?.hints.length ?? 0)) {
    while (nextHintLabel() && nextHintLabel() !== 'Show me') nextHint();
    setMarks('circle');
    draw();
  }
  const text = hintText();
  // On a phone the hint shows inside the step, so the sheet's peek grows to hold it and the
  // picture and Play stay in view (redesign: no second screen for a hint).
  render();
  say(live, text);
}

/** Show me: lane H's instruction (rings or points). It never passes a step (MSN-7). */
export function showMe(): void {
  const k = step();
  if (!run || !k) return;
  run.shown = showMissionStep(run.id, k);
  render();
  say(live, run.shown);
}

/** Escape, ✕ or the view switch on the card: asks first; a second press keeps the mission. */
export function askLeave(): void {
  if (!run) return;
  run.asking = !run.asking;
  render();
  body.querySelector<HTMLElement>(run.asking ? '[data-k="stay"]' : '[data-k="leave-x"]')?.focus();
}

// ----- The checks ------------------------------------------------------------------------------

function instruction() {
  return run ? (MISSIONS[run.id].instructions ?? []).find((s) => !Object.hasOwn(run!.did, s.id)) ?? null : null;
}

function index(): number {
  if (!run) return 0;
  const k = step();
  const steps = MISSIONS[run.id].steps;
  return k ? steps.indexOf(k) : steps.length;
}

function step(): string | null {
  return instruction()?.id ?? null;
}

/** True when the mission's patch is on screen with real pictures. */
function ready(): boolean {
  if (!run) return false;
  return S.target === (MISSIONS[run.id].target ?? 'barnard') && !!S.field && S.groups.length > 0 && S.source === 'real';
}

/** The patch on screen, as shell/sandbox.ts and viewer/motion.ts key it. */
function patchKey(): string {
  return `${S.set?.key ?? 'field'}|${S.field?.ra}|${S.field?.dec}|${S.field?.n}`;
}

function resetCounts(): void {
  if (!run) return;
  run.acted = false;
  run.dates = 0;
  run.seen = new Set([S.epoch]);
  run.tap = null;
}

/** The opening setup, once the patch is on screen: paused, first date, Flip, its detector. */
function setUp(): void {
  if (!run || run.setUp || !ready()) return;
  const m = MISSIONS[run.id];
  run.setUp = true;
  pause();
  if (m.det && S.det !== m.det) emit('band', { det: m.det });
  if (S.mode !== 'flip' && index() === 0) S.mode = 'flip';
  setEpoch(0);
  if (run.id === 'ghost') {
    // "Where the catalogue says it is": the game's dashed circle (closeup.ts).
    setMarks('circle');
    draw();
  }
  resetCounts();
}

/** The catalogue track at every date, picture pixels, and the reach radius (as the game taps). */
function track(): { points: { x: number; y: number }[]; radius: number } | null {
  const view = currentView();
  if (!view?.field) return null;
  const points = S.groups
    .map((g) => targetAt(view.field, S.target, groupDate(view.field, g)))
    .map((at) => (at ? view.skyToPic(at.ra, at.dec) : null))
    .filter((q): q is { x: number; y: number } => !!q);
  return { points, radius: Math.max(18, 3 * view.k) };
}

/** The inputs for lane H's checks, from the page now. */
function inputs(k: string): MissionInputs {
  const r = run!;
  const patch = patchKey();
  const base: MissionInputs = { keyNow: patch, key: ready() ? patch : null };
  if (r.id === 'runaway') {
    if (k === 'play') return { ...base, acted: r.acted, dateChanges: r.dates };
    const t = track();
    return { ...base, tap: r.tap, points: t?.points ?? [], radius: t?.radius ?? 0 };
  }
  if (r.id === 'ghost') {
    if (k === 'play') return { ...base, acted: r.acted, loops: S.groups.length >= 2 && r.seen.size >= S.groups.length ? 1 : 0 };
    if (k === 'stack') return { ...base, mode: S.mode };
    const now = `${patch}|${S.det}|${pic().combineBy}`;
    const trial = S.mode === 'stack' ? trialResult() : null;
    if (trial) r.stack = trial;
    return { keyNow: now, key: trial?.key ?? null, mode: S.mode, trial };
  }
  const sandbox = sandboxState();
  if (sandbox) r.reading = sandbox;
  return { keyNow: patch, key: sandbox?.patchKey ?? null, sandbox, acted: r.acted };
}

/** Runs lane H's check for the step now; records a pass and moves on (several if they pass). */
function evaluate(): void {
  setDiscoverPick(run && step() === 'tap' ? keyPick : null);
  if (!run) return;
  setUp();
  const before = index();
  for (let guard = 0; guard < 6 && ready(); guard += 1) {
    const k = step();
    if (!k) break;
    const now = currentStep(run.id, run.did, inputs(k));
    if (!now) break;
    run.now = now.check;
    // Planet X before Check: nothing is being measured yet, so the step just waits.
    if (run.id === 'planet-x' && k === 'check' && !run.acted && run.now.state === 'checking')
      run.now = { state: 'waiting', reason: '' };
    if (now.check.state === 'failed' && k === 'tap') {
      // A missed tap: a calm note for 3 s, then the waiting sentence (5.3 Missed).
      miss(now.check.reason);
      run.now = { state: 'waiting', reason: '' };
    }
    if (run.now.state !== 'done') break;
    pass(k);
  }
  if (run && !step()) {
    finish();
    return;
  }
  // The ghost's last step reads a stack made off the page's thread: look again while it is open.
  const poll = run.id === 'ghost' && step() === 'motion';
  if (poll && !pollTimer) pollTimer = window.setInterval(evaluate, 400);
  if (!poll && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = 0;
  }
  if (index() !== before) say(live, `Step ${index() + 1}: ${instruction()?.title ?? ''}`);
  render();
}

function miss(reason: string): void {
  if (!run) return;
  run.tap = null;
  run.note = reason;
  say(live, reason);
  clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => {
    if (run) run.note = '';
    render();
  }, 3000);
}

function pass(k: string): void {
  if (!run) return;
  const done = instruction()?.done;
  run.did = { ...run.did, [k]: 'done' };
  stepDone(run.id, k, 'done');
  run.help = 0;
  run.shown = '';
  run.note = '';
  resetCounts();
  if (done) say(live, done);
  // The ghost: the arrow starts at no motion, so the stack is "not shifted" (6.2 step 2).
  if (run.id === 'ghost' && k === 'stack') setTrial({ pmra: 0, pmdec: 0 });
}

/** "Continue without it": the step is recorded as not available, never as done (MSN-6). */
function skip(): void {
  const k = step();
  if (!run || !k || run.now.state !== 'unavailable') return;
  run.did = { ...run.did, [k]: 'unavailable' };
  stepDone(run.id, k, 'unavailable');
  run.help = 0;
  run.shown = '';
  resetCounts();
  evaluate();
}

function finish(): void {
  if (!run) return;
  clearInterval(pollTimer);
  pollTimer = 0;
  const id = run.id;
  const data = { stack: run.stack, reading: sandboxState() ?? run.reading };
  run = null;
  // The success card takes the sandbox card's place; the pretend planet leaves the picture.
  if (id === 'planet-x') closeSandbox();
  finished(id, data);
}

// ----- Hints -----------------------------------------------------------------------------------

function hintLabels(): string[] {
  const hints = instruction()?.hints ?? [];
  const labels: string[] = hints.map((_, i) => (i === 0 ? 'Hint' : 'Another hint'));
  if (run?.id === 'runaway' && step() === 'tap') labels.push('Look closer');
  return labels;
}

function hintText(): string {
  const hints = instruction()?.hints ?? [];
  if (!run?.help) return '';
  return hints[run.help - 1] ?? 'It is inside the dashed circle.';
}

// ----- The card --------------------------------------------------------------------------------

function onClick(e: MouseEvent): void {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
  if (!b || !run) return;
  switch (b.dataset.k) {
    case 'hint':
      return hint();
    case 'show':
      return showMe();
    case 'snap':
      setTrial(null);
      return;
    case 'continue':
      return skip();
    case 'retry':
      run.now = { state: 'waiting', reason: '' };
      return evaluate();
    case 'leave-x':
      return askLeave();
    case 'stay':
      run.asking = false;
      render();
      body.querySelector<HTMLElement>('[data-k="leave-x"]')?.focus();
      return;
    case 'picture':
      focusPicture();
      return;
    case 'check':
      // Planet X's "Press Check": the visitor asks the model about this patch.
      run.acted = true;
      openSandbox({ under: body });
      evaluate();
      return;
    case 'sandbox':
      openSandbox({ under: body });
      return;
    case 'leave':
      stopMission();
      left();
  }
}

function isField(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}

function objectLine(r: Run): string {
  const c = MISSION_COPY[r.id];
  if (c.object) return esc(c.object);
  const t = targetByKey(MISSIONS[r.id].target ?? '');
  if (!t) return '';
  const type = /\(([^)]*)\)\s*$/.exec(t.kind)?.[1];
  const ly = t.plx ? 3261.56 / t.plx : null;
  return `${esc(t.name)} · ${esc(plainKind(t.kind).toLowerCase())}${type ? ` (SIMBAD: ${esc(type)})` : ''}${
    ly && r.id === 'runaway' ? `, ${Math.round(ly)} light-years away (Gaia DR3)` : ''
  }`;
}

/** Draws the card from the run. Keeps focus on the same control when it is still there. */
export function render(): void {
  if (!run) {
    body.replaceChildren();
    return;
  }
  const r = run;
  const m = MISSIONS[r.id];
  const c = MISSION_COPY[r.id];
  const n = MISSION_IDS.indexOf(r.id) + 1;
  const now = instruction();
  const steps = (m.instructions ?? [])
    .map((s, j) => {
      const label = c.labels[s.id] ?? s.title;
      const how = r.did[s.id];
      if (how) {
        const mark = how === 'done' ? icon('check') : '–';
        const tail = how === 'unavailable' ? ' <span class="dsc-faint">(not available)</span>' : '';
        return `<li class="dsc-step done"><span class="dsc-n" aria-hidden="true">${mark}</span><span class="dsc-st">${esc(label)}${tail}<span class="dsc-sr"> ${how === 'done' ? 'done' : 'not available'}</span></span></li>`;
      }
      if (s !== now) {
        return `<li class="dsc-step next"><span class="dsc-n" aria-hidden="true">${j + 1}</span><span class="dsc-st">${esc(label)}</span></li>`;
      }
      return `<li class="dsc-step now" data-guide="mission-step" tabindex="-1" data-k="step">
        <span class="dsc-n" aria-hidden="true">${j + 1}</span>
        <div class="dsc-now">
          <p class="dsc-st">${esc(s.title)}</p>
          ${s.line ? `<p class="dsc-how">${esc(s.line)}</p>` : ''}
          ${stateLine(r)}
          ${helpBoxes(r)}
          ${r.id === 'planet-x' && s.id === 'check' ? `<button class="dsc-btn primary" data-k="check" type="button">Check</button>` : ''}
          ${r.id === 'planet-x' && s.id !== 'check' ? `<button class="dsc-btn quiet" data-k="sandbox" type="button">${icon('planet')}Show the sandbox card</button>` : ''}
        </div>
      </li>`;
    })
    .join('');
  const labels = hintLabels();
  const nextLabel = labels[r.help] ?? null;
  const total = m.steps.length;
  const did = Object.keys(r.did).length;
  const i = Math.min(index() + 1, total);
  body.dataset.simulated = String(m.simulated);
  rerender(
    body,
    `
    <div class="dsc-hd">
      <h2 class="dsc-title" tabindex="-1" data-k="title">${m.simulated ? '<span class="dsc-pill sim">Simulated</span>' : ''}${esc(c.name)}</h2>
      <span class="dsc-segs" role="progressbar" aria-label="Mission progress: step ${i} of ${total}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${did}">${m.steps
        .map((_, j) => `<span class="${j < did ? 'on' : j === did ? 'now' : ''}"></span>`)
        .join('')}</span>
      <button class="dsc-icon-btn" type="button" data-k="leave-x" data-close data-guide="mission-leave" aria-label="Leave the mission" data-tip="Leave the mission">${icon('close')}</button>
    </div>
    <p class="dsc-obj">Mission ${n} of ${MISSION_IDS.length} · ${objectLine(r)}</p>
    <div class="dsc-scroll" data-scroll>
      <ol class="dsc-steps">${steps}</ol>
    </div>
    <div class="dsc-hint-row" data-peek-end>
      ${nextLabel ? `<button class="dsc-btn" type="button" data-k="hint" data-guide="mission-hint">${icon('bulb')}${esc(nextLabel)}</button>` : ''}
      ${now && !r.shown ? `<button class="dsc-btn quiet" type="button" data-k="show" data-guide="mission-show-me">${icon('eye')}Show me</button>` : ''}
      ${r.id === 'runaway' && step() === 'tap' ? `<button class="dsc-btn quiet" type="button" data-k="picture">Go to the picture</button>` : ''}
      <span class="dsc-keys" tabindex="0" role="note" aria-label="${esc(KEYS)}" data-tip="${esc(KEYS)}">${icon('keyboard')}</span>
    </div>
    ${
      r.asking
        ? `<div class="dsc-ask" role="group" aria-label="${esc(LEAVE_ASK)}"><p>${esc(LEAVE_ASK)}</p><div class="dsc-row"><button class="dsc-btn primary" type="button" data-k="leave">Leave</button><button class="dsc-btn" type="button" data-k="stay">Stay</button></div></div>`
        : ''
    }`,
    '[data-k="step"], .dsc-title',
  );
  body.append(live);
  arrive(r);
}

/** What was on the card at the last draw: a new step slides in, a new hint rises (redesign 4). */
let drawnStep = '';
let drawnHelp = 0;
function arrive(r: Run): void {
  const key = `${r.id}|${step() ?? ''}`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  if (key !== drawnStep && drawnStep.startsWith(`${r.id}|`)) {
    body.querySelector('.dsc-step.now')?.animate(
      reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }],
      { duration: 320, easing: ease },
    );
  } else if (r.help > drawnHelp) {
    const boxes = body.querySelectorAll('.dsc-hintbox');
    boxes[boxes.length - 1]?.animate(
      reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 200, easing: ease },
    );
  }
  drawnStep = key;
  drawnHelp = r.help;
}

/** The hint box, Show me's words, and the ghost's snap button once Show me was pressed. */
function helpBoxes(r: Run): string {
  let html = '';
  if (r.help) html += `<p class="dsc-hintbox">${icon('bulb')}<span>${esc(hintText())}</span></p>`;
  if (r.shown && r.shown !== 'Show me')
    html +=
      r.id === 'ghost' && step() === 'motion'
        ? `<button class="dsc-btn" data-k="snap" type="button">${icon('path')}${esc(r.shown)}</button>`
        : `<p class="dsc-hintbox shown">${icon('eye')}<span>${esc(r.shown)}</span></p>`;
  return html;
}

function stateLine(r: Run): string {
  if (r.note) return `<p class="dsc-state miss" role="status">${esc(r.note)}</p>`;
  const s = r.now;
  if (s.state === 'checking')
    return `<p class="dsc-state checking"><span class="dsc-busy" aria-hidden="true"></span>${esc(MEASURING)}</p>`;
  if (s.state === 'unavailable')
    return `<p class="dsc-state warn">Not measured: ${esc(s.reason.replace(/\.$/, ''))}.</p><button class="dsc-btn" type="button" data-k="continue" data-guide="mission-continue">Continue without it</button>`;
  // The ghost's three numbers are the frame's own readout under the picture (Along, Not shifted,
  // Opposite): the card does not repeat them (redesign: one thing, one place).
  const numbers = '';
  // The ghost's "not yet": the stack is checked again as the arrow moves, so no Try again.
  if (s.state === 'failed' && r.id === 'ghost') return `${numbers}<p class="dsc-state">${esc(s.reason)}</p>`;
  if (s.state === 'failed')
    return `<p class="dsc-state warn">That didn't work: ${esc(s.reason.replace(/\.$/, ''))}.</p><button class="dsc-btn" type="button" data-k="retry">Try again</button>`;
  return numbers;
}
