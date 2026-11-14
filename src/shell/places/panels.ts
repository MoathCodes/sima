/**
 * The places list (a chip's kind, or the tours), a tour, and a place's card (SPEC 4.5, 4.6;
 * PLC-5, PLC-6). Owner: lane G.
 *
 * The list lives in #places-list and the card in #place-card, at the left beside the rail. Only
 * one shows at a time; a card opened from a list or a tour has a Back button to it. Escape closes
 * either (GEN-1, O-I12): each has one `[data-close]` button, found first in its header.
 */
import type { Place } from '../../data/schema.ts';
import { TOURS, type Tour } from '../../data/tours.ts';
import { TARGETS } from '../../core/targets.ts';
import { camera } from '../../sky/sky.ts';
import { inView, onRest, setChosen, setHover, showGroups } from '../../sky/markers.ts';
import { icon } from '../icons.ts';
import { flyFree, openPlace } from '../shell.ts';
import {
  allSources,
  arabicOf,
  bestKnownFirst,
  facts,
  frameFov,
  hasCommonName,
  kindOf,
  nameOf,
  rowLine,
  shortSource,
  sourcesOf,
  spherexNote,
  stopNote,
  tidy,
  zoomFov,
} from '../objects.ts';
import { CUTOUT_SOURCE, drawCutout } from './cutout.ts';
import type { KindChip } from './kinds.ts';
import { makeRoom, watchRoom } from './room.ts';
import { arabicSpan, catalogue, el, iconNode, kindIcon, type Loaded } from './state.ts';

/** How many rows a list shows before "Show more". */
const PAGE = 60;
/** Seconds a playing tour stays at each stop. */
const STOP_SECONDS = 8;

type View =
  | { type: 'kind'; chip: KindChip; filter: number; inView: boolean; shown: number }
  | { type: 'tours' }
  | { type: 'tour'; tour: Tour; at: number; playing: boolean };

let view: View | null = null;
/** Called whenever the open list changes, so the chips can show which one is on. */
let onChange: (open: string | null) => void = () => {};
let stopRest: (() => void) | null = null;
let tourTimer = 0;

function list(): HTMLElement | null {
  return document.getElementById('places-list');
}
function card(): HTMLElement | null {
  return document.getElementById('place-card');
}

/** Sets up the two mounts once. */
export function startPanels(changed: (open: string | null) => void): void {
  onChange = changed;
  const l = list();
  const c = card();
  for (const p of [l, c]) p?.classList.add('pl-panel', 'appear');
  if (l && c) watchRoom([l, c], closeAll);
}

/** Closes the list and the card, and puts the sky's dots back to normal. */
export function closeAll(): void {
  const l = list();
  const c = card();
  if (l) l.hidden = true;
  if (c) c.hidden = true;
  pauseTour();
  stopRest?.();
  stopRest = null;
  view = null;
  showGroups(null);
  setChosen(null);
  setHover(null);
  onChange(null);
}

/** The chip id of the open list ("stars", "tours"), or null. */
export function openList(): string | null {
  if (!view) return null;
  return view.type === 'kind' ? view.chip.id : 'tours';
}

// ----- Panel frame: header with Back, title and close; a body that scrolls ------------------

function frame(
  host: HTMLElement,
  title: string,
  back: { label: string; go: () => void } | null,
  titleNode?: Node,
): HTMLElement {
  const close = el(
    'button.icon-btn.sm',
    { 'data-close': true, 'aria-label': 'Close', 'data-tip': 'Close (Esc)' },
    iconNode(icon('close')),
  );
  close.addEventListener('click', closeAll);
  const head = el('div.pl-head', {}, titleNode ?? el('h2.pl-title', {}, title), close);
  const body = el('div.pl-body', { 'data-scroll': true });
  const parts: Node[] = [];
  if (back) {
    const b = el('button.btn.text.pl-back', {}, `‹ ${back.label}`);
    b.addEventListener('click', back.go);
    parts.push(b);
  }
  host.replaceChildren(...parts, head, body);
  return body;
}

function showList(): HTMLElement | null {
  const l = list();
  const c = card();
  if (!l) return null;
  if (c) c.hidden = true;
  l.hidden = false;
  return l;
}

// ----- A chip's list ---------------------------------------------------------------------------

/** Opens the list for a kind chip (toggles it shut if it is already open). */
export function openKind(chip: KindChip): void {
  if (view?.type === 'kind' && view.chip.id === chip.id && !list()?.hidden) {
    closeAll();
    return;
  }
  pauseTour();
  view = { type: 'kind', chip, filter: 0, inView: false, shown: PAGE };
  showGroups(chip.kinds);
  setChosen(null);
  onChange(chip.id);
  drawKind();
  const l = list();
  if (l) makeRoom(l);
}

