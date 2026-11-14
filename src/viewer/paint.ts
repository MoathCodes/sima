/**
 * The pixel work behind the frame's six views, with caching so a step through the dates is one
 * table lookup per pixel at most (SPEC 11.2: a frame step under 50 ms). Owner: lane D.
 *
 * Everything here works on the field's grid (n × n, north up, east left, µJy per pixel) and goes
 * through the science core: `groupPicture` and `difference` (core/blink.ts), `combine`
 * (core/filters.ts), `pictures` and `stack` (core/work.ts, off the page's thread), and `limits`,
 * `makeLut`, `toRgba` (core/display.ts). No page access except building ImageData.
 *
 * Methods borrowed from other fields (SPEC 7.4): brightness matching (radiology), two dates in
 * one red and cyan picture (remote sensing), new/reference/difference (transient surveys),
 * a ghost trail (sports broadcasts).
 */
import { difference, groupPicture as makePicture } from '../core/blink.ts';
import { combine } from '../core/filters.ts';
import { limits, makeLut, toRgba, LUT_SIZE, type Range } from '../core/display.ts';
import type { StackResult } from '../core/stack.ts';
import { pictures, stack } from '../core/work.ts';
import type { PicSettings } from '../core/picture.ts';
import type { CatalogueTrack, Det, Field, Group } from '../core/types.ts';

/** How one flip-book is shown: one range and one colour table for every date (brightness matching). */
export interface Look {
  range: Range;
  lut: Uint8ClampedArray;
  /** The sky level and noise the range is based on, µJy. */
  sky: number;
  sigma: number;
}

/** Per field: pictures and tone-mapped images, keyed by what made them. */
interface FieldCache {
  pix: Map<string, Float32Array>;
  img: Map<string, ImageData>;
  other: Map<string, unknown>;
}

const caches = new WeakMap<Field, FieldCache>();
/** Cached entries per field before the oldest are dropped (pictures are at most 468² floats). */
const MAX_ENTRIES = 400;

function cacheOf(field: Field): FieldCache {
  let c = caches.get(field);
  if (!c) {
    c = { pix: new Map(), img: new Map(), other: new Map() };
    caches.set(field, c);
  }
  return c;
}

function remember<T>(map: Map<string, T>, key: string, make: () => T): T {
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  const value = make();
  if (map.size >= MAX_ENTRIES) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, value);
  return value;
}

/** A short key for the settings that change pixels (clean-up), not only their look. */
function cleanKey(p: PicSettings): string {
  return `${p.match ? 'm' : ''}${p.background ? 'b' : ''}${p.median ? 'd' : ''}s${p.smooth}${p.combineBy}`;
}

/** A short key for the settings that change only the look. */
function lookKey(p: PicSettings): string {
  return `${p.limits}|${p.black}|${p.white}|${p.stretch}|${p.brightness}|${p.contrast}|${p.cmap}|${p.invert}`;
}

function groupKey(g: Group): string {
  return `${g.key}|d${g.det}|${g.frames.join(',')}`;
}

/**
 * One date's picture: its exposures blended (brightness-matched when `match` is on), then the
 * clean-up steps that are on (core/blink.ts `groupPicture`). Kept per field, group and settings;
 * `picturesReady` makes them off the page's thread first.
 */
export function groupPicture(field: Field, group: Group, p: PicSettings): Float32Array {
  const c = cacheOf(field);
  return remember(c.pix, pictureKey(group, p), () => makePicture(field, group, p));
}

const pictureKey = (group: Group, p: PicSettings): string => `g|${groupKey(group)}|${cleanKey(p)}`;

/** Pictures being made in the worker, per field and picture key. */
const making = new WeakMap<Field, Map<string, Promise<void>>>();

/**
 * True when every picture of these groups with these settings is ready, so drawing them takes no
 * blending or clean-up on the page (TLS-8: the median filter alone held the page 140 ms). If
 * not, it has them made in lane B's worker (core/work.ts `pictures`) and calls `ready` once they
 * are kept; the caller keeps the previous picture on screen meanwhile. Where the worker cannot
 * make them, they are made here, in a later task.
 */
