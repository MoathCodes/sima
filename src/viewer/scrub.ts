/**
 * The date scale (DESIGN.md "The date scale", BAR-2): a ruled scale of the survey's dates that
 * replaces a plain progress bar. Owner: lane D.
 *
 * - Ruling: a tick per month; every third month taller with an 11px label; January carries the
 *   year. A 1px line marks today.
 * - Passes: a 4px bar per survey pass (or month, for R Draconis); the part already played is Soft
 *   Ink.
 * - Explore: each date group is a 20px lettered stop in its pass tint with a stem down to the
 *   scale; the current stop has the magenta-on-card ring (the playhead).
 * - Measure: every visit is an 8px ink dot, each pass is named, and the playhead is a 2px
 *   magenta-on-card line with a 14px knob.
 * - Hover: an ink tip above the scale gives the date. A press or a drag picks the nearest date.
 *
 * Borrowed from eye clinics and photo editors (SPEC 7.4): a letter and a coloured edge per date.
 */
import { S } from './state.ts';
import { pause, setEpoch } from './playback.ts';
import { groupDate, passName, pair } from './render.ts';
import { formatDate } from '../core/astro.ts';
import type { Group } from '../core/types.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;
const MJD_UNIX = 40587;

/** A group's place in time (an empty date takes its pass's date). */
const at = (g: Group) => groupDate(S.field, g);
const mjdOf = (d: Date) => d.getTime() / DAY_MS + MJD_UNIX;
const dateOf = (mjd: number) => new Date((mjd - MJD_UNIX) * DAY_MS);

/** The time span the scale shows, MJD: the dates with a margin, and today if it is close. */
function domain(groups: readonly Group[]): [number, number] | null {
  const ok = groups.flatMap((g) => [g.mjd0, g.mjd1, at(g)]).filter(Number.isFinite);
  if (!ok.length) return null;
  let lo = Math.min(...ok);
  let hi = Math.max(...ok);
  const today = mjdOf(new Date());
  if (today > hi && today - hi < 240) hi = today;
  const pad = Math.max(12, (hi - lo) * 0.04);
  return [lo - pad, hi + pad];
}

/** Fills the date scale. `el` is the bar's `[data-dates]` element. */
export function paintDates(el: HTMLElement, why = ''): void {
  const groups = S.groups;
  const dom = domain(groups);
  const measure = S.level === 'measure';
  el.classList.toggle('measure', measure);
  el.classList.toggle('off', !dom);
  if (!dom) {
    // With no dates, the scale says why (BAR-6), so a dimmed bar is never a riddle.
    const html = `<span class="ds-line"></span>${why ? `<span class="ds-why"></span>` : ''}`;
    if (el.dataset.empty !== html + why) {
      el.dataset.empty = html + why;
      el.innerHTML = html;
      const w = el.querySelector('.ds-why');
      if (w) w.textContent = why;
    }
    return;
  }
  delete el.dataset.empty;
  const [t0, t1] = dom;
  const x = (mjd: number) => `${((mjd - t0) / (t1 - t0)) * 100}%`;
  const parts: string[] = [];

  // Ruling: a tick per month, every third month taller and lettered; January has the year.
  const start = dateOf(t0);
  for (
    let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    mjdOf(d) < t1;
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  ) {
    const m = d.getUTCMonth();
    const major = m % 3 === 0;
    parts.push(`<span class="ds-tick${major ? ' major' : ''}" style="left:${x(mjdOf(d))}"></span>`);
    if (major) {
      const text = m === 0 ? `Jan ${d.getUTCFullYear()}` : MONTHS[m];
      parts.push(`<span class="ds-month" style="left:${x(mjdOf(d))}">${text}</span>`);
    }
  }
  const today = mjdOf(new Date());
  if (today > t0 && today < t1) {
    parts.push(
      `<span class="ds-today" style="left:${x(today)}" data-tip="Today" data-tip-pos="above"></span>`,
    );
  }

  // Passes: one bar per window, from halfway to the previous pass to halfway to the next.
  const cur = groups[S.epoch];
  const head = cur ? at(cur) : t0;
  const windows = [...new Set(groups.map((g) => g.window))].sort((a, b) => a - b);
  const centre = (w: number) => {
    const gs = groups.filter((g) => g.window === w);
    const v = gs.flatMap((g) => [g.mjd0, g.mjd1, at(g)]).filter(Number.isFinite);
    return v.length ? (Math.min(...v) + Math.max(...v)) / 2 : Number.NaN;
  };
  const centres = windows.map(centre);
  windows.forEach((w, i) => {
    const c = centres[i] ?? Number.NaN;
    if (!Number.isFinite(c)) return;
    const a = i === 0 ? t0 : (c + (centres[i - 1] ?? c)) / 2;
    const b = i === windows.length - 1 ? t1 : (c + (centres[i + 1] ?? c)) / 2;
    const played = Math.max(0, Math.min(1, (head - a) / (b - a || 1)));
    parts.push(
      `<span class="ds-pass" style="left:calc(${x(a)} + 2px);width:calc(${x(b)} - ${x(a)} - 4px);--played:${played * 100}%"></span>`,
    );
  });

  if (measure) {
    // Pass names, left out where they would run into each other.
    let lastLeft = -Infinity;
    windows.forEach((w, i) => {
      const c = centres[i] ?? Number.NaN;
      if (!Number.isFinite(c)) return;
      const left = ((c - t0) / (t1 - t0)) * el.clientWidth;
      if (left - lastLeft < 64) return;
      lastLeft = left;
      const first = groups.find((g) => g.window === w);
      const label =
        S.field?.monthly && first
          ? formatDate(at(first), 'month')
          : passName(S.field, w).replace('Survey p', 'P');
      parts.push(`<span class="ds-passname" style="left:${x(c)}">${label}</span>`);
    });
    groups.forEach((g, i) => {
      const t = at(g);
      if (!Number.isFinite(t)) return;
      parts.push(
        `<button class="ds-dot${g.frames.length ? '' : ' empty'}" style="left:${x(t)}" data-epoch="${i}" tabindex="-1" aria-label="${formatDate(t, 'day')}${g.frames.length ? '' : `, no D${g.det} exposure`}"></button>`,
      );
    });
    if (cur && Number.isFinite(at(cur))) {
      parts.push(`<span class="ds-playhead" style="left:${x(at(cur))}"></span>`);
    }
  } else {
    const [ref] = pair();
    groups.forEach((g, i) => {
      const t = at(g);
      if (!Number.isFinite(t)) return;
      const on = i === S.epoch;
      const isRef = S.mode === 'two' && g === ref && !on;
      parts.push(
        `<span class="ds-stem" style="left:${x(t)}"></span><button class="ds-stop${on ? ' on' : ''}${isRef ? ' ref' : ''}${g.frames.length ? '' : ' empty'}" style="left:${x(t)};--tint:var(--p${(g.window % 4) + 1})" data-epoch="${i}" aria-label="Date ${g.letter}, ${formatDate(t, 'month')}${g.frames.length ? '' : `, no D${g.det} exposure`}${isRef ? ', the red date in Two dates' : ''}" aria-current="${on}">${g.letter}</button>`,
      );
    });
  }
  parts.unshift('<span class="ds-line"></span>');
  parts.push('<span class="ds-tip" hidden></span>');
  el.innerHTML = parts.join('');
}