function drawKind(scrollTop = 0): void {
  if (view?.type !== 'kind') return;
  const v = view;
  const l = showList();
  if (!l) return;
  const body = frame(l, v.chip.name, null);
  const data = catalogue();

  const filters = el('div.pl-filters', { role: 'group', 'aria-label': 'Show' });
  v.chip.filters.forEach((f, i) => {
    const b = el('button.btn.text.pl-filter', { 'aria-pressed': String(i === v.filter) }, f.name);
    b.addEventListener('click', () => {
      v.filter = i;
      v.shown = PAGE;
      drawKind();
    });
    filters.append(b);
  });

  const where = el('div.seg.pl-where', { role: 'group', 'aria-label': 'Where' });
  for (const [label, inside] of [
    ['Whole sky', false],
    ['In this view', true],
  ] as const) {
    const b = el('button', { 'aria-pressed': String(v.inView === inside) }, label);
    b.addEventListener('click', () => {
      v.inView = inside;
      v.shown = PAGE;
      stopRest?.();
      stopRest = inside ? onRest(() => view === v && drawKind(rowsTop())) : null;
      drawKind();
    });
    where.append(b);
  }

  const note = el('p.pl-note');
  const rows = el('div.pl-rows');
  l.querySelector('.pl-head')?.after(filters, where, note);
  body.append(rows);

  if (!data) {
    note.textContent = 'The catalogue is still loading.';
    return;
  }
  const filter = v.chip.filters[v.filter] ?? v.chip.filters[0];
  const here = v.inView ? new Set(inView().map((d) => d.id)) : null;
  const places = data.cat.places
    .filter((p) => v.chip.has(p) && (filter?.keep(p) ?? true) && (!here || here.has(p.id)))
    .sort(bestKnownFirst);
  const count = places.length.toLocaleString('en-US');
  note.textContent = !places.length
    ? v.inView
      ? 'None in this view. Zoom out, or choose Whole sky.'
      : 'None of these in the catalogue.'
    : v.inView
      ? `${count} in this view, best known first.`
      : `${count} ${v.chip.noun} on the map, best known first. Every one shows as a dot.`;
  for (const p of places.slice(0, v.shown)) rows.append(placeRow(data, p, () => openCard(p, backToList(v))));
  if (places.length > v.shown) {
    const more = el(
      'button.btn.text.pl-more-rows',
      {},
      `Show ${Math.min(PAGE, places.length - v.shown)} more of ${(places.length - v.shown).toLocaleString('en-US')}`,
    );
    more.addEventListener('click', () => {
      v.shown += PAGE;
      drawKind(rowsTop());
    });
    rows.append(more);
  }
  body.scrollTop = scrollTop;
}

function rowsTop(): number {
  return list()?.querySelector('.pl-body')?.scrollTop ?? 0;
}

function backToList(v: View): { label: string; go: () => void } {
  const label = v.type === 'kind' ? v.chip.name : v.type === 'tour' ? v.tour.title : 'Tours';
  return {
    label,
    go: () => {
      view = v;
      setChosen(null);
      if (v.type === 'kind') {
        showGroups(v.chip.kinds);
        drawKind();
      } else if (v.type === 'tour') drawTour();
      else drawTours();
      const l = list();
      if (l) makeRoom(l);
    },
  };
}

/** One row: dark tile, name (and Arabic name), kind and distance. */
function placeRow(data: Loaded, p: Place, choose: () => void): HTMLElement {
  const name = el('span.pl-row-name', {}, nameOf(p));
  if (p.names.arabic) name.append(' ', arabicSpan(p.names.arabic));
  const row = el(
    'button.menu-item.pl-row',
    {},
    el('span.window.pl-tile', {}, iconNode(icon(kindIcon(p.kind)))),
    el('span.pl-row-text', {}, name, el('span.line', {}, rowLine(data.cat, p))),
  );
  row.addEventListener('click', choose);
  row.addEventListener('pointerenter', () => setHover(p.id));
  row.addEventListener('pointerleave', () => setHover(null));
  return row;
}

// ----- Tours -----------------------------------------------------------------------------------

/** Opens the list of tours (toggles it shut if it is open). */
export function openTours(): void {
  if (view?.type === 'tours' && !list()?.hidden) {
    closeAll();
    return;
  }
  pauseTour();
  view = { type: 'tours' };
  showGroups(null);
  setChosen(null);
  onChange('tours');
  drawTours();
  const l = list();
  if (l) makeRoom(l);
}

