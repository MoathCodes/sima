/**
 * The guide: the welcome card, the Guide menu, the tours (GDE-1 to GDE-3, GDE-7), "Explain the
 * screen" (GDE-6), one-time tips (GDE-8) and the explanations in place. Owner: lane H.
 *
 * It may read any part of the page, but only through the functions in SPEC 8.4, and it finds
 * the parts it points at by their `data-guide` names (docs/lanes.md).
 *
 * PHASE 0 STUB: the welcome card and the Guide menu are filled; their items start nothing yet
 * except the starters.
 */
import { openStarter, STARTERS, type StarterId } from '../explore/game.ts';
import { greet } from '../shell/shell.ts';
import { icon } from '../shell/icons.ts';

const FIRST: readonly StarterId[] = ['runaway', 'made-of', 'too-faint'];

/** Fills the welcome card and the Guide menu, then greets. Called once by main.ts. */
export function startGuide(): void {
  const welcome = document.getElementById('welcome');
  if (welcome) {
    welcome.style.cssText = 'display:grid;gap:10px;padding:18px';
    welcome.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <h2 style="flex:1;margin:0;font:var(--text-headline);letter-spacing:var(--tracking-headline)">Watch the sky change</h2>
        <button class="icon-btn sm" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <p style="margin:0;color:var(--ink-2)">Play pictures of one spot taken months apart and see what moves.</p>
      ${FIRST.map((id, i) => {
        const s = STARTERS[id];
        return `<button class="btn ${i === 0 ? 'primary' : ''}" data-starter="${id}"
          style="height:auto;justify-content:space-between;padding:10px 12px;text-align:left">
          <span><b>${s.title}</b><br><span style="font:var(--text-label)">${s.line}</span></span>${icon('arrow-right')}</button>`;
      }).join('')}
      <button class="link" data-close style="justify-self:start;border:0;background:none;padding:0">Or explore the sky on my own</button>`;
    welcome
      .querySelectorAll<HTMLElement>('[data-close]')
      .forEach((b) => b.addEventListener('click', () => (welcome.hidden = true)));
    welcome.querySelectorAll<HTMLElement>('[data-starter]').forEach((b) =>
      b.addEventListener('click', () => {
        welcome.hidden = true;
        openStarter(b.dataset.starter as StarterId);
      }),
    );
  }

  const menu = document.getElementById('guide-menu');
  if (menu) {
    menu.innerHTML = [
      'Take the 3-minute tour',
      'Tour the numbers',
      'Explain the screen',
      'What changes look like',
    ]
      .map((t) => `<button class="menu-item" data-tip="Not built yet (phase 0)">${t}</button>`)
      .join('');
  }
  greet();
}
