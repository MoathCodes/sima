// Tests for the picture tools (docs/tools.md): display.ts, filters.ts, picture.ts and csv.ts.
// Owner: lane B. Run with `node --test tests/tools.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LUT_SIZE,
  NOISE_WHITE,
  clampCustom,
  histogram,
  limits,
  makeLut,
  toRgba,
} from '../src/core/display.ts';
import {
  cleanUp,
  combine,
  gaussianSmooth,
  median3x3,
  sigmaClip,
  subtractBackground,
} from '../src/core/filters.ts';
import {
  DEFAULT_PIC,
  cleanupSteps,
  decodePic,
  encodePic,
  withoutCleanup,
  type PicSettings,
} from '../src/core/picture.ts';
import { toCsv } from '../src/core/csv.ts';

/** Seeded random numbers (mulberry32), so the tests never change. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian noise (Box-Muller). */
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

const SKY = 100;
const SIGMA = 2;
const NOISE = { sky: SKY, sigma: SIGMA };

/** An n × n star field: sky plus noise, and a few bright stars. */
function starField(n: number, seed = 1, stars = 5): Float32Array {
  const r = rng(seed);
  const pix = new Float32Array(n * n);
  for (let i = 0; i < pix.length; i++) pix[i] = SKY + SIGMA * gauss(r);
  for (let s = 0; s < stars; s++) pix[Math.floor(r() * n * n)] = 1e5;
  return pix;
}

const lum = (lut: Uint8ClampedArray, i: number): number =>
  0.2126 * lut[i * 4] + 0.7152 * lut[i * 4 + 1] + 0.0722 * lut[i * 4 + 2];

/** The LUT step a value falls on, as toRgba picks it. */
const stepOf = (v: number, lo: number, hi: number): number =>
  Math.min(LUT_SIZE - 1, Math.max(0, Math.round(((v - lo) / (hi - lo)) * (LUT_SIZE - 1))));

test('default look: sky black, noise faint, a 5-sigma star clear, bright stars white', () => {
  const pix = starField(64);
  const r = limits(pix, DEFAULT_PIC, NOISE);
  assert.equal(r.lo, SKY);
  assert.equal(r.hi, SKY + NOISE_WHITE.asinh * SIGMA);
  assert.equal(NOISE_WHITE.asinh, DEFAULT_PIC.white, 'default noise limits = default custom range');
  const lut = makeLut(DEFAULT_PIC, 3);
  assert.equal(lut.length, LUT_SIZE * 4);
  const at = (units: number) => lum(lut, stepOf(SKY + units * SIGMA, r.lo, r.hi)) / 255;
  assert.equal(at(0), 0);
  assert.ok(at(1) > 0.03 && at(1) < 0.2, `1 noise unit at ${at(1)}`);
  assert.ok(at(5) > 0.15 && at(5) < 0.4, `5 noise units at ${at(5)}`);
  assert.ok(at(1000) > 0.95, 'bright star near white');
  // Band for D3 is the detector's teal (#3fd0c0) in the middle, not grey.
  const band = makeLut({ ...DEFAULT_PIC, stretch: 'linear' }, 3);
  const mid = (LUT_SIZE * 0.6) | 0;
  assert.ok(band[mid * 4 + 1]! > band[mid * 4]! + 100, 'teal: much more green than red');
  for (let i = 0; i < LUT_SIZE; i++) assert.equal(lut[i * 4 + 3], 255);
});

