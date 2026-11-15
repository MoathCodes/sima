/**
 * The field size on a phone in Discover (challenge guard rail: the field of view stays reachable).
 * Owner: lane M.
 *
 * The frame's header keeps only the name and the source line on a phone, so the field size is one
 * small button at the frame's top right ("6′"). It opens a short menu of the sizes; choosing one
 * calls the viewer's own `setFov`. On desktop and in Expert the frame's own − / + stay.
 */
import { FOVS, S, watch } from '../viewer/state.ts';
import { setFov } from '../viewer/load.ts';
import { esc } from './ui.ts';
import { t as tr } from '../shell/i18n.ts';

/** Adds the button and its menu to the frame. Called once by Discover's start. */
export function startField(): void {
  const frame = document.getElementById('frame');
  if (!frame || document.getElementById('dsc-field')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'dsc-field';
  btn.className = 'dsc-field';
  btn.dataset.guide = 'field-size';
  btn.setAttribute('popovertarget', 'dsc-field-menu');
  const menu = document.createElement('div');
  menu.id = 'dsc-field-menu';
  menu.className = 'dsc-field-menu';
  menu.setAttribute('popover', '');
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', tr('frame.fov'));
  frame.append(btn);
  document.body.append(menu);

  const draw = () => {
    btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>${S.fov}′</span>`;
    btn.setAttribute('aria-label', tr('frame.fovLabel', { n: S.fov }));
    menu.innerHTML = `<p class="dsc-field-label">${tr('frame.fov')}</p><div class="dsc-field-row">${FOVS.map(
      (v) =>
        `<button type="button" data-fov-pick="${v}" aria-pressed="${v === S.fov}" aria-label="${esc(tr('df.arcmin', { n: v }))}">${v}′</button>`,
    ).join('')}</div>`;
  };
  draw();
  watch(['fov'], draw);
  menu.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-fov-pick]');
    if (!b) return;
    const v = Number(b.dataset.fovPick) as (typeof FOVS)[number];
    if (v !== S.fov) void setFov(v);
    menu.hidePopover();
  });
  // Under its button, right-aligned with it.
  menu.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState !== 'open') return;
    const r = btn.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 6)}px`;
    menu.style.right = `${Math.round(innerWidth - r.right)}px`;
    menu.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  });
}
