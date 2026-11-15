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
import { reducedMotion } from './playback.ts';
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
import { hangPopover } from './tools/dom.ts';
import { t as tr } from '../shell/i18n.ts';

const VIEW_NAMES: Record<Mode, [string, IconName, string]> = {
  flip: [tr('view.flip'), 'flip', tr('view.flip.tip')],
  swipe: [tr('view.swipe'), 'swipe', tr('view.swipe.tip')],
  two: [tr('view.two'), 'two', tr('view.two.tip')],
  diff: [tr('view.diff'), 'diff', tr('view.diff.tip')],
  stack: [tr('view.stack'), 'stack', tr('view.stack.tip')],
  trail: [tr('view.trail'), 'trail', tr('view.trail.tip')],
};

/** What each view shows, in Measure's explanation line. */
const EXPLAIN: Record<Mode, string> = {
  flip: tr('explain.flip'),
  swipe: tr('explain.swipe'),
  two: tr('explain.two'),
  diff: tr('explain.diff'),
  stack: tr('explain.stack'),
  trail: tr('explain.trail'),
};

const SOURCE: Record<string, { cls: string; text: string; tip: string }> = {
  real: {
    cls: 'real',
    text: tr('src.real'),
    tip: tr('src.realTip'),
  },
  live: {
    cls: 'real',
    text: tr('src.live'),
    tip: tr('src.liveTip'),
  },
  simulated: {
    cls: 'sim',
    text: tr('honest.simulated'),
    tip: tr('src.simTip'),
  },
  none: {
    cls: 'none',
    text: tr('src.none'),
    tip: tr('src.noneTip'),
  },
  loading: {
    cls: 'loading',
    text: tr('src.loading'),
    tip: tr('src.loadingTip'),
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
  startPopovers();
  header();
  views();
  lines();
  cover();
  startStrip();
}

// ----- Popovers: the field size and "About this picture" ------------------------------------------

/**
 * Two popovers live in the frame, made once: the field sizes (from the header's "6′" button) and
 * "About this picture" (from the ⓘ by the source line): the full data line, what the view shows
 * and the legend of the marks, which the header and the picture keep short (redesign item 1).
 */
function startPopovers(): void {
  const frame = document.getElementById('frame');
  if (!frame || document.getElementById('frame-fovs')) return;
  const fovs = document.createElement('div');
  fovs.id = 'frame-fovs';
  fovs.className = 'popover appear frame-pop fovs-menu';
  fovs.popover = 'auto';
  fovs.setAttribute('role', 'menu');
  fovs.setAttribute('aria-label', tr('frame.fov'));
  fovs.dataset.overlay = 'frame-fovs';
  const more = document.createElement('div');
  more.id = 'frame-more';
  more.className = 'popover appear frame-pop frame-more';
  more.popover = 'auto';
  more.setAttribute('role', 'dialog');
  more.setAttribute('aria-label', tr('frame.about'));
  more.dataset.overlay = 'frame-more';
  frame.append(fovs, more);
  hangPopover(() => document.querySelector<HTMLElement>('#frame-head .frame-fov'), fovs, 'end');
  hangPopover(() => document.querySelector<HTMLElement>('#frame-head .frame-info'), more, 'start', 300);
  fovs.addEventListener('beforetoggle', (e) => {
    if ((e as ToggleEvent).newState !== 'open') return;
    fovs.innerHTML = FOVS.map(
      (f) =>
        `<button type="button" class="menu-item" role="menuitemradio" aria-checked="${f === S.fov}" data-fov="${f}" data-guide="fov-${f}">${f}′</button>`,
    ).join('');
  });
  fovs.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest<HTMLElement>('[data-fov]');
    if (!b) return;
    fovs.hidePopover();
    void setFov(Number(b.dataset.fov) as (typeof FOVS)[number]);
  });
  more.addEventListener('beforetoggle', (e) => {
    if ((e as ToggleEvent).newState === 'open') fillMore();
  });
}

