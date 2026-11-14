/**
 * Catalogue search on the sky view (O-V5): "Fast movers" from Gaia DR3 and "Cold objects" from
 * CatWISE2020, asked of VizieR from the browser, shown as a paged list and as marks on the sky.
 * The cuts, addresses and reading of the answers are in core/finds.ts.
 *
 * - It opens from the "Catalogue search" chip and from search ("fast movers", "cold", "pm>300").
 *   It sits where the places list sits (#finds, beside the rail), and only one of the two shows.
 * - It searches only when asked ("Search this view"), within the view or the widest circle VizieR
 *   answers from the browser, and says which. When the view moves, it offers to search again.
 * - A VizieR mirror that fails is named and the next one asked; when all fail the panel says so
 *   with "Try again", never "none found" (H5). Rows are "catalogue sources", never finds or
 *   discoveries (H7), and every value is the catalogue's (H4).
 */
import {
  CUTS,
  MIRRORS,
  SPHEREX_YEAR,
  W2_LIMIT,
  areaWords,
  coldObjects,
  coldUrl,
  fastMovers,
  fastMoverUrl,
  pageOf,
  placeAt,
  rowValues,
  searchArea,
  type CatalogueFind,
  type FindArea,
  type FindCat,
  type FindResult,
} from '../core/finds.ts';
import { camera } from '../sky/sky.ts';
import { onFindClick, onRest, setFindHover, setFinds } from '../sky/markers.ts';
import { addSearchSource, type SearchHit } from '../viewer/omnibox.ts';
import { flyFree, openPlace } from './shell.ts';
import { icon } from './icons.ts';
import { closeAll as closePlaces } from './places/panels.ts';
import { TARGETS } from '../core/targets.ts';
import { propagate, separation } from '../core/astro.ts';
import { makeRoom, watchRoom } from './places/room.ts';

/** How long one mirror may take before the next is asked, ms (Gaia took up to 18 s). */
const MIRROR_TIMEOUT = 40_000;

type Phase =
  | { kind: 'idle' }
  | { kind: 'asking'; mirror: string; since: number; tried: string[] }
  | { kind: 'failed'; why: string[] }
  | { kind: 'done'; result: FindResult; mirror: string; page: number; at: { ra: number; dec: number } };

interface State {
  cat: FindCat;
  pm: number;
  colour: number;
  phase: Phase;
  /** The row ringed on the sky. */
  chosen: string | null;
}

const st: State = { cat: 'gaia', pm: CUTS.pm.value, colour: CUTS.colour.value, phase: { kind: 'idle' }, chosen: null };
let asking: AbortController | null = null;
let ticker = 0;
let moved = false;

const NAMES: Record<FindCat, { tab: string; cat: string }> = {
  gaia: { tab: 'Fast movers', cat: 'Gaia DR3' },
  catwise: { tab: 'Cold objects', cat: 'CatWISE2020' },
};

function panel(): HTMLElement | null {
  return document.getElementById('finds');
}

