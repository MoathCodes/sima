/**
 * Find changes tab: the change search (TLS-3 to TLS-5, docs/tools.md "Find changes tab"): a
 * threshold, a status line that says how many spots noise alone would give and stays in view
 * (O-T3), a ranked list with honest labels, marks on the picture, triage keys (C, X, J, K,
 * Enter), each candidate's cutouts, a small chart and "Open in Measure", and the CSV. Owner:
 * lane E.
 *
 * Honesty (H7): these are candidates to check. The panel never says "discovery".
 */
import { S, pic } from '../state.ts';
import { setEpoch, pause } from '../playback.ts';
import { formatCoords, formatDate } from '../../core/astro.ts';
import { chi2Test, weightedMean, type SpotPoint } from '../../core/stats.ts';
import { toCsv, type Cell } from '../../core/csv.ts';
import type { Candidate, ChangeSearch } from '../../core/detect.ts';
import type { WorkTiming } from '../../core/work.ts';
import { compute, STALE } from './compute.ts';
import type { SpotResult } from './jobs.ts';
import { current, mark, markOf, setList, setPic } from './settings.ts';
import { candidate, onSearch, openCandidate, rowLabel, search, shown } from './search.ts';
import { allRows } from './catalogue.ts';
import { download, esc, fileName, num, pill, pressSeg, seg, setSwitch, sig, term, token } from './dom.ts';
import { drawChart, drawPath, moverPath } from '../measure/charts.ts';
import { moverLine } from '../measure/model.ts';
import { paintCutout, triplet, tripletReady } from '../measure/cutouts.ts';
import { detail } from '../detail.ts';
import { plainP } from '../measure/words.ts';

const KIND: Record<Candidate['kind'], string> = {
  brighter: 'Brighter',
  fainter: 'Fainter',
  moved: 'Moved?',
  mover: 'Moved?',
};

/** Set when "Show the combined pass" turned on Combine each pass, so the details can say so. */
let combineTurnedOn = false;

export function buildFind(root: HTMLElement): void {
  root.classList.add('tl-find');
  root.innerHTML = `
    <div class="tl-find-top">
      <p class="tl-intro">Compares each date with the others and lists spots that got brighter, fainter or moved. These are ${term('candidates to check', 'A spot the search could not explain from the pictures alone. Each needs a person to look at it. None is a discovery.')}, not discoveries.</p>
      <label class="tl-slider"><span>${term('Report spots above', 'The threshold: how many times the pixel noise a change must be. Lower finds fainter changes, and more that noise made.')}</span>
        <output data-out="threshold"></output>
        <input type="range" min="3" max="10" step="0.5" data-threshold aria-label="Report spots above, times the noise"></label>
      <div class="tl-row tl-row-tight">
        <div class="tl-row-text"><span class="tl-row-name">Mark them on the picture</span></div>
        <button type="button" class="switch" role="switch" aria-checked="false" data-switch="marks" aria-label="Mark them on the picture"></button>
      </div>
      <p class="tl-status" data-status role="status" aria-live="polite"></p>
      <details class="tl-details" data-about><summary></summary><div data-about-body></div></details>
      <div class="tl-listbar">
        <label class="tl-check"><input type="checkbox" data-hide> Hide known, ruled out and rejected</label>
        ${seg('order', 'Order', [
          ['strength', 'Strongest'],
          ['date', 'By date'],
        ])}
      </div>
    </div>
    <div class="tl-list" data-list data-scroll role="listbox" tabindex="0" aria-label="Candidates to check. Keys: J and K move, C marks checked, X rejects, Enter opens in Measure"></div>
    <div class="tl-find-foot">
      <button type="button" class="link" data-csv>Download the list (CSV)</button>
      <details class="tl-details"><summary>How this works, and its limits</summary>
        <p>Two methods run, because each misses what the other sees. <b>Difference pictures</b>: each date minus the typical sky, smoothed with the shape of a star and divided by its noise; a bright and a dark spot side by side are one “Moved?” pair. <b>Positions</b>: every clear source is measured on every exposure and a straight line fitted through its positions, as catalogues measure motion.</p>
        <p>Known sources are matched with Gaia DR3 and CatWISE2020. Each change is checked on the single exposures behind it: a hit on one exposure only is a likely artefact. The smallest change it sees is a jump of about one pixel (6″) between dates. It does not check asteroids or fit parallax, and variable stars give real but expected changes.</p>
      </details>
    </div>`;

  const slider = root.querySelector<HTMLInputElement>('[data-threshold]');
  slider?.addEventListener('input', () => {
    root.querySelector('[data-out="threshold"]')!.textContent = `${num(Number(slider.value), 1)}× noise`;
  });
  slider?.addEventListener('change', () => setPic({ threshold: Number(slider.value) }));
  root
    .querySelector('[data-switch="marks"]')
    ?.addEventListener('click', () => setList({ marks: !current().marks }));
  root
    .querySelector<HTMLInputElement>('[data-hide]')
    ?.addEventListener('change', (e) => setList({ hide: (e.target as HTMLInputElement).checked }));
  root.querySelectorAll<HTMLElement>('[data-order]').forEach((b) =>
    b.addEventListener('click', () => setList({ order: b.dataset.order as 'strength' | 'date' })),
  );
  root.querySelector('[data-csv]')?.addEventListener('click', downloadList);
  const list = root.querySelector<HTMLElement>('[data-list]');
  list?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]');
    if (act) return onAction(act.dataset.act ?? '', act.dataset.id ?? '');
    const row = t.closest<HTMLElement>('[data-cand]');
    if (row) open(row.dataset.cand ?? null, true);
  });
  list?.addEventListener('keydown', (e) => triage(e));
  host = root;
  if (!listening) {
    listening = true;
    onSearch(() => {
      if (host?.isConnected && host.dataset.tab === 'find') updateFind(host);
    });
  }
}

