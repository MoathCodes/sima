/**
 * Measure: the expert panel beside the frame (MSR-1 to MSR-8). It opens calm (the object, one
 * headline number with a status pill, one chart, one paragraph) and "Show all the numbers" adds
 * the chart tabs, the stats, the detector strip and "Found in this patch". Owner: lane E.
 *
 * Measure shows while `S.level` is `measure` (lane H's `setLevel` changes it). Its close button
 * goes back to Explore. Lane E creates an empty `#detectors` inside it; lane D fills that with
 * the six detector thumbnails.
 *
 * PHASE 0 STUB: no numbers. Every number slot says "Not measured yet" (H5: nothing is filled
 * in from a model).
 */
import { S, watch, type MeasureTab, type Selection } from './state.ts';
import { onTap } from './render.ts';
import { setLevel } from '../explore/game.ts';
import { icon } from '../shell/icons.ts';
import { formatCoords } from '../core/astro.ts';

const TABS: readonly [MeasureTab, string][] = [
  ['spectrum', 'Spectrum'],
  ['brightness', 'Brightness'],
  ['folded', 'Folded'],
  ['path', 'Path'],
  ['cutouts', 'Cutouts'],
  ['exposure', 'Exposure'],
];

/** Fills Measure and shows it with the Measure level. Called once by main.ts. */
export function startMeasure(): void {
  onTap((p) => {
    if (S.level === 'measure') detail({ kind: 'spot', ra: p.ra, dec: p.dec });
  });
  watch(['level', 'selected', 'measureTab', 'allNumbers', 'field', 'label'], render);
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

function render(): void {
  const panel = document.getElementById('measure');
  if (!panel) return;
  panel.hidden = S.level !== 'measure';
  if (panel.hidden) return;
  panel.style.cssText = 'display:grid;align-content:start;gap:10px;padding:var(--pad-panel)';
  const about = !S.selected
    ? 'The picture on screen'
    : S.selected.kind === 'target'
      ? S.label
      : S.selected.kind === 'spot'
        ? `Spot at ${formatCoords(S.selected.ra, S.selected.dec)}`
        : S.selected.id;
  const tabs = S.allNumbers
    ? `<div class="tabs" role="tablist">${TABS.map(
        ([key, label]) =>
          `<button role="tab" data-tab="${key}" aria-selected="${S.measureTab === key}">${label}</button>`,
      ).join('')}</div>`
    : '';
  const more = S.allNumbers
    ? `<div id="detectors" data-guide="detectors"></div>
       <p class="group-label" style="margin:0">Found in this patch</p>
       <p style="margin:0;color:var(--ink-2)">Not searched yet (phase 0).</p>`
    : '';
  panel.innerHTML = S.field
    ? `
      <div style="display:flex;align-items:center;gap:8px">
        <h2 data-about style="flex:1;margin:0;font:var(--text-title)"></h2>
        <button class="icon-btn sm" data-close aria-label="Close Measure" data-tip="Back to Explore">${icon('close')}</button>
      </div>
      <p style="margin:0;font:var(--text-headline)">Not measured yet <span class="pill warn">Placeholder</span></p>
      ${tabs}
      <div class="window" data-guide="chart" style="height:180px;display:grid;place-items:center;font:var(--text-label)">Chart placeholder (phase 0)</div>
      <p style="margin:0">Placeholder (phase 0): one paragraph on what the number means.</p>
      <label style="display:flex;align-items:center;gap:8px;font:var(--text-control)">
        <button class="switch sm" role="switch" data-all aria-checked="${S.allNumbers}" aria-label="Show all the numbers"></button>
        Show all the numbers
      </label>
      ${more}`
    : `
      <div style="display:flex;align-items:center;gap:8px">
        <h2 style="flex:1;margin:0;font:var(--text-title)">Nothing to measure here</h2>
        <button class="icon-btn sm" data-close aria-label="Close Measure">${icon('close')}</button>
      </div>
      <p style="margin:0;color:var(--ink-2)">There are no pictures of this spot.</p>`;
  const title = panel.querySelector('[data-about]');
  if (title) title.textContent = about;
  panel.querySelector('[data-close]')?.addEventListener('click', () => setLevel('explore'));
  panel
    .querySelector('[data-all]')
    ?.addEventListener('click', () => (S.allNumbers = !S.allNumbers));
  panel
    .querySelectorAll<HTMLElement>('[data-tab]')
    .forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab as MeasureTab)));
}
