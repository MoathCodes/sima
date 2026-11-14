/**
 * Lane C's flows: the sky map, the patch on it, the click card, zoom and the map's tools
 * (SKY-1 to 9, FRM-1 to 4). Owner: lane C.
 *
 * The sky writes its view on `#sky` as `data-view="ra dec fov"` (degrees) and the patch box as
 * `data-patch="x y side"` (CSS pixels), so the steps can check what moved and what did not.
 */
import { guide, keyStep, pressStep, type Flow, type Step } from '../smoke.ts';
import type { Page } from 'playwright-core';

const ownWay = pressStep('welcome-own', 'Close the welcome card');

async function viewOf(page: Page): Promise<number[]> {
  const v = await page.locator('#sky').getAttribute('data-view');
  return (v ?? '').split(' ').map(Number);
}

async function patchOf(page: Page): Promise<number[] | null> {
  const v = await page.locator('#sky').getAttribute('data-patch');
  return v ? v.split(' ').map(Number) : null;
}

/** Waits until the sky's view has not changed for `frames` drawn frames in a row (20 s at most). */
async function stillFor(page: Page, frames: number): Promise<void> {
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    const still = await page.evaluate(
      (frames) =>
        new Promise<boolean>((done) => {
          const view = () => document.querySelector('#sky')?.getAttribute('data-view');
          const first = view();
          let n = 0;
          const next = () => {
            if (view() !== first) done(false);
            else if (++n >= frames) done(true);
            else requestAnimationFrame(next);
          };
          requestAnimationFrame(next);
        }),
      frames,
    );
    if (still) return;
  }
  throw new Error(`the sky kept moving for 20 s`);
}

function same(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x, i) => Math.abs(x - (b[i] ?? NaN)) < 1e-4);
}

const skyReady: Step = {
  name: 'The sky map starts; the note says what it is (SKY-6, H1)',
  async run(page) {
    await page.waitForFunction(
      () => {
        const note = document.querySelector('#sky-note')?.textContent ?? '';
        return (
          note.includes('Average of all dates: moving objects are blurred or shifted here') &&
          note.includes('µm') &&
          !!document.querySelector('#sky')?.getAttribute('data-view')
        );
      },
      undefined,
      { timeout: 20000 },
    );
  },
};

export const flows: Flow[] = [
  {
    name: 'Sky map, patch and click card (C)',
    owner: 'C',
    steps: [
      ownWay,
      skyReady,
      {
        name: 'The wheel zooms the sky toward the pointer (SKY-3)',
        async run(page, size) {
          const before = await viewOf(page);
          await page.mouse.move(size.width * 0.33, size.height * 0.55);
          await page.mouse.wheel(0, -240);
          await page.waitForFunction(
            (fov) =>
              Number(document.querySelector('#sky')?.getAttribute('data-view')?.split(' ')[2]) <
              fov * 0.8,
            before[2] ?? 0,
          );
        },
      },
      {
        name: 'A click on empty sky only offers "Move the frame here" (FRM-3)',
        async run(page, size) {
          // Let the zoom finish first. It eases a step each drawn frame, and on a busy machine a
          // frame can take longer than any fixed wait, so wait for frames, not time.
          await stillFor(page, 8);
          const before = await viewOf(page);
          await page.mouse.click(size.width * 0.3, size.height * 0.62);
          await page.locator(guide('move-frame-here')).waitFor({ state: 'visible' });
          const after = await viewOf(page);
          if (!same(before, after))
            throw new Error(`the sky moved on a click: ${before.join(' ')} → ${after.join(' ')}`);
        },
      },
      keyStep('Escape', 'Escape closes the click card'),
      {
        name: 'A click by the bottom-right corner puts the card clear of the bar (O-I9)',
        async run(page, size) {
          // At 1366×768 this is (1200, 700): every spot beside it touches the bar or the frame.
          await page.mouse.click(size.width - 166, size.height - 68);
          await page.locator(guide('move-frame-here')).waitFor({ state: 'visible' });
        },
      },
      keyStep('Escape', 'Escape closes it again'),
      {
        name: 'The patch is grabbed from inside and dropped; the sky stays still (FRM-2)',
        async run(page) {
          const box = await patchOf(page);
          if (!box) throw new Error('no patch on the sky');
          const [x = 0, y = 0, side = 0] = box;
          const before = await viewOf(page);
          await page.mouse.move(x + side * 0.3, y + side * 0.7);
          await page.mouse.down();
          for (let i = 1; i <= 8; i++)
            await page.mouse.move(x + side * 0.3 - i * 25, y + side * 0.7 + i * 8);
          if (!same(before, await viewOf(page))) throw new Error('the sky moved while dragging');
          await page.mouse.up();
          await page.waitForTimeout(300);
          const after = await patchOf(page);
          if (!after || Math.abs((after[0] ?? 0) - x) < 100)
            throw new Error('the patch did not move');
        },
      },
      pressStep('zoom-out', 'Zoom the sky out (rail)'),
      pressStep('zoom-out', 'Zoom out again'),
      pressStep('grid-button', 'Coordinate grid on (SKY-5)'),
      pressStep('grid-button', 'Coordinate grid off'),
    ],
  },
  {
    name: 'Sky map chooser and wavelength (C)',
    owner: 'C',
    steps: [
      ownWay,
      skyReady,
      pressStep('sky-map-button', 'Open the sky map chooser'),
      pressStep('sky-map-wise-w2', 'AllWISE 4.6 µm (SKY-4)'),
      {
        name: 'The note names AllWISE 4.6 µm',
        async run(page) {
          await page.waitForFunction(() =>
            document.querySelector('#sky-note')?.textContent?.includes('AllWISE 4.6 µm'),
          );
        },
      },
      {
        name: 'Back to SPHEREx',
        async run(page) {
          if (!(await page.locator(guide('sky-map-spherex')).isVisible())) {
            await page.locator(guide('sky-map-button')).click();
          }
          await page.locator(guide('sky-map-spherex')).click();
          await page.waitForFunction(() =>
            document.querySelector('#sky-note')?.textContent?.includes('SPHEREx'),
          );
        },
      },
      {
        name: 'A lost drawing surface is said in the note (SKY-9)',
        async run(page) {
          await page.evaluate(() => {
            for (const c of document.querySelectorAll('#sky canvas')) {
              (c as HTMLCanvasElement)
                .getContext('webgl2')
                ?.getExtension('WEBGL_lose_context')
                ?.loseContext();
            }
          });
          await page.waitForFunction(() =>
            document.querySelector('#sky-note')?.textContent?.includes('Reload the page'),
          );
        },
      },
    ],
  },
];
