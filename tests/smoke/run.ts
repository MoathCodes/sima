/**
 * The smoke test (SPEC 9.2 item 7, 11.1): `npm run smoke`. Owner: integrator.
 *
 * It starts the Vite dev server on a free port with the live service off (SIMA_LIVE=off), opens
 * the page in headless Chromium (the build in ~/.cache/ms-playwright that playwright-core
 * 1.63.0 expects, chromium_headless_shell-1243: nothing is downloaded) and runs every flow in
 * tests/smoke/flows/ at 1900×1030 and 1366×768. smoke.ts says what a flow is and what is
 * checked after each step.
 *
 * `npm run smoke -- measure` runs only the flows whose name contains "measure".
 * `SMOKE_SHOTS=1 npm run smoke` saves a screenshot of every step in test-results/smoke/.
 *
 * Exit code 0 when every check passed, 1 otherwise. Servers and the browser are always stopped.
 */
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { createServer as createNetServer } from 'node:net';
import { mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SIZES, settle, type Flow, type Size, type Step } from './smoke.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = fileURLToPath(new URL('../../test-results/smoke/', import.meta.url));
const SAVE_EVERY_STEP = process.env.SMOKE_SHOTS === '1';
const ONLY = process.argv.slice(2).join(' ').toLowerCase();

/** A TCP port nothing listens on right now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/** Every flow in tests/smoke/flows/, file by file in name order. */
async function loadFlows(): Promise<Flow[]> {
  const dir = new URL('./flows/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.ts')).sort();
  const flows: Flow[] = [];
  for (const file of files) {
    const mod = (await import(new URL(file, dir).href)) as { flows?: unknown };
    if (!Array.isArray(mod.flows))
      throw new Error(`tests/smoke/flows/${file}: export flows: Flow[]`);
    flows.push(...(mod.flows as Flow[]));
  }
  return flows.filter((f) => !ONLY || f.name.toLowerCase().includes(ONLY));
}

/** What is wrong with the page right now: scrolling, cards that overlap or leave the window. */
function check(page: Page, scrolls: boolean): Promise<string[]> {
  return page.evaluate((scrolls) => {
    const out: string[] = [];
    const box = (r: DOMRect) =>
      `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`;
    const tol = 1; // CSS pixels: sub-pixel rounding is not an overlap

    if (!scrolls) {
      for (const el of [document.documentElement, document.body]) {
        const name = el.tagName.toLowerCase();
        if (el.scrollHeight > el.clientHeight + tol || el.scrollWidth > el.clientWidth + tol) {
          out.push(
            `the page can scroll: <${name}> holds ${el.scrollWidth}×${el.scrollHeight} px in ${el.clientWidth}×${el.clientHeight}`,
          );
        }
        if (el.scrollTop || el.scrollLeft) {
          out.push(`the page scrolled: <${name}> is at ${el.scrollLeft}, ${el.scrollTop}`);
        }
      }
    }

    const cards = [...document.querySelectorAll<HTMLElement>('[data-card]')]
      .filter((el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
      .map((el) => ({ el, name: el.dataset.card || el.id, r: el.getBoundingClientRect() }))
      .filter((c) => c.r.width > 0 && c.r.height > 0);

    if (!scrolls) {
      for (const c of cards) {
        const r = c.r;
        if (
          r.left < -tol ||
          r.top < -tol ||
          r.right > innerWidth + tol ||
          r.bottom > innerHeight + tol
        ) {
          out.push(`card "${c.name}" leaves the ${innerWidth}×${innerHeight} window: ${box(r)}`);
        }
      }
    }
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i]!;
        const b = cards[j]!;
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > tol && h > tol) {
          out.push(
            `cards "${a.name}" (${box(a.r)}) and "${b.name}" (${box(b.r)}) overlap by ${Math.round(w)}×${Math.round(h)} px`,
          );
        }
      }
    }
    return out;
  }, scrolls);
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Runs one flow at one size on a fresh page. Returns the number of failed steps (0 or 1). */
async function runFlow(browser: Browser, base: string, flow: Flow, size: Size): Promise<number> {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const at = m.location();
    errors.push(`console error: ${m.text()}${at.url ? ` (${at.url}:${at.lineNumber})` : ''}`);
  });
  page.on('pageerror', (err) => errors.push(`uncaught exception: ${err.message}`));

  const load: Step = {
    name: 'Load the page',
    async run(p) {
      await p.goto(base + (flow.path ?? '/'));
      await p.waitForSelector('html[data-ready]', { state: 'attached' });
      await p.evaluate(() => document.fonts.ready.then(() => undefined));
    },
  };
  const where = `${flow.name} @ ${size.width}×${size.height}`;
  console.log(`\n${where} (owner: ${flow.owner})`);
  let failed = 0;
  for (const [i, step] of [load, ...flow.steps].entries()) {
    const problems: string[] = [];
    try {
      await step.run(page, size);
      await settle(page);
    } catch (err) {
      problems.push(`the step failed: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
    }
    problems.push(...errors.splice(0));
    problems.push(...(await check(page, flow.scrolls ?? false)));
    if (problems.length || SAVE_EVERY_STEP) {
      const file = `${SHOTS}${slug(flow.name)}-${size.width}-${String(i).padStart(2, '0')}-${slug(step.name)}.png`;
      await page.screenshot({ path: file }).catch(() => undefined);
      if (problems.length) problems.push(`screenshot: ${file}`);
    }
    console.log(`  ${problems.length ? '✗' : '✓'} ${step.name}`);
    for (const p of problems) console.log(`      ${p}`);
    if (problems.length) {
      failed = 1; // the next steps build on this one
      break;
    }
  }
  await context.close();
  return failed;
}

async function main(): Promise<void> {
  const flows = await loadFlows();
  if (!flows.length) throw new Error(`no flow matches "${ONLY}"`);
  await mkdir(SHOTS, { recursive: true });

  process.env.SIMA_LIVE = 'off'; // never depend on Python or NASA's archive
  const port = await freePort();
  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;
  let failed = 0;
  let runs = 0;
  try {
    server = await createServer({
      root: ROOT,
      logLevel: 'warn',
      clearScreen: false,
      server: { host: '127.0.0.1', port, strictPort: true },
    });
    await server.listen();
    browser = await chromium.launch({
      headless: true,
      // WebGL for the sky map (Aladin Lite) without a GPU.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const base = `http://127.0.0.1:${port}`;
    console.log(`Smoke test on ${base}, ${flows.length} flows`);
    for (const flow of flows) {
      for (const size of flow.sizes ?? SIZES) {
        runs += 1;
        failed += await runFlow(browser, base, flow, size);
      }
    }
  } finally {
    await browser?.close();
    await server?.close();
  }
  console.log(
    failed
      ? `\nSmoke test FAILED: ${failed} of ${runs} runs had a problem.`
      : `\nSmoke test passed: ${runs} runs, every check clean.`,
  );
  process.exitCode = failed ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
