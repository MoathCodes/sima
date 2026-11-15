/**
 * The guide: the welcome card, the Guide menu, the tours (GDE-1 to GDE-3, GDE-7), "Explain the
 * screen" (GDE-6), one-time tips (GDE-8) and "What changes look like". Owner: lane H.
 *
 * It may read any part of the page, but only through the functions in SPEC 8.4, and it finds
 * the parts it points at by their `data-guide` names (docs/lanes.md).
 */
import { openStarter, openTarget, STARTERS, type StarterId } from '../explore/game.ts';
import { greet } from '../shell/shell.ts';
import { S } from '../viewer/state.ts';
import { icon } from '../shell/icons.ts';
import { dropSavedTour, endTour, onTourEnd, savedTour, startTour, touring } from './tour.ts';
import { startTips, tourHomeTip } from './tips.ts';
import { explainScreen } from './explain.ts';
import { onTried, startTried, THINGS } from './tried.ts';
import { readStore } from './store.ts';

const FIRST = ['runaway', 'made-of', 'ghost'] as const;

/** "What changes look like": what each kind of change looks like in the frame. */
const CHANGES: readonly { name: string; text: string; target: string | null }[] = [
  {
    name: 'A star that moves',
    text: 'A dot that jumps between dates. In Difference: a white dot beside a dark one.',
    target: 'barnard',
  },
  {
    name: 'A star that changes brightness',
    text: 'It stays put but grows and fades. In Two dates it looks red or cyan, not white.',
    target: 'r-dra',
  },
  {
    name: 'Too faint for one picture',
    text: 'Nothing shows until the dates are stacked along its path, in Measure.',
    target: 'wise-0855',
  },
  {
    name: 'Not a real change',
    text: 'A sharp speck in one picture only is usually a particle hit, flagged in the data. Every find is a candidate to check, not a discovery.',
    target: null,
  },
];

/** Fills the welcome card and the Guide menu, then greets. Called once by main.ts. */
export function startGuide(): void {
  fillWelcome();
  fillMenu();
  startTips();
  startTried();
  onTried(fillMenu);
  onTourEnd((how) => {
    tourHomeTip();
    if (how === 'ended') fillWelcome();
  });
  // The welcome card greets a visitor in Explore. Someone who comes back to Measure (the level
  // is remembered, or a link asks for it) is not greeted: the card would sit over their work and
  // take the first Escape meant for Measure. The link is read after this, so wait one task.
  queueMicrotask(() => {
    if (S.level === 'explore') greet();
  });
}

function fillWelcome(): void {
  const welcome = document.getElementById('welcome');
  if (!welcome) return;
  welcome.classList.add('welcome');
  const saved = savedTour();
  welcome.innerHTML = `
    <div class="welcome-head">
      <h2 class="welcome-title">Watch the sky change</h2>
      <button class="icon-btn sm" data-close aria-label="Close" data-tip="Close">${icon('close')}</button>
    </div>
    <p class="welcome-line">These are real pictures from NASA’s SPHEREx telescope, taken months apart. Play them and see what moves.</p>
    ${
      saved
        ? `<div class="welcome-resume">
        <p><b>Pick up the tour?</b> <span data-resume-where></span></p>
        <div class="welcome-resume-row">
          <button class="btn primary" data-resume data-guide="tour-resume">Pick up the tour</button>
          <button class="btn text" data-drop data-guide="tour-drop">End tour</button>
        </div>
      </div>`
        : ''
    }
    <div class="welcome-starters">
      ${FIRST.map((id, i) => {
        const s = STARTERS[id];
        const tour = id === 'runaway' ? '<span class="welcome-pill">Guided tour, 3 min</span>' : '';
        return `<button class="btn starter${i === 0 && !saved ? ' primary' : ''}" data-starter="${id}" data-guide="starter-${id}">
          <span class="starter-text"><span class="starter-title">${s.title}${tour}</span><span class="starter-line">${s.line}</span></span>${icon('arrow-right')}</button>`;
      }).join('')}
    </div>
    <button class="link welcome-own" data-close data-guide="welcome-own">Or explore the sky on my own</button>`;
  const where = welcome.querySelector('[data-resume-where]');
  if (where && saved) where.textContent = `You stopped at step ${saved.step + 1} of ${saved.of}: ${saved.title}.`;
  welcome
    .querySelectorAll<HTMLElement>('[data-close]')
    .forEach((b) => b.addEventListener('click', () => (welcome.hidden = true)));
  welcome.querySelectorAll<HTMLElement>('[data-starter]').forEach((b) =>
    b.addEventListener('click', () => {
      welcome.hidden = true;
      const id = b.dataset.starter as StarterId;
      // The first starting point is the tour (its pill says so); the others open their task.
      if (id === 'runaway') startTour('main');
      else openStarter(id);
    }),
  );
  welcome.querySelector('[data-resume]')?.addEventListener('click', () => {
    welcome.hidden = true;
    if (saved) startTour(saved.id, saved.step);
  });
  welcome.querySelector('[data-drop]')?.addEventListener('click', () => {
    dropSavedTour();
    fillWelcome();
  });
}

