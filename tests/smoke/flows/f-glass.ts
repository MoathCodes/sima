/**
 * Lane F's Night Glass flows (BEGINNER-AND-MOBILE.md 15.2): the contrast of every text colour on
 * every material over the worst real backdrops, with grain on (GLS-2); no glass in a faded,
 * filtered or masked parent (GLS-4); the blurred area within budget (GLS-5); no picture or chart
 * under glass (GLS-6); Solid through the setting and every fallback (GLS-7); the governor on a
 * software renderer (GLS-8, the rest is in tests/glass.test.ts); the view switch (VIEW-2) and the
 * link keeping the view (VIEW-4). Owner: lane F.
 */
import type { CDPSession, Page } from 'playwright-core';
import { guide, openPage, press, settle, type Flow, type Step } from '../smoke.ts';

function expect(ok: boolean, what: string): void {
  if (!ok) throw new Error(`expected ${what}`);
}

async function until(ok: () => Promise<boolean>, what: string): Promise<void> {
  for (const end = Date.now() + 10_000; Date.now() < end; ) {
    if (await ok()) return;
    await new Promise((go) => setTimeout(go, 100));
  }
  expect(await ok(), what);
}

const glassAttr = (page: Page) => page.evaluate(() => document.documentElement.dataset.glass);

/** Sets the visitor's Panels choice (or clears it) and reloads. */
async function panels(page: Page, choice: 'glass' | 'solid' | null): Promise<void> {
  await page.evaluate((c) => {
    if (c) localStorage.setItem('sima-panels', c);
    else localStorage.removeItem('sima-panels');
    localStorage.removeItem('sima-panels-auto');
  }, choice);
  await openPage(page);
}

/** Share of the window under elements with a backdrop-filter (DESIGN-v2 section 6). */
function blurredShare(page: Page): Promise<number> {
  return page.evaluate(() => {
    let a = 0;
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const cs = getComputedStyle(el);
      const bf = cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter;
      if (!bf || bf === 'none' || !el.checkVisibility({ visibilityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      const x0 = Math.max(0, r.left);
      const x1 = Math.min(innerWidth, r.right);
      const y0 = Math.max(0, r.top);
      const y1 = Math.min(innerHeight, r.bottom);
      if (x1 > x0 && y1 > y0) a += (x1 - x0) * (y1 - y0);
    }
    return a / (innerWidth * innerHeight);
  });
}

/** GLS-5: ≤ 25% at 1900×1030, ≤ 30% at 1366×768. */
const areaStep = (what: string): Step => ({
  name: `Blurred area within budget: ${what} (GLS-5)`,
  async run(page, size) {
    await settle(page);
    const share = await blurredShare(page);
    const budget = size.width >= 1900 ? 0.25 : 0.3;
    expect(share > 0, 'some glass on screen with Glass chosen');
    expect(share <= budget, `at most ${budget * 100}% of the window blurred, got ${(share * 100).toFixed(1)}%`);
  },
});

/** GLS-4: no glass element has a faded, filtered, masked, clipped or blended ancestor. */
const flatStep: Step = {
  name: 'No glass inside a faded, filtered or masked parent (GLS-4)',
  async run(page) {
    await settle(page);
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      const name = (e: Element) => (e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`);
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        const cs = getComputedStyle(el);
        if (!cs.backdropFilter || cs.backdropFilter === 'none' || !el.checkVisibility()) continue;
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const s = getComputedStyle(p);
          const why =
            Number(s.opacity) < 1
              ? `opacity ${s.opacity}`
              : s.filter !== 'none'
                ? 'filter'
                : s.maskImage !== 'none'
                  ? 'mask'
                  : s.clipPath !== 'none'
                    ? 'clip-path'
                    : s.mixBlendMode !== 'normal'
                      ? 'mix-blend-mode'
                      : s.backdropFilter !== 'none'
                        ? 'backdrop-filter (glass in glass)'
                        : '';
          if (why) out.push(`${name(el)} inside ${name(p)} (${why})`);
        }
      }
      return out;
    });
    expect(bad.length === 0, `no glass in such a parent; found ${bad.slice(0, 4).join('; ')}`);
  },
};

/** GLS-6: no picture canvas or well is inside glass or covered by glass. The sky map is not a picture. */
const wellStep: Step = {
  name: 'No picture or chart under glass (GLS-6)',
  async run(page) {
    await settle(page);
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      const glass = [...document.querySelectorAll<HTMLElement>('body *')].filter((e) => {
        const bf = getComputedStyle(e).backdropFilter;
        return bf && bf !== 'none' && e.checkVisibility();
      });
      const science = [...document.querySelectorAll<HTMLElement>('canvas, .well, #frame-pic')].filter(
        (e) => e.checkVisibility() && !e.closest('#sky, #sky-marks, #intro, [data-intro]'),
      );
      for (const s of science) {
        const r = s.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const inside = glass.find((g) => g.contains(s));
        if (inside) {
          out.push(`${s.tagName.toLowerCase()} inside #${inside.id || inside.className}`);
          continue;
        }
        for (const g of glass) {
          const q = g.getBoundingClientRect();
          const x0 = Math.max(r.left, q.left);
          const x1 = Math.min(r.right, q.right);
          const y0 = Math.max(r.top, q.top);
          const y1 = Math.min(r.bottom, q.bottom);
          if (x1 - x0 < 2 || y1 - y0 < 2) continue;
          const stack = document.elementsFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
          const gi = stack.findIndex((e) => g.contains(e));
          const si = stack.findIndex((e) => s.contains(e) || e === s);
          if (gi >= 0 && (si < 0 || gi < si)) out.push(`${s.id || s.tagName.toLowerCase()} under #${g.id || g.className}`);
        }
      }
      return out;
    });
    expect(bad.length === 0, `no picture under glass; found ${bad.slice(0, 4).join('; ')}`);
  },
};