test('toRgba: NaN is opaque black; values below and above the range clamp', () => {
  const lut = makeLut({ ...DEFAULT_PIC, cmap: 'mono' }, 1);
  const pix = Float32Array.from([Number.NaN, -1e9, 1e9, 0.5]);
  const out = toRgba(pix, { lo: 0, hi: 1 }, lut);
  assert.deepEqual([...out.subarray(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...out.subarray(4, 8)], [0, 0, 0, 255]);
  assert.deepEqual([...out.subarray(8, 12)], [255, 255, 255, 255]);
  const inv = toRgba(
    pix,
    { lo: 0, hi: 1 },
    makeLut({ ...DEFAULT_PIC, cmap: 'mono', invert: true }, 1),
  );
  assert.deepEqual([...inv.subarray(0, 4)], [0, 0, 0, 255], 'no data stays black when inverted');
  assert.deepEqual([...inv.subarray(4, 8)], [255, 255, 255, 255], 'inverted sky is white');
  const given = new Uint8ClampedArray(16);
  assert.equal(toRgba(pix, { lo: 0, hi: 1 }, lut, given), given);
});

test('every stretch and colour map rises steadily from black to its top', () => {
  const pix = starField(48);
  const range = limits(pix, DEFAULT_PIC, NOISE);
  for (const stretch of ['linear', 'sqrt', 'log', 'asinh', 'equal'] as const) {
    for (const cmap of ['band', 'thermal', 'mono', 'viridis'] as const) {
      const lut = makeLut({ ...DEFAULT_PIC, stretch, cmap }, 5, pix, range);
      let prev = -1;
      for (let i = 0; i < LUT_SIZE; i++) {
        const l = lum(lut, i);
        assert.ok(l >= prev - 1, `${stretch}/${cmap} drops at step ${i}: ${prev} → ${l}`);
        prev = Math.max(prev, l);
      }
      assert.ok(lum(lut, 0) < 25, `${stretch}/${cmap} starts dark`);
      assert.ok(lum(lut, LUT_SIZE - 1) > 200, `${stretch}/${cmap} ends bright`);
    }
  }
});

test('thermal and viridis follow matplotlib at their ends and middle', () => {
  const t = makeLut({ ...DEFAULT_PIC, stretch: 'linear', cmap: 'thermal' }, 1);
  const v = makeLut({ ...DEFAULT_PIC, stretch: 'linear', cmap: 'viridis' }, 1);
  const rgb = (l: Uint8ClampedArray, i: number) => [...l.subarray(i * 4, i * 4 + 3)];
  assert.deepEqual(rgb(t, 0), [0, 0, 4]);
  assert.deepEqual(rgb(t, LUT_SIZE - 1), [252, 255, 164]);
  assert.deepEqual(rgb(v, 0), [68, 1, 84]);
  assert.deepEqual(rgb(v, LUT_SIZE - 1), [253, 231, 37]);
  // matplotlib viridis(0.5) = (33, 145, 140).
  const mid = rgb(v, Math.round((LUT_SIZE - 1) / 2));
  [33, 145, 140].forEach((c, k) => assert.ok(Math.abs(mid[k]! - c) <= 2, `viridis(0.5) ${mid}`));
});

test('brightness and contrast move and steepen the curve', () => {
  const base = makeLut({ ...DEFAULT_PIC, stretch: 'linear', cmap: 'mono' }, 1);
  const bright = makeLut({ ...DEFAULT_PIC, stretch: 'linear', cmap: 'mono', brightness: 0.5 }, 1);
  const steep = makeLut({ ...DEFAULT_PIC, stretch: 'linear', cmap: 'mono', contrast: 2 }, 1);
  const q = (LUT_SIZE * 0.25) | 0;
  assert.ok(bright[q * 4]! > base[q * 4]!, 'brighter');
  assert.ok(steep[q * 4]! < base[q * 4]!, 'steeper: dark parts darker');
  assert.equal(steep[((LUT_SIZE * 0.8) | 0) * 4], 255, 'steeper: bright parts reach white sooner');
});

test('zscale and 99.5% ignore a few bright stars; min to max does not', () => {
  const pix = starField(100, 7, 8);
  for (const mode of ['zscale', 'pct'] as const) {
    const r = limits(pix, { ...DEFAULT_PIC, limits: mode }, NOISE);
    assert.ok(r.lo > SKY - 10 * SIGMA && r.lo < SKY, `${mode} black ${r.lo}`);
    assert.ok(r.hi > SKY && r.hi < SKY + 10 * SIGMA, `${mode} white ${r.hi}`);
  }
  const mm = limits(pix, { ...DEFAULT_PIC, limits: 'minmax' }, NOISE);
  assert.equal(mm.hi, 1e5);
});

test('custom limits are noise units above the sky, clamped', () => {
  const pix = starField(32);
  const custom = (black: number, white: number) =>
    limits(pix, { ...DEFAULT_PIC, limits: 'custom', black, white }, NOISE);
  assert.deepEqual(custom(-2, 41.3), { lo: SKY - 2 * SIGMA, hi: SKY + 41.3 * SIGMA });
  assert.equal(custom(-500, 10).lo, SKY - 50 * SIGMA);
  assert.equal(custom(0, 1e7).hi, SKY + 1e5 * SIGMA);
  const flipped = custom(20, 5);
  assert.ok(flipped.hi > flipped.lo, 'white stays above black');
  assert.deepEqual(clampCustom(-60, 200000), { black: -50, white: 100000 });
  assert.ok(clampCustom(30, 30).white > 30);
  assert.deepEqual(clampCustom(Number.NaN, Number.NaN), { black: 0, white: 800 });
  // Without a usable noise level, the picture's own is measured.
  const r = limits(
    pix,
    { ...DEFAULT_PIC, limits: 'custom', black: 0, white: 10 },
    { sky: NaN, sigma: 0 },
  );
  assert.ok(Math.abs(r.lo - SKY) < 1 && Math.abs(r.hi - r.lo - 10 * SIGMA) < 4, `${r.lo} ${r.hi}`);
});

test('a picture without data gives 0 to 1', () => {
  const empty = new Float32Array(16).fill(Number.NaN);
  for (const mode of ['noise', 'zscale', 'pct', 'minmax', 'custom'] as const) {
    assert.deepEqual(limits(empty, { ...DEFAULT_PIC, limits: mode }, { sky: NaN, sigma: NaN }), {
      lo: 0,
      hi: 1,
    });
  }
});

test('histogram counts every finite pixel on an asinh axis in noise units', () => {
  const pix = starField(40);
  pix[3] = Number.NaN;
  pix[4] = Number.POSITIVE_INFINITY;
  const h = histogram(pix, 64, NOISE);
  assert.equal(h.counts.length, 64);
  assert.equal(h.edges.length, 65);
  assert.equal(
    h.counts.reduce((a, b) => a + b, 0),
    pix.length - 2,
  );
  for (let i = 1; i < h.edges.length; i++) assert.ok(h.edges[i]! > h.edges[i - 1]!);
  assert.ok(h.edges[0]! < 0 && h.edges[64]! >= (1e5 - SKY) / SIGMA - 1);
  // asinh axis: the bins around the sky are narrow, those near bright stars wide.
  const width = (i: number) => h.edges[i + 1]! - h.edges[i]!;
  assert.ok(width(63) > 100 * width(10));
});

test('background step removes a slope', () => {
  const n = 60;
  const r = rng(3);
  const pix = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) pix[y * n + x] = 50 + 2 * x + y + gauss(r);
  const copy = pix.slice();
  const out = subtractBackground(pix, n);
  assert.deepEqual(pix, copy, 'input unchanged');
  // The surface follows the slope to the edges; what is left is the noise.
  let sum = 0;
  let sum2 = 0;
  let m = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      sum += out[y * n + x]!;
      sum2 += out[y * n + x]! ** 2;
      m++;
    }
  }
  const mean = sum / m;
  const rms = Math.sqrt(sum2 / m);
  assert.ok(Math.abs(mean) < 0.5, `mean left ${mean}`);
  assert.ok(rms < 1.5, `rms left ${rms} (slope spans 180)`);
});

