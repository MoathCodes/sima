/**
 * Places: the chips, the lists, the place cards, the Places menu, tours and saved places
 * (PLC-4 to PLC-7). Owner: lane G.
 *
 * It reads the catalogue (src/data/places.json, built by lane A; its type is src/data/schema.ts),
 * plugs it into search (viewer/omnibox.ts `addSearchSource`), gives dots to the sky
 * (sky/markers.ts `setDots`, `showGroups`) and moves the frame or the sky through shell.ts
 * (`openPlace`, `flyFree`). The catalogue is loaded on its own (a dynamic import), so the first
 * page does not wait for it.
 *
 * Parts: objects.ts (facts in words), places/search.ts (matching), places/kinds.ts (chips and
 * filters), places/panels.ts (lists, tours, cards), places/cutout.ts (tour pictures),
 * places/room.ts (keeping clear of other cards), places/state.ts (shared), src/data/tours.ts.
 */
import { addSearchSource, type SearchHit } from '../viewer/omnibox.ts';
import { onDotClick, onPinClick, setDots, setPins, type Dot } from '../sky/markers.ts';
import { camera, flyTo } from '../sky/sky.ts';
import { openPlace } from './shell.ts';
import { icon, type IconName } from './icons.ts';
import { openStarter, STARTERS } from '../explore/game.ts';
import { TARGETS } from '../core/targets.ts';
import type { Place, PlacesCatalogue } from '../data/schema.ts';
import { hasCommonName, nameOf, rowLine, tidy } from './objects.ts';
import { find } from './places/search.ts';
import { KIND_CHIPS } from './places/kinds.ts';
import { closeAll, openCard, openKind, openTours, startPanels } from './places/panels.ts';
import { catalogue, el, iconNode, kindIcon, setCatalogue } from './places/state.ts';

interface Chip {
  id: string;
  name: string;
  icon: IconName;
  run(): void;
}

const CHIPS: readonly Chip[] = [
  ...KIND_CHIPS.map((c) => ({ id: c.id, name: c.name, icon: c.icon, run: () => openKind(c) })),
  { id: 'tours', name: 'Tours', icon: 'trail', run: openTours },
  { id: 'surprise-me', name: 'Surprise me', icon: 'bulb', run: surprise },
];

/** Fills the chips and the Places menu, then loads the catalogue. Called once by main.ts. */
export async function startPlaces(): Promise<void> {
  fillChips();
  startPanels(markChip);
  fillMenu();

  const mod = (await import('../data/places.json')) as unknown as { default: PlacesCatalogue };
  const { cat } = setCatalogue(mod.default);
  setDots(
    cat.places.map((p): Dot => ({
      id: p.id,
      ra: p.ra,
      dec: p.dec,
      name: nameOf(p),
      tier: p.tier,
      kind: p.kind,
    })),
  );
  addSearchSource({ name: 'places', search });
  // A click on a dot opens its card; the dot is on screen already, so the sky stays still.
  onDotClick((dot) => {
    const p = cat.places.find((x) => x.id === dot.id);
    if (p) openCard(p, null, false);
  });
}

// ----- Chips ----------------------------------------------------------------------------------

