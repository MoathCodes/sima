/**
 * Settings (v2.0, BEGINNER-AND-MOBILE.md section 5.7). Owner: lane F.
 *
 * In `#settings`: Panels (Glass or Solid, and why the page chose Solid when it did), the motion
 * line (read-only: motion follows the system) and Reset (asks first; clears only
 * `sima-missions` through progress.ts). A reason is said only when the page chose Solid.
 *
 * On a desktop it is a Raised card under the Settings button (top right), closed by Escape
 * (order 30), the close button, the button again or a click outside. In a phone layout it opens
 * as a full-height Slate page through lane M's `openPage` (section 11.2), with M's Back.
 */
import { icon } from './icons.ts';
import {
  glassLevel,
  glassReason,
  onGlass,
  setPanels,
  type GlassLevel,
  type GlassReason,
} from './glass.ts';
import { resetProgress } from '../explore/progress.ts';
import { leavePage, onPhone, phonePage } from './pages.ts';

let opener: HTMLElement | null = null;

function box(): HTMLElement | null {
  return document.getElementById('settings');
}

/** Fills `#settings` and wires its buttons. Called once by shell.ts. */
export function startSettings(): void {
  const el = box();
  if (!el) return;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'settings-title');
  el.dataset.guide = 'settings';
  el.dataset.overlay = 'settings';
  el.classList.add('st-card', 'appear');
  el.innerHTML = `
    <header class="st-head">
      <h2 id="settings-title" class="st-title">Settings</h2>
      <button type="button" class="icon-btn sm st-close" data-close aria-label="Close Settings" data-tip="Close">${icon('close')}</button>
    </header>
    <section class="st-group" aria-labelledby="st-panels">
      <h3 class="group-label" id="st-panels">Panels</h3>
      <div class="seg st-seg" role="radiogroup" aria-labelledby="st-panels">
        <button type="button" role="radio" data-panels="glass" data-guide="panels-glass">Glass</button>
        <button type="button" role="radio" data-panels="solid" data-guide="panels-solid">Solid</button>
      </div>
      <p class="st-note" data-panels-note></p>
    </section>
    <section class="st-group st-row" aria-labelledby="st-motion">
      <h3 class="group-label" id="st-motion">Motion</h3>
      <span class="st-note term" tabindex="0" data-motion></span>
    </section>
    <section class="st-group" aria-labelledby="st-progress">
      <div class="st-row">
        <h3 class="group-label" id="st-progress">Progress</h3>
        <button type="button" class="btn st-reset" data-reset data-guide="settings-reset" data-tip="Kept in this browser only">Reset</button>
      </div>
      <div class="st-confirm" data-confirm role="group" aria-labelledby="st-confirm-q" hidden>
        <p id="st-confirm-q" class="st-q">Reset your missions and skills?</p>
        <div class="st-confirm-row">
          <button type="button" class="btn primary" data-reset-yes data-guide="settings-reset-yes">Reset</button>
          <button type="button" class="btn quiet" data-reset-no>Keep my progress</button>
        </div>
      </div>
      <p class="st-note st-done" data-reset-done role="status"></p>
    </section>`;

  const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const radios = [...el.querySelectorAll<HTMLElement>('[data-panels]')];
  const pick = (r: HTMLElement | undefined) => {
    if (!r || r.getAttribute('aria-disabled') === 'true') return;
    setPanels(r.dataset.panels === 'glass' ? 'glass' : 'solid');
    r.focus();
  };
  for (const r of radios) r.addEventListener('click', () => pick(r));
  q('.st-seg').addEventListener('keydown', (e) => {
    const i = radios.indexOf(document.activeElement as HTMLElement);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || step === undefined) return;
    e.preventDefault();
    pick(radios[(i + step + radios.length) % radios.length]);
  });
  const confirm = q('[data-confirm]');
  const reset = q<HTMLButtonElement>('[data-reset]');
  const done = q('[data-reset-done]');
  reset.addEventListener('click', () => {
    confirm.hidden = false;
    reset.hidden = true;
    done.textContent = '';
    q('[data-reset-no]').focus();
  });
  const endConfirm = () => {
    confirm.hidden = true;
    reset.hidden = false;
    reset.focus();
  };
  q('[data-reset-no]').addEventListener('click', endConfirm);
  q('[data-reset-yes]').addEventListener('click', () => {
    resetProgress();
    endConfirm();
    done.textContent = 'Progress reset.';
  });

  q('[data-close]').addEventListener('click', () => closeSettings());
  // A click outside closes the card on a desktop (as a popover does); the button toggles.
  document.addEventListener('pointerdown', (e) => {
    if (el.hidden || onPhone()) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && !t.closest('#settings, [data-open="settings"]')) closeSettings(false);
  });
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-open="settings"]') : null;
    if (!t) return;
    if (el.hidden) openSettings(t);
    else closeSettings();
  });

  onGlass(() => fill(el));
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => fill(el));
  addEventListener('resize', () => {
    if (!el.hidden && !onPhone()) place(el);
  });
  fill(el);
}