/** The body the tab was last built in; the one search listener updates it while it shows Find. */
let host: HTMLElement | null = null;
let listening = false;

/** Opens a candidate: its details under its row, the frame on its date, marks on the picture. */
function open(id: string | null, toggle = false): void {
  const s = search();
  const next = toggle && s.open === id ? null : id;
  openCandidate(next);
  const c = next ? candidate(next) : null;
  if (!c) return;
  // The date in the list is the date of the exposure the frame jumps to (docs/tools.md).
  const i = S.groups.findIndex((g) => g.frames.includes(c.frame));
  const w = i >= 0 ? i : S.groups.findIndex((g) => g.window === c.window);
  if (w >= 0) {
    pause();
    setEpoch(w);
  }
}

function onAction(act: string, id: string): void {
  const c = candidate(id);
  if (!c) return;
  if (act === 'checked' || act === 'reject') {
    mark(id, act);
    return;
  }
  if (act === 'measure') return openInMeasure(c);
  if (act === 'combine') {
    combineTurnedOn = true;
    setPic({ combinePass: true });
  }
  if (act === 'uncombine') {
    combineTurnedOn = false;
    setPic({ combinePass: false });
  }
}

/**
 * "Open in Measure": the target's own measurement for a candidate at the patch's target, a
 * catalogue source as a click on it would, and an unknown spot as a fixed spot.
 */
export function openInMeasure(c: Candidate): void {
  if (c.known?.cat === 'target') return detail({ kind: 'target' });
  if (c.known) {
    const cat = c.known.cat;
    const row = allRows().find((r) => r.id === c.known?.id);
    return detail({ kind: 'source', cat, id: c.known.id, ra: row?.ra ?? c.ra, dec: row?.dec ?? c.dec });
  }
  detail({ kind: 'candidate', id: c.id, ra: c.ra, dec: c.dec });
}