function fillChips(): void {
  const row = document.getElementById('chips');
  if (!row) return;
  const buttons = CHIPS.map((c) => {
    const b = el(
      'button.btn.pl-chip',
      {
        'data-chip': c.id,
        'data-guide': `chip-${c.id}`,
        'aria-pressed': c.id === 'surprise-me' ? undefined : 'false',
      },
      iconNode(icon(c.icon)),
      c.name,
    );
    b.addEventListener('click', c.run);
    return b;
  });
  // "More": the chips the row has no room for (shell.ts narrows the row beside the frame).
  const more = el(
    'button.btn.pl-chip',
    { 'data-guide': 'chip-more', 'aria-haspopup': 'true', hidden: true },
    'More',
    iconNode(icon('chevron-down')),
  );
  const menu = el('div.popover.pl-more-menu', { popover: 'auto', 'data-overlay': 'chips-more' });
  more.addEventListener('click', () => {
    menu.replaceChildren(
      ...CHIPS.filter((_, i) => buttons[i]?.hidden).map((c) => {
        const item = el('button.menu-item', {}, iconNode(icon(c.icon)), c.name);
        item.addEventListener('click', () => {
          menu.hidePopover();
          c.run();
        });
        return item;
      }),
    );
    menu.showPopover();
    const r = more.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 6}px`;
  });
  row.replaceChildren(...buttons, more, menu);

  const fit = () => {
    const room = parseFloat(row.style.maxWidth) || Infinity;
    for (const b of buttons) b.hidden = false;
    more.hidden = true;
    const gap = 6;
    const widths = buttons.map((b) => b.getBoundingClientRect().width);
    const total = widths.reduce((a, w) => a + w + gap, -gap);
    if (total <= room) return;
    more.hidden = false;
    let used = more.getBoundingClientRect().width;
    buttons.forEach((b, i) => {
      used += (widths[i] ?? 0) + gap;
      b.hidden = used > room;
    });
  };
  new MutationObserver(fit).observe(row, { attributes: true, attributeFilter: ['style'] });
  addEventListener('resize', fit);
  fit();
}

/** Shows which chip's list is open. */
function markChip(open: string | null): void {
  for (const b of document.querySelectorAll<HTMLElement>('#chips [data-chip][aria-pressed]')) {
    b.setAttribute('aria-pressed', String(b.dataset.chip === open));
  }
}

// ----- Search (PLC-4) -------------------------------------------------------------------------

function search(query: string): SearchHit[] {
  const data = catalogue();
  if (!data) return [];
  return find(data.index, query).map(({ place: p, score, matched }) => {
    const parts = [rowLine(data.cat, p)];
    if (matched === 'meaning' && p.names.meaning) parts.unshift(`“${tidy(p.names.meaning)}”`);
    if (p.names.arabic) parts.unshift(p.names.arabic);
    return {
      name: nameOf(p),
      line: parts.join(' · '),
      icon: kindIcon(p.kind),
      score,
      choose: () => openCard(p),
    };
  });
}

// ----- Surprise me ----------------------------------------------------------------------------

const recent: string[] = [];

/** Opens the card of a well-known place picked at random, never one of the last few. */
function surprise(): void {
  const data = catalogue();
  if (!data) return;
  const pool = data.cat.places.filter(
    (p: Place) => p.tier <= 2 && hasCommonName(p) && !recent.includes(p.id),
  );
  const p = pool[Math.floor(Math.random() * pool.length)];
  if (!p) return;
  recent.push(p.id);
  if (recent.length > 20) recent.shift();
  closeAll();
  openCard(p);
}

// ----- The Places menu (4.10, PLC-7) ----------------------------------------------------------

interface Saved {
  name: string;
  /** Degrees. */
  ra: number;
  dec: number;
  /** The sky's width, degrees. */
  fov: number;
}

/** Saved places in `sky-places` (SPEC 8.5). Reads, or writes when given a list. */
function saved(next?: Saved[]): Saved[] {
  try {
    if (next) localStorage.setItem('sky-places', JSON.stringify(next));
    const raw = JSON.parse(localStorage.getItem('sky-places') ?? '[]') as unknown;
    return Array.isArray(raw)
      ? (raw as Saved[]).filter(
          (s) =>
            typeof s?.name === 'string' &&
            Number.isFinite(s.ra) &&
            Number.isFinite(s.dec) &&
            Number.isFinite(s.fov),
        )
      : [];
  } catch {
    return next ?? []; // storage blocked: kept for this visit only
  }
}

function fillMenu(): void {
  const menu = document.getElementById('places-menu');
  if (!menu) return;
  menu.classList.add('pl-menu', 'appear');
  const item = (title: string, line: string, go: () => void, pill?: string) => {
    const b = el(
      'button.menu-item.pl-menu-item',
      {},
      el('span.pl-row-name', {}, title),
      el('span.line', {}, pill ? el('span.pill.warn', {}, pill) : '', pill ? ' ' : '', line),
    );
    b.addEventListener('click', () => {
      menu.hidePopover();
      go();
    });
    return b;
  };
  const label = (text: string) => el('p.group-label.pl-menu-label', {}, text);
  const starters = (['runaway', 'made-of', 'ghost'] as const).map((id) =>
    item(STARTERS[id].title, STARTERS[id].line, () => openStarter(id)),
  );
  const targets = TARGETS.map((t) =>
    item(t.name, t.line, () => openPlace({ name: t.name, ra: t.ra, dec: t.dec, target: t.key })),
  );
  const practice = (['warm-up', 'planet-x'] as const).map((id) =>
    item(STARTERS[id].title, STARTERS[id].line, () => openStarter(id), 'Simulated'),
  );

  const input = el<HTMLInputElement>('input.field', {
    'data-guide': 'places-save-name',
    placeholder: 'Name it',
    'aria-label': 'Name for where the sky is now',
    maxlength: '60',
  });
  const save = el(
    'button.btn',
    { type: 'submit', 'data-guide': 'places-save' },
    iconNode(icon('bookmark')),
    'Save',
  );
  const form = el('form.pl-save', {}, input, save);
  const list = el('div.pl-saved');
  // Saved places come first in the menu, under their own heading, once there are any.
  const yours = el('div.pl-yours', { hidden: '' }, label('Your saved places'), list);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    const c = camera();
    saved([...saved(), { name, ra: c.ra, dec: c.dec, fov: c.fov }]);
    input.value = '';
    showSaved(list, menu);
  });
  menu.replaceChildren(
    yours,
    label('Start here'),
    ...starters,
    label('Test targets'),
    ...targets,
    label('Practice'),
    ...practice,
    el('hr.pl-rule'),
    label('Save where the sky is now'),
    form,
  );
  showSaved(list, menu);
  menu.addEventListener('toggle', () => showSaved(list, menu));
  // A click on a saved place's pin goes there, as its row in this menu does.
  onPinClick((pin) => {
    const s = saved()[Number(pin.id)];
    if (s) flyTo({ ra: s.ra, dec: s.dec, fov: s.fov });
  });
}

function showSaved(box: HTMLElement, menu: HTMLElement): void {
  const all = saved();
  if (box.parentElement) box.parentElement.hidden = !all.length;
  // Saved places show on the sky as pins, their index in the list as their id.
  setPins(all.map((s, i) => ({ id: String(i), name: s.name, ra: s.ra, dec: s.dec })));
  box.replaceChildren(
    ...all.map((s, i) => {
      const go = el(
        'button.menu-item.pl-saved-go',
        { 'data-guide': 'saved-place' },
        el('span.window.pl-tile', {}, iconNode(icon('bookmark'))),
        el('span.pl-row-name', {}, s.name),
      );
      go.addEventListener('click', () => {
        menu.hidePopover();
        flyTo({ ra: s.ra, dec: s.dec, fov: s.fov });
      });
      const del = el(
        'button.icon-btn.sm',
        { 'aria-label': `Forget ${s.name}`, 'data-tip': 'Forget this place' },
        iconNode(icon('close')),
      );
      del.addEventListener('click', () => {
        saved(all.filter((_, j) => j !== i));
        showSaved(box, menu);
      });
      return el('div.pl-saved-row', {}, go, del);
    }),
  );
}