test('background step: a star does not raise its box, NaN stays NaN', () => {
  const n = 48;
  const pix = starField(n, 9, 0);
  pix[n * 24 + 24] = 1e5;
  pix[0] = Number.NaN;
  const bad = new Uint8Array(n * n);
  const out = subtractBackground(pix, n, bad);
  assert.ok(Number.isNaN(out[0]));
  let s = 0;
  for (let i = 1; i < out.length; i++) if (i !== n * 24 + 24) s += out[i]!;
  assert.ok(Math.abs(s / (out.length - 2)) < 0.3);
});

test('sigma clipping removes an outlier', () => {
  const r = rng(5);
  const vals: number[] = [];
  for (let i = 0; i < 200; i++) vals.push(10 + gauss(r));
  vals.push(1000, Number.NaN);
  const c = sigmaClip(vals);
  assert.equal(c.kept <= 200, true);
  assert.ok(Math.abs(c.mean - 10) < 0.3, `mean ${c.mean}`);
  assert.ok(c.sigma > 0.7 && c.sigma < 1.3, `sigma ${c.sigma}`);
  assert.deepEqual(sigmaClip([Number.NaN]), { mean: NaN, sigma: NaN, kept: 0 });
});

test('3 × 3 median removes a hot pixel and keeps no-data pixels as no data', () => {
  const n = 9;
  const pix = new Float32Array(n * n).fill(5);
  pix[40] = 9000;
  pix[0] = Number.NaN;
  const copy = pix.slice();
  const out = median3x3(pix, n);
  assert.deepEqual(pix, copy);
  assert.equal(out[40], 5);
  assert.ok(Number.isNaN(out[0]));
  assert.equal(out[1], 5);
});

