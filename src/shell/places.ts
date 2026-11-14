/**
 * Places: the chips, the lists, the place cards, the Places menu, tours and saved places
 * (PLC-4 to PLC-7). Owner: lane G.
 *
 * It reads the catalogue (src/data/places.json, built by lane A; its type is src/data/schema.ts),
 * plugs it into search (viewer/omnibox.ts `addSearchSource`), gives dots to the sky
 * (sky/markers.ts `setDots`) and moves the frame or the sky through shell.ts (`openPlace`,
 * `flyFree`). The catalogue is loaded on its own (a dynamic import), so the first page does not
 * wait for its 1.3 MB.
 *
 * PHASE 0 STUB, on the real catalogue: search is a plain substring match (no typos, no ranking
 * beyond tier); lists show the first 60 rows of a kind, best known first, with no sub-filters and
 * no "In this view"; cards show the name, kind, Arabic name, text, the In SPHEREx note and the
 * sources, but no facts table. Tours are not built (src/data/tours.ts does not exist yet). The chip
 * → kinds mapping below is a first guess for lane G to settle.
 */
import { addSearchSource } from '../viewer/omnibox.ts';
import { setChosen, setDots, showGroups, type Dot } from '../sky/markers.ts';
import { camera, flyTo } from '../sky/sky.ts';
import { flyFree, openPlace } from './shell.ts';
import { icon } from './icons.ts';
import { openStarter, STARTERS, type StarterId } from '../explore/game.ts';
import { TARGETS } from '../core/targets.ts';
import type { Place, PlaceKind, PlacesCatalogue } from '../data/schema.ts';

/** The chips under the search field, and the kinds each one lists. */
const CHIPS: readonly { name: string; kinds: readonly PlaceKind[] | null; icon: string }[] = [
  { name: 'Stars', kinds: ['star'], icon: 'star' },
  { name: 'Nearby', kinds: ['nearby-star', 'fast-star', 'brown-dwarf'], icon: 'pin' },
  { name: 'Changing', kinds: ['variable-star'], icon: 'chart' },
  { name: 'Clusters', kinds: ['open-cluster', 'globular-cluster'], icon: 'globe' },
  {
    name: 'Nebulae',
    kinds: [
      'emission-nebula',
      'reflection-nebula',
      'dark-nebula',
      'planetary-nebula',
      'supernova-remnant',
    ],
    icon: 'layers',
  },
  { name: 'Galaxies', kinds: ['spiral-galaxy', 'elliptical-galaxy', 'galaxy'], icon: 'compass' },
  { name: 'Tours', kinds: null, icon: 'flip' },
  { name: 'Surprise me', kinds: null, icon: 'bulb' },
];

let catalogue: PlacesCatalogue | null = null;

/** The name a place goes by: its common name, else its first catalogue name. */
function nameOf(p: Place): string {
  return p.names.common ?? p.names.catalogue[0] ?? p.simbad;
}

/** Fills the chips and the Places menu, then loads the catalogue. Called once by main.ts. */
export async function startPlaces(): Promise<void> {
  const chips = document.getElementById('chips');
  if (chips) {
    chips.innerHTML = CHIPS.map(
      (c, i) =>
        `<button class="btn" data-chip="${i}" aria-pressed="false" data-guide="chip-${c.name.toLowerCase().replace(/ /g, '-')}"
          style="height:30px;background:var(--card);box-shadow:var(--lift)">${c.name}</button>`,
    ).join('');
    chips.querySelectorAll<HTMLElement>('[data-chip]').forEach((b) =>
      b.addEventListener('click', () => {
        const chip = CHIPS[Number(b.dataset.chip)];
        if (!chip) return;
        if (chip.name === 'Surprise me') surprise();
        else openList(chip.name, chip.kinds);
      }),
    );
  }
  fillMenu();

  const mod = (await import('../data/places.json')) as unknown as { default: PlacesCatalogue };
  catalogue = mod.default;
  setDots(
    catalogue.places.map((p): Dot => ({
      id: p.id,
      ra: p.ra,
      dec: p.dec,
      name: nameOf(p),
      tier: p.tier,
      kind: p.kind,
    })),
  );
  addSearchSource({ name: 'places', search: (query) => search(query) });
}

