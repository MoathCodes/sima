/**
 * The frame card's insides: the header (name, source line, field size, picture tools, Measure,
 * close), the loading line and cover, the views, the data line and Measure's explanation line
 * (FRM-5 to FRM-12). Owner: lane D. Lane F places the card, drags and sizes it and owns
 * #frame-grip; lane H fills #frame-task; lane E fills #pic-tools and #frame-legend.
 *
 * It answers the bus: `aim` loads a spot, `band` shows a detector.
 */
import { FOVS, S, VIEWS, watch, type Mode } from './state.ts';
import { dataLine, draw, exif, nextFov, setPointerActions } from './render.ts';
import {
  aimAt,
  lamInBand,
  liveNote,
  loadTarget,
  noPictures,
  onPreview,
  panTo,
  previewPatch,
  regroup,
  retryWider,
  setFov,
  showDetector,
  stepNote,
  announce,
} from './load.ts';
import { on } from '../shell/bus.ts';
import { formatCoords } from '../core/astro.ts';
import { icon, type IconName } from '../shell/icons.ts';
import { hideFrame } from '../shell/shell.ts';
import { measureShown, setMeasureOpen } from './detail.ts';
import { BAND_EDGES } from '../core/instrument.ts';
import { TARGETS } from '../core/targets.ts';
import { SCENARIOS } from '../core/field.ts';
import { startStrip } from './strip.ts';
import { onSurround, widening } from './surround.ts';
import { liveTip, liveWords } from './seed.ts';

const VIEW_NAMES: Record<Mode, [string, IconName, string]> = {
  flip: ['Flip', 'flip', 'Show the dates one after another'],
  swipe: ['Swipe', 'swipe', 'Drag the line to compare the reference date with this one'],
  two: ['Two dates', 'two', 'Two dates in one picture: red is earlier, cyan is later'],
  diff: ['Difference', 'diff', 'Only what is brighter or fainter than usual'],
  stack: ['Stack', 'stack', 'Every date added up, to see what is too faint for one'],
  trail: ['Trail', 'trail', 'Earlier dates stay as a fading trail'],
};

/** What each view shows, in Measure's explanation line. */
const EXPLAIN: Record<Mode, string> = {
  flip: 'Each picture is one visit, scaled to the reference brightness. Stars stay put; what shifts is moving.',
  swipe:
    'Left of the line is the reference date, right of it this one. Drag the line over anything that differs.',
  two: 'Red is the reference date, cyan this one. Unchanged is white; a red and cyan pair moved.',
  diff: 'This date minus the median of all dates: white is here now, dark is where it usually sits.',
  stack: 'Every exposure in this detector added up, so faint things build up and the noise drops.',
  trail: 'This date in colour, earlier dates as a fading trail: a mover draws its own path.',
};

const SOURCE: Record<string, { cls: string; text: string; tip: string }> = {
  real: {
    cls: 'real',
    text: 'Real data',
    tip: 'Real exposures from NASA’s SPHEREx telescope, from NASA’s archive (IRSA)',
  },
  live: {
    cls: 'real',
    text: 'Real data, fetched live',
    tip: 'Real exposures fetched from NASA’s archive (IRSA) for this spot just now',
  },
  simulated: {
    cls: 'sim',
    text: 'Simulated',
    tip: 'Made-up pictures for practice. They are never mixed with real results',
  },
  none: {
    cls: 'none',
    text: 'No pictures here',
    tip: 'There are no real pictures of this spot in the frame',
  },
  loading: {
    cls: 'loading',
    text: 'Loading…',
    tip: 'Real exposures of this spot are on their way',
  },
};

