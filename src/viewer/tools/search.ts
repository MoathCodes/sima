/**
 * The change search for the patch on screen (Find changes tab, "Found in this patch", the marks
 * on the picture). Owner: lane E. The search itself is lane B's `findChanges`, run in a worker.
 *
 * It runs only while someone looks at its result: the Find changes tab, or Measure's "Found in
 * this patch". It runs again when the detector, the threshold or the patch changes.
 */
import { S, pic, watch } from '../state.ts';
import { compute, STALE } from './compute.ts';
import { current, markOf, onSettings } from './settings.ts';
import type { Candidate, ChangeSearch, Verdict } from '../../core/detect.ts';

export interface SearchState {
  state: 'idle' | 'running' | 'done' | 'failed';
  result: ChangeSearch | null;
  error: string;
  /** The candidate open in the Find changes tab. */
  open: string | null;
  /** When the running search started (performance.now()). */
  since: number;
}

let st: SearchState = { state: 'idle', result: null, error: '', open: null, since: 0 };
const fns = new Set<() => void>();
let wanted = false;
let runKey = '';

/** Hear changes. */
export function onSearch(fn: () => void): () => void {
  fns.add(fn);
  return () => fns.delete(fn);
}

export function search(): Readonly<SearchState> {
  return st;
}

function tell(): void {
  for (const fn of fns) fn();
}

/** Starts following the patch. Called once. */
export function startSearch(): void {
  watch(['field', 'set', 'det', 'pic', 'level', 'tools', 'toolsTab', 'allNumbers', 'color'], kick);
  onSettings(tell);
}

/** True when the search's result is on screen somewhere. */
function looking(): boolean {
  if (S.level !== 'measure' || !S.field) return false;
  return (S.tools && S.toolsTab === 'find') || S.allNumbers;
}

function kick(): void {
  wanted = looking();
  const key = `${S.field ? 'f' : '-'}|${S.det}|${pic().threshold}`;
  if (!S.field) {
    runKey = '';
    st = { state: 'idle', result: null, error: '', open: null, since: 0 };
    return tell();
  }
  if (!wanted || key === runKey) return;
  runKey = key;
  void run(key);
}

async function run(key: string): Promise<void> {
  const det = S.det;
  const threshold = pic().threshold;
  const sameDet = st.result?.det === det;
  st = { ...st, state: 'running', error: '', since: performance.now(), open: sameDet ? st.open : null };
  tell();
  try {
    const result = await compute<ChangeSearch>({ kind: 'search', det, threshold });
    if (key !== runKey) return;
    const keep = st.open && result.candidates.some((c) => c.id === st.open) ? st.open : null;
    st = { ...st, state: 'done', result, open: keep };
  } catch (err) {
    if (err === STALE || key !== runKey) return;
    st = { ...st, state: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
  tell();
}

/** Opens a candidate in the Find changes tab (null closes it). */
export function openCandidate(id: string | null): void {
  st = { ...st, open: id };
  tell();
}

/** A candidate of the current result by id. */
export function candidate(id: string): Candidate | null {
  return st.result?.candidates.find((c) => c.id === id) ?? null;
}

/** The honest label of a verdict, in words (TLS-4). */
export const VERDICT: Record<Verdict, { text: string; tone: '' | 'good' | 'warn' | 'bad' }> = {
  strong: { text: 'Strong signal', tone: 'good' },
  possible: { text: 'Possible', tone: '' },
  known: { text: 'Known', tone: 'good' },
  blended: { text: 'Blended', tone: 'warn' },
  weak: { text: 'Weak: as expected from noise', tone: 'warn' },
  'not-confirmed': { text: 'Not confirmed', tone: 'warn' },
  artefact: { text: 'Likely artefact', tone: 'bad' },
};

/** Ruled out: weak, not confirmed or likely artefact (docs/tools.md). */
export function ruledOut(c: Candidate): boolean {
  return c.verdict === 'weak' || c.verdict === 'not-confirmed' || c.verdict === 'artefact';
}

/**
 * The label a row shows: the user's Reject wins ("Rejected"), then "Ruled out" for the search's
 * own doubts, then the verdict.
 */
export function rowLabel(c: Candidate): { text: string; tone: '' | 'good' | 'warn' | 'bad' } {
  const m = markOf(c.id);
  if (m === 'reject') return { text: 'Rejected', tone: 'bad' };
  return VERDICT[c.verdict];
}

/** The list as shown: hidden rows left out, in the chosen order, at most 100 rows. */
export function shown(result: ChangeSearch | null): Candidate[] {
  if (!result) return [];
  const { hide, order } = current();
  let list = result.candidates.filter(
    (c) => !hide || (c.verdict !== 'known' && !ruledOut(c) && markOf(c.id) !== 'reject'),
  );
  list =
    order === 'date'
      ? [...list].sort((a, b) => a.window - b.window || a.rank - b.rank)
      : [...list].sort((a, b) => a.rank - b.rank);
  return list.slice(0, 100);
}