/** Fills "About this picture" from the lines the frame keeps for Discover and phones. */
function fillMore(): void {
  const more = document.getElementById('frame-more');
  if (!more) return;
  const [name] = VIEW_NAMES[S.mode];
  const legend = document.getElementById('frame-legend');
  const marks = legend && !legend.hidden ? legend.innerHTML : '';
  const html = `<p class="fm-line"></p><p class="fm-view"><b>${name}</b> <span></span></p>${marks ? `<div class="lg fm-legend">${marks}</div>` : ''}`;
  if (more.dataset.html !== html) {
    more.dataset.html = html;
    more.innerHTML = html;
  }
  const line = more.querySelector('.fm-line');
  if (line) line.textContent = exif();
  const view = more.querySelector('.fm-view span');
  if (view) view.textContent = EXPLAIN[S.mode];
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
      ? { ...base, text: tr('src.realHow', { how: liveWords(live) }), tip: liveTip(live) }
      : base;
  // An embedded page shows only the frame, the bar and Measure: hiding the frame would empty it.
  // (main.ts marks <html> before the frame starts; S.embed is set later, by url.ts.)
  const embedded = document.documentElement.hasAttribute('data-embed');
  head.className = 'frame-head';
  head.dataset.drag = '';
  const html = `
    <div class="frame-name">
      <h2 class="frame-title"></h2>
      <p class="frame-source ${src?.cls ?? ''}"><span class="frame-dot" aria-hidden="true"></span><span class="term" tabindex="0" data-tip="${src?.tip ?? ''}">${src?.text ?? ''}</span><span class="frame-prov term" tabindex="0" data-guide="data-line"></span><span class="frame-rel"></span>${named ? `<span class="frame-coords"> · ${formatCoords(S.ra, S.dec)}</span>` : ''}${measure && !discover ? `<button type="button" class="icon-btn xs frame-info" popovertarget="frame-more" aria-label="${tr('frame.about')}" data-tip="${tr('frame.about')}" data-guide="frame-info">${icon('info')}</button>` : ''}</p>
    </div>
    <div class="frame-actions">
      <button type="button" class="btn text frame-fov" popovertarget="frame-fovs" aria-label="${tr('frame.fovLabel', { n: S.fov })}" data-tip="${tr('frame.fovTip')}" data-guide="fov">${S.fov}′${icon('chevron-down')}</button>
      ${measure ? `<button class="icon-btn sm" data-tools aria-pressed="${S.tools}" aria-label="${tr('frame.tools')}" data-tip="${tr('frame.tools')}" data-guide="tools-button">${icon('sliders')}</button>` : ''}
      ${discover ? '' : `<button class="btn text frame-measure" data-measure aria-pressed="${open}" data-guide="measure" data-tip="${open ? (expert ? tr('frame.closeMeasure') : tr('frame.simple')) : tr('frame.measureTip')}">${icon('chart')}<span>${tr('word.measure')}</span></button>`}
      ${embedded ? '' : `<button class="icon-btn sm" data-hide aria-label="${tr('frame.hide')}" data-tip="${tr('frame.hide')}" data-guide="frame-hide">${icon('close')}</button>`}
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
  const list = VIEWS[S.level];
  box.className = `seg frame-views${S.level === 'measure' ? ' six' : ''}`;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', tr('top.view'));
  // One pill slides under the chosen view (redesign item 4): equal columns, so its place is the
  // view's index. Words when the frame is wide enough, icons alone (named in the tooltip) when not.
  box.style.setProperty('--n', String(list.length));
  box.style.setProperty('--i', String(Math.max(0, list.indexOf(S.mode))));
  const html = list
    .map((m) => {
      const [label, name, tip] = VIEW_NAMES[m];
      return `<button data-mode="${m}" data-guide="view-${m}" aria-label="${label}" data-tip="${label}: ${tip.charAt(0).toLowerCase()}${tip.slice(1)}" ${off ? 'disabled' : ''}>${icon(name)}<span>${label}</span></button>`;
    })
    .join('');
  // Rebuilt only when the set of views changes, so the pill can slide between them.
  if (box.dataset.html !== html) {
    box.dataset.html = html;
    box.innerHTML = `<span class="fv-pill" aria-hidden="true"></span>${html}`;
    box.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        S.mode = b.dataset.mode as Mode;
      }),
    );
  }
  box.toggleAttribute('data-none', !list.includes(S.mode));
  box.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
    b.setAttribute('aria-pressed', String(S.mode === b.dataset.mode)),
  );
}

// ----- Lines ------------------------------------------------------------------------------------

function lines(): void {
  // Discover and phones: the full data line under the name (H2; BEGINNER-AND-MOBILE 5.3, 11.4).
  // Discover and phones: one short line after the source dot (dataLine); its tooltip says the rest.
  const prov = document.querySelector<HTMLElement>('#frame-head .frame-prov');
  if (prov) {
    prov.textContent = dataLine();
    const src = document.querySelector<HTMLElement>('#frame-head .frame-source > .term:not(.frame-prov)');
    prov.dataset.tip = [src?.dataset.tip, exif()].filter(Boolean).join('. ');
  }
  // Expert: the release after the source, "Real data · DR1"; the picture's badge gives its date and
  // wavelength, and "About this picture" the rest (H2 in one short line, redesign item 2).
  const rel = document.querySelector<HTMLElement>('#frame-head .frame-rel');
  if (rel) {
    const r = S.field && !S.field.simulated ? releaseWords(S.field.releases) : '';
    rel.textContent = r ? ` · ${r}` : '';
    rel.dataset.tip = r ? tr('frame.release', { r }) : '';
  }
  if (document.getElementById('frame-more')?.matches(':popover-open')) fillMore();
  const ex = document.getElementById('frame-exif');
  if (ex) {
    ex.className = 'frame-exif';
    ex.textContent = exif();
  }
  const explain = document.getElementById('frame-explain');
  if (explain) {
    explain.className = 'frame-explain';
    // Less motion asked for: the frame opens on a still Two dates; say why (UX audit #10).
    const still = reducedMotion() && S.mode === 'two' && !!S.field;
    explain.hidden = !still && (S.level !== 'measure' || !S.field);
    explain.textContent = still
      ? tr('frame.still')
      : EXPLAIN[S.mode];
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
    // While a new spot loads, the cover over the picture says so: no second line here.
    const text = busy
      ? ''
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
          ? `<span class="load-bar${known ? ' known' : ''}" style="--done:${pct}%" role="progressbar" aria-label="${tr('frame.wider')}" ${known ? `aria-valuenow="${pct}"` : ''}><span></span></span>`
          : ''
      }${
        w?.state === 'failed'
          ? `<button type="button" class="link load-retry" data-widen-retry>${tr('frame.askAgain')}</button>`
          : ''
      }<span class="load-text"></span>`;
      const t = load.querySelector('.load-text');
      if (t) t.textContent = text;
    }
    load.dataset.tip = text;
    load.toggleAttribute('data-empty', !text && !w);
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
        <span class="cover-tag window-badge" hidden>${tr('frame.preview')}</span>
        <div class="cover-busy" role="status" aria-live="polite">
          <p class="cover-what"></p>
          <p class="cover-more">${tr('frame.coverMore')}</p>
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
      ? { why: tr('frame.noPractice'), more: null }
      : { why: tr('frame.noSpot'), more: null });
  el.hidden = false;
  el.innerHTML = `<div class="cover-none">
      <p class="cover-head">${why.retry ? tr('frame.noneYet') : tr('frame.noneHere')}</p>
      <p class="cover-why"></p>
      <p class="cover-why more" ${why.more ? '' : 'hidden'}></p>
      <button class="btn primary cover-retry" data-retry ${why.retry ? '' : 'hidden'}>${tr('frame.askAgain')}</button>
      <p class="cover-label">${tr('frame.openNow')}</p>
      <ul class="cover-targets">${TARGETS.map(
        (t) => `<li><button class="link" data-target="${t.key}">${t.name}</button></li>`,
      ).join('')}</ul>
      <button class="btn cover-practice" data-practice ${SCENARIOS['warm-up'] ? '' : 'hidden'}><span class="pill warn">${tr('honest.simulated')}</span>${tr('frame.practice')}</button>
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

/** "spherex_dr1" → "SPHEREx DR1"; several releases joined: "SPHEREx DR1 + QR". */
function releaseWords(releases: readonly string[]): string {
  const r = [...new Set(releases.map((x) => x.replace(/^spherex_/i, '').toUpperCase()))];
  return r.length ? `SPHEREx ${r.join(' + ')}` : '';
}