export function picturesReady(
  field: Field,
  groups: readonly (Group | null | undefined)[],
  p: PicSettings,
  ready: () => void,
): boolean {
  const c = cacheOf(field);
  let jobs = making.get(field);
  if (!jobs) making.set(field, (jobs = new Map()));
  const waits = new Set<Promise<void>>();
  const missing = new Map<string, Group>();
  for (const g of groups) {
    if (!g?.frames.length) continue;
    const key = pictureKey(g, p);
    if (c.pix.has(key)) continue;
    const job = jobs.get(key);
    if (job) waits.add(job);
    else missing.set(key, g);
  }
  if (missing.size) {
    const keys = [...missing.keys()];
    const list = [...missing.values()];
    const keep = (pics: readonly Float32Array[]) =>
      keys.forEach((k, i) => {
        const pix = pics[i];
        if (pix && !c.pix.has(k)) remember(c.pix, k, () => pix);
      });
    const job = pictures(field, list, p)
      .then(keep, (err: unknown) => {
        if ((err as DOMException)?.name === 'AbortError') return;
        // No worker for this patch: make them here, one picture per task.
        return list.reduce<Promise<void>>(
          (prev, g) => prev.then(() => new Promise<void>((go) => setTimeout(() => (groupPicture(field, g, p), go()), 0))),
          Promise.resolve(),
        );
      })
      .finally(() => keys.forEach((k) => jobs.delete(k)));
    for (const k of keys) jobs.set(k, job);
    waits.add(job);
  }
  if (!waits.size) return true;
  void Promise.all(waits).then(ready);
  return false;
}

/** Median of the finite values of an array; NaN when there are none. */
export function median(values: ArrayLike<number>): number {
  const v: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const x = values[i] ?? Number.NaN;
    if (Number.isFinite(x)) v.push(x);
  }
  if (!v.length) return Number.NaN;
  v.sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? (v[m] ?? Number.NaN) : ((v[m - 1] ?? 0) + (v[m] ?? 0)) / 2;
}

/** The sky level and noise of a detector's pictures, µJy (the noise is the detector's median). */
export function noiseOf(
  field: Field,
  det: Det,
  groups: readonly Group[],
): { sky: number; sigma: number } {
  const skies: number[] = [];
  for (const g of groups)
    for (const i of g.frames) {
      const f = field.frames[i];
      if (f && Number.isFinite(f.sky)) skies.push(f.sky * (Number.isFinite(f.gain) ? f.gain : 1));
    }
  const sigma = field.noise[det - 1] ?? Number.NaN;
  return {
    sky: skies.length ? median(skies) : 0,
    sigma: Number.isFinite(sigma) && sigma > 0 ? sigma : 1,
  };
}

/** The group a flip-book's look is based on: the reference, or the first with exposures. */
export function refGroup(groups: readonly Group[], refIndex: number): Group | undefined {
  return groups[refIndex]?.frames.length ? groups[refIndex] : groups.find((g) => g.frames.length);
}

/**
 * The look of a flip-book: black and white points from the reference date's picture, used for
 * every date, so brightness is compared fairly (SPEC 7.4, "brightness matching").
 *
 * @param refIndex The reference group (S.ref); the first group with exposures if it has none.
 */
export function lookFor(
  field: Field,
  groups: readonly Group[],
  refIndex: number,
  p: PicSettings,
  det: Det,
): Look {
  const c = cacheOf(field);
  const ref = refGroup(groups, refIndex);
  const key = `look|${ref ? groupKey(ref) : 'none'}|${cleanKey(p)}|${lookKey(p)}|${det}`;
  return remember(c.other as Map<string, Look>, key, () => {
    const noise = noiseOf(field, det, groups);
    const pix = ref ? groupPicture(field, ref, p) : new Float32Array(field.n * field.n);
    return { range: limits(pix, p, noise), lut: makeLut(p, det), ...noise };
  });
}

