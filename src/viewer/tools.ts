/**
 * The picture tools panel beside the frame, in Measure only: Picture, Clean up, Find changes and
 * Layers (TLS-1 to TLS-8, docs/tools.md). Also the frame's #pic-tools ("Original" and the
 * "Processed:" label, H8) and #frame-legend. Owner: lane E.
 *
 * Settings go in `S.pic` (read the ones in force with `pic()`) and are kept in `sima.tools`.
 * Anything drawn on the picture goes through render.ts `drawHooks`.
 *
 * PHASE 0 STUB: the tabs switch, each says what it will hold, and "Original" works while held.
 */
import { S, watch, type ToolsTab } from './state.ts';
import { draw } from './render.ts';
import { icon } from '../shell/icons.ts';

const TABS: readonly [ToolsTab, string, string][] = [
  ['picture', 'Picture', 'Black and white limits with a live histogram, stretch, colour map.'],
  [
    'clean',
    'Clean up',
    'Background removal, sigma clipping, combine each pass, median filter, smoothing.',
  ],
  ['find', 'Find changes', 'Threshold, status line, ranked candidates with honest labels, CSV.'],
  ['layers', 'Layers', 'Gaia, AllWISE, predicted path, pixel flags, names.'],
];

/** Fills the tools panel and #pic-tools. Called once by main.ts. */
export function startTools(): void {
  watch(['tools', 'level', 'toolsTab'], render);
  watch(['level', 'original'], picTools);
  render();
  picTools();
}

function render(): void {
  const panel = document.getElementById('tools');
  if (!panel) return;
  panel.hidden = !(S.tools && S.level === 'measure');
  if (panel.hidden) return;
  panel.style.cssText = 'display:grid;align-content:start;gap:10px;padding:var(--pad-panel)';
  const tab = TABS.find((t) => t[0] === S.toolsTab) ?? TABS[0];
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <h2 style="flex:1;margin:0;font:var(--text-title)">Picture tools</h2>
      <button class="icon-btn sm" data-close aria-label="Close the picture tools">${icon('close')}</button>
    </div>
    <div class="tabs" role="tablist">${TABS.map(
      ([key, label]) =>
        `<button role="tab" data-tab="${key}" aria-selected="${S.toolsTab === key}">${label}</button>`,
    ).join('')}</div>
    <p style="margin:0;color:var(--ink-2)">Placeholder (phase 0). ${tab?.[2] ?? ''}</p>`;
  panel.querySelector('[data-close]')?.addEventListener('click', () => (S.tools = false));
  panel
    .querySelectorAll<HTMLElement>('[data-tab]')
    .forEach((b) => b.addEventListener('click', () => (S.toolsTab = b.dataset.tab as ToolsTab)));
}

/** "Original": press and hold to see the pixels as recorded (TLS-2). */
function picTools(): void {
  const box = document.getElementById('pic-tools');
  if (!box) return;
  box.style.cssText = 'position:absolute;left:8px;bottom:30px;z-index:1';
  box.hidden = S.level !== 'measure';
  if (box.hidden || box.firstElementChild) return;
  box.innerHTML = '<button class="btn quiet" data-original>Original</button>';
  const btn = box.querySelector<HTMLElement>('[data-original]');
  const hold = (on: boolean) => () => {
    S.original = on;
    draw();
  };
  btn?.addEventListener('pointerdown', hold(true));
  btn?.addEventListener('pointerup', hold(false));
  btn?.addEventListener('pointerleave', hold(false));
}
