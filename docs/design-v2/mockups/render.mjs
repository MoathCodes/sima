// Renders each mockup to png/<name>-<width>.png. Usage: node render.mjs [name-filter]
import { chromium } from '../../../node_modules/playwright-core/index.mjs';
import { readdirSync } from 'node:fs';
const only = process.argv[2] ?? '';
const DESKTOP_ONLY = ['08-materials'];
const sizes = [[1900, 1030], [1366, 768], [390, 844]];
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const f of readdirSync('.').filter((f) => /^\d\d-.*\.html$/.test(f) && f.includes(only)).sort()) {
  const name = f.replace('.html', '');
  for (const [w, h] of sizes) {
    if (w < 700 && DESKTOP_ONLY.includes(name)) continue;
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(`http://127.0.0.1:5198/docs/design-v2/mockups/${f}`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(600);
    await p.screenshot({ path: `png/${name}-${w}.png` });
    await p.close();
  }
  console.log('rendered', name);
}
await b.close();
