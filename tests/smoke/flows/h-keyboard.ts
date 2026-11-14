/**
 * Lane H's keyboard flows (GDE-1): the tour's find step and the hints done without a mouse. The
 * picture takes focus, the arrow keys move a crosshair, Enter picks, and a live region says
 * where the crosshair is. Owner: lane H.
 */
import type { Page } from 'playwright-core';
import { guide, keyStep, type Flow, type Step } from '../smoke.ts';

/** Fails unless `fn` (page JavaScript) becomes true within a few seconds. */
function expect(name: string, fn: string, timeout = 10000): Step {
  return {
    name,
    async run(page) {
      await page.waitForFunction(fn, undefined, { timeout, polling: 100 });
    },
  };
}

const onStep = (n: number) =>
  expect(
    `The tour is on step ${n} of 8`,
    `document.querySelector('#tour .tour-card:not([hidden])')?.textContent?.includes('Step ${n} of 8')`,
  );

/** Focuses a part by its `data-guide` name and presses Enter on it, as after tabbing to it. */
function enterOn(name: string, label: string): Step {
  return {
    name: label,
    async run(page) {
      await page.locator(guide(name)).first().focus();
      await page.keyboard.press('Enter');
    },
  };
}

const PICTURE = `document.activeElement?.matches('canvas[data-picture][data-keypick]')`;

/** Empties the live region, so the next read is what the next key says. */
const hush = (page: Page) =>
  page.evaluate(() => {
    const live = document.getElementById('pick-live');
    if (live) live.textContent = '';
  });

/** What the live region says now. */
const said = (page: Page) =>
  page.evaluate(() => document.getElementById('pick-live')?.textContent ?? '');

/** The crosshair, 1-based, as the live region says it (after a key, once the keys rest). */
async function crosshair(page: Page): Promise<{ x: number; y: number; n: number }> {
  await page.waitForFunction(
    () => /^Crosshair \d+ across/.test(document.getElementById('pick-live')?.textContent ?? ''),
    undefined,
    { timeout: 5000, polling: 50 },
  );
  const m = /Crosshair (\d+) across, (\d+) down, of (\d+)/.exec(await said(page));
  if (!m) throw new Error(`the live region says "${await said(page)}"`);
  return { x: Number(m[1]), y: Number(m[2]), n: Number(m[3]) };
}

/** Presses the arrows to move the crosshair by (dx, dy) pixels: Shift for each 5. */
async function move(page: Page, dx: number, dy: number): Promise<void> {
  const go = async (key: string, count: number) => {
    for (let i = 0; i < count; i++) await page.keyboard.press(key);
  };
  const h = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
  const v = dy > 0 ? 'ArrowDown' : 'ArrowUp';
  await go(`Shift+${h}`, Math.floor(Math.abs(dx) / 5));
  await go(h, Math.abs(dx) % 5);
  await go(`Shift+${v}`, Math.floor(Math.abs(dy) / 5));
  await go(v, Math.abs(dy) % 5);
}

/** Moves the crosshair to the middle of the picture, where the shipped target sits. */
const toMiddle: Step = {
  name: 'Arrow keys move the crosshair to the middle',
  async run(page) {
    await hush(page);
    await page.keyboard.press('ArrowRight');
    const at = await crosshair(page);
    const c = Math.round((at.n - 1) / 2) + 1;
    await hush(page);
    await move(page, c - at.x, c - at.y);
    const now = await crosshair(page);
    if (now.x !== c || now.y !== c) throw new Error(`crosshair at ${now.x}, ${now.y}, not ${c}`);
  },
};

/** Moves the crosshair onto the ring by what the live region says after "Show me". */
const toRing: Step = {
  name: 'The live region says where the ring is; follow it',
  async run(page) {
    await hush(page);
    await page.keyboard.press('ArrowRight');
    await crosshair(page);
    const text = await said(page);
    const m = /The ring is (.*)\./.exec(text);
    if (!m && !text.includes('on the ring')) throw new Error(`no ring direction in "${text}"`);
    let dx = 0;
    let dy = 0;
    for (const part of (m?.[1] ?? '').split(' and ')) {
      const p = /(\d+) (left|right|up|down)/.exec(part);
      if (!p) continue;
      const n = Number(p[1]);
      if (p[2] === 'left') dx = -n;
      if (p[2] === 'right') dx = n;
      if (p[2] === 'up') dy = -n;
      if (p[2] === 'down') dy = n;
    }
    await hush(page);
    await move(page, dx, dy);
    await page.waitForFunction(
      () => document.getElementById('pick-live')?.textContent?.includes('It is on the ring'),
      undefined,
      { timeout: 5000, polling: 50 },
    );
  },
};

