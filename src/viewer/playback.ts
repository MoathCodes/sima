/**
 * Playing the flip-book: Play, Pause, step and jump (BAR-1, BAR-3, FRM-8). Owner: lane D.
 * Others (the keys, the tour, Measure) call these rather than writing `S.epoch` or
 * `S.playing` themselves.
 *
 * Pictures swap with hard cuts, never faster than 2.5 a second (FRM-8): 600 ms at 1×, 400 ms at
 * 1.5×, 1000 ms at 0.6×.
 *
 * PHASE 0 STUB: works as specified, but does not skip pictures that are still loading.
 */
import { S } from './state.ts';
import { draw } from './render.ts';
import { emit } from '../shell/bus.ts';

let timer = 0;
let direction = 1;

/** Starts playing from the picture on screen. Does nothing with fewer than two pictures. */
export function play(): void {
  if (S.groups.length < 2) return;
  S.playing = true;
  clearInterval(timer);
  timer = window.setInterval(tick, Math.max(400, 600 / S.speed));
}

/** Stops on the picture on screen. */
export function pause(): void {
  S.playing = false;
  clearInterval(timer);
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
  emit('shown', { lam: S.color ? null : S.lam, mjd: g ? g.mjd : null, det: S.det });
  draw();
}

function tick(): void {
  const count = S.groups.length;
  if (count < 2) return pause();
  let next = S.epoch + direction;
  if (S.loop === 'bounce' && (next >= count || next < 0)) {
    direction = -direction;
    next = S.epoch + direction;
  } else if (S.loop === 'forward') {
    direction = 1;
    next = (S.epoch + 1) % count;
  }
  setEpoch(next);
}
