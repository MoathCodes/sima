/**
 * Lane E's flows: Measure (MSR-1, 2, 5, 6, 8) and the picture tools (TLS-1, 2, 4, 5, 7).
 * Owner: lane E. Parts are found by their data-guide names; checks throw with a plain reason.
 */
import type { Page } from 'playwright-core';
import { guide, press, pressStep, type Flow, type Step } from '../smoke.ts';

const ownWay = pressStep('welcome-own', 'Close the welcome card');

/** MSR-8: Measure fits with no inner scroll. */
const noInnerScroll: Step = {
  name: 'Measure has no inner scroll (MSR-8)',
  async run(page) {
    const r = await page.evaluate(() => {
      const m = document.getElementById('measure')!;
      return { sh: m.scrollHeight, ch: m.clientHeight, sw: m.scrollWidth, cw: m.clientWidth };
    });
    if (r.sh > r.ch + 1 || r.sw > r.cw + 1) throw new Error(`Measure scrolls inside: ${JSON.stringify(r)}`);
  },
};

async function text(page: Page, selector: string): Promise<string> {
  return (await page.locator(selector).first().textContent()) ?? '';
}

export const flows: Flow[] = [
  {
    name: 'Measure: calm, all the numbers, remembered (lane E)',
    owner: 'E',
    steps: [
      ownWay,
      pressStep('measure', 'Press Measure'),
      noInnerScroll,
      pressStep('all-numbers', 'Show all the numbers'),
      noInnerScroll,
      {
        name: 'Reload keeps all the numbers (MSR-2)',
        async run(page) {
          await page.reload();
          await page.waitForSelector('html[data-ready]');
          await page.locator(`${guide('all-numbers')}[aria-pressed="true"]`).waitFor({ timeout: 5000 });
        },
      },
      noInnerScroll,
      pressStep('all-numbers', 'Show fewer numbers'),
      {
        name: 'Escape closes Measure',
        async run(page) {
          await page.keyboard.press('Escape');
          await page.locator('#measure').waitFor({ state: 'hidden' });
        },
      },
    ],
  },
  {
    name: 'Measure with no pictures says so (MSR-6, lane E)',
    owner: 'E',
    path: '/?ra=10&dec=20',
    steps: [
      ownWay,
      pressStep('measure', 'Press Measure'),
      {
        name: '"Nothing to measure here"',
        async run(page) {
          const t = await text(page, '#measure h2');
          if (t !== 'Nothing to measure here') throw new Error(`Measure says "${t}"`);
        },
      },
      noInnerScroll,
    ],
  },
  {
    name: 'Picture tools: tabs, Original, threshold, reset (lane E)',
    owner: 'E',
    steps: [
      ownWay,
      pressStep('measure', 'Press Measure'),
      pressStep('tools-button', 'Open the picture tools'),
      {
        name: 'Stretch Log, then Reset all',
        async run(page) {
          await page.locator('#tools [data-stretch="log"]').click();
          await page.locator('#tools [data-stretch="log"][aria-pressed="true"]').waitFor();
          await page.locator('#tools [data-reset]').click();
          await page.locator('#tools [data-stretch="asinh"][aria-pressed="true"]').waitFor();
        },
      },
      pressStep('tools-tab-clean', 'Clean up tab'),
      {
        name: 'Hold \\ for Original (TLS-2)',
        async run(page) {
          await page.keyboard.down('\\');
          await page.locator(`${guide('original')}[aria-pressed="true"]`).waitFor();
          await page.locator('#tools [data-paused]:not([hidden])').waitFor();
          await page.keyboard.up('\\');
          await page.locator(`${guide('original')}[aria-pressed="false"]`).waitFor();
        },
      },
      pressStep('tools-tab-find', 'Find changes tab'),
      {
        name: 'The status line is in view (O-T3)',
        async run(page) {
          const s = page.locator('#tools [data-status]');
          await s.waitFor();
          const box = await s.boundingBox();
          const panel = await page.locator('#tools').boundingBox();
          if (!box || !panel || box.y + box.height > panel.y + panel.height)
            throw new Error('the status line is outside the panel');
        },
      },
      pressStep('tools-tab-layers', 'Layers tab'),
      pressStep('tools-tab-picture', 'Picture tab'),
      {
        name: 'Escape closes the tools, then Measure',
        async run(page) {
          await page.keyboard.press('Escape');
          await page.locator('#tools').waitFor({ state: 'hidden' });
          await press(page, 'measure');
        },
      },
    ],
  },
];