/**
 * The text colours each surface carries (token names) on each fill, as the design uses them
 * (docs/lanes.md "Night Glass materials"): Thin carries only short labels (bare, or a pressed
 * chip); on Regular a fill takes only --ink (and --ink-2 on --card-2); status and skill pills sit
 * on Raised, Slate or Solid.
 */
type Mat = 'glass-thin' | 'glass' | 'glass-raised' | 'slate' | 'solid';
const ALL: Mat[] = ['glass-thin', 'glass', 'glass-raised', 'slate', 'solid'];
const OPENED: Mat[] = ['glass-raised', 'slate', 'solid'];
const SWATCHES: { fill: string; texts: string[]; on: Mat[]; regular?: string[] }[] = [
  { fill: 'transparent', texts: ['--ink', '--ink-2', '--ink-3'], on: ALL },
  { fill: 'var(--card-2)', texts: ['--ink', '--ink-2', '--ink-3'], regular: ['--ink', '--ink-2'], on: ALL.slice(1) },
  { fill: 'var(--card-3)', texts: ['--ink', '--ink-2'], regular: ['--ink'], on: ALL.slice(1) },
  { fill: 'var(--card-4)', texts: ['--ink'], on: ALL.slice(1) },
  { fill: 'var(--action-soft)', texts: ['--on-action-soft'], on: ALL },
  { fill: 'var(--good-soft)', texts: ['--good'], on: OPENED },
  { fill: 'var(--warn-soft)', texts: ['--warn'], on: OPENED },
  { fill: 'var(--bad-soft)', texts: ['--bad'], on: OPENED },
  { fill: 'rgb(255 255 255 / 0.14)', texts: ['--skill'], on: OPENED },
];
const MATERIALS = ALL;
const BACKDROPS = {
  white: 'background:#fff',
  sky: 'background:#05070d',
  betelgeuse:
    "background:url('/docs/design-v2/mockups/img/sky-betelgeuse-1900.jpg') -800px -380px / 1900px 1030px",
  'milky way':
    "background:url('/docs/design-v2/mockups/img/sky-milkyway-1900.jpg') -820px -650px / 1900px 1030px",
};

/**
 * GLS-2, on the built CSS: each material over four backdrops (pure white, the sky's black,
 * Betelgeuse's glare, the Milky Way core), with grain on. For each swatch, the brightest 2% of
 * its pixels against each text colour it carries must reach 4.5:1 (WCAG F83, the method of
 * docs/design-v2/mockups/tests).
 */
