// Temporary: lane E interaction screenshots. Usage: node tests/smoke/_shot-e2.ts
import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
const out = `${homedir()}/.cache/sima-rebuild/v2/lane-e-density`;
const exe = `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const size = { width: Number(process.env.W ?? 1366), height: Number(process.env.H ?? 650) };
const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { localStorage.setItem('sima-intro', '1'); localStorage.setItem('sima-view', 'expert'); localStorage.setItem('sima-guide', JSON.stringify({ tips: ['measure-words'] })); });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
const shot = (n: string) => page.screenshot({ path: `${out}/${n}-${size.width}.png` });
for (const t of (process.env.T ?? 'barnard').split(',')) {
  await page.goto(`http://localhost:5186/?target=${t}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-ready]', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(Number(process.env.WAIT ?? 8000));
  await shot(`t-${t}`);
  if (process.env.ALL) {
    await page.click('[data-guide="all-numbers"]');
    await page.waitForTimeout(2500);
    await shot(`all-${t}`);
    console.log(t, await page.evaluate(() => { const m = document.getElementById('measure')!; return [m.scrollHeight, m.clientHeight, m.getBoundingClientRect().bottom, document.getElementById('bar')!.getBoundingClientRect().top]; }));
    await page.click('[data-guide="all-numbers"]');
  }
  if (process.env.POP) {
    await page.click('[data-guide="frame-info"]');
    await page.waitForTimeout(500);
    await shot(`pop-info-${t}`);
    await page.keyboard.press('Escape');
    await page.click('[data-guide="fov"]');
    await page.waitForTimeout(500);
    await shot(`pop-fov-${t}`);
    await page.keyboard.press('Escape');
    if (await page.locator('[data-guide="measure-info"]').isVisible()) {
      await page.click('[data-guide="measure-info"]');
      await page.waitForTimeout(500);
      await shot(`pop-ms-${t}`);
      await page.keyboard.press('Escape');
    }
    await page.click('[data-guide="view-two"]');
    await page.waitForTimeout(800);
    await shot(`two-${t}`);
  }
}
await browser.close();
