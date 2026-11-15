/**
 * O-V5's flows: the catalogue search panel (fast movers, cold objects), its list and marks, its
 * honest failure with "Try again", and the Escape order. VizieR is not asked: the page's requests
 * to it are answered with real VizieR answers saved in tests/fixtures (14 November 2026), or made
 * to fail, so the flows do not depend on a service that is not always up. Owner: V.
 */
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { guide, keyStep, pressStep, type Flow, type Step } from '../smoke.ts';

const fixture = (name: string): string =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');


/** Answers the page's VizieR requests with a saved answer (by catalogue), or fails them. */
function vizier(mode: 'answer' | 'fail'): Step {
  return {
    name: mode === 'answer' ? 'VizieR answers (saved answers)' : 'VizieR fails',
    async run(page) {
      await page.unroute('**/viz-bin/asu-tsv**');
      await page.route('**/viz-bin/asu-tsv**', (route) => {
        // The failure seen on 14 November 2026: an answer with column notes and no table (an
        // HTTP error would also be logged by the browser itself as a console error).
        if (mode === 'fail')
          return route.fulfill({
            status: 200,
            headers: { 'access-control-allow-origin': '*' },
            body: '#Column\tPM\t(F9.3)\tTotal proper motion\n#\nContent-Type: application/x-votable+xml\n',
          });
        const url = route.request().url();
        const body = url.includes('catwise')
          ? fixture('vizier-catwise-wise0855.tsv')
          : fixture('vizier-gaia-barnard.tsv');
        return route.fulfill({
          status: 200,
          contentType: 'text/tab-separated-values',
          headers: { 'access-control-allow-origin': '*' },
          body,
        });
      });
    },
  };
}

/** Opens the panel from search. */
const openPanel: Step = {
  name: 'Search "catalogue" and open Catalogue search',
  async run(page) {
    await page.keyboard.press('/');
    await page.keyboard.type('catalogue');
    const row = page.locator(`${guide('search-results')} button`, { hasText: 'Catalogue search' });
    await row.waitFor();
    await row.click();
    await page.locator(guide('finds')).waitFor();
  },
};

async function statusText(page: Page): Promise<string> {
  return page.locator(`${guide('finds')} .fd-status`).innerText();
}

function expect(label: string, test: (text: string) => boolean): Step {
  return {
    name: label,
    async run(page) {
      await page.waitForFunction(
        () => !document.querySelector('#finds .fd-asking'),
        undefined,
        { timeout: 20_000 },
      );
      const text = await statusText(page);
      if (!test(text)) throw new Error(`${label}: the panel says "${text.slice(0, 300)}"`);
    },
  };
}

export const flows: Flow[] = [
  {
    name: 'Catalogue search: fast movers and cold objects',
    owner: 'V',
    steps: [
      vizier('answer'),
      openPanel,
      pressStep('finds-search', 'Search this view (Gaia DR3)'),
      expect('Lists Barnard’s Star first, as a catalogue source', (t) =>
        /6 catalogue sources/.test(t) && /4472832130942575872/.test(t) && /10,393 mas\/yr/.test(t) && !/discover/i.test(t),
      ),
      {
        name: 'The sources are marked on the sky',
        async run(page) {
          // The marks are drawn on the dots canvas; the list rows ring them on hover.
          await page.locator('#finds .fd-row').first().hover();
        },
      },
      pressStep('finds-cold', 'Cold objects'),
      pressStep('finds-search', 'Search this view (CatWISE2020)'),
      expect('Lists the reddest first, with the cut stated', (t) =>
        /W1−W2 above 1\.5 mag/.test(t) && /CWISE J08550/.test(t),
      ),
      pressStep('finds-look', 'Look with the frame'),
      keyStep('Escape', 'Escape closes the panel'),
      {
        name: 'The panel is closed',
        async run(page) {
          await page.locator(guide('finds')).waitFor({ state: 'hidden' });
        },
      },
    ],
  },
  {
    name: 'Catalogue search: VizieR down says so, with Try again',
    owner: 'V',
    steps: [
      vizier('fail'),
      {
        name: 'Search "fast movers"',
        async run(page) {
          await page.keyboard.press('/');
          await page.keyboard.type('pm>300');
          const row = page.locator(`${guide('search-results')} button`, { hasText: 'Fast movers' });
          await row.waitFor();
          await row.click();
          await page.locator(guide('finds')).waitFor();
        },
      },
      expect('Says it could not ask, not "none found"', (t) =>
        /could not be asked/.test(t) && /CfA mirror/.test(t) && /IDIA mirror/.test(t) && /Try again/.test(t),
      ),
      vizier('answer'),
      pressStep('finds-retry', 'Try again'),
      expect('Then lists the sources over the cut from the link', (t) => /faster than 300 mas\/yr/.test(t) && /3 catalogue sources/.test(t)),
    ],
  },
];
