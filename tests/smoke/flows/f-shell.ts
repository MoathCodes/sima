/**
 * Lane F's flows: page-wide keys, the Escape order, search with the keyboard, the Share round
 * trip, a link with values it does not understand, embed mode inside an iframe, and moving,
 * sizing and hiding the frame. Owner: lane F.
 *
 * Steps check what they did and throw when the page did something else; the runner then checks
 * console errors, page scroll and overlapping cards after each one (smoke.ts).
 */
import type { Page } from 'playwright-core';
import { guide, keyStep, openPage, press, pressStep, settle, type Flow, type Step } from '../smoke.ts';

const ownWay = pressStep('welcome-own', 'Close the welcome card');

/** A field of the frame's state (dev builds expose `window.sima.S`). */
function state<T>(page: Page, key: string): Promise<T> {
  return page.evaluate(
    (k) => (window as unknown as { sima: { S: Record<string, unknown> } }).sima.S[k],
    key,
  ) as Promise<T>;
}

/** Throws unless every check holds; `what` says what was expected. */
function expect(ok: boolean, what: string): void {
  if (!ok) throw new Error(`expected ${what}`);
}

/** Is the part with this `data-guide` name on screen? */
function shown(page: Page, name: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    return !!el && !el.hidden && el.checkVisibility();
  }, guide(name));
}

/** Presses Escape and checks that exactly `closes` went away while `stays` are still open. */
function escapeStep(closes: string, stays: string[]): Step {
  return {
    name: `Escape closes ${closes}`,
    async run(page) {
      await page.keyboard.press('Escape');
      await settle(page);
      expect(!(await shown(page, closes)), `${closes} to close`);
      for (const s of stays) expect(await shown(page, s), `${s} to stay open`);
    },
  };
}

