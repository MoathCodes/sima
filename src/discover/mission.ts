/**
 * The mission card and the mission as it runs (BEGINNER-AND-MOBILE.md sections 5.3 and 6).
 * Owner: lane K.
 *
 * - Opens the mission's target on its detector, Flip, 6′, **paused** on the first date.
 * - Shows the steps (done, now, next), the current step's sentence, the hint box, Hint / Another
 *   hint / Look closer and Show me, a progress bar and the keys.
 * - Reads each step's value from the page (S, the game's found event, the stack's trial result,
 *   the sandbox reading) and turns it into a check result. Lane H's `src/explore/missions.ts`
 *   owns the step ids and the result shape; when lane H's own check functions land, `check()`
 *   below is the one place that calls them.
 * - Records each step with lane H's progress (`stepDone`): `done` when it passed, `unavailable`
 *   only through "Continue without it" (MSN-6). A step never passes before its value exists.
 *
 * Planet X is a model from start to end (H3, H4): its card says "Simulated" first and nothing it
 * reads reaches results or exports (the sandbox keeps it apart, shell/sandbox.ts).
 */
import { MISSIONS, MISSION_IDS, type CheckResult, type MissionId } from '../explore/missions.ts';
import { progress, startMission, stepDone } from '../explore/progress.ts';
import { nextHint, nextHintLabel, onFound, taskDone } from '../explore/game.ts';
import { setMarks } from '../explore/closeup.ts';
import { focusPicture } from '../explore/keypick.ts';
import { S, watch } from '../viewer/state.ts';
import { pause, setEpoch } from '../viewer/playback.ts';
import { draw, onTap } from '../viewer/render.ts';
import { setFov } from '../viewer/load.ts';
import { setTrial, trialResult, type TrialResult } from '../viewer/motion.ts';
import { emit } from '../shell/bus.ts';
import { hideFrame, openPlace } from '../shell/shell.ts';
import { closeSandbox, onSandbox, openSandbox, sandboxState, type SandboxReading } from '../shell/sandbox.ts';
import { targetByKey } from '../core/targets.ts';
import { KEYS, LEAVE_ASK, MEASURING, MISSION_COPY, MISS, SHOWN, plainKind } from './copy.ts';
import { esc, icon, liveRegion, say } from './ui.ts';

/** A mission as it runs on this page. */
interface Run {
  id: MissionId;
  /** Steps recorded during this run (a replay starts empty; a resume starts with the recorded). */
  did: Map<string, 'done' | 'unavailable'>;
  /** The check result of the step now. */
  now: CheckResult;
  /** A short calm note in place of the step's state (a miss), for 3 s. */
  note: string;
  /** Help given on this step: 0 none, then Hint, Another hint, Look closer. */
  help: number;
  /** Show me was pressed on this step. */
  shown: boolean;
  /** "Leave the mission?" is asked. */
  asking: boolean;
  /** The opening setup (paused, first date, detector, view) was applied to the patch. */
  setUp: boolean;
  /** Runaway: date changes seen while on step 1. Ghost: dates seen while on step 1. */
  flips: number;
  seen: Set<number>;
  /** Ghost: the newest stack result that passed or was read. Planet X: the newest reading. */
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

/** Wires the checks. `onFinish` is called once every step is recorded; `onLeave` after Leave. Called once by index.ts. */
export function startMissions(opts: {
  onFinish: typeof finished;
  onLeave: () => void;
}): void {
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
    if (keys.has('epoch') && !keys.has('groups') && !keys.has('field') && run.setUp) {
      run.flips += 1;
      run.seen.add(S.epoch);
    }
    evaluate();
  });
  onFound(() => evaluate());
  onSandbox(() => evaluate());
  onTap(() => {
    // The game checks the tap first; a tap that did not find it gets the calm note (5.3 Missed).
    if (!run || step() !== 'tap' || taskDone()) return;
    run.note = MISS;
    say(live, MISS);
    clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => {
      if (run) run.note = '';
      render();
    }, 3000);
    render();
  });
}

