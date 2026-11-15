/**
 * Reading a link (SPEC 8.5, GEN-2, GEN-3; v2.0 `ui=` and `mission=`). Pure, so it is tested in
 * Node; `url.ts` applies what is read and re-exports these. Owner: lane F.
 */
import type { Mode } from './state.ts';
import { TARGETS } from '../core/targets.ts';
import { SCENARIOS } from '../core/field.ts';
import type { Det } from '../core/types.ts';
import { MISSION_IDS, isMissionId, type MissionId } from '../explore/missions.ts';
import { workspaceInHash } from '../workspace/schema.ts';

/**
 * The two views (v2.0): Discover and Expert. Also the link's `ui=` values. Defined here so the
 * pure link code has no page dependencies; `shell/view.ts` re-exports it.
 */
export type View = 'discover' | 'expert';

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
  /** v2.0 `ui=`: the view the link asks for. */
  ui: View | null;
  /** v2.0 `mission=`: the Discover mission to open. */
  mission: MissionId | null;
  /** Parameters or values that were not understood, as `name=value`, for the note. */
  unknown: string[];
}

const MODES: readonly Mode[] = ['flip', 'swipe', 'two', 'diff', 'stack', 'trail'];
// `intro` is read by index.html and src/intro/intro.ts (play or skip the opening intro); `lang`
// by index.html and src/shell/i18n.ts (the interface language).
const KNOWN = new Set(['ra', 'dec', 'fov', 'det', 'view', 'target', 'date', 'pic', 'embed', 'intro', 'ui', 'mission', 'lang']);
/** MJD of 1970-01-01. */
export const MJD_UNIX = 40587;

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

  const uiText = q.get('ui');
  const ui = uiText === 'discover' || uiText === 'expert' ? uiText : null;
  if (uiText !== null && ui === null) bad('ui', uiText, 'discover or expert');

  const missionText = q.get('mission');
  const mission = isMissionId(missionText) ? missionText : null;
  if (missionText !== null && mission === null) bad('mission', missionText, MISSION_IDS.join(', '));

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
    ui,
    mission,
    unknown,
  };
}

/**
 * The view a link opens (VIEW-4, B-2). Pure. In order:
 * 1. `ui=` wins;
 * 2. else Expert settings in the link (`view`, `pic`, `det`, `date`, or a workspace `#w=`) mean
 *    Expert, so a link made in Expert opens the way it was made;
 * 3. else the remembered view (`fallback`: the remembered one, or the first-visit default).
 *
 * @param link The link, read by `readLink`.
 * @param hash `location.hash`, with or without the `#`.
 * @param fallback The remembered view, or the default for a first visit.
 */
export function viewFor(link: Link, hash: string, fallback: View): View {
  if (link.ui) return link.ui;
  const workspace = workspaceInHash(hash.startsWith('#') ? hash : `#${hash}`) !== null;
  if (link.view !== null || link.pic !== null || link.det !== null || link.date !== null || workspace) return 'expert';
  return fallback;
}

/**
 * The view part of a shared link (VIEW-4): `ui=` always, and `mission=` only in Discover with a
 * mission open. Never progress (B-10). Pure; `url.ts` `linkFor` adds these.
 */
export function viewParams(view: View, mission: MissionId | null): [string, string][] {
  const out: [string, string][] = [['ui', view]];
  if (view === 'discover' && mission) out.push(['mission', mission]);
  return out;
}

/** YYYY-MM-DD → MJD at 0h UTC, or null when it is not a real date. */
export function dayToMjd(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== day) return null;
  return t / 86400000 + MJD_UNIX;
}
