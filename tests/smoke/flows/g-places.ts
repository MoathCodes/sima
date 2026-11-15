/**
 * Lane G's flows: chips, lists, cards, search, tours, Surprise me and saved places
 * (PLC-4 to PLC-7), at both sizes, with the frame and with Measure open. Owner: lane G.
 */
import type { Page } from 'playwright-core';
import { guide, keyStep, openPage, press, pressStep, type Flow, type Step, openMeasureStep } from '../smoke.ts';


async function visible(page: Page, name: string): Promise<boolean> {
  return page.locator(guide(name)).first().isVisible();
}

function expectHidden(name: string, label: string): Step {
  return {
    name: label,
    async run(page) {
      await page.locator(guide(name)).waitFor({ state: 'hidden' });
    },
  };
}

/** Types a search, checks the first suggestion, chooses it and waits for the card. */
function searchStep(query: string, first: RegExp, card: RegExp = first): Step {
  return {
    name: `Search "${query}"`,
    async run(page) {
      await page.keyboard.press('/');
      await page.locator(`${guide('search')} input`).fill(''); // the field keeps the last search
      await page.keyboard.type(query);
      const row = page.locator(`${guide('search-results')} button`).first();
      await row.waitFor();
      const text = await row.innerText();
      if (!first.test(text)) throw new Error(`first suggestion for "${query}" is "${text}"`);
      await page.keyboard.press('Enter');
      const c = page.locator(guide('place-card'));
      await c.waitFor();
      const words = await c.innerText();
      if (!card.test(words)) throw new Error(`the card for "${query}" does not say ${card}`);
    },
  };
}

/** Clicks a chip, through "More" when the row has no room for it. */
function chipStep(id: string, label: string): Step {
  return {
    name: label,
    async run(page) {
      if (await visible(page, `chip-${id}`)) {
        await press(page, `chip-${id}`);
        return;
      }
      await press(page, 'chip-more');
      await page
        .locator('.pl-more-menu .menu-item', { hasText: label.replace(/^Open /, '') })
        .click();
    },
  };
}

export const flows: Flow[] = [
  {
    name: 'Places: chips, lists and cards',
    owner: 'G',
    steps: [
      pressStep('chip-stars', 'Open Stars'),
      pressStep('list-filter-1', 'Only stars with Arabic names'),
      pressStep('list-in-view', 'In this view'),
      pressStep('list-whole-sky', 'Whole sky'),
      pressStep('list-row', 'Open the first star'),
      pressStep('card-zoom', 'Zoom to it'),
      keyStep('Escape', 'Escape closes the card'),
      expectHidden('place-card', 'The card is closed'),
      pressStep('chip-nebulae', 'Open Nebulae'),
      pressStep('list-filter-4', 'Only shells of dying stars'),
      keyStep('Escape', 'Escape closes the list (O-I12)'),
      expectHidden('places-list', 'The list is closed'),
      pressStep('chip-galaxies', 'Open Galaxies'),
      pressStep('chip-galaxies', 'The same chip closes it'),
      expectHidden('places-list', 'The list is closed again'),
    ],
  },
  {
    name: 'Places: search (PLC-4, PLC-5)',
    owner: 'G',
    steps: [
      searchStep('shepherd', /Errai/, /the Shepherd/),
      keyStep('Escape', 'Escape closes the card'),
      searchStep('الدبران', /Aldebaran/, /ad-Dabarān/),
      keyStep('Escape', 'Escape closes the card'),
      searchStep(
        'm104',
        /Sombrero Galaxy/,
        /About 37 million light-years[\s\S]*Studies disagree: from about 28 to 71 million/,
      ),
      pressStep('card-look', 'Look with the frame'),
      keyStep('Escape', 'Escape closes the card'),
      searchStep('سهيل', /Canopus/),
    ],
  },
  {
    name: 'Places: tours (PLC-6)',
    owner: 'G',
    steps: [
      pressStep('chip-tours', 'Open Tours'),
      pressStep('tour-galaxies', 'Open "Beyond our galaxy"'),
      pressStep('tour-play', 'Play the tour'),
      {
        name: 'It moves on to the second stop',
        async run(page) {
          await page.locator(`${guide('tour-stop-2')}[aria-current]`).waitFor({ timeout: 12_000 });
        },
      },
      pressStep('tour-play', 'Pause'),
      pressStep('tour-stop-5', 'Go to stop 5'),
      keyStep('Escape', 'Escape closes the tour'),
      expectHidden('places-list', 'The tour is closed'),
    ],
  },
  {
    name: 'Places: Surprise me and saved places (PLC-7)',
    owner: 'G',
    steps: [
      pressStep('chip-surprise-me', 'Surprise me'),
      keyStep('Escape', 'Escape closes the card'),
      pressStep('places-button', 'Open Places'),
      {
        name: 'Name where the sky is now and save it',
        async run(page) {
          await page.locator(guide('places-save-name')).fill('My smoke spot');
          await press(page, 'places-save');
          await page.locator(guide('saved-place'), { hasText: 'My smoke spot' }).waitFor();
        },
      },
      {
        name: 'Reload: the saved place is still there',
        async run(page) {
          await openPage(page);
          await press(page, 'places-button');
          await page.locator(guide('saved-place'), { hasText: 'My smoke spot' }).waitFor();
        },
      },
      pressStep('saved-place', 'Go to the saved place'),
    ],
  },
  {
    name: 'Places beside Measure and the tools (O-P5)',
    owner: 'G',
    path: '/?target=barnard',
    steps: [
      openMeasureStep('Open Measure'),
      chipStep('galaxies', 'Open Galaxies'),
      pressStep('list-row', 'Open the first galaxy'),
      pressStep('tools-button', 'Open the picture tools: the card makes way'),
      chipStep('stars', 'Open Stars: the tools make way'),
      keyStep('Escape', 'Escape closes the list first'),
      expectHidden('places-list', 'The list is closed'),
    ],
  },
];
