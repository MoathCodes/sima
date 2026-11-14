/**
 * An extra frame's menus: "…" (type, detector, field size, pinned or docked, links, duplicate,
 * make main, copy coordinates, the source file), Compare (SPEC-v1 F7), and the question the
 * seventh frame asks: which one to close (SPEC-v1 F4). Owner: integrator (workspace).
 *
 * Menus are native popovers (`popover="auto"`), so Escape and a click elsewhere close them first,
 * as every popover does (GEN-1). The question is a modal dialog.
 */
import { FOVS, S, type Fov } from '../viewer/state.ts';
import { formatCoords } from '../core/astro.ts';
import { icon } from '../shell/icons.ts';
import { toast } from '../shell/toast.ts';
import { FRAME_TYPES, TYPE_WORDS } from './schema.ts';
import {
  closeFrame,
  compare,
  duplicate,
  frames,
  groupLetter,
  groupOf,
  linkTogether,
  makeMain,
  mainType,
  mates,
  numberOf,
  otherDet,
  setAnchor,
  setDet,
  setLinkKind,
  setMode,
  setSameColour,
  setType,
  unlink,
  type CompareWhat,
  type Live,
  type Member,
} from './frames.ts';
import { TYPE_ICONS } from './card.ts';
import { placedBox } from './place.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function popover(): HTMLElement {
  let el = document.getElementById('wf-menu');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wf-menu';
    el.className = 'popover wf-menu';
    el.setAttribute('popover', 'auto');
    el.dataset.overlay = 'wf-menu';
    el.dataset.guide = 'wf-menu-card';
    document.body.append(el);
  }
  return el;
}

function openAt(el: HTMLElement, btn: HTMLElement): void {
  if (el.matches(':popover-open')) el.hidePopover();
  el.showPopover();
  const r = btn.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`;
  el.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, r.bottom + 6))}px`;
  el.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
}

function close(): void {
  const el = document.getElementById('wf-menu');
  if (el?.matches(':popover-open')) el.hidePopover();
}

function memberName(m: Member): string {
  return m === 'main' ? 'the main frame' : `frame ${numberOf(m)}`;
}

/** The "…" menu of a frame. */
export function openMenu(f: Live, btn: HTMLElement): void {
  const el = popover();
  const g = groupOf(f);
  const isImage = f.s.type === 'blink' || f.s.type === 'two' || f.s.type === 'diff';
  const others: Member[] = ['main', ...frames().filter((x) => x !== f)];
  const linkable = others.filter((m) => !g || !mates(f).includes(m));
  const seg = (attr: string, items: [string, string, boolean, string?][]) =>
    `<div class="seg wf-seg">${items.map(([v, label, on, tip]) => `<button type="button" ${attr}="${v}" aria-pressed="${on}"${tip ? ` data-tip="${esc(tip)}" aria-label="${esc(tip)}"` : ''}>${label}</button>`).join('')}</div>`;
  el.innerHTML = `
    <p class="group-label">Frame ${numberOf(f)} · ${esc(TYPE_WORDS[f.s.type].name)}</p>
    <div class="wf-types" role="group" aria-label="Type">${FRAME_TYPES.map((t) => `<button type="button" class="icon-btn sm" data-type="${t}" aria-pressed="${t === f.s.type}" aria-label="${TYPE_WORDS[t].name}" data-tip="${esc(`${TYPE_WORDS[t].name}: ${TYPE_WORDS[t].line}`)}" data-guide="wf-type-${t}">${icon(TYPE_ICONS[t])}</button>`).join('')}</div>
    <p class="group-label">Detector</p>
    ${seg('data-det', [1, 2, 3, 4, 5, 6].map((d) => [String(d), `D${d}`, d === f.s.det]))}
    ${isImage ? `<button type="button" class="menu-item" role="menuitemcheckbox" aria-checked="${f.s.sameColour}" data-same>Same wavelength only<span class="line">Each date only where its colour matches the first date</span></button>` : ''}
    <p class="group-label">Field size</p>
    ${seg('data-fov', FOVS.map((v) => [String(v), `${v}′`, v === f.s.fov]))}
    ${seg('data-mode', [
      ['pinned', 'Pinned to the sky', f.s.mode === 'pinned', 'Follows its spot as the sky moves'],
      ['docked', 'Docked', f.s.mode === 'docked', 'Stays put on the screen'],
    ])}
    <hr class="wf-rule">
    ${g ? `<p class="group-label">${icon('chain')} Link ${groupLetter(g)}, with ${esc(mates(f).map(memberName).join(', '))}</p>
      <div class="wf-kinds">
        ${(['time', 'position', 'detector'] as const).map((k) => `<button type="button" class="btn text" role="switch" aria-checked="${g[k]}" data-kind="${k}"><span class="switch sm" aria-hidden="true" aria-checked="${g[k]}"></span>${k === 'time' ? 'Dates' : k === 'position' ? 'Spot' : 'Detector'}</button>`).join('')}
      </div>
      <button type="button" class="menu-item" data-unlink>Unlink this frame</button>` : ''}
    ${linkable.length ? `<p class="group-label">Link with</p><div class="wf-linkto">${linkable.map((m) => `<button type="button" class="btn quiet" data-linkto="${m === 'main' ? 'main' : m.s.id}" data-guide="wf-link-${m === 'main' ? 'main' : m.s.id}">${icon('chain')}${m === 'main' ? 'Main frame' : `Frame ${numberOf(m)}`}</button>`).join('')}</div>` : ''}
    <hr class="wf-rule">
    <button type="button" class="menu-item" data-act="duplicate">Duplicate</button>
    <button type="button" class="menu-item" data-act="main" data-guide="wf-make-main">Make it the main frame<span class="line">The main frame moves here; this frame takes its spot</span></button>
    <button type="button" class="menu-item" data-act="copy">Copy coordinates<span class="line">${esc(formatCoords(f.s.anchor.ra, f.s.anchor.dec))}</span></button>
    ${sourceUrl(f) ? `<a class="menu-item" href="${esc(sourceUrl(f)!)}" target="_blank" rel="noopener">Open the source file at IRSA<span class="line">The full exposure on screen, at NASA’s archive</span></a>` : ''}
    <button type="button" class="menu-item" data-act="close">Close this frame</button>`;
  el.onclick = (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const b = t?.closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.type) setType(f, b.dataset.type as never);
    else if (b.dataset.det) setDet(f, Number(b.dataset.det));
    else if (b.dataset.fov) setAnchor(f, f.s.anchor.ra, f.s.anchor.dec, Number(b.dataset.fov) as Fov);
    else if (b.dataset.mode) setMode(f, b.dataset.mode as 'pinned' | 'docked', placedBox(f, b.dataset.mode as 'pinned' | 'docked'));
    else if (b.hasAttribute('data-same')) setSameColour(f, !f.s.sameColour);
    else if (b.dataset.kind && g) setLinkKind(g, b.dataset.kind as 'time', !g[b.dataset.kind as 'time'], f);
    else if (b.hasAttribute('data-unlink')) unlink(f);
    else if (b.dataset.linkto) {
      const other = b.dataset.linkto === 'main' ? 'main' : frames().find((x) => x.s.id === b.dataset.linkto);
      if (other) linkTogether(f, other);
    } else if (b.dataset.act === 'duplicate') duplicate(f);
    else if (b.dataset.act === 'main') makeMain(f);
    else if (b.dataset.act === 'copy') void copyText(formatCoords(f.s.anchor.ra, f.s.anchor.dec));
    else if (b.dataset.act === 'close') closeFrame(f);
    else return;
    if (b.dataset.act || b.dataset.linkto || b.hasAttribute('data-unlink')) close();
    else if (el.matches(':popover-open')) openMenu(f, btn);
  };
  openAt(el, btn);
}

