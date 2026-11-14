/**
 * Blinking: grouping frames into pictures, matching their brightness, blending a group into one
 * picture, and the Difference picture. Owner: lane B. Pure.
 *
 * Borrowed from radiology and ensemble photometry (brightness matching) and from Backyard Worlds
 * and WiseView (one combined picture per pass): SPEC 7.4.
 */
import type { Det, Field, Frame, Group } from './types.ts';
import type { CombineHow } from './picture.ts';
import { colourMatch } from './real.ts';
import { combine } from './filters.ts';
import { finiteSorted, medianOfSorted } from './stats.ts';

/** Gains are kept inside this range; outside it the match is not trusted and 1 is used. */
const GAIN_MIN = 0.25;
const GAIN_MAX = 4;

/**
 * Brightness-match factors: scale each frame so typical stars match the reference frame of its
 * detector. Brightness is compared per detector, never across wavelengths (SPEC 7.1.2).
 *
 * The reference is the detector's first frame in time. The factor is the median, over pixels that
 * are usable in both and at least 10 times the noise above the sky in the reference, of
 * (reference − its sky) ÷ (frame − its sky): the ensemble of stars in the patch, not one star.
 * With fewer than 5 such pixels, or a factor outside 0.25 to 4, the factor is 1 (as recorded).
 *
 * @param field The frames.
 * @returns One factor per frame of `field.frames` (1 = as recorded).
 */
export function matchGains(field: Field): number[] {
  const gains = field.frames.map(() => 1);
  const refs = new Map<Det, Frame>();
  for (const f of field.frames) if (!refs.has(f.det) && f.sigma > 0) refs.set(f.det, f);
  field.frames.forEach((f, k) => {
    const ref = refs.get(f.det);
    if (!ref || ref === f || !(f.sigma > 0)) return;
    const ratios: number[] = [];
    for (let i = 0; i < f.pix.length; i++) {
      if (ref.bad[i] || f.bad[i]) continue;
      const r = ref.pix[i]! - ref.sky;
      const v = f.pix[i]! - f.sky;
      if (!(r > 10 * ref.sigma) || !(v > 3 * f.sigma)) continue;
      ratios.push(r / v);
    }
    if (ratios.length < 5) return;
    const g = medianOfSorted(finiteSorted(ratios));
    if (g >= GAIN_MIN && g <= GAIN_MAX) gains[k] = g;
  });
  return gains;
}

const letterOf = (w: number): string =>
  w < 26 ? String.fromCharCode(65 + w) : `${String.fromCharCode(65 + Math.floor(w / 26) - 1)}${String.fromCharCode(65 + (w % 26))}`;

/** A group from its frames (indices into field.frames, in time order). */
function makeGroup(field: Field, det: Det, window: number, visit: number | null, frames: number[]): Group {
  const fs = frames.map((i) => field.frames[i]!);
  const mjds = fs.map((f) => f.mjd);
  return {
    key: visit === null ? `w${window}` : `w${window}v${visit}`,
    letter: letterOf(window),
    window,
    visit,
    det,
    frames,
    mjd: fs.length ? (Math.min(...mjds) + Math.max(...mjds)) / 2 : Number.NaN,
    mjd0: fs.length ? Math.min(...mjds) : Number.NaN,
    mjd1: fs.length ? Math.max(...mjds) : Number.NaN,
    lam: fs.length ? fs.reduce((a, f) => a + f.lam, 0) / fs.length : Number.NaN,
  };
}

/**
 * The flip-book's pictures for one detector: one group per visit window (Explore's lettered
 * stops) or one per visit (Measure). A window with no exposure in this detector still gets a
 * group, with no frames, so the gap shows (H6). R Draconis's monthly windows with no exposure
 * in this detector are left out (data-format.md).
 *
 * @param by `window` (Explore) or `visit` (Measure).
 */
export function groupFrames(field: Field, det: Det, by: 'window' | 'visit'): Group[] {
  const groups: Group[] = [];
  for (let w = 0; w < field.windows; w++) {
    const idx = field.frames
      .filter((f) => f.det === det && f.window === w)
      .sort((a, b) => a.mjd - b.mjd)
      .map((f) => f.i);
    if (!idx.length) {
      if (!field.monthly) groups.push(makeGroup(field, det, w, by === 'visit' ? 0 : null, []));
      continue;
    }
    if (by === 'window') {
      groups.push(makeGroup(field, det, w, null, idx));
    } else {
      idx.forEach((i) => groups.push(makeGroup(field, det, w, field.frames[i]!.visit, [i])));
    }
  }
  return groups;
}

/**
 * "Same wavelength only" (BAR-5): in each group, keep the exposure closest to the reference
 * wavelength if it matches (core/real.ts `colourMatch`); drop groups with none, and name them.
 * It filters; it does not reorder. Empty groups (no exposure at all) are named too.
 *
 * @param refLam The reference wavelength, µm.
 * @returns The groups kept, and the dropped ones' letters in words ("pass B", or "month B" for
 *   monthly windows).
 */