/** Phase 0 search: every name, lowercased, spaces removed, as a substring. */
function search(query: string) {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!catalogue || q.length < 2) return [];
  const hits = [];
  for (const p of catalogue.places) {
    const n = p.names;
    const names = [n.common, n.arabic, n.transliteration, n.meaning, ...n.catalogue]
      .filter((x): x is string => !!x)
      .map((x) => x.toLowerCase().replace(/\s+/g, ''));
    const exact = names.some((x) => x === q);
    if (!exact && !names.some((x) => x.includes(q))) continue;
    const line = [catalogue.kinds[p.kind], n.arabic].filter(Boolean).join(' · ');
    hits.push({
      name: nameOf(p),
      line,
      icon: 'star' as const,
      score: (exact ? 1 : 0.6) - p.tier * 0.02,
      choose: () => openCard(p),
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 8);
}

function fillMenu(): void {
  const menu = document.getElementById('places-menu');
  if (!menu) return;
  const row = (attrs: string, title: string, line: string, pill = '') =>
    `<button class="menu-item" ${attrs} style="display:block"><span>${title}</span><span class="line">${pill}${line}</span></button>`;
  const starters = (['runaway', 'made-of', 'too-faint'] as const)
    .map((id) => row(`data-starter="${id}"`, STARTERS[id].title, STARTERS[id].line))
    .join('');
  const targets = TARGETS.map((t) => row(`data-target="${t.key}"`, t.name, t.line)).join('');
  const practice = (['warm-up', 'planet-x'] as const)
    .map((id) =>
      row(
        `data-starter="${id}"`,
        STARTERS[id].title,
        STARTERS[id].line,
        '<span class="pill warn">Simulated</span> ',
      ),
    )
    .join('');
  menu.innerHTML = `
    <p class="group-label" style="padding:4px 10px">Start here</p>${starters}
    <p class="group-label" style="padding:8px 10px 4px">Test targets</p>${targets}
    <p class="group-label" style="padding:8px 10px 4px">Practice</p>${practice}
    <p class="group-label" style="padding:8px 10px 4px">Save where the sky is now</p>
    <div style="display:flex;gap:6px;padding:0 5px 5px">
      <input class="field" placeholder="Name it" aria-label="Name for this place" style="flex:1;min-width:0">
      <button class="btn" data-save>${icon('bookmark')}Save</button>
    </div>
    <div data-saved></div>`;
  menu.querySelectorAll<HTMLElement>('[data-starter]').forEach((b) =>
    b.addEventListener('click', () => {
      menu.hidePopover();
      openStarter(b.dataset.starter as StarterId);
    }),
  );
  menu.querySelectorAll<HTMLElement>('[data-target]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = TARGETS.find((x) => x.key === b.dataset.target);
      menu.hidePopover();
      if (t) openPlace({ name: t.name, ra: t.ra, dec: t.dec, target: t.key });
    }),
  );
  menu.querySelector('[data-save]')?.addEventListener('click', () => {
    const input = menu.querySelector('input');
    const name = input?.value.trim();
    if (!name) return;
    const c = camera();
    saved([...saved(), { name, ra: c.ra, dec: c.dec, fov: c.fov }]);
    if (input) input.value = '';
    showSaved(menu);
  });
  showSaved(menu);
}

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
    return Array.isArray(raw) ? (raw as Saved[]) : [];
  } catch {
    return next ?? []; // storage blocked: kept for this visit only
  }
}

function showSaved(menu: HTMLElement): void {
  const box = menu.querySelector('[data-saved]');
  if (!box) return;
  box.replaceChildren(
    ...saved().map((s) => {
      const b = document.createElement('button');
      b.className = 'menu-item';
      b.textContent = s.name;
      b.addEventListener('click', () => {
        menu.hidePopover();
        flyTo({ ra: s.ra, dec: s.dec, fov: s.fov });
      });
      return b;
    }),
  );
}

