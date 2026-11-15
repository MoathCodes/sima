/**
 * Settings (v2.0, BEGINNER-AND-MOBILE.md section 5.7). Owner: lane F.
 *
 * In `#settings`: Panels (Glass or Solid, and why the page chose Solid when it did), the motion
 * line (read-only: motion follows the system), Reset my progress (asks first; clears only
 * `sima-missions` through progress.ts), and "Your progress is kept in this browser only."
 *
 * On a desktop it is a Raised card under the Settings button (top right), closed by Escape
 * (order 30), the close button, the button again or a click outside. Under 700 px wide it is a
 * full-height Slate page with Back (section 11.2): modal, so the page behind is inert.
 */
import { icon } from './icons.ts';
import {
  glassLevel,
  glassReason,
  onGlass,
  panelsChoice,
  setPanels,
  tryGlassAgain,
  type GlassLevel,
  type GlassReason,
} from './glass.ts';
import { resetProgress } from '../explore/progress.ts';

/** True under 700 px: Settings is a full-height page. */
const phone = () => matchMedia('(max-width: 699px)').matches;

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
      <button type="button" class="btn quiet st-back" data-back data-guide="settings-back">${icon('back')}Back</button>
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
      <button type="button" class="btn st-try" data-try-glass data-guide="panels-try-glass" hidden>Try glass again</button>
    </section>
    <section class="st-group" aria-labelledby="st-motion">
      <h3 class="group-label" id="st-motion">Motion</h3>
      <p class="st-note" data-motion></p>
    </section>
    <section class="st-group" aria-labelledby="st-progress">
      <h3 class="group-label" id="st-progress">Your progress</h3>
      <p class="st-note">Your progress is kept in this browser only.</p>
      <button type="button" class="btn st-reset" data-reset data-guide="settings-reset">Reset my progress</button>
      <div class="st-confirm" data-confirm role="group" aria-labelledby="st-confirm-q" hidden>
        <p id="st-confirm-q" class="st-q">Reset your missions? The steps you did and the skills you learned are cleared. Nothing else changes.</p>
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
  q('[data-try-glass]').addEventListener('click', () => {
    tryGlassAgain();
    q<HTMLElement>(`[data-panels="${glassLevel()}"]`).focus();
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
    done.textContent = 'Your progress is reset. Every mission starts fresh.';
  });

  q('[data-close]').addEventListener('click', () => closeSettings());
  q('[data-back]').addEventListener('click', () => closeSettings());
  // A click outside closes the card on a desktop (as a popover does); the button toggles.
  document.addEventListener('pointerdown', (e) => {
    if (el.hidden || phone()) return;
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
  for (const mq of ['(prefers-reduced-motion: reduce)', '(max-width: 699px)']) {
    matchMedia(mq).addEventListener('change', () => {
      fill(el);
      if (!el.hidden) place(el);
    });
  }
  addEventListener('resize', () => {
    if (!el.hidden) place(el);
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
  place(el);
  setExpanded(true);
  el.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
}

/**
 * Closes Settings.
 * @param refocus Return focus to the control that opened it (default true).
 */
export function closeSettings(refocus = true): void {
  const el = box();
  if (!el || el.hidden) return;
  el.hidden = true;
  setInert(false);
  setExpanded(false);
  const confirm = el.querySelector<HTMLElement>('[data-confirm]');
  if (confirm) confirm.hidden = true;
  const reset = el.querySelector<HTMLElement>('[data-reset]');
  if (reset) reset.hidden = false;
  if (refocus) opener?.focus();
  opener = null;
}

function setExpanded(on: boolean): void {
  for (const b of document.querySelectorAll('[data-open="settings"]')) {
    b.setAttribute('aria-expanded', String(on));
  }
}

/** Desktop: under the Settings button, right-aligned with the top row. Phone: the whole page. */
function place(el: HTMLElement): void {
  if (phone()) {
    el.style.top = el.style.right = '';
    el.setAttribute('aria-modal', 'true');
    setInert(true);
    return;
  }
  el.removeAttribute('aria-modal');
  setInert(false);
  const row = [document.getElementById('actions'), document.getElementById('view-switch')]
    .filter((e): e is HTMLElement => !!e && e.checkVisibility())
    .map((e) => e.getBoundingClientRect());
  const bottom = Math.max(0, ...row.map((r) => r.bottom));
  const right = Math.max(0, ...row.map((r) => r.right));
  el.style.top = `${Math.round(bottom + 6)}px`;
  el.style.right = `${Math.round(innerWidth - (right || innerWidth - 16))}px`;
}

/** On phones Settings is modal: everything else is inert while it is open (11.2). */
function setInert(on: boolean): void {
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement) || ['settings', 'toasts', 'tooltip'].includes(child.id)) continue;
    if (child.tagName === 'SCRIPT') continue;
    if (on) {
      if (!child.inert) {
        child.inert = true;
        child.dataset.settingsInert = '';
      }
    } else if ('settingsInert' in child.dataset) {
      child.inert = false;
      delete child.dataset.settingsInert;
    }
  }
}

const PANELS_NOTE: Record<GlassReason, string> = {
  'forced-colors': 'Panels are solid while your system uses forced colours.',
  contrast: 'Panels are solid because your system asks for more contrast.',
  choice: '',
  embed: 'Panels are solid in an embedded page.',
  unsupported: 'This browser cannot draw glass, so panels are solid.',
  'reduced-transparency': 'Panels are solid because your system asks for less transparency. Choose Glass to try it anyway.',
  phone: 'Panels start solid on phones, to keep the sky smooth. Choose Glass to try it.',
  slow: 'Panels are solid because the sky was slow with glass on.',
  software: 'Panels are solid because this browser draws the sky without a graphics card.',
  default: 'Glass lets the sky show through the panels.',
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
    note.textContent =
      why === 'choice'
        ? level === 'glass'
          ? 'Glass lets the sky show through the panels. You chose it.'
          : 'Solid panels hide the sky behind them. You chose them.'
        : PANELS_NOTE[why];
  }
  const tryAgain = el.querySelector<HTMLElement>('[data-try-glass]');
  if (tryAgain) tryAgain.hidden = !(why === 'slow' && panelsChoice() === null);
  const motion = el.querySelector<HTMLElement>('[data-motion]');
  if (motion) {
    motion.textContent = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'Follows your system: reduced. Panels fade instead of moving. To change it, turn off Reduce motion in your device’s accessibility settings.'
      : 'Follows your system: full motion. To reduce it, turn on Reduce motion in your device’s accessibility settings.';
  }
  const back = el.querySelector<HTMLElement>('[data-back]');
  if (back) back.hidden = !phone();
}