/** Tone-maps a picture into an image through a look. */
export function imageOf(field: Field, key: string, pix: Float32Array, look: Look): ImageData {
  const c = cacheOf(field);
  const full = `${key}|${look.range.lo}|${look.range.hi}|${lutId(look.lut)}`;
  return remember(c.img, full, () => {
    const rgba = new Uint8ClampedArray(toRgba(pix, look.range, look.lut));
    markMissing(pix, rgba);
    return new ImageData(rgba, field.n, field.n);
  });
}

/**
 * Pixels with no usable value (flagged, such as a saturated star's core, or not covered by the
 * exposure) are drawn in the window's raised tone, not black, so they never pass for dark sky
 * (H6). Beyond the field's grid the picture stays pure black.
 */
export const MISSING_RGB = [0x1a, 0x22, 0x40] as const; // --st-raise
function markMissing(pix: Float32Array, rgba: Uint8ClampedArray): void {
  for (let i = 0; i < pix.length; i++) {
    if (Number.isFinite(pix[i] ?? Number.NaN)) continue;
    rgba[i * 4] = MISSING_RGB[0];
    rgba[i * 4 + 1] = MISSING_RGB[1];
    rgba[i * 4 + 2] = MISSING_RGB[2];
    rgba[i * 4 + 3] = 255;
  }
}

const lutIds = new WeakMap<Uint8ClampedArray, number>();
let lutCount = 0;
function lutId(lut: Uint8ClampedArray): number {
  let id = lutIds.get(lut);
  if (id === undefined) {
    id = ++lutCount;
    lutIds.set(lut, id);
  }
  return id;
}

/** Flip: one date's picture, through the flip-book's look. */
export function flipImage(field: Field, group: Group, look: Look, p: PicSettings): ImageData {
  return imageOf(
    field,
    `flip|${groupKey(group)}|${cleanKey(p)}`,
    groupPicture(field, group, p),
    look,
  );
}

/**
 * Brightness 0..1 of each pixel through the look, ignoring the colour map (for Two dates and
 * Trail, which colour the dates themselves). NaN stays NaN.
 */
const monoLuts = new Map<string, Uint8ClampedArray>();
function intensity(pix: Float32Array, look: Look, p: PicSettings): Float32Array {
  const mk = lookKey(p);
  let mono = monoLuts.get(mk);
  if (!mono) {
    mono = makeLut({ ...p, cmap: 'mono', invert: false }, 1);
    if (monoLuts.size > 20) monoLuts.clear();
    monoLuts.set(mk, mono);
  }
  const out = new Float32Array(pix.length);
  const { lo, hi } = look.range;
  const span = hi - lo || 1;
  for (let i = 0; i < pix.length; i++) {
    const v = pix[i] ?? Number.NaN;
    if (!Number.isFinite(v)) {
      out[i] = Number.NaN;
      continue;
    }
    const t = Math.max(0, Math.min(LUT_SIZE - 1, Math.round(((v - lo) / span) * (LUT_SIZE - 1))));
    out[i] = (mono[t * 4] ?? 0) / 255;
  }
  return out;
}

/**
 * Two dates in one still picture: the earlier date in red, the later in cyan (remote sensing).
 * What did not change adds up to white or grey.
 */
export function twoDatesImage(
  field: Field,
  earlier: Group,
  later: Group,
  look: Look,
  p: PicSettings,
): ImageData {
  const c = cacheOf(field);
  const key = `two|${groupKey(earlier)}|${groupKey(later)}|${cleanKey(p)}|${lookKey(p)}|${look.range.lo}|${look.range.hi}`;
  return remember(c.img, key, () => {
    const a = intensity(groupPicture(field, earlier, p), look, p);
    const b = intensity(groupPicture(field, later, p), look, p);
    const img = new ImageData(field.n, field.n);
    for (let i = 0; i < a.length; i++) {
      const r = a[i] ?? Number.NaN;
      const g = b[i] ?? Number.NaN;
      if (!Number.isFinite(r) && !Number.isFinite(g)) {
        img.data.set([...MISSING_RGB, 255], i * 4);
        continue;
      }
      img.data[i * 4] = Number.isFinite(r) ? 255 * r : 0;
      img.data[i * 4 + 1] = Number.isFinite(g) ? 255 * g : 0;
      img.data[i * 4 + 2] = Number.isFinite(g) ? 255 * g : 0;
      img.data[i * 4 + 3] = 255;
    }
    return img;
  });
}

