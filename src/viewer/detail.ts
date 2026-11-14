/**
 * Measure: the expert panel beside the frame (MSR-1 to MSR-8). Owner: lane E.
 *
 * It opens calm: the object, one headline number with a status pill, one chart that fits that
 * number (Path for a mover, never an empty Spectrum: O-G4), one paragraph, and "Show all the
 * numbers". All the numbers add the chart tabs (Spectrum, Brightness, Folded, Path, Cutouts,
 * Exposure), the stats column, the detector strip (#detectors, filled by lane D) and "Found in
 * this patch" (inbox.ts). Every statistic explains itself on hover or focus (MSR-4).
 *
 * With nothing selected it shows "The picture on screen" (MSR-5); with no pictures, "Nothing to
 * measure here" and nothing from the last place (MSR-6). It fits 1366×768 with no inner scroll
 * (MSR-8): only the found list may scroll, inside itself.
 *
 * The numbers are lane B's science, run in a worker (tools/compute.ts).
 */
import { S, watch, type MeasureTab, type Selection } from './state.ts';
import { onTap } from './render.ts';
import { setLevel } from '../explore/game.ts';
import { icon } from '../shell/icons.ts';
import { formatCoords, formatDate, formatDec, formatRa, mjdToYear, offsetArcsec, separation } from '../core/astro.ts';
import { atDate } from '../core/catalog.ts';
import { foldCurve, type DetectorCurve } from '../core/fit.ts';
import { channelSpectrum, chi2Test, weightedMean, type ChannelPoint } from '../core/stats.ts';
import { channelOf } from '../core/instrument.ts';
import { toCsv, type Cell } from '../core/csv.ts';
import type { Measurement } from '../core/types.ts';
import { compute, STALE } from './tools/compute.ts';
import type { SpotResult, StackSet, TargetResult } from './tools/jobs.ts';
import { allRows, catalogue } from './tools/catalogue.ts';
import { candidate } from './tools/search.ts';
import { lastView, noiseOf } from './tools/view.ts';
import { download, esc, fileName, num, pill, sig, term, token } from './tools/dom.ts';
import { drawChart, drawPath, mjdDate, type Pt } from './measure/charts.ts';
import { paintCutout, triplet } from './measure/cutouts.ts';
import { ABSORPTION, candidateLines, spotHeadline, targetHeadline, targetStats, type Headline } from './measure/model.ts';
import { plainP, trendWords, widenedNote } from './measure/words.ts';
import { renderFound, startInbox } from './inbox.ts';

const TABS: readonly [MeasureTab, string][] = [
  ['spectrum', 'Spectrum'],
  ['brightness', 'Brightness'],
  ['folded', 'Folded'],
  ['path', 'Path'],
  ['cutouts', 'Cutouts'],
  ['exposure', 'Exposure'],
];

/** What has been computed for the selection on screen. */
interface Results {
  key: string;
  target: TargetResult | null;
  spot: SpotResult | null;
  stacks: StackSet | null;
  error: string | null;
}

let res: Results = { key: '', target: null, spot: null, stacks: null, error: null };
/** "Show all at once" on the Spectrum tab; otherwise it builds as the pictures play. */
let spectrumAll = false;
let lastField: unknown = null;

/** Fills Measure and shows it with the Measure level. Called once by main.ts. */
export function startMeasure(): void {
  restoreAllNumbers();
  onTap((p) => {
    if (S.level === 'measure' && S.field && !S.field.simulated) detail(tapped(p.ra, p.dec));
  });
  watch(['field', 'set'], () => {
    // A new patch: nothing from the last place stays (MSR-6). Measure is about its target.
    if (S.field === lastField) return;
    lastField = S.field;
    spectrumAll = false;
    S.selected = S.field?.target && !S.field.simulated ? { kind: 'target' } : null;
  });
  watch(['level', 'selected', 'measureTab', 'allNumbers', 'field', 'set', 'label', 'det', 'color', 'source'], render);
  watch(['epoch', 'groups', 'pic'], () => {
    if (!panel()?.hidden) chart();
  });
  watch(['allNumbers'], saveAllNumbers);
  startInbox(() => {
    const host = panel()?.querySelector<HTMLElement>('[data-found]');
    if (host && !panel()?.hidden && S.allNumbers) renderFound(host);
  });
  render();
}

/**
 * Shows Measure about something: the target, a catalogue source, a candidate or a spot. It does
 * not open Measure; call lane H's `setLevel('measure')` for that.
 *
 * @param sel What to measure; null for "the picture on screen" (MSR-5); leave out to keep the
 *   current selection and only redraw.
 */
export function detail(sel?: Selection | null): void {
  if (sel !== undefined) S.selected = sel;
  render();
}

/**
 * Shows a chart tab. A tab other than null also turns on "Show all the numbers", where the tabs
 * live.
 * @param tab The tab, or null for the one chart that fits the headline (MSR-1).
 */
export function selectTab(tab: MeasureTab | null): void {
  S.measureTab = tab;
  if (tab) S.allNumbers = true;
}

