/**
 * Discover's home and its two small screens (BEGINNER-AND-MOBILE.md sections 5.1, 5.2 and 5.5).
 * Owner: lane K.
 *
 * - The welcome card (first visit, after the intro): one heading, one line, the first mission and
 *   "Look around first". It does not say "every picture is real" (H3). Expert is the switch in
 *   the top row, so the card does not offer it again (redesign: one thing, one place).
 * - The mission list: three missions with their states (done, suggested next, not started, in
 *   progress; nothing locked: B-4) and "Try another object". One line under each name.
 *   On phones the next mission comes first, as the sheet's peek: its name and **Start**.
 * - On phones, the card for what the frame shows when no mission runs (an object, a found
 *   place): its name, its kind, what to try, and ✕ back to the globe.
 */
import { MISSIONS, MISSION_IDS, OBJECTS, type MissionId } from '../explore/missions.ts';
import { S } from '../viewer/state.ts';
import { progress } from '../explore/progress.ts';
import { targetByKey } from '../core/targets.ts';
import { MISSION_COPY, WELCOME, plainKind } from './copy.ts';
import { esc, icon } from './ui.ts';
import { nextMission } from './success.ts';

const NODE_ICON: Record<MissionId, Parameters<typeof icon>[0]> = {
  runaway: 'flip',
  ghost: 'stack',
  'planet-x': 'planet',
};
const OBJECT_ICON: Record<string, Parameters<typeof icon>[0]> = {
  'r-dra': 'star',
  'eps-indi-b': 'wave',
  'rw-aur': 'flip',
};

// ----- The welcome card ------------------------------------------------------------------------

/** Fills the welcome card. On a phone its peek is the heading and Start (the sheet, 11.6). */
export function renderWelcome(el: HTMLElement): void {
  el.className = 'dsc-card dsc-welcome';
  el.dataset.material = 'raised';
  el.innerHTML = `
    <p class="dsc-wm" aria-hidden="true"><span class="ar" lang="ar">سيما</span><span class="la">Sima</span></p>
    <h2 class="dsc-title" tabindex="-1" data-k="title">${esc(WELCOME.heading)}</h2>
    <p class="dsc-lead">${esc(WELCOME.body)}</p>
    <button class="dsc-btn primary dsc-start" type="button" data-k="start" data-guide="mission-start" data-peek-end>
      <span><span class="s1">${esc(WELCOME.start)}</span><span class="s2">${esc(WELCOME.startLine)}</span></span>${icon('arrow-right')}
    </button>
    <button class="dsc-btn quiet dsc-look" type="button" data-k="look" data-close data-guide="discover-look">${esc(WELCOME.look)}</button>`;
}

// ----- The mission list ------------------------------------------------------------------------

/** A mission row's state: done, in progress (step k of n), suggested next, or not started. */
function rowState(id: MissionId, suggested: MissionId | null): { cls: string; side: string; words: string } {
  const p = progress();
  const steps = MISSIONS[id].steps;
  const recorded = steps.filter((k) => k in p.steps[id]).length;
  if (p.learned.includes(id))
    return { cls: 'done', side: `<span class="dsc-state-tag">${icon('check')}Done</span>`, words: 'done' };
  if (p.current === id || recorded > 0) {
    const k = Math.min(recorded + 1, steps.length);
    return {
      cls: id === suggested ? 'next going' : 'going',
      side: `<span class="dsc-state-tag">${k}/${steps.length}</span><span class="dsc-go" aria-hidden="true">${icon('play')}</span>`,
      words: `in progress, step ${k} of ${steps.length}`,
    };
  }
  if (id === suggested)
    return { cls: 'next', side: `<span class="dsc-go" aria-hidden="true">${icon('play')}</span>`, words: 'suggested next' };
  return { cls: '', side: `<span class="dsc-go" aria-hidden="true">${icon('play')}</span>`, words: 'not started' };
}

/** "Simulated" first on Planet X (H3): a dashed pill before the name. */
function name(id: MissionId): string {
  return `${MISSIONS[id].simulated ? '<span class="dsc-pill sim">Simulated</span>' : ''}${esc(MISSION_COPY[id].name)}`;
}

function missionRow(id: MissionId, suggested: MissionId | null): string {
  const m = MISSIONS[id];
  const c = MISSION_COPY[id];
  const s = rowState(id, suggested);
  return `<li><button class="dsc-m ${s.cls}" type="button" data-mission="${id}" data-guide="mission-${id}"
      aria-label="${esc(`${m.simulated ? 'Simulated: ' : ''}${c.name}. ${c.line}. Skill: ${m.skill}, about ${c.minutes} minute${c.minutes > 1 ? 's' : ''}. ${s.words}.`)}">
    <span class="dsc-node" aria-hidden="true">${icon(NODE_ICON[id])}</span>
    <span class="dsc-mt"><span class="t">${name(id)}</span><span class="d">${esc(c.line)} · ${c.minutes} min</span></span>
    <span class="dsc-side">${s.side}</span>
  </button></li>`;
}

