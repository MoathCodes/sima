/**
 * English words of the interface: the source and the fallback for every other locale
 * (src/shell/i18n.ts). Owner: the Arabic locale lane.
 *
 * Keys are `area.thing`. `{name}` is a variable. A value with `one` and `other` is a plural:
 * `t(key, { n })` picks the form for `n` (Intl.PluralRules). Every key here must have an Arabic
 * value in ar.ts (a type error there; tests/i18n.test.ts also checks the variables match).
 * Terms follow docs/arabic-glossary.md.
 */

/** An English plural: the forms Intl.PluralRules('en') can pick. */
export interface EnPlural {
  readonly one: string;
  readonly other: string;
}

export const en = {
  // The page itself.
  'app.title': 'Sima (سيما): watch the infrared sky change',
  'app.description':
    "NASA SPHEREx's infrared sky: put a frame on any spot and play its real exposures in date order. Stars stay still; anything that moves or changes stands out.",

  // The language switch (Settings). The choices name each language in its own words (lang.*).
  'lang.group': 'Language',

  // Toasts any part may show.
  'toast.close': 'Close the message',
  'link.notUnderstood': 'Not understood in the link, so left out: {notes}.',
  'copy.done': 'Copied {text}',
  'copy.failed': 'Could not copy. The coordinates are {text}',
  'ws.unreadLink': 'The workspace link could not be read.',
  'ws.usualView': '{note} The usual view opened instead.',
  'ws.saved': 'Saved “{name}” in this browser.',
  'ws.notSaved': 'This browser does not allow saving here, so it was not saved. Export it as a file instead.',
  'ws.unread': '“{name}” could not be read.',
  'ws.notJson': '“{name}” is not a workspace file (it is not JSON).',
  'ws.opened': 'Opened “{name}”.',
  'ws.deleted': 'Deleted “{name}”.',
  'ws.dropOnSky': 'Drop it on the sky, not on a card.',

  // About.
  'about.title': 'About Sima',
  'about.close': 'Close About',
  'about.toc': 'Sections of About',
  'about.sec.use': 'How to use',
  'about.sec.method': 'Method',
  'about.sec.targets': 'Targets',
  'about.sec.planetX': 'Planet X',
  'about.sec.challenge': 'Challenge',
  'about.sec.limits': 'Limits',
  'about.sec.ai': 'AI help',
  'about.sec.sources': 'Sources',

  // Common words (phase 2 wires them where the final wording lands).
  'word.close': 'Close',
  'word.back': 'Back',
  'word.settings': 'Settings',
  'word.about': 'About',
  'word.search': 'Search',
  'word.share': 'Share',
  'word.play': 'Play',
  'word.pause': 'Pause',
  'word.discover': 'Discover',
  'word.expert': 'Expert',
  'word.missions': 'Missions',
  'word.measure': 'Measure',

  // Honesty words (SPEC section 2). "Simulated" always comes first on simulated data.
  'honest.simulated': 'Simulated',
  'honest.pretend': 'Pretend',
  'honest.notMeasured': 'Not measured',
  'honest.notMeasuredWhy': 'Not measured: {reason}',
  'honest.candidate': 'Candidate to check, not a discovery',

  // Missions and the five test targets (names stay as catalogues write them).
  'mission.runaway': 'The runaway',
  'mission.ghost': 'The ghost',
  'mission.planetX': 'Simulated: Planet X',
  'target.barnard.line': 'The runaway star',
  'target.eps-indi-b.line': 'The twin failed stars',
  'target.wise-0855.line': 'The coldest failed star',
  'target.rw-aur.line': 'The flickering newborn',
  'target.r-dra.line': 'The breathing giant',

  // Counts.
  'count.exposures': { one: '{n} exposure', other: '{n} exposures' },
  'count.frames': { one: '{n} frame', other: '{n} frames' },
  'count.dates': { one: '{n} date', other: '{n} dates' },
  'count.passes': { one: '{n} survey pass', other: '{n} survey passes' },
} as const satisfies Record<string, string | EnPlural>;

/** A message key. */
export type Key = keyof typeof en;
