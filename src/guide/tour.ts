/**
 * The tours (GDE-1 to GDE-3, GDE-7): the 3-minute tour on real pictures of Barnard's Star
 * (8 steps) and "Tour the numbers" (3 steps through Measure). Owner: lane H.
 *
 * Each step has one idea and one action the user does. The page is dimmed, the one control the
 * step names is ringed and followed as it moves (ring.ts), and the step card sits beside it
 * without covering it, or the hover card of a term (O-G1). The dimmer never catches the pointer,
 * and in the find step the bar stays undimmed too (O-G3). Focus goes to the card, so Enter
 * never skips a step by accident (O-G8). Progress is kept in `sima-guide` for "resume after
 * reload"; End tour is final (O-G9).
 */
import { S } from '../viewer/state.ts';
import { pause } from '../viewer/playback.ts';
import { detail } from '../viewer/detail.ts';
import { camera } from '../sky/sky.ts';
import { icon } from '../shell/icons.ts';
import {
  nextHint,
  nextHintLabel,
  onFound,
  openTarget,
  revealTarget,
  setLevel,
  taskDone,
} from '../explore/game.ts';
import { findAny, ring, sync } from './ring.ts';
import { placeBeside, type Box } from './place.ts';
import { readStore, saveStore, type TourId } from './store.ts';

/** What a step remembers from the moment it began, to tell what the user did since. */
interface Base {
  epoch: number;
  lam: number;
  det: number;
  fov: number;
}

interface Step {
  title: string;
  body: string;
  /** The one thing to do, as an order ("Press Play."). */
  action: string;
  /** The parts to ring, by `data-guide` name: the first one on screen is ringed. */
  ring: readonly string[];
  /** More parts left undimmed (the find step keeps the bar live: O-G3). */
  holes?: readonly string[];
  /** Readies the page for the step. */
  enter?(): void;
  /** True once the user has done the action. */
  done(base: Base): boolean;
  /** What Skip step does besides moving on (O-G6: skipping "Press Measure" opens Measure). */
  skip?(): void;
  /** The find step: the card offers the hints. */
  find?: boolean;
}

/** Which patch a tour runs on, and what it needs before step one. */
interface Tour {
  id: TourId;
  name: string;
  steps: readonly Step[];
  /** Readies the patch: true once ready (it may be called again while loading). */
  ready(): boolean;
  /** Runs once the patch is ready, before the first step shown. */
  start?(): void;
}

const BARNARD = 'barnard';

const onBarnard = (): boolean => {
  if (S.target !== BARNARD || S.source === 'loading') {
    if (S.target !== BARNARD) openTarget(BARNARD);
    return false;
  }
  return S.source === 'real' && S.groups.length > 1;
};

const MAIN: Tour = {
  id: 'main',
  name: 'The 3-minute tour',
  ready: onBarnard,
  start: () => {
    setLevel('explore');
    S.mode = 'flip';
  },
  steps: [
    {
      title: 'Real pictures, months apart',
      body: 'This frame shows a small patch of sky around Barnard’s Star, photographed by NASA’s SPHEREx telescope on different dates. We paused the pictures for you.',
      action: 'Press Play to flip through the dates.',
      ring: ['play'],
      enter: () => pause(),
      done: () => S.playing,
    },
    {
      title: 'Taken on different dates',
      body: 'SPHEREx comes back to this patch about every six months. Each letter on the date scale is one visit: A first, then B, then C.',
      action: 'Press a letter on the date scale.',
      ring: ['dates'],
      enter: () => pause(),
      done: (b) => S.epoch !== b.epoch,
    },
    {
      title: 'Two dates in one picture',
      body: 'Red is the earlier date and cyan the later one. A star that stayed put has both colours on top of each other, so it looks white.',
      action: 'Press Two dates.',
      ring: ['view-two'],
      enter: () => {
        if (S.mode === 'two') S.mode = 'flip';
      },
      done: () => S.mode === 'two',
    },
    {
      title: 'Only what changed',
      body: 'Difference takes away what every date shares. White is where something is on this date; dark is where it usually sits.',
      action: 'Press Difference.',
      ring: ['view-diff'],
      enter: () => {
        if (S.mode === 'diff') S.mode = 'flip';
      },
      done: () => S.mode === 'diff',
    },
    {
      title: 'Find the runaway',
      body: 'One star moves so fast that it shifts between visits: a white dot beside a dark one. Play, the arrows and the date scale still work.',
      action: 'Tap the star that moves.',
      ring: ['picture'],
      holes: ['bar'],
      find: true,
      done: () => taskDone(),
      skip: () => revealTarget(),
    },
    {
      title: 'The numbers behind it',
      body: 'Measure shows what was measured from these pixels: how fast the star moves, and whether that matches the star catalogues.',
      action: 'Press Measure.',
      ring: ['measure'],
      done: () => S.level === 'measure',
      skip: () => {
        setLevel('measure');
        detail({ kind: 'target' });
      },
    },
    {
      title: 'Many infrared colours',
      body: 'SPHEREx sees 102 colours of infrared light, all too red for our eyes. The wavelength scale picks one, for the frame and the sky map.',
      action: 'Drag the handle on the wavelength scale.',
      ring: ['wavelength'],
      done: (b) => Math.abs(S.lam - b.lam) > 0.02 || S.det !== b.det,
    },
    {
      title: 'The whole sky is yours',
      body: 'The frame looks at one patch of a map of the whole sky. Zoom out to see famous places as dots, or search for any star by name.',
      action: 'Press zoom out, on the left.',
      ring: ['zoom-out'],
      done: (b) => camera().fov > b.fov * 1.2,
    },
  ],
};

