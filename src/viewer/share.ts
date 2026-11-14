/**
 * Share (GEN-2): a link and an embed code for what is on screen. Owner: lane F.
 *
 * The link restores the patch, field size, detector, view, picture settings and, if "Start at"
 * is ticked, the date of the picture on screen (url.ts `linkFor`). The embed code is an iframe
 * of the same link with `embed=1`: only the frame, the bar and Measure (GEN-3).
 *
 * With extra frames open (src/workspace), the link also carries the whole workspace after `#w=`
 * (SPEC-v1 F8). Over 4,000 characters it offers the workspace file instead.
 */
import { S } from './state.ts';
import { dayOf, linkFor } from './url.ts';
import { formatDate } from '../core/astro.ts';
import { encodePic } from '../core/picture.ts';
import { icon } from '../shell/icons.ts';

/** What the workspace lends Share: set by src/workspace/index.ts. */
interface WorkspaceShare {
  /** Extra frames open now. */
  count(): number;
  /** The `#w=` part for a link, or null when the link would be too long; and the full length. */
  hash(base: string): Promise<{ hash: string | null; length: number }>;
  /** Downloads the workspace file. */
  download(): void;
}
let workspace: WorkspaceShare | null = null;

/** The workspace adds its frames to the shared link. */
export function shareWorkspace(w: WorkspaceShare): void {
  workspace = w;
}

/** Fills the Share dialog. Called once by shell.ts. */
export function startShare(): void {
  const dialog = document.getElementById('share');
  if (!(dialog instanceof HTMLDialogElement)) return;
  dialog.setAttribute('aria-labelledby', 'share-title');
  dialog.innerHTML = `
    <header class="dialog-head">
      <h2 id="share-title">Share this view</h2>
      <button class="icon-btn sm" data-dialog-close aria-label="Close Share" data-tip="Close">${icon('close')}</button>
    </header>
    <div class="tabs share-tabs" role="tablist" aria-label="Share as">
      <button role="tab" id="share-tab-link" aria-selected="true" aria-controls="share-link" data-tab="link" data-guide="share-tab-link">Link</button>
      <button role="tab" id="share-tab-embed" aria-selected="false" aria-controls="share-embed" data-tab="embed" tabindex="-1" data-guide="share-tab-embed">Embed</button>
    </div>
    <div id="share-link" role="tabpanel" aria-labelledby="share-tab-link" class="share-panel">
      <div class="share-row">
        <input class="share-code" readonly aria-label="Link to this view" data-guide="share-link" data-code>
        <button class="btn primary" data-copy data-guide="share-copy">Copy</button>
      </div>
      <label class="share-check" data-date-row><input type="checkbox" checked data-date> Start at <span data-date-text></span></label>
      <label class="share-check" data-ws-row hidden><input type="checkbox" checked data-ws data-guide="share-workspace"> <span data-ws-text></span></label>
      <p class="share-note" data-note></p>
      <p class="share-note" data-ws-note hidden></p>
    </div>
    <div id="share-embed" role="tabpanel" aria-labelledby="share-tab-embed" class="share-panel" hidden>
      <div class="share-row">
        <textarea class="share-code" readonly rows="3" aria-label="Embed code" data-guide="share-embed-code" data-code></textarea>
        <button class="btn primary" data-copy>Copy</button>
      </div>
      <p class="share-note">Paste it into a web page. It shows only the frame, the bar and Measure, on the same patch.</p>
    </div>`;

  dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-date]')?.addEventListener('change', () => fill(dialog));
  dialog.querySelector('[data-ws]')?.addEventListener('change', () => fill(dialog));
  dialog.querySelector('[data-ws-note]')?.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-ws-file]')) workspace?.download();
  });
  const tabs = [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')];
  const choose = (tab: HTMLElement) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !on;
    }
    tab.focus();
  };
  for (const t of tabs) {
    t.addEventListener('click', () => choose(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next =
        tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      if (next) choose(next);
    });
  }
  for (const btn of dialog.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    btn.addEventListener('click', () => void copy(btn));
  }
  for (const code of dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    '[data-code]',
  )) {
    code.addEventListener('focus', () => code.select());
  }
}