/** A tap on the picture: the catalogue source there (known), or a spot (O-V8). */
function tapped(ra: number, dec: number): Selection {
  const mjd = lastView()?.mjd ?? Number.NaN;
  const reach = Math.max(12, (S.field?.scale ?? 6.15) * 2) / 3600;
  let best: { d: number; sel: Selection } | null = null;
  for (const row of allRows()) {
    const at = Number.isFinite(mjd) ? atDate(row, mjd) : row;
    const d = separation(ra, dec, at.ra, at.dec);
    if (d <= reach && (!best || d < best.d)) best = { d, sel: { kind: 'source', cat: row.cat, id: row.id, ra: row.ra, dec: row.dec } };
  }
  const t = S.field?.target;
  if (t && Number.isFinite(mjd)) {
    const at = atDate({ cat: 'gaia', id: t.name, ra: t.ra, dec: t.dec, ep: t.ep, pmra: t.pmra, pmdec: t.pmdec, mag: 0 }, mjd);
    const d = separation(ra, dec, at.ra, at.dec);
    if (d <= reach && (!best || d <= best.d)) return { kind: 'target' };
  }
  return best?.sel ?? { kind: 'spot', ra, dec };
}

function panel(): HTMLElement | null {
  return document.getElementById('measure');
}

// ----- "Show all the numbers", remembered in sima-guide (MSR-2) ------------------------------

const GUIDE_KEY = 'sima-guide';

function restoreAllNumbers(): void {
  try {
    const g = JSON.parse(localStorage.getItem(GUIDE_KEY) ?? '{}') as { allNumbers?: unknown };
    if (g.allNumbers === true) S.allNumbers = true;
  } catch {
    // Blocked or malformed: start calm.
  }
}

/** Writes only `allNumbers` into lane H's `sima-guide`, keeping everything else in it. */
function saveAllNumbers(): void {
  try {
    const g = JSON.parse(localStorage.getItem(GUIDE_KEY) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(GUIDE_KEY, JSON.stringify({ ...(g && typeof g === 'object' ? g : {}), allNumbers: S.allNumbers }));
  } catch {
    // Storage can be blocked: the choice lasts this visit.
  }
}

// ----- Building the panel -------------------------------------------------------------------

function skeleton(p: HTMLElement): void {
  if (p.querySelector('[data-wrap]')) return;
  p.classList.add('ms-panel', 'appear');
  p.innerHTML = `
    <div class="ms-wrap" data-wrap>
      <div class="ms-main">
        <header class="ms-headrow">
          <div class="ms-title"><h2 data-title></h2><p class="ms-kind" data-kind></p></div>
          <button type="button" class="icon-btn sm" data-close aria-label="Close Measure" data-tip="Back to Explore (Esc)">${icon('close')}</button>
        </header>
        <div class="ms-headline" data-headline></div>
        <div class="tabs ms-tabs" role="tablist" aria-label="Charts" data-tabs>${TABS.map(
          ([key, label]) =>
            `<button type="button" role="tab" data-tab="${key}" aria-selected="false">${label}</button>`,
        ).join('')}</div>
        <div class="window ms-chart" data-guide="chart" data-chartbox>
          <canvas data-chart aria-label="Chart"></canvas>
          <div class="ms-cuts" data-cuts hidden></div>
          <div class="ms-table" data-table hidden></div>
        </div>
        <div class="ms-under" data-under></div>
      </div>
      <aside class="ms-aside" data-aside>
        <dl class="ms-stats" data-stats></dl>
        <div id="detectors" data-guide="detectors"></div>
        <section class="ms-found">
          <p class="ms-found-head"><span class="group-label">${term('Found in this patch', 'The target and what the change search lists in this detector at its threshold (Find changes in the picture tools). Candidates to check, not discoveries.')}</span><span class="ms-count" data-found-count></span></p>
          <div class="ms-found-list" data-found data-scroll></div>
        </section>
      </aside>
      <div class="ms-foot" data-foot>
        <button type="button" class="btn" data-all data-guide="all-numbers" aria-pressed="false"></button>
        <p class="ms-foot-line" data-all-line></p>
      </div>
    </div>`;
  p.querySelector('[data-close]')?.addEventListener('click', () => setLevel('explore'));
  p.querySelector('[data-all]')?.addEventListener('click', () => {
    S.allNumbers = !S.allNumbers;
    if (!S.allNumbers) S.measureTab = null;
  });
  p.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => selectTab(b.dataset.tab as MeasureTab)),
  );
  p.querySelector('[data-under]')?.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-do]');
    if (!t) return;
    if (t.dataset.do === 'csv') exportCsv();
    if (t.dataset.do === 'all-at-once') {
      spectrumAll = !spectrumAll;
      render();
    }
    if (t.dataset.do === 'picture') detail(null);
    if (t.dataset.do === 'target') detail({ kind: 'target' });
  });
}

/** Starts the jobs the selection needs, once per patch and selection. */
function ensure(): void {
  const sel = S.selected;
  const key = `${JSON.stringify(sel)}|${S.measureTab}`;
  const field = S.field;
  if (res.key === key && res.error === null) return;
  const keep = res.key.split('|')[0] === JSON.stringify(sel);
  res = keep ? { ...res, key } : { key, target: null, spot: null, stacks: null, error: null };
  if (!field || field.simulated || !S.set || !sel) return;
  const myKey = key;
  const fail = (err: unknown) => {
    if (err === STALE || res.key !== myKey) return;
    res = { ...res, error: err instanceof Error ? err.message : String(err) };
    render();
  };
  if (sel.kind === 'target') {
    if (!res.target)
      compute<TargetResult>({ kind: 'target' }).then((r) => {
        if (res.key.split('|')[0] !== myKey.split('|')[0]) return;
        res = { ...res, target: r };
        render();
      }, fail);
    const wantStack = field.target?.lead === 'stack' || S.measureTab === 'cutouts';
    if (wantStack && !res.stacks)
      compute<StackSet>({ kind: 'stack', how: S.pic.combineBy }).then((r) => {
        if (res.key.split('|')[0] !== myKey.split('|')[0]) return;
        res = { ...res, stacks: r };
        render();
      }, fail);
  } else if (!res.spot) {
    compute<SpotResult>({ kind: 'spot', ra: sel.ra, dec: sel.dec }).then((r) => {
      if (res.key.split('|')[0] !== myKey.split('|')[0]) return;
      res = { ...res, spot: r };
      render();
    }, fail);
  }
}

