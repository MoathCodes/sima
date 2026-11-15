/**
 * The coach card (BEGINNER-AND-MOBILE.md sections 7 and 8, VIEW-5): the first switch to Expert
 * says where you are, once. It sits in free sky, never over the frame, Measure's numbers or the
 * control it explains (GDE-8). Escape 50. Owner: lane K.
 *
 * Remembered in `sima-discover` (`{ coached: true }`), a key of lane K's. On phones the coach is a
 * line at the top of Measure (lane DE's panel), so this card stays closed there.
 */
import { COACH } from './copy.ts';
import { esc, icon, phone } from './ui.ts';

const KEY = 'sima-discover';
const W = 340;

function coached(): boolean {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { coached?: boolean }).coached === true;
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(KEY, JSON.stringify({ ...v, coached: true }));
  } catch {
    // Blocked storage: the coach may show again on the next visit.
  }
}

let seen = false;

/** Shows the coach once per browser (and once per visit when storage is blocked). */
export function coachExpert(el: HTMLElement): void {
  if (seen || coached() || phone()) return;
  seen = true;
  remember();
  el.className = 'dsc-card dsc-coach';
  el.dataset.material = 'raised';
  el.dataset.card = 'coach';
  el.dataset.guide = 'coach';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', COACH.title);
  el.innerHTML = `
    <h2 class="dsc-h">${esc(COACH.title)}</h2>
    <p class="dsc-lead">${esc(COACH.body)}</p>
    <p class="dsc-fine">${esc(COACH.kept)} ${esc(COACH.back)}</p>
    <div class="dsc-actions"><button class="dsc-btn" type="button" data-close data-guide="coach-close">${icon('check')}Got it</button></div>`;
  el.querySelector('[data-close]')?.addEventListener('click', () => closeCoach(el));
  el.style.visibility = 'hidden';
  el.hidden = false;
  // Placed after the Expert layout has settled (the frame glides for 0.42 s).
  window.setTimeout(() => place(el), 480);
}

/** Closes the coach. */
export function closeCoach(el: HTMLElement): void {
  el.hidden = true;
}

/** Puts the card in free sky: left of the frame, else under the top row at the left. */
function place(el: HTMLElement): void {
  if (el.hidden) return;
  const h = el.offsetHeight;
  const others = [...document.querySelectorAll<HTMLElement>('[data-card]')]
    .filter((c) => c !== el && c.checkVisibility())
    .map((c) => c.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  const frame = document.getElementById('frame')?.getBoundingClientRect();
  const sw = document.getElementById('view-switch')?.getBoundingClientRect();
  const tries: { x: number; y: number }[] = [];
  if (frame?.width) tries.push({ x: frame.left - 16 - W, y: frame.top }, { x: frame.left - 16 - W, y: frame.bottom - h });
  if (sw?.width) tries.push({ x: sw.right - W, y: sw.bottom + 12 });
  for (let y = 76; y + h < innerHeight - 56; y += 40) tries.push({ x: 16, y }, { x: innerWidth / 2 - W / 2, y });
  const fits = tries.find(
    (p) =>
      p.x >= 16 &&
      p.y >= 16 &&
      p.x + W <= innerWidth - 16 &&
      p.y + h <= innerHeight - 56 &&
      !others.some((r) => p.x < r.right + 8 && p.x + W > r.left - 8 && p.y < r.bottom + 8 && p.y + h > r.top - 8),
  );
  if (!fits) {
    // No free sky: the coach would cover the work, so it does not show (GDE-8).
    el.hidden = true;
    return;
  }
  el.style.left = `${Math.round(fits.x)}px`;
  el.style.top = `${Math.round(fits.y)}px`;
  el.style.visibility = '';
}