/** Opens Share with the links for what is on screen now. */
export function openShare(): void {
  const dialog = document.getElementById('share');
  if (!(dialog instanceof HTMLDialogElement)) return;
  fill(dialog);
  dialog.showModal();
  dialog.querySelector<HTMLElement>('[data-copy]')?.focus();
}

function fill(dialog: HTMLElement): void {
  const g = S.groups[S.epoch];
  const day = dayOf(g);
  const dateRow = dialog.querySelector<HTMLElement>('[data-date-row]');
  const dateBox = dialog.querySelector<HTMLInputElement>('[data-date]');
  const dateText = dialog.querySelector('[data-date-text]');
  if (dateRow) dateRow.hidden = !day;
  if (dateText && g && day) dateText.textContent = formatDate(g.mjd, 'day');
  const withDate = !!day && dateBox?.checked !== false;

  const link = linkFor({ date: withDate });
  const embed = linkFor({ date: withDate, embed: true });
  const [linkBox, embedBox] = dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    '[data-code]',
  );
  if (linkBox) linkBox.value = link;
  if (embedBox) {
    const title = `Sima: ${S.label || 'SPHEREx pictures'}`.replace(/"/g, '&quot;');
    embedBox.value = `<iframe src="${embed.replace(/&/g, '&amp;')}" title="${title}" width="100%" height="960" style="border:0" loading="lazy"></iframe>`;
  }

  const kept = ['patch', 'field size', 'detector', 'view'];
  if (encodePic(S.pic)) kept.push('picture settings');
  if (withDate) kept.push('date');
  const extra = workspace?.count() ?? 0;
  const wsRow = dialog.querySelector<HTMLElement>('[data-ws-row]');
  const wsBox = dialog.querySelector<HTMLInputElement>('[data-ws]');
  const wsNote = dialog.querySelector<HTMLElement>('[data-ws-note]');
  const withWs = extra > 0 && wsBox?.checked !== false;
  if (wsRow) wsRow.hidden = !extra;
  const wsText = dialog.querySelector('[data-ws-text]');
  if (wsText) wsText.textContent = `Include the ${extra === 1 ? 'extra frame' : `${extra} extra frames`} and their links`;
  if (wsNote) wsNote.hidden = true;
  if (withWs) kept.push('extra frames');
  const note = dialog.querySelector('[data-note]');
  if (note) note.textContent = `The link opens this page on the same ${list(kept)}.`;
  for (const btn of dialog.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    btn.textContent = 'Copy';
  }
  if (withWs && workspace && linkBox) {
    void workspace.hash(link).then(({ hash, length }) => {
      if (!dialog.isConnected) return;
      if (hash) linkBox.value = link + hash;
      else if (wsNote) {
        wsNote.hidden = false;
        wsNote.innerHTML = `The whole workspace makes a link of ${length.toLocaleString('en')} characters, too long to share safely, so the link above has the main frame only. <button type="button" class="link" data-ws-file>Download the workspace file</button> and send that instead.`;
      }
    });
  }
}

async function copy(btn: HTMLButtonElement): Promise<void> {
  const code = btn.parentElement?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    '[data-code]',
  );
  if (!code) return;
  code.select();
  let done = false;
  try {
    await navigator.clipboard.writeText(code.value);
    done = true;
  } catch {
    // The clipboard can be blocked (no permission, not a secure page): fall back below.
  }
  btn.textContent = done ? 'Copied' : 'Press Ctrl+C';
  window.setTimeout(() => (btn.textContent = 'Copy'), 2000);
}

function list(words: string[]): string {
  return words.length < 2
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}
