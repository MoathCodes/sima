/**
 * Lane E's flows: Measure (MSR-1, 2, 5, 6, 8) and the picture tools (TLS-1, 2, 4, 5, 7).
 * Owner: lane E. Parts are found by their data-guide names; checks throw with a plain reason.
 */
import type { Page } from 'playwright-core';
import { guide, openPage, press, pressStep, type Flow, type Step, openMeasureStep } from '../smoke.ts';


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

/** The headline and the chart heading name the same detector (MSR-1, review finding 3). */
function sameDetector(want?: number): Step {
  return {
    name: `Headline and chart are about the same detector${want ? ` (D${want})` : ''}`,
    async run(page) {
      await page.waitForFunction(() => !/Measuring/.test(document.querySelector('#measure [data-headline]')?.textContent ?? ''), undefined, { timeout: 15000 });
      const r = await page.evaluate(() => ({
        head: document.querySelector('#measure [data-headline]')?.textContent ?? '',
        chart: document.querySelector('#measure [data-chart-head]')?.textContent ?? '',
      }));
      const d = /\bD(\d)\b/.exec(r.head)?.[1];
      const c = /\bD(\d)\b/.exec(r.chart)?.[1];
      if (!d || d !== c) throw new Error(`headline "${r.head.trim()}" and chart "${r.chart.trim()}" differ`);
      if (want && Number(d) !== want) throw new Error(`Measure opened on D${d}, not D${want}`);
    },
  };
}

/** No label of the six views overlaps another or is cut off (review finding 4). */
const viewsReadable: Step = {
  name: 'The six views are readable',
  async run(page) {
    const bad = await page.evaluate(() => {
      const bs = [...document.querySelectorAll<HTMLElement>('#frame-views [data-mode]')].map((b) => ({ b, r: b.getBoundingClientRect() }));
      const out: string[] = [];
      for (const { b, r } of bs) {
        const s = b.querySelector('span');
        if (s && s.getBoundingClientRect().width > r.width + 0.5) out.push(`${b.dataset.mode} is cut off`);
      }
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i]!.r;
          const c = bs[j]!.r;
          if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) out.push(`${bs[i]!.b.dataset.mode} overlaps ${bs[j]!.b.dataset.mode}`);
        }
      return out;
    });
    if (bad.length) throw new Error(bad.join('; '));
  },
};

export const flows: Flow[] = [
  {
    name: 'Measure opens on the headline’s detector, and follows the detector (lane E)',
    owner: 'E',
    path: '/?target=rw-aur',
    steps: [
      openMeasureStep('Open Measure'),
      sameDetector(6),
      viewsReadable,
      noInnerScroll,
      pressStep('all-numbers', 'Show all the numbers'),
      {
        name: 'Pick D3 on the detector strip',
        async run(page) {
          await page.locator('#detectors [data-det="3"]').first().click();
          await page.locator('#measure [data-chart-head]', { hasText: 'D3' }).waitFor();
        },
      },
      sameDetector(3),
      {
        name: 'The headline offers the strongest detector, one click away',
        async run(page) {
          await page.locator('#measure [data-headline] [data-do="det"][data-det="6"]').click();
          await page.locator('#measure [data-chart-head]', { hasText: 'D6' }).waitFor();
        },
      },
      sameDetector(6),
      noInnerScroll,
      pressStep('all-numbers', 'Show fewer numbers'),
    ],
  },
  {
    name: 'Path states the measured total motion (lane E)',
    owner: 'E',
    path: '/?target=eps-indi-b',
    steps: [
      openMeasureStep('Open Measure'),
      pressStep('all-numbers', 'Show all the numbers'),
      {
        name: 'Path: "Measured: x ± y″/yr" next to the catalogue',
        async run(page) {
          await page.locator('#measure [data-tab="path"]').click();
          const under = page.locator('#measure [data-under]');
          await under.filter({ hasText: /Measured: \d+\.\d\d ± \d+\.\d\d″\/yr/ }).waitFor({ timeout: 15000 });
          await under.filter({ hasText: /Catalogue: \d+\.\d\d″\/yr \(/ }).waitFor();
        },
      },
      noInnerScroll,
      pressStep('all-numbers', 'Show fewer numbers'),
    ],
  },
  {
    name: 'Find changes: a mover shows its path in place; the readout wraps (lane E)',
    owner: 'E',
    steps: [
      openMeasureStep('Open Measure'),
      pressStep('tools-button', 'Open the picture tools'),
      {
        name: 'The Shift-drag box is explained',
        async run(page) {
          await page.locator('[data-guide="box-stats"]', { hasText: 'Shift' }).waitFor();
        },
      },
      {
        name: 'Point at the picture: two lines, nothing cut off (TLS-6)',
        async run(page) {
          const r = (await page.locator('#frame-pic canvas').first().boundingBox())!;
          await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
          const out = page.locator('#pic-tools [data-readout]');
          await out.waitFor();
          const ok = await out.evaluate((el) => el.children.length === 2 && el.scrollWidth <= el.clientWidth + 1 && /pixel \(/.test(el.textContent ?? ''));
          if (!ok) throw new Error(`the readout is cut off or on one line: "${await out.textContent()}"`);
          await page.mouse.move(r.x - 20, r.y - 20);
        },
      },
      pressStep('tools-tab-find', 'Find changes tab'),
      {
        name: 'Open the first mover: its own Path chart and Open in Measure',
        async run(page) {
          const row = page.locator('#tools [data-cand]', { hasText: 'Moved?' }).first();
          await row.waitFor({ timeout: 20000 });
          await row.click();
          await page.locator('#tools [data-detail] .tl-mini:not([hidden]) canvas').waitFor();
          await page.locator('#tools [data-detail]', { hasText: /Measured: \d+\.\d\d ±/ }).waitFor();
          await page.locator('#tools [data-detail] [data-act="measure"]').waitFor();
        },
      },
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
  {
    name: 'Measure: calm, all the numbers, remembered (lane E)',
    owner: 'E',
    steps: [
      openMeasureStep('Open Measure'),
      noInnerScroll,
      pressStep('all-numbers', 'Show all the numbers'),
      noInnerScroll,
      {
        name: 'Reload keeps all the numbers (MSR-2)',
        async run(page) {
          await openPage(page);
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
      openMeasureStep('Open Measure'),
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
      openMeasureStep('Open Measure'),
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
