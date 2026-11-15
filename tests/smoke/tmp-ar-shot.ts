// Temporary: screenshots of ?lang=ar (Arabic locale lane). Not part of the smoke suite.
import { chromium } from 'playwright-core';
const out = `${process.env.HOME}/.cache/sima-rebuild/v2/arabic`;
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const q = process.argv[2] ?? 'lang=ar&intro=0';
const tag = process.argv[3] ?? 'ar';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, w, h, mobile] of [['desktop', 1920, 950, false], ['phone', 390, 844, true]] as const) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:5190/?${q}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready !== undefined, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  console.log(name, await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir, document.title, location.search]));
  await page.screenshot({ path: `${out}/${tag}-${name}.png` });
  if (process.argv[4]) {
    await page.evaluate(process.argv[4]);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${tag}-${name}-2.png` });
  }
  await ctx.close();
}
await browser.close();