/** Triage keys in the list (as in Fritz and Zooniverse): J/↓ next, K/↑ previous, C, X, Enter. */
function triage(e: KeyboardEvent): void {
  const list = shown(search().result);
  if (!list.length) return;
  const at = list.findIndex((c) => c.id === search().open);
  const go = (i: number) => {
    const c = list[Math.max(0, Math.min(list.length - 1, i))];
    if (c) open(c.id);
  };
  const key = e.key.toLowerCase();
  let used = true;
  if (key === 'j' || key === 'arrowdown') go(at + 1);
  else if (key === 'k' || key === 'arrowup') go(at < 0 ? 0 : at - 1);
  else if ((key === 'c' || key === 'x') && at >= 0) {
    const c = list[at];
    if (c) mark(c.id, key === 'c' ? 'checked' : 'reject');
    go(at + 1);
  } else if (key === 'enter' && at >= 0) {
    const c = list[at];
    if (c) openInMeasure(c);
  } else used = false;
  if (used) {
    e.preventDefault();
    e.stopPropagation();
  }
}

export function updateFind(root: HTMLElement): void {
  const p = pic();
  const s = search();
  const slider = root.querySelector<HTMLInputElement>('[data-threshold]');
  if (slider && document.activeElement !== slider) slider.value = String(p.threshold);
  root.querySelector('[data-out="threshold"]')!.textContent = `${num(p.threshold, 1)}× noise`;
  setSwitch(root, 'marks', current().marks);
  const hide = root.querySelector<HTMLInputElement>('[data-hide]');
  if (hide) hide.checked = current().hide;
  pressSeg(root, 'order', current().order);

  const sim = S.field?.simulated ? 'Simulated pictures: ' : '';
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const r = s.result;
  if (!S.field) status.textContent = 'No pictures here, so there is nothing to compare.';
  else if (S.color) status.textContent = 'The search compares one detector at a time. Pick one on the wavelength scale.';
  else if (s.state === 'running')
    status.textContent = `${sim}Comparing the dates in D${S.det} at ${num(p.threshold, 1)}× noise… It runs in the background; everything else keeps working.`;
  else if (s.state === 'failed') status.textContent = `${sim}The search could not run: ${s.error}`;
  else if (r) status.textContent = `${sim}${r.status}`;
  else status.textContent = '';
  status.classList.toggle('tl-busy', s.state === 'running');

  const about = root.querySelector<HTMLDetailsElement>('[data-about]')!;
  about.hidden = !r;
  if (r) {
    about.querySelector('summary')!.textContent = `About ${S.field?.target?.name ?? 'this patch'}, noise and limits`;
    const t = r as ChangeSearch & Partial<WorkTiming>;
    const took = !t.ms
      ? ''
      : t.ranOn === 'page'
        ? ` The search took ${num(t.ms / 1000, 1)} s on the page, in slices; the longest held the page ${Math.round(t.longestMs ?? 0)} ms.`
        : ` The search took ${num(t.ms / 1000, 1)} s in the background, so the page was never held.`;
    about.querySelector('[data-about-body]')!.innerHTML = [r.target, r.limits]
      .filter(Boolean)
      .map((t) => `<p>${esc(t)}</p>`)
      .join('') + (took ? `<p>${esc(took.trim())}</p>` : '');
  }

  const list = root.querySelector<HTMLElement>('[data-list]')!;
  const rows = shown(r);
  const hidden = (r?.candidates.length ?? 0) - rows.length;
  list.innerHTML = rows.length
    ? rows.map((c) => rowHtml(c, c.id === s.open)).join('') +
      (hidden > 0 ? `<p class="tl-line tl-more">${hidden} more hidden by the filter above.</p>` : '')
    : r
      ? `<p class="tl-line">${r.candidates.length ? 'Every candidate is hidden by the filter above.' : 'No candidates at this threshold.'}</p>`
      : '';
  const openC = s.open ? candidate(s.open) : null;
  root.toggleAttribute('data-open', !!openC);
  if (openC) {
    const host = list.querySelector<HTMLElement>('[data-detail]');
    if (host) fillDetail(host, openC);
    // Picking a candidate scrolls its row, verdict and evidence into view (docs/tools.md), inside
    // the list only.
    const row = host?.previousElementSibling as HTMLElement | null;
    if (row) list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top;
  }
  root.querySelector<HTMLElement>('[data-csv]')!.hidden = !r?.candidates.length;
}

