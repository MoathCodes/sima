/**
 * Measure's charts, drawn on canvas in a dark data window (DESIGN.md "Data windows"): points
 * with ±1 error bars, lines, shaded bands, and the Path chart. Owner: lane E.
 *
 * Colours: detector hues for detector data, pass tints for dates, Path Amber for anything worked
 * out rather than observed (fits, catalogue predictions), magenta for where the user looks.
 */
import { sizeCanvas, token, num } from '../tools/dom.ts';
import { mjdToYear } from '../../core/astro.ts';
import type { Candidate } from '../../core/detect.ts';

export interface Pt {
  x: number;
  y: number;
  /** ±1 error on y. */
  err?: number;
  colour: string;
  /** Drawn hollow: under 2σ, or a lower limit. */
  hollow?: boolean;
  /** Squares for averages (visit means), dots otherwise. */
  square?: boolean;
  /** A lower limit: an arrow pointing to brighter. */
  lower?: boolean;
  /** Magenta ring: the point of the picture on screen. */
  ring?: boolean;
}

export interface Line {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  colour: string;
  dash?: boolean;
}

export interface Band {
  x0: number;
  x1: number;
  label: string;
}

export interface ChartSpec {
  points: Pt[];
  lines?: Line[];
  bands?: Band[];
  /** Axis lettering. */
  yLabel: string;
  xKind: 'date' | 'lam' | 'phase' | 'plain';
  /** Magnitudes: brighter is up. */
  invertY?: boolean;
  /** Shown in the middle when there are no points (H5: say why). */
  empty?: string;
  xRange?: [number, number];
}

const PAD = { l: 44, r: 10, t: 10, b: 20 };

