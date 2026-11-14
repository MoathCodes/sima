/**
 * The tool tray (SPEC-v1 F4, F8): one compact button on the map's rail opens it, so a newcomer's
 * first view is unchanged. It holds the seven frame types (drag one onto the sky to drop a frame
 * there, or press one to add it in the middle of the sky), Compare for the main frame, and the
 * workspace: save, saved workspaces, export and import. Owner: integrator (workspace).
 */
import { camera, toWorld } from '../sky/sky.ts';
import { icon } from '../shell/icons.ts';
import { toast } from '../shell/toast.ts';
import { FRAME_TYPES, MAX_FRAMES, TYPE_WORDS, type FrameType } from './schema.ts';
import { addFrame, frames, onChange } from './frames.ts';
import { TYPE_ICONS } from './card.ts';
import { openCompare } from './menu.ts';
import { exportFile, importFile, named, onNamed, openNamed, remove, rename, saveAs, workspaceName } from './store.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

let renaming: string | null = null;

/** Fills the tray and wires its button. Called once by index.ts. */
export function startTray(): void {
  const tray = document.getElementById('workspace');
  if (!tray) return;
  fill(tray);
  onNamed(() => fill(tray));
  onChange((what) => {
    if (what === 'frames' && tray.matches(':popover-open')) count(tray);
  });
  tray.addEventListener('beforetoggle', (e) => {
    if ((e as ToggleEvent).newState !== 'open') return;
    renaming = null;
    fill(tray);
    const btn = document.querySelector('[data-guide="workspace-button"]')?.getBoundingClientRect();
    const rail = document.getElementById('rail')?.getBoundingClientRect();
    if (!btn || !rail) return;
    tray.style.left = `${rail.right + 8}px`;
    // Next to its button, inside the window.
    requestAnimationFrame(() => {
      const h = tray.offsetHeight;
      tray.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, btn.top - 40))}px`;
    });
  });
  tray.addEventListener('pointerdown', (e) => {
    const tool = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-tool]') : null;
    if (tool && e.button === 0) startDrag(e, tool.dataset.tool as FrameType, tray);
  });
  tray.addEventListener('click', (e) => onClick(e, tray));
  tray.addEventListener('keydown', (e) => {
    const input = e.target instanceof HTMLInputElement ? e.target : null;
    if (!input || e.key !== 'Enter') return;
    e.preventDefault();
    if (input.dataset.rename !== undefined && renaming) {
      rename(renaming, input.value);
      renaming = null;
      fill(tray);
    } else if (input.hasAttribute('data-name')) saveAs(input.value);
  });
  tray.addEventListener('change', (e) => {
    const input = e.target instanceof HTMLInputElement && e.target.type === 'file' ? e.target : null;
    const file = input?.files?.[0];
    if (file) void importFile(file).then(() => tray.hidePopover());
  });
}

function fill(tray: HTMLElement): void {
  const saved = named();
  tray.innerHTML = `
    <p class="group-label">Add a frame</p>
    <p class="wf-hint">Drag one onto the sky to look there, or press one to add it in the middle of the sky. <span data-count></span></p>
    <div class="wf-tools">${FRAME_TYPES.map((t) => `<button type="button" class="wf-tool" data-tool="${t}" data-guide="tool-${t}" data-tip="${esc(TYPE_WORDS[t].line)}" data-tip-pos="right">${icon(TYPE_ICONS[t])}<span>${esc(TYPE_WORDS[t].name)}</span></button>`).join('')}</div>
    <div class="wf-row"><span class="wf-row-label">Compare the main frame</span><button type="button" class="btn text" data-compare-main data-guide="compare-main">${icon('compare')}Compare…</button></div>
    <hr class="wf-rule">
    <p class="group-label">Workspace</p>
    <div class="wf-save"><input class="field" data-name value="${esc(workspaceName())}" aria-label="Workspace name" maxlength="60" data-guide="workspace-name"><button type="button" class="btn" data-save data-guide="workspace-save">Save</button></div>
    ${saved.length ? `<ul class="wf-saved" data-scroll>${saved.map((n) => savedRow(n.name, n.saved)).join('')}</ul>` : '<p class="wf-hint">Saved workspaces appear here. They are kept in this browser only.</p>'}
    <div class="wf-files">
      <button type="button" class="btn text" data-export data-guide="workspace-export">${icon('download')}Export file</button>
      <label class="btn text wf-import" data-guide="workspace-import">${icon('share')}Import file<input type="file" accept=".json,application/json" hidden></label>
      <span class="wf-hint">Share gives a link to the whole workspace.</span>
    </div>`;
  count(tray);
}

function savedRow(n: string, when: string): string {
  if (renaming === n) {
    return `<li class="wf-saved-row"><input class="field" data-rename value="${esc(n)}" aria-label="New name" maxlength="60"><button type="button" class="btn text" data-rename-ok>Rename</button></li>`;
  }
  const d = new Date(when);
  const date = Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
  return `<li class="wf-saved-row" data-saved="${esc(n)}">
    <button type="button" class="menu-item" data-open-ws data-guide="workspace-open">${esc(n)}<span class="line">Saved ${esc(date)}</span></button>
    <button type="button" class="icon-btn sm" data-rename-ws aria-label="Rename ${esc(n)}" data-tip="Rename">${icon('bookmark')}</button>
    <button type="button" class="icon-btn sm" data-delete-ws aria-label="Delete ${esc(n)}" data-tip="Delete">${icon('close')}</button></li>`;
}

function count(tray: HTMLElement): void {
  const el = tray.querySelector('[data-count]');
  const n = frames().length;
  if (el) el.textContent = n ? `${n} of ${MAX_FRAMES} open.` : '';
}

function onClick(e: MouseEvent, tray: HTMLElement): void {
  const t = e.target instanceof Element ? e.target : null;
  if (!t) return;
  const row = t.closest<HTMLElement>('[data-saved]');
  const n = row?.dataset.saved ?? '';
  if (t.closest('[data-tool]')) {
    if (justDragged) return;
    const tool = t.closest<HTMLElement>('[data-tool]')!.dataset.tool as FrameType;
    const c = camera();
    tray.hidePopover();
    addFrame(tool, { ra: c.ra, dec: c.dec }, { fresh: true });
  } else if (t.closest('[data-compare-main]')) {
    openCompare('main', t.closest<HTMLElement>('[data-compare-main]')!);
  } else if (t.closest('[data-save]')) {
    saveAs(tray.querySelector<HTMLInputElement>('[data-name]')?.value ?? '');
  } else if (t.closest('[data-open-ws]')) {
    tray.hidePopover();
    openNamed(n);
  } else if (t.closest('[data-rename-ws]')) {
    renaming = n;
    fill(tray);
    tray.querySelector<HTMLInputElement>('[data-rename]')?.select();
  } else if (t.closest('[data-rename-ok]') && renaming) {
    rename(renaming, tray.querySelector<HTMLInputElement>('[data-rename]')?.value ?? '');
    renaming = null;
    fill(tray);
  } else if (t.closest('[data-delete-ws]')) {
    remove(n);
    toast(`Deleted “${n}”.`);
  } else if (t.closest('[data-export]')) {
    exportFile();
  }
}

// ----- Dragging a tool onto the sky -----------------------------------------------------------

let justDragged = false;

function startDrag(e: PointerEvent, type: FrameType, tray: HTMLElement): void {
  const x0 = e.clientX;
  const y0 = e.clientY;
  let ghost: HTMLElement | null = null;
  const move = (ev: PointerEvent) => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.className = 'wf-ghost';
      ghost.dataset.overlay = 'wf-ghost';
      ghost.innerHTML = `${icon(TYPE_ICONS[type])}<span>${esc(TYPE_WORDS[type].name)}</span>`;
      document.body.append(ghost);
      tray.hidePopover();
    }
    ghost.style.left = `${ev.clientX}px`;
    ghost.style.top = `${ev.clientY}px`;
  };
  const end = (ev: PointerEvent) => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', end);
    removeEventListener('pointercancel', end);
    if (!ghost) return;
    ghost.remove();
    justDragged = true;
    setTimeout(() => (justDragged = false), 0);
    if (ev.type !== 'pointerup') return;
    const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el.closest('[data-card], [popover], dialog'));
    const at = toWorld(ev.clientX, ev.clientY);
    if (under || !at) {
      toast('Drop it on the sky, not on a card.');
      return;
    }
    addFrame(type, at, { fresh: true });
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}
