// Sums the on-screen area of every element with a backdrop-filter, per mockup and size.
// Usage (from mockups/): node tests/glass_area.mjs   (needs the static server on 127.0.0.1:5198)
import { chromium } from '../../../../node_modules/playwright-core/index.mjs';
import { readdirSync } from 'node:fs';
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const f of readdirSync('.').filter((f) => /^0[1-7]-.*\.html$/.test(f)).sort()) {
  const row = [f];
  for (const [w, h] of [[1900, 1030], [1366, 768], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(`http://127.0.0.1:5198/docs/design-v2/mockups/${f}`);
    const share = await p.evaluate(() => {
      let a = 0;
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        const bf = cs.backdropFilter || cs.webkitBackdropFilter;
        if (!bf || bf === 'none' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        const x0 = Math.max(0, r.left), x1 = Math.min(innerWidth, r.right), y0 = Math.max(0, r.top), y1 = Math.min(innerHeight, r.bottom);
        if (x1 > x0 && y1 > y0) a += (x1 - x0) * (y1 - y0);
      }
      return a / (innerWidth * innerHeight);
    });
    row.push(`${w}: ${(share * 100).toFixed(0)}%`);
    await p.close();
  }
  console.log(row.join('  '));
}
await b.close();
