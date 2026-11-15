/**
 * Lane DE's v2.0 flows: the Discover frame (56 px Play, date chips, four views, the data line),
 * contract 4 (Stack and the motion handle in Discover, `trialResult()`), the Measure button in
 * Expert (`S.measureOpen`), a bar that keeps its width while it plays, and the phone frame
 * (MOB-8, 11.5). Owner: lane DE.
 */
import { guide, pressStep, type Flow, type Step } from '../smoke.ts';
import type { Page } from 'playwright-core';

type Win = { sima: { S: Record<string, unknown> } };

/** Fails unless `fn` is true in the page within a few seconds. */
function expectStep(name: string, fn: string, timeout = 8000): Step {
  return {
    name,
    async run(page) {
      await page.waitForFunction(fn, undefined, { timeout });
    },
  };
}

/** Closes v1's welcome card when it is there (it is not in every view). */
const noWelcome: Step = {
  name: 'Close the welcome card if it shows',
  async run(page) {
    const b = page.locator(guide('welcome-own')).first();
    if (await b.isVisible().catch(() => false)) await b.click();
  },
};

const S = (k: string) => `(window.sima.S.${k})`;

/** The stack result now, through contract 4 (the dev server serves the module itself). */
async function trial(page: Page, set: { pmra: number; pmdec: number } | null | 'keep') {
  return page.evaluate(async (m) => {
    // A page-side path, served by the dev server: typed from the module itself.
    const url = '/src/viewer/motion.ts';
    const motion = (await import(/* @vite-ignore */ url)) as typeof import('../../../src/viewer/motion.ts');
    if (m !== 'keep') motion.setTrial(m);
    for (let i = 0; i < 120; i++) {
      const r = motion.trialResult();
      if (r && (m === 'keep' || r.atCatalogue === (m === null))) {
        const [still, opp] = r.result.controls;
        return { at: r.atCatalogue, along: r.result.along.snr, still: still!.snr, opp: opp!.snr };
      }
      await new Promise((ok) => setTimeout(ok, 250));
    }
    return null;
  }, set);
}

/** The ghost's pass rule (BEGINNER-AND-MOBILE 6.2 step 3, the stack's own "moves with" rule). */
function passes(r: { along: number; still: number; opp: number }): boolean {
  return r.along >= 5 && r.along >= r.still + 2 && r.along >= r.opp + 2;
}

