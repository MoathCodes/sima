/**
 * The smoke test's vocabulary: what a flow is, and helpers for writing one. Owner: integrator.
 *
 * How to add a flow (SPEC 9.6, 11.1): make your own file in tests/smoke/flows/, named after your
 * lane (`d-frame.ts`, `h-tour.ts`, …), that exports `flows: Flow[]`. The runner (run.ts) finds it
 * by itself; you never edit another lane's flow file or the runner. Each flow runs on a fresh
 * page at 1900×1030 and at 1366×768. After the page loads, and after every step, the page settles
 * and every check runs:
 *
 * - no console error and no uncaught exception (GEN-7),
 * - the page does not scroll (GEN-7; a flow can allow it with `scrolls: true`, as embed mode does),
 * - no two visible `[data-card]` elements overlap, and none leaves the window (11.1).
 *
 * Find parts by their `data-guide` names (docs/lanes.md), not by classes or text: those names are
 * the contract the guide uses too, so a flow keeps working while a lane restyles its part.
 *
 * `SMOKE_SHOTS=1 npm run smoke` saves a screenshot of every step in test-results/smoke/. A failed
 * step is always saved there.
 */
import type { Page } from 'playwright-core';

/** A window size the page must work at (SPEC 0: desktop first). */
export interface Size {
  width: number;
  height: number;
}

/** One thing the user does. */
export interface Step {
  /** Short, in words: "Open Measure". It names the screenshot. */
  name: string;
  /** Does it. Throw (or let a Playwright call time out) if the page cannot do it. */
  run(page: Page, size: Size): Promise<void>;
}

/** A path through the page, run at both sizes. */
export interface Flow {
  /** Short, in words: "Measure and the picture tools". */
  name: string;
  /** Who keeps it working: a lane letter (`D`) or `integrator`. */
  owner: string;
  /** Address after the origin; default `/`. */
  path?: string;
  /** True when the page may scroll (embed mode lays the frame, bar and Measure in the page flow). */
  scrolls?: boolean;
  /** Run only at these sizes; default both. Use it sparingly: both sizes must work. */
  sizes?: Size[];
  steps: Step[];
}

export const SIZES: readonly Size[] = [
  { width: 1900, height: 1030 },
  { width: 1366, height: 768 },
];

/** The selector of a part by its `data-guide` name. */
export function guide(name: string): string {
  return `[data-guide="${name}"]`;
}

/**
 * Loads `url` (or reloads the page) and waits until it is ready: `data-ready` on `<html>` and the
 * fonts in. It does not wait for the `load` event, and allows 30 s: on a busy machine the sky's
 * WebGL start alone can take several seconds.
 */
export async function openPage(page: Page, url?: string): Promise<void> {
  if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  else await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('html[data-ready]', { state: 'attached', timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** A step that reloads the page and waits until it is ready. */
export function reloadStep(label = 'Reload'): Step {
  return { name: label, run: (page) => openPage(page) };
}

/** Clicks the part with this `data-guide` name. */
export async function press(page: Page, name: string): Promise<void> {
  await page.locator(guide(name)).first().click();
}

/** A step that clicks one part by its `data-guide` name. */
export function pressStep(name: string, label = `Press ${name}`): Step {
  return { name: label, run: (page) => press(page, name) };
}

/** A step that presses a key anywhere on the page (not while typing). */
export function keyStep(key: string, label = `Key ${key}`): Step {
  return { name: label, run: (page) => page.keyboard.press(key) };
}

/**
 * Waits until the page is still: no running finite animation or transition (endless ones, such
 * as a loading bar, are ignored), then two more drawn frames. At most `timeout` ms: generous,
 * because on a busy machine one change can start the next fade late; an animation that never
 * ends still fails.
 */
export async function settle(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    () =>
      document.getAnimations().every((a) => {
        const t = a.effect?.getComputedTiming();
        return a.playState !== 'running' || t?.iterations === Infinity;
      }),
    undefined,
    { timeout, polling: 50 },
  );
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
}