/** Hover tip, press and drag on the date scale. Bound once. */
export function watchDates(el: HTMLElement): void {
  const nearest = (clientX: number): number | null => {
    const dom = domain(S.groups);
    if (!dom || !S.groups.length) return null;
    const r = el.getBoundingClientRect();
    const mjd = dom[0] + ((clientX - r.left) / r.width) * (dom[1] - dom[0]);
    let best = 0;
    const b = S.groups[best];
    let bestD = b ? Math.abs(at(b) - mjd) : Infinity;
    S.groups.forEach((g, i) => {
      const d = Math.abs(at(g) - mjd);
      if (d < bestD || !Number.isFinite(bestD)) {
        best = i;
        bestD = d;
      }
    });
    return best;
  };
  const tip = (clientX: number | null) => {
    const t = el.querySelector<HTMLElement>('.ds-tip');
    if (!t) return;
    const dom = domain(S.groups);
    if (clientX === null || !dom) {
      t.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const i = nearest(clientX);
    const g = i === null ? null : S.groups[i];
    t.textContent = g
      ? formatDate(at(g), S.level === 'measure' ? 'time' : 'day')
      : formatDate(dom[0] + f * (dom[1] - dom[0]), 'day');
    t.style.left = `${f * 100}%`;
    t.hidden = false;
  };
  let dragging = false;
  el.addEventListener('pointerdown', (e) => {
    if (el.classList.contains('off') || e.button !== 0) return;
    dragging = true;
    capture(el, e.pointerId);
    pause();
    const i = nearest(e.clientX);
    if (i !== null) setEpoch(i);
  });
  el.addEventListener('pointermove', (e) => {
    tip(e.clientX);
    if (!dragging) return;
    const i = nearest(e.clientX);
    if (i !== null && i !== S.epoch) setEpoch(i);
  });
  const stop = () => (dragging = false);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('pointerleave', () => tip(null));
  // Keyboard: the stops are buttons; Enter or Space on one shows it.
  el.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-epoch]') : null;
    if (b && e.detail === 0) {
      pause();
      setEpoch(Number(b.dataset.epoch));
    }
  });
}

/** Captures the pointer when the browser allows it (a synthetic or ended pointer cannot be). */
function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    // Nothing to capture: the drag still works while the pointer stays over the element.
  }
}
