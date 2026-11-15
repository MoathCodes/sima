/**
 * O-V7's flows: the sandbox's pretend planet. Opened by searching "planet x", it gives a model
 * verdict against the patch's measured noise, answers a change of distance, draws a tagged
 * pretend mark on the picture, and closes on Escape. About's Planet X section opens it too.
 * Owner: V.
 */
import { guide, keyStep, press, type Flow, type Step } from '../smoke.ts';


const fromSearch: Step = {
  name: 'Search "planet x" and open the sandbox',
  async run(page) {
    await page.locator('.search-input').fill('planet x');
    await page.locator('#search-results button', { hasText: 'Could SPHEREx' }).first().click();
    await page.locator(`#sandbox:not([hidden]) ${guide('sandbox-verdict')}`).waitFor({ timeout: 20_000 });
  },
};

function verdictSays(label: string, test: RegExp): Step {
  return {
    name: label,
    async run(page) {
      await page.waitForFunction(
        (re) => new RegExp(re).test(document.querySelector('[data-guide="sandbox-verdict"]')?.textContent ?? ''),
        test.source,
        { timeout: 10_000 },
      );
    },
  };
}

const closer: Step = {
  name: 'Set it at 60 AU',
  async run(page) {
    const d = page.locator(guide('sandbox-distance'));
    await d.fill('60');
    await d.press('Tab');
  },
};

const closed: Step = {
  name: 'The sandbox is closed',
  async run(page) {
    await page.locator('#sandbox[hidden]').waitFor({ state: 'attached', timeout: 5_000 });
  },
};

const fromAbout: Step = {
  name: 'About’s Planet X section opens the sandbox',
  async run(page) {
    await press(page, 'about-button');
    await page.locator(guide('about-sandbox')).scrollIntoViewIfNeeded();
    await page.locator(guide('about-sandbox')).click();
    await page.locator(`#sandbox:not([hidden]) ${guide('sandbox-verdict')}`).waitFor({ timeout: 20_000 });
    if (await page.locator('#about[open]').count()) throw new Error('About stayed open');
  },
};

export const flows: Flow[] = [
  {
    name: 'Sandbox: a pretend planet on WISE 0855−0714',
    owner: 'V',
    path: '/?target=wise-0855',
    steps: [
      fromSearch,
      verdictSays('A model verdict at 500 AU', /^Model\s+SPHEREx would not show it here/),
      closer,
      verdictSays('At 60 AU one exposure would show it', /^Model\s+One exposure would show it/),
      keyStep('Escape', 'Escape closes it'),
      closed,
    ],
  },
  {
    name: 'Sandbox from About',
    owner: 'V',
    path: '/?target=barnard',
    steps: [fromAbout, keyStep('Escape', 'Escape closes it'), closed],
  },
];