function render(): void {
  const p = panel();
  if (!p) return;
  p.hidden = S.level !== 'measure';
  if (p.hidden) return;
  skeleton(p);
  ensure();
  const q = <T extends HTMLElement = HTMLElement>(s: string) => p.querySelector<T>(s)!;
  const field = S.field;
  const sel = S.selected;
  const all = S.allNumbers;
  const wrap = q('[data-wrap]');
  const state = !field ? 'none' : field.simulated ? 'sim' : !sel ? 'picture' : 'measure';
  wrap.dataset.state = state;
  wrap.classList.toggle('ms-all', all && state !== 'none');
  q('[data-all]').textContent = all ? 'Show fewer numbers' : 'Show all the numbers';
  q('[data-all]').setAttribute('aria-pressed', String(all));
  q('[data-all-line]').textContent = all
    ? ''
    : 'More charts, catalogue values, the six detectors and other finds in this patch.';
  if (all && state !== 'none') {
    q('[data-stats]').innerHTML = state === 'measure' ? statsHtml() : '';
    renderFound(q('[data-found]'));
  }

  const title = q('[data-title]');
  const kind = q('[data-kind]');
  const head = q('[data-headline]');
  const under = q('[data-under]');

  if (state === 'none') {
    // MSR-6: nothing from the last place.
    title.textContent = 'Nothing to measure here';
    kind.textContent = '';
    head.innerHTML = `<p class="ms-sub">${esc(
      S.source === 'loading'
        ? 'The pictures of this spot are still loading. Measure fills in when they arrive.'
        : 'There are no SPHEREx pictures of this spot, so there is nothing to measure. Open one of the five test targets, or move the frame to a spot with pictures.',
    )}</p>`;
    under.innerHTML = '';
    return;
  }
  if (state === 'sim') {
    title.textContent = S.label;
    kind.innerHTML = pill('Simulated', 'warn');
    head.innerHTML = `<p class="ms-sub">Simulated pictures, made up for practice. Measure works only on real exposures, so nothing here is measured, listed or saved as a result.</p>`;
    under.innerHTML = pictureDetails();
    return;
  }
  if (state === 'picture') {
    title.textContent = 'The picture on screen';
    kind.textContent = S.label;
    head.innerHTML = `<p class="ms-sub">Tap a star in the picture to measure it${field?.target ? `, or <button type="button" class="link" data-do-target>measure ${esc(field.target.name)}</button>` : ''}.</p>`;
    head.querySelector('[data-do-target]')?.addEventListener('click', () => detail({ kind: 'target' }));
    under.innerHTML = pictureDetails();
    return;
  }

  // A selection with real pictures.
  const h = headline();
  const t = field!.target;
  if (sel!.kind === 'target' && t) {
    title.textContent = t.name;
    const plx = t.plx ? `${num(1000 / t.plx, t.plx > 100 ? 2 : 0)} pc` : '';
    kind.innerHTML = [t.kind ? esc(t.kind) : '', plx ? term(plx, `Distance from the catalogue parallax (${t.values}). One parsec is 3.26 light-years.`) : '']
      .filter(Boolean)
      .join(', ');
  } else {
    title.textContent = selTitle(sel!);
    kind.innerHTML = selKind(sel!);
  }
  head.innerHTML = `
    <p class="ms-value"><span class="term" tabindex="0" data-tip="${esc(h.valueTip)}">${esc(h.value)}</span> ${pill(h.pill.text, h.pill.tone)}</p>
    <p class="ms-sub">${h.sub}</p>`;

  const tab = all ? (S.measureTab ?? h.chart) : h.chart;
  p.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.tab === tab)),
  );
  under.innerHTML = underText(tab, h);

  chart();
}

/** A selection's position, degrees; the patch centre for the target (its own position moves). */
function posOf(sel: Selection): { ra: number; dec: number } {
  return 'ra' in sel ? { ra: sel.ra, dec: sel.dec } : { ra: S.ra, dec: S.dec };
}

function selTitle(sel: Selection): string {
  if (sel.kind === 'source') return sel.id;
  if (sel.kind === 'candidate') {
    const c = candidate(sel.id);
    return c ? `Candidate ${c.rank}` : 'A candidate to check';
  }
  return 'A spot in the picture';
}

function selKind(sel: Selection): string {
  if (sel.kind === 'source') {
    const row = allRows().find((r) => r.id === sel.id);
    const cat = sel.cat === 'gaia' ? 'Gaia DR3' : 'CatWISE2020';
    const mag = row ? `, ${sel.cat === 'gaia' ? 'G' : 'W1'} ${num(row.mag, 1)} mag` : '';
    const pm = row && (row.pmra || row.pmdec) ? `, moving ${num(Math.hypot(row.pmra, row.pmdec) / 1000, 3)}″/yr` : '';
    return `${term('Known', 'This spot has a catalogue source on it: known, not new.')}: ${esc(cat)} source${esc(mag)}${esc(pm)} (catalogue)`;
  }
  const where = esc(formatCoords(posOf(sel).ra, posOf(sel).dec));
  if (sel.kind === 'candidate') return `${where} · from Find changes`;
  const cat = catalogue();
  const partial = cat.gaia.partial || cat.catwise.partial;
  const known = partial
    ? 'frames.json lists catalogue sources only near the target’s path; look up the whole field in Layers'
    : cat.gaia.state === 'ready' || cat.catwise.state === 'ready'
      ? 'No Gaia DR3 or CatWISE2020 source here'
      : 'The catalogues are not available here, so it is not known whether a source is here';
  return `${where} · ${esc(known)}`;
}

