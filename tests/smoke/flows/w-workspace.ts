/**
 * The workspace's flows (SPEC 10 O-V1 to O-V4): drop a frame from the tray, change its type,
 * compare and link frames, and save and restore the workspace by link. All on Barnard's Star's
 * shipped exposures (the smoke test runs with the live service off). Owner: integrator.
 */
import { guide, openPage, press, pressStep, settle, type Flow, type Step } from '../smoke.ts';

/** Fails unless `fn` is true in the page within a few seconds. */
function expectStep(name: string, fn: string, timeout = 10_000): Step {
  return {
    name,
    async run(page) {
      await page.waitForFunction(fn, undefined, { timeout });
    },
  };
}

const frame = (id: string) => `.wf[data-frame="${id}"]`;
/** The workspace module, which index.ts puts on `window` in dev. */
const WS = `(window.__ws)`;
/** A frame's date (MJD) now. */
const mjd = (id: string) => `${WS}.frameById('${id}')?.groups[${WS}.frameById('${id}').epoch]?.mjd`;
const MAIN_MJD = `window.sima.S.groups[window.sima.S.epoch]?.mjd`;
/**
 * True when frame `id` shows the date of its own nearest to `mjd`. Each detector has its own
 * exposures (taken minutes apart, and not every detector at every visit), so a linked frame
 * shows its nearest date, not the same instant.
 */
const nearest = (id: string, at: string) =>
  `((f, t) => f.groups.length > 0 && f.groups.every((g) => Math.abs(g.mjd - t) >= Math.abs(f.groups[f.epoch].mjd - t)))(${WS}.frameById('${id}'), ${at})`;

const start: Step[] = [
  pressStep('welcome-own', 'Close the welcome card'),
  {
    name: 'Pause the main frame',
    async run(page) {
      await page.waitForFunction(`window.sima.S.playing`);
      await page.keyboard.press('Space');
      await page.waitForFunction(`!window.sima.S.playing`);
    },
  },
];

/** Drags a tool from the tray onto an empty part of the sky. */
function dropStep(tool: string): Step {
  return {
    name: `Drag ${tool} from the tray onto the sky`,
    async run(page, size) {
      await press(page, 'workspace-button');
      // The tray takes its place next to its button and fades in: wait until the tool is still.
      const tile = page.locator(guide(`tool-${tool}`));
      let box = await tile.boundingBox();
      for (let i = 0; i < 40; i++) {
        await settle(page);
        const now = await tile.boundingBox();
        if (box && now && now.x === box.x && now.y === box.y) break;
        box = now;
      }
      if (!box) throw new Error('no tool in the tray');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      // The middle of the sky is Barnard's Star, whose exposures are shipped (the live service
      // is off in the smoke test); the main frame sits on the right, the bar at the bottom.
      await page.mouse.move(size.width / 2, size.height / 2, { steps: 10 });
      await page.mouse.up();
      await page.waitForSelector(`${frame('f1')}[data-source="real"]`, { timeout: 20_000 });
    },
  };
}

/** Opens a frame's "…" menu and presses one item in it. */
function menuStep(id: string, item: string, label: string): Step {
  return {
    name: label,
    async run(page) {
      await page.locator(`${frame(id)} ${guide('wf-menu')}`).click();
      await page.locator(`#wf-menu ${guide(item)}`).click();
      await page.keyboard.press('Escape'); // the menu stays open for more choices
    },
  };
}

export const flows: Flow[] = [
  {
    name: 'Workspace: drop, type, compare and link (integrator)',
    owner: 'integrator',
    path: '/?target=barnard',
    steps: [
      ...start,
      dropStep('blink'),
      expectStep(
        'The frame shows real pictures with source, release, date and wavelength (H2)',
        `document.querySelector('${frame('f1')} ${guide('wf-exif')}')?.textContent?.startsWith('Real SPHEREx data') &&
         /µm/.test(document.querySelector('${frame('f1')} ${guide('wf-exif')}').textContent)`,
      ),
      menuStep('f1', 'wf-type-spectrum', 'Change the type to Spectrum'),
      expectStep(
        'Spectrum without fetching again',
        `document.querySelector('${frame('f1')}')?.dataset.type === 'spectrum' &&
         document.querySelector('${frame('f1')}')?.dataset.source === 'real'`,
      ),
      menuStep('f1', 'wf-type-blink', 'Change the type back to Blink'),
      {
        name: 'Compare: another detector',
        async run(page) {
          await page.locator(`${frame('f1')} ${guide('wf-compare')}`).click();
          await page.locator(`#wf-menu ${guide('compare-det')}`).click();
          await page.waitForSelector(`${frame('f2')}[data-source="real"]`, { timeout: 20_000 });
        },
      },
      expectStep(
        'The two frames are linked by time and differ in detector',
        `${WS}.frameById('f1').s.link && ${WS}.frameById('f1').s.link === ${WS}.frameById('f2').s.link &&
         ${WS}.frameById('f1').s.det !== ${WS}.frameById('f2').s.det`,
      ),
      {
        name: 'Stepping one frame steps the other',
        async run(page) {
          const before = await page.evaluate(mjd('f1'));
          await page.locator(`${frame('f1')} ${guide('wf-next')}`).click();
          await page.waitForFunction(`${mjd('f1')} !== ${before} && ${nearest('f2', mjd('f1'))}`);
        },
      },
      menuStep('f1', 'wf-link-main', 'Link with the main frame'),
      expectStep('Both frames take the main frame’s date', `${nearest('f1', MAIN_MJD)} && ${nearest('f2', MAIN_MJD)}`),
      pressStep('next', 'The bar steps the main frame'),
      expectStep('The linked frames follow the bar', `${nearest('f1', MAIN_MJD)} && ${nearest('f2', MAIN_MJD)}`),
      {
        name: 'Close a frame',
        async run(page) {
          await page.locator(`${frame('f2')} ${guide('wf-close')}`).click();
          await page.waitForFunction(`!document.querySelector('${frame('f2')}')`);
        },
      },
    ],
  },
  {
    name: 'Workspace: save and restore by link (integrator)',
    owner: 'integrator',
    path: '/?target=barnard',
    steps: [
      ...start,
      dropStep('two'),
      {
        name: 'Share gives a link with the workspace in it; it opens the same frames',
        async run(page) {
          await press(page, 'share-button');
          await page.waitForFunction(
            () => (document.querySelector<HTMLInputElement>('[data-guide="share-link"]')?.value ?? '').includes('#w='),
          );
          const link = await page.inputValue(guide('share-link'));
          await page.keyboard.press('Escape');
          await openPage(page, link);
          await page.waitForSelector(`${frame('f1')}[data-type="two"][data-source="real"]`, { timeout: 20_000 });
          // The link was read once: the address no longer carries it.
          await page.waitForFunction(() => !location.hash.includes('w='));
        },
      },
      {
        name: 'A damaged link opens the usual view with a plain message',
        async run(page) {
          const url = `${page.url().replace(/#.*$/, '')}#w=damaged!!`;
          await page.goto('about:blank'); // a hash change alone would not load the page again
          await openPage(page, url);
          await page.waitForFunction(() => /usual view opened instead/.test(document.body.innerText));
          if (await page.locator('.wf').count()) throw new Error('frames opened from a damaged link');
        },
      },
    ],
  },
];
