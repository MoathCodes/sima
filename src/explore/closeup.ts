/**
 * What the task draws on the picture (through render.ts `drawHooks`): the dashed search circle
 * of "Look closer", the ring of "Show me", and the close-up once the object is found (GDE-4,
 * GDE-5). Owner: lane H.
 *
 * Every ring is worked out, not observed (H4): track.ts says where it comes from, and the task
 * line says it in words. Practice rings are dashed (H3). For the hidden planet the close-up
 * raises the contrast, in the close-up only, and says so on it (O-G12).
 */
import { S } from '../viewer/state.ts';
import { drawHooks, groupDate, type PictureView } from '../viewer/render.ts';
import { targetAt } from './track.ts';
import { formatDate } from '../core/astro.ts';

/** What is drawn: nothing, the search circle, the ring on this date, or the full close-up. */
export type Marks = 'none' | 'circle' | 'ring' | 'closeup';

let marks: Marks = 'none';

/** Sets what the task draws; the picture repaints on its next frame. */
export function setMarks(next: Marks): void {
  marks = next;
}

/** What the task draws now. */
export function currentMarks(): Marks {
  return marks;
}

/** Registers the hook. Called once by game.ts. */
export function startCloseup(): void {
  drawHooks.add(paint);
}

interface Pt {
  x: number;
  y: number;
}

/** A ring's place and its date (month and year). */
interface Dated extends Pt {
  label: string;
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';
}

/** The object on each date of the flip-book, and on the date on screen, in canvas pixels. */
function track(view: Readonly<PictureView>): { all: Dated[]; now: Pt | null } {
  const field = view.field;
  const all: Dated[] = [];
  for (const g of S.groups) {
    const at = targetAt(field, S.target, groupDate(field, g));
    const p = at ? view.skyToPic(at.ra, at.dec) : null;
    if (p) all.push({ ...p, label: formatDate(groupDate(field, g), 'month') });
  }
  const mjd = view.mjd ?? (view.group ? groupDate(field, view.group) : Number.NaN);
  const at = targetAt(field, S.target, Number.isFinite(mjd) ? mjd : (S.groups[0]?.mjd ?? NaN));
  return { all, now: at ? view.skyToPic(at.ra, at.dec) : null };
}

function paint(ctx: CanvasRenderingContext2D, view: Readonly<PictureView>): void {
  if (marks === 'none' || !view.field || !S.target) return;
  const { all, now } = track(view);
  if (!now) return;
  const sim = view.field.simulated;
  const ringR = Math.max(10, 2.2 * view.k);
  ctx.save();
  if (marks === 'circle') {
    // A wide circle, its centre pushed off the object so it helps without giving it away.
    const r = Math.max(48, view.size * 0.2);
    const turn = [...S.target].reduce((a, c) => a + c.charCodeAt(0), 0) % 8;
    const angle = (turn / 8) * 2 * Math.PI;
    const c = { x: now.x + 0.45 * r * Math.cos(angle), y: now.y + 0.45 * r * Math.sin(angle) };
    circle(ctx, c, r, token('--st-ink'), 1.5, [6, 5]);
  } else if (marks === 'ring') {
    circle(ctx, now, ringR, token('--mark'), 2, sim ? [5, 4] : []);
  } else {
    const box = closeupBox(view, all.length ? all : [now]);
    if (box) inset(ctx, view, box, all, now, ringR, sim);
    for (const p of all) circle(ctx, p, ringR * 0.75, token('--st-accent-2'), 1, [3, 3]);
    circle(ctx, now, ringR, token('--mark'), 2, sim ? [5, 4] : []);
  }
  ctx.restore();
}

function circle(
  ctx: CanvasRenderingContext2D,
  c: Pt,
  r: number,
  colour: string,
  width: number,
  dash: number[],
): void {
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, 2 * Math.PI);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke();
}

interface Inset {
  /** Where the close-up sits, canvas CSS pixels. */
  x: number;
  y: number;
  side: number;
  /** The part of the picture it magnifies: centre and side, canvas CSS pixels. */
  cx: number;
  cy: number;
  crop: number;
}

