/**
 * Around the real exposures: what the frame shows when the field is wider than they reach.
 * Owner: lane D.
 *
 * - Which real set covers a field (`covers`), and which wider patch to ask the live service for
 *   (`widerPatch`). Both use each set's nominal square: the field its cutouts were cut for.
 * - Which pixels of a field's grid no exposure covers at all (`coverageMask`). Cutouts are turned
 *   with the telescope, so even inside the nominal square some corners can be bare.
 * - The sky map's own picture of the whole field (`aroundMap`), drawn dimmed outside the
 *   exposures and labelled "Sky map (all dates averaged)" (H1). It is an average of a year of
 *   dates, so it never takes part in a measurement, a difference, blink or the change search: those
 *   read only `S.field`.
 * - What the frame says while it fetches real pictures for the wider field (`widening`).
 */
import { fieldGrid, wcsPix2Sky, wcsSky2Pix } from '../core/real.ts';
import { PIXEL_ARCSEC } from '../core/instrument.ts';
import type { Field, RealSet, TargetData } from '../core/types.ts';

/** Field sizes the live service fetches, arcminutes (docs/live-service.md). */
export const LIVE_FOVS = [3, 6, 12, 24, 48] as const;
/** Cutouts are cut this much wider than their field, arcmin (prebake.CUTOUT_MARGIN_DEG). */
const MARGIN_ARCMIN = 0.6;
/** A field may stick out of a set's square by this much and still count as covered, arcmin. */
const SLACK_ARCMIN = PIXEL_ARCSEC / 60;

// ----- Geometry (pure) -----------------------------------------------------------------------------

/** The middle of the exposures: the median of the cutout centres. */
export function centreOf(data: TargetData): { ra: number; dec: number } {
  const ras = data.frames.map((f) => f.wcs.crval[0]).sort((a, b) => a - b);
  const decs = data.frames.map((f) => f.wcs.crval[1]).sort((a, b) => a - b);
  const mid = (v: number[]) => v[v.length >> 1] ?? Number.NaN;
  const ra = mid(ras);
  const dec = mid(decs);
  return Number.isFinite(ra) && Number.isFinite(dec)
    ? { ra, dec }
    : { ra: data.catalogue.ra, dec: data.catalogue.dec };
}

/** Offset of a sky point from a centre, arcmin: x east, y north (fine for a degree or two). */
export function offsetArcmin(
  c: { ra: number; dec: number },
  ra: number,
  dec: number,
): { x: number; y: number } {
  const dra = ((((ra - c.ra) % 360) + 540) % 360) - 180;
  return { x: dra * Math.cos((c.dec * Math.PI) / 180) * 60, y: (dec - c.dec) * 60 };
}

/** The square a set's cutouts were cut for: its centre and side, arcmin. */
export function nominal(data: TargetData): { ra: number; dec: number; side: number } {
  return { ...centreOf(data), side: Math.max(0, data.size * 60 - MARGIN_ARCMIN) };
}

/**
 * True when a set was cut for a square that holds the whole field (to one pixel). Corners its
 * turned cutouts leave bare are not counted here: `coverageMask` shows them.
 *
 * @param fov Field side, arcmin.
 */
export function covers(data: TargetData, ra: number, dec: number, fov: number): boolean {
  const n = nominal(data);
  const o = offsetArcmin(n, ra, dec);
  const reach = n.side / 2 + SLACK_ARCMIN - fov / 2;
  return Math.abs(o.x) <= reach && Math.abs(o.y) <= reach;
}

/**
 * True when the field and a set's square share a strip at least `min` arcmin wide: the set still
 * has something to show there.
 */
export function overlaps(data: TargetData, ra: number, dec: number, fov: number, min = 0.5): boolean {
  const n = nominal(data);
  const o = offsetArcmin(n, ra, dec);
  const reach = n.side / 2 + fov / 2 - min;
  return Math.abs(o.x) < reach && Math.abs(o.y) < reach;
}

/** The live service's field size that holds a field: the smallest of LIVE_FOVS at least as big. */
export function liveFov(fov: number): number {
  return LIVE_FOVS.find((f) => f >= fov - 1e-6) ?? 48;
}

/**
 * The patch to ask the live service for, to cover a field the exposures on hand do not: centred
 * on the spot's own centre when one step up from the field's size holds it (so panning around a
 * spot reuses one patch rather than starting a new one at every drag), else centred on the field.
 *
 * @param home The centre of the spot's own exposures.
 * @param fov Field side, arcmin.
 */
export function widerPatch(
  home: { ra: number; dec: number },
  ra: number,
  dec: number,
  fov: number,
): { ra: number; dec: number; fov: number } {
  const own = liveFov(fov);
  const o = offsetArcmin(home, ra, dec);
  const need = fov + 2 * Math.max(Math.abs(o.x), Math.abs(o.y));
  const around = LIVE_FOVS.find((f) => f >= need - 1e-6);
  if (around !== undefined && around <= Math.max(2 * own, 12)) {
    return { ra: home.ra, dec: home.dec, fov: around };
  }
  return { ra, dec, fov: own };
}

const masks = new WeakMap<Field, Uint8Array | null>();

/**
 * Which pixels of a field's grid some exposure of the set covers: 1 covered, 0 bare. Null when
 * every pixel is covered (the usual case). Kept per field. Pure apart from that cache.
 */