function openList(title: string, kinds: readonly PlaceKind[] | null): void {
  const list = document.getElementById('places-list');
  const card = document.getElementById('place-card');
  if (!list) return;
  if (card) card.hidden = true;
  list.style.cssText =
    'display:grid;grid-template-rows:auto auto 1fr;gap:6px;padding:var(--pad-panel);min-height:0';
  list.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <h2 style="flex:1;font:var(--text-title)"></h2>
      <button class="icon-btn sm" data-close aria-label="Close the list" data-tip="Close">${icon('close')}</button>
    </div>
    <p style="color:var(--ink-2);font:var(--text-label)"></p>
    <div data-scroll style="display:grid;align-content:start;gap:2px;overflow:auto;min-height:0"></div>`;
  const h = list.querySelector('h2');
  if (h) h.textContent = title;
  const note = list.querySelector('p');
  const rows = list.querySelector('[data-scroll]');
  const places = kinds
    ? (catalogue?.places ?? [])
        .filter((p) => kinds.includes(p.kind))
        .sort((a, b) => a.tier - b.tier)
        .slice(0, 60)
    : [];
  if (note) {
    note.textContent = !kinds
      ? 'Tours are not built yet (phase 0).'
      : catalogue
        ? 'Best known first. Placeholder list (phase 0): the first 60, no filters.'
        : 'The catalogue is still loading.';
  }
  for (const p of places) {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.style.display = 'block';
    b.innerHTML = '<span></span><span class="line"></span>';
    const [name, line] = b.querySelectorAll('span');
    if (name) name.textContent = nameOf(p);
    if (line) line.textContent = catalogue?.kinds[p.kind] ?? '';
    b.addEventListener('click', () => openCard(p));
    rows?.append(b);
  }
  list.querySelector('[data-close]')?.addEventListener('click', () => {
    list.hidden = true;
    showGroups(null);
  });
  showGroups(kinds);
  list.hidden = false;
}

function surprise(): void {
  const pool = catalogue?.places.filter((p) => p.tier <= 1) ?? [];
  const p = pool[Math.floor(Math.random() * pool.length)];
  if (p) {
    openCard(p);
    flyFree(p.ra, p.dec);
  }
}

function openCard(p: Place): void {
  const list = document.getElementById('places-list');
  const card = document.getElementById('place-card');
  if (!card || !catalogue) return;
  if (list) list.hidden = true;
  const sources = [...new Set(Object.values(p.sources).flat())]
    .map((i) => catalogue?.sources[i])
    .filter((s) => s !== undefined);
  card.style.cssText =
    'display:grid;align-content:start;gap:10px;padding:var(--pad-panel);overflow:auto';
  card.innerHTML = `
    <div style="display:flex;align-items:start;gap:8px">
      <div style="flex:1;min-width:0">
        <h2 data-name style="font:var(--text-title)"></h2>
        <p data-kind style="color:var(--ink-2);font:var(--text-label)"></p>
      </div>
      <button class="icon-btn sm" data-close aria-label="Close the card" data-tip="Close">${icon('close')}</button>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn primary" data-look>Look with the frame</button>
      <button class="btn" data-zoom-to>Zoom to it</button>
    </div>
    <p data-text></p>
    <p data-spherex style="color:var(--ink-2)"></p>
    <div><p class="group-label">Sources</p><ul data-sources style="font:var(--text-label)"></ul></div>`;
  const set = (sel: string, text: string | undefined) => {
    const el = card.querySelector<HTMLElement>(sel);
    if (!el) return;
    el.textContent = text ?? '';
    el.hidden = !text;
  };
  set('[data-name]', nameOf(p));
  set('[data-kind]', [catalogue.kinds[p.kind], p.names.arabic].filter(Boolean).join(' · '));
  set('[data-text]', p.text);
  set('[data-spherex]', p.inSpherex && `In SPHEREx: ${p.inSpherex}`);
  card.querySelector('[data-sources]')?.replaceChildren(
    ...sources.map((s) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = s.name;
      li.append(a);
      return li;
    }),
  );
  card.querySelector('[data-close]')?.addEventListener('click', () => {
    card.hidden = true;
    setChosen(null);
  });
  const target = TARGETS.find((t) => t.key === p.id)?.key ?? null;
  card
    .querySelector('[data-look]')
    ?.addEventListener('click', () => openPlace({ name: nameOf(p), ra: p.ra, dec: p.dec, target }));
  card.querySelector('[data-zoom-to]')?.addEventListener('click', () => flyFree(p.ra, p.dec, 0.5));
  card.hidden = false;
  setChosen(p.id);
  flyFree(p.ra, p.dec);
}