const NUMBERS: Tour = {
  id: 'numbers',
  name: 'Tour the numbers',
  ready: onBarnard,
  start: () => {
    setLevel('measure');
    detail({ kind: 'target' });
  },
  steps: [
    {
      title: 'One number, from the pixels',
      body: 'Measure opens with one number measured from these pictures, and a label that says whether it matches the star catalogues.',
      action: 'Point at a word with a dotted line to read what it means.',
      ring: ['headline', 'measure-panel'],
      done: () =>
        !!document.getElementById('tooltip')?.matches(':popover-open') &&
        !!document.querySelector('#measure .term:hover, #measure .term:focus'),
    },
    {
      title: 'All the numbers',
      body: 'Behind the one number are charts, the statistics and every exposure. Each word with a dotted line explains itself.',
      action: 'Turn on “Show all the numbers”.',
      ring: ['all-numbers'],
      enter: () => {
        if (S.allNumbers) S.allNumbers = false;
      },
      done: () => S.allNumbers,
      skip: () => (S.allNumbers = true),
    },
    {
      title: 'Six detectors',
      body: 'SPHEREx has six detectors, each for one band of infrared colours. The same patch looks different in each.',
      action: 'Pick another detector.',
      ring: ['detectors', 'wavelength'],
      done: (b) => S.det !== b.det,
    },
  ],
};

const TOURS: Record<TourId, Tour> = { main: MAIN, numbers: NUMBERS };

// ----- Running a tour ----------------------------------------------------------------------------

let tour: Tour | null = null;
let at = 0;
let base: Base = { epoch: 0, lam: 0, det: 0, fov: 0 };
let state: 'loading' | 'step' | 'done' | 'finished' = 'step';
let poll = 0;
let advance = 0;
let target: DOMRect | null = null;
let hint = '';
const endFns = new Set<(how: 'ended' | 'finished') => void>();

/** True while a tour is on screen. */
export function touring(): boolean {
  return tour !== null;
}

/** Hears when a tour ends, by End tour or by finishing it. */
export function onTourEnd(fn: (how: 'ended' | 'finished') => void): () => void {
  endFns.add(fn);
  return () => endFns.delete(fn);
}

/** The tour in progress from an earlier visit, to offer "Pick up the tour?"; null if none. */
export function savedTour(): { id: TourId; step: number; of: number; title: string } | null {
  const s = readStore().tour;
  if (!s) return null;
  const t = TOURS[s.id];
  const step = t.steps[s.step];
  return step ? { id: s.id, step: s.step, of: t.steps.length, title: step.title } : null;
}

/**
 * Starts a tour at a step (0 for the start; "replay from Guide").
 */
export function startTour(id: TourId, step = 0): void {
  stopPoll();
  tour = TOURS[id];
  at = Math.max(0, Math.min(step, tour.steps.length - 1));
  hint = '';
  saveStore((s) => {
    s.tour = { id, step: at };
    s.ended = s.ended.filter((e) => e !== id);
  });
  state = 'loading';
  render();
  poll = window.setInterval(tick, 150);
  tick();
}

/** Ends the tour on screen. `final`: End tour, never offered again by itself (O-G9). */
export function endTour(final = true): void {
  if (!tour) return;
  const id = tour.id;
  stop();
  saveStore((s) => {
    s.tour = null;
    if (final && !s.ended.includes(id)) s.ended.push(id);
  });
  for (const fn of endFns) fn('ended');
}