/** A corner for the close-up that does not cover the object, and what it magnifies. */
function closeupBox(view: Readonly<PictureView>, pts: readonly Pt[]): Inset | null {
  const side = Math.round(view.size * 0.36);
  if (side < 80) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const crop = Math.max(7 * view.k, extent + 5 * view.k);
  const m = 8;
  const corners: Pt[] = [
    { x: view.size - side - m, y: m + 40 }, // top right, under where a badge may reach
    { x: view.size - side - m, y: view.size - side - m - 34 }, // bottom right, over "Original"
    { x: m, y: view.size - side - m - 34 }, // bottom left, over the scale bar
  ];
  const clear = corners.find(
    (c) =>
      cx + crop / 2 < c.x ||
      cx - crop / 2 > c.x + side ||
      cy + crop / 2 < c.y ||
      cy - crop / 2 > c.y + side,
  );
  if (!clear) return null;
  return { x: clear.x, y: clear.y, side, cx, cy, crop };
}

function inset(
  ctx: CanvasRenderingContext2D,
  view: Readonly<PictureView>,
  b: Inset,
  all: readonly Dated[],
  now: Pt,
  ringR: number,
  sim: boolean,
): void {
  const dpr = ctx.getTransform().a || 1;
  const zoom = b.side / b.crop;
  const planet = S.target === 'planet-x';
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(b.x, b.y, b.side, b.side);
  ctx.imageSmoothingEnabled = false;
  // The hidden planet is one faint pixel: the close-up alone raises its contrast (O-G12).
  if (planet) ctx.filter = 'contrast(2.2) brightness(1.6)';
  const sx = (b.cx - b.crop / 2) * dpr;
  const sy = (b.cy - b.crop / 2) * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(
    ctx.canvas,
    sx,
    sy,
    b.crop * dpr,
    b.crop * dpr,
    b.x * dpr,
    b.y * dpr,
    b.side * dpr,
    b.side * dpr,
  );
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.filter = 'none';
  // Rings in the close-up, at the same places.
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.side, b.side);
  ctx.clip();
  const inside = (p: Pt): Pt => ({
    x: b.x + (p.x - (b.cx - b.crop / 2)) * zoom,
    y: b.y + (p.y - (b.cy - b.crop / 2)) * zoom,
  });
  for (const p of all) circle(ctx, inside(p), ringR * 0.75 * zoom * 0.6, token('--st-accent-2'), 1, [3, 3]);
  circle(ctx, inside(now), ringR * zoom * 0.6, token('--mark'), 2, sim ? [5, 4] : []);
  ends(ctx, all.map((p) => ({ ...inside(p), label: p.label })), ringR * zoom * 0.6);
  ctx.restore();
  // Frame and label.
  ctx.save();
  ctx.strokeStyle = token('--st-ink-3');
  ctx.lineWidth = 1;
  ctx.setLineDash(sim ? [5, 4] : []);
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.side - 1, b.side - 1);
  const lines = [
    `${sim ? 'Simulated · ' : ''}Close-up ×${zoom.toFixed(1)}`,
    planet ? 'Contrast raised here only' : '',
  ].filter(Boolean);
  ctx.font = `500 12px ${token('--font')}`;
  const w = Math.min(b.side - 8, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12);
  const h = 6 + 16 * lines.length;
  ctx.fillStyle = token('--badge-bg');
  ctx.fillRect(b.x + 4, b.y + b.side - 4 - h, w, h);
  ctx.fillStyle = token('--st-ink');
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, b.x + 10, b.y + b.side - 4 - h + 11 + 16 * i));
  ctx.restore();
  void view;
}

/**
 * The first and last date beside their rings, to one side of the path (up or right, away from
 * the label at the bottom), so the close-up reads from one date to the other.
 */
function ends(ctx: CanvasRenderingContext2D, pts: readonly Dated[], r: number): void {
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (!a || !b || a.label === b.label) return;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = len > 0.5 ? (b.x - a.x) / len : 0;
  const uy = len > 0.5 ? (b.y - a.y) / len : -1;
  ctx.font = `600 13px ${token('--font')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // Across the path, on the side that points up (or right when the path is upright).
  let px = -uy;
  let py = ux;
  if (py > 0.01 || (Math.abs(py) <= 0.01 && px < 0)) {
    px = -px;
    py = -py;
  }
  for (const p of [a, b]) {
    const x = p.x + px * (r + 10);
    const y = p.y + py * (r + 10);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.setLineDash([]);
    ctx.strokeText(p.label, x, y);
    ctx.fillStyle = token('--st-ink');
    ctx.fillText(p.label, x, y);
  }
}