/**
 * Difference (SPEC 7.1.11): this date minus the median of all dates, in grey. White is where
 * something is on this date; dark is where it usually sits. Mid grey is "no change". The scale
 * is ±8 times the noise, softened so bright stars do not hide faint changes.
 */
export function differencePicture(
  field: Field,
  groups: readonly Group[],
  i: number,
  p: PicSettings,
): Float32Array {
  const c = cacheOf(field);
  const key = `diff|${groups.map(groupKey).join(';')}|${i}|${cleanKey(p)}`;
  return remember(c.pix, key, () => difference(field, groups, i, p.combineBy, p.match));
}

export function differenceImage(
  field: Field,
  groups: readonly Group[],
  i: number,
  look: Look,
  p: PicSettings,
): ImageData {
  const pix = differencePicture(field, groups, i, p);
  const c = cacheOf(field);
  const key = `diffimg|${groups.map(groupKey).join(';')}|${i}|${cleanKey(p)}|${look.sigma}|${p.invert}`;
  return remember(c.img, key, () => {
    const img = new ImageData(field.n, field.n);
    const scale = 8 * look.sigma;
    for (let k = 0; k < pix.length; k++) {
      const v = pix[k] ?? Number.NaN;
      let t = Number.isFinite(v) ? 0.5 + 0.5 * Math.tanh(v / scale) : 0;
      if (p.invert && Number.isFinite(v)) t = 1 - t;
      if (!Number.isFinite(v)) {
        img.data.set([...MISSING_RGB, 255], k * 4);
        continue;
      }
      const g = Math.round(255 * t);
      img.data.set([g, g, g, 255], k * 4);
    }
    return img;
  });
}

/** Stack: every exposure of the detector added up (along the target's motion when it has one). */
export interface StackView {
  pix: Float32Array;
  /** What it is, in words, for the badge. */
  label: string;
  /** How many exposures. */
  frames: number;
  /** The two controls (SPEC 7.1.9), when stacked along a motion. */
  result: StackResult | null;
}

const stacking = new Map<string, Promise<void>>();

/**
 * Stack: every exposure of the detector added up. Along the target's motion it runs off the
 * page's thread (core/work.ts `stack`, on the patch given to `usePatch`): until it is ready this
 * returns null and `ready` is called once it is (the caller redraws). Without a motion the dates
 * are combined here (cheap).
 */
export function stackPicture(
  field: Field,
  groups: readonly Group[],
  det: Det,
  track: CatalogueTrack | null,
  p: PicSettings,
  ready: () => void,
): StackView | null {
  const c = cacheOf(field);
  const cache = c.other as Map<string, StackView>;
  const moving = !!track && Math.hypot(track.pmra, track.pmdec) > 0;
  const key = `stack|${det}|${moving && track ? `${track.pmra},${track.pmdec}` : groups.map(groupKey).join(';')}|${p.combineBy}`;
  if (moving && track) {
    const hit = cache.get(key);
    if (hit) return hit;
    if (!stacking.has(key)) {
      const job = stack(det, track, p.combineBy)
        .then((result) => {
          cache.set(key, {
            pix: result.along.pix,
            label: result.along.label,
            frames: result.frames,
            result,
          });
          ready();
        })
        .catch((err: unknown) => {
          if ((err as DOMException)?.name !== 'AbortError')
            console.warn('paint: stacking failed', err);
        })
        .finally(() => stacking.delete(key));
      stacking.set(key, job);
    }
    return null;
  }
  return remember(cache, key, () => {
    const pics = groups.filter((g) => g.frames.length).map((g) => groupPicture(field, g, p));
    const frames = groups.reduce((s, g) => s + g.frames.length, 0);
    return {
      pix: pics.length ? combine(pics, p.combineBy) : new Float32Array(field.n * field.n),
      label: 'All dates added up',
      frames,
      result: null,
    };
  });
}

