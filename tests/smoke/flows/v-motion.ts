/**
 * O-V6's flows: the motion handle on Measure's Stack view. On WISE 0855−0714: the handle and its
 * readout show at the catalogue motion with the two checks; arrow keys move it to a trial motion;
 * a drag restacks while it moves, with no task over 100 ms; Snap goes back. On Barnard's Star the
 * same handle works on a bright, saturated star. Owner: V.
 */
import type { Page } from 'playwright-core';
import { guide, press, pressStep, type Flow, type Step } from '../smoke.ts';

const ownWay = pressStep('welcome-own', 'Close the welcome card');

const toStack: Step = {
  name: 'Open Measure, then the Stack view',
  async run(page) {
    await press(page, 'measure');
    await page.locator(guide('view-stack')).first().click();
    await page.locator(`${guide('motion-handle')}:not([hidden])`).waitFor({ timeout: 20_000 });
  },
};

async function readout(page: Page): Promise<string> {
  return page.locator(guide('motion-readout')).innerText();
}

function expectReadout(label: string, test: RegExp): Step {
  return {
    name: label,
    async run(page) {
      await page.waitForFunction(
        (re) => new RegExp(re).test(document.getElementById('frame-motion')?.innerText ?? ''),
        test.source,
        { timeout: 20_000 },
      );
    },
  };
}

const keys: Step = {
  name: 'Arrow keys on the handle try a faster motion',
  async run(page) {
    await page.locator(guide('motion-handle')).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    const text = await readout(page);
    if (!/Trial motion/.test(text)) throw new Error(`the readout says "${text}"`);
  },
};

const drag: Step = {
  name: 'Drag the handle: the stack follows, no task over 100 ms',
  async run(page) {
    await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__long.push(e.duration);
      }).observe({ type: 'longtask' });
    });
    const before = Number(await page.locator(guide('motion-readout')).getAttribute('data-count'));
    const box = await page.locator(guide('motion-handle')).boundingBox();
    if (!box) throw new Error('no handle');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(x - 2 * i, y - i);
    await page.mouse.up();
    await page.waitForFunction(
      (n) => Number(document.getElementById('frame-motion')?.dataset.count) >= n + 3,
      before,
      { timeout: 10_000 },
    );
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    if (long.some((d) => d > 100)) throw new Error(`long tasks while dragging: ${long.map(Math.round).join(', ')} ms`);
  },
};

export const flows: Flow[] = [
  {
    name: 'Motion handle on WISE 0855−0714',
    owner: 'V',
    path: '/?target=wise-0855',
    steps: [
      ownWay,
      toStack,
      expectReadout('At the catalogue motion, with both checks', /Catalogue motion[\s\S]*Along[\s\S]*Not shifted[\s\S]*Opposite/),
      expectReadout('It is seen along the motion', /Along\s*1[3-9]\.\d×/),
      keys,
      expectReadout('A trial motion restacks', /Trial motion/),
      drag,
      pressStep('motion-snap', 'Snap to catalogue motion'),
      expectReadout('Back at the catalogue motion', /Catalogue motion 8\.15″\/yr, west/),
    ],
  },
  {
    name: 'Motion handle on Barnard’s Star',
    owner: 'V',
    path: '/?target=barnard',
    steps: [ownWay, toStack, keys, drag, pressStep('motion-snap', 'Snap to catalogue motion')],
  },
];