function rowHtml(c: Candidate, isOpen: boolean): string {
  const label = rowLabel(c);
  const m = markOf(c.id);
  const strength =
    c.kind === 'mover' && c.motion
      ? `${num(c.motion.total, 2)} ± ${num(c.motion.totalErr, 2)}″/yr`
      : `${num(c.strength, 1)}× noise`;
  const notes: string[] = [];
  if (c.windows.length <= 1) notes.push('one date only');
  else notes.push(`${c.windows.length} dates`);
  if (c.nearSaturated !== null) notes.push(`${Math.round(c.nearSaturated)}″ from a saturated star`);
  if (c.known) notes.push(c.known.cat === 'target' ? 'the target' : c.known.id);
  if (c.glare) notes.push('in a bright star’s glare');
  return `<div class="tl-cand${isOpen ? ' open' : ''}" role="option" aria-selected="${isOpen}" data-cand="${esc(c.id)}">
      <span class="tl-rank">${c.rank}</span>
      <span class="tl-cand-text"><b>${KIND[c.kind]}</b> · ${esc(strength)} · ${esc(passWords(c.window))}, ${esc(formatDate(S.field?.frames[c.frame]?.mjd ?? Number.NaN, 'day'))}
        <span class="tl-cand-line">${esc(notes.join(' · '))}</span></span>
      <span class="tl-cand-tags">${pill(label.text, label.tone)}${m === 'checked' ? pill('Checked') : ''}</span>
    </div>${isOpen ? '<div class="tl-detail" data-detail></div>' : ''}`;
}

/** "pass 3" or "month 7": the window in the frame's own words. */
export function passWords(window: number): string {
  return `${S.field?.monthly ? 'month' : 'pass'} ${window + 1}`;
}