/** Fills the frame and answers `aim` and `band`. Called once by main.ts. */
export function startFrame(): void {
  // Slate: opaque, for science (DESIGN-v2 D-3). frame.css draws it; lane F's class names it.
  document.getElementById('frame')?.classList.add('slate');
  on('aim', (m) => {
    // A new spot loads: the frame shows, so its progress is always in view.
    hideFrame(false);
    if (m.target) void loadTarget(m.target, { fov: m.fov });
    else void aimAt(m.ra, m.dec, m.fov, m.name);
  });
  on('band', (m) => {
    S.color = false;
    showDetector(m.det, lamInBand(m.det, BAND_EDGES));
  });
  setPointerActions({
    pan: (ra, dec) => panTo(ra, dec),
    preview: (ra, dec) => previewPatch(ra, dec),
    wheel: (steps) => void setFov(nextFov(steps)),
  });
  watch(['label', 'source', 'set', 'fov', 'level', 'measureOpen', 'tools', 'target', 'ra', 'dec'], header);
  watch(['level', 'mode', 'groups', 'source', 'field'], views);
  watch(['level', 'sameColour'], () => regroup());
  let combined = S.pic.combinePass;
  watch(['pic'], () => {
    // "Combine each pass" changes what one step is in Measure: a pass or a visit.
    if (S.pic.combinePass === combined) return;
    combined = S.pic.combinePass;
    if (S.level === 'measure') regroup();
  });
  watch(['level'], () => {
    if (!VIEWS[S.level].includes(S.mode)) S.mode = 'flip';
  });
  watch(
    [
      'field',
      'groups',
      'epoch',
      'ref',
      'mode',
      'det',
      'level',
      'source',
      'load',
      'pic',
      'original',
      'color',
      'fov',
      'sameColour',
      'swipe',
    ],
    () => {
      lines();
      cover();
      draw();
    },
  );
  watch(['fov', 'ra', 'dec', 'label', 'source'], () => announce());
  onPreview(showPreview);
  onSurround(() => {
    lines();
    draw();
  });
  document
    .getElementById('frame-load')
    ?.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest('[data-widen-retry]')) retryWider();
    });
  header();
  views();
  lines();
  cover();
  startStrip();
}

// ----- Header -----------------------------------------------------------------------------------

function header(): void {
  const head = document.getElementById('frame-head');
  if (!head) return;
  const measure = S.level === 'measure';
  const open = measureShown();
  // A named spot that is not a shipped target: its coordinates follow the source (audit #5).
  const named = !S.target && !!S.label && S.label !== formatCoords(S.ra, S.dec);
  const view = document.documentElement.dataset.view;
  const discover = view === 'discover';
  const expert = view === 'expert';
  // A test target's wider field comes from the live service: say so (H2).
  const kind = S.source === 'real' && S.set?.origin === 'live' ? 'live' : S.source;
  const base = SOURCE[kind] ?? SOURCE.none;
  // A live patch says when it was fetched: "fetched live" only for this visit (seed.ts).
  const live = S.set?.data.live;
  const src =
    kind === 'live' && base
      ? { ...base, text: `Real data, ${liveWords(live)}`, tip: liveTip(live) }
      : base;
  const i = FOVS.indexOf(S.fov);
  // An embedded page shows only the frame, the bar and Measure: hiding the frame would empty it.
  // (main.ts marks <html> before the frame starts; S.embed is set later, by url.ts.)
  const embedded = document.documentElement.hasAttribute('data-embed');
  head.className = 'frame-head';
  head.dataset.drag = '';
  const html = `
    <div class="frame-name">
      <h2 class="frame-title"></h2>
      <p class="frame-source ${src?.cls ?? ''}"><span class="frame-dot" aria-hidden="true"></span><span class="term" tabindex="0" data-tip="${src?.tip ?? ''}">${src?.text ?? ''}</span>${src?.cls === 'real' ? '<span class="frame-agency"> · NASA SPHEREx</span>' : ''}${named ? `<span class="frame-coords"> · ${formatCoords(S.ra, S.dec)}</span>` : ''}</p>
      <p class="frame-prov" data-guide="data-line"></p>
    </div>
    <div class="frame-actions">
      <button class="icon-btn sm" data-fov="-1" aria-label="Smaller field" data-tip="Smaller field (${FOVS[Math.max(0, i - 1)]}′)" data-guide="fov-smaller" ${i <= 0 ? 'disabled' : ''}>${icon('minus')}</button>
      <span class="frame-fov term" tabindex="0" data-tip="Field size: the frame shows ${S.fov} arcminutes of sky. The wheel over the picture changes it too">${S.fov}′</span>
      <button class="icon-btn sm" data-fov="1" aria-label="Larger field" data-tip="Larger field (${FOVS[Math.min(FOVS.length - 1, i + 1)]}′)" data-guide="fov-larger" ${i >= FOVS.length - 1 ? 'disabled' : ''}>${icon('plus')}</button>
      ${measure ? `<button class="icon-btn sm" data-tools aria-pressed="${S.tools}" aria-label="Picture tools" data-tip="Picture tools" data-guide="tools-button">${icon('sliders')}</button>` : ''}
      ${discover ? '' : `<button class="btn text frame-measure" data-measure aria-pressed="${open}" data-guide="measure" data-tip="${open ? (expert ? 'Close Measure' : 'Back to the simple view') : 'Measure: numbers, charts and all six views'}">${icon('chart')}<span>Measure</span></button>`}
      ${embedded ? '' : `<button class="icon-btn sm" data-hide aria-label="Hide the frame" data-tip="Hide the frame" data-guide="frame-hide">${icon('close')}</button>`}
    </div>`;
  // Redrawn only when it changes: a redraw while the user presses − or + would lose the press.
  if (head.dataset.html === html + S.label) return;
  head.dataset.html = html + S.label;
  head.innerHTML = html;
  lines();
  const title = head.querySelector<HTMLElement>('.frame-title');
  if (title) {
    title.textContent = S.label;
    // One line; the whole name in the tooltip (O-I10).
    title.dataset.tip = S.label;
  }
  head
    .querySelectorAll<HTMLButtonElement>('[data-fov]')
    .forEach((b) => b.addEventListener('click', () => void setFov(nextFov(Number(b.dataset.fov)))));
  head.querySelector('[data-tools]')?.addEventListener('click', () => (S.tools = !S.tools));
  head
    .querySelector('[data-measure]')
    ?.addEventListener('click', () => setMeasureOpen(!open));
  head.querySelector('[data-hide]')?.addEventListener('click', () => hideFrame(true));
}

