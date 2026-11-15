/**
 * Statistics in plain words (MSR-4, O-G5): never a bare χ², p or "degrees of freedom". Each
 * function turns a number into a sentence a newcomer can read, with the exact value one hover
 * away. Pure apart from the HTML strings. Owner: lane E.
 */
import type { Chi2 } from '../../core/stats.ts';
import { esc, num, term } from '../tools/dom.ts';
import { t } from '../../shell/i18n.ts';

/** A chance as people say it: "about 34 in 100", "about 1 in 20", "less than 1 in 1,000". */
export function chance(p: number): string {
  if (!Number.isFinite(p)) return t('stat.unknown');
  if (p < 0.001) return t('stat.lt1000');
  if (p < 0.01) return t('stat.oneIn', { n: String(Math.round(1 / p / 10) * 10) });
  if (p < 0.1) return t('stat.oneIn', { n: String(Math.round(1 / p)) });
  if (p > 0.995) return t('stat.gt99');
  return t('stat.inHundred', { n: String(Math.round(p * 100)) });
}

/** What the "did it change?" test found, in one short phrase. */
export function verdictOf(test: Chi2 | null): 'changed' | 'steady' | 'too-good' | 'untested' {
  if (!test || !Number.isFinite(test.p) || test.dof < 1) return 'untested';
  if (test.p < 0.01) return 'changed';
  if (test.p > 0.99) return 'too-good';
  return 'steady';
}

/** The exact numbers behind a test, for the hover: chi-square, degrees of freedom and p. */
export function testTip(test: Chi2): string {
  return (
    t('stat.testTip', { chi2: num(test.chi2, 1), dof: String(test.dof), p: num(test.p, test.p < 0.01 ? 4 : 2) })
  );
}

/**
 * "Did it change?" as a sentence, with the test explained on hover (HTML). Small p: it changed,
 * or the error bars are too small. p very close to 1: the error bars are probably too big.
 */
export function plainP(test: Chi2 | null): string {
  const q = term(t('stat.changed'), test && Number.isFinite(test.p) ? testTip(test) : t('stat.testWhat'));
  switch (verdictOf(test)) {
    case 'untested':
      return `${q} ${t('stat.untested')}`;
    case 'changed':
      return `${q} ${t('stat.yes', { chance: esc(chance(test!.p)) })}`;
    case 'too-good':
      return `${q} ${t('stat.tooGood')}`;
    case 'steady':
      return `${q} ${t('stat.steady', { chance: esc(chance(test!.p)) })}`;
  }
}

/** A trend in plain words: "fading 0.05 ± 0.01 mag a year", or '' when not drawn. */
export function trendWords(trend: { slope: number; err: number; drawn: boolean } | null): string {
  if (!trend || !trend.drawn || !Number.isFinite(trend.slope)) return '';
  return t(trend.slope > 0 ? 'stat.fading' : 'stat.brightening', { v: `${num(Math.abs(trend.slope), 2)} ± ${num(trend.err, 2)}` });
}
