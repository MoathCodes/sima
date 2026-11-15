/**
 * Discover's words (BEGINNER-AND-MOBILE.md sections 5, 6 and 8). Owner: lane K.
 *
 * Voice: plain, warm, exact. No sentence claims a discovery (H7): known objects are "caught",
 * "found" or "made appear"; Planet X is "tested" and "pretend", and says "Simulated" first (H3).
 * Result sentences are templates filled from measured values (src/discover/success.ts); a missing
 * value prints "Not measured" and why (H5). Mission data and checks are lane H's
 * (src/explore/missions.ts); these are only the words the screens show.
 */
import type { MissionId } from '../explore/missions.ts';
import { t } from '../shell/i18n.ts';

/**
 * What Discover adds to lane H's mission words (src/explore/missions.ts: titles, step sentences,
 * hints, Show me, headings, lessons and the objects are lane H's): the list's name, line and
 * minutes, the object line for Planet X, and a short label per step for the done and next rows.
 */
export interface MissionCopy {
  /** The list's name (Planet X's card title says "Simulated:" first; the list uses a pill). */
  name: string;
  line: string;
  minutes: number;
  object?: string;
  labels: Readonly<Record<string, string>>;
}

export const MISSION_COPY: Readonly<Record<MissionId, MissionCopy>> = {
  runaway: {
    name: t('mission.runaway'),
    line: t('dc.runaway.line'),
    minutes: 1,
    labels: { play: t('dc.pressPlay'), tap: t('dc.tapJump') },
  },
  ghost: {
    name: t('mission.ghost'),
    line: t('dc.ghost.line'),
    minutes: 3,
    labels: { play: t('dc.playCircle'), stack: t('dc.pressStack'), motion: t('dc.turnArrow') },
  },
  'planet-x': {
    name: t('about.sec.planetX'),
    line: t('dc.px.line'),
    minutes: 2,
    object: t('dc.px.object'),
    labels: { check: t('dc.px.check'), closer: t('dc.px.closer'), bigger: t('dc.px.bigger') },
  },
};

export const WELCOME = {
  heading: t('dc.w.heading'),
  body: t('dc.w.body'),
  start: t('dc.w.start'),
  startLine: t('dc.w.startLine'),
  look: t('dc.w.look'),
};

export const MEASURING = t('hl.measuring');
export const LEAVE_ASK = t('dc.leave');
export const KEYS = t('dc.keys');

/** SIMBAD's type, in plain words, from the shipped `kind` field ("Red dwarf (M4V)"). */
export function plainKind(kind: string): string {
  return kind.replace(/\s*\([^)]*\)\s*$/, '');
}
