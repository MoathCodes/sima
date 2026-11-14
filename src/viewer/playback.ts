/**
 * Playing the flip-book: Play, Pause, step and jump (BAR-1, BAR-3, FRM-8). Owner: lane D.
 * Others (the keys, the tour, Measure) call these rather than writing `S.epoch` or
 * `S.playing` themselves.
 *
 * Borrowed from weather loop viewers (SPEC 7.4): hard cuts, a forward or back-and-forth loop, a
 * short pause on the first and last picture so the eye can rest, and a speed cap. Pictures swap
 * with hard cuts, never faster than 2.5 a second (FRM-8, WCAG 2.3): 1000 ms at 0.6×, 600 ms at
 * 1×, 400 ms at 1.5×.
 */
import { S } from './state.ts';
import { draw } from './render.ts';
import { emit } from '../shell/bus.ts';

/** How long one picture stays at 1×, ms. */
export const STEP_MS = 600;
/** The fastest allowed: 2.5 pictures a second (FRM-8). */
export const MIN_STEP_MS = 400;
/** The first and last picture stay this many times longer (the pause at the ends). */
export const END_HOLD = 1.6;

let timer = 0;
let direction = 1;

/** True when the visitor asked for less motion: the frame then shows a still Two dates picture. */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** How long the picture on screen stays, ms, at the current speed. */
export function stepMs(): number {
  const base = Math.max(MIN_STEP_MS, STEP_MS / S.speed);
  const last = S.groups.length - 1;
  const atEnd = S.epoch === 0 || S.epoch === last;
  return atEnd ? base * END_HOLD : base;
}

/** Starts playing from the picture on screen. Does nothing with fewer than two pictures. */
export function play(): void {
  clearTimeout(timer);
  if (S.groups.length < 2) {
    S.playing = false;
    return;
  }
  S.playing = true;
  timer = window.setTimeout(tick, stepMs());
}

/** Stops on the picture on screen. */
export function pause(): void {
  clearTimeout(timer);
  S.playing = false;
}

/**
 * Steps through the pictures and stops playing (the bar's previous and next, the arrow keys).
 * @param n +1 for the next picture, −1 for the previous; wraps around.
 */
export function step(n: number): void {
  pause();
  const count = S.groups.length;
  if (count) setEpoch((((S.epoch + n) % count) + count) % count);
}

/**
 * Shows one picture (a click on a date stop, a link's `date`). Does not change playing.
 * @param i Index into `S.groups`; out of range is ignored.
 */
export function setEpoch(i: number): void {
  if (!Number.isInteger(i) || i < 0 || i >= S.groups.length) return;
  S.epoch = i;
  const g = S.groups[i];
  const mjd = g && Number.isFinite(g.mjd) ? g.mjd : null;
  emit('shown', { lam: S.color ? null : S.lam, mjd, det: S.det });
  draw();
}

/** Restarts the timer after a change of speed, so the new speed shows at once. */
export function retime(): void {
  if (S.playing) play();
}

function tick(): void {
  const count = S.groups.length;
  if (count < 2 || !S.playing) return pause();
  let next: number;
  if (S.loop === 'bounce') {
    next = S.epoch + direction;
    if (next >= count || next < 0) {
      direction = -direction;
      next = S.epoch + direction;
    }
  } else {
    direction = 1;
    next = (S.epoch + 1) % count;
  }
  setEpoch(next);
  timer = window.setTimeout(tick, stepMs());
}
