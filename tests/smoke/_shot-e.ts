// Temporary: lane E density screenshots. Usage: node tests/smoke/_shot-e.ts <tag> [path]
import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
const tag = process.argv[2] ?? 'x';
const path = process.argv[3] ?? '/';
const out = `${homedir()}/.cache/sima-rebuild/v2/lane-e-density`;
const exe = `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const size of [{ width: 1920, height: 950 }, { width: 1366, height: 650 }]) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { localStorage.setItem('sima-intro', '1'); localStorage.setItem('sima-view', 'expert'); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto('http://localhost:5186' + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-ready]', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(Number(process.env.WAIT ?? 9000));
  if (process.env.EVAL) console.log(await page.evaluate(process.env.EVAL));
  await page.screenshot({ path: `${out}/${tag}-${size.width}.png` });
  await ctx.close();
}
await browser.close();
