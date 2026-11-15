/**
 * The opening intro (src/intro/, DESIGN.md "Intro"): it plays with ?intro=1 and ends in the
 * first-visit state, Discover's welcome on the globe (DSC-1); any key skips it to the same state;
 * About's "Play the intro" plays it again.
 * Every other flow starts with the intro already seen (run.ts presets `sima-intro`).
 * Owner: the intro. Run with `npm run smoke -- intro`.
 */
import type { Page } from 'playwright-core';
import { guide, openPage, press, settle, type Flow, type Step } from '../smoke.ts';

function expect(ok: boolean, what: string): void {
  if (!ok) throw new Error(`expected ${what}`);
}

/** Waits for the intro to be gone (it may hold up to 2 s for a slow sky, and the landing more). */
async function introGone(page: Page, ms: number): Promise<void> {
  await page.waitForFunction(() => !document.getElementById('intro'), undefined, {
    timeout: ms,
    polling: 50,
  });
}

/**
 * Does `act` and checks the intro is gone within 3 s of it, timed in the page: right after the
 * intro, the sky reads its map back once (sky.ts brightGrid), which on the smoke test's software
 * renderer holds the page for seconds, so a wait timed from here would see the end late.
 */
async function skipsQuickly(page: Page, act: () => Promise<void>): Promise<void> {
  const before = await page.evaluate(() => {
    const w = window as unknown as { introGoneAt?: number };
    delete w.introGoneAt;
    new MutationObserver((_, o) => {
      if (document.getElementById('intro')) return;
      w.introGoneAt = performance.now();
      o.disconnect();
    }).observe(document.body, { childList: true });
    return performance.now();
  });
  await act();
  await introGone(page, 30_000);
  const gone = await page.evaluate(
    () => (window as unknown as { introGoneAt?: number }).introGoneAt ?? performance.now(),
  );
  expect(gone - before < 3_000, `the intro gone within 3 s, took ${Math.round(gone - before)} ms`);
}

/** The page as on a first visit (DSC-1): no intro, Discover's welcome card up over the globe,
 * with nothing left of the intro on the cards. */
const firstVisit: Step = {
  name: 'It ends in the first-visit state',
  async run(page) {
    const read = () =>
      page.evaluate(() => {
        const welcome = document.querySelector<HTMLElement>('[data-guide="discover-welcome"]');
        return {
          intro: document.documentElement.dataset.intro ?? null,
          view: document.documentElement.dataset.view ?? null,
          welcome:
            !!welcome && !welcome.hidden && welcome.checkVisibility({ opacityProperty: true }),
          globe: document.getElementById('sky')?.dataset.globe === '1',
          seen: sessionStorage.getItem('sima-intro'),
        };
      });
    // The globe may still be turning when the intro is skipped early: allow it 10 s.
    let s = await read();
    for (const end = Date.now() + 10_000; !(s.welcome && s.globe) && Date.now() < end; s = await read()) {
      await page.waitForTimeout(200);
    }
    expect(s.intro === null, `no html[data-intro], got ${s.intro}`);
    expect(s.view === 'discover', `Discover, got ${s.view}`);
    expect(s.welcome, "Discover's welcome card on screen");
    expect(s.globe, 'the sky a globe');
    expect(s.seen === '1', 'the browser to remember the intro');
  },
};

/** Opens the page with ?intro=1 and waits for the intro to start. The runner settles the page
 * after each step, which would wait the intro out, so each intro run is one step. */
async function openWithIntro(page: Page): Promise<void> {
  await page.goto(new URL('/?intro=1', page.url()).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#intro', { state: 'attached', timeout: 30_000 });
  await page.waitForSelector('html[data-ready]', { state: 'attached', timeout: 30_000 });
}

const workspaceFrame = '.wf[data-frame="f1"]';

/** Drags the "Two dates" frame from the tray onto the middle of the sky (Barnard's Star). */
const dropFrame: Step = {
  name: 'Drop a second frame from the tray (autosaved)',
  async run(page, size) {
    // Expert opens with Measure, which covers the middle of the sky where the frame drops.
    await press(page, 'measure');
    await page.locator('#measure').waitFor({ state: 'hidden' });
    // Paused: while the frame plays, the autosave waits (src/workspace/store.ts, reported).
    if (
      await page.evaluate(
        () => (window as unknown as { sima: { S: { playing: boolean } } }).sima.S.playing,
      )
    ) {
      await press(page, 'play');
    }
    await press(page, 'workspace-button');
    const tile = page.locator(guide('tool-two'));
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
    await page.mouse.move(size.width / 2, size.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForSelector(`${workspaceFrame}[data-source="real"]`, { timeout: 20_000 });
    await page.waitForFunction(() => !!localStorage.getItem('sima-workspace'), undefined, {
      timeout: 5_000,
    });
  },
};

export const flows: Flow[] = [
  {
    name: 'Intro plays and lands on the first visit',
    owner: 'intro',
    firstVisit: true,
    steps: [
      {
        name: 'Open with ?intro=1 and watch it to the end',
        async run(page) {
          await openWithIntro(page);
          await introGone(page, 30_000);
        },
      },
      firstVisit,
    ],
  },
  {
    name: 'Intro skips on a key and plays again from About',
    owner: 'intro',
    firstVisit: true,
    steps: [
      {
        name: 'Open with ?intro=1 and press a key',
        async run(page) {
          await openWithIntro(page);
          await page.waitForTimeout(1_500);
          await skipsQuickly(page, () => page.keyboard.press('Space'));
        },
      },
      firstVisit,
      {
        name: 'Play the intro from About, then skip it with the button',
        async run(page) {
          await press(page, 'about-button');
          await press(page, 'play-intro');
          await page.waitForSelector('#intro', { timeout: 2_000 });
          await page.waitForTimeout(1_000);
          await skipsQuickly(page, () => press(page, 'intro-skip'));
        },
      },
      firstVisit,
    ],
  },
  {
    name: 'Intro with a saved workspace, and never with a workspace link',
    owner: 'intro',
    steps: [
      dropFrame,
      {
        name: 'Reload with ?intro=1: it plays and lands with the saved frame back',
        async run(page) {
          await openWithIntro(page);
          await introGone(page, 30_000);
          await page.waitForSelector(workspaceFrame, { timeout: 10_000 });
          const fov = await page.evaluate(() => document.getElementById('sky')?.dataset.view);
          expect(
            Math.abs(Number(fov?.split(' ')[2]) - 1.9) < 0.01,
            `the sky 1.9° wide, got ${fov}`,
          );
        },
      },
      {
        name: 'A #w= workspace link with ?intro=1 opens without the intro',
        async run(page) {
          await press(page, 'share-button');
          await page.waitForFunction(() =>
            (
              document.querySelector<HTMLInputElement>('[data-guide="share-link"]')?.value ?? ''
            ).includes('#w='),
          );
          const link = new URL(await page.inputValue(guide('share-link')));
          await page.keyboard.press('Escape');
          link.searchParams.set('intro', '1');
          await openPage(page, link.href);
          expect(!(await page.$('#intro')), 'no intro');
          expect(
            await page.evaluate(() => document.documentElement.dataset.intro === undefined),
            'no html[data-intro]',
          );
          await page.waitForSelector(workspaceFrame, { timeout: 20_000 });
        },
      },
    ],
  },
];