/** The headline for the selection, from what has been computed so far. */
function headline(): Headline {
  const sel = S.selected!;
  const field = S.field!;
  if (sel.kind === 'target' && field.target) {
    const t = res.target;
    return targetHeadline({
      target: field.target,
      fit: t?.fit ?? null,
      curves: t?.curves ?? null,
      spectrum: t?.spectrum ?? null,
      stacks: res.stacks,
      exposures: field.frames.length,
      error: res.error,
    });
  }
  const pts = res.spot?.points ?? null;
  const mine = (pts ?? []).filter((p) => p.det === S.det && !p.flagged && Number.isFinite(p.flux));
  const test = pts ? chi2Test(mine.map((p) => p.flux), mine.map((p) => p.err)) : null;
  const mean = pts ? weightedMean(mine.map((p) => p.flux), mine.map((p) => p.err)) : null;
  const h = spotHeadline(pts, S.det, S.color ? 'The Color view mixes six detectors: pick one on the wavelength scale.' : res.error, test, mean);
  if (sel.kind === 'candidate') {
    const c = candidate(sel.id);
    if (c) h.para = `${candidateLines(c)} ${h.para}`;
  }
  return h;
}

/** The paragraph and notes under the chart for a tab (HTML). */
function underText(tab: MeasureTab, h: Headline): string {
  const parts: string[] = [];
  const field = S.field!;
  const sel = S.selected!;
  const curve = curveFor();
  if (tab === h.chart) parts.push(`<p class="ms-para">${h.para}</p>`);
  if (tab === 'spectrum') {
    parts.push(`<p class="ms-note">Hollow points are under 2σ: too faint to trust on their own. <button type="button" class="link" data-do="all-at-once">${spectrumAll ? 'Build it as the pictures play' : 'Show all at once'}</button></p>`);
  }
  if (tab === 'brightness') {
    if (sel.kind === 'target') {
      if (curve) {
        parts.push(
          `<p class="ms-note">${[plainP(curve.test), esc(widenedNote(curve.widenedBy)), trendWords(curve.trend) ? `Trend: ${esc(trendWords(curve.trend))}.` : '', curve.note ? esc(curve.note) : '']
            .filter(Boolean)
            .join(' ')}</p>`,
        );
      }
    } else {
      const pts = (res.spot?.points ?? []).filter((p) => p.det === S.det && !p.flagged && Number.isFinite(p.flux));
      if (res.spot) parts.push(`<p class="ms-note">${plainP(chi2Test(pts.map((p) => p.flux), pts.map((p) => p.err)))}</p>`);
      const sat = res.spot?.points.filter((p) => p.det === S.det && p.nearSaturated !== null) ?? [];
      if (sat.length)
        parts.push(`<p class="ms-note">A saturated star about ${Math.round(sat[0]!.nearSaturated ?? 0)}″ away (on ${sat.length} of ${pts.length} exposures) adds its glow to the circle and the sky ring here, so these numbers include its light.</p>`);
    }
  }
  if (tab === 'folded' && !field.target?.period) {
    parts.push('<p class="ms-note">Folding needs a catalogue period, and this star has none in a named catalogue, so nothing is folded (a period is never guessed).</p>');
  }
  if (tab === 'path' && sel.kind !== 'target') {
    parts.push('<p class="ms-note">A fixed spot has no path. Pick the target, or a mover from Found in this patch.</p>');
  }
  if (tab === 'exposure') parts.push('<p class="ms-note">The exposures behind the picture on screen, as NASA’s archive gives them.</p>');
  if (hasNumbers()) parts.push('<p class="ms-note"><button type="button" class="link" data-do="csv">Download these numbers (CSV)</button></p>');
  if (sel.kind !== 'target' && field.target) {
    parts.push(`<p class="ms-note"><button type="button" class="link" data-do="target">Back to ${esc(field.target.name)}</button> · <button type="button" class="link" data-do="picture">The picture on screen</button></p>`);
  }
  return parts.join('');
}

function hasNumbers(): boolean {
  if (S.selected?.kind === 'target') return !!res.target?.ms.some((m) => Number.isFinite(m.flux) || m.glow !== null);
  return !!res.spot?.points.some((p) => Number.isFinite(p.flux));
}

