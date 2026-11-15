/**
 * Lane C's Discover flows: the globe at home, its limb glow and sky note (DSC-2), the mission
 * beacons, and the sky note kept clear (DSC-7). Owner: lane C.
 */
import type { Flow } from '../smoke.ts';

export const flows: Flow[] = [
  {
    name: 'Discover globe and beacons (C)',
    owner: 'C',
    path: '/?ui=discover',
    steps: [
      {
        name: 'Home is the whole globe, with a limb glow; the note names the detector (DSC-2)',
        async run(page) {
          await page.waitForFunction(
            () => {
              const sky = document.querySelector<HTMLElement>('#sky');
              const note = document.querySelector('#sky-note')?.textContent ?? '';
              return sky?.dataset.globe === '1' && /SPHEREx D[1-6], (near|deep) infrared/.test(note);
            },
            null,
            { timeout: 30_000 },
          );
          const glow = await page.evaluate(() => {
            const limb = document.querySelector('#sky .sky-limb');
            const sky = document.querySelector<HTMLElement>('#sky');
            return {
              shadow: limb ? getComputedStyle(limb).boxShadow : '',
              opacity: limb ? getComputedStyle(limb).opacity : '0',
              det: sky?.dataset.det ?? '',
              note: document.querySelector('#sky-note')?.textContent ?? '',
            };
          });
          if (glow.opacity === '0' || !glow.shadow.includes('140px')) {
            throw new Error(`no limb glow: ${JSON.stringify(glow)}`);
          }
          if (!glow.note.includes(`D${glow.det},`)) {
            throw new Error(`the note names another detector than the glow's (D${glow.det}): ${glow.note}`);
          }
        },
      },
      {
        name: "The next mission's beacon shows on the globe, its tag in the window",
        async run(page) {
          await page.waitForSelector('.sky-beacon[data-id="runaway"]:not([hidden])', { timeout: 15_000 });
          const bad = await page.evaluate(() => {
            const b = document.querySelector<HTMLElement>('.sky-beacon[data-id="runaway"]')!;
            const tag = b.querySelector('.sky-beacon-tag')!.getBoundingClientRect();
            const ring = b.getBoundingClientRect();
            const note = document.querySelector('#sky-note')!.getBoundingClientRect();
            const over = (a: DOMRect, c: DOMRect) =>
              a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
            if (b.dataset.side === 'none') return 'the tag found no place';
            if (tag.left < 0 || tag.top < 0 || tag.right > innerWidth || tag.bottom > innerHeight) return 'tag outside the window';
            if (over(tag, ring)) return 'the tag covers its own beacon';
            if (over(tag, note)) return 'the tag covers the sky note';
            if (ring.width < 48 || ring.height < 48) return 'hit area under 48 px';
            return '';
          });
          if (bad) throw new Error(bad);
        },
      },
      {
        name: 'Enter on a beacon starts its mission through the bus (`start`)',
        async run(page) {
          await page.evaluate(() => {
            const w = window as unknown as { sima: { bus: { on: (t: string, f: (m: unknown) => void) => void } }; started?: unknown };
            w.sima.bus.on('start', (m) => {
              w.started = m;
            });
          });
          await page.focus('.sky-beacon[data-id="runaway"]');
          await page.keyboard.press('Enter');
          await page.waitForFunction(
            () => (window as unknown as { started?: { starter: string } }).started?.starter === 'runaway',
            null,
            { timeout: 5000 },
          );
        },
      },
      {
        name: 'The sky note is never covered (DSC-7)',
        async run(page) {
          const covered = await page.evaluate(() => {
            const note = document.querySelector('#sky-note')!;
            const r = note.getBoundingClientRect();
            const pts = [
              [r.left + 4, r.top + r.height / 2],
              [r.left + r.width / 2, r.top + r.height / 2],
              [r.right - 4, r.top + r.height / 2],
            ];
            return pts
              .map(([x, y]) => document.elementFromPoint(x!, y!))
              .filter((el) => el && !note.contains(el))
              .map((el) => (el as Element).id || (el as Element).className);
          });
          if (covered.length) throw new Error(`the sky note is covered by ${covered.join(', ')}`);
        },
      },
    ],
  },
];
