/**
 * What lane E draws on the picture, through lane D's `drawHooks` (SPEC 9.4 rule 4): catalogue
 * circles (Gaia) and squares (CatWISE), the predicted path, flagged pixels, names, the change
 * search's candidates and the selection ring. Plus the legend under the picture (#frame-legend),
 * so every mark is explained in view (O-G5). Owner: lane E.
 *
 * Colours (DESIGN.md): catalogue marks in the pale window ink, told apart by shape; worked-out
 * things (the predicted path, candidates) in Path Amber; where the user looks in magenta.
 */
import { S, watch } from '../state.ts';
import { draw, drawHooks, type PictureView } from '../render.ts';
import { atDate } from '../../core/catalog.ts';
import { mjdToYear, propagate } from '../../core/astro.ts';
import { allRows, catalogue, onCatalogue } from './catalogue.ts';
import { current, onSettings } from './settings.ts';
import { onSearch, search, shown } from './search.ts';

/** Reads a colour token from app.css (the canvas cannot use var()). */
function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Starts drawing. Called once. */
export function startOverlays(): void {
  drawHooks.add(paint);
  const redraw = () => {
    draw();
    legend();
  };
  onCatalogue(redraw);
  onSettings(redraw);
  onSearch(redraw);
  watch(['level', 'selected', 'field', 'mode', 'tools', 'toolsTab'], redraw);
  legend();
}

/** True when lane E's marks belong on the picture: Measure, a real or simulated field. */
function active(): boolean {
  return S.level === 'measure' && !!S.field;
}

function paint(ctx: CanvasRenderingContext2D, view: Readonly<PictureView>): void {
  if (!active() || !view.field) return;
  const L = current().layers;
  const ink = token('--st-ink', '#eef0f8');
  const amber = token('--st-accent-2', '#ffb03a');
  const mark = token('--mark', '#ff4a9c');
  const bad = token('--bad', '#b3262f');
  const mjd = view.mjd ?? Number.NaN;
  const r = Math.max(5, view.k * 1.4);
  ctx.lineWidth = 1.25;

  if (L.flags && view.group) {
    // Flagged or uncovered pixels of the picture on screen (H6): any of its frames.
    ctx.fillStyle = bad;
    ctx.globalAlpha = 0.55;
    const n = view.n;
    const frames = view.group.frames.map((i) => view.field?.frames[i]).filter((f) => !!f);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (frames.some((f) => f.bad[y * n + x])) {
          const p = view.toPic(x, y);
          ctx.fillRect(p.x - view.k / 2, p.y - view.k / 2, view.k, view.k);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  if (Number.isFinite(mjd) && (L.gaia || L.catwise)) {
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.85;
    for (const row of allRows()) {
      if ((row.cat === 'gaia' && !L.gaia) || (row.cat === 'catwise' && !L.catwise)) continue;
      const at = atDate(row, mjd);
      const p = view.skyToPic(at.ra, at.dec);
      if (!p || p.x < -r || p.y < -r || p.x > view.size + r || p.y > view.size + r) continue;
      ctx.beginPath();
      if (row.cat === 'gaia') ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      else ctx.rect(p.x - r, p.y - r, 2 * r, 2 * r);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const t = view.field.target;
  if (t && L.path && !view.field.simulated) {
    // Where the catalogue motion puts the target on every date of the flip-book: worked out,
    // not observed, so amber and dashed.
    const pts = S.groups
      .filter((g) => Number.isFinite(g.mjd))
      .map((g) => {
        const at = propagate(t.ra, t.dec, t.pmra, t.pmdec, t.ep, mjdToYear(g.mjd));
        return view.skyToPic(at.ra, at.dec);
      })
      .filter((p) => !!p);
    if (pts.length) {
      ctx.strokeStyle = amber;
      ctx.fillStyle = amber;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      for (const p of pts) ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
  }

  if (t && L.names && !view.field.simulated && Number.isFinite(mjd)) {
    const at = propagate(t.ra, t.dec, t.pmra, t.pmdec, t.ep, mjdToYear(mjd));
    const p = view.skyToPic(at.ra, at.dec);
    if (p) label(ctx, t.name.split(' ')[0] ?? t.name, p.x + r + 3, p.y - r - 2, ink);
  }

  const s = search();
  if (current().marks && s.result) {
    ctx.strokeStyle = amber;
    ctx.setLineDash([3, 2]);
    for (const c of shown(s.result).slice(0, 30)) {
      const p = view.skyToPic(c.ra, c.dec);
      if (!p) continue;
      const open = c.id === s.open;
      ctx.strokeStyle = open ? mark : amber;
      ctx.lineWidth = open ? 2 : 1.25;
      ctx.strokeRect(p.x - r - 2, p.y - r - 2, 2 * r + 4, 2 * r + 4);
      if (L.names) label(ctx, String(c.rank), p.x - r - 2, p.y - r - 6, open ? mark : amber);
    }
    ctx.setLineDash([]);
  }

  const sel = selectedPosition(mjd);
  if (sel) {
    const p = view.skyToPic(sel.ra, sel.dec);
    if (p) {
      ctx.strokeStyle = mark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** Where the selection is on a date, degrees; null when nothing is selected. */
function selectedPosition(mjd: number): { ra: number; dec: number } | null {
  const sel = S.selected;
  if (!sel) return null;
  if (sel.kind === 'target') {
    const t = S.field?.target;
    if (!t || !Number.isFinite(mjd)) return null;
    return propagate(t.ra, t.dec, t.pmra, t.pmdec, t.ep, mjdToYear(mjd));
  }
  if (sel.kind === 'source') {
    const row = allRows().find((r) => r.id === sel.id);
    return row && Number.isFinite(mjd) ? atDate(row, mjd) : { ra: sel.ra, dec: sel.dec };
  }
  return { ra: sel.ra, dec: sel.dec };
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string) {
  ctx.font = '500 12px Archivo, sans-serif';
  const w = ctx.measureText(text).width;
  ctx.fillStyle = token('--badge-bg', 'rgba(9,13,28,.74)');
  ctx.fillRect(x - 3, y - 11, w + 6, 15);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

/** The legend under the picture: one item per kind of mark drawn now, in plain words. */
function legend(): void {
  const box = document.getElementById('frame-legend');
  if (!box) return;
  const items: string[] = [];
  if (active() && S.field && !S.field.simulated) {
    const L = current().layers;
    const cat = catalogue();
    if (L.gaia && cat.gaia.rows.length)
      items.push('<span class="lg-sym lg-circle"></span>Gaia DR3 stars, moved to this date');
    if (L.catwise && cat.catwise.rows.length)
      items.push('<span class="lg-sym lg-square"></span>CatWISE2020 sources, moved to this date');
    if (L.path && S.field.target)
      items.push('<span class="lg-sym lg-path"></span>Path from the catalogue motion');
    if (L.flags) items.push('<span class="lg-sym lg-flag"></span>Flagged or missing pixels');
    if (current().marks && search().result?.candidates.length)
      items.push('<span class="lg-sym lg-cand"></span>Candidates to check');
    if (S.selected) items.push('<span class="lg-sym lg-sel"></span>In Measure');
  }
  box.hidden = !items.length;
  box.className = 'lg';
  box.innerHTML = items.map((i) => `<span class="lg-item">${i}</span>`).join('');
}