/** Wires the panel, the sky marks and the search words. Called once by main.ts. */
export function startFinds(): void {
  const p = panel();
  if (!p) return;
  p.classList.add('fd-panel');
  p.setAttribute('aria-label', 'Catalogue search');
  watchRoom([p], closeFinds);
  // Only one panel in the left column: a places list or card that opens closes this one.
  const other = ['places-list', 'place-card', 'sandbox'].map((id) => document.getElementById(id));
  new MutationObserver(() => {
    if (!p.hidden && other.some((o) => o && !o.hidden)) closeFinds();
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  onRest(() => {
    if (p.hidden || st.phase.kind !== 'done') return;
    const c = camera();
    const at = st.phase.at;
    const shift = Math.hypot((c.ra - at.ra) * Math.cos((c.dec * Math.PI) / 180), c.dec - at.dec);
    const now = shift > Math.max(0.02, st.phase.result.area.radius * 0.25);
    if (now !== moved) {
      moved = now;
      draw();
    }
  });
  onFindClick((f) => {
    if (st.phase.kind !== 'done') return;
    const i = st.phase.result.rows.findIndex((r) => r.id === f.id);
    if (i < 0) return;
    if (p.hidden) showPanel();
    st.chosen = f.id;
    st.phase.page = Math.floor(i / 20);
    setFindHover(f.id);
    draw();
    p.querySelector<HTMLElement>(`[data-row="${CSS.escape(f.id)}"]`)?.scrollIntoView({ block: 'nearest' });
  });
  addSearchSource({ name: 'catalogue filters', label: 'Catalogue search in this view', search: searchWords });
}

/**
 * Opens the panel on one filter.
 * @param run Search at once (from search words, where the user already asked).
 */
export function openFinds(cat: FindCat = st.cat, opts: { pm?: number; colour?: number; run?: boolean } = {}): void {
  if (cat !== st.cat) {
    st.cat = cat;
    st.phase = { kind: 'idle' };
    clearMarks();
  }
  if (opts.pm !== undefined) st.pm = clampCut('pm', opts.pm);
  if (opts.colour !== undefined) st.colour = clampCut('colour', opts.colour);
  showPanel();
  if (opts.run) void search();
}

/** True while the panel is open. */
export function findsOpen(): boolean {
  return !(panel()?.hidden ?? true);
}

/** Closes the panel and takes its marks off the sky. */
export function closeFinds(): void {
  const p = panel();
  if (!p || p.hidden) return;
  p.hidden = true;
  asking?.abort();
  clearMarks();
  setChip(false);
}

function showPanel(): void {
  const p = panel();
  if (!p) return;
  closePlaces();
  document.querySelector<HTMLElement>('#sandbox:not([hidden]) [data-close]')?.click();
  p.hidden = false;
  draw();
  makeRoom(p);
  setChip(true);
  if (st.phase.kind === 'done') showMarks(st.phase.result);
}

function setChip(on: boolean): void {
  document.querySelector('[data-guide="chip-catalogues"]')?.setAttribute('aria-pressed', String(on));
}

function clampCut(which: 'pm' | 'colour', v: number): number {
  const c = CUTS[which];
  return Math.min(c.max, Math.max(c.min, v));
}

// ----- Asking VizieR ------------------------------------------------------------------------

async function search(): Promise<void> {
  asking?.abort();
  const ctl = new AbortController();
  asking = ctl;
  const c = camera();
  const area = searchArea(st.cat, { ra: c.ra, dec: c.dec }, c.fov, c.width, c.height);
  const cat = st.cat;
  const pm = st.pm;
  const colour = st.colour;
  const url = (base: string) =>
    cat === 'gaia' ? fastMoverUrl(area, pm, undefined, base) : coldUrl(area, W2_LIMIT, undefined, base);
  const read = (text: string) =>
    cat === 'gaia' ? fastMovers(text, area, pm) : coldObjects(text, area, colour);
  const tried: string[] = [];
  clearMarks();
  st.chosen = null;
  moved = false;
  for (const mirror of MIRRORS) {
    st.phase = { kind: 'asking', mirror: mirror.name, since: performance.now(), tried: [...tried] };
    draw();
    tick();
    const timer = new AbortController();
    const stop = window.setTimeout(() => timer.abort(), MIRROR_TIMEOUT);
    const onAbort = () => timer.abort();
    ctl.signal.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(url(mirror.url), { signal: timer.signal });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      const text = await res.text();
      const result = read(text);
      if (asking !== ctl) return;
      lastCatwise = cat === 'catwise' ? { text, area } : null;
      st.phase = { kind: 'done', result, mirror: mirror.name, page: 0, at: { ra: c.ra, dec: c.dec } };
      showMarks(result);
      draw();
      return;
    } catch (err) {
      if (ctl.signal.aborted) return;
      const why = timer.signal.aborted
        ? `did not answer within ${MIRROR_TIMEOUT / 1000} s`
        : String((err as Error)?.message ?? err).replace(/^VizieR /, '');
      tried.push(`${mirror.name}: ${why}`);
    } finally {
      clearTimeout(stop);
      ctl.signal.removeEventListener('abort', onAbort);
    }
  }
  if (asking !== ctl) return;
  st.phase = { kind: 'failed', why: tried };
  draw();
}

/** Counts the seconds while VizieR is asked (GEN-4: say how far). */
function tick(): void {
  clearInterval(ticker);
  ticker = window.setInterval(() => {
    const el = panel()?.querySelector('.fd-wait');
    if (st.phase.kind !== 'asking' || !el) {
      clearInterval(ticker);
      return;
    }
    el.textContent = `${Math.round((performance.now() - st.phase.since) / 1000)} s`;
  }, 1000);
}

function showMarks(r: FindResult): void {
  setFinds(
    r.rows.map((f) => ({ id: f.id, name: f.id, cat: f.cat, ...placeAt(f) })),
    { ra: r.area.ra, dec: r.area.dec, radius: r.area.radius },
  );
  setFindHover(st.chosen);
}

function clearMarks(): void {
  setFinds([], null);
  setFindHover(null);
}

// ----- Drawing the panel --------------------------------------------------------------------

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function draw(): void {
  const p = panel();
  if (!p || p.hidden) return;
  const keepScroll = p.querySelector('.fd-list')?.scrollTop ?? 0;

  const close = h('button', 'icon-btn sm');
  close.innerHTML = icon('close');
  close.dataset.close = '';
  close.setAttribute('aria-label', 'Close');
  close.dataset.tip = 'Close (Esc)';
  close.addEventListener('click', closeFinds);
  const head = h('div', 'fd-head');
  head.append(h('h2', 'fd-title', 'Catalogue search'), close);

  const lede = h(
    'p',
    'fd-lede',
    'Sources listed in a star catalogue, in the sky view. They are catalogue sources, not discoveries.',
  );

  const seg = h('div', 'seg fd-seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Which filter');
  for (const cat of ['gaia', 'catwise'] as const) {
    const b = h('button', '', NAMES[cat].tab);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(st.cat === cat));
    b.dataset.guide = `finds-${cat === 'gaia' ? 'fast' : 'cold'}`;
    b.addEventListener('click', () => {
      if (st.cat === cat) return;
      asking?.abort();
      st.cat = cat;
      st.phase = { kind: 'idle' };
      clearMarks();
      draw();
    });
    seg.append(b);
  }

  const cut = h('div', 'fd-cut');
  const which = st.cat === 'gaia' ? 'pm' : 'colour';
  const c = CUTS[which];
  const input = h('input', 'field fd-num');
  input.type = 'number';
  input.min = String(c.min);
  input.max = String(c.max);
  input.step = String(c.step);
  input.value = String(which === 'pm' ? st.pm : st.colour);
  input.dataset.guide = 'finds-cut';
  const label = h('label', 'fd-cut-label');
  const before = st.cat === 'gaia' ? 'Total motion above' : 'W1−W2 colour above';
  label.append(before, input, h('span', 'fd-unit', c.unit));
  input.setAttribute('aria-label', `${before}, ${c.unit}`);
  input.addEventListener('change', () => {
    const v = Number(input.value);
    if (!Number.isFinite(v)) return;
    if (which === 'pm') st.pm = clampCut('pm', v);
    else st.colour = clampCut('colour', v);
    input.value = String(which === 'pm' ? st.pm : st.colour);
    // CatWISE's colour cut is made here, on the rows already sent: no need to ask again.
    if (which === 'colour' && st.phase.kind === 'done' && st.phase.result.cat === 'catwise') rerunColour();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.dispatchEvent(new Event('change'));
      void search();
    }
  });
  const note = h(
    'p',
    'fd-note',
    st.cat === 'gaia'
      ? 'Gaia DR3 (ESA), total proper motion. Barnard’s Star moves 10,393 mas/yr; most stars under 50.'
      : `CatWISE2020, sources brighter than ${W2_LIMIT} in W2 (4.6 µm). A large W1−W2 means much brighter at 4.6 µm than at 3.4 µm, as cold brown dwarfs are; WISE 0855−0714 is about 4.`,
  );
  // Once there is a list, the explanations give it their room (1366×768); the cut stays in force.
  const listed = st.phase.kind === 'done' && st.phase.result.rows.length > 0;
  cut.append(label);
  if (!listed) cut.append(note);

  const cam = camera();
  const area = searchArea(st.cat, { ra: cam.ra, dec: cam.dec }, cam.fov, cam.width, cam.height);
  const areaLine = h('p', 'fd-area');
  areaLine.textContent = area.clipped
    ? listed
      ? `Searches only ${areaWords(area)}, the widest VizieR answers. Zoom in to cover the view.`
      : `The view is wider than ${NAMES[st.cat].cat} can be searched from the browser: only ${areaWords(area)} is searched. Zoom in to cover all of it.`
    : `Searches the view: ${areaWords(area)}.`;

  const go = h('button', 'btn primary fd-go', st.phase.kind === 'done' ? 'Search this view again' : 'Search this view');
  go.dataset.guide = 'finds-search';
  go.disabled = st.phase.kind === 'asking';
  go.addEventListener('click', () => {
    input.dispatchEvent(new Event('change'));
    void search();
  });

  const body = h('div', 'fd-body');
  body.append(status());

  p.replaceChildren(head, ...(listed ? [] : [lede]), seg, cut, areaLine, go, body);
  const list = p.querySelector('.fd-list');
  if (list) list.scrollTop = keepScroll;
}