const contrastStep: Step = {
  name: 'Text on every material passes 4.5:1 over the brightest sky (GLS-2)',
  async run(page) {
    await settle(page);
    const fails: string[] = [];
    let worst = Infinity;
    for (const mat of MATERIALS) {
      await page.evaluate(
        ({ mat, backdrops, swatches }) => {
          document.getElementById('gls-test')?.remove();
          const box = document.createElement('div');
          box.id = 'gls-test';
          box.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483646;display:flex;pointer-events:none';
          for (const [name, css] of Object.entries(backdrops)) {
            const bk = document.createElement('div');
            bk.dataset.bk = name;
            bk.style.cssText = `position:relative;width:300px;height:260px;${css}`;
            const p = document.createElement('div');
            p.className = mat === 'solid' ? 'glass' : mat;
            if (mat === 'solid') p.style.cssText = '--mat-filter:none;--mat-tint:var(--v2-solid-tint);';
            p.style.cssText +=
              'position:absolute;inset:20px;border-radius:18px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px';
            for (const s of swatches) {
              const sw = document.createElement('div');
              sw.style.cssText = `background:${s.fill};border-radius:8px;min-height:60px`;
              p.append(sw);
            }
            bk.append(p);
            box.append(bk);
          }
          document.body.append(box);
        },
        { mat, backdrops: BACKDROPS, swatches: SWATCHES },
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll<HTMLElement>('#gls-test [data-bk]')].every((b) => {
          const url = /url\("?([^")]+)/.exec(getComputedStyle(b).backgroundImage)?.[1];
          if (!url) return true;
          const img = new Image();
          img.src = url;
          return img.complete && img.naturalWidth > 0;
        }),
      );
      await page.evaluate(() => new Promise((go) => requestAnimationFrame(() => requestAnimationFrame(go))));
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 260 } });
      const res = await page.evaluate(
        async ({ b64, swatches, names }) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext('2d', { willReadFrequently: true })!;
          g.drawImage(img, 0, 0);
          const lin = (v: number) => {
            const x = v / 255;
            return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          };
          const lum = (r: number, gg: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
          const root = getComputedStyle(document.documentElement);
          const colour = (token: string) => {
            const probe = document.createElement('span');
            probe.style.color = `var(${token})`;
            document.body.append(probe);
            const m = /(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/.exec(getComputedStyle(probe).color)!;
            probe.remove();
            return lum(+m[1]!, +m[2]!, +m[3]!);
          };
          void root;
          const out: { bk: string; sw: number; text: string; ratio: number }[] = [];
          const cells = [...document.querySelectorAll<HTMLElement>('#gls-test [data-bk]')];
          cells.forEach((bk, bi) => {
            [...bk.firstElementChild!.children].forEach((sw, si) => {
              const r = sw.getBoundingClientRect();
              const d = g.getImageData(Math.round(r.left) + 6, Math.round(r.top) + 6, Math.round(r.width) - 12, Math.round(r.height) - 12).data;
              const ls: number[] = [];
              for (let i = 0; i < d.length; i += 4) ls.push(lum(d[i]!, d[i + 1]!, d[i + 2]!));
              ls.sort((a, b) => a - b);
              const bright = ls[Math.floor(ls.length * 0.98)]!;
              for (const t of swatches[si]!.texts) {
                const tl = colour(t);
                const ratio = (Math.max(tl, bright) + 0.05) / (Math.min(tl, bright) + 0.05);
                out.push({ bk: names[bi]!, sw: si, text: t, ratio });
              }
            });
          });
          return out;
        },
        { b64: png.toString('base64'), swatches: SWATCHES, names: Object.keys(BACKDROPS) },
      );
      for (const r of res) {
        const sw = SWATCHES[r.sw]!;
        if (!sw.on.includes(mat)) continue;
        if (mat === 'glass' && sw.regular && !sw.regular.includes(r.text)) continue;
        worst = Math.min(worst, r.ratio);
        if (r.ratio < 4.5) fails.push(`${mat} ${SWATCHES[r.sw]!.fill} ${r.text} over ${r.bk}: ${r.ratio.toFixed(2)}`);
      }
    }
    await page.evaluate(() => document.getElementById('gls-test')?.remove());
    expect(fails.length === 0, `every text colour at 4.5:1 or more (lowest ${worst.toFixed(2)}); failed: ${fails.slice(0, 5).join('; ')}`);
  },
};

