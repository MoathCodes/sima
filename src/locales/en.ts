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

  // The top row and the rail.
  'top.view': 'View',
  'top.guide': 'Guide',
  'top.places': 'Places',
  'top.shareTip': 'Share this view',
  'top.menu': 'Menu',
  'rail.zoomIn': 'Zoom in (+)',
  'rail.zoomInLabel': 'Zoom the sky in',
  'rail.zoomOut': 'Zoom out (−)',
  'rail.zoomOutLabel': 'Zoom the sky out',
  'rail.skyMap': 'Sky map',
  'rail.grid': 'Coordinate grid',
  'rail.frames': 'Add a frame · workspaces',
  'rail.framesLabel': 'Add a frame, workspaces',

  // Toasts any part may show.
  'toast.close': 'Close the message',
  'link.notUnderstood': 'Not understood in the link, so left out: {notes}.',
  'copy.done': 'Copied {text}',
  'copy.failed': 'Could not copy. The coordinates are {text}',
  'ws.unreadLink': 'The workspace link could not be read.',
  'ws.usualView': '{note} The usual view opened instead.',
  'ws.saved': 'Saved “{name}” in this browser.',
  'ws.notSaved':
    'This browser does not allow saving here, so it was not saved. Export it as a file instead.',
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

  // The bar (viewer/bar.ts).
  "bar.lamRed": "Just past red light",
  "bar.lamNear": "Near infrared",
  "bar.lamDeeper": "Deeper infrared",
  "bar.lamLonger": "Longer infrared",
  "bar.lamHeat": "Heat glow",
  "bar.playback": "Playback",
  "bar.prevLabel": "Previous picture",
  "bar.prev": "Previous (←)",
  "bar.nextLabel": "Next picture",
  "bar.next": "Next (→)",
  "bar.playTip": "Play (Space)",
  "bar.pauseTip": "Pause (Space)",
  "bar.dates": "Dates",
  "bar.countTip": "The picture on screen, of all the visits",
  "bar.loopStyle": "Loop style",
  "bar.loopForward": "Loop: forward",
  "bar.loopBounce": "Loop: forward, then back",
  "bar.speed": "Speed",
  "bar.wavelength": "Wavelength",
  "bar.wavelengthTip": "The colour of infrared light the pictures were taken in. It sets the sky map too",
  "bar.same": "Same wavelength only",
  "bar.sameTip": "Play only the exposures taken at the wavelength on the scale",
  "bar.sameMissing": "No exposure at this wavelength in {passes}: left out",
  "bar.allSix": "All six",
  "bar.color": "Color",
  "bar.handleText": "{lam}, detector {det}",
  "bar.waitLoad": "Waiting for the pictures to load…",
  "bar.waitArchive": "Waiting for pictures from NASA’s archive…",
  "bar.noPictures": "No pictures here to play",
  "bar.noDetPictures": "No {det} pictures to play",
  "bar.oneDate": "Only one date here: nothing to play",

  // The date strip under the picture (viewer/chips.ts).
  "fp.date": "Date",
  "fp.allSix": "All six detectors",
  "fp.noneYet": "No pictures yet",
  "fp.noDate": "No date",
  "fp.missing": ": no {det} picture",

  // The frame (viewer/frame.ts). View names follow the glossary.
  "view.flip": "Flip",
  "view.flip.tip": "Show the dates one after another",
  "view.swipe": "Swipe",
  "view.swipe.tip": "Drag the line to compare the reference date with this one",
  "view.two": "Two dates",
  "view.two.tip": "Two dates in one picture: red is earlier, cyan is later",
  "view.diff": "Difference",
  "view.diff.tip": "Only what is brighter or fainter than usual",
  "view.stack": "Stack",
  "view.stack.tip": "Every date added up, to see what is too faint for one",
  "view.trail": "Trail",
  "view.trail.tip": "Earlier dates stay as a fading trail",
  "explain.flip": "Each picture is one visit, scaled to the reference brightness. Stars stay put; what shifts is moving.",
  "explain.swipe": "Left of the line is the reference date, right of it this one. Drag the line over anything that differs.",
  "explain.two": "Red is the reference date, cyan this one. Unchanged is white; a red and cyan pair moved.",
  "explain.diff": "This date minus the median of all dates: white is here now, dark is where it usually sits.",
  "explain.stack": "Every exposure in this detector added up, so faint things build up and the noise drops.",
  "explain.trail": "This date in colour, earlier dates as a fading trail: a mover draws its own path.",
  "src.real": "Real data",
  'src.realHow': 'Real data, {how}',
  "src.realTip": "Real exposures from NASA’s SPHEREx telescope, from NASA’s archive (IRSA)",
  "src.live": "Real data, fetched live",
  "src.liveTip": "Real exposures fetched from NASA’s archive (IRSA) for this spot just now",
  "src.simTip": "Made-up pictures for practice. They are never mixed with real results",
  "src.none": "No pictures here",
  "src.noneTip": "There are no real pictures of this spot in the frame",
  "src.loading": "Loading…",
  "src.loadingTip": "Real exposures of this spot are on their way",
  "frame.fov": "Field size",
  "frame.fovLabel": "Field size: {n} arcminutes",
  "frame.fovTip": "Field size (the wheel over the picture changes it too)",
  "frame.about": "About this picture",
  "frame.tools": "Picture tools",
  "frame.closeMeasure": "Close Measure",
  "frame.simple": "Back to the simple view",
  "frame.measureTip": "Measure: numbers, charts and all six views",
  "frame.hide": "Hide the frame",
  "frame.release": "Data release: {r}",
  "frame.still": "Your device asks for less motion, so this is a still picture of two dates. Press Flip to play them.",
  "frame.wider": "Real exposures of the wider field",
  "frame.askAgain": "Ask again",
  "frame.preview": "Preview: sky map, all dates averaged",
  "frame.coverMore": "Can take a few minutes. The sky still works.",
  "frame.noPractice": "The practice simulation has no pictures in this build.",
  "frame.noSpot": "There are no pictures of this spot in the frame.",
  "frame.noneYet": "No real pictures yet",
  "frame.noneHere": "No real pictures here",
  "frame.openNow": "Real SPHEREx pictures you can open now",
  "frame.practice": "Practice on made-up pictures",
} as const satisfies Record<string, string | EnPlural>;

/** A message key. */
export type Key = keyof typeof en;
