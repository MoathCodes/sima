/**
 * The phase 0 flows: every card and menu of the skeleton, and the demo flow of SPEC 9.6 as far
 * as it exists. Owner: integrator. Lanes add their own flows in their own file (see smoke.ts);
 * when a lane builds a step that is missing here (the tour ringing Play, tapping the mover), it
 * asks the integrator to add it.
 */
import { guide, keyStep, press, pressStep, type Flow } from '../smoke.ts';

/** Closes the welcome card the way a visitor who wants to look around does. */
const ownWay = pressStep('welcome-own', 'Close the welcome card ("Or explore the sky on my own")');

export const flows: Flow[] = [
  {
    name: 'First visit',
    owner: 'integrator',
    steps: [],
  },
  {
    name: 'Demo flow (SPEC 9.6)',
    owner: 'integrator',
    steps: [
      pressStep('starter-runaway', 'Press "Runaway star"'),
      pressStep('play', 'Press Play'),
      pressStep('view-diff', 'Show Difference'),
      pressStep('view-two', 'Show Two dates'),
      pressStep('view-flip', 'Back to Flip'),
      keyStep('Space', 'Space pauses'),
      keyStep('ArrowRight', 'Right arrow steps'),
      pressStep('measure', 'Press Measure'),
      pressStep('zoom-out', 'Zoom the sky out'),
      pressStep('zoom-out', 'Zoom the sky out again'),
      {
        name: 'Search "سهيل" and go there',
        async run(page) {
          await page.keyboard.press('/');
          await page.keyboard.type('سهيل');
          await page
            .locator(`${guide('search-results')} button`)
            .first()
            .waitFor();
          await page.keyboard.press('Enter');
          await page.locator(guide('place-card')).waitFor();
        },
      },
      keyStep('Escape', 'Escape closes the place card'),
    ],
  },
  {
    name: 'Measure and the picture tools',
    owner: 'integrator',
    steps: [
      pressStep('starter-runaway', 'Press "Runaway star"'),
      pressStep('measure', 'Press Measure'),
      pressStep('all-numbers', 'Show all the numbers'),
      pressStep('tools-button', 'Open the picture tools'),
      pressStep('tools-tab-clean', 'Clean up tab'),
      pressStep('tools-tab-find', 'Find changes tab'),
      pressStep('tools-tab-layers', 'Layers tab'),
      pressStep('view-stack', 'Stack view'),
      keyStep('Escape', 'Escape closes the tools'),
      keyStep('Escape', 'Escape closes Measure'),
    ],
  },
  {
    name: 'Menus, dialogs and the sky map',
    owner: 'integrator',
    steps: [
      ownWay,
      pressStep('places-button', 'Open Places'),
      keyStep('Escape', 'Escape closes Places'),
      pressStep('guide-button', 'Open Guide'),
      keyStep('Escape', 'Escape closes Guide'),
      pressStep('share-button', 'Open Share'),
      keyStep('Escape', 'Escape closes Share'),
      pressStep('about-button', 'Open About'),
      keyStep('Escape', 'Escape closes About'),
      pressStep('sky-map-button', 'Open the sky map chooser'),
      pressStep('sky-map-wise-w1', 'Choose AllWISE 3.4 µm'),
      pressStep('grid-button', 'Coordinate grid on'),
      pressStep('zoom-in', 'Zoom the sky in'),
    ],
  },
  {
    name: 'A click on the sky asks first (FRM-3)',
    owner: 'integrator',
    steps: [
      ownWay,
      {
        name: 'Click empty sky',
        async run(page, size) {
          await page.mouse.click(Math.round(size.width * 0.3), Math.round(size.height * 0.3));
          await page.locator(guide('sky-click')).waitFor();
        },
      },
      {
        name: 'Press "Move the frame here"',
        run: (page) => press(page, 'move-frame-here'),
      },
    ],
  },
  {
    name: 'A spot with no pictures (FRM-11)',
    owner: 'integrator',
    path: '/?ra=10&dec=20',
    steps: [ownWay, pressStep('measure', 'Press Measure')],
  },
  {
    name: 'Embed mode (GEN-3)',
    owner: 'integrator',
    path: '/?embed=1&target=barnard',
    scrolls: true,
    steps: [pressStep('measure', 'Press Measure')],
  },
];
