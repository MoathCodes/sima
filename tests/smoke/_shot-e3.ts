import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
const out = `${homedir()}/.cache/sima-rebuild/v2/lane-e-density`;
const exe = `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, w, h, path, mobile] of [['discover', 1366, 650, '/?ui=discover&target=barnard', false], ['phone', 390, 844, '/?ui=expert&target=barnard', true]] as const) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript(() => { localStorage.setItem('sima-intro', '1'); localStorage.setItem('sima-guide', JSON.stringify({ tips: ['measure-words'] })); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto('http://localhost:5186' + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-ready]', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${out}/${name}-${w}.png` });
  console.log(name, await page.evaluate(() => { const s = document.querySelector('.fp-seq'); const r = s?.getBoundingClientRect(); const q = (c: string) => JSON.stringify(document.querySelector(c)?.getBoundingClientRect()); return [JSON.stringify(r), q('.fp-head'), q('.fp-ring'), q('.fp-dot:last-of-type'), getComputedStyle(document.querySelector('.fp-head')!).transform]; }));
  await ctx.close();
}
await browser.close();
