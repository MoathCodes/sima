/**
 * Searching the places catalogue (PLC-4): English name, Arabic name, transliteration, meaning
 * ("shepherd") and catalogue number ("m104"), with small typos. Coordinates are lane F's own
 * source in omnibox.ts. Owner: lane G.
 *
 * Pure: build an index once with `makeIndex`, then `find` for each query. The tests run it on the
 * real catalogue.
 */
import type { Place } from '../../data/schema.ts';
import { cleanName } from '../objects.ts';

/** Which name matched: it decides the weight and what the hit's line says. */
export type NameKind = 'common' | 'arabic' | 'transliteration' | 'meaning' | 'catalogue';

interface Key {
  /** Normalised words, joined by single spaces. */
  text: string;
  /** The same without spaces ("m104", "ngc4594"). */
  compact: string;
  words: string[];
  kind: NameKind;
}

interface Entry {
  place: Place;
  keys: Key[];
}

/** A search index over places. */
export interface PlaceIndex {
  entries: Entry[];
}

/** One match. */
export interface PlaceMatch {
  place: Place;
  /** 0 to 1, best known places a little higher. */
  score: number;
  /** Which kind of name matched best. */
  matched: NameKind;
}

const WEIGHT: Record<NameKind, number> = {
  common: 1,
  arabic: 1,
  transliteration: 0.95,
  catalogue: 0.92,
  meaning: 0.9,
};

/** Greek letter names to SIMBAD's three-letter forms ("alpha tau" finds "alf Tau"). */
const GREEK: Record<string, string> = {
  alpha: 'alf',
  beta: 'bet',
  gamma: 'gam',
  delta: 'del',
  epsilon: 'eps',
  zeta: 'zet',
  eta: 'eta',
  theta: 'tet',
  iota: 'iot',
  kappa: 'kap',
  lambda: 'lam',
  mu: 'mu',
  nu: 'nu',
  xi: 'ksi',
  omicron: 'omi',
  pi: 'pi',
  rho: 'rho',
  sigma: 'sig',
  tau: 'tau',
  upsilon: 'ups',
  phi: 'phi',
  chi: 'chi',
  psi: 'psi',
  omega: 'ome',
};

/** Catalogue words people spell out ("messier 104" finds "M 104"). */
const SPELLED: Record<string, string> = { messier: 'm', gliese: 'gj' };

/**
 * Normalises text for matching: lower case, accents off, Arabic marks and letter variants
 * folded, punctuation to spaces, Greek letter names to SIMBAD's short forms.
 */
export function normalise(s: string): string {
  const folded = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Latin accents (ā → a)
    .replace(/[ً-ٰٟـ]/g, '') // Arabic short vowels, shadda, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ʿʾ'’‘`]/g, '') // ʿayn, hamza and apostrophes join the word ("Barnard's")
    .replace(/[−–—]/g, '-')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+-]+/gu, ' ')
    .replace(/(\p{L})-(?=\p{L})/gu, '$1 ') // "ad-dabaran" → "ad dabaran"
    .trim();
  return folded
    .split(' ')
    .map((w) => GREEK[w] ?? SPELLED[w] ?? w)
    .join(' ');
}

function key(raw: string, kind: NameKind): Key {
  const text = normalise(raw);
  return { text, compact: text.replace(/[\s+-]/g, ''), words: text.split(' '), kind };
}

/** Builds the index once. */
export function makeIndex(places: readonly Place[]): PlaceIndex {
  return {
    entries: places.map((place) => {
      const n = place.names;
      const keys: Key[] = [];
      if (n.common) keys.push(key(n.common, 'common'));
      if (n.arabic) {
        keys.push(key(n.arabic, 'arabic'));
        // People often type the name without the article: "دبران" for "الدبران".
        const bare = n.arabic.replace(/^ال/, '');
        if (bare !== n.arabic) keys.push(key(bare, 'arabic'));
      }
      if (n.transliteration) keys.push(key(n.transliteration, 'transliteration'));
      if (n.meaning) keys.push(key(n.meaning, 'meaning'));
      for (const c of n.catalogue) keys.push(key(cleanName(c), 'catalogue'));
      return { place, keys: keys.filter((k) => k.text) };
    }),
  };
}

/**
 * The best places for a query, best first.
 * @param max At most this many.
 */
export function find(index: PlaceIndex, query: string, max = 8): PlaceMatch[] {
  const q = key(query, 'common');
  if (q.compact.length < 2) return [];
  const fuzzy = q.compact.length >= 4 && !/\d/.test(q.text);
  const out: PlaceMatch[] = [];
  for (const e of index.entries) {
    let best = 0;
    let matched: NameKind = 'common';
    for (const k of e.keys) {
      const s = level(q, k, fuzzy) * WEIGHT[k.kind];
      if (s > best) {
        best = s;
        matched = k.kind;
      }
    }
    if (best > 0) {
      out.push({ place: e.place, score: Math.max(0, best - e.place.tier * 0.03), matched });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.place.tier - b.place.tier).slice(0, max);
}

/** How well one name matches: 1 exact, 0.9 starts with, 0.8 every word starts, 0.6 inside. */
function level(q: Key, k: Key, fuzzy: boolean): number {
  if (k.text === q.text || k.compact === q.compact) return 1;
  if (wordStarts(k.text, q.text) || wordStarts(k.compact, q.compact)) return 0.9;
  if (q.words.every((w) => k.words.some((kw) => wordStarts(kw, w)))) return 0.8;
  if (q.compact.length >= 3 && !/\d/.test(q.compact) && k.compact.includes(q.compact)) return 0.6;
  if (!fuzzy || /\d/.test(k.text)) return 0;
  // Small typos: compare with the whole name, each word, and the name's start.
  const allow = q.compact.length >= 7 ? 2 : 1;
  let d = within(q.compact, k.compact, allow);
  d = Math.min(d, within(q.compact, k.compact.slice(0, q.compact.length), allow));
  for (const w of k.words) {
    if (Math.abs(w.length - q.compact.length) <= allow) d = Math.min(d, within(q.compact, w, allow));
  }
  return d <= allow ? 0.55 - 0.08 * d : 0;
}

/** A key word starts with a query word; a number must not run on ("1" does not find "104"). */
function wordStarts(kw: string, w: string): boolean {
  if (!kw.startsWith(w)) return false;
  return !/\d$/.test(w) || !/\d/.test(kw[w.length] ?? '');
}

/**
 * Edit distance (with swaps of two neighbours) between a and b, or `limit + 1` once it is
 * certainly more than `limit`.
 */
export function within(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (prev2[j - 2] ?? 0) + 1);
      }
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n] ?? limit + 1;
}
