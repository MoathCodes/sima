/**
 * The success card (BEGINNER-AND-MOBILE.md sections 5.4 and 6). Owner: lane K.
 *
 * Every number is filled from a value measured on this page, beside the catalogue value on its own
 * line, with a sources line (H4). A value that could not be measured says "Not measured" and why
 * (H5); the mission still completes. Planet X says "Simulated" first, tags its numbers "Model"
 * and says "Nothing here was observed" (H3).
 */
import { MISSIONS, MISSION_IDS, type MissionId } from '../explore/missions.ts';
import { progress } from '../explore/progress.ts';
import { fitMotion } from '../core/fit.ts';
import type { MotionFit } from '../core/types.ts';
import { targetByKey } from '../core/targets.ts';
import { BAND_EDGES } from '../core/instrument.ts';
import { S } from '../viewer/state.ts';
import { targetMeasurements } from '../viewer/load.ts';
import type { TrialResult } from '../viewer/motion.ts';
import type { MissionInputs } from '../explore/missions.ts';
import { MEASURING, MISSION_COPY } from './copy.ts';
import { ghostLines, planetLines } from '../explore/plain.ts';
import { planetEdges } from '../explore/plan-x.ts';
import { esc, icon, liveRegion, rerender, say } from './ui.ts';
import { t as tr } from '../shell/i18n.ts';

/** What the mission left for its result. */
export interface Outcome {
  id: MissionId;
  stack: TrialResult | null;
  reading: MissionInputs['sandbox'];
}

const body = document.createElement('div');
const live = liveRegion();
let outcome: Outcome | null = null;
/** The runaway's fit: undefined while measuring. */
let fit: MotionFit | { ok: false; reason: string } | undefined;
let token = 0;

/** The card's element (placed by index.ts in `#mission-success` or the sheet). */
export function successBody(): HTMLElement {
  return body;
}

/** The mission the card shows, or null. */
export function successFor(): MissionId | null {
  return outcome?.id ?? null;
}

/** Shows the result of a finished mission. */
export function showSuccess(o: Outcome): void {
  outcome = o;
  fit = undefined;
  const mine = ++token;
  body.className = 'dsc-card dsc-success';
  body.dataset.material = 'raised';
  if (o.id === 'runaway') {
    // The answer's view: Two dates, red then cyan (5.4).
    if (S.mode === 'flip') S.mode = 'two';
    const pending = targetMeasurements();
    if (!pending) fit = { ok: false, reason: 'this patch has no real pictures to measure' };
    else
      void pending
        .then((ms) => fitMotion(ms, S.field?.target ?? null))
        .catch(() => ({ ok: false as const, reason: 'the measurement could not run on this page' }))
        .then((f) => {
          if (mine !== token) return;
          fit = f;
          render();
          say(live, resultWords());
        });
  }
  render();
  say(live, `${MISSIONS[o.id].heading ?? ''} ${resultWords()}`);
}

/** Clears the card. */
export function clearSuccess(): void {
  outcome = null;
  token += 1;
  body.replaceChildren();
}

/** The next mission to suggest: the first not learned, after this one in the list order. */
export function nextMission(after: MissionId | null): MissionId | null {
  const learned = progress().learned;
  const order = after ? [...MISSION_IDS.slice(MISSION_IDS.indexOf(after) + 1), ...MISSION_IDS] : MISSION_IDS;
  return order.find((id) => id !== after && !learned.includes(id)) ?? null;
}

function render(): void {
  const o = outcome;
  if (!o) return;
  const m = MISSIONS[o.id];
  const n = MISSION_IDS.indexOf(o.id) + 1;
  const next = nextMission(o.id);
  body.dataset.simulated = String(m.simulated);
  rerender(body, `
    <div class="dsc-hd">
      <p class="dsc-pill ${m.simulated ? 'sim' : 'done'}">${m.simulated ? `${tr('honest.simulated')} · ` : icon('check')}${tr('ds.complete', { n })}</p>
      <button class="dsc-icon-btn" type="button" data-k="close" data-close aria-label="${tr('ds.back')}" data-tip="${tr('ds.back')}">${icon('close')}</button>
    </div>
    <h2 class="dsc-title" tabindex="-1" data-k="title">${esc(m.heading ?? '')}</h2>
    <div class="dsc-scroll" data-scroll>
      <div class="dsc-result${m.simulated ? ' sim' : ''}">${result(o)}</div>
      ${
        m.simulated
          ? ''
          : `<button class="dsc-link" type="button" data-k="expert" data-guide="success-expert">${icon('chart')}${tr('ds.how')}</button>`
      }
      <p class="dsc-skill">${icon('check')}<span><b>${tr('ds.skill', { skill: esc(m.skill) })}</b> ${esc(m.lesson ?? '')}</span></p>
      ${o.id === 'runaway' ? `<button class="dsc-btn" type="button" data-k="object" data-object="rw-aur" data-guide="object-rw-aur">${icon('arrow-right')}${tr('ds.tryRw')}</button>` : ''}
    </div>
    <div class="dsc-actions">
      ${
        next
          ? `<button class="dsc-btn primary lg" type="button" data-k="next" data-next="${next}" data-guide="success-next">${tr('ds.next', { name: esc(MISSION_COPY[next].name) })}${icon('arrow-right')}</button>`
          : `<button class="dsc-btn primary lg" type="button" data-k="close" data-guide="success-next">${tr('ds.back')}</button>`
      }
    </div>`, '.dsc-title');
  body.append(live);
}

function result(o: Outcome): string {
  if (o.id === 'runaway') return runaway();
  if (o.id === 'ghost') return ghost(o.stack);
  return planetX(o.reading);
}