/** "The picture on screen": what it is, where it came from, its noise (MSR-5). */
function pictureDetails(): string {
  const view = lastView();
  const g = S.groups[S.epoch];
  const field = S.field;
  if (!field || !g) return '';
  const frames = g.frames.map((i) => field.frames[i]).filter((f) => !!f);
  const noise = view ? noiseOf(view) : null;
  const bad = frames.length ? frames.reduce((s, f) => s + f.bad.reduce((a, b) => a + b, 0), 0) / (frames.length * field.n * field.n) : Number.NaN;
  const rows: [string, string, string][] = [
    ['Date', formatDate(g.mjd, 'time'), 'The middle of the exposures blended into this picture, UTC.'],
    ['Detector', `D${g.det}, ${num(g.lam, 2)} µm`, 'Which of the six detectors, and the wavelength at the centre of the patch.'],
    ['Exposures', `${frames.length} blended`, 'How many single exposures make this picture.'],
    ['Data', field.simulated ? 'Simulated' : `Real SPHEREx, ${field.releases.map((r) => r.replace('spherex_', '').toUpperCase()).join(', ')}`, 'Where the pixels came from: NASA’s SPHEREx archive at IRSA, and which data release.'],
    ['Field', `${field.fov}′ across, ${field.n} × ${field.n} pixels`, 'The size of the patch on the sky (arcminutes) and its grid of 6.15″ pixels.'],
    ['Centre', formatCoords(field.ra, field.dec), 'Right ascension and declination of the patch centre.'],
    ['Sky level', noise ? `${sig(noise.sky, 3)} µJy a pixel` : 'not measured', 'The typical brightness of empty sky here.'],
    ['Noise', noise ? `${sig(noise.sigma, 3)} µJy a pixel` : 'not measured', 'How much empty-sky pixels scatter: the unit the tools count in.'],
    ['Flagged', Number.isFinite(bad) ? `${num(bad * 100, 1)}% of pixels` : 'not measured', 'Pixels the pipeline flags as untrustworthy (saturated, cosmic ray, hot) or not covered.'],
  ];
  return `<dl class="ms-stats ms-pic">${rows
    .map(([n, v, tip]) => `<dt>${term(n, tip)}</dt><dd>${esc(v)}</dd>`)
    .join('')}</dl>`;
}

function statsHtml(): string {
  const field = S.field;
  const sel = S.selected;
  if (!field || !sel) return '';
  let rows: { name: string; tip: string; value: string; from: string }[];
  if (sel.kind === 'target' && field.target) {
    rows = targetStats(field.target, res.target?.fit ?? null, field.windows, (ra, dec) => [formatRa(ra), formatDec(dec)]);
  } else {
    const row = sel.kind === 'source' ? allRows().find((r) => r.id === sel.id) : null;
    rows = [
      { name: 'RA', tip: 'Right ascension: the sky’s longitude.', value: formatRa(posOf(sel).ra), from: row ? 'catalogue' : 'measured' },
      { name: 'Dec', tip: 'Declination: the sky’s latitude.', value: formatDec(posOf(sel).dec), from: row ? 'catalogue' : 'measured' },
    ];
    if (row) {
      rows.push(
        { name: 'Catalogue', tip: 'The catalogue this source is from.', value: row.cat === 'gaia' ? 'Gaia DR3' : 'CatWISE2020', from: 'catalogue' },
        { name: 'Epoch', tip: 'The date the catalogue position is for; Sima moves it to each picture’s date.', value: num(row.ep, 1), from: 'catalogue' },
        { name: row.cat === 'gaia' ? 'G magnitude' : 'W1 magnitude', tip: 'Brightness in the catalogue’s own band: smaller is brighter.', value: num(row.mag, 2), from: 'catalogue' },
        { name: 'Motion', tip: 'The catalogue’s motion across the sky, arcseconds a year.', value: `${num(Math.hypot(row.pmra, row.pmdec) / 1000, 3)}″/yr`, from: 'catalogue' },
      );
    }
    if (sel.kind === 'candidate') {
      const c = candidate(sel.id);
      if (c) {
        rows.push(
          { name: 'Strength', tip: 'How many times the noise the change stands out.', value: `${num(c.strength, 1)}× noise`, from: 'measured' },
          { name: 'Change', tip: 'The change of light on its date against the reference, with its 1σ error.', value: Number.isFinite(c.change) ? `${sig(c.change, 3)} ± ${sig(c.changeErr, 2)} µJy` : 'not measured', from: 'measured' },
        );
      }
    }
  }
  // Every value says where it comes from (H4): grouped under "Measured from the pixels", the
  // named catalogue, or "Model".
  const source = rows.find((r) => r.name === 'Catalogue values from' || r.name === 'Catalogue');
  const groups: [string, string, string][] = [
    ['measured', 'Measured from the pixels', 'Worked out by Sima from the SPHEREx exposures of this patch.'],
    ['catalogue', source ? `Catalogue: ${source.value}` : 'Catalogue', source?.tip ?? 'From a named catalogue, not measured here.'],
    ['model', 'Model', 'Worked out from a model, not measured.'],
  ];
  return groups
    .map(([from, head, tip]) => {
      const mine = rows.filter((r) => r.from === from && r !== source);
      if (!mine.length) return '';
      return (
        `<dt class="ms-group">${term(head, tip)}</dt>` +
        mine
          .map((r) => `<dt>${term(r.name.replace(/ \((measured|catalogue)\)$/, ''), r.tip)}</dt><dd>${esc(r.value)}</dd>`)
          .join('')
      );
    })
    .join('');
}

// ----- The chart ----------------------------------------------------------------------------

function curveFor(): DetectorCurve | null {
  return res.target?.curves.find((c) => c.det === S.det) ?? null;
}

/** Pass tint for a window: four tints of the ink, oldest pass first (DESIGN.md). */
function tint(window: number): string {
  return token(`--p${(window % 4) + 1}`, '#c3cbea');
}

/** The source exposures (RealSet indices) of the picture on screen, for rings. */
function onScreen(): Set<number> {
  const g = S.groups[S.epoch];
  const out = new Set<number>();
  for (const i of g?.frames ?? []) {
    const src = S.field?.frames[i]?.src;
    if (src !== null && src !== undefined) out.add(src);
  }
  return out;
}