/** Forgets a tour in progress from an earlier visit without starting it ("No, thanks"). */
export function dropSavedTour(): void {
  const s = readStore().tour;
  if (!s) return;
  saveStore((st) => {
    st.tour = null;
    if (!st.ended.includes(s.id)) st.ended.push(s.id);
  });
}

function stop(): void {
  stopPoll();
  clearTimeout(advance);
  tour = null;
  ring(null);
  const card = cardEl();
  if (card) card.hidden = true;
  sync();
}

function stopPoll(): void {
  clearInterval(poll);
  poll = 0;
}

function enter(i: number): void {
  if (!tour) return;
  clearTimeout(advance);
  at = i;
  hint = '';
  const step = tour.steps[at];
  if (!step) return finish();
  saveStore((s) => (s.tour = { id: tour!.id, step: at }));
  step.enter?.();
  base = { epoch: S.epoch, lam: S.lam, det: S.det, fov: camera().fov };
  state = 'step';
  render();
  focusCard();
}

function tick(): void {
  if (!tour) return;
  if (state === 'loading') {
    if (!tour.ready()) return;
    tour.start?.();
    enter(at);
    return;
  }
  if (state !== 'step') return;
  const step = tour.steps[at];
  if (step?.done(base)) {
    state = 'done';
    render();
    advance = window.setTimeout(() => enter(at + 1), step.find ? 2600 : 900);
  }
}

function finish(): void {
  if (!tour) return;
  const id = tour.id;
  state = 'finished';
  ring(null);
  saveStore((s) => {
    s.tour = null;
    if (!s.finished.includes(id)) s.finished.push(id);
  });
  render();
  focusCard();
}

function closeFinished(): void {
  stop();
  for (const fn of endFns) fn('finished');
}

// ----- The card ----------------------------------------------------------------------------------

function cardEl(): HTMLElement | null {
  const tourEl = document.getElementById('tour');
  if (!tourEl) return null;
  let card = tourEl.querySelector<HTMLElement>('.tour-card');
  if (!card) {
    card = document.createElement('section');
    card.className = 'tour-card card panel';
    card.tabIndex = -1;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-labelledby', 'tour-title');
    card.hidden = true;
    tourEl.append(card);
    card.addEventListener('keydown', (e) => {
      // Enter on the card itself does nothing: only a focused button acts (O-G8).
      if (e.key === 'Enter' && e.target === card) e.preventDefault();
    });
    watchTooltip();
  }
  return card;
}

function focusCard(): void {
  requestAnimationFrame(() => cardEl()?.focus({ preventScroll: true }));
}

function render(): void {
  const card = cardEl();
  if (!card || !tour) return;
  card.hidden = false;
  const n = tour.steps.length;
  if (state === 'loading') {
    card.innerHTML = `<p class="tour-count">${esc(tour.name)}</p>
      <h2 class="tour-title" id="tour-title">Getting the pictures ready…</h2>
      <p class="tour-body">Loading the real pictures of Barnard’s Star.</p>
      <div class="tour-foot"><button class="btn text" data-end>End tour</button></div>`;
    ring(null);
    card.querySelector('[data-end]')?.addEventListener('click', () => endTour());
    centre(card);
    sync();
    return;
  }
  if (state === 'finished') {
    card.innerHTML = `<p class="tour-count">${esc(tour.name)} · done</p>
      <h2 class="tour-title" id="tour-title">${tour.id === 'main' ? 'That is the tour' : 'That is Measure'}</h2>
      <p class="tour-body">${
        tour.id === 'main'
          ? 'You can take it again, or tour the numbers, from Guide at the top right.'
          : 'Every number in Measure explains itself. Tour it again from Guide at the top right.'
      }</p>
      <div class="tour-foot"><button class="btn primary" data-close-tour>Done</button></div>`;
    card.querySelector('[data-close-tour]')?.addEventListener('click', closeFinished);
    centre(card);
    sync();
    return;
  }
  const step = tour.steps[at];
  if (!step) return;
  const done = state === 'done';
  const label = step.find ? nextHintLabel() : null;
  card.innerHTML = `
    <div class="tour-progress" aria-hidden="true">${tour.steps
      .map((_, i) => `<span class="${i < at ? 'past' : i === at ? 'now' : ''}"></span>`)
      .join('')}</div>
    <p class="tour-count">Step ${at + 1} of ${n}</p>
    <h2 class="tour-title" id="tour-title"></h2>
    <p class="tour-body" data-body></p>
    <p class="tour-action${done ? ' done' : ''}" data-guide="tour-action"><span class="tour-check" aria-hidden="true">${done ? icon('check') : ''}</span><span data-action></span></p>
    <p class="tour-hint" data-hint-text ${hint ? '' : 'hidden'}></p>
    <div class="tour-foot">
      <button class="btn text" data-end>End tour</button>
      <span class="tour-gap"></span>
      ${label && !done ? `<button class="btn text" data-hint>${icon('bulb')}${label}</button>` : ''}
      <button class="btn quiet" data-back ${at === 0 ? 'disabled' : ''}>Back</button>
      <button class="btn" data-skip ${done ? 'disabled' : ''}>Skip step</button>
    </div>`;
  card.querySelector('#tour-title')!.textContent = step.title;
  card.querySelector('[data-body]')!.textContent = step.body;
  card.querySelector('[data-action]')!.textContent = done ? 'Done.' : step.action;
  card.querySelector('[data-hint-text]')!.textContent = hint;
  card.querySelector('[data-end]')?.addEventListener('click', () => endTour());
  card.querySelector('[data-back]')?.addEventListener('click', () => enter(Math.max(0, at - 1)));
  card.querySelector('[data-skip]')?.addEventListener('click', () => {
    step.skip?.();
    enter(at + 1);
  });
  card.querySelector('[data-hint]')?.addEventListener('click', () => {
    hint = nextHint();
    render();
    card.querySelector<HTMLElement>('[data-hint]')?.focus();
  });
  if (!done) {
    ring({ guide: step.ring.join(',') }, { dim: true, holes: step.holes, onBox: (b) => placed(b) });
  }
  place(true);
}