function drawTours(): void {
  const l = showList();
  if (!l) return;
  const body = frame(l, 'Tours', null);
  body.append(
    el('p.pl-note', {}, 'Short trips around the sky. Each stop flies there and says why it matters.'),
  );
  for (const t of TOURS) {
    const row = el(
      'button.menu-item.pl-row',
      {},
      el('span.window.pl-tile', {}, iconNode(icon('trail'))),
      el(
        'span.pl-row-text',
        {},
        el('span.pl-row-name', {}, t.title),
        el('span.line.pl-clip', {}, `${t.stops.length} stops · ${t.line}`),
      ),
    );
    row.addEventListener('click', () => openTour(t));
    body.append(row);
  }
}

/** Opens one tour at its first stop, paused. */
export function openTour(tour: Tour): void {
  pauseTour();
  view = { type: 'tour', tour, at: -1, playing: false };
  showGroups(null);
  onChange('tours');
  drawTour();
  const l = list();
  if (l) makeRoom(l);
}

function drawTour(): void {
  if (view?.type !== 'tour') return;
  const v = view;
  const l = showList();
  const data = catalogue();
  if (!l || !data) return;
  const body = frame(l, v.tour.title, {
    label: 'Tours',
    go: () => {
      pauseTour();
      view = { type: 'tours' };
      drawTours();
    },
  });
  const play = el(
    'button.btn.primary.pl-play',
    {},
    iconNode(icon(v.playing ? 'pause' : 'play')),
    v.playing ? 'Pause' : v.at < 0 ? 'Play the tour' : 'Play',
  );
  play.addEventListener('click', () => (v.playing ? pauseTour() : playTour()));
  const where = el(
    'span.pl-note',
    {},
    v.at < 0 ? `${v.tour.stops.length} stops` : `Stop ${v.at + 1} of ${v.tour.stops.length}`,
  );
  l.querySelector('.pl-head')?.after(
    el('p.pl-note', {}, v.tour.line),
    el('div.pl-tour-bar', {}, play, where),
  );

  const pictures: { canvas: HTMLCanvasElement; p: Place }[] = [];
  v.tour.stops.forEach((stop, i) => {
    const p = data.byId.get(stop.place);
    if (!p) return; // the tests make sure every stop is in the catalogue
    const canvas = el<HTMLCanvasElement>('canvas.pl-cut', {
      width: '112',
      height: '112',
      role: 'img',
      'aria-label': `${nameOf(p)} on the SPHEREx sky map`,
    });
    pictures.push({ canvas, p });
    const text = el(
      'span.pl-stop-text',
      {},
      el('span.pl-row-name', {}, `${i + 1}. ${nameOf(p)}`),
      el('span.pl-stop-note', {}, stopNote(data.cat, p, stop).join(' ')),
    );
    const row = el(
      'div.pl-stop',
      { 'aria-current': i === v.at ? 'step' : undefined },
      el('span.window.pl-cut-box', {}, canvas),
      text,
    );
    if (i === v.at) {
      if (stop.look) text.append(el('span.pl-stop-look', {}, stop.look));
      const look = el('button.btn.text', {}, 'Look with the frame');
      look.addEventListener('click', () => lookWithFrame(p));
      const open = el('button.btn.text', {}, 'Open its card');
      open.addEventListener('click', () => {
        pauseTour();
        openCard(p, backToList(v), false);
      });
      text.append(el('span.pl-stop-actions', {}, look, open));
    } else {
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.addEventListener('click', () => {
        pauseTour();
        goToStop(i);
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pauseTour();
          goToStop(i);
        }
      });
    }
    row.addEventListener('pointerenter', () => setHover(p.id));
    row.addEventListener('pointerleave', () => setHover(null));
    body.append(row);
  });
  body.append(el('p.pl-caption', {}, `Pictures: ${CUTOUT_SOURCE}.`));
  drawPictures(body, pictures);
  body.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });
}

/** Draws each stop's picture when its row scrolls into view. */
function drawPictures(root: HTMLElement, pictures: { canvas: HTMLCanvasElement; p: Place }[]): void {
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        seen.unobserve(e.target);
        const item = pictures.find((x) => x.canvas === e.target);
        if (!item) continue;
        const { p, canvas } = item;
        const fov = Math.min(4, Math.max(0.5, p.size ? (p.size.major * 1.6) / 60 : 0.5));
        drawCutout(canvas, p.ra, p.dec, fov).catch(() => {
          canvas.replaceWith(el('span.pl-cut-none', {}, 'No picture'));
        });
      }
    },
    { root },
  );
  for (const { canvas } of pictures) seen.observe(canvas);
}

function goToStop(i: number): void {
  if (view?.type !== 'tour') return;
  const data = catalogue();
  const stop = view.tour.stops[i];
  const p = stop && data?.byId.get(stop.place);
  if (!p) return;
  view.at = i;
  setChosen(p.id);
  flyFree(p.ra, p.dec, Math.max(zoomFov(p), 2));
  const top = rowsTop();
  drawTour();
  if (!list()?.querySelector('[aria-current]')) {
    const b = list()?.querySelector('.pl-body');
    if (b) b.scrollTop = top;
  }
}

