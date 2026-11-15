/**
 * Links: what a shared address holds, read at start and written by Share (SPEC 8.5, GEN-2,
 * GEN-3). Owner: lane F.
 *
 * Parameters: `ra`, `dec` (degrees), `fov` (arcminutes), `det` (`D1` to `D6`, or `color`),
 * `view` (a Mode), `target` (a shipped target or practice key), `date` (the picture on screen,
 * YYYY-MM-DD in UTC), `pic` (picture settings, core/picture.ts `encodePic`) and `embed=1`.
 * v2.0 adds `ui` (`discover` or `expert`) and `mission` (`runaway`, `ghost`, `planet-x`); see
 * `viewFor` for which view a link opens. Progress is never in a link (B-10).
 * A parameter or value that is not understood is named in a note, never ignored silently.
 */
import { S, VIEWS } from './state.ts';
import { aimAt, loadTarget } from './load.ts';
import { pause, setEpoch } from './playback.ts';
import { showColour } from './strip.ts';
import { decodePic, encodePic } from '../core/picture.ts';
import { emit, on } from '../shell/bus.ts';
import { toast } from '../shell/toast.ts';
import { setLevel } from '../explore/game.ts';
import { progress } from '../explore/progress.ts';
import { getView } from '../shell/view.ts';
import type { Group } from '../core/types.ts';
import { MJD_UNIX, dayToMjd, viewParams, type Link } from './link.ts';

// Reading a link is pure and lives in link.ts (so it is tested in Node); callers import it here.
export { readLink, viewFor, type Link } from './link.ts';

/**
 * Opens what a link asks for: the target, else the coordinates, else Barnard's Star, at the
 * link's field size. The picture settings apply at once; the view, detector and date apply once
 * the frame has finished loading (the first `patch` message that is not "loading"). Anything
 * that could not be applied is named in one note. Called once by main.ts, after the other parts
 * have started. It does not wait for the pictures: a live spot can take minutes.
 */
export async function startUrl(link: Link): Promise<void> {
  S.embed = link.embed;
  const notes = [...link.unknown];

  if (link.pic) {
    const { pic, unknown } = decodePic(link.pic);
    S.pic = pic;
    S.picLinked = true;
    if (unknown.length) notes.push(`pic (${unknown.join(', ')})`);
  }

  const later = link.view !== null || link.det !== null || link.date !== null;
  if (!later) say(notes);
  else {
    const stop = on('patch', (p) => {
      if (p.source === 'loading') return;
      stop();
      // Let the frame finish this round of changes (its groups) before choosing a picture.
      setTimeout(() => {
        applyLoaded(link, notes);
        say(notes);
      }, 0);
    });
  }

  if (link.target) void loadTarget(link.target, { fov: link.fov ?? undefined });
  else if (link.ra !== null && link.dec !== null) {
    void aimAt(link.ra, link.dec, link.fov ?? undefined);
  } else void loadTarget('barnard');
}

/** The parts of a link that need the pictures: view, detector, date. */
function applyLoaded(link: Link, notes: string[]): void {
  if (link.view) {
    if (!VIEWS[S.level].includes(link.view)) setLevel('measure');
    S.mode = link.view;
  }
  if (link.det === 'color') showColour(true);
  else if (typeof link.det === 'number' && link.det !== S.det) emit('band', { det: link.det });
  if (link.date) {
    const i = groupOn(S.groups, link.date);
    if (i === null) notes.push(`date=${link.date} (this patch has no picture from that day)`);
    else {
      pause();
      setEpoch(i);
    }
  }
}

/** One note for everything in the link that was left out. */
function say(notes: string[]): void {
  if (notes.length) {
    toast(`Not understood in the link, so left out: ${notes.join('; ')}.`, { ms: 12000 });
  }
}

/**
 * The link to what is on screen now (Share).
 * Carries the view (`ui=`) and, in Discover, the open mission (`mission=`); never progress.
 * @param opts `embed`: the embed version. `date` (default true): start at the picture on screen.
 * @returns An absolute URL.
 */
export function linkFor(opts: { embed?: boolean; date?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (S.target) q.set('target', S.target);
  else {
    q.set('ra', S.ra.toFixed(5));
    q.set('dec', S.dec.toFixed(5));
  }
  q.set('fov', String(S.fov));
  q.set('det', S.color ? 'color' : `D${S.det}`);
  q.set('view', S.mode);
  const day = opts.date === false ? null : dayOf(S.groups[S.epoch]);
  if (day) q.set('date', day);
  const pic = encodePic(S.pic);
  if (pic) q.set('pic', pic);
  if (opts.embed) q.set('embed', '1');
  else {
    // v2.0: the view, so the link opens the way it was made (`ui` wins, link.ts viewFor), and in
    // Discover the mission that is open. Never the progress itself (B-10).
    for (const [k, v] of viewParams(getView(), progress().current)) q.set(k, v);
  }
  return `${location.origin}${location.pathname}?${q}`;
}

/**
 * The UTC day of a picture, YYYY-MM-DD, or null when there is no picture.
 * @param g A group of S.groups.
 */
export function dayOf(g: Group | undefined): string | null {
  if (!g || !Number.isFinite(g.mjd)) return null;
  return new Date((g.mjd - MJD_UNIX) * 86400000).toISOString().slice(0, 10);
}

/**
 * The picture taken on a day: the group whose dates include it, else the one within a day of
 * it. Pure.
 * @returns An index into `groups`, or null.
 */
export function groupOn(groups: readonly Group[], day: string): number | null {
  const start = dayToMjd(day);
  if (start === null) return null;
  let best: number | null = null;
  let bestGap = 1;
  groups.forEach((g, i) => {
    if (!Number.isFinite(g.mjd)) return;
    const lo = Number.isFinite(g.mjd0) ? g.mjd0 : g.mjd;
    const hi = Number.isFinite(g.mjd1) ? g.mjd1 : g.mjd;
    // Distance between the day [start, start + 1) and the group's dates [lo, hi].
    const gap = Math.max(0, lo - (start + 1), start - hi);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  });
  return best;
}