export const flows: Flow[] = [
  {
    name: 'Discover frame and the ghost’s stack (DE)',
    owner: 'DE',
    path: '/?target=wise-0855&ui=discover&det=5',
    steps: [
      noWelcome,
      expectStep(
        'The frame plays itself: Play 56 px, steps 48 px, no bar',
        `(() => {
          const row = document.querySelector('#frame-play');
          const play = document.querySelector('${guide('frame-play')}');
          const prev = document.querySelector('${guide('frame-prev')}');
          const bar = document.getElementById('bar');
          return row && !row.hidden && row.dataset.form === 'discover' &&
            play.getBoundingClientRect().height === 56 && prev.getBoundingClientRect().height >= 48 &&
            bar.getBoundingClientRect().height === 0;
        })()`,
      ),
      expectStep(
        'The date strip: one dot per date, 48 px tall to touch, the date on screen written out',
        `(() => {
          const strip = document.querySelector('${guide('date-strip')}');
          const dots = [...document.querySelectorAll('.fp-dot')];
          return dots.length === ${S('groups')}.length && dots.length > 1 &&
            strip.getBoundingClientRect().height >= 48 &&
            dots[${S('epoch')}].classList.contains('on') &&
            strip.getAttribute('aria-valuenow') === String(${S('epoch')} + 1) &&
            /\\d{4}/.test(strip.querySelector('.fp-now')?.textContent ?? '');
        })()`,
      ),
      expectStep(
        'The data line says source, release, date and wavelength (H2)',
        `(() => {
          const src = document.querySelector('.frame-source')?.textContent ?? '';
          const line = document.querySelector('.frame-prov')?.textContent ?? '';
          return src.includes('SPHEREx') && /DR\\d|QR\\d/.test(line) && /20\\d\\d/.test(line) && line.includes('µm');
        })()`,
      ),
      expectStep(
        'Four views: Flip, Two dates, Difference, Stack',
        `[...document.querySelectorAll('#frame-views [data-mode]')].map((b) => b.dataset.mode).join() === 'flip,two,diff,stack'`,
      ),
      {
        name: 'A tap at the start of the date strip shows the first date; the arrow key steps',
        async run(page) {
          const r = (await page.locator(guide('date-strip')).boundingBox())!;
          await page.mouse.click(r.x + 12, r.y + r.height / 2);
          await page.waitForFunction(`${S('epoch')} === 0 && !${S('playing')}`);
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction(`${S('epoch')} === 1`);
        },
      },
      pressStep('view-two', 'Two dates'),
      expectStep(
        'Two dates names its red and cyan dates',
        `/red .+ · cyan .+/.test(document.querySelector('.frame-prov')?.textContent ?? '')`,
      ),
      pressStep('view-stack', 'Stack in Discover (contract 4)'),
      expectStep(
        'Stack at the Explore level shows the motion handle',
        `${S('mode')} === 'stack' && ${S('level')} === 'explore' &&
         !document.querySelector('${guide('motion-handle')}')?.hidden`,
      ),
      {
        name: 'At no motion the stack does not beat its checks; the label says trial motion (H8)',
        async run(page) {
          const r = await trial(page, { pmra: 0, pmdec: 0 });
          if (!r || r.at) throw new Error(`no trial result: ${JSON.stringify(r)}`);
          if (passes(r)) throw new Error(`no motion passed: ${JSON.stringify(r)}`);
          await page.waitForFunction(() =>
            document.querySelector('.pic-badge')?.textContent?.includes('trial motion'),
          );
        },
      },
      {
        name: 'Snap to the catalogue motion: the stack beats both checks',
        async run(page) {
          await page.locator(guide('motion-snap')).click();
          const r = await trial(page, 'keep');
          if (!r || !r.at) throw new Error(`no catalogue result: ${JSON.stringify(r)}`);
          if (!passes(r)) throw new Error(`the catalogue motion did not pass: ${JSON.stringify(r)}`);
        },
      },
      {
        name: 'The opposite motion does not pass',
        async run(page) {
          const r = await trial(page, { pmra: 8118, pmdec: -680 });
          if (!r) throw new Error('no trial result');
          if (passes(r)) throw new Error(`the opposite motion passed: ${JSON.stringify(r)}`);
        },
      },
    ],
  },
  {
    name: 'Expert: Measure opens and closes, the bar keeps its width (DE)',
    owner: 'DE',
    path: '/?target=barnard&ui=expert',
    steps: [
      noWelcome,
      {
        name: 'Open Measure (Expert may open with it already)',
        async run(page) {
          await page.waitForTimeout(500);
          const open = await page.evaluate(() => !document.getElementById('measure')?.hidden);
          if (!open) await page.locator(guide('measure')).first().click();
        },
      },
      expectStep(
        'Measure shows at the Measure level',
        `${S('level')} === 'measure' && !document.getElementById('measure').hidden`,
      ),
      pressStep('measure', 'Close Measure with its button'),
      expectStep(
        'Measure closes; the level stays Measure (S.measureOpen)',
        `${S('level')} === 'measure' && ${S('measureOpen')} === false && document.getElementById('measure').hidden &&
         [...document.querySelectorAll('#frame-views [data-mode]')].length === 6`,
      ),
      pressStep('measure', 'Open Measure again'),
      expectStep('Measure is back', `!document.getElementById('measure').hidden`),
      {
        name: 'While Measure plays, the bar keeps one width',
        async run(page) {
          const widths = await page.evaluate(async () => {
            const S = (window as unknown as Win).sima.S;
            if (!S.playing) document.querySelector<HTMLElement>('[data-guide="play"]')?.click();
            const bar = document.getElementById('bar')!;
            const seen = new Set<number>();
            for (let i = 0; i < 40; i++) {
              seen.add(Math.round(bar.getBoundingClientRect().width));
              await new Promise((ok) => setTimeout(ok, 100));
            }
            return [...seen];
          });
          if (widths.length > 1) throw new Error(`the bar changed width: ${widths.join(', ')} px`);
        },
      },
    ],
  },
  {
    name: 'Phone frame: data line, compact bar (DE, MOB-8)',
    owner: 'DE',
    path: '/?target=barnard&ui=expert',
    sizes: [{ width: 390, height: 844 }],
    // Expert on a phone is one scrolling column (11.5).
    scrolls: true,
    steps: [
      noWelcome,
      {
        name: 'The phone layout (lane M sets it; set here until it does)',
        async run(page) {
          await page.evaluate(async () => {
            // Until lane F removes v1's "made for a desktop screen" note (v2.0 drops it, section
            // 13), its rule hides the page on phones: take it out here.
            for (const sh of document.styleSheets) {
              let rules: CSSRuleList;
              try {
                rules = sh.cssRules;
              } catch {
                continue;
              }
              for (let i = rules.length - 1; i >= 0; i--)
                if (rules[i]!.cssText.includes('narrow-note')) sh.deleteRule(i);
            }
            document.getElementById('narrow-note')?.remove();
            // This flow checks lane DE's cards only: the top row and sky note get their phone
            // forms from lanes F and C (their own flows check them).
            for (const el of document.querySelectorAll<HTMLElement>('[data-card]'))
              if (!['frame', 'measure'].includes(el.id) && !el.closest('#frame, #measure')) el.style.display = 'none';
            const url = '/src/shell/sheet.ts';
            const sheet = (await import(/* @vite-ignore */ url)) as typeof import('../../../src/shell/sheet.ts');
            if (sheet.layout().kind === 'desktop') {
              document.documentElement.dataset.layout = 'phone-scroll';
              sheet.setLayout({ kind: 'phone-scroll', pic: 366, sheetH: 0 });
            }
          });
        },
      },
      expectStep(
        'The header names source, release, date and wavelength (MOB-8)',
        `(() => {
          const src = document.querySelector('.frame-source')?.textContent ?? '';
          const line = document.querySelector('.frame-prov');
          const t = line?.textContent ?? '';
          return src.includes('SPHEREx') && line.getBoundingClientRect().height > 0 &&
            /DR\\d|QR\\d/.test(t) && /\\d{4}/.test(t) && t.includes('µm');
        })()`,
      ),
      expectStep(
        'A compact bar in the frame: steps, Play, the counter "n of m"; no wide bar',
        `(() => {
          const row = document.querySelector('#frame-play');
          const count = row?.querySelector('.fp-count')?.textContent ?? '';
          return row?.dataset.form === 'phone' && /^\\d+ of \\d+$/.test(count) &&
            document.getElementById('bar').getBoundingClientRect().height === 0 &&
            [...row.querySelectorAll('button')].every((b) => b.getBoundingClientRect().height >= 48);
        })()`,
      ),
    ],
  },
];
