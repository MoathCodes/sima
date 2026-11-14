import { chromium } from '../../../../node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1200, height: 2200 } });
await p.goto('http://127.0.0.1:5198/docs/design-v2/mockups/tests/contrast.html'); await p.waitForTimeout(1500);
await p.screenshot({ path: process.argv[2], fullPage: true }); await b.close();