/** Opens a mission: records it as in progress and opens its target, paused. */
export function openMission(id: MissionId): void {
  const recorded = progress().steps[id];
  const all = MISSIONS[id].steps.every((k) => k in recorded);
  run = {
    id,
    did: new Map(all ? [] : Object.entries(recorded)),
    now: { state: 'waiting', reason: '' },
    note: '',
    help: 0,
    shown: false,
    asking: false,
    setUp: false,
    flips: 0,
    seen: new Set(),
    stack: null,
    reading: null,
  };
  startMission(id);
  const c = MISSION_COPY[id];
  const t = targetByKey(c.target);
  if (S.target === c.target && S.field) {
    hideFrame(false);
    if (S.fov !== 6) void setFov(6);
  } else if (t) openPlace({ name: t.name, ra: t.ra, dec: t.dec, target: c.target, fov: 6 });
  evaluate();
  render();
  say(live, `${c.title}. Step ${index() + 1}: ${stepCopy().say}`);
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
  const n = hintLabels().length;
  if (run.help >= n) return;
  run.help += 1;
  // The game draws Look closer's circle (its third help) for the runaway; keep it in step.
  if (run.id === 'runaway') while (gameHelp() < run.help && nextHintLabel()) nextHint();
  const text = hintText();
  render();
  say(live, text);
}

/** Show me: rings the answer (the runaway) or offers the catalogue motion (the ghost). Never passes a step (MSN-7). */
export function showMe(): void {
  if (!run) return;
  run.shown = true;
  if (run.id === 'runaway') while (nextHintLabel()) nextHint();
  render();
  say(live, run.id === 'runaway' ? SHOWN : 'The catalogue motion is one press away.');
}

/** Escape, ✕ or the view switch on the card: asks first; a second press keeps the mission. */
export function askLeave(): void {
  if (!run) return;
  run.asking = !run.asking;
  render();
  body.querySelector<HTMLElement>(run.asking ? '[data-k="stay"]' : '[data-k="leave"]')?.focus();
}

// ----- The checks ------------------------------------------------------------------------------

function index(): number {
  if (!run) return 0;
  const steps = MISSIONS[run.id].steps;
  const i = steps.findIndex((k) => !run!.did.has(k));
  return i < 0 ? steps.length : i;
}

function step(): string | null {
  return run ? (MISSIONS[run.id].steps[index()] ?? null) : null;
}

function stepCopy(k = step()): { say: string; how: string; done?: string } {
  const c = run ? MISSION_COPY[run.id] : null;
  return (k && c?.steps[k]) || { say: k ?? '', how: '' };
}

/** True when the mission's patch is on screen with real pictures. */
function ready(): boolean {
  if (!run) return false;
  const c = MISSION_COPY[run.id];
  return S.target === c.target && !!S.field && S.groups.length > 0 && S.source === 'real';
}

/** The opening setup, once the patch is on screen: paused, first date, Flip, its detector. */
function setUp(): void {
  if (!run || run.setUp || !ready()) return;
  const c = MISSION_COPY[run.id];
  run.setUp = true;
  pause();
  if (S.det !== c.det) emit('band', { det: c.det });
  if (S.mode !== 'flip' && index() === 0) S.mode = 'flip';
  setEpoch(0);
  if (run.id === 'ghost') {
    // "Where the catalogue says it is": the game's dashed circle (closeup.ts).
    setMarks('circle');
    draw();
  }
  if (run.id === 'planet-x') openSandbox({ under: body });
  run.flips = 0;
  run.seen = new Set([S.epoch]);
}