export function stackImage(field: Field, view: StackView, look: Look, p: PicSettings): ImageData {
  return imageOf(field, `stackimg|${view.label}|${view.frames}|${cleanKey(p)}`, view.pix, look);
}

/**
 * Trail: the dates up to this one drawn on top of each other, older ones fainter, so a mover
 * leaves a fading trail (a ghost trail, as sports broadcasts show a ball's path).
 */
export function trailImage(
  field: Field,
  groups: readonly Group[],
  upTo: number,
  look: Look,
  p: PicSettings,
): ImageData {
  const c = cacheOf(field);
  const key = `trail|${groups.map(groupKey).join(';')}|${upTo}|${cleanKey(p)}|${lookKey(p)}|${look.range.lo}|${look.range.hi}`;
  return remember(c.img, key, () => {
    const cur = groups[upTo];
    const base = cur
      ? flipImage(field, cur, look, p).data
      : new Uint8ClampedArray(field.n * field.n * 4);
    const img = new ImageData(new Uint8ClampedArray(base), field.n, field.n);
    const acc = new Float32Array(field.n * field.n);
    for (let j = 0; j < upTo; j++) {
      const g = groups[j];
      if (!g?.frames.length) continue;
      const w = 0.25 + (0.45 * (j + 1)) / Math.max(1, upTo);
      const t = intensity(groupPicture(field, g, p), look, p);
      for (let k = 0; k < acc.length; k++) {
        const v = (t[k] ?? 0) * w;
        if (v > (acc[k] ?? 0)) acc[k] = v;
      }
    }
    // The earlier dates in pale window ink under the current date in its own colours.
    for (let k = 0; k < acc.length; k++) {
      const ghost = 215 * (acc[k] ?? 0);
      for (let ch = 0; ch < 3; ch++) {
        const i = k * 4 + ch;
        if (ghost > (img.data[i] ?? 0)) img.data[i] = ghost;
      }
    }
    return img;
  });
}

/**
 * Color: up to six detectors as one picture. Each of red, green and blue is the mean of the
 * tone-mapped pictures of the detectors the mix gives it (docs/tools.md, "Color view mix").
 *
 * @param byDet For each detector 1 to 6, its group for this date (or null) and its look.
 */
export function colourImage(
  field: Field,
  byDet: readonly ({ group: Group; look: Look } | null)[],
  p: PicSettings,
): ImageData {
  const c = cacheOf(field);
  const key = `color|${byDet.map((d) => (d ? `${groupKey(d.group)}@${d.look.range.lo},${d.look.range.hi}` : '-')).join(';')}|${cleanKey(p)}|${lookKey(p)}|${p.mix.join('')}`;
  return remember(c.img, key, () => {
    const size = field.n * field.n;
    const sums = [new Float32Array(size), new Float32Array(size), new Float32Array(size)];
    const counts = [0, 0, 0];
    byDet.forEach((d, idx) => {
      const ch = { r: 0, g: 1, b: 2, off: -1 }[p.mix[idx] ?? 'off'];
      if (!d || ch === undefined || ch < 0 || !d.group.frames.length) return;
      const t = intensity(groupPicture(field, d.group, p), d.look, p);
      const sum = sums[ch];
      if (!sum) return;
      counts[ch] = (counts[ch] ?? 0) + 1;
      for (let k = 0; k < size; k++) {
        const v = t[k] ?? Number.NaN;
        if (Number.isFinite(v)) sum[k] = (sum[k] ?? 0) + v;
      }
    });
    const img = new ImageData(field.n, field.n);
    for (let k = 0; k < size; k++) {
      for (let ch = 0; ch < 3; ch++) {
        const n = counts[ch] ?? 0;
        img.data[k * 4 + ch] = n ? (255 * (sums[ch]?.[k] ?? 0)) / n : 0;
      }
      img.data[k * 4 + 3] = 255;
    }
    return img;
  });
}

/** Forgets every cached picture of a field (after its frames change in place, which they should not). */
export function forget(field: Field): void {
  caches.delete(field);
}
