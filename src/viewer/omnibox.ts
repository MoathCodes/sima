/**
 * The search field and its suggestions (PLC-4, GEN-1's `/`). Owner: lane F.
 *
 * Search knows nothing about places itself. Lane G plugs the catalogue in with
 * `addSearchSource`; coordinates are the one built-in source. Suggestions from every source are
 * merged by score.
 *
 * PHASE 0 STUB: the coordinates source finds nothing yet (core/astro.ts `parseCoords` is a stub).
 */
import { icon, type IconName } from '../shell/icons.ts';
import { openPlace } from '../shell/shell.ts';
import { formatCoords, parseCoords } from '../core/astro.ts';

/** One suggestion. */
export interface SearchHit {
  /** The name, as the row shows it. */
  name: string;
  /** One supporting line: kind and where ("Red dwarf · Ophiuchus"). */
  line: string;
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
  /**
   * The suggestions for what the user typed, best first, at most 8. Called after each pause in
   * typing; `signal` aborts when the text changes again.
   */
  search(query: string, signal: AbortSignal): SearchHit[] | Promise<SearchHit[]>;
}

const sources = new Set<SearchSource>();
let hits: SearchHit[] = [];
let asking: AbortController | null = null;

/**
 * Adds a source of suggestions.
 * @returns Remove it again.
 */
export function addSearchSource(source: SearchSource): () => void {
  sources.add(source);
  return () => sources.delete(source);
}

/** Fills the search card. Called once by main.ts. */
export function startSearch(): void {
  const box = document.getElementById('search');
  const list = document.getElementById('search-results');
  if (!box || !list) return;
  box.style.cssText = 'display:flex;align-items:center;gap:10px;padding:0 12px;color:var(--ink-3)';
  box.innerHTML = `${icon('search')}
    <input type="search" aria-label="Search" placeholder="Search a star or galaxy, or paste coordinates"
      autocomplete="off" spellcheck="false"
      style="flex:1;min-width:0;height:100%;border:0;outline:0;background:none;color:var(--ink);font:var(--text-body)">
    <kbd class="kbd" aria-hidden="true">/</kbd>`;
  const input = box.querySelector('input');
  if (!input) return;
  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void ask(input.value.trim(), list), 120);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && hits[0]) {
      e.preventDefault();
      choose(hits[0], list, input);
    } else if (e.key === 'Escape') {
      e.preventDefault(); // handled here: the page's Escape order must not also close a card
      if (list.matches(':popover-open')) list.hidePopover();
      else input.blur();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target instanceof Node ? e.target : null;
    if (list.matches(':popover-open') && !box.contains(t) && !list.contains(t)) list.hidePopover();
  });
}

const coordinates: SearchSource = {
  name: 'coordinates',
  search(query) {
    const at = parseCoords(query);
    if (!at) return [];
    const name = formatCoords(at.ra, at.dec);
    return [
      {
        name,
        line: 'Coordinates',
        icon: 'pin',
        score: 1,
        choose: () => openPlace({ name, ...at }),
      },
    ];
  },
};

async function ask(query: string, list: HTMLElement): Promise<void> {
  asking?.abort();
  if (!query) {
    if (list.matches(':popover-open')) list.hidePopover();
    return;
  }
  const ctl = new AbortController();
  asking = ctl;
  const all = await Promise.all(
    [coordinates, ...sources].map(async (s) => {
      try {
        return await s.search(query, ctl.signal);
      } catch (err) {
        if (!ctl.signal.aborted) console.error(`search: the "${s.name}" source failed`, err);
        return [];
      }
    }),
  );
  if (ctl.signal.aborted) return;
  hits = all
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  show(list);
}

function show(list: HTMLElement): void {
  const input = document.querySelector<HTMLInputElement>('#search input');
  list.innerHTML = hits.length
    ? ''
    : '<p style="margin:0;padding:8px 10px;color:var(--ink-2)">No matches.</p>';
  hits.forEach((hit) => {
    const row = document.createElement('button');
    row.className = 'menu-item';
    row.innerHTML = `<span class="window" style="display:grid;place-items:center;width:30px;height:30px">${icon(hit.icon ?? 'star')}</span><span><span data-name></span><span class="line"></span></span>`;
    const [name, line] = row.querySelectorAll('[data-name], .line');
    if (name) name.textContent = hit.name;
    if (line) line.textContent = hit.line;
    row.addEventListener('click', () => input && choose(hit, list, input));
    list.append(row);
  });
  const r = document.getElementById('search')?.getBoundingClientRect();
  if (r) {
    list.style.left = `${r.left}px`;
    list.style.top = `${r.bottom + 6}px`;
    list.style.width = `${r.width}px`;
  }
  if (!list.matches(':popover-open')) list.showPopover();
}

function choose(hit: SearchHit, list: HTMLElement, input: HTMLInputElement): void {
  if (list.matches(':popover-open')) list.hidePopover();
  input.blur();
  hit.choose();
}