// ----- Views ------------------------------------------------------------------------------------

function views(): void {
  const box = document.getElementById('frame-views');
  if (!box) return;
  const off = !S.field || S.groups.length === 0;
  box.className = `seg frame-views${S.level === 'measure' ? ' six' : ''}`;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'View');
  box.innerHTML = VIEWS[S.level]
    .map((m) => {
      const [label, name, tip] = VIEW_NAMES[m];
      return `<button data-mode="${m}" data-guide="view-${m}" aria-pressed="${S.mode === m}" data-tip="${tip}" ${off ? 'disabled' : ''}>${icon(name)}<span>${label}</span></button>`;
    })
    .join('');
  box.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      S.mode = b.dataset.mode as Mode;
    }),
  );
}

// ----- Lines ------------------------------------------------------------------------------------

function lines(): void {
  // Discover and phones: the full data line under the name (H2; BEGINNER-AND-MOBILE 5.3, 11.4).
  const prov = document.querySelector<HTMLElement>('#frame-head .frame-prov');
  if (prov) prov.textContent = dataLine();
  const ex = document.getElementById('frame-exif');
  if (ex) {
    ex.className = 'frame-exif';
    ex.textContent = exif();
  }
  const explain = document.getElementById('frame-explain');
  if (explain) {
    explain.className = 'frame-explain';
    explain.hidden = S.level !== 'measure' || !S.field;
    explain.textContent = EXPLAIN[S.mode];
  }
  const load = document.getElementById('frame-load');
  if (load) {
    // The line keeps its height whether or not it has words, so the frame never grows (O-I5).
    load.className = 'frame-load';
    const busy = S.source === 'loading' && S.load;
    // While wider real pictures are fetched, or cannot be, the line says so (FRM-6), with the
    // fetch's progress bar first and, after a failure, Ask again.
    const w = busy ? null : widening;
    const note = [w?.what ?? stepNote, liveNote].filter(Boolean).join(' · ');
    const text = busy
      ? 'Loading this spot. The sky keeps working meanwhile.'
      : note
        ? `${note.replace(/[.…]$/, '')}${note.endsWith('…') ? '…' : '.'}`
        : '';
    const known = !!w && w.total !== null && w.done !== null && w.total > 0;
    const pct = known && w ? Math.round((100 * (w.done ?? 0)) / (w.total ?? 1)) : 0;
    const key = `${text}|${w?.state ?? ''}|${pct}`;
    if (load.dataset.key !== key) {
      load.dataset.key = key;
      load.innerHTML = `${
        w?.state === 'busy'
          ? `<span class="load-bar${known ? ' known' : ''}" style="--done:${pct}%" role="progressbar" aria-label="Real exposures of the wider field" ${known ? `aria-valuenow="${pct}"` : ''}><span></span></span>`
          : ''
      }${
        w?.state === 'failed'
          ? '<button type="button" class="link load-retry" data-widen-retry>Ask again</button>'
          : ''
      }<span class="load-text"></span>`;
      const t = load.querySelector('.load-text');
      if (t) t.textContent = text;
    }
    load.dataset.tip = text;
  }
}