/** The ringed part moved: keep the card beside it. */
function placed(box: DOMRect | null): void {
  const moved =
    !target ||
    !box ||
    Math.abs(box.left - target.left) > 3 ||
    Math.abs(box.top - target.top) > 3 ||
    Math.abs(box.width - target.width) > 3 ||
    Math.abs(box.height - target.height) > 3;
  target = box;
  if (moved) place(true);
}

/**
 * Puts the card beside the ringed part, off every other card if it can, and never over the
 * part itself or an open hover card (O-G1).
 */
function place(force = false): void {
  const card = cardEl();
  if (!card || card.hidden) return;
  const r = card.getBoundingClientRect();
  const avoid: Box[] = [...document.querySelectorAll<HTMLElement>('[data-card]')]
    .filter((el) => el.checkVisibility() && !el.closest('#top-left'))
    .map((el) => el.getBoundingClientRect());
  for (const el of document.querySelectorAll<HTMLElement>('#top-left > *')) {
    if (el.checkVisibility()) avoid.push(el.getBoundingClientRect());
  }
  const tip = tooltipBox();
  if (tip) avoid.push(tip, tip, tip, tip); // weigh it heavily: never cover a hover card
  if (!target) return centre(card);
  const spot = placeBeside(
    target,
    holderBox(),
    { width: r.width, height: r.height },
    { width: innerWidth, height: innerHeight },
    avoid,
    { gap: 16, margin: 12, force: true },
  );
  if (!spot) return centre(card);
  if (!force && Math.abs(spot.box.left - r.left) < 2 && Math.abs(spot.box.top - r.top) < 2) return;
  card.style.left = `${Math.round(spot.box.left)}px`;
  card.style.top = `${Math.round(spot.box.top)}px`;
}

/** The card that holds the ringed part, if any. */
function holderBox(): DOMRect | null {
  const step = tour?.steps[at];
  const el = step ? findAny(step.ring.join(','))?.closest<HTMLElement>('[data-card]') : null;
  return el ? el.getBoundingClientRect() : null;
}

function centre(card: HTMLElement): void {
  const r = card.getBoundingClientRect();
  card.style.left = `${Math.round((innerWidth - r.width) / 2)}px`;
  card.style.top = `${Math.round((innerHeight - r.height) / 2)}px`;
}

function tooltipBox(): DOMRect | null {
  const tip = document.getElementById('tooltip');
  return tip?.matches(':popover-open') ? tip.getBoundingClientRect() : null;
}

/** A hover card that opens over the step card moves the step card away (O-G1). */
function watchTooltip(): void {
  const tip = document.getElementById('tooltip');
  tip?.addEventListener('toggle', () => {
    if (!tour) return;
    const t = tooltipBox();
    const card = cardEl();
    if (!t || !card) return;
    const c = card.getBoundingClientRect();
    const over = t.left < c.right && c.left < t.right && t.top < c.bottom && c.top < t.bottom;
    if (over) place(true);
  });
}

/** The find step gives the found result a moment, then moves on (see `tick`). */
onFound(() => {
  if (tour && state === 'step') tick();
});

addEventListener('resize', () => {
  if (tour) place(true);
});

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
