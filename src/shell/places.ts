/**
 * Places: the chips, the lists, the place cards, the Places menu, tours and saved places
 * (PLC-4 to PLC-7). Owner: lane G.
 *
 * It reads the catalogue (src/data/places.json, built by lane A), plugs it into search
 * (viewer/omnibox.ts `addSearchSource`), gives dots to the sky (sky/markers.ts `setDots`) and
 * moves the frame or the sky through shell.ts (`openPlace`, `flyFree`).
 *
 * PHASE 0 STUB: three inline placeholder rows stand in for places.json. They are not real
 * catalogue entries and say so.
 */
import { addSearchSource } from '../viewer/omnibox.ts';
import { setChosen, setDots, showGroups, type Dot } from '../sky/markers.ts';
import { flyFree, openPlace } from './shell.ts';
import { icon } from './icons.ts';
import { openStarter, STARTERS, type StarterId } from '../explore/game.ts';
import { TARGETS } from '../core/targets.ts';

/** PHASE 0 STUB: placeholder rows near the placeholder patch, not real places. */
const PLACEHOLDER_ROWS: readonly Dot[] = [
  { id: 'placeholder-star', ra: 269.9, dec: 4.4, name: 'Placeholder star', tier: 0, kind: 'star' },
  {
    id: 'placeholder-cluster',
    ra: 268.7,
    dec: 5.3,
    name: 'Placeholder cluster',
    tier: 1,
    kind: 'cluster',
  },
  {
    id: 'placeholder-galaxy',
    ra: 269.2,
    dec: 3.9,
    name: 'Placeholder galaxy',
    tier: 2,
    kind: 'galaxy',
  },
];

const CHIPS = [
  'Stars',
  'Nearby',
  'Changing',
  'Clusters',
  'Nebulae',
  'Galaxies',
  'Tours',
  'Surprise me',
];

/** Fills the chips and the Places menu, plugs places into search and the sky. Called once by main.ts. */
export function startPlaces(): void {
  const chips = document.getElementById('chips');
  if (chips) {
    chips.style.cssText = 'display:flex;gap:6px';
    chips.innerHTML = CHIPS.map(
      (c) =>
        `<button class="btn" data-chip="${c}" aria-pressed="false" style="height:30px;background:var(--card);box-shadow:var(--lift)">${c}</button>`,
    ).join('');
    chips
      .querySelectorAll<HTMLElement>('[data-chip]')
      .forEach((b) => b.addEventListener('click', () => openList(b.dataset.chip ?? '')));
  }
  fillMenu();
  setDots(PLACEHOLDER_ROWS);
  addSearchSource({
    name: 'places',
    search: (query) =>
      PLACEHOLDER_ROWS.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).map(
        (p) => ({
          name: p.name,
          line: 'Placeholder (phase 0)',
          icon: 'star' as const,
          score: 0.5,
          choose: () => openCard(p),
        }),
      ),
  });
}

function fillMenu(): void {
  const menu = document.getElementById('places-menu');
  if (!menu) return;
  const row = (attrs: string, title: string, line: string, pill = '') =>
    `<button class="menu-item" ${attrs} style="display:block"><span>${title}</span><span class="line">${pill}${line}</span></button>`;
  const starters = (['runaway', 'made-of', 'too-faint'] as const)
    .map((id) => row(`data-starter="${id}"`, STARTERS[id].title, STARTERS[id].line))
    .join('');
  const targets = TARGETS.map((t) =>
    row(
      Number.isFinite(t.ra)
        ? `data-target="${t.key}"`
        : 'disabled data-tip="Its position comes from lane B (phase 0)"',
      t.name,
      t.line,
    ),
  ).join('');
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
    <p class="group-label" style="padding:4px 10px;margin:0">Start here</p>${starters}
    <p class="group-label" style="padding:8px 10px 4px;margin:0">Test targets</p>${targets}
    <p class="group-label" style="padding:8px 10px 4px;margin:0">Practice</p>${practice}
    <p class="group-label" style="padding:8px 10px 4px;margin:0">Save where the sky is now</p>
    <div style="display:flex;gap:6px;padding:0 5px 5px">
      <input class="field" placeholder="Name it" aria-label="Name for this place" style="flex:1;min-width:0">
      <button class="btn" disabled data-tip="Not built yet (phase 0)">${icon('bookmark')}Save</button>
    </div>`;
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
}

function openList(kind: string): void {
  const list = document.getElementById('places-list');
  const card = document.getElementById('place-card');
  if (!list) return;
  if (card) card.hidden = true;
  list.style.cssText = 'display:grid;align-content:start;gap:6px;padding:var(--pad-panel)';
  list.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <h2 style="flex:1;margin:0;font:var(--text-title)"></h2>
      <button class="icon-btn sm" data-close aria-label="Close the list">${icon('close')}</button>
    </div>
    <p style="margin:0;color:var(--ink-2);font:var(--text-label)">Placeholder rows (phase 0), not real places.</p>
    <div data-scroll style="display:grid;gap:2px;overflow:auto"></div>`;
  const title = list.querySelector('h2');
  if (title) title.textContent = kind;
  const rows = list.querySelector('[data-scroll]');
  for (const p of PLACEHOLDER_ROWS) {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.textContent = p.name;
    b.addEventListener('click', () => openCard(p));
    rows?.append(b);
  }
  list.querySelector('[data-close]')?.addEventListener('click', () => {
    list.hidden = true;
    showGroups(null);
  });
  list.hidden = false;
}

function openCard(p: Dot): void {
  const list = document.getElementById('places-list');
  const card = document.getElementById('place-card');
  if (!card) return;
  if (list) list.hidden = true;
  card.style.cssText = 'display:grid;align-content:start;gap:10px;padding:var(--pad-panel)';
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <h2 style="flex:1;margin:0;font:var(--text-title)"></h2>
      <button class="icon-btn sm" data-close aria-label="Close the card">${icon('close')}</button>
    </div>
    <p style="margin:0;color:var(--ink-2)">Placeholder (phase 0): not a real catalogue entry.</p>
    <div style="display:flex;gap:6px">
      <button class="btn primary" data-look>Look with the frame</button>
      <button class="btn" data-zoom-to>Zoom to it</button>
    </div>`;
  const title = card.querySelector('h2');
  if (title) title.textContent = p.name;
  card.querySelector('[data-close]')?.addEventListener('click', () => {
    card.hidden = true;
    setChosen(null);
  });
  card
    .querySelector('[data-look]')
    ?.addEventListener('click', () => openPlace({ name: p.name, ra: p.ra, dec: p.dec }));
  card.querySelector('[data-zoom-to]')?.addEventListener('click', () => flyFree(p.ra, p.dec, 0.5));
  card.hidden = false;
  setChosen(p.id);
}