function playTour(): void {
  if (view?.type !== 'tour') return;
  const v = view;
  v.playing = true;
  const next = () => {
    if (view !== v || !v.playing) return;
    if (v.at + 1 >= v.tour.stops.length) {
      v.playing = false;
      drawTour();
      return;
    }
    goToStop(v.at + 1);
    tourTimer = window.setTimeout(next, STOP_SECONDS * 1000);
  };
  if (v.at + 1 >= v.tour.stops.length) v.at = -1; // finished: play again from the start
  next();
}

function pauseTour(): void {
  clearTimeout(tourTimer);
  if (view?.type === 'tour' && view.playing) {
    view.playing = false;
    drawTour();
  }
}

// ----- A place's card --------------------------------------------------------------------------

function lookWithFrame(p: Place): void {
  const target = TARGETS.find((t) => t.key === p.id)?.key ?? null;
  openPlace({ name: nameOf(p), ra: p.ra, dec: p.dec, fov: frameFov(p), target });
}

/**
 * Opens a place's card (PLC-5) and moves the sky to it.
 * @param back Where Back goes (the list or tour it came from), or null.
 * @param fly Move the sky to the place (default true).
 */
export function openCard(
  p: Place,
  back: { label: string; go: () => void } | null = null,
  fly = true,
): void {
  const c = card();
  const l = list();
  const data = catalogue();
  if (!c || !data) return;
  if (!back) {
    pauseTour();
    view = null;
    showGroups(null);
    onChange(null);
  }
  if (l) l.hidden = true;
  const { cat } = data;

  // Title: the common name; with only catalogue numbers, the kind in plain words leads (O-P3).
  const common = hasCommonName(p);
  const titleBox = el(
    'div.pl-title-box',
    {},
    el('h2.pl-title', {}, common ? nameOf(p) : kindOf(cat, p)),
    el('p.pl-kind', {}, common ? kindOf(cat, p) : `Known by its catalogue name, ${nameOf(p)}`),
  );
  const body = frame(c, '', back, titleBox);

  const ar = arabicOf(cat, p);
  if (ar) {
    body.append(
      el(
        'p.pl-arabic',
        {},
        el('span.pl-label', {}, ar.label),
        ' ',
        arabicSpan(ar.arabic, 'pl-ar-big'),
        ar.gloss ? ` ${ar.gloss}` : '',
        ar.source ? el('span.pl-from', {}, ` (${ar.source})`) : '',
      ),
    );
  }

  const look = el('button.btn.primary', {}, 'Look with the frame');
  look.addEventListener('click', () => lookWithFrame(p));
  const zoom = el('button.btn', {}, 'Zoom to it');
  zoom.addEventListener('click', () => flyFree(p.ra, p.dec, zoomFov(p)));
  body.append(el('div.pl-actions', {}, look, zoom));

  if (p.text) {
    const src = sourcesOf(cat, p, 'text')[0];
    body.append(
      el(
        'div.pl-text',
        {},
        el('p', {}, tidy(p.text)),
        src
          ? el(
              'p.pl-from',
              {},
              'From ',
              el('a.link', { href: src.url, target: '_blank', rel: 'noopener' }, shortSource(src)),
              src.name.includes('CC BY-SA') ? ' (CC BY-SA 4.0)' : '',
            )
          : null,
      ),
    );
  }

  const rows = facts(cat, p);
  if (rows.length) {
    const dl = el('dl.pl-facts');
    for (const f of rows) {
      dl.append(
        el('dt', {}, f.label),
        el('dd', {}, f.value, f.detail ? el('span.pl-detail', {}, f.detail) : null),
      );
    }
    body.append(dl);
  }

  const note = spherexNote(p);
  if (note) {
    body.append(
      el(
        'div.pl-spherex',
        {},
        el('p.group-label', {}, note.fromCatalogue ? 'In SPHEREx' : 'In SPHEREx: what to try'),
        el('p', {}, note.text),
      ),
    );
  }

  const sources = allSources(cat, p);
  const foot = el('p.pl-sources', {}, 'Facts: ');
  sources.forEach((s, i) => {
    if (i) foot.append(' · ');
    foot.append(el('a.link', { href: s.url, target: '_blank', rel: 'noopener' }, shortSource(s)));
  });
  body.append(foot);

  c.hidden = false;
  body.scrollTop = 0;
  setChosen(p.id);
  makeRoom(c);
  if (fly) {
    const wide = camera().fov;
    flyFree(p.ra, p.dec, wide > 40 ? 20 : undefined);
  }
}
