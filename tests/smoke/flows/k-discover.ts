/**
 * Lane K's flows: Discover's screens. The runaway from the welcome card to the result and the
 * Expert hand-off (GATE-1 on desktop, MSN-2, MSN-3, MSN-7), the mission list with no locked
 * state (DSC-3), and Escape on the mission card asking first (section 13). Owner: lane K.
 */
import type { Page } from 'playwright-core';
import { guide, keyStep, pressStep, type Flow, type Step } from '../smoke.ts';

/** Fails unless `fn` (page JavaScript) becomes true within a few seconds. */
function expect(name: string, fn: string, timeout = 15000): Step {
  return {
    name,
    async run(page) {
      await page.waitForFunction(fn, undefined, { timeout, polling: 100 });
    },
  };
}

const stepSays = (text: string) =>
  expect(
    `The mission step says "${text}"`,
    `document.querySelector('${guide('mission-step')}')?.textContent?.includes(${JSON.stringify(text)})`,
  );

/** Clicks the picture at a fraction of its width and height. */
function tapAt(fx: number, fy: number, label: string): Step {
  return {
    name: label,
    async run(page: Page) {
      const box = await page.locator('#frame-pic canvas[data-picture]').boundingBox();
      if (!box) throw new Error('no picture');
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    },
  };
}

const ready = expect(
  "Barnard's Star is open, paused, Flip, D3, on the first date",
  `(() => { const S = window.sima?.S; return S && S.target === 'barnard' && S.groups.length > 0 && !S.playing && S.mode === 'flip' && S.det === 3 && S.epoch === 0; })()`,
  30000,
);

export const flows: Flow[] = [
  {
    name: 'Discover: the runaway from the welcome card to Expert (K)',
    owner: 'K',
    path: '/?ui=discover',
    steps: [
      expect('The welcome card shows', `!!document.querySelector('${guide('discover-welcome')}')?.checkVisibility()`),
      expect(
        'The welcome does not say every picture is real (H3)',
        `!/every picture is real/i.test(document.querySelector('${guide('discover-welcome')}')?.textContent ?? '')`,
      ),
      pressStep('mission-start', 'Start your first mission'),
      ready,
      stepSays('Press Play'),
      keyStep('ArrowRight', 'Next date'),
      keyStep('ArrowRight', 'Next date'),
      keyStep('ArrowRight', 'Next date'),
      stepSays('One star jumps. Tap it.'),
      tapAt(0.08, 0.08, 'Tap a corner, far from the track'),
      expect('The miss note shows', `document.querySelector('.dsc-state.miss')?.textContent?.includes('Not that one')`),
      pressStep('mission-show-me', 'Show me'),
      expect(
        'Show me never passes the step (MSN-7)',
        `document.querySelector('${guide('mission-step')}')?.textContent?.includes('One star jumps')`,
      ),
      tapAt(0.5, 0.5, 'Tap the middle, where the star is'),
      expect(
        'The success card shows the measured value and Gaia on separate lines (MSN-3)',
        `(() => { const t = document.querySelector('#mission-success .dsc-result')?.textContent ?? '';
          return /Measured by Sima, from \\d+ of \\d+ pictures/.test(t) && /\\d+\\.\\d\\d ± \\d+\\.\\d\\d″ a year/.test(t) && t.includes("Gaia's star catalogue") || t.includes('Not measured'); })()`,
        30000,
      ),
      expect('The skill is learned', `document.querySelector('#mission-success .dsc-skill')?.textContent?.includes('Skill learned: Blink')`),
      pressStep('success-expert', 'How was this measured? Open Expert view'),
      expect('Expert is on', `document.documentElement.dataset.view === 'expert'`),
    ],
  },
  {
    name: 'Discover: the list has three missions, three objects and no lock (K)',
    owner: 'K',
    path: '/?ui=discover',
    steps: [
      pressStep('discover-look', 'Look around first'),
      expect('The list shows', `!!document.querySelector('${guide('discover-list')}')?.checkVisibility()`),
      expect(
        'Three missions and three objects, none locked (DSC-3)',
        `document.querySelectorAll('[data-mission]').length === 3 && document.querySelectorAll('.dsc-o[data-object]').length === 3 && !document.querySelector('.dsc-m.locked, .dsc-m[disabled]')`,
      ),
      expect('Planet X says Simulated', `document.querySelector('${guide('mission-planet-x')}')?.textContent?.includes('Simulated')`),
      pressStep('mission-ghost', 'Open the ghost'),
      expect('The ghost opens on D5', `window.sima?.S.target === 'wise-0855' && window.sima.S.det === 5`, 30000),
      keyStep('Escape', 'Escape on the mission card'),
      expect('It asks first', `!!document.querySelector('.dsc-ask')`),
      { name: 'Leave', run: (page) => page.locator('[data-k="leave"]').click() },
      expect('Back on the list, the ghost in progress or not started', `!!document.querySelector('${guide('mission-ghost')}')?.checkVisibility()`),
    ],
  },
];