/** The open candidate's details: cutouts, what it was compared with, why, checks, chart, actions. */
function fillDetail(host: HTMLElement, c: Candidate): void {
  const field = S.field;
  if (!field) return;
  // The cutouts' blends are made off the page's thread; the details fill again once they are.
  const ready = tripletReady(field, S.det, () => {
    if (host.isConnected && search().open === c.id && S.field === field) fillDetail(host, c);
  });
  const tri = ready ? triplet(field, S.det, c.window, { ra: c.ra, dec: c.dec, half: 7 }) : null;
  const single = !S.pic.combinePass;
  const motion = c.motion ? `<p>${moverLine(c, search().result?.det ?? S.det, S.field?.target?.values)}</p>` : '';
  // The row's verdict label is followed at once by its evidence (the small chart, the cutouts),
  // then why, and the actions, so they show together in a short list (1366); the date, the checks
  // and the details follow.
  host.innerHTML = `
    <div class="window tl-mini"><canvas data-mini></canvas></div>
    <p class="tl-line" data-mini-note>${c.kind === 'mover' ? '' : 'Measuring the light here on every exposure…'}</p>
    ${motion}
    <div class="tl-cuts">
      ${['ref', 'now', 'diff']
        .map(
          (k, i) => `<figure><canvas data-cut="${k}" width="15" height="15"></canvas><figcaption>${
            ['Reference', 'This date', 'Difference'][i]
          }</figcaption></figure>`,
        )
        .join('')}
    </div>
    <p><b>Why it is listed:</b> ${esc(c.why)}</p>
    ${c.verdict === 'weak' && c.expectedFromNoise !== null ? `<p>Weak: as expected from noise. About ${esc(sig(c.expectedFromNoise, 2))} spots this strong would come from noise alone here.</p>` : ''}
    ${/not a discovery/i.test(c.why) ? '' : '<p class="tl-not">Not a discovery: a candidate to check.</p>'}
    <div class="tl-actions">
      <button type="button" class="btn" data-act="checked" data-id="${esc(c.id)}" aria-pressed="${markOf(c.id) === 'checked'}">Checked <span class="kbd">C</span></button>
      <button type="button" class="btn" data-act="reject" data-id="${esc(c.id)}" aria-pressed="${markOf(c.id) === 'reject'}">Reject <span class="kbd">X</span></button>
      <button type="button" class="btn" data-act="measure" data-id="${esc(c.id)}">Open in Measure</button>
    </div>
    <p>${esc(passWords(c.window))}, ${esc(formatDate(field.frames[c.frame]?.mjd ?? Number.NaN, 'day'))}, at ${esc(formatCoords(c.ra, c.dec))}. Compared with ${esc(tri?.refText ?? 'the other dates')}.</p>
    ${single ? (combineTurnedOn ? '' : `<p>Found in the combined picture of ${esc(passWords(c.window))}. The frame shows one exposure of it. <button type="button" class="link" data-act="combine" data-id="${esc(c.id)}">Show the combined pass</button></p>`) : ''}
    ${!single && combineTurnedOn ? `<p>This turned on Combine each pass in Clean up. <button type="button" class="link" data-act="uncombine" data-id="${esc(c.id)}">Turn it off</button></p>` : ''}
    <dl class="tl-checks">
      <dt>${term('Each exposure', 'The change measured on every single exposure of its date. A change on one exposure only is most likely a cosmic ray or a hot pixel.')}</dt><dd>${esc(c.checks.eachExposure || 'not measured')}</dd>
      <dt>${term('Fixed aperture', 'The light in a fixed circle on the original exposures, this date against the others. It agrees, sees no change, or could not look (flagged pixels).')}</dt><dd>${esc(c.checks.fixedAperture || 'not measured')}</dd>
    </dl>`;
  if (tri) {
    const sigma = field.noise[S.det - 1];
    host.querySelectorAll<HTMLCanvasElement>('[data-cut]').forEach((cv) => {
      const k = cv.dataset.cut as 'ref' | 'now' | 'diff';
      paintCutout(cv, field, tri[k], c.ra, c.dec, S.det, { diff: k === 'diff', sigma });
    });
  }
  void miniChart(host, c);
}

