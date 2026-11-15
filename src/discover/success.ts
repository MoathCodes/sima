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
import type { SandboxReading } from '../shell/sandbox.ts';
import { MEASURING, MISSION_COPY, plainKind } from './copy.ts';
import { esc, icon, liveRegion, say } from './ui.ts';

/** What the mission left for its result. */
export interface Outcome {
  id: MissionId;
  stack: TrialResult | null;
  reading: SandboxReading | null;
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
  say(live, `${MISSION_COPY[o.id].win} ${resultWords()}`);
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
  const c = MISSION_COPY[o.id];
  const n = MISSION_IDS.indexOf(o.id) + 1;
  const next = nextMission(o.id);
  body.dataset.simulated = String(m.simulated);
  body.innerHTML = `
    <div class="dsc-hd">
      <p class="dsc-pill ${m.simulated ? 'sim' : 'done'}">${m.simulated ? 'Simulated · ' : icon('check')}Mission ${n} complete</p>
      <button class="dsc-icon-btn" type="button" data-k="close" data-close aria-label="Back to the missions" data-tip="Back to the missions">${icon('close')}</button>
    </div>
    <h2 class="dsc-title" tabindex="-1">${esc(c.win)}</h2>
    <div class="dsc-scroll" data-scroll>
      <div class="dsc-result${m.simulated ? ' sim' : ''}">${result(o)}</div>
      ${
        m.simulated
          ? ''
          : `<button class="dsc-link" type="button" data-k="expert" data-guide="success-expert">${icon('chart')}How was this measured? Open Expert view</button>`
      }
      <p class="dsc-skill">${icon('check')}<span><b>Skill learned: ${esc(m.skill)}.</b> ${esc(c.skillLine)}</span></p>
    </div>
    <div class="dsc-actions">
      ${
        next
          ? `<button class="dsc-btn primary lg" type="button" data-k="next" data-next="${next}" data-guide="success-next">Next: ${esc(MISSION_COPY[next].title)}${icon('arrow-right')}</button>`
          : `<button class="dsc-btn primary lg" type="button" data-k="close" data-guide="success-next">Back to the missions</button>`
      }
      ${o.id === 'runaway' ? `<button class="dsc-btn lg" type="button" data-k="object" data-object="rw-aur" data-guide="object-rw-aur">Try Blink on RW Aurigae</button>` : ''}
    </div>`;
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
    ? `<p class="dsc-cat"><b>${catTotal.toFixed(2)}″ a year</b> · Gaia's star catalogue (ESA Gaia DR3)</p>`
    : '';
  const tail = `<p class="dsc-fine">″ is an arcsecond: 1/3600 of a degree. No known star crosses the sky faster (Wikipedia: Barnard's Star).</p>`;
  if (fit === undefined)
    return `<p class="dsc-label">Measured by Sima</p><p class="dsc-big checking"><span class="dsc-busy" aria-hidden="true"></span>${esc(MEASURING)}</p>${cat}${tail}`;
  if (!fit.ok)
    return `<p class="dsc-label">Measured by Sima</p><p class="dsc-big not">Not measured: ${esc(fit.reason ?? 'the motion could not be measured')}.</p>${
      Number.isFinite(catTotal) ? `<p class="dsc-cat"><b>Catalogue value: ${catTotal.toFixed(2)}″ a year</b> · Gaia's star catalogue (ESA Gaia DR3)</p>` : ''
    }${tail}<p class="dsc-src">Catalogue: ESA Gaia DR3</p>`;
  const f = fit as MotionFit;
  const pill =
    f.matches === true
      ? '<span class="dsc-pill good">Matches within the error</span>'
      : f.matches === false
        ? '<span class="dsc-pill warn">Differs from the catalogue</span>'
        : '';
  return `<p class="dsc-label">Measured by Sima, from ${f.used} of ${f.of} pictures</p>
    <p class="dsc-big" data-guide="success-value">${f.total.toFixed(2)} ± ${f.totalErr.toFixed(2)}″ a year</p>
    ${cat}${pill ? `<p>${pill}</p>` : ''}${tail}
    <p class="dsc-src">Measured from SPHEREx pixels · Catalogue: ESA Gaia DR3</p>`;
}

function ghost(r: TrialResult | null): string {
  const t = targetByKey('wise-0855');
  const type = t ? /\(([^)]*)\)\s*$/.exec(t.kind)?.[1] : null;
  const typeLine = type
    ? `<p class="dsc-fine">SIMBAD lists it as a ${esc(plainKind(t!.kind).toLowerCase())} of type ${esc(type)}.</p>`
    : '';
  const a = r?.result.along.snr ?? Number.NaN;
  if (!r || !Number.isFinite(a))
    return `<p class="dsc-big not">This time Sima could not make the stack: ${r ? 'it could not be measured at its position' : 'no stack was finished'}.</p>${typeLine}`;
  const [still, opp] = r.result.controls;
  const d = r.result.det;
  const lam = `${BAND_EDGES[d - 1]!.toFixed(2)}–${BAND_EDGES[d]!.toFixed(2)}`;
  const how = r.atCatalogue
    ? 'along the catalogue motion'
    : `along your arrow (${(Math.hypot(r.motion.pmra, r.motion.pmdec) / 1000).toFixed(1)}″ a year)`;
  return `<p class="dsc-label">Measured by Sima, ${esc(how)}</p>
    <p class="dsc-big" data-guide="success-value">${a.toFixed(1)}× the noise</p>
    <p class="dsc-cat">Added along its path, ${r.result.frames} pictures show it at ${a.toFixed(1)}× the noise, in ${lam} µm light (D${d}).</p>
    <p class="dsc-cat">Not shifted: ${fmt(still.snr)}. Opposite motion: ${fmt(opp.snr)}. Only the right motion makes it this strong.</p>
    ${typeLine}
    <p class="dsc-src">Measured from SPHEREx pixels · Motion: Luhman &amp; Esplin 2016 · Type: SIMBAD</p>`;
}

function planetX(r: SandboxReading | null): string {
  const none = `<p class="dsc-big not">Not worked out: this patch has no measured noise to compare with.</p>`;
  const observed = `<p class="dsc-cat"><b>Nothing here was observed.</b></p>`;
  if (!r || r.verdict.kind === 'unknown') return `${none}${observed}`;
  const p = r.planet;
  const say =
    r.verdict.kind === 'one'
      ? `one SPHEREx picture would show it`
      : r.verdict.kind === 'stack'
        ? 'it would show only when pictures are added up'
        : 'it would not show with this method';
  return `<p class="dsc-label">Model · Simulated</p>
    <p class="dsc-cat">By a simple model and this patch's measured noise: with your pretend planet at <b>${Math.round(p.distance)} AU</b> and <b>${p.radius.toFixed(1)} times Earth's width</b>, ${say}.</p>
    ${observed}
    <p class="dsc-src">Model: Sima's sandbox · Noise: measured from SPHEREx pixels</p>`;
}

function fmt(x: number): string {
  return Number.isFinite(x) ? `${x.toFixed(1)}×` : 'not measured';
}

/** The result in one sentence, for the live region. */
function resultWords(): string {
  const o = outcome;
  if (!o || o.id !== 'runaway') return '';
  if (fit === undefined) return MEASURING;
  if (!fit.ok) return `Not measured: ${fit.reason ?? ''}.`;
  const f = fit as MotionFit;
  return `Sima measured it moving ${f.total.toFixed(2)} ± ${f.totalErr.toFixed(2)} arcseconds a year, from ${f.used} of ${f.of} pictures.`;
}