/** What the step on screen says now (section 6), from the value on the page. */
function check(k: string): CheckResult {
  const wait: CheckResult = { state: 'waiting', reason: '' };
  if (!run || !ready()) return wait;
  if (run.id === 'runaway') {
    if (k === 'play') return run.flips >= 3 ? { state: 'done', reason: '' } : wait;
    if (k === 'tap') return taskDone() ? { state: 'done', reason: '' } : wait;
  }
  if (run.id === 'ghost') {
    if (k === 'play') {
      const n = S.groups.length;
      return n >= 2 && run.seen.size >= n ? { state: 'done', reason: '' } : wait;
    }
    if (k === 'stack') return S.mode === 'stack' ? { state: 'done', reason: '' } : wait;
    if (k === 'motion') {
      if (S.mode !== 'stack') return wait;
      if (S.groups.length < 2) return { state: 'unavailable', reason: 'there are too few pictures in this colour band to add up' };
      const r = trialResult();
      if (!r) return { state: 'checking', reason: '' };
      run.stack = r;
      const a = r.result.along.snr;
      const [still, opp] = r.result.controls;
      if (!Number.isFinite(a)) return { state: 'unavailable', reason: 'the stack could not be measured at its position' };
      // The stack's own "moves with" rule (core/stack.ts): 5× the noise and 2 more than each check.
      const beats = a >= 5 && a >= (still.snr || 0) + 2 && a >= (opp.snr || 0) + 2;
      return beats ? { state: 'done', reason: '' } : wait;
    }
  }
  if (run.id === 'planet-x') {
    const r = sandboxState();
    run.reading = r;
    if (!r) return k === 'check' ? wait : { state: 'checking', reason: '' };
    if (r.verdict.kind === 'unknown') return { state: 'unavailable', reason: 'this patch has no measured noise to compare with' };
    if (k === 'check') return { state: 'done', reason: '' };
    if (k === 'closer') return r.verdict.kind === 'one' ? { state: 'done', reason: '' } : wait;
    if (k === 'bigger') return r.verdict.kind === 'one' && r.planet.distance >= 500 ? { state: 'done', reason: '' } : wait;
  }
  return wait;
}

/** Runs the check for the step now; records a pass and moves on (several in a row if they pass). */
function evaluate(): void {
  if (!run) return;
  setUp();
  const before = index();
  for (let guard = 0; guard < 6; guard += 1) {
    const k = step();
    if (!k) break;
    const r = check(k);
    run.now = r;
    if (r.state !== 'done') break;
    pass(k);
  }
  if (!step()) {
    finish();
    return;
  }
  // The ghost's motion step reads a stack made off the page's thread: look again while it is open.
  const poll = run.id === 'ghost' && step() === 'motion';
  if (poll && !pollTimer) pollTimer = window.setInterval(evaluate, 400);
  if (!poll && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = 0;
  }
  if (index() !== before) {
    say(live, `Step ${index() + 1}: ${stepCopy().say}`);
  }
  render();
}

function pass(k: string): void {
  if (!run) return;
  const c = stepCopy(k);
  run.did.set(k, 'done');
  stepDone(run.id, k, 'done');
  run.help = 0;
  run.shown = false;
  run.note = '';
  if (c.done) say(live, c.done);
  // The ghost: the arrow starts at no motion, so the stack is "not shifted" (6.2 step 2).
  if (run.id === 'ghost' && k === 'stack') setTrial({ pmra: 0, pmdec: 0 });
}

/** "Continue without it": the step is recorded as not available, never as done (MSN-6). */
function skip(): void {
  const k = step();
  if (!run || !k || run.now.state !== 'unavailable') return;
  run.did.set(k, 'unavailable');
  stepDone(run.id, k, 'unavailable');
  run.help = 0;
  run.shown = false;
  evaluate();
}

function finish(): void {
  if (!run) return;
  clearInterval(pollTimer);
  pollTimer = 0;
  const id = run.id;
  const data = { stack: run.stack, reading: run.reading ?? sandboxState() };
  run = null;
  finished(id, data);
}

// ----- Hints -----------------------------------------------------------------------------------

function hintLabels(): string[] {
  if (!run) return [];
  if (run.id === 'runaway') return ['Hint', 'Another hint', 'Look closer'];
  return ['Hint', 'Another hint'];
}

