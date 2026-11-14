/**
 * The frame card's insides: the header (name, source line, field size, picture tools, Measure,
 * close), the views, the data line and Measure's explanation line (FRM-5 to FRM-12).
 * Owner: lane D. Lane F places the card and owns #frame-grip; lane H fills #frame-task; lane E
 * fills #pic-tools and #frame-legend.
 *
 * It answers the bus: `aim` loads a spot, `band` shows a detector.
 *
 * PHASE 0 STUB: the header, views and lines work on the placeholder. No dragging inside the
 * picture, no wheel over it, no loading line, no cover.
 */
import { FOVS, S, VIEWS, watch, type Mode } from './state.ts';
import { draw, exif } from './render.ts';
import { aimAt, groupsFor, loadTarget, setFov } from './load.ts';
import { setEpoch } from './playback.ts';
import { on } from '../shell/bus.ts';
import { icon, type IconName } from '../shell/icons.ts';
import { hideFrame } from '../shell/shell.ts';
import { setLevel } from '../explore/game.ts';
import { BAND_EDGES } from '../core/instrument.ts';

const VIEW_NAMES: Record<Mode, [string, IconName]> = {
  flip: ['Flip', 'flip'],
  swipe: ['Swipe', 'swipe'],
  two: ['Two dates', 'two'],
  diff: ['Difference', 'diff'],
  stack: ['Stack', 'stack'],
  trail: ['Trail', 'trail'],
};

const SOURCE_LINE: Record<string, string> = {
  real: '<span style="color:var(--good)">●</span> Real data',
  live: '<span style="color:var(--good)">●</span> Real data, fetched live',
  simulated: '<span style="color:var(--warn)">◌</span> Simulated: placeholder pictures (phase 0)',
  none: 'No pictures here',
  loading: 'Loading',
};

/** Fills the frame and answers `aim` and `band`. Called once by main.ts. */
export function startFrame(): void {
  const frame = document.getElementById('frame');
  if (frame) Object.assign(frame.style, { display: 'grid', gap: '8px', padding: '10px' });
  on('aim', (m) => {
    if (m.target) void loadTarget(m.target);
    else void aimAt(m.ra, m.dec, m.fov);
  });
  on('band', (m) => {
    S.det = m.det;
    S.color = false;
    S.lam = ((BAND_EDGES[m.det - 1] ?? 0.75) + (BAND_EDGES[m.det] ?? 5)) / 2;
    S.groups = groupsFor(S.field, S.det);
    setEpoch(Math.min(S.epoch, Math.max(0, S.groups.length - 1)));
  });
  watch(['label', 'source', 'fov', 'level', 'tools'], header);
  watch(['level', 'mode'], views);
  watch(['field', 'groups', 'epoch', 'mode', 'det', 'level', 'source'], () => {
    lines();
    draw();
  });
  header();
  views();
  lines();
}

function header(): void {
  const head = document.getElementById('frame-head');
  if (!head) return;
  const measure = S.level === 'measure';
  head.style.cssText = 'display:flex;align-items:center;gap:4px;min-width:0';
  head.innerHTML = `
    <div style="flex:1;min-width:0">
      <h2 style="margin:0;font:var(--text-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></h2>
      <p style="margin:0;color:var(--ink-2);font:var(--text-label)">${SOURCE_LINE[S.source] ?? ''}</p>
    </div>
    <button class="icon-btn sm" data-fov="-1" aria-label="Smaller field" data-tip="Smaller field">${icon('minus')}</button>
    <span style="font:var(--text-label);color:var(--ink-2)">${S.fov}′</span>
    <button class="icon-btn sm" data-fov="1" aria-label="Larger field" data-tip="Larger field">${icon('plus')}</button>
    ${measure ? `<button class="icon-btn sm" data-tools aria-pressed="${S.tools}" aria-label="Picture tools" data-tip="Picture tools">${icon('sliders')}</button>` : ''}
    <button class="btn text" data-measure aria-pressed="${measure}" data-guide="measure">${icon('chart')}Measure</button>
    <button class="icon-btn sm" data-hide aria-label="Hide the frame" data-tip="Hide the frame">${icon('close')}</button>`;
  const title = head.querySelector('h2');
  if (title) {
    title.textContent = S.label;
    title.title = S.label;
  }
  head.querySelectorAll<HTMLElement>('[data-fov]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = FOVS.indexOf(S.fov) + Number(b.dataset.fov);
      const next = FOVS[Math.max(0, Math.min(FOVS.length - 1, i))];
      if (next !== undefined) void setFov(next);
    }),
  );
  head.querySelector('[data-tools]')?.addEventListener('click', () => (S.tools = !S.tools));
  head
    .querySelector('[data-measure]')
    ?.addEventListener('click', () => setLevel(measure ? 'explore' : 'measure'));
  head.querySelector('[data-hide]')?.addEventListener('click', () => hideFrame(true));
}

function views(): void {
  const box = document.getElementById('frame-views');
  if (!box) return;
  box.className = 'seg';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'View');
  box.innerHTML = VIEWS[S.level]
    .map((m) => {
      const [label, name] = VIEW_NAMES[m];
      return `<button data-mode="${m}" aria-pressed="${S.mode === m}">${icon(name)}${label}</button>`;
    })
    .join('');
  box
    .querySelectorAll<HTMLElement>('[data-mode]')
    .forEach((b) => b.addEventListener('click', () => (S.mode = b.dataset.mode as Mode)));
}

function lines(): void {
  const ex = document.getElementById('frame-exif');
  if (ex) {
    ex.style.cssText = 'margin:0;color:var(--ink-2);font:var(--text-label)';
    ex.textContent = exif();
  }
  const explain = document.getElementById('frame-explain');
  if (explain) {
    explain.hidden = S.level !== 'measure';
    explain.style.cssText = 'margin:0;font:var(--text-label)';
    explain.textContent = `Placeholder (phase 0): what the ${VIEW_NAMES[S.mode][0]} view shows.`;
  }
}