// ----- Cover: busy, preview, and "no pictures here" ----------------------------------------------

let previewCanvas: OffscreenCanvas | null = null;
let coverTimer = 0;

function showPreview(c: OffscreenCanvas | null): void {
  previewCanvas = c;
  cover();
}

function cover(): void {
  const el = document.getElementById('frame-cover');
  if (!el) return;
  el.className = 'frame-cover';
  const loading = S.source === 'loading' && S.load;
  const none = !loading && (!S.field || !S.groups.length);
  if (!loading && !none) {
    el.hidden = true;
    el.innerHTML = '';
    previewCanvas = null;
    return;
  }
  if (loading && S.load) {
    const l = S.load;
    const known = l.total !== null && l.done !== null && l.total > 0;
    const pct = known ? Math.round((100 * (l.done ?? 0)) / (l.total ?? 1)) : 0;
    let box = el.querySelector<HTMLElement>('.cover-busy');
    if (!box) {
      el.innerHTML = `<canvas class="cover-preview" hidden></canvas>
        <span class="cover-tag window-badge" hidden>Preview from the sky map (all dates averaged)</span>
        <div class="cover-busy" role="status" aria-live="polite">
          <p class="cover-what"></p>
          <p class="cover-more">This can take a few minutes. You can keep exploring the sky meanwhile.</p>
          <div class="cover-bar"><span></span></div>
        </div>`;
      box = el.querySelector<HTMLElement>('.cover-busy');
    }
    const what = el.querySelector('.cover-what');
    if (what) what.textContent = l.what;
    const bar = el.querySelector<HTMLElement>('.cover-bar');
    bar?.classList.toggle('known', known);
    bar?.style.setProperty('--done', `${pct}%`);
    const pc = el.querySelector<HTMLCanvasElement>('.cover-preview');
    const tag = el.querySelector<HTMLElement>('.cover-tag');
    if (pc && previewCanvas) {
      pc.width = previewCanvas.width;
      pc.height = previewCanvas.height;
      pc.getContext('2d')?.drawImage(previewCanvas, 0, 0);
      pc.hidden = false;
      if (tag) tag.hidden = false;
    }
    // The cover shows only if the wait lasts (GEN-4): 0.25 s.
    if (el.hidden) {
      clearTimeout(coverTimer);
      const wait = Math.max(0, 250 - (performance.now() - l.since));
      coverTimer = window.setTimeout(() => {
        if (S.source === 'loading') el.hidden = false;
      }, wait);
    }
    return;
  }
  // No pictures (FRM-11): say so, say why, offer the five test targets and the practice.
  clearTimeout(coverTimer);
  previewCanvas = null;
  const why =
    noPictures ??
    (S.source === 'simulated'
      ? { why: 'The practice simulation has no pictures in this build.', more: null }
      : { why: 'There are no pictures of this spot in the frame.', more: null });
  el.hidden = false;
  el.innerHTML = `<div class="cover-none">
      <p class="cover-head">${why.retry ? 'No real pictures yet' : 'No real pictures here'}</p>
      <p class="cover-why"></p>
      <p class="cover-why more" ${why.more ? '' : 'hidden'}></p>
      <button class="btn primary cover-retry" data-retry ${why.retry ? '' : 'hidden'}>Ask again</button>
      <p class="cover-label">Real SPHEREx pictures you can open now</p>
      <ul class="cover-targets">${TARGETS.map(
        (t) => `<li><button class="link" data-target="${t.key}">${t.name}</button></li>`,
      ).join('')}</ul>
      <button class="btn cover-practice" data-practice ${SCENARIOS['warm-up'] ? '' : 'hidden'}><span class="pill warn">Simulated</span>Practice on made-up pictures</button>
    </div>`;
  const [w, m] = el.querySelectorAll<HTMLElement>('.cover-why');
  if (w) w.textContent = why.why;
  if (m && why.more) m.textContent = why.more;
  el.querySelectorAll<HTMLElement>('[data-target]').forEach((b) =>
    b.addEventListener('click', () => void loadTarget(b.dataset.target ?? '')),
  );
  el.querySelector('[data-practice]')?.addEventListener('click', () => void loadTarget('warm-up'));
  el.querySelector('[data-retry]')?.addEventListener('click', () => void aimAt(S.ra, S.dec, S.fov));
}