function status(): HTMLElement {
  const box = h('div', 'fd-status');
  box.setAttribute('role', 'status');
  const ph = st.phase;
  if (ph.kind === 'idle') {
    box.append(h('p', 'fd-line', 'Nothing asked yet. VizieR usually answers in 5 to 20 seconds.'));
    return box;
  }
  if (ph.kind === 'asking') {
    const line = h('p', 'fd-line fd-asking');
    line.append(`Asking ${ph.mirror} for ${NAMES[st.cat].cat}… `, h('span', 'fd-wait', '0 s'));
    box.append(line);
    for (const t of ph.tried) box.append(h('p', 'fd-line fd-tried', `Tried first: ${t}.`));
    box.append(h('p', 'fd-line fd-meanwhile', 'It can take up to a minute. The sky and the frame work meanwhile.'));
    return box;
  }
  if (ph.kind === 'failed') {
    box.append(
      h(
        'p',
        'fd-line fd-failed',
        `${NAMES[st.cat].cat} could not be asked, so nothing is listed. That does not mean there is nothing here.`,
      ),
    );
    for (const w of ph.why) box.append(h('p', 'fd-line fd-tried', `${w}.`));
    const again = h('button', 'btn fd-retry', 'Try again');
    again.dataset.guide = 'finds-retry';
    again.addEventListener('click', () => void search());
    box.append(again);
    return box;
  }
  const r = ph.result;
  const n = r.rows.length;
  const what = r.cat === 'gaia' ? 'fast mover' : 'cold object';
  const head = h('p', 'fd-line fd-count');
  const checked = r.cat === 'catwise' ? ` of ${r.looked.toLocaleString('en')} checked` : '';
  const term = h('span', 'term', 'catalogue’s values');
  term.tabIndex = 0;
  term.dataset.tip = `Not measured here (H4). Marked on the sky where each is in early ${Math.floor(SPHEREX_YEAR)}, moved by its catalogue motion.`;
  head.append(
    h('b', '', n ? `${n} catalogue source${n === 1 ? '' : 's'}` : 'No catalogue source'),
    `${checked}: ${r.cut}. From ${ph.mirror}, with the `,
    term,
    '.',
  );
  box.append(head);
  if (r.capped)
    box.append(
      h(
        'p',
        'fd-line fd-capped',
        r.cat === 'gaia'
          ? `VizieR had more than ${r.looked}: these are the ${r.looked} fastest it sent. Zoom in or raise the cut to see the rest.`
          : `VizieR had more than ${r.looked} sources this bright: only the ${r.looked} nearest the middle were checked. Zoom in to check the rest.`,
      ),
    );
  if (r.noColour)
    box.append(h('p', 'fd-line fd-note', `${r.noColour} have no W1 value, so no colour, and are not listed.`));
  if (moved) {
    const again = h('button', 'btn text fd-moved', 'The view has moved: search it again');
    again.addEventListener('click', () => void search());
    box.append(again);
  }
  if (!n) return box;
  const pg = pageOf(r.rows, ph.page);
  const list = h('ol', 'fd-list');
  list.dataset.scroll = '';
  list.setAttribute('aria-label', `${what}s, ${pg.from} to ${pg.to} of ${pg.total}`);
  pg.rows.forEach((f, i) => list.append(row(f, pg.from + i)));
  box.append(list);
  if (pg.pages > 1) {
    const pager = h('div', 'fd-pager');
    const prev = h('button', 'btn text', '‹ Previous');
    const next = h('button', 'btn text', 'Next ›');
    prev.disabled = pg.page === 0;
    next.disabled = pg.page >= pg.pages - 1;
    prev.addEventListener('click', () => turn(-1));
    next.addEventListener('click', () => turn(1));
    pager.append(prev, h('span', 'fd-pages', `${pg.from}–${pg.to} of ${pg.total}`), next);
    box.append(pager);
  }
  return box;
}