/** Draws a chart into a canvas (CSS size taken from the element). */
export function drawChart(canvas: HTMLCanvasElement, spec: ChartSpec): void {
  const ctx = sizeCanvas(canvas);
  if (!ctx) return;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const ink3 = token('--st-ink-3', '#7c86ab');
  const ink2 = token('--st-ink-2', '#aab2d0');
  const line = token('--st-line', '#27305a');
  ctx.font = '400 11px Archivo, sans-serif';
  const pts = spec.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) {
    ctx.fillStyle = ink2;
    ctx.textAlign = 'center';
    wrap(ctx, spec.empty ?? 'Nothing measured', W / 2, H / 2, W - 40);
    return;
  }
  let [x0, x1] = spec.xRange ?? extent(pts.map((p) => p.x));
  if (x0 === x1) [x0, x1] = [x0 - 1, x1 + 1];
  const ys = pts.flatMap((p) => [p.y - (p.err ?? 0), p.y + (p.err ?? 0)]).filter(Number.isFinite);
  let [y0, y1] = extent(ys);
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
  const padY = (y1 - y0) * 0.08;
  y0 -= padY;
  y1 += padY;
  const padX = spec.xRange ? 0 : (x1 - x0) * 0.04;
  x0 -= padX;
  x1 += padX;
  const X = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const Y = (v: number) => {
    const t = (v - y0) / (y1 - y0);
    return spec.invertY ? PAD.t + t * (H - PAD.t - PAD.b) : H - PAD.b - t * (H - PAD.t - PAD.b);
  };

  // Shaded bands (where water and methane absorb, …), behind everything.
  for (const b of spec.bands ?? []) {
    ctx.fillStyle = 'rgba(170,178,208,0.08)';
    const a = X(Math.max(b.x0, x0));
    const z = X(Math.min(b.x1, x1));
    if (z <= a) continue;
    ctx.fillRect(a, PAD.t, z - a, H - PAD.t - PAD.b);
    ctx.fillStyle = ink3;
    ctx.textAlign = 'center';
    ctx.fillText(b.label, (a + z) / 2, PAD.t + 10);
  }

  // Grid and axis lettering.
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.fillStyle = ink3;
  ctx.textAlign = 'right';
  for (const v of ticks(y0, y1, 4)) {
    const y = Math.round(Y(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(W - PAD.r, y);
    ctx.stroke();
    ctx.fillText(tickText(v, y1 - y0), PAD.l - 5, y + 3);
  }
  ctx.textAlign = 'center';
  for (const t of xTicks(spec.xKind, x0, x1)) {
    const x = X(t.v);
    if (x < PAD.l || x > W - PAD.r) continue;
    ctx.fillText(t.label, x, H - 6);
  }
  ctx.save();
  ctx.translate(10, PAD.t + (H - PAD.t - PAD.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(spec.yLabel, 0, 0);
  ctx.restore();

  for (const l of spec.lines ?? []) {
    ctx.strokeStyle = l.colour;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(l.dash ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(X(l.x0), Y(l.y0));
    ctx.lineTo(X(l.x1), Y(l.y1));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const p of pts) {
    const x = X(p.x);
    const y = Y(p.y);
    ctx.strokeStyle = p.colour;
    ctx.fillStyle = p.colour;
    ctx.lineWidth = 1;
    if (p.err && Number.isFinite(p.err)) {
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, Y(p.y - p.err));
      ctx.lineTo(x, Y(p.y + p.err));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const s = p.square ? 3.5 : 2.6;
    ctx.beginPath();
    if (p.square) ctx.rect(x - s, y - s, 2 * s, 2 * s);
    else ctx.arc(x, y, s, 0, Math.PI * 2);
    if (p.hollow) ctx.stroke();
    else ctx.fill();
    if (p.lower) {
      const dir = spec.invertY ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - dir * 9);
      ctx.moveTo(x - 3, y - dir * 6);
      ctx.lineTo(x, y - dir * 9);
      ctx.lineTo(x + 3, y - dir * 6);
      ctx.stroke();
    }
    if (p.ring) {
      ctx.strokeStyle = token('--mark', '#ff4a9c');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** The Path chart: positions on the sky, north up and east left, in arcseconds. */
export interface PathSpec {
  /** Offsets east and north, arcsec, with a colour (pass tint) each. */
  points: { east: number; north: number; colour: string; ring?: boolean }[];
  /** The fitted motion over the dates shown, and the catalogue's (dashed amber). */
  fit: { e0: number; n0: number; e1: number; n1: number } | null;
  catalogue: { e0: number; n0: number; e1: number; n1: number } | null;
  empty: string;
}

/**
 * A mover's own Path (TLS-5): its positions from the change search, offsets from its mean
 * position, and the fitted straight line over its dates (the fit passes through the mean position
 * at the mean of the dates, core/movers.ts).
 */
export function moverPath(c: Pick<Candidate, 'path' | 'motion'>, colour: (frame: number) => string, ring: (frame: number) => boolean): PathSpec {
  const pts = c.path ?? [];
  if (!c.motion || pts.length < 2) return { points: [], fit: null, catalogue: null, empty: 'Not measured: too few positions' };
  const yrs = pts.map((p) => mjdToYear(p.mjd));
  const t0 = yrs.reduce((a, b) => a + b, 0) / yrs.length;
  const at = (y: number) => ({ e: ((y - t0) * c.motion!.pmra) / 1000, n: ((y - t0) * c.motion!.pmdec) / 1000 });
  const a = at(Math.min(...yrs));
  const b = at(Math.max(...yrs));
  return {
    points: pts.map((p) => ({ east: p.east, north: p.north, colour: colour(p.frame), ring: ring(p.frame) })),
    fit: { e0: a.e, n0: a.n, e1: b.e, n1: b.n },
    catalogue: null,
    empty: 'Not measured',
  };
}

export function drawPath(canvas: HTMLCanvasElement, spec: PathSpec): void {
  const ctx = sizeCanvas(canvas);
  if (!ctx) return;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const ink3 = token('--st-ink-3', '#7c86ab');
  const ink2 = token('--st-ink-2', '#aab2d0');
  ctx.font = '400 11px Archivo, sans-serif';
  const pts = spec.points.filter((p) => Number.isFinite(p.east) && Number.isFinite(p.north));
  if (!pts.length) {
    ctx.fillStyle = ink2;
    ctx.textAlign = 'center';
    wrap(ctx, spec.empty, W / 2, H / 2, W - 40);
    return;
  }
  const all = [
    ...pts.map((p) => [p.east, p.north] as const),
    ...[spec.fit, spec.catalogue]
      .filter((l) => !!l)
      .flatMap((l) => [[l.e0, l.n0] as const, [l.e1, l.n1] as const]),
  ];
  const ce = (Math.max(...all.map((a) => a[0])) + Math.min(...all.map((a) => a[0]))) / 2;
  const cn = (Math.max(...all.map((a) => a[1])) + Math.min(...all.map((a) => a[1]))) / 2;
  const span = Math.max(
    4,
    ...all.map((a) => Math.abs(a[0] - ce) * 2),
    ...all.map((a) => Math.abs(a[1] - cn) * 2),
  );
  const k = (Math.min(W, H) - 40) / span; // px per arcsec, the same both ways
  // East is left: x grows to the west.
  const X = (e: number) => W / 2 - (e - ce) * k;
  const Y = (n: number) => H / 2 - (n - cn) * k;

  ctx.strokeStyle = token('--st-line', '#27305a');
  ctx.beginPath();
  ctx.moveTo(0, H / 2 + 0.5);
  ctx.lineTo(W, H / 2 + 0.5);
  ctx.moveTo(W / 2 + 0.5, 0);
  ctx.lineTo(W / 2 + 0.5, H);
  ctx.stroke();

  const lineOf = (l: PathSpec['fit'], colour: string, dash: boolean) => {
    if (!l) return;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(X(l.e0), Y(l.n0));
    ctx.lineTo(X(l.e1), Y(l.n1));
    ctx.stroke();
    ctx.setLineDash([]);
  };
  lineOf(spec.catalogue, token('--st-accent-2', '#ffb03a'), true);
  lineOf(spec.fit, token('--st-ink', '#eef0f8'), false);

  for (const p of pts) {
    ctx.fillStyle = p.colour;
    ctx.beginPath();
    ctx.arc(X(p.east), Y(p.north), 3, 0, Math.PI * 2);
    ctx.fill();
    if (p.ring) {
      ctx.strokeStyle = token('--mark', '#ff4a9c');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(X(p.east), Y(p.north), 6.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Scale bar and orientation, as on the picture.
  const bar = niceArcsec(span / 4);
  ctx.strokeStyle = ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, H - 12);
  ctx.lineTo(10 + bar * k, H - 12);
  ctx.stroke();
  ctx.fillStyle = ink3;
  ctx.textAlign = 'left';
  ctx.fillText(`${bar} arcsec`, 16 + bar * k, H - 8);
  ctx.textAlign = 'right';
  ctx.fillText('north up, east left', W - 8, H - 8);
}

function niceArcsec(v: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 20, 50, 100]) if (s >= v * 0.7) return s;
  return 100;
}

function extent(v: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of v) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return [lo, hi];
}

/** About `n` round tick values between lo and hi. */
export function ticks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((s) => s * mag >= raw) ?? 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(v);
  return out;
}

function tickText(v: number, span: number): string {
  const digits = span < 0.5 ? 2 : span < 5 ? 1 : 0;
  return num(Math.abs(v) < 1e-12 ? 0 : v, digits);
}

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

/** MJD → UTC calendar date (MJD 40587 is 1970-01-01). */
export function mjdDate(mjd: number): Date {
  return new Date((mjd - 40587) * 86_400_000);
}

function xTicks(kind: ChartSpec['xKind'], lo: number, hi: number): { v: number; label: string }[] {
  if (kind === 'date') {
    const out: { v: number; label: string }[] = [];
    const a = mjdDate(lo);
    const months = (hi - lo) / 30.4;
    const every = months > 24 ? 6 : months > 10 ? 3 : 1;
    const d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1));
    for (let i = 0; i < 80; i++) {
      const mjd = d.getTime() / 86_400_000 + 40587;
      if (mjd > hi) break;
      if (d.getUTCMonth() % every === 0) {
        const m = d.getUTCMonth();
        out.push({ v: mjd, label: m === 0 ? String(d.getUTCFullYear()) : MONTHS[m] ?? '' });
      }
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
  }
  const t = ticks(lo, hi, kind === 'phase' ? 4 : 6);
  const unit = kind === 'lam' ? ' µm' : '';
  return t.map((v, i) => ({
    v,
    label: `${num(v, hi - lo < 3 ? 1 : 0)}${i === t.length - 1 ? unit : ''}`,
  }));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number) {
  ctx.font = '500 12px Archivo, sans-serif';
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const t = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(t).width > w && cur) {
      lines.push(cur);
      cur = word;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  lines.forEach((l, i) => ctx.fillText(l, x, y + (i - (lines.length - 1) / 2) * 16));
}
