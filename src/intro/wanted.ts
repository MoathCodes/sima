/**
 * When the opening intro plays. Pure: no page. Owner: the intro (src/intro/).
 */

/** Session storage key: set once the intro has played in this tab, so it plays on every new visit. */
export const INTRO_KEY = 'sima-intro';

/**
 * Whether the intro should play on this page: `?intro=1` forces it; `?intro=0`, `embed=1` and a
 * shared workspace link (`#w=`, which opens straight onto its frames) stop it; otherwise it plays
 * once per visit (until this tab's session storage remembers it). index.html repeats this rule inline (it must decide before the
 * first paint); tests/intro.test.ts checks the two agree.
 *
 * @param seen Whether storage remembers the intro; null when storage is blocked (no intro then).
 */
export function introWanted(search: string, hash: string, seen: boolean | null): boolean {
  const q = new URLSearchParams(search);
  if (q.get('embed') === '1' || /(?:^#|&)w=/.test(hash)) return false;
  const flag = q.get('intro');
  if (flag === '1') return true;
  if (flag === '0') return false;
  return seen === false;
}
