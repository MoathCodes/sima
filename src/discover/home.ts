/**
 * Discover's home and its two small screens (BEGINNER-AND-MOBILE.md sections 5.1, 5.2 and 5.5).
 * Owner: lane K.
 *
 * - The welcome card (first visit, after the intro): the first mission, "Look around first",
 *   "Show me every number", and the fine print. It does not say "every picture is real" (H3).
 * - The mission list: three missions with their states (done, suggested next, not started, in
 *   progress), the skills record ("learned ✓", nothing locked: B-4), "Try another object" and the
 *   Expert view link. On phones it is the sheet at half with the next mission first.
 * - The object card for "Try another object": ungraded, with what to look for and the way to
 *   Expert. Its counts are taken from the pictures shown, never typed (H9).
 */
import { MISSIONS, MISSION_IDS, OBJECTS, objectLine, type MissionId } from '../explore/missions.ts';
import { progress } from '../explore/progress.ts';
import { targetByKey } from '../core/targets.ts';
import { S } from '../viewer/state.ts';
import { MISSION_COPY, WELCOME, bandWords, plainKind } from './copy.ts';
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

/** Fills the welcome card. */
export function renderWelcome(el: HTMLElement): void {
  el.className = 'dsc-card dsc-welcome';
  el.dataset.material = 'raised';
  el.innerHTML = `
    <p class="dsc-wm" aria-hidden="true"><span class="ar" lang="ar">سيما</span><span class="la">Sima</span></p>
    <h2 class="dsc-title" tabindex="-1" data-k="title">${esc(WELCOME.heading)}</h2>
    <p class="dsc-lead">${esc(WELCOME.body)}</p>
    <button class="dsc-btn primary dsc-start" type="button" data-k="start" data-guide="mission-start">
      <span><span class="s1">${esc(WELCOME.start)}</span><span class="s2">${esc(WELCOME.startLine)}</span></span>${icon('arrow-right')}
    </button>
    <div class="dsc-row2">
      <button class="dsc-btn" type="button" data-k="look" data-close data-guide="welcome-own">${esc(WELCOME.look)}</button>
      <button class="dsc-btn" type="button" data-k="expert" data-guide="welcome-expert">${icon('chart')}${esc(WELCOME.expert)}</button>
    </div>
    <p class="dsc-fine">${esc(WELCOME.fine)}</p>`;
}

// ----- The mission list ------------------------------------------------------------------------

/** The skills record: "✓ Blink · Stack · What-if", heard as "Blink, learned. Stack, not yet." */
function skills(): string {
  const learned = progress().learned;
  const heard = MISSION_IDS.map((id) => `${MISSIONS[id].skill}, ${learned.includes(id) ? 'learned' : 'not yet'}.`).join(' ');
  const shown = MISSION_IDS.map((id) =>
    learned.includes(id)
      ? `<span class="on">${icon('check')}${esc(MISSIONS[id].skill)}</span>`
      : `<span>${esc(MISSIONS[id].skill)}</span>`,
  ).join('');
  return `<p class="dsc-skills" data-guide="skills-record"><span class="dsc-sr">Skills: ${esc(heard)}</span><span class="dsc-skills-row" aria-hidden="true">${shown}</span></p>`;
}

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
      side: `<span class="dsc-state-tag">Step ${k} of ${steps.length}</span><span class="dsc-go" aria-hidden="true">${icon('play')}</span>`,
      words: `in progress, step ${k} of ${steps.length}`,
    };
  }
  if (id === suggested)
    return { cls: 'next', side: `<span class="dsc-go" aria-hidden="true">${icon('play')}</span>`, words: 'suggested next' };
  return { cls: '', side: `<span class="dsc-go" aria-hidden="true">${icon('play')}</span>`, words: 'not started' };
}