test('smoothing leaves flagged pixels out and keeps the total of a flat field', () => {
  const n = 11;
  const pix = new Float32Array(n * n).fill(20);
  pix[60] = 1e6; // a flagged cosmic ray
  const bad = new Uint8Array(n * n);
  bad[60] = 1;
  const out = gaussianSmooth(pix, n, 1, bad);
  for (let i = 0; i < out.length; i++) {
    if (i === 60) assert.equal(out[i], 1e6, 'the flagged pixel keeps its own value');
    else assert.ok(Math.abs(out[i]! - 20) < 1e-4, `pixel ${i} took in the flagged one: ${out[i]}`);
  }
  // Without the flag, the spike is spread out.
  assert.ok(gaussianSmooth(pix, n, 1)[61]! > 1000);
  assert.deepEqual(gaussianSmooth(pix, n, 0), pix);
});

test('combine: clip and median drop a cosmic ray, mean keeps it; NaN left out', () => {
  const a = Float32Array.from([10, 1, NaN]);
  const b = Float32Array.from([11, 2, NaN]);
  const c = Float32Array.from([10.5, 3, 7]);
  const ray = Float32Array.from([5000, 2, NaN]);
  const pics = [a, b, c, ray];
  const clip = combine(pics, 'clip');
  assert.ok(Math.abs(clip[0]! - 10.5) < 1e-6, `clip ${clip[0]}`);
  assert.ok(Math.abs(clip[1]! - 2) < 1e-6);
  assert.equal(clip[2], 7);
  assert.ok(Math.abs(combine(pics, 'median')[0]! - 10.75) < 1e-6);
  assert.ok(combine(pics, 'mean')[0]! > 1000);
  assert.ok(Number.isNaN(combine([a, b], 'mean')[2]));
  assert.equal(combine([], 'mean').length, 0);
  assert.deepEqual(a, Float32Array.from([10, 1, NaN]), 'input unchanged');
});

test('cleanUp runs only the steps that are on', () => {
  const n = 9;
  const pix = new Float32Array(n * n).fill(5);
  pix[40] = 9000;
  assert.deepEqual(cleanUp(pix, n, DEFAULT_PIC), pix);
  assert.equal(cleanUp(pix, n, { ...DEFAULT_PIC, median: true })[40], 5);
  const all = cleanUp(pix, n, { ...DEFAULT_PIC, background: true, median: true, smooth: 1 });
  assert.ok(Math.abs(all[40]!) < 1e-4);
});

test('cleanupSteps names the steps in the order they run', () => {
  assert.deepEqual(cleanupSteps(DEFAULT_PIC), []);
  assert.deepEqual(
    cleanupSteps({
      ...DEFAULT_PIC,
      smooth: 1,
      median: true,
      background: true,
      combinePass: true,
      combineBy: 'clip',
    }),
    [
      'each pass combined (sigma clip)',
      'background removed',
      '3 × 3 median filter',
      'smoothed 1 px',
    ],
  );
  assert.deepEqual(
    cleanupSteps(withoutCleanup({ ...DEFAULT_PIC, background: true, smooth: 2 })),
    [],
  );
});

test('pic=: the defaults write nothing; the documented examples read back', () => {
  assert.equal(encodePic(DEFAULT_PIC), '');
  assert.deepEqual(decodePic(''), { pic: DEFAULT_PIC, unknown: [] });
  const a = decodePic('st.log_lim.zscale_cm.mono_inv.1');
  assert.deepEqual(a.unknown, []);
  assert.equal(a.pic.stretch, 'log');
  assert.equal(a.pic.limits, 'zscale');
  assert.equal(a.pic.cmap, 'mono');
  assert.equal(a.pic.invert, true);
  assert.equal(encodePic(a.pic), 'st.log_lim.zscale_cm.mono_inv.1');
  const b = decodePic('lim.custom_lo.0_hi.41.3');
  assert.deepEqual(b.unknown, []);
  assert.equal(b.pic.black, 0);
  assert.equal(b.pic.white, 41.3);
  assert.equal(encodePic(b.pic), 'lim.custom_lo.0_hi.41.3');
  assert.equal(decodePic('fk.3').pic.threshold, 3);
  assert.equal(encodePic({ ...DEFAULT_PIC, threshold: 3 }), 'fk.3');
});

