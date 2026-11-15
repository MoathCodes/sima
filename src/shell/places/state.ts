/**
 * What the places parts share: the catalogue once loaded, its search index, and small DOM
 * helpers. Owner: lane G.
 */
import type { Place, PlaceKind, PlacesCatalogue } from '../../data/schema.ts';
import type { IconName } from '../icons.ts';
import { makeIndex, type PlaceIndex } from './search.ts';

export interface Loaded {
  cat: PlacesCatalogue;
  byId: Map<string, Place>;
  index: PlaceIndex;
}

let loaded: Loaded | null = null;
const waiters: ((l: Loaded) => void)[] = [];

/** Sets the catalogue once it has arrived. */
export function setCatalogue(cat: PlacesCatalogue): Loaded {
  // Building the search index in one go blocks the page for over 100 ms (TLS-8), so it is built
  // in slices of about 10 ms meanwhile; a search that comes first finishes it at once.
  const index: PlaceIndex = { entries: [] };
  let next = 0;
  const build = (ms: number) => {
    const end = performance.now() + ms;
    for (; next < cat.places.length && performance.now() < end; next += 50) {
      index.entries.push(...makeIndex(cat.places.slice(next, next + 50)).entries);
    }
  };
  const slice = () => {
    build(10);
    if (next < cat.places.length) setTimeout(slice, 0);
  };
  setTimeout(slice, 0);
  loaded = {
    cat,
    byId: new Map(cat.places.map((p) => [p.id, p])),
    get index() {
      build(Infinity);
      return index;
    },
  };
  waiters.splice(0).forEach((fn) => fn(loaded as Loaded));
  return loaded;
}

/** The catalogue, or null while it is still loading. */
export function catalogue(): Loaded | null {
  return loaded;
}

/** The catalogue, when it has arrived. */
export function whenLoaded(): Promise<Loaded> {
  return loaded ? Promise.resolve(loaded) : new Promise((go) => waiters.push(go));
}

/** The icon on a place's dark tile, by kind. */
export function kindIcon(kind: PlaceKind): IconName {
  if (kind.endsWith('galaxy')) return 'globe';
  if (kind.endsWith('cluster')) return 'two';
  if (kind.endsWith('nebula') || kind === 'supernova-remnant') return 'layers';
  return 'star';
}

/**
 * Makes an element. Text goes in as text, never as markup, so catalogue strings are safe.
 * @param tag Tag and classes: "p.pl-line".
 */
export function el<T extends HTMLElement = HTMLElement>(
  tag: string,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: (Node | string | null | undefined | false)[]
): T {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name ?? 'div') as T;
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

/** Markup for an icon, as a node. */
export function iconNode(markup: string): Node {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content;
}

/**
 * Arabic text in its own `<bdi>`, right to left, so a Latin line around it keeps its separators
 * in place (BEGINNER-AND-MOBILE.md section 9). Set in the Arabic text face, never under 14 px.
 */
export function arabicSpan(text: string, cls = 'pl-ar'): HTMLElement {
  return el(`bdi.${cls}`, { lang: 'ar', dir: 'rtl' }, text);
}
