/**
 * Lane D's flows: the frame card and the bar on real shipped data (FRM-5 to FRM-12, BAR-1 to
 * BAR-6), and a spot with no pictures (FRM-11). Owner: lane D.
 */
import { guide, keyStep, pressStep, type Flow, type Step, openMeasureStep } from '../smoke.ts';


/** Fails unless `fn` is true in the page within a few seconds. */
function expectStep(name: string, fn: string): Step {
  return {
    name,
    async run(page) {
      await page.waitForFunction(fn, undefined, { timeout: 8000 });
    },
  };
}

const playing = expectStep(
  'Real pictures play (FRM-10: the data line names real SPHEREx data)',
  `document.querySelector('#frame-exif')?.textContent?.startsWith('Real SPHEREx data') &&
   document.querySelector('${guide('play')}')?.getAttribute('aria-label') === 'Pause'`,
);

export const flows: Flow[] = [
  {
    name: 'Frame and bar on Barnard’s Star (D)',
    owner: 'D',
    path: '/?target=barnard',
    steps: [
      playing,
      keyStep('Space', 'Space pauses (BAR-1)'),
      expectStep(
        'Paused',
        `document.querySelector('${guide('play')}')?.getAttribute('aria-label') === 'Play'`,
      ),
      keyStep('ArrowRight', 'Right arrow steps'),
      keyStep('ArrowLeft', 'Left arrow steps back'),
      pressStep('view-two', 'Two dates'),
      expectStep(
        'Two dates says red and cyan',
        `document.querySelector('.pic-badge')?.textContent?.includes('Cyan')`,
      ),
      pressStep('view-diff', 'Difference'),
      pressStep('view-flip', 'Flip'),
      pressStep('fov-larger', 'Larger field (FRM-6)'),
      expectStep('Field is 12′', `document.querySelector('.frame-fov')?.textContent === '12′'`),
      {
        name: 'Wheel over the picture makes the field smaller',
        async run(page) {
          const box = await page.locator(guide('picture')).boundingBox();
          if (!box) throw new Error('no picture');
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, -120);
          await page.waitForFunction(
            () => document.querySelector('.frame-fov')?.textContent === '6′',
          );
        },
      },
      {
        name: 'Drag inside the picture pans the field (FRM-12)',
        async run(page) {
          const box = await page.locator(guide('picture')).boundingBox();
          if (!box) throw new Error('no picture');
          const before = await page.evaluate(
            () => (window as unknown as { sima: { S: { ra: number } } }).sima.S.ra,
          );
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 6 });
          await page.mouse.up();
          await page.waitForFunction(
            (b) => (window as unknown as { sima: { S: { ra: number } } }).sima.S.ra > b,
            before,
          );
        },
      },
      {
        name: 'The wavelength scale picks a detector (BAR-4)',
        async run(page) {
          const box = await page.locator('[data-strip]').boundingBox();
          if (!box) throw new Error('no wavelength scale');
          await page.mouse.click(box.x + box.width * 0.92, box.y + box.height / 2);
          await page.waitForFunction(() => document.querySelector('.wl-band.on:nth-of-type(6)'));
        },
      },
      {
        name: 'Loop style and speed (BAR-3)',
        async run(page) {
          await page.locator('[data-loop]').click();
          await page.locator('[data-speed]').click();
          await page.waitForFunction(
            () => document.querySelector('[data-speed]')?.textContent === '1.5×',
          );
        },
      },
      {
        name: 'A press on the date scale shows that date (BAR-2)',
        async run(page) {
          const box = await page.locator(guide('dates')).boundingBox();
          if (!box) throw new Error('no date scale');
          await page.mouse.click(box.x + 4, box.y + 32);
        },
      },
      openMeasureStep('Measure: six views, visit dots, counter'),
      expectStep(
        'The counter shows',
        `/\\d+ \\/ \\d+/.test(document.querySelector('[data-count]')?.textContent ?? '')`,
      ),
      pressStep('view-swipe', 'Swipe'),
      pressStep('view-stack', 'Stack'),
      pressStep('view-trail', 'Trail'),
      pressStep('measure', 'Close Measure'),
      pressStep('frame-hide', 'Hide the frame (FRM-5)'),
    ],
  },
  {
    name: 'Each shipped target plays (D)',
    owner: 'D',
    path: '/?target=r-dra',
    steps: [
      playing,
      ...['eps-indi-b', 'wise-0855', 'rw-aur'].map((key): Step => ({
        name: `Open ${key}`,
        async run(page) {
          await page.evaluate(
            (k) =>
              (
                window as unknown as { sima: { bus: { emit: (t: string, m: unknown) => void } } }
              ).sima.bus.emit('aim', {
                ra: 10,
                dec: 10,
                target: k,
              }),
            key,
          );
          await page.waitForFunction(
            (k) =>
              (window as unknown as { sima: { S: { target: string; groups: unknown[] } } }).sima.S
                .target === k &&
              (window as unknown as { sima: { S: { groups: unknown[] } } }).sima.S.groups.length >
                1,
            key,
          );
        },
      })),
    ],
  },
  {
    name: 'No pictures here, without the live service (D, FRM-11)',
    owner: 'D',
    path: '/?ra=10&dec=20',
    steps: [
      expectStep(
        'The frame says why and lists the five targets',
        `document.querySelectorAll('.cover-targets [data-target]').length === 5 &&
         !!document.querySelector('.cover-why')?.textContent`,
      ),
      expectStep(
        'The bar waits (BAR-6)',
        `document.querySelector('${guide('play')}')?.disabled === true`,
      ),
      {
        name: 'Open the labelled practice',
        async run(page) {
          await page.locator('[data-practice]').click();
          await page.waitForFunction(() =>
            document.querySelector('.frame-source')?.textContent?.includes('Simulated'),
          );
        },
      },
      {
        name: 'Open Barnard’s Star from the list',
        run: async (page) => {
          await page.evaluate(() =>
            (
              window as unknown as { sima: { bus: { emit: (t: string, m: unknown) => void } } }
            ).sima.bus.emit('aim', {
              ra: 10,
              dec: 20,
            }),
          );
          await page.locator('.cover-targets [data-target="barnard"]').click();
          await page.waitForFunction(() =>
            document.querySelector('#frame-exif')?.textContent?.startsWith('Real SPHEREx'),
          );
        },
      },
    ],
  },
];