function turn(by: number): void {
  if (st.phase.kind !== 'done') return;
  st.phase.page += by;
  draw();
  panel()?.querySelector('.fd-list')?.scrollTo({ top: 0 });
}

function row(f: CatalogueFind, n: number): HTMLElement {
  const li = h('li', 'fd-row');
  li.dataset.row = f.id;
  if (f.id === st.chosen) li.classList.add('chosen');
  const name = h('button', 'fd-name');
  name.append(h('span', 'fd-n', `${n}`), h('span', 'fd-id', f.id));
  name.dataset.tip = 'Show it on the sky';
  name.addEventListener('click', () => {
    st.chosen = f.id;
    setFindHover(f.id);
    const at = placeAt(f);
    flyFree(at.ra, at.dec);
    draw();
  });
  const vals = h('p', 'fd-vals', rowValues(f).join(' · '));
  const look = h('button', 'btn text fd-look', 'Look with the frame');
  look.dataset.guide = 'finds-look';
  look.addEventListener('click', () => {
    st.chosen = f.id;
    setFindHover(f.id);
    const at = placeAt(f);
    openPlace({ name: f.id, ra: at.ra, dec: at.dec, fov: 6, target: shippedAt(at)?.key ?? null });
    draw();
  });
  li.append(name, vals, look);
  li.addEventListener('pointerenter', () => setFindHover(f.id));
  li.addEventListener('pointerleave', () => setFindHover(st.chosen));
  return li;
}