function objectRows(): string {
  return OBJECTS.map((o) => {
    const t = targetByKey(o.target);
    return `<li><button class="dsc-o" type="button" data-object="${o.target}" data-guide="object-${o.target}">
      <span class="dsc-onode" aria-hidden="true">${icon(OBJECT_ICON[o.target] ?? 'star')}</span>
      <span class="dsc-mt"><span class="t">${esc(o.title)}</span>${t ? `<span class="d">${esc(plainKind(t.kind))}</span>` : ''}</span>
      <span class="dsc-go" aria-hidden="true">${icon('arrow-right')}</span>
    </button></li>`;
  }).join('');
}

/** Fills the mission list. `phone` puts the suggested mission first, as the sheet's peek (5.2). */
export function renderList(el: HTMLElement, phone: boolean): void {
  const p = progress();
  const suggested = nextMission(null);
  const done = p.learned.length;
  const count = `<span class="dsc-faint">${done} of ${MISSION_IDS.length} done</span>`;
  el.className = `dsc-card dsc-list${phone ? ' phone' : ''}`;
  el.dataset.material = 'regular';
  if (phone) {
    const n = suggested ? MISSION_IDS.indexOf(suggested) + 1 : 0;
    const peek = suggested
      ? `<div class="dsc-next" data-peek-end>
          <span class="dsc-node" aria-hidden="true">${icon(NODE_ICON[suggested])}</span>
          <span class="dsc-mt"><span class="t">${name(suggested)}</span><span class="d">Mission ${n} of ${MISSION_IDS.length} · ${MISSION_COPY[suggested].minutes} min</span></span>
          <button class="dsc-btn primary" type="button" data-mission="${suggested}" data-guide="mission-start"
            aria-label="${esc(`Start mission ${n}: ${MISSIONS[suggested].simulated ? 'Simulated: ' : ''}${MISSION_COPY[suggested].name}`)}">${icon('play')}Start</button>
        </div>`
      : `<div class="dsc-next" data-peek-end><span class="dsc-node done" aria-hidden="true">${icon('check')}</span><span class="dsc-mt"><span class="t">All missions done</span><span class="d">Try an object below</span></span></div>`;
    // Find opens the search page (shell.ts listens for [data-find]): a name or RA and Dec.
    el.innerHTML = `
      <h2 class="dsc-sr" tabindex="-1" data-k="title">Missions</h2>
      <button class="dsc-find" type="button" data-find data-guide="sheet-find">${icon('search')}<span>Star, galaxy or RA Dec</span></button>
      ${peek}
      <div class="dsc-sub-hd"><h3 class="dsc-sub">Missions</h3>${count}</div>
      <ul class="dsc-mlist">${MISSION_IDS.map((id) => missionRow(id, suggested)).join('')}</ul>
      <div class="dsc-sub-hd"><h3 class="dsc-sub">Try another object</h3></div>
      <ul class="dsc-olist">${objectRows()}</ul>`;
    return;
  }
  el.innerHTML = `
    <div class="dsc-list-hd"><h2 class="dsc-h" tabindex="-1" data-k="title">Missions</h2>${count}</div>
    <div class="dsc-scroll" data-scroll>
      <ul class="dsc-mlist">${MISSION_IDS.map((id) => missionRow(id, suggested)).join('')}</ul>
      <div class="dsc-sub-hd"><h3 class="dsc-sub">Try another object</h3></div>
      <ul class="dsc-olist">${objectRows()}</ul>
    </div>`;
}

// ----- What the frame shows, on a phone ----------------------------------------------------------

/**
 * The phone's card for the frame when no mission runs: a shipped object (its kind and what to
 * try, from lane H's OBJECTS) or any other place (its name). ✕ closes the frame.
 */
export function renderObject(el: HTMLElement): void {
  const o = OBJECTS.find((x) => x.target === S.target);
  const t = S.target ? targetByKey(S.target) : undefined;
  // What to try: the first sentence of lane H's line; the Expert half is the top row's switch.
  const tip = o ? (/^[^.?!]*[.?!](\s+[^.?!]*\?)?/.exec(o.look)?.[0] ?? o.look) : '';
  const kind = t ? plainKind(t.kind) : '';
  el.className = 'dsc-card dsc-objcard';
  // The frame's header names it already: the card says what it is and what to try (its name is
  // the heading for screen readers only).
  const name = S.label || t?.name || 'This spot';
  el.innerHTML = `
    <div class="dsc-ohd">
      <h2 class="dsc-sr" tabindex="-1" data-k="title">${esc(name)}</h2>
      <p class="dsc-kind">${esc(kind || 'A spot you chose')}</p>
      <button class="dsc-icon-btn" type="button" data-k="close-frame" data-close data-guide="object-close" aria-label="Close the pictures" data-tip="Close">${icon('close')}</button>
    </div>
    ${tip ? `<p class="dsc-tip">${icon('bulb')}<span>${esc(tip)}</span></p>` : ''}
    <span data-peek-end></span>`;
}