/** Emulates a media feature through the DevTools protocol (Playwright has no reduced transparency). */
async function emulate(page: Page, features: { name: string; value: string }[]): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features });
  return cdp;
}

const solidSteps: Step[] = [
  {
    name: 'A software renderer starts Solid and Settings says why (GLS-8)',
    async run(page) {
      await panels(page, null);
      // The smoke browser draws with SwiftShader, a software renderer.
      expect((await glassAttr(page)) === 'solid', 'Solid on a software renderer');
      expect((await blurredShare(page)) === 0, 'nothing blurred when Solid');
      await press(page, 'settings-button');
      const note = await page.locator(`${guide('settings')} [data-panels-note]`).textContent();
      expect(/graphics card/.test(note ?? ''), `Settings to say why, got "${note}"`);
      expect((await page.getAttribute(guide('panels-solid'), 'aria-checked')) === 'true', 'Solid checked');
    },
  },
  {
    name: 'Choosing Glass in Settings wins and is remembered (GLS-7)',
    async run(page) {
      await press(page, 'panels-glass');
      await until(async () => (await glassAttr(page)) === 'glass', 'Glass after choosing it');
      expect((await page.evaluate(() => localStorage.getItem('sima-panels'))) === 'glass', 'sima-panels = glass');
      await page.keyboard.press('ArrowRight');
      await until(async () => (await glassAttr(page)) === 'solid', 'the arrow key to choose Solid');
      await page.keyboard.press('Escape');
      await until(async () => !(await page.isVisible(guide('settings'))), 'Escape to close Settings');
      expect(
        await page.evaluate(() => document.activeElement?.matches('[data-guide="settings-button"]') ?? false),
        'focus back on the Settings button',
      );
      await openPage(page);
      expect((await glassAttr(page)) === 'solid', 'Solid remembered after a reload');
    },
  },
  {
    name: 'Reduced transparency gives Solid; the visitor can still pick Glass (GLS-7)',
    async run(page) {
      const cdp = await emulate(page, [{ name: 'prefers-reduced-transparency', value: 'reduce' }]);
      await panels(page, null);
      expect((await glassAttr(page)) === 'solid', 'Solid with reduced transparency');
      await panels(page, 'glass');
      expect((await glassAttr(page)) === 'glass', "the visitor's Glass to win");
      await cdp.send('Emulation.setEmulatedMedia', { features: [] });
      await cdp.detach();
    },
  },
  {
    name: 'More contrast and forced colours always give Solid (GLS-7)',
    async run(page) {
      await page.emulateMedia({ contrast: 'more' });
      await panels(page, 'glass');
      expect((await glassAttr(page)) === 'solid', 'Solid with more contrast, even with Glass chosen');
      const one = await page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        return s.getPropertyValue('--ink-3').trim() === s.getPropertyValue('--ink').trim();
      });
      expect(one, 'one text level with more contrast');
      await page.emulateMedia({ contrast: null, forcedColors: 'active' });
      await openPage(page);
      expect((await glassAttr(page)) === 'solid', 'Solid with forced colours');
      expect((await blurredShare(page)) === 0, 'no blur with forced colours');
      await page.emulateMedia({ forcedColors: null });
      await panels(page, null);
    },
  },
  {
    name: 'Phones start Solid with nothing blurred (GLS-5, GLS-7)',
    async run(page) {
      // A phone of its own (touch, 390 × 844), so the flow's page keeps its size.
      const browser = page.context().browser()!;
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      try {
        await phone.addInitScript(() => localStorage.setItem('sima-intro', '1'));
        const p = await phone.newPage();
        await openPage(p, page.url().replace(/[?#].*$/, ''));
        const coarse = await p.evaluate(() => matchMedia('(pointer: coarse)').matches);
        expect(coarse, 'the emulated phone to have a coarse pointer');
        expect((await glassAttr(p)) === 'solid', 'Solid on a phone');
        const share = await blurredShare(p);
        expect(share === 0, `0% blurred on a phone by default, got ${(share * 100).toFixed(1)}%`);
      } finally {
        await phone.close();
      }
    },
  },
];

const switchSteps: Step[] = [
  {
    name: 'The view switch: a radiogroup on screen, moved with the arrow keys (VIEW-2)',
    async run(page) {
      const sw = page.locator(guide('view-switch'));
      expect((await sw.getAttribute('role')) === 'radiogroup', 'role radiogroup');
      expect(await sw.isVisible(), 'the switch on screen in Expert');
      // Paused, so the date on screen only changes if the switch changes it.
      await page.waitForFunction(() => (window as unknown as { sima: { S: { groups: unknown[] } } }).sima.S.groups.length > 0);
      if (await page.evaluate(() => (window as unknown as { sima: { S: { playing: boolean } } }).sima.S.playing)) {
        await press(page, 'play');
      }
      // The date as the date on screen, not its index: Expert steps through single visits and
      // Discover through date windows, so the index changes while the date stays.
      type View2 = { S: { target: unknown; det: unknown; fov: unknown; epoch: number; groups: { mjd: number }[] } };
      const before = await page.evaluate(() => {
        const S = (window as unknown as { sima: View2 }).sima.S;
        return { kept: JSON.stringify([S.target, S.det, S.fov]), mjd: S.groups[S.epoch]!.mjd };
      });
      await page.locator(guide('view-expert')).focus();
      await page.keyboard.press('ArrowLeft');
      await until(
        async () => (await page.evaluate(() => document.documentElement.dataset.view)) === 'discover',
        'ArrowLeft to choose Discover',
      );
      expect(await sw.isVisible(), 'the switch on screen in Discover');
      expect((await page.getAttribute(guide('view-discover'), 'aria-checked')) === 'true', 'Discover checked');
      const after = await page.evaluate((mjd) => {
        const S = (window as unknown as { sima: View2 }).sima.S;
        const on = Math.abs(S.groups[S.epoch]!.mjd - mjd);
        return {
          kept: JSON.stringify([S.target, S.det, S.fov]),
          nearest: S.groups.every((g) => Math.abs(g.mjd - mjd) >= on),
        };
      }, before.mjd);
      expect(before.kept === after.kept, `target, detector and field size kept (${before.kept} → ${after.kept})`);
      expect(after.nearest, `the date kept: the date on screen is the nearest to MJD ${before.mjd}`);
      await page.keyboard.press('ArrowRight');
      await until(
        async () => (await page.evaluate(() => document.documentElement.dataset.view)) === 'expert',
        'ArrowRight to choose Expert',
      );
    },
  },
  {
    name: 'Share keeps the view in the link (VIEW-4)',
    async run(page) {
      await press(page, 'share-button');
      const link = await page.locator(guide('share-link')).inputValue();
      expect(/[?&]ui=expert\b/.test(link), `ui=expert in ${link}`);
      expect(!/progress|sima-missions/.test(link), 'no progress in the link');
      await page.keyboard.press('Escape');
    },
  },
];

export const flows: Flow[] = [
  {
    name: 'Night Glass: contrast, blurred area, wells (GLS-2, 4, 5, 6)',
    owner: 'F',
    steps: [
      {
        name: 'Choose Glass in Settings',
        async run(page) {
          await press(page, 'settings-button');
          await press(page, 'panels-glass');
          await until(async () => (await glassAttr(page)) === 'glass', 'Glass after choosing it');
          await page.keyboard.press('Escape');
          await until(async () => !(await page.isVisible(guide('settings'))), 'Escape to close Settings');
        },
      },
      areaStep('first screen'),
      flatStep,
      wellStep,
      {
        name: 'Open a place card',
        async run(page) {
          await page.locator(guide('chip-stars')).click();
          await page.locator(`${guide('places-list')} .pl-row`).first().click();
          await page.locator(guide('place-card')).waitFor();
        },
      },
      areaStep('a place card'),
      flatStep,
      wellStep,
      contrastStep,
    ],
  },
  {
    name: 'Solid and its fallbacks; the governor (GLS-7, GLS-8)',
    owner: 'F',
    steps: solidSteps,
  },
  {
    name: 'The view switch and the link (VIEW-2, VIEW-4)',
    owner: 'F',
    steps: switchSteps,
  },
];