function fillMenu(): void {
  const menu = document.getElementById('guide-menu');
  if (!menu) return;
  menu.classList.add('guide-menu');
  const tried = readStore().tried;
  const open = menu.querySelector('details')?.open ?? false;
  menu.innerHTML = `
    <div class="guide-scroll" data-scroll>
      <p class="guide-head">Guide</p>
      <button class="menu-item guide-item primary" data-tour="main" data-guide="guide-tour">${icon('play')}<span>Take the 3-minute tour</span></button>
      <button class="menu-item guide-item" data-tour="numbers" data-guide="guide-numbers">${icon('chart')}<span><span>Tour the numbers</span><span class="line">3 steps through Measure: what each number means</span></span></button>
      <button class="menu-item guide-item" data-explain data-guide="guide-explain">${icon('info')}<span><span>Explain the screen</span><span class="line">Point at anything to see what it is</span></span></button>
      <details class="guide-changes" ${open ? 'open' : ''}>
        <summary class="menu-item guide-item" data-guide="guide-changes">What changes look like</summary>
        <ul class="guide-change-list">${CHANGES.map(
          (c, i) => `<li><p class="guide-change-name">${c.name}</p><p class="guide-change-text">${c.text}</p>${
            c.target ? `<button class="link" data-change="${i}">Show me</button>` : ''
          }</li>`,
        ).join('')}</ul>
      </details>
      <div class="guide-try-head"><p class="group-label">Things to try</p><p class="guide-count">${
        THINGS.filter((t) => tried.includes(t.id)).length
      } of ${THINGS.length}</p></div>
      <ul class="guide-try">${THINGS.map((t, i) => {
        const done = tried.includes(t.id);
        return `<li class="${done ? 'done' : ''}"><span class="guide-tick" aria-hidden="true">${done ? icon('check') : ''}</span><span class="guide-try-text">${t.text}${done ? '<span class="sr-only"> (done)</span>' : ''}</span>${
          done ? '' : `<button class="link" data-try="${i}" data-guide="try-${t.id}">Show me</button>`
        }</li>`;
      }).join('')}</ul>
    </div>`;
  const close = () => {
    if (menu.matches(':popover-open')) menu.hidePopover();
  };
  menu.querySelectorAll<HTMLElement>('[data-tour]').forEach((b) =>
    b.addEventListener('click', () => {
      close();
      if (touring()) endTour(false);
      startTour(b.dataset.tour as 'main' | 'numbers');
    }),
  );
  menu.querySelector('[data-explain]')?.addEventListener('click', () => {
    close();
    explainScreen();
  });
  menu.querySelectorAll<HTMLElement>('[data-change]').forEach((b) =>
    b.addEventListener('click', () => {
      close();
      const c = CHANGES[Number(b.dataset.change)];
      if (c?.target) openTarget(c.target);
    }),
  );
  menu.querySelectorAll<HTMLElement>('[data-try]').forEach((b) =>
    b.addEventListener('click', () => {
      close();
      THINGS[Number(b.dataset.try)]?.show();
    }),
  );
}