export function coverageMask(set: RealSet, field: Field): Uint8Array | null {
  if (masks.has(field)) return masks.get(field) ?? null;
  const mask = makeMask(set, field);
  masks.set(field, mask);
  return mask;
}

function makeMask(set: RealSet, field: Field): Uint8Array | null {
  const n = field.n;
  // Each exposure's pixel position across the grid: affine to far better than a pixel here.
  const maps = set.frames.map(({ meta }) => {
    const at = (gx: number, gy: number) => {
      const sky = wcsPix2Sky(field.wcs, gx, gy);
      return wcsSky2Pix(meta.wcs, sky.ra, sky.dec);
    };
    const o = at(0, 0);
    const ex = at(1, 0);
    const ey = at(0, 1);
    return {
      o,
      dx: { x: ex.x - o.x, y: ex.y - o.y },
      dy: { x: ey.x - o.x, y: ey.y - o.y },
      w: meta.w,
      h: meta.h,
    };
  });
  type M = (typeof maps)[number];
  const inside = (m: M, gx: number, gy: number): boolean => {
    const x = m.o.x + m.dx.x * gx + m.dy.x * gy;
    const y = m.o.y + m.dx.y * gx + m.dy.y * gy;
    return x >= -0.5 && x <= m.w - 0.5 && y >= -0.5 && y <= m.h - 0.5;
  };
  const e = n - 1;
  if (maps.some((m) => inside(m, 0, 0) && inside(m, e, 0) && inside(m, 0, e) && inside(m, e, e))) {
    return null; // one cutout holds all four corners, so the whole square
  }
  const mask = new Uint8Array(n * n);
  let bare = 0;
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      let hit = 0;
      for (const m of maps) {
        if (inside(m, gx, gy)) {
          hit = 1;
          break;
        }
      }
      mask[gy * n + gx] = hit;
      bare += 1 - hit;
    }
  }
  return bare ? mask : null;
}

/**
 * The border between covered and bare pixels, as line segments in grid cells (pixel x spans
 * x to x + 1). Runs along a row or column are joined. Pure.
 */
export function maskOutline(mask: Uint8Array, n: number): [number, number, number, number][] {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && mask[y * n + x] === 1;
  const out: [number, number, number, number][] = [];
  // Horizontal edges: between row y - 1 and row y.
  for (let y = 0; y <= n; y++) {
    let start = -1;
    for (let x = 0; x <= n; x++) {
      const edge = x < n && on(x, y) !== on(x, y - 1);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) {
        out.push([start, y, x, y]);
        start = -1;
      }
    }
  }
  // Vertical edges: between column x - 1 and column x.
  for (let x = 0; x <= n; x++) {
    let start = -1;
    for (let y = 0; y <= n; y++) {
      const edge = y < n && on(x, y) !== on(x - 1, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) {
        out.push([x, start, x, y]);
        start = -1;
      }
    }
  }
  return out;
}

// ----- The sky map around the exposures (page only) -----------------------------------------------

let mapKey = '';
let mapCanvas: OffscreenCanvas | null = null;
let mapAbort: AbortController | null = null;

/**
 * The sky map's picture of the whole field around a field's centre, one map pixel per canvas
 * pixel; null until it has arrived (then `repaint` is called) or when no tile could be read.
 *
 * @param fov The field side on screen, arcmin (wider than the field's grid).
 * @param lam The wavelength on the bar, µm: the map's channel.
 */
export function aroundMap(
  field: Field,
  fov: number,
  lam: number,
  repaint: () => void,
): OffscreenCanvas | null {
  const key = `${field.ra.toFixed(5)}|${field.dec.toFixed(5)}|${fov}|${lam.toFixed(3)}`;
  if (key === mapKey) return mapCanvas;
  mapKey = key;
  mapCanvas = null;
  mapAbort?.abort();
  const abort = new AbortController();
  mapAbort = abort;
  void (async () => {
    try {
      const { skyPreview } = await import('./preview.ts');
      const canvas = await skyPreview(fieldGrid(field.ra, field.dec, fov), lam, abort.signal);
      if (abort.signal.aborted || key !== mapKey) return;
      mapCanvas = canvas;
      repaint();
      tell();
    } catch {
      // No map (offline, blocked): the field stays black outside the exposures.
    }
  })();
  return null;
}

// ----- Fetching real pictures for the wider field --------------------------------------------------

/** What the frame says about real pictures for a field wider than the exposures on hand. */
export interface Widening {
  /** 'busy' while the live service fetches; 'off' with no service; 'failed' when it could not. */
  state: 'busy' | 'off' | 'failed';
  /** One short line. */
  what: string;
  /** Exposures fetched and planned, when known. */
  done: number | null;
  total: number | null;
}

/** Set by load.ts; read by the frame's lines and the picture's label. */
export let widening: Widening | null = null;

const fns = new Set<() => void>();
/** Hears every change of `widening` and the arrival of a sky map. @returns Unsubscribe. */
export function onSurround(fn: () => void): () => void {
  fns.add(fn);
  return () => fns.delete(fn);
}
function tell(): void {
  for (const fn of fns) fn();
}

/** load.ts only. */
export function setWidening(w: Widening | null): void {
  widening = w;
  tell();
}

/** True when the sky map for this field, size and wavelength is on hand (for the data line). */
export function aroundMapReady(field: Field, fov: number, lam: number): boolean {
  return (
    !!mapCanvas && mapKey === `${field.ra.toFixed(5)}|${field.dec.toFixed(5)}|${fov}|${lam.toFixed(3)}`
  );
}