function chart(): void {
  const p = panel();
  if (!p || p.hidden || !S.field || S.field.simulated || !S.selected) {
    p?.querySelector('[data-chartbox]')?.setAttribute('hidden', '');
    return;
  }
  const box = p.querySelector<HTMLElement>('[data-chartbox]')!;
  box.hidden = false;
  const canvas = p.querySelector<HTMLCanvasElement>('[data-chart]')!;
  const cuts = p.querySelector<HTMLElement>('[data-cuts]')!;
  const table = p.querySelector<HTMLElement>('[data-table]')!;
  const h = headline();
  const tab = S.allNumbers ? (S.measureTab ?? h.chart) : h.chart;
  canvas.hidden = tab === 'cutouts' || tab === 'exposure';
  cuts.hidden = tab !== 'cutouts';
  table.hidden = tab !== 'exposure';
  if (tab === 'cutouts') return drawCuts(cuts);
  if (tab === 'exposure') return void (table.innerHTML = exposureTable());
  const ring = onScreen();
  const sel = S.selected;
  const pending = res.error ? `Not measured: ${res.error}` : 'Measuring…';
  if (tab === 'path') return drawPathTab(canvas, ring, pending);
  if (tab === 'spectrum') {
    let spec: ChannelPoint[] = [];
    if (sel.kind === 'target' && res.target) {
      const mjd = S.groups[S.epoch]?.mjd1 ?? Infinity;
      const ms = res.target.ms.filter(
        (m) => m.seen && !m.lower && !m.saturated && !m.skipped && Number.isFinite(m.flux) && (spectrumAll || m.mjd <= mjd + 1e-6),
      );
      spec = spectrumAll ? res.target.spectrum : channelSpectrum(ms.map((m) => ({ lam: m.lam, det: m.det, flux: m.flux, err: m.fluxErr })));
    } else if (res.spot) spec = res.spot.spectrum;
    return drawChart(canvas, {
      points: spec.map((c) => ({ x: c.lam, y: c.flux, err: c.err, colour: token(`--d${c.det}`), hollow: c.weak })),
      bands: ABSORPTION,
      yLabel: 'µJy',
      xKind: 'lam',
      xRange: [0.7, 5.05],
      empty: res.target || res.spot ? 'Not measured: no exposure has a clean measurement here yet' : pending,
    });
  }
  if (tab === 'brightness') {
    if (sel.kind === 'target') {
      const c = curveFor();
      const ms = res.target?.ms ?? [];
      const colour = token(`--d${S.det}`);
      const pts: Pt[] = (c?.points ?? []).map((pt) => ({
        x: pt.mjd,
        y: pt.dmag,
        err: pt.err,
        colour,
        hollow: pt.glow,
        ring: ring.has(ms[pt.m]?.frame ?? -1),
      }));
      const visits: Pt[] = (c?.visits ?? []).map((v) => ({ x: v.mjd, y: v.dmag, err: v.err, colour: token('--st-ink'), square: true }));
      const lines = [];
      if (c?.trend?.drawn && c.visits.length > 1) {
        const v0 = c.visits[0]!;
        const v1 = c.visits[c.visits.length - 1]!;
        const mid = c.visits.reduce((s, v) => s + v.dmag, 0) / c.visits.length;
        const tm = (v0.mjd + v1.mjd) / 2;
        const at = (mjd: number) => mid + (c.trend!.slope * (mjd - tm)) / 365.25;
        lines.push({ x0: v0.mjd, y0: at(v0.mjd), x1: v1.mjd, y1: at(v1.mjd), colour: token('--st-accent-2') });
      }
      return drawChart(canvas, {
        points: c?.shown === false ? [] : [...pts, ...visits],
        lines,
        yLabel: 'Change, mag',
        xKind: 'date',
        invertY: true,
        empty: !res.target ? pending : c ? (c.note ?? 'Not shown: the scatter within a visit is too large to read a change') : `Not measured in D${S.det}: ${detsWith(res.target.curves)}`,
      });
    }
    const pts = (res.spot?.points ?? []).filter((q) => q.det === S.det && Number.isFinite(q.flux) && !q.flagged);
    const colour = token(`--d${S.det}`);
    const mean = weightedMean(pts.map((q) => q.flux), pts.map((q) => q.err));
    return drawChart(canvas, {
      points: pts.map((q) => ({ x: q.mjd, y: q.flux, err: q.err, colour, ring: ring.has(q.frame) })),
      lines: Number.isFinite(mean.mean) && pts.length ? [{ x0: pts[0]!.mjd, x1: pts[pts.length - 1]!.mjd, y0: mean.mean, y1: mean.mean, colour: token('--st-ink-3'), dash: true }] : [],
      yLabel: 'µJy',
      xKind: 'date',
      empty: res.spot ? `Not measured in D${S.det}: no clean exposure covers this spot` : pending,
    });
  }
  if (tab === 'folded') {
    const t = S.field.target;
    const c = curveFor();
    const folded = t?.period && c ? foldCurve(c.points.map((q) => ({ mjd: q.mjd, dmag: q.dmag, err: q.err })), t.period) : [];
    return drawChart(canvas, {
      points: folded.flatMap((q) => [q, { ...q, phase: q.phase + 1 }]).map((q) => ({ x: q.phase, y: q.dmag, err: q.err, colour: token(`--d${S.det}`) })),
      yLabel: 'Change, mag',
      xKind: 'phase',
      xRange: [0, 2],
      invertY: true,
      empty: !t?.period ? 'No catalogue period: nothing to fold' : !c ? `Not measured in D${S.det}` : 'Not measured',
    });
  }
}