function missionRow(id: MissionId, suggested: MissionId | null): string {
  const m = MISSIONS[id];
  const c = MISSION_COPY[id];
  const s = rowState(id, suggested);
  const meta = `${m.simulated ? '<span class="dsc-pill sim">Simulated</span>' : ''}<span>Skill: ${esc(m.skill)} · ${c.minutes} min</span>`;
  return `<li><button class="dsc-m ${s.cls}" type="button" data-mission="${id}" data-guide="mission-${id}"
      aria-label="${esc(`${m.simulated ? 'Simulated: ' : ''}${c.name}. ${c.line}. Skill: ${m.skill}, about ${c.minutes} minute${c.minutes > 1 ? 's' : ''}. ${s.words}.`)}">
    <span class="dsc-node" aria-hidden="true">${icon(NODE_ICON[id])}</span>
    <span class="dsc-mt"><span class="t">${esc(c.name)}</span>${s.cls.includes('done') ? '' : `<span class="d">${esc(c.line)}</span>`}<span class="k">${meta}</span></span>
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

/** Fills the mission list. `phone` puts the suggested mission first, with Start mission (5.2). */
export function renderList(el: HTMLElement, phone: boolean): void {
  const p = progress();
  const suggested = nextMission(null);
  const done = p.learned.length;
  el.className = `dsc-card dsc-list${phone ? ' phone' : ''}`;
  el.dataset.material = 'regular';
  const foot = `<p class="dsc-foot">${icon('chart')}<span>Want every number now?</span> <button class="dsc-link" type="button" data-k="expert" data-guide="list-expert">Expert view</button></p>`;
  if (phone && suggested) {
    const c = MISSION_COPY[suggested];
    const m = MISSIONS[suggested];
    const n = MISSION_IDS.indexOf(suggested) + 1;
    el.innerHTML = `
      <div class="dsc-list-hd"><h2 class="dsc-h" tabindex="-1" data-k="title">Suggested next · Mission ${n} of ${MISSION_IDS.length}</h2><span class="dsc-faint">${done} of ${MISSION_IDS.length} done</span></div>
      <div class="dsc-suggest">
        <p class="t">${m.simulated ? '<span class="dsc-pill sim">Simulated</span> ' : ''}${esc(c.name)}</p>
        <p class="d">${esc(c.line)} · ${c.minutes} min</p>
        <button class="dsc-btn primary lg" type="button" data-mission="${suggested}" data-guide="mission-start">Start mission${icon('arrow-right')}</button>
      </div>
      ${skills()}
      <h3 class="dsc-sub">Other missions and objects</h3>
      <ul class="dsc-mlist">${MISSION_IDS.filter((id) => id !== suggested).map((id) => missionRow(id, null)).join('')}</ul>
      <ul class="dsc-olist">${objectRows()}</ul>
      ${foot}`;
    return;
  }
  el.innerHTML = `
    <div class="dsc-list-hd"><h2 class="dsc-h" tabindex="-1" data-k="title">Missions</h2><span class="dsc-faint">${done} of ${MISSION_IDS.length} done</span></div>
    ${skills()}
    <div class="dsc-scroll" data-scroll>
      <ul class="dsc-mlist">${MISSION_IDS.map((id) => missionRow(id, suggested)).join('')}</ul>
      <div class="dsc-sub-hd"><h3 class="dsc-sub">Try another object</h3><span class="dsc-faint">no mission, real pictures</span></div>
      <ul class="dsc-olist">${objectRows()}</ul>
    </div>
    ${foot}`;
}

// ----- The object card -------------------------------------------------------------------------

/** Fills the card for "Try another object". Counts come from the pictures on screen (lane H's line). */
export function renderObject(el: HTMLElement, key: string): void {
  const o = OBJECTS.find((x) => x.target === key);
  const t = targetByKey(key);
  if (!o || !t) return;
  el.className = 'dsc-card dsc-object';
  el.dataset.material = 'raised';
  const field = S.target === key && S.source === 'real' ? S.field : null;
  const line = field ? objectLine(key, field, `${plainKind(t.kind)} (SIMBAD)`) : `${plainKind(t.kind)} (SIMBAD).`;
  const band = field ? `<p class="dsc-fine">Shown in ${bandWords(S.det)} light (D${S.det}).</p>` : '';
  el.innerHTML = `
    <div class="dsc-hd">
      <p class="dsc-eyebrow">Try another object · no mission</p>
      <button class="dsc-icon-btn" type="button" data-k="close" data-close aria-label="Back to the missions" data-tip="Back to the missions">${icon('close')}</button>
    </div>
    <h2 class="dsc-title" tabindex="-1" data-k="title">${esc(o.title)}</h2>
    <p class="dsc-obj">${esc(line)}</p>
    <p class="dsc-lead">${esc(o.look)}</p>
    ${band}
    <div class="dsc-actions">
      <button class="dsc-btn" type="button" data-k="object-expert" data-guide="object-expert">${icon('chart')}See the numbers in Expert</button>
    </div>`;
}
