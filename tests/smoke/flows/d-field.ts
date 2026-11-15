/**
 * Lane D's flows for fields wider than the real exposures (FRM-6, FRM-12) and for waiting on
 * NASA's archive (BAR-6). The smoke test runs without the live service, so this is the "service
 * off" path: the real pictures stay, the line says why nothing wider comes, and the sky map
 * around them (when its tiles load) is labelled. Owner: lane D.
 */
import type { Page } from 'playwright-core';
import { guide, pressStep, type Flow, type Step } from '../smoke.ts';

/** Picks a field size from the frame's field-size menu (the "6′ ▾" button). */
function fovStep(fov: number, label = `Field ${fov}′`): Step {
  return {
    name: label,
    async run(page) {
      await page.locator('[data-guide="fov"]').first().click();
      await page.locator(`[data-guide="fov-${fov}"]`).click();
      await page.waitForFunction((f) => document.querySelector('.frame-fov')?.textContent === `${f}′`, fov);
    },
  };
}


type Sima = {
  sima: {
    S: { fov: number; source: string; field: { n: number } | null; groups: unknown[]; ra: number };
    bus: { emit: (t: string, m: unknown) => void };
  };
};


function expectStep(name: string, fn: string, timeout = 8000): Step {
  return {
    name,
    async run(page) {
      await page.waitForFunction(fn, undefined, { timeout });
    },
  };
}

/** The real pictures are on screen: a field, more than one date, and the data line says so. */
const stillReal = (why: string) =>
  expectStep(
    `Real pictures still on screen ${why}`,
    `(() => { const S = window.sima.S;
       return !!S.field && S.groups.length > 1 && S.source === 'real' &&
         document.querySelector('#frame-exif')?.textContent?.startsWith('Real SPHEREx data') &&
         document.getElementById('frame-cover')?.hidden === true; })()`,
  );

/** A point inside the patch on the sky, clear of the cards, and the patch's width (px). */
async function patchPoint(page: Page): Promise<{ x: number; y: number; w: number }> {
  const at = await page.evaluate(() => {
    const [x = 0, y = 0, w = 0] = (document.getElementById('sky')?.dataset.patch ?? '')
      .split(' ')
      .map(Number);
    for (const f of [0.5, 0.3, 0.7, 0.15]) {
      const p = { x: x + w * f, y: y + w * 0.5, w };
      if (document.elementFromPoint(p.x, p.y)?.closest('#sky')) return p;
    }
    return null;
  });
  if (!at || at.w < 30) throw new Error('the patch is not clear of the cards');
  return at;
}

export const flows: Flow[] = [
  {
    name: 'Wider fields keep the real pictures (D, FRM-6, FRM-12)',
    owner: 'D',
    path: '/?target=barnard',
    steps: [
      stillReal('at the start'),
      fovStep(12),
      fovStep(24),
      expectStep('The field is 24′', `document.querySelector('.frame-fov')?.textContent === '24′'`),
      stillReal('at 24′ (not a blank frame)'),
      expectStep(
        'The data line says where the real exposures stop',
        `/real exposures cover the middle 6\\.\\d′/.test(document.querySelector('#frame-exif')?.textContent ?? '')`,
      ),
      expectStep(
        'Without the live service the line says why nothing wider comes',
        `(document.querySelector('#frame-load')?.textContent ?? '').includes('live service that is not running')`,
      ),
      {
        name: 'The sky map around them, when it shows, is labelled as the all-dates average (H1)',
        async run(page) {
          // The map's tiles come from NASA's archive; when they load, the label must be there.
          await page.waitForTimeout(3000);
          const label = await page.evaluate(() => {
            const el = document.querySelector<HTMLElement>('.pic-around');
            return el && !el.hidden ? (el.textContent ?? '') : null;
          });
          if (label !== null && !label.includes('Sky map (all dates averaged)')) {
            throw new Error(`unlabelled map: "${label}"`);
          }
        },
      },
      fovStep(48),
      stillReal('at 48′'),
      {
        name: 'Drag inside the picture past the exposures pans and keeps them (FRM-12)',
        async run(page) {
          const box = await page.locator(guide('picture')).boundingBox();
          if (!box) throw new Error('no picture');
          const before = await page.evaluate(() => (window as unknown as Sima).sima.S.ra);
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + box.width * 0.08, box.y + box.height / 2, { steps: 6 });
          await page.mouse.up();
          await page.waitForFunction(
            (b) => (window as unknown as Sima).sima.S.ra > b,
            before,
          );
        },
      },
      stillReal('after the pan'),
      fovStep(24, 'Field 24′ again'),
      fovStep(12, 'Field 12′ again'),
      fovStep(6, 'Field 6′ again'),
      stillReal('back at 6′'),
    ],
  },
  {
    name: 'A press or a short drag of the patch keeps the target and its pictures (D, FRM-2)',
    owner: 'D',
    path: '/?target=barnard',
    steps: [
      // Expert opens with Measure, which covers the patch in the middle of the sky.
      pressStep('measure', 'Close Measure'),
      stillReal('at the start'),
      fovStep(12),
      fovStep(24),
      stillReal('at 24′'),
      {
        name: 'A press on the patch without moving it reloads nothing',
        async run(page) {
          const at = await patchPoint(page);
          await page.evaluate(() => {
            const w = window as unknown as Sima & { seen: string[] };
            w.seen = [];
            const t = setInterval(() => w.seen.push(w.sima.S.source), 30);
            setTimeout(() => clearInterval(t), 1500);
          });
          await page.mouse.move(at.x, at.y);
          await page.mouse.down();
          await page.mouse.up();
          await page.waitForTimeout(1600);
          const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
          if (seen.some((x) => x !== 'real')) throw new Error(`the frame reloaded: ${[...new Set(seen)]}`);
        },
      },
      {
        name: 'Drag the patch about 2′ off the target: target and real pictures stay',
        async run(page) {
          const at = await patchPoint(page);
          const before = await page.evaluate(() => (window as unknown as Sima).sima.S.ra);
          await page.mouse.move(at.x, at.y);
          await page.mouse.down();
          await page.mouse.move(at.x - at.w * 0.04, at.y, { steps: 3 });
          await page.mouse.move(at.x - at.w * 0.09, at.y, { steps: 3 });
          await page.mouse.up();
          await page.waitForFunction(
            (b) => (window as unknown as Sima).sima.S.ra !== b,
            before,
            { timeout: 8000 },
          );
          const s = await page.evaluate(() => {
            const S = (window as unknown as Sima & { sima: { S: { target: string } } }).sima.S;
            return `${S.target}|${S.source}`;
          });
          if (s !== 'barnard|real') throw new Error(`after the drag: ${s}`);
        },
      },
      stillReal('after the drag'),
    ],
  },
  {
    name: 'A new spot shows the frame and the bar says why it waits (D, BAR-6)',
    owner: 'D',
    path: '/?target=barnard',
    steps: [
      stillReal('at the start'),
      pressStep('frame-hide', 'Hide the frame'),
      {
        name: 'Aim at a spot without pictures: the frame shows again',
        async run(page) {
          await page.evaluate(() =>
            (window as unknown as Sima).sima.bus.emit('aim', { ra: 10, dec: 20 }),
          );
          await page.waitForFunction(() => document.getElementById('frame')?.hidden === false);
        },
      },
      expectStep(
        'The empty date scale says why the bar cannot play',
        `(document.querySelector('.ds-why')?.textContent ?? '').length > 0 &&
         document.querySelector('${guide('play')}')?.dataset.tip === document.querySelector('.ds-why')?.textContent`,
      ),
    ],
  },
];