function detsWith(curves: DetectorCurve[]): string {
  const ok = curves.filter((c) => c.shown).map((c) => `D${c.det}`);
  return ok.length ? `measured in ${ok.join(', ')}` : 'no detector has a clean curve';
}

function drawPathTab(canvas: HTMLCanvasElement, ring: Set<number>, pending: string): void {
  const r = res.target;
  const f = r?.fit;
  if (S.selected?.kind !== 'target' || !r || !f) {
    return drawPath(canvas, { points: [], fit: null, catalogue: null, empty: S.selected?.kind === 'target' ? pending : 'A fixed spot has no path' });
  }
  const seen = r.ms.filter((m: Measurement) => m.seen && Number.isFinite(m.ra) && !m.skipped);
  if (!f.ok || !seen.length) {
    return drawPath(canvas, { points: [], fit: null, catalogue: null, empty: `Not measured: ${f.reason ?? 'no positions'}` });
  }
  const off = (ra: number, dec: number) => offsetArcsec(f.ra, f.dec, ra, dec);
  const yrs = seen.map((m) => mjdToYear(m.mjd));
  const y0 = Math.min(...yrs);
  const y1 = Math.max(...yrs);
  const along = (y: number) => ({ e: ((y - f.ep) * f.pmra) / 1000, n: ((y - f.ep) * f.pmdec) / 1000 });
  const a = along(y0);
  const b = along(y1);
  const first = seen[0]!;
  const last = seen[seen.length - 1]!;
  const c0 = off(first.predRa, first.predDec);
  const c1 = off(last.predRa, last.predDec);
  drawPath(canvas, {
    points: seen.map((m) => {
      const o = off(m.ra, m.dec);
      return { east: o.east, north: o.north, colour: tint(m.window), ring: ring.has(m.frame) };
    }),
    fit: { e0: a.e, n0: a.n, e1: b.e, n1: b.n },
    catalogue: { e0: c0.east, n0: c0.north, e1: c1.east, n1: c1.north },
    empty: 'Not measured',
  });
}

/** Cutouts: the reference, this date and the difference; for a stack, the stack and its two controls. */
function drawCuts(host: HTMLElement): void {
  const field = S.field!;
  const sel = S.selected!;
  const g = S.groups[S.epoch];
  const stack = sel.kind === 'target' ? res.stacks?.find((s) => s.det === S.det) : null;
  let pos: { ra: number; dec: number } | null = sel.kind === 'target' ? null : { ra: sel.ra, dec: sel.dec };
  const t = field.target;
  if (sel.kind === 'target' && t && g) pos = atDate({ cat: 'gaia', id: t.name, ra: t.ra, dec: t.dec, ep: t.ep, pmra: t.pmra, pmdec: t.pmdec, mag: 0 }, g.mjd);
  const tri = g && pos ? triplet(field, S.det, g.window) : null;
  const fig = (k: string, cap: string) => `<figure><canvas data-cut="${k}"></canvas><figcaption>${cap}</figcaption></figure>`;
  host.innerHTML = `
    <div class="ms-cutrow">${fig('ref', 'Reference')}${fig('now', 'This date')}${fig('diff', 'Difference')}</div>
    ${stack ? `<div class="ms-cutrow">${fig('along', `${esc(stack.along.label)} · ${Number.isFinite(stack.along.snr) ? `${num(stack.along.snr, 1)}σ` : 'not measured'}`)}${fig('c0', `${esc(stack.controls[0].label)} · ${Number.isFinite(stack.controls[0].snr) ? `${num(stack.controls[0].snr, 1)}σ` : '—'}`)}${fig('c1', `${esc(stack.controls[1].label)} · ${Number.isFinite(stack.controls[1].snr) ? `${num(stack.controls[1].snr, 1)}σ` : '—'}`)}</div>` : ''}
    ${!tri ? `<p class="ms-cutnote">${esc(g ? 'No other date in this detector to compare with.' : 'No picture on screen.')}</p>` : ''}`;
  if (pos && tri) {
    const sigma = field.noise[S.det - 1];
    for (const k of ['ref', 'now', 'diff'] as const) {
      const cv = host.querySelector<HTMLCanvasElement>(`[data-cut="${k}"]`);
      if (cv) paintCutout(cv, field, tri[k], pos.ra, pos.dec, S.det, { diff: k === 'diff', sigma });
    }
  }
  if (stack && t) {
    const centre = { ra: field.ra, dec: field.dec };
    const pics = { along: stack.along.pix, c0: stack.controls[0].pix, c1: stack.controls[1].pix };
    for (const [k, pix] of Object.entries(pics)) {
      const cv = host.querySelector<HTMLCanvasElement>(`[data-cut="${k}"]`);
      if (cv) paintCutout(cv, field, pix, pos?.ra ?? centre.ra, pos?.dec ?? centre.dec, S.det, { half: 9 });
    }
  }
}

