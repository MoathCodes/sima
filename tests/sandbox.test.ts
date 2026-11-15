// The sandbox (O-V7): the pretend planet's physics (a labelled model, H4), the verdict against
// the patch's measured noise, its yearly shift, and the rule that a pretend object never reaches
// a measurement, list, chart or export of real data (H3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  DEFAULT_PLANET,
  answer,
  brightness,
  clampPlanet,
  detectorLams,
  fmtCount,
  fmtFlux,
  fmtTimes,
  geometry,
  placeOn,
  planck,
  pointNoise,
  temperature,
  verdict,
  yearlyShift,
  type DetectorNoise,
} from '../src/core/sandbox.ts';
import { separation } from '../src/core/astro.ts';
import { psfWidth } from '../src/core/stack.ts';
import { loadField } from './core-data.ts';

const near = (a: number, b: number, rel: number) =>
  assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);

test('the Sun at 1 AU comes out at V −26.7 (5772 K blackbody, IAU radius)', () => {
  const sun = (Math.PI * planck(0.55, 5772) * (6.957e8 / 1.495978707e11) ** 2) / 1e-26; // Jy
  near(-2.5 * Math.log10(sun / 3640), -26.74, 0.01);
});

test('Neptune where it is comes out near its real brightness, V about 7.8', () => {
  // NASA Neptune Fact Sheet: mean radius 24,622 km, 30.07 AU, geometric albedo 0.442.
  const nep = { radius: 24_622 / 6_371, distance: 30.07, albedo: 0.442, ownHeat: 0 };
  const jy = brightness(nep, 0.55).total / 1e6;
  near(-2.5 * Math.log10(jy / 3640), 7.8, 0.03);
});

test('the Earth’s temperature from sunlight is about 255 K; heat of its own adds as T⁴', () => {
  near(temperature({ radius: 1, distance: 1, albedo: 0.306, ownHeat: 0 }).sunlit, 254.3, 0.01);
  const far = temperature({ radius: 4, distance: 500, albedo: 0.4, ownHeat: 40 });
  near(far.total, Math.pow(far.sunlit ** 4 + 40 ** 4, 0.25), 1e-12);
});

test('reflected light fades as the fourth power of distance; the glow needs warmth', () => {
  const a = brightness({ ...DEFAULT_PLANET, distance: 250 }, 1.37).reflected;
  const b = brightness({ ...DEFAULT_PLANET, distance: 500 }, 1.37).reflected;
  near(a / b, 16, 0.01);
  // At 500 AU and 11 K there is no glow to speak of at 4.7 µm; with 150 K of its own there is.
  assert.ok(brightness(DEFAULT_PLANET, 4.71).glow < 1e-50);
  assert.ok(brightness({ ...DEFAULT_PLANET, ownHeat: 150 }, 4.71).glow > 1);
});

test('seen 90° from the Sun: distance √(r² − 1), phase asin(1/r)', () => {
  const g = geometry(5);
  near(g.delta, Math.sqrt(24), 1e-12);
  near(g.phase, Math.asin(0.2), 1e-12);
});

test('the yearly shift: parallax asin(1/r) to each side, and the orbit 2π/√r AU a year', () => {
  const y = yearlyShift(DEFAULT_PLANET); // 500 AU
  near(y.parallax, 412.53, 0.001);
  near(y.parallaxPixels, 412.53 / 6.15, 0.001);
  near(y.orbit, 115.9, 0.01);
  // Its place on a date swings by the parallax around its mean place.
  const at = { ra: 133.787, dec: -7.244 };
  const swings = [61000, 61091, 61182, 61273].map((mjd) => separation(at.ra, at.dec, placeOn(DEFAULT_PLANET, at, mjd).ra, placeOn(DEFAULT_PLANET, at, mjd).dec) * 3600);
  assert.ok(Math.max(...swings) <= 412.6 && Math.max(...swings) > 300, swings.join(', '));
});

test('inputs are kept within their limits', () => {
  assert.deepEqual(clampPlanet({ radius: -1, distance: 1e6, albedo: 2, ownHeat: Number.NaN }), {
    radius: 0.1,
    distance: 2000,
    albedo: 1,
    ownHeat: 0,
  });
});

test('against the measured noise: one exposure, a stack of N, and how many it would need', () => {
  const n: DetectorNoise[] = [{ det: 1, pixelNoise: 20, width: 0.7, exposures: 12 }];
  const [a] = answer(DEFAULT_PLANET, n);
  near(a!.noise, 20 * Math.sqrt(4 * Math.PI * 0.49), 1e-12);
  near(a!.one, a!.total / a!.noise, 1e-12);
  near(a!.stacked, a!.one * Math.sqrt(12), 1e-12);
  assert.equal(a!.needed, Math.ceil((5 / a!.one) ** 2));
  assert.equal(pointNoise({ det: 2, pixelNoise: Number.NaN, width: 0.7, exposures: 0 }), Number.NaN);
  assert.equal(verdict(answer(DEFAULT_PLANET, [{ det: 1, pixelNoise: Number.NaN, width: 1, exposures: 0 }])).kind, 'unknown');
});