/**
 * Opens Settings.
 * @param from The control that opened it: focus goes back to it on close.
 */
export function openSettings(from?: HTMLElement): void {
  const el = box();
  if (!el) return;
  opener = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  fill(el);
  el.hidden = false;
  setExpanded(true);
  if (onPhone()) phonePage(el, 'Settings', () => hide(el));
  else place(el);
  el.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
}

/**
 * Closes Settings.
 * @param refocus Return focus to the control that opened it (default true).
 */
export function closeSettings(refocus = true): void {
  const el = box();
  if (!el || el.hidden) return;
  if (el.closest('#sheet')) {
    leavePage(el); // M's Back: it returns focus and then hides the card (phonePage's onLeave)
    return;
  }
  hide(el);
  if (refocus) opener?.focus();
  opener = null;
}

function hide(el: HTMLElement): void {
  el.hidden = true;
  setExpanded(false);
  const confirm = el.querySelector<HTMLElement>('[data-confirm]');
  if (confirm) confirm.hidden = true;
  const reset = el.querySelector<HTMLElement>('[data-reset]');
  if (reset) reset.hidden = false;
}

function setExpanded(on: boolean): void {
  for (const b of document.querySelectorAll('[data-open="settings"]')) {
    b.setAttribute('aria-expanded', String(on));
  }
}

/** Under the Settings button, right-aligned with the top row (desktop). */
function place(el: HTMLElement): void {
  const row = [document.getElementById('actions'), document.getElementById('view-switch')]
    .filter((e): e is HTMLElement => !!e && e.checkVisibility())
    .map((e) => e.getBoundingClientRect());
  const bottom = Math.max(0, ...row.map((r) => r.bottom));
  const right = Math.max(0, ...row.map((r) => r.right));
  el.style.top = `${Math.round(bottom + 6)}px`;
  el.style.right = `${Math.round(innerWidth - (right || innerWidth - 16))}px`;
}

const PANELS_NOTE: Record<GlassReason, string> = {
  'forced-colors': 'Panels are solid while your system uses forced colours.',
  contrast: 'Panels are solid because your system asks for more contrast.',
  choice: '',
  embed: 'Panels are solid in an embedded page.',
  unsupported: 'This browser cannot draw glass, so panels are solid.',
  'reduced-transparency': 'Panels are solid because your system asks for less transparency. Choose Glass to try it anyway.',
  phone: 'Panels start solid on phones, to keep the sky smooth. Choose Glass to try it.',
  software: 'Panels are solid because this browser draws the sky without a graphics card.',
  default: '',
};

function fill(el: HTMLElement): void {
  const level: GlassLevel = glassLevel();
  const why = glassReason();
  const locked = why === 'forced-colors' || why === 'contrast';
  for (const r of el.querySelectorAll<HTMLElement>('[data-panels]')) {
    const on = r.dataset.panels === level;
    r.setAttribute('aria-checked', String(on));
    r.tabIndex = on ? 0 : -1;
    if (locked && !on) r.setAttribute('aria-disabled', 'true');
    else r.removeAttribute('aria-disabled');
  }
  const note = el.querySelector<HTMLElement>('[data-panels-note]');
  if (note) {
    // Only a reason the page chose for you is said; your own choice needs no sentence.
    note.textContent = why === 'choice' ? '' : PANELS_NOTE[why];
    note.hidden = !note.textContent;
  }
  const motion = el.querySelector<HTMLElement>('[data-motion]');
  if (motion) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    motion.textContent = reduced ? 'Reduced (system)' : 'Full (system)';
    motion.dataset.tip = `Follows your device’s Reduce motion setting${reduced ? ': panels fade instead of moving' : ''}.`;
  }
}
