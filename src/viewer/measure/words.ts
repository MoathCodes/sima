/**
 * Statistics in plain words (MSR-4, O-G5): never a bare χ², p or "degrees of freedom". Each
 * function turns a number into a sentence a newcomer can read, with the exact value one hover
 * away. Pure apart from the HTML strings. Owner: lane E.
 */
import type { Chi2 } from '../../core/stats.ts';
import { esc, num, term } from '../tools/dom.ts';

/** A chance as people say it: "about 34 in 100", "about 1 in 20", "less than 1 in 1,000". */
export function chance(p: number): string {
  if (!Number.isFinite(p)) return 'unknown';
  if (p < 0.001) return 'less than 1 in 1,000';
  if (p < 0.01) return `about 1 in ${Math.round(1 / p / 10) * 10}`;
  if (p < 0.1) return `about 1 in ${Math.round(1 / p)}`;
  if (p > 0.995) return 'more than 99 in 100';
  return `about ${Math.round(p * 100)} in 100`;
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
    `A chi-square test: how far the points sit from their weighted average, counted in error bars. ` +
    `Here ${num(test.chi2, 1)} over ${test.dof} independent comparisons (degrees of freedom); ` +
    `the chance of that much from noise alone (p) is ${num(test.p, test.p < 0.01 ? 4 : 2)}.`
  );
}

/**
 * "Did it change?" as a sentence, with the test explained on hover (HTML). Small p: it changed,
 * or the error bars are too small. p very close to 1: the error bars are probably too big.
 */
export function plainP(test: Chi2 | null): string {
  const q = term('Did it change?', test && Number.isFinite(test.p) ? testTip(test) : 'A test of whether the points scatter more than their error bars allow.');
  switch (verdictOf(test)) {
    case 'untested':
      return `${q} Not tested: it needs at least two points with error bars.`;
    case 'changed':
      return `${q} Yes, more than noise allows: noise alone would scatter the points this much ${esc(chance(test!.p))} times. Or the error bars are too small.`;
    case 'too-good':
      return `${q} No, and the points agree better than their error bars expect: the error bars are probably too big.`;
    case 'steady':
      return `${q} Not beyond its error bars: noise alone would scatter the points this much ${esc(chance(test!.p))} times.`;
  }
}

/** The note when visit averages' errors were widened (SPEC 7.1.12), or '' when they were not. */
export function widenedNote(by: number): string {
  if (!Number.isFinite(by) || by <= 1.005) return '';
  return `Visit error bars widened ×${num(by, 1)}: the exposures inside one visit scatter more than their own error bars allow, so a change must stand out of that scatter too.`;
}

/** A trend in plain words: "fading 0.05 ± 0.01 mag a year", or '' when not drawn. */
export function trendWords(trend: { slope: number; err: number; drawn: boolean } | null): string {
  if (!trend || !trend.drawn || !Number.isFinite(trend.slope)) return '';
  const dir = trend.slope > 0 ? 'fading' : 'brightening';
  return `${dir} ${num(Math.abs(trend.slope), 2)} ± ${num(trend.err, 2)} mag a year`;
}