export function sameColourOnly(
  field: Field,
  groups: readonly Group[],
  refLam: number,
): { groups: Group[]; missing: string[] } {
  const kept: Group[] = [];
  const missing: string[] = [];
  const word = field.monthly ? 'month' : 'pass';
  for (const g of groups) {
    let best: Frame | null = null;
    for (const i of g.frames) {
      const f = field.frames[i]!;
      if (!best || Math.abs(f.lam - refLam) < Math.abs(best.lam - refLam)) best = f;
    }
    if (best && colourMatch({ lam: refLam, bw: best.bw }, best)) {
      kept.push(makeGroup(field, g.det, g.window, g.visit, [best.i]));
    } else {
      const name = `${word} ${g.letter}`;
      if (!missing.includes(name)) missing.push(name);
    }
  }
  return { groups: kept, missing };
}

/** One frame's picture as blended: sky-subtracted and scaled when matching, flagged pixels NaN. */
function framePicture(f: Frame, match: boolean, usableOnly: boolean): Float32Array {
  const out = new Float32Array(f.pix.length);
  const sky = match && Number.isFinite(f.sky) ? f.sky : 0;
  const gain = match ? f.gain : 1;
  for (let i = 0; i < out.length; i++) {
    out[i] = usableOnly && f.bad[i] ? Number.NaN : (f.pix[i]! - sky) * gain;
  }
  return out;
}

/**
 * One picture from a group: its frames, each times its brightness-match gain when `match` is on,
 * combined pixel by pixel. With `match` on, each frame's sky level is also taken off first, so
 * every date sits on the same (zero) sky; with it off the pixels are as recorded.
 *
 * Flagged pixels are left out of the combination; where every frame is flagged, the recorded
 * values are combined instead, so the picture still shows something there (the frames' `bad`
 * masks say which pixels those are, H6). NaN where no frame has data. An empty group gives an
 * all-NaN picture. Made once per field and group, then copied out (a new array every call).
 *
 * @returns n × n µJy per pixel, screen order.
 */
export function blend(field: Field, group: Group, how: CombineHow, match: boolean): Float32Array {
  const key = `b|${group.frames.join(',')}|${how}|${match}|${gainsKey(field, group)}`;
  return cached(field, key, () => blendNow(field, group, how, match)).slice();
}

/**
 * Pictures already made for a field, by what they were made from. A field's frames do not change
 * once built, so a picture made once (a blend, the typical sky) is kept and copied out: the
 * Difference view and the flip-book redraw without combining every date again. Kept per field
 * object and dropped with it; at most 64 pictures per field.
 */
const CACHE = new WeakMap<Field, Map<string, Float32Array>>();

function cached(field: Field, key: string, make: () => Float32Array): Float32Array {
  let m = CACHE.get(field);
  if (!m) {
    m = new Map();
    CACHE.set(field, m);
  }
  let v = m.get(key);
  if (!v) {
    v = make();
    if (m.size >= 64) m.delete(m.keys().next().value!);
    m.set(key, v);
  }
  return v;
}

/** The gains of a group's frames, so a changed gain makes a new picture. */
const gainsKey = (field: Field, group: Group): string =>
  group.frames.map((i) => field.frames[i]?.gain ?? 1).join(',');

function blendNow(field: Field, group: Group, how: CombineHow, match: boolean): Float32Array {
  const size = field.n * field.n;
  const fs = group.frames.map((i) => field.frames[i]!);
  if (!fs.length) return new Float32Array(size).fill(Number.NaN);
  const clean = fs.length === 1 ? [framePicture(fs[0]!, match, true)] : fs.map((f) => framePicture(f, match, true));
  const out = clean.length === 1 ? clean[0]! : combine(clean, how);
  let holes = false;
  for (let i = 0; i < size; i++) if (!Number.isFinite(out[i]!)) holes = true;
  if (holes) {
    const raw = fs.length === 1 ? [framePicture(fs[0]!, match, false)] : fs.map((f) => framePicture(f, match, false));
    const fill = raw.length === 1 ? raw[0]! : combine(raw, how);
    for (let i = 0; i < size; i++) if (!Number.isFinite(out[i]!)) out[i] = fill[i]!;
  }
  return out;
}

/**
 * Difference (SPEC 7.1.11): this group's picture minus the median of all the groups' pictures.
 * White where something is on this date; dark where it usually sits. Empty groups take no part.
 *
 * @param groups The flip-book (S.groups).
 * @param i Index of the group on screen.
 * @returns n × n µJy per pixel; NaN where this picture or the median has no data.
 */
export function difference(
  field: Field,
  groups: readonly Group[],
  i: number,
  how: CombineHow,
  match: boolean,
): Float32Array {
  const size = field.n * field.n;
  const g = groups[i];
  if (!g || !g.frames.length) return new Float32Array(size).fill(Number.NaN);
  const used = groups.filter((x) => x.frames.length);
  const tkey = `t|${used.map((x) => `${x.frames.join(',')}:${gainsKey(field, x)}`).join(';')}|${how}|${match}`;
  const typical = cached(field, tkey, () =>
    combine(
      used.map((x) => blend(field, x, how, match)),
      'median',
    ),
  );
  const now = blend(field, g, how, match);
  const out = new Float32Array(size);
  for (let k = 0; k < size; k++) out[k] = now[k]! - typical[k]!;
  return out;
}