/**
 * The shipped test target at this place in early 2026 (within 30″), if any: its real pictures
 * are opened rather than an empty spot (Barnard's Star leads the fast movers near it).
 */
function shippedAt(at: { ra: number; dec: number }): (typeof TARGETS)[number] | null {
  return (
    TARGETS.find((t) => {
      const p = propagate(t.ra, t.dec, t.pmra, t.pmdec, t.ep, SPHEREX_YEAR);
      return separation(p.ra, p.dec, at.ra, at.dec) * 3600 < 30;
    }) ?? null
  );
}

/** A new colour cut on CatWISE rows already sent: no new question to VizieR. */
function rerunColour(): void {
  if (st.phase.kind !== 'done') return;
  // The rows sent are kept in `lastCatwise`; the cut is applied again to them.
  if (!lastCatwise) return;
  const result = coldObjects(lastCatwise.text, lastCatwise.area, st.colour);
  st.phase = { ...st.phase, result, page: 0 };
  showMarks(result);
  draw();
}
let lastCatwise: { text: string; area: FindArea } | null = null;

// ----- Search words -------------------------------------------------------------------------

const FAST_WORDS = ['fast', 'fast movers', 'movers', 'moving', 'proper motion', 'high proper motion', 'pm', 'gaia', 'runaway'];
const COLD_WORDS = ['cold', 'cold objects', 'brown dwarf', 'brown dwarfs', 'catwise', 'w1-w2', 'w1−w2', 'colour', 'color', 'cool', 'y dwarf'];

function matches(q: string, words: readonly string[]): boolean {
  return words.some((w) => w === q || (q.length >= 3 && (w.startsWith(q) || q.startsWith(`${w} `))));
}

/** "pm>300", "pm 300", "w1-w2>2", "colour > 2.5": a number for the cut, if given. */
function numberIn(q: string): number | undefined {
  const m = q.match(/(?:>|above|over|\s)\s*(\d+(?:\.\d+)?)\s*(?:mas\/?yr|mag)?\s*$/);
  return m ? Number(m[1]) : undefined;
}

function searchWords(query: string): SearchHit[] {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const bare = q.replace(/\s*(?:>|above|over)?\s*\d+(?:\.\d+)?\s*(?:mas\/?yr|mag)?\s*$/, '').trim();
  const hits: SearchHit[] = [];
  const value = numberIn(q);
  if (matches(bare, FAST_WORDS)) {
    const pm = value !== undefined ? clampCut('pm', value) : st.pm;
    hits.push({
      name: 'Fast movers in this view',
      line: `Gaia DR3 sources moving faster than ${pm} mas/yr`,
      icon: 'path',
      score: 0.9,
      choose: () => openFinds('gaia', { pm, run: true }),
    });
  }
  if (matches(bare, COLD_WORDS)) {
    const colour = value !== undefined ? clampCut('colour', value) : st.colour;
    hits.push({
      name: 'Cold objects in this view',
      line: `CatWISE2020 sources with W1−W2 above ${colour.toFixed(1)} mag`,
      icon: 'star',
      score: 0.9,
      choose: () => openFinds('catwise', { colour, run: true }),
    });
  }
  return hits;
}
