/**
 * The search field and its suggestions (SPEC 4.5, PLC-4, GEN-1's `/`). Owner: lane F.
 *
 * Search knows nothing about places itself. Lane G plugs the catalogue in with
 * `addSearchSource`. Two sources are built in: the five test targets, and coordinates (in the
 * formats core/astro.ts `parseCoords` reads). Suggestions are grouped by source, the group with
 * the best match first, at most 8 rows in all.
 *
 * Keys: ↓ and ↑ move through the rows, Enter opens the chosen row (the first by default),
 * Escape closes the suggestions, then leaves the field.
 */
import { icon, type IconName } from '../shell/icons.ts';
import { openPlace } from '../shell/shell.ts';
import { getView, onView, type View } from '../shell/view.ts';
import { formatCoords, parseCoords } from '../core/astro.ts';
import { TARGETS } from '../core/targets.ts';

/** One suggestion. */
export interface SearchHit {
  /** The name, as the row shows it. */
  name: string;
  /** One supporting line: kind and where ("Red dwarf · Ophiuchus"). */
  line: string;
  /** v2.0: the Arabic name, shown after the name in its own `<bdi>` at 14 px (A11Y-4). */
  arabic?: string;
  /** Icon on the row's dark tile. */
  icon?: IconName;
  /** 0 to 1: how well it matches. The best show first. */
  score: number;
  /** What choosing it does (usually shell.ts `openPlace` or `flyFree`). */
  choose(): void;
}

/** Something search can ask. */
export interface SearchSource {
  /** Short name, for errors. */
  name: string;
  /** Heading over this source's rows ("Well-known places"); "Places" when left out. */
  label?: string;
  /**
   * The suggestions for what the user typed, best first, at most 8. Called after each pause in
   * typing; `signal` aborts when the text changes again.
   */
  search(query: string, signal: AbortSignal): SearchHit[] | Promise<SearchHit[]>;
}

const MAX_ROWS = 8;
const sources = new Set<SearchSource>();
let rows: SearchHit[] = [];
/** The text `rows` were found for. */
let rowsFor = '';
let active = 0;
let asking: AbortController | null = null;

/**
 * Adds a source of suggestions.
 * @returns Remove it again.
 */
export function addSearchSource(source: SearchSource): () => void {
  sources.add(source);
  return () => sources.delete(source);
}

/** Arabic inside a Latin line: its own `<bdi>`, right to left, in the Arabic text face. */
function arabicBdi(text: string, cls = 'search-ar'): HTMLElement {
  const b = document.createElement('bdi');
  b.className = cls;
  b.lang = 'ar';
  b.dir = 'rtl';
  b.textContent = text;
  return b;
}

/** What the visitor typed, isolated: it may be in any script. */
function bdiText(text: string): HTMLElement {
  const b = document.createElement('bdi');
  b.textContent = text;
  return b;
}

const SEARCH_WORDS: Record<View, string> = {
  expert: 'Search a star or galaxy, or paste coordinates',
  discover: 'Find a star, galaxy or nebula',
};

/** Fills the search card. Called once by main.ts. */
export function startSearch(): void {
  const box = document.getElementById('search');
  const list = document.getElementById('search-results');
  if (!box || !list) return;
  box.innerHTML = `${icon('search')}
    <input type="search" class="search-input" aria-label="${SEARCH_WORDS.expert}"
      placeholder="${SEARCH_WORDS.expert}"
      autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false"
      aria-controls="search-results" aria-autocomplete="list">
    <kbd class="kbd" aria-hidden="true">/</kbd>`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Suggestions');
  const input = box.querySelector('input');
  if (!input) return;
  // Discover's words for the same field (DESIGN-v2 8.2).
  const words = (v: View) => {
    input.placeholder = SEARCH_WORDS[v];
    input.setAttribute('aria-label', SEARCH_WORDS[v]);
  };
  words(getView());
  onView(words);
  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const text = input.value.trim();
    // Rows for an older text must not be chosen by a quick Enter: drop them now.
    if (text !== rowsFor) {
      rows = [];
      rowsFor = text;
      close(list, input);
      list.replaceChildren(); // not even during the fade-out
    }
    timer = window.setTimeout(() => void ask(text, list, input), text ? 120 : 0);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim() && rows.length) open(list, input);
  });
  input.addEventListener('keydown', (e) => {
    const shown = list.matches(':popover-open');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown) {
        if (input.value.trim() && rows.length) open(list, input);
        return;
      }
      if (rows.length)
        setActive(
          list,
          input,
          (active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length,
        );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = rows[active];
      if (shown && hit) choose(hit, list, input);
      else if (input.value.trim()) void ask(input.value.trim(), list, input, true);
    } else if (e.key === 'Escape') {
      e.preventDefault(); // handled here: the page's Escape order must not also close a card
      if (shown) close(list, input);
      else input.blur();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target instanceof Node ? e.target : null;
    if (list.matches(':popover-open') && !box.contains(t) && !list.contains(t)) close(list, input);
  });
  list.addEventListener('toggle', (e) => {
    input.setAttribute('aria-expanded', String((e as ToggleEvent).newState === 'open'));
  });
}

/** The five test targets, by name or key. */
const targets: SearchSource = {
  name: 'targets',
  label: 'Test targets, real pictures included',
  search(query) {
    const q = fold(query);
    return TARGETS.flatMap((t) => {
      const name = fold(t.name);
      const at = name.indexOf(q);
      const score = name === q ? 1 : at === 0 ? 0.95 : at > 0 ? 0.8 : t.key === q ? 0.95 : 0;
      if (q.length < 2 || !score) return [];
      return [
        {
          name: t.name,
          line: [t.kind, t.line].filter(Boolean).join(' · '),
          icon: 'star' as IconName,
          score,
          choose: () => openPlace({ name: t.name, ra: t.ra, dec: t.dec, target: t.key }),
        },
      ];
    });
  },
};

