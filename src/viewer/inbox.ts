/**
 * "Found in this patch" in Measure (MSR-2): the patch's own target, then what the change search
 * lists in this detector at its threshold, strongest first. Each row opens in Measure. Owner:
 * lane E. The candidate list itself, with its triage, is in the Find changes tab
 * (tools/tab-find.ts); both read the same search (tools/search.ts).
 *
 * Honesty (H7): rows are candidates to check, never discoveries.
 */
import { S } from './state.ts';
import { onSearch, rowLabel, search, shown } from './tools/search.ts';
import { openInMeasure, passWords } from './tools/tab-find.ts';
import { esc, num, pill } from './tools/dom.ts';

let started = false;

/** Re-renders the list (through `redraw`) whenever the search changes. Called once by detail.ts. */
export function startInbox(redraw: () => void): void {
  if (started) return;
  started = true;
  onSearch(redraw);
}

/** Fills the found list. */
export function renderFound(host: HTMLElement): void {
  const count = host.closest('#measure')?.querySelector('[data-found-count]');
  const field = S.field;
  const s = search();
  if (!field || field.simulated) {
    host.innerHTML = field
      ? '<p class="ms-note">Simulated pictures: nothing is searched or listed here (real results only).</p>'
      : '';
    if (count) count.textContent = '';
    return;
  }
  const rows: string[] = [];
  const t = field.target;
  if (t) {
    const on = S.selected?.kind === 'target';
    rows.push(`<button type="button" class="ms-find${on ? ' on' : ''}" data-find="target">
      <span class="ms-find-name">${esc(t.name)}</span>
      <span class="ms-find-line">The patch’s own target · ${esc(t.line)}</span>
      <span class="ms-find-tags">${pill('Catalogue position')}${pill('Real SPHEREx', 'good')}</span></button>`);
  }
  // The target's own row is above; its "Known" candidate would repeat it. Any doubt about the
  // target (Not confirmed, Likely artefact) stays listed.
  const list = shown(s.result)
    .filter((c) => !(c.known?.cat === 'target' && c.verdict === 'known'))
    .slice(0, 20);
  for (const c of list) {
    const label = rowLabel(c);
    const on = S.selected?.kind === 'candidate' && S.selected.id === c.id;
    const what =
      c.kind === 'mover' && c.motion
        ? `Moving ${num(c.motion.total, 1)}″ a year`
        : `${c.kind === 'fainter' ? 'Fainter' : c.kind === 'brighter' ? 'Brighter' : 'Moved?'}, ${num(c.strength, 1)}× noise, ${passWords(c.window)}`;
    rows.push(`<button type="button" class="ms-find${on ? ' on' : ''}" data-find="${esc(c.id)}">
      <span class="ms-find-name">Candidate ${c.rank}</span>
      <span class="ms-find-line">${esc(what)}${c.known ? ` · ${esc(c.known.id)}` : ''}</span>
      <span class="ms-find-tags">${pill(label.text, label.tone)}</span></button>`);
  }
  const note =
    s.state === 'running'
      ? `Searching D${S.det} for changes…`
      : s.state === 'failed'
        ? `The change search could not run: ${s.error}`
        : s.result && !list.length
          ? `No candidates to check in D${S.det} at ${num(s.result.threshold, 1)}× noise.`
          : '';
  host.innerHTML = rows.join('') + (note ? `<p class="ms-note">${esc(note)}</p>` : '');
  if (count) count.textContent = `${rows.length} ${rows.length === 1 ? 'item' : 'items'}`;
  host.querySelectorAll<HTMLElement>('[data-find]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.find ?? '';
      if (id === 'target') {
        S.selected = { kind: 'target' };
        return;
      }
      const c = s.result?.candidates.find((x) => x.id === id);
      if (c) openInMeasure(c);
    }),
  );
}