/** The small chart: the light in a fixed circle on every exposure of the detector, ±1 error. */
async function miniChart(host: HTMLElement, c: Candidate): Promise<void> {
  const canvas = host.querySelector<HTMLCanvasElement>('[data-mini]');
  const note = host.querySelector<HTMLElement>('[data-mini-note]');
  if (!canvas || !note) return;
  if (c.kind === 'mover') {
    // Its own evidence in place (TLS-5): the positions behind the fit and the fitted line.
    const tint = (frame: number) => token(`--p${((S.set?.frames[frame]?.meta.window ?? 0) % 4) + 1}`, '#c9c9cf');
    const ringed = new Set(S.field?.frames.filter((f) => f.window === c.window).map((f) => f.src));
    drawPath(canvas, moverPath(c, tint, (fr) => ringed.has(fr)));
    note.textContent = 'Its position on each exposure (colours are survey passes, rings its date) and the fitted line.';
    return;
  }
  if (!S.set) {
    note.textContent = S.field?.simulated
      ? 'Simulated pictures: there are no original exposures to measure.'
      : 'Not measured: the original exposures are not loaded.';
    drawChart(canvas, { points: [], yLabel: 'µJy', xKind: 'date', empty: 'Not measured' });
    return;
  }
  try {
    const res = await compute<SpotResult>({ kind: 'spot', ra: c.ra, dec: c.dec });
    if (!canvas.isConnected) return;
    const pts = res.points.filter((p: SpotPoint) => p.det === S.det);
    const ok = pts.filter((p) => !p.flagged && Number.isFinite(p.flux));
    const colour = token(`--d${S.det}`);
    const ringed = new Set(
      S.field?.frames.filter((f) => f.window === c.window && f.det === S.det).map((f) => f.src),
    );
    const mean = weightedMean(ok.map((p) => p.flux), ok.map((p) => p.err));
    drawChart(canvas, {
      points: ok.map((p) => ({ x: p.mjd, y: p.flux, err: p.err, colour, ring: ringed.has(p.frame) })),
      lines: Number.isFinite(mean.mean) && ok.length
        ? [{ x0: ok[0]!.mjd, x1: ok[ok.length - 1]!.mjd, y0: mean.mean, y1: mean.mean, colour: token('--st-ink-3'), dash: true }]
        : [],
      yLabel: 'µJy',
      xKind: 'date',
      empty: 'Not measured: no exposure has a clean circle here',
    });
    const left = pts.length - ok.length;
    const test = chi2Test(ok.map((p) => p.flux), ok.map((p) => p.err));
    const sat = pts.find((p) => p.nearSaturated !== null);
    note.innerHTML = [
      ok.length ? `Light in a fixed 25″ circle on ${ok.length} exposures of D${S.det}; rings mark the candidate’s date.` : '',
      left ? `${left} left out for a flagged pixel in the circle.` : '',
      plainP(test),
      sat ? `A saturated star about ${Math.round(sat.nearSaturated ?? 0)}″ away adds its glow to these numbers.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  } catch (err) {
    if (err === STALE || !note.isConnected) return;
    note.textContent = `Not measured: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Every candidate as CSV, with what the file is in `#` lines (docs/tools.md). */
function downloadList(): void {
  const r: ChangeSearch | null = search().result;
  const field = S.field;
  if (!r || !field) return;
  const sim = field.simulated;
  const notes = [
    sim
      ? 'SIMULATED: practice pictures made by Sima. Not real data; nothing here was observed.'
      : 'Candidates to check from Sima’s change search. These are not discoveries.',
    `Patch: ${S.label} at ${formatCoords(S.ra, S.dec)}, ${S.fov} arcmin; detector D${r.det}; threshold ${r.threshold} times the noise.`,
    `Dates: ${field.windows} ${field.monthly ? 'months' : 'survey passes'}. ${r.status}`,
    sim
      ? 'Pixels: simulated.'
      : `Pixels: SPHEREx Level 2 images (${field.releases.join(', ')}) from the NASA/IPAC Infrared Science Archive (IRSA). Computed by Sima, not an official SPHEREx product.`,
  ];
  const header = [
    'rank', 'verdict', 'kind', 'date', 'mjd', 'ra_deg', 'dec_deg', 'strength', 'change_uJy', 'change_err_uJy',
    'motion_arcsec_yr', 'motion_err_arcsec_yr', 'dates_seen', 'known_source', 'glare', 'saturated_star_arcsec',
    'expected_from_noise', 'each_exposure', 'fixed_aperture', 'your_mark',
  ];
  const rows: Cell[][] = r.candidates.map((c) => {
    const mjd = field.frames[c.frame]?.mjd ?? Number.NaN;
    return [
      c.rank, rowLabel(c).text, c.kind, formatDate(mjd, 'day'), fin(mjd), fin(c.ra), fin(c.dec), fin(c.strength),
      fin(c.change), fin(c.changeErr), c.motion ? fin(c.motion.total) : null, c.motion ? fin(c.motion.totalErr) : null,
      c.windows.map((w) => w + 1).join(' '), c.known ? c.known.id : null, c.glare, c.nearSaturated,
      c.expectedFromNoise, c.checks.eachExposure, c.checks.fixedAperture, markOf(c.id),
    ];
  });
  download(
    fileName(sim ? 'SIMULATED' : '', S.target ?? 'spot', `D${r.det}`, `${r.threshold}x`, 'candidates.csv'),
    toCsv(notes, header, rows),
  );
}

function fin(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}
