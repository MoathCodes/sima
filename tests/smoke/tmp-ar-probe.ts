// Temporary probe (Arabic locale lane).
import { chromium } from 'playwright-core';
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 950 } });
await page.goto(`http://localhost:5190/?${process.argv[2]}`);
await page.waitForFunction(() => document.documentElement.dataset.ready !== undefined);
await page.waitForTimeout(1500);
console.log(await page.evaluate(process.argv[3]!));
await browser.close();
