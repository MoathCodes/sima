/**
 * Links: what a shared address holds, read at start and written by Share (SPEC 8.5, GEN-2,
 * GEN-3). Owner: lane F.
 *
 * Parameters: `ra`, `dec` (degrees), `fov` (arcminutes), `det` (`D1` to `D6`, or `color`),
 * `view` (a Mode), `target` (a shipped target or practice key), `date` (the picture on screen,
 * YYYY-MM-DD in UTC), `pic` (picture settings, core/picture.ts `encodePic`) and `embed=1`.
 * A parameter that is not understood is named in a note, never ignored silently.
 *
 * PHASE 0 STUB: reads and writes the parameters but checks no ranges; `date` and `pic` are
 * carried but not applied.
 */
import { S, VIEWS, type Mode } from './state.ts';
import { aimAt, loadTarget } from './load.ts';
import { encodePic } from '../core/picture.ts';
import type { Det } from '../core/types.ts';

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

/**
 * Reads a link's parameters. Pure.
 * @param search `location.search`, with or without the leading `?`.
 */
export function readLink(search: string): Link {
  const q = new URLSearchParams(search);
  const unknown = [...q.keys()].filter((k) => !KNOWN.has(k)).map((k) => `${k}=${q.get(k)}`);
  const num = (k: string): number | null => {
    const v = q.get(k);
    if (v === null) return null;
    const n = v.trim() === '' ? Number.NaN : Number(v);
    if (Number.isFinite(n)) return n;
    unknown.push(`${k}=${v}`);
    return null;
  };
  const detText = q.get('det');
  let det: Det | 'color' | null = null;
  if (detText !== null) {
    const m = /^d?([1-6])$/i.exec(detText);
    det = detText === 'color' ? 'color' : m ? Number(m[1]) : null;
    if (det === null) unknown.push(`det=${detText}`);
  }
  const viewText = q.get('view');
  const view = MODES.find((m) => m === viewText) ?? null;
  if (viewText !== null && view === null) unknown.push(`view=${viewText}`);
  return {
    ra: num('ra'),
    dec: num('dec'),
    fov: num('fov'),
    det,
    view,
    target: q.get('target'),
    date: q.get('date'),
    pic: q.get('pic'),
    embed: q.get('embed') === '1',
    unknown,
  };
}

/**
 * Opens what a link asks for: the target, else the coordinates, else Barnard's Star.
 * Called once by main.ts, after the other parts have started.
 * PHASE 0 STUB: `det`, `date` and `pic` are not applied yet.
 */
export async function startUrl(link: Link): Promise<void> {
  S.embed = link.embed;
  if (link.unknown.length) note(`Not understood in the link: ${link.unknown.join(', ')}`);
  if (link.target) await loadTarget(link.target);
  else if (link.ra !== null && link.dec !== null)
    await aimAt(link.ra, link.dec, link.fov ?? undefined);
  else await loadTarget('barnard');
  if (link.view && VIEWS[S.level].includes(link.view)) S.mode = link.view;
}

/**
 * The link to what is on screen now (Share).
 * @param opts `embed`: the embed version.
 * @returns An absolute URL.
 */
export function linkFor(opts: { embed?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (S.target) q.set('target', S.target);
  else {
    q.set('ra', S.ra.toFixed(5));
    q.set('dec', S.dec.toFixed(5));
  }
  q.set('fov', String(S.fov));
  q.set('det', S.color ? 'color' : `D${S.det}`);
  q.set('view', S.mode);
  const pic = encodePic(S.pic);
  if (pic) q.set('pic', pic);
  if (opts.embed) q.set('embed', '1');
  return `${location.origin}${location.pathname}?${q}`;
}

/** A short message above the bar. PHASE 0 STUB: lane F owns the toasts. */
function note(text: string): void {
  const box = document.getElementById('toasts');
  if (!box) return;
  const toast = document.createElement('p');
  toast.className = 'card';
  toast.style.cssText = 'margin:0;padding:8px 12px;font:var(--text-label)';
  toast.textContent = text;
  box.append(toast);
  setTimeout(() => toast.remove(), 8000);
}
