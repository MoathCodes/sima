// The Arabic locale (src/shell/i18n.ts, src/locales/*): every English key has Arabic words, the
// variables match, plurals pick the right Arabic form, digits stay Western, and Arabic only turns
// on when the link or the Settings switch asks for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/locales/en.ts';
import { ar } from '../src/locales/ar.ts';
import { fmtDate, fmtNum, linkLangOf, pickLocale, t, useLocale } from '../src/shell/i18n.ts';
import { readLink } from '../src/viewer/link.ts';

const vars = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const forms = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Object.values(v as Record<string, string>);
const AR_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

test('every English key has an Arabic value, and Arabic has no extra keys', () => {
  const enKeys = Object.keys(en).sort();
  assert.deepEqual(Object.keys(ar).sort(), enKeys);
  for (const k of enKeys) {
    const a = (ar as Record<string, unknown>)[k];
    for (const s of forms(a)) assert.ok(s.trim().length > 0, `${k} is empty in Arabic`);
  }
});

test('Arabic strings use the same variable names as English', () => {
  for (const [k, e] of Object.entries(en)) {
    const a = (ar as Record<string, unknown>)[k];
    if (typeof e === 'string') {
      assert.equal(typeof a, 'string', `${k}: English is a string`);
      assert.deepEqual(vars(a as string), vars(e), k);
    } else {
      assert.deepEqual(
        Object.keys(a as object).sort(),
        [...AR_FORMS].sort(),
        `${k}: all six Arabic plural forms`,
      );
      const known = new Set(forms(e).flatMap((s) => [...vars(s)]));
      for (const s of forms(a))
        for (const v of vars(s)) assert.ok(known.has(v), `${k}: {${v}} is not an English variable`);
      assert.deepEqual(
        vars((a as Record<string, string>).other),
        vars(e.other),
        `${k}: the other form`,
      );
    }
  }
});

test('Simulated comes first in Arabic too', () => {
  assert.match(ar['mission.planetX'], /^محاكاة/);
  assert.match(en['mission.planetX'], /^Simulated/);
});

test('t fills variables and picks Arabic plural forms', () => {
  useLocale('ar');
  assert.equal(t('count.exposures', { n: 1 }), 'لقطة واحدة');
  assert.equal(t('count.exposures', { n: 2 }), 'لقطتان');
  assert.equal(t('count.exposures', { n: 5 }), '5 لقطات');
  assert.equal(t('count.exposures', { n: 11 }), '11 لقطة');
  assert.equal(t('count.exposures', { n: 100 }), '100 لقطة');
  assert.equal(t('ws.saved', { name: 'x' }), 'حُفظ «x» في هذا المتصفح.');
  useLocale('en');
  assert.equal(t('count.exposures', { n: 1 }), '1 exposure');
  assert.equal(t('count.exposures', { n: 1234 }), '1,234 exposures');
});

test('numbers and dates keep Western digits; Arabic months in Arabic', () => {
  useLocale('ar');
  assert.equal(fmtNum(1234.5), '1,234.5');
  assert.doesNotMatch(fmtNum(9876543.21), /[٠-٩۰-۹]/);
  const d = fmtDate(Date.UTC(2025, 7, 18));
  assert.match(d, /^18 .+ 2025$/);
  assert.match(d, /أغسطس/);
  useLocale('en');
  assert.equal(fmtDate(Date.UTC(2025, 7, 18)), '18 Aug 2025');
});

test('Arabic only by the link or the stored choice, never the browser language', () => {
  assert.equal(pickLocale('?lang=ar', null), 'ar');
  assert.equal(pickLocale('?lang=en', 'ar'), 'en');
  assert.equal(pickLocale('', 'ar'), 'ar');
  assert.equal(pickLocale('', null), 'en');
  assert.equal(pickLocale('?lang=fr', null), 'en');
  assert.equal(linkLangOf('?ra=1&lang=ar'), 'ar');
  assert.equal(linkLangOf('?lang=xx'), null);
});

test('lang= is a known link parameter', () => {
  assert.deepEqual(readLink('?lang=ar').unknown, []);
});