function gameHelp(): number {
  const label = nextHintLabel();
  return label === null ? 4 : ['Hint', 'Another hint', 'Look closer', 'Show me'].indexOf(label);
}

function hintText(): string {
  if (!run || !run.help) return '';
  const c = MISSION_COPY[run.id];
  if (run.help <= 2) return c.hints[run.help - 1]!;
  return 'It is inside the dashed circle.';
}

function canShowMe(): boolean {
  const k = step();
  return !!run && ((run.id === 'runaway' && k === 'tap') || (run.id === 'ghost' && k === 'motion'));
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

/** Draws the card from the run. Keeps focus on the same control when it is still there. */
export function render(): void {
  if (!run) {
    body.replaceChildren();
    return;
  }
  const active = document.activeElement instanceof HTMLElement && body.contains(document.activeElement)
    ? document.activeElement.dataset.k ?? null
    : null;
  const r = run;
  const m = MISSIONS[r.id];
  const c = MISSION_COPY[r.id];
  const n = MISSION_IDS.indexOf(r.id) + 1;
  const i = index();
  const t = targetByKey(c.target);
  const ly = t?.plx ? 3261.56 / t.plx : null;
  const obj = r.id === 'planet-x'
    ? esc(c.object)
    : `${esc(t?.name ?? c.object)}${t ? ` · ${esc(plainKind(t.kind).toLowerCase())} (SIMBAD: ${esc(spectral(t.kind))})` : ''}${
        ly && r.id === 'runaway' ? `, ${Math.round(ly)} light-years away (Gaia DR3)` : ''
      }`;
  const steps = m.steps
    .map((k, j) => {
      const sc = stepCopy(k);
      const how = r.did.get(k);
      if (how) {
        const mark = how === 'done' ? icon('check') : '–';
        const tail = how === 'unavailable' ? ' <span class="dsc-faint">(not available)</span>' : '';
        return `<li class="dsc-step done"><span class="dsc-n" aria-hidden="true">${mark}</span><span class="dsc-st">${esc(short(sc.say))}${tail}<span class="dsc-sr"> ${how === 'done' ? 'done' : 'not available'}</span></span></li>`;
      }
      if (j !== i) {
        return `<li class="dsc-step next"><span class="dsc-n" aria-hidden="true">${j + 1}</span><span class="dsc-st">${esc(short(sc.say))}</span></li>`;
      }
      return `<li class="dsc-step now" data-guide="mission-step" tabindex="-1" data-k="step">
        <span class="dsc-n" aria-hidden="true">${j + 1}</span>
        <div class="dsc-now">
          <p class="dsc-st">${esc(sc.say)}</p>
          ${sc.how ? `<p class="dsc-how">${esc(sc.how)}</p>` : ''}
          ${stateLine(r)}
          ${r.help ? `<p class="dsc-hintbox">${icon('bulb')}<span>${esc(hintText())}</span></p>` : ''}
          ${r.shown && r.id === 'runaway' ? `<p class="dsc-hintbox shown">${icon('eye')}<span>${esc(SHOWN)}</span></p>` : ''}
          ${r.shown && r.id === 'ghost' ? `<button class="dsc-btn" data-k="snap" type="button">${icon('path')}Snap to the catalogue motion</button>` : ''}
          ${r.id === 'planet-x' ? `<button class="dsc-btn quiet" data-k="sandbox" type="button">${icon('planet')}Show the sandbox card</button>` : ''}
        </div>
      </li>`;
    })
    .join('');
  const labels = hintLabels();
  const nextLabel = labels[r.help] ?? null;
  const pct = Math.round((r.did.size / m.steps.length) * 100);
  body.dataset.simulated = String(m.simulated);
  body.innerHTML = `
    <div class="dsc-hd">
      <p class="dsc-eyebrow">Mission ${n} of ${MISSION_IDS.length} · Skill: ${esc(m.skill)} · about ${c.minutes} minute${c.minutes > 1 ? 's' : ''}</p>
      <button class="dsc-icon-btn" type="button" data-k="leave-x" data-close data-guide="mission-leave" aria-label="Leave the mission" data-tip="Leave the mission">${icon('close')}</button>
    </div>
    <h2 class="dsc-title" tabindex="-1">${m.simulated ? '<span class="dsc-pill sim">Simulated</span> ' : ''}${esc(c.title)}</h2>
    <p class="dsc-obj">${obj}</p>
    <div class="dsc-scroll" data-scroll>
      <ol class="dsc-steps">${steps}</ol>
    </div>
    <div class="dsc-hint-row">
      ${nextLabel ? `<button class="dsc-btn" type="button" data-k="hint" data-guide="mission-hint">${icon('bulb')}${esc(nextLabel)}</button>` : ''}
      ${canShowMe() && !r.shown ? `<button class="dsc-btn quiet" type="button" data-k="show" data-guide="mission-show-me">${icon('eye')}Show me</button>` : ''}
      ${r.id === 'runaway' && step() === 'tap' ? `<button class="dsc-btn quiet" type="button" data-k="picture">Go to the picture</button>` : ''}
    </div>
    <div class="dsc-bar" role="progressbar" aria-label="Mission progress" aria-valuemin="0" aria-valuemax="${m.steps.length}" aria-valuenow="${r.did.size}"><span style="width:${pct}%"></span></div>
    <p class="dsc-keys">${esc(KEYS)}</p>
    ${
      r.asking
        ? `<div class="dsc-ask" role="group" aria-label="${esc(LEAVE_ASK)}"><p>${esc(LEAVE_ASK)}</p><div class="dsc-row"><button class="dsc-btn primary" type="button" data-k="leave">Leave</button><button class="dsc-btn" type="button" data-k="stay">Stay</button></div></div>`
        : ''
    }`;
  body.append(live);
  if (active) {
    const same = body.querySelector<HTMLElement>(`[data-k="${active}"]`);
    // Focus moves to the step only when the control that finished it is gone (section 10).
    (same ?? body.querySelector<HTMLElement>('[data-k="step"]') ?? body.querySelector<HTMLElement>('.dsc-title'))?.focus({
      preventScroll: true,
    });
  }
}

function stateLine(r: Run): string {
  if (r.note) return `<p class="dsc-state miss" role="status">${esc(r.note)}</p>`;
  const s = r.now;
  if (s.state === 'checking')
    return `<p class="dsc-state checking"><span class="dsc-busy" aria-hidden="true"></span>${esc(MEASURING)}</p>`;
  if (s.state === 'unavailable')
    return `<p class="dsc-state warn">Not measured: ${esc(s.reason)}.</p><button class="dsc-btn" type="button" data-k="continue" data-guide="mission-continue">Continue without it</button>`;
  if (s.state === 'failed')
    return `<p class="dsc-state warn">That didn't work: ${esc(s.reason)}.</p><button class="dsc-btn" type="button" data-k="retry">Try again</button>`;
  if (r.id === 'ghost' && step() === 'motion' && r.stack) {
    const a = r.stack.result.along.snr;
    const [still, opp] = r.stack.result.controls;
    return `<p class="dsc-state">Along the arrow: ${times(a)} · not shifted: ${times(still.snr)} · opposite: ${times(opp.snr)}</p>`;
  }
  return '';
}

function times(x: number): string {
  return Number.isFinite(x) ? `${x.toFixed(1)}× the noise` : 'not measured';
}

/** The step's first sentence, for the done and next rows. */
function short(s: string): string {
  return s.replace(/^Simulated: /, '').replace(/\.$/, '');
}

/** The spectral type inside the shipped kind ("Red dwarf (M4V)" → "M4V"). */
function spectral(kind: string): string {
  return /\(([^)]*)\)\s*$/.exec(kind)?.[1] ?? kind;
}