function runaway(): string {
  const t = targetByKey('barnard');
  const catTotal = fit && fit.ok !== false && 'catalogue' in fit && fit.catalogue
    ? fit.catalogue.total
    : t ? Math.hypot(t.pmra, t.pmdec) / 1000 : Number.NaN;
  const cat = Number.isFinite(catTotal)
    ? `<p class="dsc-cat"><b>${tr('ds.perYear', { v: `${catTotal.toFixed(2)}″` })}</b> · ${tr('ds.gaia')}</p>`
    : '';
  const tail = `<p class="dsc-fine">${tr('ds.arcsec')}</p>`;
  if (fit === undefined)
    return `<p class="dsc-label">${tr('ds.measuredBy')}</p><p class="dsc-big checking"><span class="dsc-busy" aria-hidden="true"></span>${esc(MEASURING)}</p>${cat}${tail}`;
  if (!fit.ok)
    return `<p class="dsc-label">${tr('ds.measuredBy')}</p><p class="dsc-big not">${tr('honest.notMeasuredWhy', { reason: esc(fit.reason ?? tr('ds.noMotion')) })}.</p>${
      Number.isFinite(catTotal) ? `<p class="dsc-cat"><b>${tr('ds.catValue', { v: `${catTotal.toFixed(2)}″` })}</b> · ${tr('ds.gaia')}</p>` : ''
    }${tail}<p class="dsc-src">${tr('ds.catSrc')}</p>`;
  const f = fit as MotionFit;
  const pill =
    f.matches === true
      ? `<span class="dsc-pill good">${tr('ds.matches')}</span>`
      : f.matches === false
        ? `<span class="dsc-pill warn">${tr('ds.differs')}</span>`
        : '';
  return `<p class="dsc-label">${tr('ds.measuredFrom', { used: f.used, of: f.of })}</p>
    <p class="dsc-big" data-guide="success-value">${tr('ds.perYear', { v: `${f.total.toFixed(2)} ± ${f.totalErr.toFixed(2)}″` })}</p>
    ${cat}${pill ? `<p>${pill}</p>` : ''}${tail}
    <p class="dsc-src">${tr('ds.fromPixels')} · ${tr('ds.catSrc')}</p>`;
}

function ghost(r: TrialResult | null): string {
  const t = targetByKey('wise-0855');
  const type = t ? (/\(([^)]*)\)\s*$/.exec(t.kind)?.[1] ?? null) : null;
  const d = r?.result.det ?? 5;
  const lam = `${BAND_EDGES[d - 1]!.toFixed(2)}–${BAND_EDGES[d]!.toFixed(2)}`;
  // Lane H's sentences (explore/plain.ts), filled from the stack that passed the check.
  const l = ghostLines(r?.result ?? null, lam, type, 'no stack was finished.');
  const a = r?.result.along.snr ?? Number.NaN;
  if (!r || !Number.isFinite(a))
    return `<p class="dsc-big not">${esc(l.measured)}</p><p class="dsc-fine">${esc(l.type)}</p>`;
  const how = r.atCatalogue
    ? tr('hl.alongCat')
    : tr('ds.alongArrow', { v: `${(Math.hypot(r.motion.pmra, r.motion.pmdec) / 1000).toFixed(1)}″` });
  return `<p class="dsc-label">${tr('ds.measuredHow', { how: esc(how) })}</p>
    <p class="dsc-big" data-guide="success-value">${tr('ds.timesNoise', { v: `${a.toFixed(1)}×` })}</p>
    <p class="dsc-cat">${esc(l.measured)}</p>
    <p class="dsc-cat">${esc(l.controls)}</p>
    ${l.notDetected ? `<p class="dsc-cat">${esc(l.notDetected)}</p>` : ''}
    <p class="dsc-fine">${esc(l.type)}</p>
    <p class="dsc-src">${esc(l.sources)}</p>`;
}

function planetX(r: MissionInputs['sandbox']): string {
  const none = `<p class="dsc-big not">${tr('ds.notWorked')}</p>`;
  const observed = `<p class="dsc-cat"><b>${tr('ds.nothingObserved')}</b></p>`;
  if (!r || r.verdict.kind === 'unknown') return `${none}${observed}`;
  const p = r.planet;
  const say =
    r.verdict.kind === 'one'
      ? tr('ds.one')
      : r.verdict.kind === 'stack'
        ? tr('ds.stackOnly')
        : tr('ds.wouldNot');
  return `<p class="dsc-label">${tr('ds.modelSim')}</p>
    <p class="dsc-cat">${tr('ds.byModel', { d: `<b>${Math.round(p.distance)} AU</b>`, r: `<b>${tr('ds.timesEarth', { v: p.radius.toFixed(1) })}</b>`, say })}.</p>
    ${edgeLines(r.noises)}
    ${observed}
    <p class="dsc-src">${tr('ds.pxSrc')}</p>`;
}

/** Lane H's edges: how far a Neptune-sized planet would show, and how big one at 500 AU must be. */
function edgeLines(noises: Parameters<typeof planetEdges>[0] | undefined): string {
  if (!noises?.length) return '';
  const l = planetLines(planetEdges(noises));
  return [l.distance, l.radius]
    .filter(Boolean)
    .map((t) => `<p class="dsc-fine">${esc(t)}</p>`)
    .join('');
}

/** The result in one sentence, for the live region. */
function resultWords(): string {
  const o = outcome;
  if (!o || o.id !== 'runaway') return '';
  if (fit === undefined) return MEASURING;
  if (!fit.ok) return `${tr('honest.notMeasuredWhy', { reason: fit.reason ?? '' })}.`;
  const f = fit as MotionFit;
  return tr('ds.words', { v: `${f.total.toFixed(2)} ± ${f.totalErr.toFixed(2)}`, used: f.used, of: f.of });
}
