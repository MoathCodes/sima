/**
 * The interface language: English (the source and fallback) or Arabic, right to left.
 * Owner: the Arabic locale lane.
 *
 * Which language: `?lang=ar|en` in the link, else the choice stored by the Settings switch
 * (`sima-lang`), else English. Until every surface is translated, the browser's language does
 * NOT turn Arabic on, so nobody lands on a half-translated page by accident. index.html runs the
 * same rule before the first paint and sets `<html lang dir>`, so the page never flashes the
 * other way; `pickLocale` here is the tested copy of that rule.
 *
 * Use:
 * - `t('key', { name: 'x' })`: the words for the current language; English when Arabic lacks
 *   them. A key whose value has plural forms takes `{ n }` and picks the form for it.
 * - `fmtNum`, `fmtDate`: Western digits (0–9) in both languages, Arabic month names and
 *   separators in Arabic (Intl, `numberingSystem: latn`, Gregorian calendar).
 * - `ltr(text)` / `ltrEl(text)`: coordinates and other left-to-right runs (RA/Dec, `17 57 48.5
 *   +04 41 36`, file names) inside an LTR isolate, so they never scramble in Arabic text.
 */
import { en, type Key } from '../locales/en.ts';
import { ar } from '../locales/ar.ts';
import { setMonthNames } from '../core/astro.ts';

export type Locale = 'en' | 'ar';
export const LOCALES: readonly Locale[] = ['en', 'ar'];
/** Each language named in its own words: the switch shows these, never translated. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', ar: 'العربية' };
const STORE = 'sima-lang';

/** A value for `{name}` in a message. Numbers are written with `fmtNum`. */
export type Vars = Readonly<Record<string, string | number>>;

const isLocale = (v: unknown): v is Locale => v === 'en' || v === 'ar';

/**
 * The language to use. Pure.
 * @param search `location.search`.
 * @param stored The Settings choice (`localStorage['sima-lang']`), or null.
 */
export function pickLocale(search: string, stored: string | null): Locale {
  const asked = new URLSearchParams(search).get('lang');
  if (isLocale(asked)) return asked;
  if (isLocale(stored)) return stored;
  return 'en';
}

/** The `lang` the page was opened with, when the link names one: links keep it (url.ts). */
export function linkLangOf(search: string): Locale | null {
  const asked = new URLSearchParams(search).get('lang');
  return isLocale(asked) ? asked : null;
}

function storedChoice(): string | null {
  try {
    return localStorage.getItem(STORE);
  } catch {
    return null;
  }
}

const inPage = typeof document !== 'undefined' && typeof location !== 'undefined';
let current: Locale = inPage ? pickLocale(location.search, storedChoice()) : 'en';
const opened: Locale | null = inPage ? linkLangOf(location.search) : null;

if (inPage) applyDocument();
// Every date the page writes (core/astro.ts formatDate) gets the language's month names.
if (current === 'ar') {
  const f = new Intl.DateTimeFormat(intlTag(), { month: 'short', timeZone: 'UTC' });
  setMonthNames(Array.from({ length: 12 }, (_, m) => f.format(Date.UTC(2025, m, 15))));
}

/** Sets `<html lang dir>` and the page title for the current language (index.html did it first). */
function applyDocument(): void {
  const html = document.documentElement;
  html.lang = current;
  html.dir = dir();
  if (current !== 'en') {
    document.title = t('app.title');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t('app.description'));
  }
}

/** The current language. */
export function locale(): Locale {
  return current;
}

/** `rtl` in Arabic, else `ltr`. */
export function dir(): 'rtl' | 'ltr' {
  return current === 'ar' ? 'rtl' : 'ltr';
}

/** The `lang` a link to this page carries: the one it was opened with, or null (url.ts). */
export function linkLang(): Locale | null {
  return opened;
}

/** For tests: use another language without a page. */
export function useLocale(l: Locale): void {
  current = l;
}

/**
 * Switches the language: stores the choice, puts `lang=` in the address and reloads, so every
 * part starts again in the new language and direction (the address already holds the view).
 */
