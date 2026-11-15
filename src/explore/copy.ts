/**
 * The words of the starters and the task line in the frame. Owner: lane H.
 *
 * Every string here is used (O-W5): tests/guide.test.ts checks that each export is imported
 * somewhere in src/. Words follow SPEC 4.1, 4.2 and the reference screenshots. Nothing here
 * claims a discovery (H7), and practice words say "Simulated" first (H3).
 */
import { t } from '../shell/i18n.ts';

/** What a task asks for, by the kind of change its target shows. */
export type TaskKind = 'mover' | 'spectrum' | 'variable' | 'faint';

/** The task for one target or practice patch. */
export interface TaskCopy {
  /** Short name, as on the starter ("Runaway star"). */
  title: string;
  /** What to do, in one or two short sentences. The last one is the action. */
  line: string;
  kind: TaskKind;
  /** Hint, then Another hint: each gives a little more (GDE-5). Look closer and Show me draw. */
  hints: [string, string];
}

/** Tasks for the five test targets and the two practice patches, by key. */
export const TASKS: Readonly<Record<string, TaskCopy>> = {
  barnard: {
    title: t('ec.1'),
    line: t('ec.2'),
    kind: 'mover',
    hints: [t('ec.3'), t('ec.4')],
  },
  'eps-indi-b': {
    title: t('ec.5'),
    line: t('ec.6'),
    kind: 'spectrum',
    hints: [t('ec.7'), t('ec.8')],
  },
  'wise-0855': {
    title: t('ec.9'),
    line: t('ec.10'),
    kind: 'faint',
    hints: [t('ec.11'), t('ec.12')],
  },
  'rw-aur': {
    title: t('ec.13'),
    line: t('ec.14'),
    kind: 'variable',
    hints: [t('ec.15'), t('ec.16')],
  },
  'r-dra': {
    title: t('ec.17'),
    line: t('ec.18'),
    kind: 'variable',
    hints: [t('ec.19'), t('ec.20')],
  },
  'warm-up': {
    title: t('ec.21'),
    line: t('ec.22'),
    kind: 'mover',
    hints: [t('ec.23'), t('ec.24')],
  },
  'planet-x': {
    title: t('ec.25'),
    line: t('ec.26'),
    kind: 'mover',
    hints: [t('ec.27'), t('ec.28')],
  },
};

/** The line for a spot fetched live: no task, only what is true of it. */
export const LIVE_LINE = t('ec.29');

/** The four steps of help, in order (GDE-5). */
export const HINT_LABELS = [t('dm.hint'), t('dm.another'), t('dm.closer'), t('ms.showMe')] as const;

/** What Look closer and Show me say while they draw on the picture. */
export const LOOK_CLOSER = t('ec.30');
export const LOOK_CLOSER_FAINT = t('ec.31');
export const SHOW_ME = t('ec.32');
export const SHOW_ME_FAINT = t('ec.33');

/** The task line while the picture has keyboard focus (keypick.ts). */
export const KEYS_LINE = t('ec.34');

/**
 * The one measured sentence under a found mover: how far it moved between the first and last
 * date on screen, from the measured motion (arcseconds, and pixels of `scale` arcseconds).
 */
export function movedLine(
  from: string,
  to: string,
  arcsec: number,
  err: number,
  scale: number,
): string {
  const px = (arcsec / scale).toFixed(1);
  return t(px === '1.0' ? 'ec.moved1' : 'ec.moved', {
    from,
    to,
    v: `${arcsec.toFixed(1)} ± ${err.toFixed(1)}″`,
    px,
  });
}

/** A tap that missed. */
export const MISSED = t('ec.35');
/** A tap while the found star is shown. */
export const MEASURING = t('ec.36');
