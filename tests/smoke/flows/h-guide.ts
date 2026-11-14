/**
 * Lane H's flows: the demo of SPEC 9.6 through the tour, the hints, the numbers tour, "Explain
 * the screen", resuming and ending the tour, and the welcome card after a reload in Measure.
 * Owner: lane H.
 */
import type { Page } from 'playwright-core';
import { guide, keyStep, press, pressStep, reloadStep, type Flow, type Step } from '../smoke.ts';

/** Fails unless `fn` (page JavaScript) becomes true within a few seconds. */
function expect(name: string, fn: string, timeout = 10000): Step {
  return {
    name,
    async run(page) {
      await page.waitForFunction(fn, undefined, { timeout, polling: 100 });
    },
  };
}

/** The tour card says this step. */
const onStep = (n: number, of = 8) =>
  expect(
    `The tour is on step ${n} of ${of}`,
    `document.querySelector('#tour .tour-card:not([hidden])')?.textContent?.includes('Step ${n} of ${of}')`,
  );

/** The tour ring sits around the part with this name (GDE-2). */
const ringsPart = (name: string) =>
  expect(
    `The tour rings ${name}`,
    `(() => {
      const ring = document.querySelector('#tour .tour-ring:not([hidden])')?.getBoundingClientRect();
      const el = [...document.querySelectorAll('[data-guide="${name}"]')].find((e) => e.checkVisibility());
      if (!ring || !el) return false;
      const r = el.getBoundingClientRect();
      return Math.abs(ring.left + 4 - r.left) < 2 && Math.abs(ring.top + 4 - r.top) < 2 &&
        Math.abs(ring.width - 8 - r.width) < 2 && Math.abs(ring.height - 8 - r.height) < 2;
    })()`,
  );