export function setLocale(l: Locale): void {
  if (!inPage) return;
  try {
    localStorage.setItem(STORE, l);
  } catch {
    // The link still carries it.
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', l);
  location.replace(url.href);
}

const rules = new Map<Locale, Intl.PluralRules>();
function pluralOf(n: number): Intl.LDMLPluralRule {
  let r = rules.get(current);
  if (!r) rules.set(current, (r = new Intl.PluralRules(current)));
  return r.select(n);
}

/**
 * The words for `key` in the current language, with `{name}` filled from `vars`.
 * A plural key takes `vars.n`. Falls back to English for anything Arabic lacks.
 */
export function t(key: Key, vars?: Vars): string {
  const table =
    current === 'ar' ? (ar as Record<string, unknown>) : (en as Record<string, unknown>);
  let entry = table[key] ?? en[key];
  if (typeof entry === 'object' && entry !== null) {
    const forms = entry as Record<string, string>;
    const n = Number(vars?.n ?? 0);
    entry = forms[pluralOf(n)] ?? forms.other;
  }
  return fill(String(entry ?? key), vars);
}

/** Fills `{name}` in a string; numbers are written with `fmtNum`. Unknown names stay as they are. */
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  // In Arabic each value sits in a first-strong isolate (FSI … PDI), so a number with its unit
  // ("2.00 µm", "10.50″/yr") or a Latin name keeps its own order inside a right-to-left sentence.
  const iso = current === 'ar' ? (v: string) => `\u2068${v}\u2069` : (v: string) => v;
  return text.replace(/\{(\w+)\}/g, (all, k: string) => {
    const v = vars[k];
    return v === undefined ? all : iso(typeof v === 'number' ? fmtNum(v) : v);
  });
}

/** The Intl locale tag: Arabic with Western digits and the Gregorian calendar. */
export function intlTag(): string {
  return current === 'ar' ? 'ar-u-nu-latn-ca-gregory' : 'en-GB';
}

const numbers = new Map<string, Intl.NumberFormat>();
/** A number in the current language, always with Western digits. */
export function fmtNum(n: number, opts: Intl.NumberFormatOptions = {}): string {
  const k = `${current}|${JSON.stringify(opts)}`;
  let f = numbers.get(k);
  if (!f)
    numbers.set(k, (f = new Intl.NumberFormat(intlTag(), { maximumFractionDigits: 3, ...opts })));
  return f.format(n);
}

const dates = new Map<string, Intl.DateTimeFormat>();
/**
 * A date (UTC) in the current language: `18 Aug 2025` / `18 أغسطس 2025`.
 * @param opts Intl options; default day, short month, year.
 */
export function fmtDate(d: Date | number, opts: Intl.DateTimeFormatOptions = {}): string {
  const k = `${current}|${JSON.stringify(opts)}`;
  let f = dates.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(intlTag(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
      ...opts,
    });
    dates.set(k, f);
  }
  return f.format(d);
}

/** A list joined the current language's way: `a, b and c` / `أ وب وج`. */
export function fmtList(
  items: readonly string[],
  type: Intl.ListFormatType = 'conjunction',
): string {
  return new Intl.ListFormat(current, { type }).format(items);
}

const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
/**
 * A left-to-right run (coordinates, catalogue numbers, units with signs) as HTML: an LTR
 * isolate, so it reads the same inside Arabic text. Escapes `text`.
 */
export function ltr(text: string): string {
  return `<bdi dir="ltr">${text.replace(/[&<>"]/g, (c) => escapes[c]!)}</bdi>`;
}

/** The same as `ltr`, as an element. */
export function ltrEl(text: string): HTMLElement {
  const b = document.createElement('bdi');
  b.dir = 'ltr';
  b.textContent = text;
  return b;
}

/**
 * A place's name for the current language: in Arabic, its real Arabic name when the data has one
 * (Wikidata, the Arabic star-name list); otherwise the name as catalogues write it. Never coined.
 */
export function localName(name: string, arabic?: string | null): string {
  return current === 'ar' && arabic ? arabic : name;
}

/**
 * A left-to-right run for plain text (`textContent`, toasts, `aria-label`, canvas): wrapped in
 * Unicode isolate marks (LRI … PDI), so coordinates keep their order inside Arabic sentences.
 */
export function ltrText(text: string): string {
  return `⁦${text}⁩`;
}

/**
 * One of the five targets' names in the current language (`tg.<key>`): "نجم برنارد", "R التنين";
 * catalogue designations stay in Latin. Any other place keeps the name it was given.
 */
export function targetName(target: { key: string; name: string }): string {
  const k = `tg.${target.key}`;
  return k in en ? t(k as Key) : target.name;
}

/**
 * A part of a line in its own first-strong isolate in Arabic (FSI … PDI), so parts joined with
 * " · " keep their own order: "SPHEREx DR1", "16–18 أغسطس 2025", "1.67–1.79 µm". English as is.
 */
export function iso(text: string): string {
  return current === 'ar' ? `⁨${text}⁩` : text;
}