export const flows: Flow[] = [
  {
    name: 'Keyboard only: the tour to the found runaway (GDE-1)',
    owner: 'H',
    steps: [
      enterOn('starter-runaway', 'Enter on "Runaway star"'),
      onStep(1),
      keyStep('Space', 'Space plays'),
      onStep(2),
      keyStep('ArrowRight', 'Step to the next date'),
      onStep(3),
      enterOn('view-two', 'Enter on Two dates'),
      onStep(4),
      enterOn('view-diff', 'Enter on Difference'),
      onStep(5),
      keyStep('Tab', 'Tab from the step card'),
      expect(
        'Focus is on "Go to the picture"',
        `document.activeElement?.hasAttribute('data-pick-keys')`,
      ),
      keyStep('Enter', 'Go to the picture'),
      expect('The picture has focus', PICTURE),
      expect(
        'The task line says the keys',
        `document.querySelector('#frame-task')?.textContent?.includes('Arrow keys move the crosshair')`,
      ),
      {
        name: 'Space picks under the crosshair instead of playing; it is not the star',
        async run(page) {
          const before = await page.evaluate(() => (window as any).sima.S.playing);
          await page.keyboard.press('Space');
          await page.waitForFunction(
            () => document.querySelector('#frame-task')?.textContent?.includes('Not that one'),
            undefined,
            { timeout: 5000 },
          );
          const after = await page.evaluate(() => (window as any).sima.S.playing);
          if (before !== after) throw new Error('Space played or paused the pictures');
        },
      },
      {
        name: 'The arrows move the crosshair, not the date',
        async run(page) {
          const epoch = await page.evaluate(() => (window as any).sima.S.epoch);
          await hush(page);
          await page.keyboard.press('ArrowLeft');
          await crosshair(page);
          if ((await page.evaluate(() => (window as any).sima.S.epoch)) !== epoch)
            throw new Error('ArrowLeft stepped the date');
        },
      },
      toMiddle,
      keyStep('Enter', 'Enter picks'),
      expect(
        'Found, and said so',
        `!!document.querySelector('#frame-task .task.done') && document.getElementById('pick-live')?.textContent?.startsWith('Found it')`,
      ),
      expect(
        'One measured sentence: how far it moved between the first and last date (GDE-4)',
        `/Measured: from [A-Z] \\(\\w+ \\d{4}\\) to [A-Z] \\(\\w+ \\d{4}\\) it moved \\d+\\.\\d ± \\d+\\.\\d″, about \\d+\\.\\d pixels?\\./.test(document.querySelector('#frame-task')?.textContent ?? '') &&
         document.querySelector('#frame-task')?.textContent?.includes('Rings: catalogue predictions')`,
        20000,
      ),
      onStep(6),
      expect('Focus is back on the step card', `document.activeElement?.classList.contains('tour-card')`),
    ],
  },
  {
    name: 'Keyboard only: Show me says where the ring is, the user picks it (GDE-5)',
    owner: 'H',
    path: '/?target=barnard',
    steps: [
      enterOn('welcome-own', 'Close the welcome card'),
      enterOn('hint', 'Hint'),
      keyStep('Enter', 'Another hint'),
      keyStep('Enter', 'Look closer'),
      keyStep('Enter', 'Show me'),
      expect('Show me did not mark it found', `!document.querySelector('#frame-task .task.done') && document.querySelector('#frame-task')?.textContent?.includes('Now tap it yourself')`),
      keyStep('Tab', 'Tab to the picture'),
      expect('The picture has focus', PICTURE),
      toRing,
      keyStep('Enter', 'Enter picks'),
      expect('Found', `!!document.querySelector('#frame-task .task.done')`),
      {
        name: 'After the find, the arrows step the date again',
        async run(page) {
          const epoch = await page.evaluate(() => (window as any).sima.S.epoch);
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction((e) => (window as any).sima.S.epoch !== e, epoch, {
            timeout: 5000,
          });
        },
      },
    ],
  },
];