test('on the shipped patches: a Neptune-sized planet shows at 300 AU, not at 800 AU (the About text)', async () => {
  for (const key of ['barnard', 'wise-0855', 'r-dra']) {
    const f = await loadField(key);
    const noises = [1, 2, 3, 4, 5, 6].map((det) => ({
      det,
      pixelNoise: f.noise[det - 1]!,
      width: psfWidth(f, det),
      exposures: f.frames.filter((x) => x.det === det).length,
    }));
    const at = (d: number) => verdict(answer({ ...DEFAULT_PLANET, distance: d }, noises));
    assert.equal(at(300).kind, 'one', key);
    const v500 = at(500);
    assert.ok(v500.best!.one > 0.5 && v500.best!.one < 2, `${key} 500 AU: ${v500.best!.one}`);
    assert.ok(v500.best!.needed > 10 && v500.best!.needed < 60, `${key} 500 AU needs ${v500.best!.needed}`);
    const v800 = at(800);
    assert.equal(v800.kind, 'no', key);
    assert.ok(v800.best!.needed > 500 && v800.best!.needed < 2000, `${key} 800 AU needs ${v800.best!.needed}`);
  }
});

test('words: fluxes, times the noise, counts', () => {
  assert.equal(fmtFlux(44.3), '44');
  assert.equal(fmtFlux(1382535), '1,382,535');
  assert.equal(fmtFlux(0.0021), '0.0021');
  assert.equal(fmtFlux(2.5e-7), '2.5 × 10⁻⁷');
  assert.equal(fmtTimes(31735.2), '31,735×');
  assert.equal(fmtTimes(0.98), '0.98×');
  assert.equal(fmtCount(25), '25');
  assert.equal(fmtCount(3.2e6), '3.2 million');
  assert.equal(fmtCount(2e13), '2 × 10¹³');
  assert.equal(detectorLams().length, 6);
});

// ----- H3: a pretend object never reaches a measurement, list, chart or export ----------------

test('working out a pretend planet leaves the patch’s pixels exactly as they were', async () => {
  const f = await loadField('wise-0855');
  const before = f.frames.map((x) => x.pix.slice());
  const noise = f.noise.slice();
  answer({ radius: 30, distance: 5, albedo: 1, ownHeat: 200 }, [1, 2, 3, 4, 5, 6].map((det) => ({ det, pixelNoise: f.noise[det - 1]!, width: 0.7, exposures: 12 })));
  placeOn(DEFAULT_PLANET, { ra: f.ra, dec: f.dec }, f.frames[0]!.mjd);
  f.frames.forEach((x, i) => assert.deepEqual(x.pix, before[i]));
  assert.deepEqual(f.noise, noise);
});

/** Every .ts file under src/, as paths relative to src/. */
function sources(dir = new URL('../src/', import.meta.url).pathname, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p, root);
    return p.endsWith('.ts') ? [relative(root, p)] : [];
  });
}

test('only the sandbox card, the page’s start and About import the sandbox', () => {
  const allowed = new Set(['shell/sandbox.ts', 'main.ts', 'page/about.ts']);
  const importers = sources().filter((file) => {
    const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    return /from\s+['"][^'"]*\/sandbox\.ts['"]/.test(text);
  });
  for (const file of importers) assert.ok(allowed.has(file), `${file} imports the sandbox`);
  // About and the start only open it.
  for (const file of ['main.ts', 'page/about.ts']) {
    const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    const names = [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*sandbox\.ts['"]/g)].flatMap((m) =>
      m[1]!.split(',').map((s) => s.trim()).filter(Boolean),
    );
    for (const n of names) assert.match(n, /^(startSandbox|openSandbox)$/, `${file} imports ${n}`);
  }
});

test('the sandbox card exports only its card and the reading for Discover\'s Planet X mission', () => {
  const text = readFileSync(new URL('../src/shell/sandbox.ts', import.meta.url), 'utf8');
  const exported = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
  // v2.0: `sandboxState`/`onSandbox` let the Planet X mission read the verdict (H3: it stays
  // "Simulated"; the next test keeps it out of everything that measures, lists or exports).
  assert.deepEqual(exported.sort(), ['closeSandbox', 'onSandbox', 'openSandbox', 'sandboxOpen', 'sandboxState', 'startSandbox']);
  // It never writes the frame's state, and it draws only through draw hooks.
  assert.doesNotMatch(text, /\bS\.\w+\s*=[^=]/);
  assert.doesNotMatch(text, /\.pix\[|\.values\[|\.frames\.push|\.neighbours\.push/);
  assert.match(text, /drawHooks\.add\(drawPlanet\)/);
});

test('the modules that measure, list, chart and export never import the sandbox', () => {
  const real = sources().filter((f) =>
    /^(viewer\/(detail|inbox|tools|share|url|load|paint|render|playback)\.ts|viewer\/(measure|tools)\/|core\/(?!sandbox\.ts))/.test(f),
  );
  assert.ok(real.length > 20, `${real.length}`);
  for (const file of real) {
    const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /sandbox/i, `${file} mentions the sandbox`);
  }
});