export const flows: Flow[] = [
  {
    name: 'Keys and search (GEN-1)',
    owner: 'F',
    steps: [
      ownWay,
      {
        name: '"/" focuses search',
        async run(page) {
          await page.keyboard.press('/');
          const focused = await page.evaluate(() => document.activeElement?.closest('#search'));
          expect(!!focused, 'the search field to have focus');
        },
      },
      {
        name: 'Type "barnard", ↓ ↑ and Enter',
        async run(page) {
          await page.keyboard.type('barnard');
          await page
            .locator(`${guide('search-results')} [role="option"]`)
            .first()
            .waitFor();
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('ArrowUp');
          const active = await page.evaluate(() =>
            document.querySelector('#search input')?.getAttribute('aria-activedescendant'),
          );
          expect(active === 'search-row-0', 'the first row to be chosen again');
          await page.keyboard.press('Enter');
          await settle(page);
          expect(
            (await state<string>(page, 'target')) === 'barnard',
            "Barnard's Star in the frame",
          );
        },
      },
      {
        name: 'Escape in search closes the suggestions first',
        async run(page) {
          await page.keyboard.press('/');
          await page.locator(`${guide('search')} input`).fill(''); // it keeps the last search
          await page.keyboard.type('vega');
          await page
            .locator(`${guide('search-results')} [role="option"]`)
            .first()
            .waitFor();
          await page.keyboard.press('Escape');
          const open = await page.evaluate(() =>
            document.getElementById('search-results')?.matches(':popover-open'),
          );
          expect(!open, 'the suggestions to close');
          await page.keyboard.press('Escape');
        },
      },
      {
        name: '"+" and "−" zoom the sky',
        async run(page) {
          await page.locator('body').click({ position: { x: 5, y: 300 } });
          await page.keyboard.press('Escape'); // the click card, if the click opened one
          await page.keyboard.press('+');
          await page.keyboard.press('-');
        },
      },
    ],
  },
  {
    name: 'Escape order: popover, dialog, tools, Measure (GEN-1)',
    owner: 'F',
    steps: [
      ownWay,
      pressStep('measure', 'Open Measure'),
      pressStep('tools-button', 'Open the picture tools'),
      pressStep('places-button', 'Open the Places menu'),
      {
        name: 'Escape closes the popover only',
        async run(page) {
          await page.keyboard.press('Escape');
          await settle(page);
          const open = await page.evaluate(() =>
            document.getElementById('places-menu')?.matches(':popover-open'),
          );
          expect(!open, 'the Places menu to close');
          for (const s of ['tools-panel', 'measure-panel'])
            expect(await shown(page, s), `${s} to stay open`);
        },
      },
      pressStep('share-button', 'Open Share'),
      {
        name: 'Escape closes the dialog only',
        async run(page) {
          await page.keyboard.press('Escape');
          await settle(page);
          expect(
            !(await page.evaluate(() => !!document.querySelector('dialog[open]'))),
            'Share to close',
          );
          expect(await shown(page, 'tools-panel'), 'the tools to stay open');
        },
      },
      escapeStep('tools-panel', ['measure-panel']),
      escapeStep('measure-panel', []),
    ],
  },
  {
    name: 'Escape always closes an open places list (O-I12)',
    owner: 'F',
    steps: [
      ownWay,
      pressStep('measure', 'Open Measure'),
      {
        name: 'Open the Stars list',
        // At 1366 the chip sits in the "More" menu: press it the way the menu does.
        run: (page) =>
          page.evaluate(() =>
            document.querySelector<HTMLElement>('[data-guide="chip-stars"]')?.click(),
          ),
      },
      {
        name: 'Escape with focus inside the list closes it',
        async run(page) {
          await page
            .locator(`${guide('places-list')} button`)
            .first()
            .focus();
          await page.keyboard.press('Escape');
          await settle(page);
          expect(!(await shown(page, 'places-list')), 'the list to close');
          expect(await shown(page, 'measure-panel'), 'Measure to stay open');
        },
      },
      escapeStep('measure-panel', []),
    ],
  },
  {
    name: 'Share round trip (GEN-2)',
    owner: 'F',
    steps: [
      ownWay,
      pressStep('view-two', 'Show Two dates'),
      {
        name: 'Pause',
        async run(page) {
          // Focus off the view button, so Space reaches the page and not the button.
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
          if (await state<boolean>(page, 'playing')) await page.keyboard.press('Space');
          expect(!(await state<boolean>(page, 'playing')), 'the pictures to stop');
        },
      },
      keyStep('ArrowRight', 'Step to the next date'),
      {
        name: 'Open Share, open its link, and get the same view',
        async run(page) {
          await press(page, 'share-button');
          // What the link was made from: the state while Share is open.
          const before = {
            target: await state<string>(page, 'target'),
            fov: await state<number>(page, 'fov'),
            det: await state<number>(page, 'det'),
            mode: await state<string>(page, 'mode'),
            epoch: await state<number>(page, 'epoch'),
          };
          const link = await page.locator(guide('share-link')).inputValue();
          for (const k of ['target=', 'fov=', 'det=', 'view=', 'date='])
            expect(link.includes(k), `the link to hold ${k}`);
          await press(page, 'share-tab-embed');
          const code = await page.locator(guide('share-embed-code')).inputValue();
          expect(code.startsWith('<iframe') && code.includes('embed=1'), 'an iframe with embed=1');
          await page.keyboard.press('Escape');
          await openPage(page, link);
          // The view and the date apply once the pictures are in.
          await page
            .waitForFunction(
              (want) => {
                const S = (window as unknown as { sima: { S: Record<string, unknown> } }).sima.S;
                return Object.entries(want).every(([k, v]) => S[k] === v);
              },
              before,
              { timeout: 10000 },
            )
            .catch(() => undefined);
          for (const [k, v] of Object.entries(before)) {
            const now = await state<unknown>(page, k);
            expect(now === v, `${k} to be ${String(v)} after the link, not ${String(now)}`);
          }
        },
      },
    ],
  },
  {
    name: 'A link with values it does not understand',
    owner: 'F',
    path: '/?target=barnard&det=D9&foo=1&date=2026-13-40',
    steps: [
      {
        name: 'The note names each one',
        async run(page) {
          const text = (await page.locator('#toasts').textContent()) ?? '';
          for (const k of ['det=D9', 'foo=1', 'date=2026-13-40'])
            expect(text.includes(k), `the note to name ${k}`);
        },
      },
      ownWay,
    ],
  },
  {
    name: 'Embed mode in an iframe (GEN-3)',
    owner: 'F',
    steps: [
      {
        name: 'Put the embed link in an iframe on another page',
        async run(page) {
          const src = new URL('/?embed=1&target=barnard', page.url()).href;
          await page.setContent(
            `<body style="margin:0;overflow:hidden"><iframe src="${src}" style="border:0;width:100vw;height:100vh"></iframe></body>`,
          );
          const frame = page.frameLocator('iframe');
          await frame.locator('html[data-ready]').waitFor({ state: 'attached' });
          const seen = await page.frames()[1]!.evaluate(() => {
            const vis = (id: string) => !!document.getElementById(id)?.checkVisibility();
            return {
              frame: vis('frame'),
              bar: vis('bar'),
              sky: vis('sky'),
              top: vis('top-left'),
              actions: vis('actions'),
              rail: vis('rail'),
              flow: getComputedStyle(document.getElementById('frame')!).position,
            };
          });
          expect(seen.frame && seen.bar, 'the frame and the bar');
          expect(!seen.sky && !seen.top && !seen.actions && !seen.rail, 'no sky and no top row');
          expect(seen.flow === 'static', 'the frame in the page flow');
        },
      },
    ],
  },
  {
    name: 'Move, size, hide and show the frame (FRM-5)',
    owner: 'F',
    steps: [
      ownWay,
      {
        name: 'Drag the frame by its header',
        async run(page) {
          const head = await page.locator('#frame-head').boundingBox();
          expect(!!head, 'the frame header');
          const x = head!.x + 40;
          const y = head!.y + head!.height / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x - 120, y + 10, { steps: 5 });
          await page.mouse.up();
          const after = await page.locator('#frame-head').boundingBox();
          expect(Math.abs(after!.x - (head!.x - 120)) < 2, 'the frame to follow the pointer');
        },
      },
      {
        name: 'Size it from the corner; the box is remembered',
        async run(page) {
          const before = (await page.locator('#frame').boundingBox())!;
          const grip = (await page.locator('#frame-grip').boundingBox())!;
          await page.mouse.move(grip.x + 5, grip.y + 5);
          await page.mouse.down();
          await page.mouse.move(grip.x + 45, grip.y + 5, { steps: 5 });
          await page.mouse.up();
          const after = (await page.locator('#frame').boundingBox())!;
          expect(after.width < before.width - 20, 'a smaller frame');
          const saved = await page.evaluate(() => localStorage.getItem('frame-box'));
          expect(!!saved, 'the box in frame-box');
          await openPage(page);
          const again = (await page.locator('#frame').boundingBox())!;
          expect(Math.abs(again.width - after.width) < 2, 'the same width after a reload');
        },
      },
      ownWay,
      pressStep('frame-hide', 'Hide the frame'),
      pressStep('frame-show', 'Show it again'),
      {
        name: 'Back to the first box (double-click the corner)',
        run: (page) => page.locator('#frame-grip').dblclick(),
      },
    ],
  },
];
