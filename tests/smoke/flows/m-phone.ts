/**
 * Lane M's flows: the phone layouts and the sheet (BEGINNER-AND-MOBILE.md 11; MOB-1, MOB-3,
 * MOB-4). Owner: lane M.
 *
 * Runs at phone sizes only: a tall phone and a short one (the fit layout), and a phone on its
 * side (the scroll layout). The sheet is filled with test content through its contract
 * (`src/shell/sheet.ts`), so the checks do not depend on which lane's content is in it.
 */
import type { Page } from 'playwright-core';
import { guide, type Flow, type Size, type Step } from '../smoke.ts';

const SHEET = '/src/shell/sheet.ts';

function expect(ok: boolean, what: string): void {
  if (!ok) throw new Error(`expected ${what}`);
}

const fits = (s: Size) => s.width < 700 && s.height >= 600;

/**
 * False while lane F's "made for a desktop screen" note is still in the page (it hides the page
 * on phones): then every step here has nothing to check and passes.
 */
function phonesOn(page: Page): Promise<boolean> {
  return page.evaluate(() => !document.getElementById('narrow-note'));
}

/** A step that runs only once phones are on. */
function phoneStep(name: string, run: Step['run']): Step {
  return {
    name,
    run: async (page, size) => ((await phonesOn(page)) ? run(page, size) : undefined),
  };
}

/** The layout, the picture's and the sheet's boxes, and the page's width. */
function measure(page: Page) {
  return page.evaluate(() => {
    const box = (id: string) => {
      const el = document.getElementById(id);
      if (!el || el.hidden || !el.checkVisibility()) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    return {
      kind: document.documentElement.dataset.layout ?? '',
      pic: box('frame-pic'),
      sheet: box('sheet'),
      height: document.getElementById('sheet')?.dataset.height ?? '',
      scrollW: document.documentElement.scrollWidth,
      w: innerWidth,
    };
  });
}

/** Opens test content in the sheet: a mission-like card with a button, at `height`. */
function openMission(height: 'peek' | 'half'): Step {
  return phoneStep(`Open a card in the sheet at ${height}`, async (page) => {
    {
      await page.evaluate(
        async ({ mod, height }) => {
          const m = (await import(mod)) as typeof import('../../../src/shell/sheet.ts');
          const el = document.createElement('div');
          el.id = 'm-test-card';
          el.innerHTML =
            '<p>The runaway · step 2 of 2</p><h3>One star jumps. Tap it.</h3>' +
            '<button type="button" id="m-test-open">Open a place</button>';
          m.openSheet(el, { height, label: 'Mission: the runaway' });
        },
        { mod: SHEET, height },
      );
    }
  });
}

/** MOB-1 and MOB-3: no sideways scroll; the picture is at least 240 and never under the sheet. */
const notCovered: Step = phoneStep('The picture is not covered', async (page, size) => {
  const m = await measure(page);
  expect(
    m.kind === (fits(size) ? 'phone-fit' : 'phone-scroll'),
    `layout for ${size.width}×${size.height}, got ${m.kind}`,
  );
  expect(m.scrollW <= m.w, `no sideways scroll (${m.scrollW} > ${m.w})`);
  if (m.pic)
    expect(Math.round(m.pic.width) >= 240, `a picture of at least 240 px, got ${m.pic.width}`);
  if (m.kind === 'phone-fit' && m.pic && m.sheet)
    expect(
      m.sheet.top >= m.pic.bottom - 1,
      `the sheet (top ${m.sheet.top}) under the picture (bottom ${m.pic.bottom})`,
    );
});

const toggle: Step = phoneStep('The grabber toggles peek and half', async (page, size) => {
  if (!fits(size)) return; // the column has no heights
  const before = (await measure(page)).height;
  await page.locator(guide('sheet-grabber')).click();
  const after = (await measure(page)).height;
  expect(
    before !== after && ['peek', 'half'].includes(after),
    `the height to change from ${before}, got ${after}`,
  );
});

/** MOB-4: secondary content, then Escape: the mission content, its height and focus come back. */
const backRule: Step = phoneStep(
  'Back returns to the mission, its height and focus',
  async (page) => {
    const height = (await measure(page)).height;
    await page.locator('#m-test-open').focus();
    await page.evaluate(async (mod) => {
      const m = (await import(mod)) as typeof import('../../../src/shell/sheet.ts');
      const card = document.createElement('div');
      card.innerHTML = '<h3>Vega</h3><p>A place card.</p>';
      m.openSheet(card, { height: 'half', label: 'Vega', back: true });
    }, SHEET);
    expect(await page.locator(guide('sheet-back')).isVisible(), 'a Back button');
    await page.keyboard.press('Escape');
    const back = await page.evaluate(() => ({
      shown: !!document.getElementById('m-test-card')?.checkVisibility(),
      focus: document.activeElement?.id ?? '',
      height: document.getElementById('sheet')?.dataset.height ?? '',
    }));
    expect(back.shown, 'the mission card back');
    expect(
      back.focus === 'm-test-open',
      `focus on the control that opened the card, got "${back.focus}"`,
    );
    expect(back.height === height, `the height ${height} kept, got ${back.height}`);
  },
);

/** A full-height page is modal (the rest is inert) and Back returns to the sheet. */
const page: Step = phoneStep('A full-height page opens and goes back', async (p) => {
  await p.evaluate(async (mod) => {
    const m = (await import(mod)) as typeof import('../../../src/shell/sheet.ts');
    const el = document.createElement('div');
    el.innerHTML = '<p>Panels: Glass / Solid</p>';
    m.openPage(el, { label: 'Settings' });
  }, SHEET);
  const open = await p.evaluate(() => ({
    modal: document.getElementById('sheet')?.getAttribute('aria-modal') === 'true',
    inert: !!document.getElementById('frame')?.closest('[inert]'),
  }));
  expect(open.modal && open.inert, 'a modal page with the frame inert');
  await p.locator(guide('sheet-back')).click();
  const after = await p.evaluate(() => ({
    card: !!document.getElementById('m-test-card')?.checkVisibility(),
    inert: !!document.getElementById('frame')?.closest('[inert]'),
  }));
  expect(after.card && !after.inert, 'the sheet back and nothing inert');
});

const close: Step = phoneStep('Close the sheet', async (p) => {
  await p.evaluate(async (mod) => {
    const m = (await import(mod)) as typeof import('../../../src/shell/sheet.ts');
    m.closeSheet();
  }, SHEET);
  expect((await measure(p)).sheet === null, 'the sheet hidden');
});

const PHONES: Size[] = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];
const SIDEWAYS: Size[] = [{ width: 844, height: 390 }];
const path = '/?ui=discover&target=barnard';
const steps = [
  notCovered,
  openMission('peek'),
  notCovered,
  toggle,
  notCovered,
  backRule,
  page,
  close,
];

// The phone on its side: today's desktop cards (top row, welcome) overlap at 844×390 before the
// phone top row and Discover's phone screens exist, so this flow runs only with SMOKE_PHONES=1
// until they land; then the integrator drops the condition.
export const flows: Flow[] = [
  { name: 'Phone fit layout and the sheet', owner: 'M', path, sizes: PHONES, steps },
  ...(process.env.SMOKE_PHONES
    ? [{ name: 'Phone scroll layout', owner: 'M', path, sizes: SIDEWAYS, scrolls: true, steps }]
    : []),
];
