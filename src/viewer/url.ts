/**
 * Links: what a shared address holds, read at start and written by Share (SPEC 8.5, GEN-2,
 * GEN-3). Owner: lane F.
 *
 * Parameters: `ra`, `dec` (degrees), `fov` (arcminutes), `det` (`D1` to `D6`, or `color`),
 * `view` (a Mode), `target` (a shipped target or practice key), `date` (the picture on screen,
 * YYYY-MM-DD in UTC), `pic` (picture settings, core/picture.ts `encodePic`) and `embed=1`.
 * A parameter or value that is not understood is named in a note, never ignored silently.
 */
import { S, VIEWS, nearestFov, watch, type Mode } from './state.ts';
import { aimAt, loadTarget } from './load.ts';
import { pause, setEpoch } from './playback.ts';
import { decodePic, encodePic } from '../core/picture.ts';
import { TARGETS } from '../core/targets.ts';
import { SCENARIOS } from '../core/field.ts';
import { emit } from '../shell/bus.ts';
import { toast } from '../shell/toast.ts';
import { setLevel } from '../explore/game.ts';
import type { Det, Group } from '../core/types.ts';

/** A link, read. Null means the link does not say. */
export interface Link {
  /** Degrees. */
  ra: number | null;
  dec: number | null;
  /** Arcminutes. */
  fov: number | null;
  det: Det | 'color' | null;
  view: Mode | null;
  target: string | null;
  /** YYYY-MM-DD (UTC), as written. */
  date: string | null;
  /** Encoded picture settings, as written. */
  pic: string | null;
  /** `embed=1`: only the frame, the bar and Measure (GEN-3). */
  embed: boolean;
  /** Parameters or values that were not understood, as `name=value`, for the note. */
  unknown: string[];
}

const MODES: readonly Mode[] = ['flip', 'swipe', 'two', 'diff', 'stack', 'trail'];
const KNOWN = new Set(['ra', 'dec', 'fov', 'det', 'view', 'target', 'date', 'pic', 'embed']);
const MJD_UNIX = 40587; // MJD of 1970-01-01

/**
 * Reads a link's parameters and checks each value's range. Pure.
 * @param search `location.search`, with or without the leading `?`.
 */
export function readLink(search: string): Link {
  const q = new URLSearchParams(search);
  const unknown: string[] = [];
  const bad = (k: string, v: string, why = '') =>
    unknown.push(`${k}=${v}${why ? ` (${why})` : ''}`);
  for (const k of new Set(q.keys())) {
    if (!KNOWN.has(k)) bad(k, q.get(k) ?? '');
    else if (q.getAll(k).length > 1) unknown.push(`${k} (given more than once; the first is used)`);
  }
  const num = (k: string, lo: number, hi: number, why: string): number | null => {
    const v = q.get(k);
    if (v === null) return null;
    const n = v.trim() === '' ? Number.NaN : Number(v);
    if (Number.isFinite(n) && n >= lo && n <= hi) return n;
    bad(k, v, why);
    return null;
  };

  let ra = num('ra', 0, 360, 'degrees, 0 to 360');
  let dec = num('dec', -90, 90, 'degrees, −90 to 90');
  if ((ra === null) !== (dec === null)) {
    unknown.push(ra === null ? 'dec (needs ra too)' : 'ra (needs dec too)');
    ra = dec = null;
  }
  if (ra === 360) ra = 0;
  const fov = num('fov', 1, 600, 'arcminutes, 3 to 48');

  const detText = q.get('det');
  let det: Det | 'color' | null = null;
  if (detText !== null) {
    const m = /^d?([1-6])$/i.exec(detText.trim());
    det = /^colou?r$/i.test(detText.trim()) ? 'color' : m ? (Number(m[1]) as Det) : null;
    if (det === null) bad('det', detText, 'D1 to D6, or color');
  }

  const viewText = q.get('view');
  const view = MODES.find((m) => m === viewText) ?? null;
  if (viewText !== null && view === null) bad('view', viewText, MODES.join(', '));

  const targetText = q.get('target');
  const known = (k: string) => TARGETS.some((t) => t.key === k) || Object.hasOwn(SCENARIOS, k);
  const target = targetText !== null && known(targetText) ? targetText : null;
  if (targetText !== null && target === null) bad('target', targetText, 'not one of the targets');

  const dateText = q.get('date');
  const date = dateText !== null && dayToMjd(dateText) !== null ? dateText : null;
  if (dateText !== null && date === null) bad('date', dateText, 'YYYY-MM-DD');

  const embedText = q.get('embed');
  if (embedText !== null && embedText !== '1' && embedText !== '0') bad('embed', embedText, '1');

  return {
    ra,
    dec,
    fov,
    det,
    view,
    target,
    date,
    pic: q.get('pic') || null,
    embed: embedText === '1',
    unknown,
  };
}

/**
 * Opens what a link asks for: the target, else the coordinates, else Barnard's Star; then the
 * field size, view, detector, picture settings and date. Anything that could not be applied is
 * named in one note. Called once by main.ts, after the other parts have started.
 */
export async function startUrl(link: Link): Promise<void> {
  S.embed = link.embed;
  const notes = [...link.unknown];

  if (link.target) await loadTarget(link.target);
  else if (link.ra !== null && link.dec !== null) {
    await aimAt(link.ra, link.dec, link.fov ?? undefined);
  } else await loadTarget('barnard');

  if (link.target && link.fov !== null && nearestFov(link.fov) !== S.fov) {
    emit('aim', { ra: S.ra, dec: S.dec, fov: link.fov, target: link.target });
    await idle();
  }

  if (link.view) {
    if (!VIEWS[S.level].includes(link.view)) setLevel('measure');
    S.mode = link.view;
  }

  if (link.det === 'color')
    notes.push('det=color (the Color view cannot be opened from a link yet)');
  else if (link.det !== null && link.det !== S.det) emit('band', { det: link.det });

  if (link.pic) {
    const { pic, unknown } = decodePic(link.pic);
    S.pic = pic;
    S.picLinked = true;
    if (unknown.length) notes.push(`pic (${unknown.join(', ')})`);
  }

  if (link.date) {
    const i = groupOn(S.groups, link.date);
    if (i === null) notes.push(`date=${link.date} (this patch has no picture from that day)`);
    else {
      pause();
      setEpoch(i);
    }
  }

  if (notes.length) {
    toast(`Not understood in the link, so left out: ${notes.join('; ')}.`, { ms: 12000 });
  }
}

/**
 * The link to what is on screen now (Share).
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

/** YYYY-MM-DD → MJD at 0h UTC, or null when it is not a real date. */
function dayToMjd(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== day) return null;
  return t / 86400000 + MJD_UNIX;
}

/** Resolves once the frame has finished loading (or after two minutes). */
function idle(): Promise<void> {
  return new Promise((done) => {
    const finished = () => S.load === null && S.source !== 'loading';
    let stop = () => {};
    const timer = setTimeout(() => {
      stop();
      done();
    }, 120000);
    const check = () => {
      if (!finished()) return;
      clearTimeout(timer);
      stop();
      done();
    };
    stop = watch(['load', 'source', 'groups'], check);
    queueMicrotask(check);
  });
}