/** Coordinates in any format `parseCoords` reads. */
const coordinates: SearchSource = {
  name: 'coordinates',
  label: 'Coordinates',
  search(query) {
    const at = parseCoords(query);
    if (!at) return [];
    const name = formatCoords(at.ra, at.dec);
    return [
      {
        name,
        line: `RA ${at.ra.toFixed(4)}°, Dec ${at.dec.toFixed(4).replace('-', '−')}° · move the frame here`,
        icon: 'pin',
        score: 1,
        choose: () => openPlace({ name, ...at }),
      },
    ];
  },
};

/** Lower case, no accents, one space: "Barnard’s  Star" → "barnard's star". */
function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface Group {
  source: SearchSource;
  hits: SearchHit[];
}

async function ask(
  query: string,
  list: HTMLElement,
  input: HTMLInputElement,
  chooseFirst = false,
): Promise<void> {
  asking?.abort();
  if (!query) {
    rows = [];
    close(list, input);
    return;
  }
  const ctl = new AbortController();
  asking = ctl;
  const all: Group[] = await Promise.all(
    [coordinates, targets, ...sources].map(async (source) => {
      try {
        const hits = await source.search(query, ctl.signal);
        return { source, hits: [...hits] }; // each source gives its best first
      } catch (err) {
        if (!ctl.signal.aborted) console.error(`search: the "${source.name}" source failed`, err);
        return { source, hits: [] };
      }
    }),
  );
  if (ctl.signal.aborted) return;
  // Groups with the best match first; a name already shown by an earlier group is left out.
  const groups = all
    .filter((g) => g.hits.length)
    .sort((a, b) => (b.hits[0]?.score ?? 0) - (a.hits[0]?.score ?? 0));
  const seen = new Set<string>();
  const shown: Group[] = [];
  let room = MAX_ROWS;
  for (const g of groups) {
    const hits = g.hits.filter((h) => !seen.has(fold(h.name))).slice(0, room);
    hits.forEach((h) => seen.add(fold(h.name)));
    room -= hits.length;
    if (hits.length) shown.push({ source: g.source, hits });
  }
  rows = shown.flatMap((g) => g.hits);
  rowsFor = query;
  active = 0;
  render(list, input, shown, query);
  const first = rows[0];
  if (chooseFirst && first) choose(first, list, input);
}

function render(list: HTMLElement, input: HTMLInputElement, groups: Group[], query: string): void {
  list.replaceChildren();
  if (!rows.length) {
    const none = document.createElement('p');
    none.className = 'search-none';
    if (getView() === 'discover') {
      // BEGINNER-AND-MOBILE.md 5.9, word for word.
      none.textContent = 'No star, galaxy or nebula by that name. Try a famous one: Vega, Betelgeuse, Orion Nebula.';
    } else {
      // The Arabic example sits in its own <bdi>, so the separators stay in place (section 9).
      none.append(`Nothing found for “`, bdiText(query), `”. Try a name (Vega, `, arabicBdi('سهيل'), `), a catalogue number (M104, NGC 6572) or coordinates (17 57 48.5 +04 41 36).`);
    }
    list.append(none);
  }
  let i = 0;
  for (const g of groups) {
    const head = document.createElement('p');
    head.className = 'group-label search-group';
    head.textContent = g.source.label ?? 'Places';
    list.append(head);
    for (const hit of g.hits) {
      const index = i++;
      const row = document.createElement('button');
      row.className = 'menu-item search-row';
      row.tabIndex = -1; // the field keeps focus; ↓ and ↑ move through the rows
      row.id = `search-row-${index}`;
      row.setAttribute('role', 'option');
      row.innerHTML = `<span class="window search-tile">${icon(hit.icon ?? 'star')}</span><span class="search-words"><span class="search-name"></span><span class="line"></span></span>`;
      const name = row.querySelector('.search-name')!;
      name.textContent = hit.name;
      if (hit.arabic) name.append(' ', arabicBdi(hit.arabic, 'search-ar'));
      row.querySelector('.line')!.textContent = hit.line;
      row.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus in the field
      row.addEventListener('click', () => choose(hit, list, input));
      row.addEventListener('pointermove', () => {
        if (active !== index) setActive(list, input, index);
      });
      list.append(row);
    }
  }
  open(list, input);
  setActive(list, input, 0);
}

function setActive(list: HTMLElement, input: HTMLInputElement, i: number): void {
  active = i;
  list.querySelectorAll('[role="option"]').forEach((row, j) => {
    row.setAttribute('aria-selected', String(j === i));
  });
  const row = rows.length ? list.querySelector(`#search-row-${i}`) : null;
  if (row) input.setAttribute('aria-activedescendant', row.id);
  else input.removeAttribute('aria-activedescendant');
}

function open(list: HTMLElement, input: HTMLInputElement): void {
  const r = document.getElementById('search')?.getBoundingClientRect();
  if (r) {
    list.style.left = `${r.left}px`;
    list.style.top = `${r.bottom + 6}px`;
    list.style.width = `${r.width}px`;
  }
  if (!list.matches(':popover-open')) list.showPopover();
  input.setAttribute('aria-expanded', 'true');
}

function close(list: HTMLElement, input: HTMLInputElement): void {
  if (list.matches(':popover-open')) list.hidePopover();
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function choose(hit: SearchHit, list: HTMLElement, input: HTMLInputElement): void {
  close(list, input);
  input.blur();
  hit.choose();
}