function sourceUrl(f: Live): string | null {
  const field = f.status.field;
  const g = f.groups[f.epoch];
  const x = field && g ? field.frames[g.frames[0] ?? -1] : undefined;
  return x && x.src !== null ? (f.status.set?.frames[x.src]?.meta.url ?? null) : null;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${text}`);
  } catch {
    toast(`Could not copy. The coordinates are ${text}`);
  }
}

/** The Compare menu: a copy docked beside it, time linked, one thing different. */
export function openCompare(f: Member, btn: HTMLElement): void {
  const el = popover();
  const det = f === 'main' ? S.det : f.s.det;
  const type = f === 'main' ? mainType() : f.s.type;
  const other = type === 'blink' ? 'diff' : 'blink';
  el.innerHTML = `
    <p class="group-label">Compare ${f === 'main' ? 'the main frame' : `frame ${numberOf(f)}`} with a copy beside it</p>
    <button type="button" class="menu-item" data-cmp="det" data-guide="compare-det">Another detector<span class="line">D${otherDet(det)}, dates linked</span></button>
    <button type="button" class="menu-item" data-cmp="date" data-guide="compare-date">Another date<span class="line">Starts at the first date; spot and detector linked</span></button>
    <button type="button" class="menu-item" data-cmp="type" data-guide="compare-type">Another type<span class="line">${TYPE_WORDS[other].name}, dates linked</span></button>`;
  el.onclick = (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-cmp]') : null;
    if (!b) return;
    close();
    compare(f, b.dataset.cmp as CompareWhat);
  };
  openAt(el, btn);
}

/** Six frames are open: asks which to close, then calls `then` (SPEC-v1 F4). */
export function askWhichToClose(then: () => void): void {
  let dialog = document.getElementById('wf-full') as HTMLDialogElement | null;
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'wf-full';
    dialog.className = 'dialog wf-full';
    dialog.dataset.overlay = 'wf-full';
    dialog.dataset.guide = 'wf-full';
    dialog.setAttribute('aria-labelledby', 'wf-full-title');
    document.body.append(dialog);
  }
  const d = dialog;
  d.innerHTML = `
    <header class="dialog-head"><h2 id="wf-full-title">Six frames are open</h2>
      <button class="icon-btn sm" type="button" data-cancel aria-label="Cancel" data-tip="Cancel">${icon('close')}</button></header>
    <p>Six is the most the page can play smoothly. Close one to add the new frame.</p>
    <div class="wf-full-list">${frames().map((f) => `<button type="button" class="menu-item" data-close-id="${f.s.id}">${icon(TYPE_ICONS[f.s.type])}<span>Frame ${numberOf(f)} · ${esc(TYPE_WORDS[f.s.type].name)}<span class="line">${esc(f.status.target?.name ?? formatCoords(f.s.anchor.ra, f.s.anchor.dec))}, D${f.s.det}</span></span></button>`).join('')}</div>
    <div class="wf-full-foot"><button class="btn" type="button" data-cancel>Keep them all</button></div>`;
  d.onclick = (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('[data-cancel]')) return d.close();
    const b = t?.closest<HTMLElement>('[data-close-id]');
    const f = b && frames().find((x) => x.s.id === b.dataset.closeId);
    if (!f) return;
    d.close();
    closeFrame(f);
    then();
  };
  d.showModal();
}