/** The exposures behind the picture on screen (MSR-3, Exposure details). */
function exposureTable(): string {
  const field = S.field;
  const set = S.set;
  const g = S.groups[S.epoch];
  if (!field || !set || !g) return '<p class="ms-cutnote">No picture on screen.</p>';
  const ms = new Map((res.target?.ms ?? []).map((m) => [m.frame, m]));
  const rows = g.frames
    .map((i) => field.frames[i])
    .filter((f) => !!f && f.src !== null)
    .map((f) => {
      const meta = set.frames[f.src!]?.meta;
      if (!meta) return '';
      const m = ms.get(f.src!);
      const status = m ? (m.skipped ? `not measured: ${m.skipped}` : m.saturated ? 'saturated core: glow only' : m.seen ? 'measured' : 'not seen') : '';
      return `<tr><td><a class="link" href="${esc(meta.url)}" target="_blank" rel="noopener" data-tip="View the full file at NASA’s archive (IRSA)">${esc(meta.id)}</a></td>
        <td>${esc(formatDate(meta.mjd, 'time'))}</td><td>${esc(meta.release.replace('spherex_', '').toUpperCase())}</td>
        <td>${num(meta.lam, 3)} µm</td><td>${num(meta.exptime, 0)} s</td>
        <td>${meta.zodi === null ? '—' : sig(meta.zodi, 3)}</td><td>${num(meta.badFrac * 100, 1)}%</td><td>${num(meta.wcsErr, 2)}″</td><td>${esc(status)}</td></tr>`;
    })
    .join('');
  return `<table><thead><tr>
    <th>Exposure</th><th>Date</th><th>${term('Release', 'The SPHEREx data release the file belongs to.')}</th><th>${term('λ', 'Wavelength at the patch centre in this exposure.')}</th>
    <th>Time</th><th>${term('Zodi', 'Zodiacal light: sunlight scattered by dust in the solar system, MJy/sr. The pipeline’s model was subtracted; its level is kept here.')}</th>
    <th>${term('Flagged', 'Share of the cutout’s pixels flagged as untrustworthy.')}</th><th>${term('Map error', 'How far the simple sky mapping can be from the pipeline’s full one inside the cutout.')}</th><th>Target</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

// ----- CSV (MSR-7) --------------------------------------------------------------------------

function exportCsv(): void {
  const field = S.field;
  const sel = S.selected;
  if (!field || !sel || field.simulated) return;
  const where = `${S.label} at ${formatCoords(S.ra, S.dec)}, ${S.fov} arcmin`;
  const credit = `Computed by Sima from SPHEREx Level 2 images (${field.releases.join(', ')}), NASA/IPAC Infrared Science Archive (IRSA). Not an official SPHEREx measurement.`;
  if (sel.kind === 'target' && res.target) {
    const anyFlux = res.target.ms.some((m) => Number.isFinite(m.flux));
    const glow = !anyFlux && res.target.curves.some((c) => c.points.some((p) => p.glow));
    if (glow) {
      // A star whose core is flagged everywhere: what the Brightness tab draws, the glow's change.
      const header = ['id', 'date', 'mjd', 'det', 'delta_mag', 'delta_mag_err', 'from_outer_glow'];
      const rows: Cell[][] = res.target.curves.flatMap((c) =>
        c.points.map((p) => {
          const m = res.target!.ms[p.m];
          return [m?.id ?? '', iso(p.mjd), p.mjd, c.det, p.dmag, Number.isFinite(p.err) ? p.err : null, p.glow];
        }),
      );
      const notes = [
        `${field.target?.name}: change in brightness on each exposure, in magnitudes against each detector's own average, read from the outer glow (the core is saturated on every exposure).`,
        ...res.target.curves.filter((c) => c.note).map((c) => `D${c.det}: ${c.note}`),
        where,
        credit,
      ];
      return download(fileName(S.target ?? 'target', 'brightness.csv'), toCsv(notes, header, rows));
    }
    const header = ['id', 'date', 'mjd', 'det', 'lam_um', 'channel', 'flux_uJy', 'flux_err_uJy', 'saturated', 'lower_limit', 'ra_deg', 'dec_deg', 'pos_err_arcsec', 'not_measured_because'];
    const rows: Cell[][] = res.target.ms.map((m) => [
      m.id, iso(m.mjd), m.mjd, m.det, m.lam, channelOf(m.lam, m.det) - (m.det - 1) * 17,
      fin(m.flux), fin(m.fluxErr), m.saturated, m.lower, fin(m.ra), fin(m.dec), fin(m.posErr), m.skipped,
    ]);
    const notes = [
      `${field.target?.name}: light within 2 pixels on each exposure (sky from a ring 6 to 12 pixels out) and the measured position. lower_limit = 1: a flagged pixel in the aperture, so only usable pixels count.`,
      where,
      credit,
    ];
    return download(fileName(S.target ?? 'target', 'measure.csv'), toCsv(notes, header, rows));
  }
  if (res.spot) {
    const header = ['frame', 'date', 'mjd', 'det', 'lam_um', 'channel', 'flux_uJy', 'flux_err_uJy', 'flagged', 'saturated_star_arcsec'];
    const rows: Cell[][] = res.spot.points.map((p) => [
      set()?.frames[p.frame]?.meta.id ?? p.frame, iso(p.mjd), p.mjd, p.det, p.lam, channelOf(p.lam, p.det) - (p.det - 1) * 17,
      fin(p.flux), fin(p.err), p.flagged, p.nearSaturated,
    ]);
    const notes = [
      `A fixed spot at ${formatCoords(posOf(sel).ra, posOf(sel).dec)}: light in a 2-pixel circle on every exposure, sky from a ring 6 to 12 pixels out. Exposures with a flagged pixel in the circle are marked and have no value.`,
      sel.kind === 'candidate' ? 'From the change search: a candidate to check, not a discovery.' : '',
      where,
      credit,
    ].filter(Boolean);
    download(fileName(S.target ?? 'spot', 'spot.csv'), toCsv(notes, header, rows));
  }
}

function set() {
  return S.set;
}

function fin(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

function iso(mjd: number): string {
  const d = mjdDate(mjd);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 19) + 'Z' : '';
}