test('pic=: many settings survive a round trip', () => {
  const r = rng(11);
  const pickOne = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const colours = ['r', 'g', 'b', 'off'] as const;
  for (let i = 0; i < 300; i++) {
    const black = Math.round((r() * 100 - 50) * 10) / 10;
    let mix = Array.from({ length: 6 }, () => pickOne(colours));
    if (mix.every((m) => m === 'off')) mix = ['r', 'off', 'off', 'off', 'off', 'off'];
    const p: PicSettings = {
      limits: pickOne(['noise', 'zscale', 'pct', 'minmax', 'custom'] as const),
      black,
      white: black + 0.5 + Math.round(r() * 5000),
      stretch: pickOne(['linear', 'sqrt', 'log', 'asinh', 'equal'] as const),
      brightness: Math.round((r() * 2 - 1) * 100) / 100,
      contrast: Math.round((0.1 + r() * 4) * 100) / 100,
      cmap: pickOne(['band', 'thermal', 'mono', 'viridis'] as const),
      invert: r() < 0.5,
      mix: mix as unknown as PicSettings['mix'],
      match: r() < 0.5,
      background: r() < 0.5,
      median: r() < 0.5,
      smooth: pickOne([0, 0.5, 1, 2] as const),
      combinePass: r() < 0.5,
      combineBy: pickOne(['mean', 'median', 'clip'] as const),
      threshold: pickOne([3, 4, 5, 6.5, 10]),
    };
    const text = encodePic(p);
    assert.match(text, /^[a-z0-9._-]*$/, 'link-safe');
    const back = decodePic(text);
    assert.deepEqual(back.unknown, [], text);
    assert.deepEqual(back.pic, p, text);
  }
});

test('pic=: unknown and out-of-range values stay at the default and are named in words', () => {
  const d = decodePic('st.wobbly_hi.200000_sm.3_lim.zscale_zz.1_br.-4_ct.0_mt.yes_cb.mode');
  assert.equal(d.pic.stretch, DEFAULT_PIC.stretch);
  assert.equal(d.pic.white, DEFAULT_PIC.white);
  assert.equal(d.pic.smooth, DEFAULT_PIC.smooth);
  assert.equal(d.pic.limits, 'zscale', 'good values in the same link still apply');
  assert.deepEqual(d.unknown, [
    'stretch',
    'white point',
    'smoothing',
    'setting "zz"',
    'brightness',
    'contrast',
    'brightness match',
    'combine by',
  ]);
  // A white point that is not above the black point.
  const w = decodePic('lim.custom_lo.900');
  assert.ok(w.pic.white > w.pic.black);
  assert.ok(w.unknown.length > 0);
  assert.deepEqual(decodePic('fk.11').unknown, ['change threshold']);
  assert.deepEqual(decodePic('fk.abc').unknown, ['change threshold']);
});

test('pic=: a threshold stored by an older version (k) is still read', () => {
  const d = decodePic('k.4_st.sqrt');
  assert.deepEqual(d.unknown, []);
  assert.equal(d.pic.threshold, 4);
  assert.equal(encodePic(d.pic), 'st.sqrt_fk.4');
});

test('pic=: the Color view mix survives a link and is never empty', () => {
  const p: PicSettings = { ...DEFAULT_PIC, mix: ['r', 'off', 'g', 'g', 'off', 'b'] };
  assert.equal(encodePic(p), 'mix.rxggxb');
  assert.deepEqual(decodePic('mix.rxggxb').pic.mix, ['r', 'off', 'g', 'g', 'off', 'b']);
  const empty = decodePic('mix.xxxxxx');
  assert.deepEqual(empty.pic.mix, DEFAULT_PIC.mix);
  assert.deepEqual(empty.unknown, ['Color view mix']);
  assert.deepEqual(decodePic('mix.rgb').unknown, ['Color view mix']);
  assert.deepEqual(decodePic('mix.rgbrgq').unknown, ['Color view mix']);
});

test('CSV: notes first, RFC 4180 quoting, CRLF, empty cells', () => {
  const text = toCsv(
    ['Sima candidates: not discoveries', 'two\nlines'],
    ['name', 'flux_uJy', 'saturated', 'note'],
    [
      ['Barnard\'s Star, "BD+04 3561a"', 12.5, true, null],
      ['line\r\nbreak', Number.NaN, false, '#1 spot'],
      ['plain', -0.25, false, ''],
    ],
  );
  assert.equal(
    text,
    '# Sima candidates: not discoveries\r\n' +
      '# two\r\n' +
      '# lines\r\n' +
      'name,flux_uJy,saturated,note\r\n' +
      '"Barnard\'s Star, ""BD+04 3561a""",12.5,1,\r\n' +
      '"line\r\nbreak",,0,"#1 spot"\r\n' +
      'plain,-0.25,0,\r\n',
  );
  assert.equal(toCsv([], ['a'], []), 'a\r\n');
});
