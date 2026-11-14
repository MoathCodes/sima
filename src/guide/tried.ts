/**
 * "Things to try" in the Guide menu: eight things, each ticked once the user has done it (kept
 * in `sima-guide`), each with "Show me" (SPEC 4.9). Owner: lane H.
 */
import { S, watch } from '../viewer/state.ts';
import { on } from '../shell/bus.ts';
import { TASKS } from '../explore/copy.ts';
import { onFound, openTarget } from '../explore/game.ts';
import { ring } from './ring.ts';
import { readStore, saveStore } from './store.ts';

export interface Thing {
  id: string;
  text: string;
  /** Points at the control, opening the right patch first when it needs one. */
  show(): void;
}

let stopTimer = 0;

/** Rings a part until the user presses anything, or for six seconds. */
export function pointFor(name: string): void {
  ring({ guide: name });
  clearTimeout(stopTimer);
  const stop = () => {
    clearTimeout(stopTimer);
    ring(null);
    document.removeEventListener('pointerdown', stop, true);
  };
  stopTimer = window.setTimeout(stop, 6000);
  // After this click (the "Show me" press itself) has finished.
  setTimeout(() => document.addEventListener('pointerdown', stop, true), 0);
}

/** Opens a patch and rings its picture once it is on screen. */
function openAndPoint(key: string): void {
  openTarget(key);
  const t0 = performance.now();
  const wait = () => {
    if (S.target === key && S.field && S.source !== 'loading') pointFor('picture');
    else if (performance.now() - t0 < 15000) setTimeout(wait, 200);
  };
  wait();
}

export const THINGS: readonly Thing[] = [
  { id: 'moves', text: 'Find something that moves', show: () => openAndPoint('barnard') },
  { id: 'two', text: 'Put two dates in one picture', show: () => pointFor('view-two') },
  { id: 'diff', text: 'Show only what changed', show: () => pointFor('view-diff') },
  { id: 'colour', text: 'Look in another infrared colour', show: () => pointFor('wavelength') },
  { id: 'brightness', text: 'Catch a star that changes brightness', show: () => openAndPoint('r-dra') },
  { id: 'numbers', text: 'See the numbers behind a find', show: () => pointFor('measure') },
  { id: 'travel', text: 'Travel to any star', show: () => pointFor('search') },
  { id: 'share', text: 'Share what you see', show: () => pointFor('share-button') },
];

const changeFns = new Set<() => void>();

/** Hears when something is ticked. */
export function onTried(fn: () => void): void {
  changeFns.add(fn);
}

function tick(id: string): void {
  if (readStore().tried.includes(id)) return;
  saveStore((s) => s.tried.push(id));
  for (const fn of changeFns) fn();
}

/** Starts noticing what the user does. Called once by guide/index.ts. */
export function startTried(): void {
  // What the page sets while it starts (a link's view or detector) is not the user's doing.
  let ready = false;
  setTimeout(() => (ready = true), 2500);
  watch(['mode'], () => {
    if (!ready) return;
    if (S.mode === 'two') tick('two');
    if (S.mode === 'diff') tick('diff');
  });
  watch(['det'], () => ready && tick('colour'));
  watch(['level'], () => ready && S.level === 'measure' && tick('numbers'));
  onFound((key) => {
    const kind = TASKS[key]?.kind;
    if (kind === 'mover' || kind === 'spectrum') tick('moves');
    if (kind === 'variable') tick('brightness');
  });
  on('aim', (m) => ready && !m.target && tick('travel'));
  const share = document.getElementById('share');
  if (share) {
    new MutationObserver(() => share.hasAttribute('open') && tick('share')).observe(share, {
      attributes: true,
      attributeFilter: ['open'],
    });
  }
}