/** Taps the middle of the picture, where the shipped target sits. */
async function tapMiddle(page: Page): Promise<void> {
  const box = await page.locator(`${guide('picture')} canvas[data-picture]`).boundingBox();
  if (!box) throw new Error('no picture');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const taskSays = (text: string) =>
  expect(
    `The task line says "${text}"`,
    `document.querySelector('#frame-task')?.textContent?.includes(${JSON.stringify(text)})`,
  );

const skip: Step = {
  name: 'Skip step',
  run: (page) => page.locator('#tour .tour-card [data-skip]').click(),
};

export const flows: Flow[] = [
  {
    name: 'Demo through the tour (SPEC 9.6, H)',
    owner: 'H',
    steps: [
      pressStep('starter-runaway', 'Press "Runaway star"'),
      onStep(1),
      ringsPart('play'),
      expect(
        'Focus is on the tour card, not on Skip step (O-G8)',
        `document.activeElement?.classList.contains('tour-card')`,
      ),
      keyStep('Enter', 'Enter does not skip the step'),
      onStep(1),
      pressStep('play', 'Press Play'),
      expect('The pictures flip', `window.sima.S.playing === true`),
      onStep(2),
      ringsPart('dates'),
      keyStep('ArrowRight', 'Step to the next date'),
      onStep(3),
      pressStep('view-two', 'Two dates'),
      onStep(4),
      pressStep('view-diff', 'Difference shows the white and dark pair'),
      onStep(5),
      ringsPart('picture'),
      expect(
        'The bar stays live in the find step: it is a hole in the dimmer (O-G3)',
        `(document.querySelector('#tour .tour-dim path')?.getAttribute('d')?.match(/M/g)?.length ?? 0) >= 3`,
      ),
      keyStep('Space', 'Space still plays and pauses'),
      { name: 'Tap the runaway', run: tapMiddle },
      expect(
        'The measured motion and its status (MSR-1, H4)',
        `/\\d+\\.\\d\\d″\\/yr/.test(document.querySelector('#frame-task')?.textContent ?? '') &&
         /matches catalogue|differs from catalogue|no catalogue value/.test(document.querySelector('#frame-task')?.textContent ?? '')`,
        20000,
      ),
      taskSays('Rings: catalogue predictions'),
      onStep(6),
      pressStep('measure', 'Press Measure'),
      onStep(7),
      ringsPart('wavelength'),
      {
        name: 'Click the wavelength scale',
        async run(page) {
          const b = await page.locator(guide('wavelength')).boundingBox();
          if (!b) throw new Error('no wavelength scale');
          await page.mouse.click(b.x + b.width * 0.85, b.y + b.height - 22);
        },
      },
      onStep(8),
      pressStep('zoom-out', 'Zoom the sky out to the dots'),
      expect('The tour is done', `document.querySelector('#tour [data-close-tour]') !== null`),
      { name: 'Done', run: (page) => page.locator('#tour [data-close-tour]').click() },
      pressStep('zoom-out', 'Zoom out again'),
      {
        name: 'Search "سهيل" and fly there',
        async run(page) {
          await page.keyboard.press('/');
          await page.keyboard.type('سهيل');
          await page.locator(`${guide('search-results')} button`).first().waitFor();
          await page.keyboard.press('Enter');
          await page.locator(guide('place-card')).waitFor();
        },
      },
    ],
  },
  {
    name: 'Hints: each gives a little more, Show me rings and the user taps (GDE-5, O-G2)',
    owner: 'H',
    path: '/?target=barnard',
    steps: [
      pressStep('welcome-own', 'Close the welcome card'),
      taskSays('Runaway star'),
      pressStep('hint', 'Hint'),
      taskSays('Most dots stay put'),
      pressStep('hint', 'Another hint'),
      taskSays('Press Difference'),
      pressStep('hint', 'Look closer'),
      taskSays('dashed circle'),
      pressStep('hint', 'Show me'),
      taskSays('Now tap it yourself'),
      expect('Show me did not mark it found', `!document.querySelector('#frame-task .task.done')`),
      { name: 'Tap the star', run: tapMiddle },
      expect('Found', `!!document.querySelector('#frame-task .task.done')`),
    ],
  },
  {
    name: 'The task line follows the patch on screen',
    owner: 'H',
    path: '/?target=r-dra',
    steps: [
      pressStep('welcome-own', 'Close the welcome card'),
      taskSays('The breathing giant'),
      expect('No mover words on a star that changes brightness', `!document.querySelector('#frame-task')?.textContent?.includes('jumps')`),
      {
        name: 'Open the hidden planet practice from Places',
        async run(page) {
          await press(page, 'places-button');
          await page.locator('#places-menu button', { hasText: 'The hidden planet' }).click();
        },
      },
      expect(
        'Practice says Simulated first, dashed (H3)',
        `document.querySelector('#frame-task .task.sim .task-title')?.textContent?.startsWith('Simulated')`,
      ),
    ],
  },
  {
    name: 'Tour the numbers (GDE-7)',
    owner: 'H',
    steps: [
      pressStep('welcome-own', 'Close the welcome card'),
      pressStep('guide-button', 'Open Guide'),
      pressStep('guide-numbers', 'Tour the numbers'),
      onStep(1, 3),
      {
        name: 'Point at a dotted word in Measure',
        async run(page) {
          await page.locator('#measure .term').first().hover();
        },
      },
      onStep(2, 3),
      pressStep('all-numbers', 'Show all the numbers'),
      onStep(3, 3),
      ringsPart('detectors'),
      { name: 'End tour', run: (page) => page.locator('#tour .tour-card [data-end]').click() },
    ],
  },
  {
    name: 'Explain the screen (GDE-6)',
    owner: 'H',
    steps: [
      pressStep('welcome-own', 'Close the welcome card'),
      pressStep('guide-button', 'Open Guide'),
      pressStep('guide-explain', 'Explain the screen'),
      {
        name: 'Point at Play',
        async run(page) {
          const b = await page.locator(guide('play')).boundingBox();
          if (!b) throw new Error('no Play');
          await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
          await page.locator('#explain .explain-card:not([hidden])', { hasText: 'Play' }).waitFor();
        },
      },
      keyStep('Escape', 'Escape closes it'),
      expect('Closed', `document.getElementById('explain').hidden`),
    ],
  },
  {
    name: 'Resume after reload; End tour is final (GDE-3, O-G9)',
    owner: 'H',
    steps: [
      pressStep('starter-runaway', 'Press "Runaway star"'),
      onStep(1),
      skip,
      onStep(2),
      reloadStep(),
      expect('Pick up the tour?', `!!document.querySelector('${guide('tour-resume')}')`),
      pressStep('tour-resume', 'Pick up the tour'),
      onStep(2),
      { name: 'End tour', run: (page) => page.locator('#tour .tour-card [data-end]').click() },
      reloadStep(),
      expect(
        'The welcome card does not ask again',
        `!!document.querySelector('${guide('starter-runaway')}') && !document.querySelector('${guide('tour-resume')}')`,
      ),
    ],
  },
  {
    name: 'Skipping "Press Measure" opens Measure (O-G6)',
    owner: 'H',
    steps: [
      pressStep('starter-runaway', 'Press "Runaway star"'),
      onStep(1),
      skip,
      onStep(2),
      skip,
      onStep(3),
      skip,
      onStep(4),
      skip,
      onStep(5),
      skip,
      onStep(6),
      skip,
      onStep(7),
      expect('Measure is open', `!document.getElementById('measure').hidden`),
    ],
  },
  {
    name: 'Back in Measure after a reload: Escape closes Measure, not a welcome card',
    owner: 'H',
    path: '/?target=barnard',
    steps: [
      pressStep('welcome-own', 'Close the welcome card'),
      pressStep('measure', 'Press Measure'),
      reloadStep(),
      expect('Measure is open', `!document.getElementById('measure').hidden`),
      expect('No welcome card', `document.getElementById('welcome').hidden`),
      keyStep('Escape', 'Escape'),
      expect('Measure closed', `document.getElementById('measure').hidden`),
    ],
  },
];
