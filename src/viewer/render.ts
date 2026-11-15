/**
 * Painting the frame's picture: the six views, the date badge, the scale bar and north/east
 * (FRM-7 to FRM-9), and the one data line under the views (FRM-10, H2). Owner: lane D.
 *
 * Other lanes draw on the picture only through `drawHooks` (rule 4 in SPEC 9.4): add a function
 * and it runs after every paint, in the picture's own CSS pixels. Never edit this file for it.
 *
 * The picture is square. The field's grid covers at most what the exposures cover: a wider field
 * size shows them in its middle at the right scale, outlined. Around them, and over any pixel no
 * exposure covers, the sky map's own picture is drawn dimmed and labelled "Sky map (all dates
 * averaged)" (surround.ts; H1, H6): it is never part of the real pictures, their numbers or their
 * differences. Pixels are drawn with hard edges, one square per grid pixel.
 *
 * Pointer: a drag inside the picture pans the field (FRM-12) and the patch on the sky follows; a
 * tap without dragging goes to `onTap`; the wheel changes the field size one step per notch, and
 * the sky stays still (FRM-6).
 */
import { FOVS, S, pic, type Mode } from './state.ts';
import { cleanupSteps, type PicSettings } from '../core/picture.ts';
import { formatDate } from '../core/astro.ts';
import { colourMatch, fieldGrid, wcsPix2Sky, wcsSky2Pix } from '../core/real.ts';
import { groupFrames } from '../core/blink.ts';
import type { Det, Field, Group } from '../core/types.ts';
import {
  colourImage,
  differenceImage,
  differencePicture,
  flipImage,
  groupPicture,
  lookFor,
  picturesReady,
  refGroup,
  stackImage,
  stackPicture,
  trailImage,
  twoDatesImage,
  type Look,
  type StackView,
} from './paint.ts';
import { trialView } from './motion.ts';
import { fmtList, t as tr } from '../shell/i18n.ts';
import { liveWords } from './seed.ts';
import { aroundMap, aroundMapReady, coverageMask, maskOutline } from './surround.ts';

/** How bright the sky map is drawn around the real exposures: dimmed, so it never passes for them. */
const MAP_ALPHA = 0.5;

/** The picture on screen, for draw hooks and taps. */
export interface PictureView {
  /** The canvas's side, CSS pixels (the picture is square). */
  size: number;
  /** Field pixels across. */
  n: number;
  /** CSS pixels per field pixel. */
  k: number;
  /** Field pixel (integer = pixel centre) → canvas CSS pixel. */
  toPic(x: number, y: number): { x: number; y: number };
  /** Canvas CSS pixel → field pixel. */
  toField(px: number, py: number): { x: number; y: number };
  /** Sky position (degrees) → canvas CSS pixel; null without a field. */
  skyToPic(ra: number, dec: number): { x: number; y: number } | null;
  /** Canvas CSS pixel → sky position (degrees); null without a field. */
  picToSky(px: number, py: number): { ra: number; dec: number } | null;
  field: Field | null;
  /** The flip-book picture on screen; null when there is none. */
  group: Group | null;
  /** Its middle date, MJD; null when there is none. */
  mjd: number | null;
  det: Det;
  mode: Mode;
  /** The values on screen, n × n µJy after processing (Difference: the difference); null when the view shows no single picture (Two dates). */
  values: Float32Array | null;
  /** The clean-up steps in force, in words (H8); empty when the picture is as recorded. */
  processed: string[];
  /** Added by lane D: the reference picture (the earlier date in Two dates and Swipe). */
  ref?: Group | null;
  /** Added by lane D: the covered square on the canvas, CSS pixels (the field's grid). */
  inner?: { x: number; y: number; size: number };
}

/** Draws over the picture after each paint. The context is in CSS pixels; save and restore. */
export type DrawHook = (ctx: CanvasRenderingContext2D, view: Readonly<PictureView>) => void;

/** Everything drawn over the picture by other lanes (catalogue circles, candidates, rings…). */
export const drawHooks = new Set<DrawHook>();

/** What the date badge says. */
export interface Hud {
  /** The window's letter: `A`, `B`, `C`… ('' when the view has no single date). */
  letter: string;
  /** Explore: the month ("Mar 2026"). Measure: date and time. */
  title: string;
  /** Plain lines under it (Measure adds pass, detector, wavelength and colour match). */
  lines: string[];
  /** Added by lane D: a line that says something is missing or simulated (drawn in amber). */
  warn?: string;
  /** A caution after the lines, drawn in amber (a date in another colour than the reference). */
  note?: string;
}

const tapFns = new Set<(p: { x: number; y: number; ra: number; dec: number }) => void>();
let queued = false;
let view: PictureView | null = null;
let panning: { dx: number; dy: number } | null = null;

/**
 * Repaints the picture and its labels on the next animation frame. Call it after changing
 * anything the picture shows; several calls in one frame paint once.
 */
export function draw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    paint();
  });
}

/** Paints now, in this task (the tour and tests use it to read the picture at once). */
export function drawNow(): void {
  queued = false;
  paint(true);
}

/** The picture on screen as hooks see it; null before the first paint. */
export function currentView(): Readonly<PictureView> | null {
  return view;
}

/**
 * Calls `fn` when the user taps the picture without dragging (the task's "Tap it", selecting a
 * source in Measure).
 * @returns Unsubscribe.
 */
export function onTap(
  fn: (p: { x: number; y: number; ra: number; dec: number }) => void,
): () => void {
  tapFns.add(fn);
  return () => tapFns.delete(fn);
}

// ----- Words ------------------------------------------------------------------------------------

/** "QR3", "DR1 deep". */
function release(r: string): string {
  return r === 'simulated'
    ? 'simulated'
    : r
        .replace(/^spherex_/, '')
        .replace('_', ' ')
        .replace(/^\w+/, (m) => m.toUpperCase());
}

function framesOf(field: Field, groups: readonly (Group | null | undefined)[]) {
  const out = [];
  for (const g of groups)
    for (const i of g?.frames ?? []) {
      const f = field.frames[i];
      if (f) out.push(f);
    }
  return out;
}

function lamRange(lams: number[]): string {
  const ok = lams.filter(Number.isFinite);
  if (!ok.length) return '';
  const lo = Math.min(...ok);
  const hi = Math.max(...ok);
  return hi - lo < 0.005 ? `${lo.toFixed(2)} µm` : `${lo.toFixed(2)}–${hi.toFixed(2)} µm`;
}

function dayRange(a: number, b: number): string {
  if (!Number.isFinite(a)) return tr('pic.noDate');
  const da = formatDate(a, 'day');
  const db = formatDate(b, 'day');
  return da === db || !Number.isFinite(b) ? da : tr('pic.dayRange', { a: da, b: db });
}

/** The pass or month a window is, in words: "Survey pass 2", "Month 5 (May 2025)". */
export function passName(field: Field | null, window: number): string {
  return field?.monthly
    ? tr('pic.month', { n: String(window + 1), of: String(field.windows) })
    : tr('pic.pass', { n: String(window + 1) });
}

/**
 * The date of a group: its own middle date, or for a date with no exposure in this detector, the
 * middle of its pass from the other detectors' exposures (so the empty date still has a place on
 * the scale and in the badge). NaN only when the pass has no exposure at all.
 */
export function groupDate(field: Field | null, g: Group): number {
  if (Number.isFinite(g.mjd)) return g.mjd;
  if (!field) return Number.NaN;
  const m = field.frames.filter((f) => f.window === g.window).map((f) => f.mjd);
  return m.length ? (Math.min(...m) + Math.max(...m)) / 2 : Number.NaN;
}

/** The groups the view on screen shows, for the badge and the data line. */
function shownGroups(): Group[] {
  const g = S.groups[S.epoch];
  if (!g) return [];
  if (S.mode === 'two' || S.mode === 'swipe') {
    const [a, b] = pair();
    return [a, b].filter((x): x is Group => !!x);
  }
  if (S.mode === 'stack' || S.mode === 'trail') {
    return S.mode === 'stack' ? [...S.groups] : S.groups.slice(0, S.epoch + 1);
  }
  return [g];
}

/** The two dates compared: the reference (earlier, red) and the date on screen (later, cyan). */
export function pair(): [Group | null, Group | null] {
  const groups = S.groups;
  if (!groups.length) return [null, null];
  let ref = Math.min(S.ref, groups.length - 1);
  let cur = S.epoch;
  if (cur === ref) cur = ref === groups.length - 1 ? 0 : groups.length - 1;
  if (cur < ref) [ref, cur] = [cur, ref];
  return [groups[ref] ?? null, groups[cur] ?? null];
}

/** What the date badge says now; null when there is no picture. */
export function hud(): Hud | null {
  const g = S.groups[S.epoch];
  const field = S.field;
  if (!g || !field) return null;
  const measure = S.level === 'measure';
  const sim = field.simulated ? tr('pic.sim') : undefined;
  if (S.color) {
    const mix = pic().mix;
    const ch = (c: string) =>
      mix
        .map((m, i) => (m === c ? `D${i + 1}` : ''))
        .filter(Boolean)
        .join(' ');
    return {
      letter: g.letter,
      title: formatDate(g.mjd, measure ? 'time' : 'month'),
      lines: [
        tr('pic.color', {
          r: ch('r') || tr('pic.none'),
          g: ch('g') || tr('pic.none'),
          b: ch('b') || tr('pic.none'),
        }),
      ],
      warn: sim,
    };
  }
  if (S.mode === 'two') {
    const [a, b] = pair();
    return {
      letter: '',
      title: tr('pic.twoTitle', {
        a: a ? formatDate(a.mjd, 'month') : '–',
        b: b ? formatDate(b.mjd, 'month') : '–',
      }),
      // Measure names the detector and wavelengths, as the badge does for one date (H2).
      lines: measure
        ? [
            `D${S.det} ${lamRange(
              framesOf(
                field,
                [a, b].filter((x): x is Group => !!x),
              ).map((x) => x.lam),
            )}`,
          ]
        : [],
      warn: sim,
    };
  }
  if (S.mode === 'stack') {
    const st = stackNow();
    if (!st)
      return {
        letter: '',
        title: tr('pic.stacking'),
        lines: [tr('pic.alongCat')],
        warn: sim,
      };
    const count = st.frames;
    const lines = [st.label];
    if (st.result) {
      const [c1, c2] = st.result.controls;
      lines.push(tr('pic.checks', { a: c1.label.toLowerCase(), b: c2.label.toLowerCase() }));
    }
    return {
      letter: '',
      title: tr('pic.stackOf', { n: String(count) }),
      lines,
      warn: sim,
    };
  }
  if (!g.frames.length) {
    return {
      letter: g.letter,
      title: formatDate(groupDate(field, g), 'month'),
      lines: [measure ? passName(field, g.window) : ''].filter(Boolean),
      warn: tr('pic.noExp', { det: `D${g.det}` }),
    };
  }
  const frames = framesOf(field, [g]);
  // Discover and phones: the date alone; how many shots are blended is in the data line's tooltip.
  if (!measure)
    return { letter: g.letter, title: formatDate(g.mjd, 'month'), lines: [], warn: sim };
  // One line under the date: pass, detector and wavelength, "· reference" on the reference date.
  // A different colour from the reference is the only other line (redesign item 2: few words; what
  // each view shows is in the frame's "About this picture").
  const f = frames[0];
  const ref = S.groups[Math.min(S.ref, S.groups.length - 1)];
  const refFrame = ref ? framesOf(field, [ref])[0] : undefined;
  const lam =
    frames.length > 1
      ? tr('pic.shots', {
          lam: `D${g.det} ${lamRange(frames.map((x) => x.lam))}`,
          n: String(frames.length),
        })
      : f
        ? `D${g.det} ${f.lam.toFixed(2)} µm`
        : `D${g.det}`;
  const lines = [
    `${passName(field, g.window)} · ${lam}${ref === g ? ` · ${tr('pic.reference')}` : ''}`,
  ];
  const differs = !!f && !!refFrame && ref !== g && !colourMatch(f, refFrame);
  return {
    letter: g.letter,
    title: formatDate(g.mjd, 'time'),
    lines,
    warn: sim,
    note:
      differs && refFrame ? tr('pic.refWas', { lam: `${refFrame.lam.toFixed(2)} µm` }) : undefined,
  };
}

/**
 * The one line under the views: source, release, dates, exposure count and detector range
 * (FRM-10, H2).
 */
export function exif(): string {
  const f = S.field;
  if (!f || !S.groups.length) {
    if (S.source === 'loading') return tr('pic.loading');
    return S.source === 'simulated' ? tr('pic.noPractice') : tr('pic.noPictures');
  }
  const groups = shownGroups();
  const frames = framesOf(f, groups);
  const releases = [...new Set(frames.map((x) => release(x.release)))].join(' + ');
  const det = S.color ? 'D1–D6' : `D${S.det}`;
  const parts: string[] = [];
  if (f.simulated) parts.push(tr('pic.simData'));
  else {
    const real =
      S.source === 'live' || S.set?.origin === 'live'
        ? tr('pic.realHow', { how: liveWords(S.set?.data.live) })
        : tr('pic.real');
    parts.push(releases ? tr('pic.comma', { a: real, b: releases }) : real);
  }
  const mjds = frames.map((x) => x.mjd).filter(Number.isFinite);
  const count = frames.length;
  const counted = tr(f.simulated ? 'pic.nPictures' : 'pic.nExposures', { n: String(count) });
  if (S.mode === 'two' && groups.length === 2) {
    const dates = fmtList(groups.map((g) => formatDate(g.mjd, 'month')));
    parts.push(tr('pic.comma', { a: dates, b: counted }));
  } else if (mjds.length) {
    const dates = dayRange(Math.min(...mjds), Math.max(...mjds));
    parts.push(tr('pic.comma', { a: dates, b: counted }));
  } else {
    parts.push(tr('pic.noExpShort', { det: `D${S.det}` }));
  }
  const lams = lamRange(frames.map((x) => x.lam));
  parts.push(lams && !S.color ? `${det} ${lams}` : det);
  const covered = (f.n * f.scale) / 60;
  const rest = aroundMapReady(f, S.fov, S.lam);
  if (covered < S.fov - 0.05)
    parts.push(tr(rest ? 'pic.coverMidRest' : 'pic.coverMid', { v: `${covered.toFixed(1)}′` }));
  else if (!f.simulated && S.set && coverageMask(S.set, f)) {
    parts.push(tr(rest ? 'pic.coverPartRest' : 'pic.coverPart'));
  }
  const steps = S.original ? [] : cleanupSteps(pic());
  if (steps.length) parts.push(tr('pic.processed', { steps: steps.join(tr('pic.sep')) }));
  return parts.join(' · ');
}

/**
 * The data line in Discover and on phones (v2.0, H2, BEGINNER-AND-MOBILE 5.3 and 11.4), one short
 * line after the source dot: source and release, the dates on screen and the wavelength, e.g.
 * "SPHEREx QR3 · 15–16 Sep 2026 · 1.93–2.16 µm" (redesign item 2). Two dates names its red and
 * cyan dates; Stack says how many pictures; simulated pictures say so first. The rest (detector,
 * exposure count, coverage) is in the line's tooltip, `exif()`.
 */
export function dataLine(): string {
  const f = S.field;
  if (!f || !S.groups.length) return S.source === 'loading' ? tr('pic.loading') : '';
  const groups = shownGroups();
  const frames = framesOf(f, groups);
  const parts: string[] = [];
  const releases = [...new Set(frames.map((x) => release(x.release)))].join(' + ');
  parts.push(f.simulated ? tr('pic.madeUp') : releases ? `SPHEREx ${releases}` : 'SPHEREx');
  const mjds = frames.map((x) => x.mjd).filter(Number.isFinite);
  if (S.mode === 'two' && groups.length === 2) {
    const [a, b] = groups.map((g) => formatDate(g.mjd, 'month'));
    parts.push(tr('pic.redCyan', { a: a!, b: b! }));
  } else if (S.mode === 'stack') {
    const n = stackShown()?.frames ?? frames.length;
    parts.push(
      mjds.length
        ? tr('pic.stackNRange', {
            n: String(n),
            range: shortRange(Math.min(...mjds), Math.max(...mjds)),
          })
        : tr('pic.stackN', { n: String(n) }),
    );
  } else if (mjds.length) parts.push(shortRange(Math.min(...mjds), Math.max(...mjds)));
  else parts.push(tr('pic.noExpShort', { det: `D${S.det}` }));
  const lams = lamRange(frames.map((x) => x.lam));
  parts.push(S.color ? 'D1–D6' : lams || `D${S.det}`);
  return parts.join(' · ');
}

/** "15–16 Sep 2026", "30 Sep – 2 Oct 2026", or one day. */
function shortRange(a: number, b: number): string {
  const [d1, m1, y1] = formatDate(a, 'day').split(' ');
  const full = formatDate(b, 'day');
  const [d2, m2, y2] = full.split(' ');
  if (`${d1} ${m1} ${y1}` === full) return full;
  if (m1 === m2 && y1 === y2) return `${d1}–${d2} ${m2} ${y2}`;
  if (y1 === y2) return `${d1} ${m1} – ${full}`;
  return `${formatDate(a, 'day')} – ${full}`;
}

// ----- Painting ---------------------------------------------------------------------------------

interface Parts {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  edge: HTMLElement;
  badge: HTMLElement;
  scale: HTMLElement;
  divider: HTMLElement;
}
let parts: Parts | null = null;

function ensure(): Parts | null {
  if (parts?.host.isConnected) return parts;
  const host = document.getElementById('frame-pic');
  if (!host) return null;
  host.classList.add('window', 'pic');
  const canvas = document.createElement('canvas');
  canvas.className = 'pic-canvas';
  canvas.dataset.picture = '';
  const make = (cls: string) => {
    const el = document.createElement('div');
    el.className = cls;
    return el;
  };
  const edge = make('pic-edge');
  const badge = make('pic-badge window-badge');
  const scale = make('pic-scale');
  const divider = make('pic-divider');
  divider.hidden = true;
  divider.setAttribute('role', 'slider');
  divider.setAttribute('aria-label', 'Swipe between the two dates');
  divider.tabIndex = 0;
  edge.setAttribute('aria-hidden', 'true');
  host.prepend(canvas, edge, badge, scale, divider);
  parts = { host, canvas, edge, badge, scale, divider };
  watchPointer(canvas);
  watchDivider(divider);
  new ResizeObserver(() => draw()).observe(host);
  return parts;
}

let stackCache: ReturnType<typeof stackPicture> | null = null;
function stackNow() {
  const field = S.field;
  if (!field || S.mode !== 'stack') return null;
  // The motion handle's trial stack (motion.ts, O-V6) when its arrow is off the catalogue motion.
  stackCache =
    trialView() ?? stackPicture(field, S.groups, S.det, S.set?.data.catalogue ?? null, pic(), draw);
  return stackCache;
}

/** The Stack view's stack on screen (null in other views, or while it is being made). */
export function stackShown(): StackView | null {
  return S.mode === 'stack' ? stackCache : null;
}

function paint(now = false): void {
  const p = ensure();
  if (!p) return;
  // A new picture of the patch on screen waits for its pictures to be made off the page's thread
  // (TLS-8); the one on screen stays until then. A new patch, or drawNow, paints at once.
  if (
    !now &&
    S.field &&
    S.field === view?.field &&
    !picturesReady(S.field, neededGroups(S.field), pic(), draw)
  )
    return;
  const { canvas, host } = p;
  const size = Math.round(host.clientWidth) || 1;
  const dpr = devicePixelRatio || 1;
  const px = Math.round(size * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  const field = S.field;
  const group = S.groups[S.epoch] ?? null;
  const settings = pic();
  const n = field?.n ?? 1;
  // Field pixels across the whole picture: the field size, even where the grid stops short.
  const across = field ? Math.max(n, (S.fov * 60) / field.scale) : 1;
  const k = size / across;
  const o = (size - n * k) / 2;
  let values: Float32Array | null = null;
  // Pixels no exposure covers (cutouts are turned with the telescope, or the field was panned).
  const real = !!field && !field.simulated && !!S.set;
  const mask = real && field && S.set ? coverageMask(S.set, field) : null;
  const bare = real && (o > 0.5 || !!mask);
  let map: OffscreenCanvas | null = null;

  if (field && group) {
    if (bare) {
      // Around the exposures: the sky map's own picture of the field, dimmed (H1).
      map = aroundMap(field, S.fov, S.lam, draw);
      if (map) {
        const all = fieldGrid(field.ra, field.dec, S.fov).n * k;
        ctx.save();
        ctx.globalAlpha = MAP_ALPHA;
        ctx.drawImage(map, (size - all) / 2, (size - all) / 2, all, all);
        ctx.restore();
      }
    }
    const look = lookFor(field, S.groups, Math.min(S.ref, S.groups.length - 1), settings, S.det);
    const img = imageFor(field, group, look, settings);
    const cut = mask ? maskCanvas(field, mask) : null;
    if (img) {
      values = img.values;
      blit(ctx, img.data, o, k, n, cut);
      if (img.right) {
        // Swipe: the date on screen right of the divider, the reference left of it.
        const x = Math.round(size * S.swipe);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, 0, size - x, size);
        ctx.clip();
        blit(ctx, img.right, o, k, n, cut);
        ctx.restore();
      }
    }
    if (bare) {
      // The real exposures stop here: outline what they cover (H6).
      ctx.save();
      ctx.strokeStyle = cssVar(map ? '--st-ink-2' : '--st-ink-3');
      ctx.setLineDash([4, 4]);
      if (mask && field) {
        ctx.beginPath();
        for (const [x0, y0, x1, y1] of outlineOf(field, mask)) {
          ctx.moveTo(o + x0 * k, o + y0 * k);
          ctx.lineTo(o + x1 * k, o + y1 * k);
        }
        ctx.stroke();
      } else {
        ctx.strokeRect(o + 0.5, o + 0.5, n * k - 1, n * k - 1);
      }
      ctx.restore();
    }
  }

  view = {
    size,
    n,
    k,
    toPic: (x, y) => ({ x: o + (x + 0.5) * k, y: o + (y + 0.5) * k }),
    toField: (cx, cy) => ({ x: (cx - o) / k - 0.5, y: (cy - o) / k - 0.5 }),
    skyToPic: (ra, dec) => {
      if (!field) return null;
      const q = wcsSky2Pix(field.wcs, ra, dec);
      return { x: o + (q.x + 0.5) * k, y: o + (q.y + 0.5) * k };
    },
    picToSky: (cx, cy) =>
      field ? wcsPix2Sky(field.wcs, (cx - o) / k - 0.5, (cy - o) / k - 0.5) : null,
    field,
    group,
    mjd: group && Number.isFinite(group.mjd) ? group.mjd : null,
    det: S.det,
    mode: S.mode,
    values,
    processed: S.original ? [] : cleanupSteps(settings),
    ref: pair()[0],
    inner: { x: o, y: o, size: n * k },
  };
  if (field && group) {
    for (const hook of drawHooks) {
      ctx.save();
      try {
        hook(ctx, view);
      } catch (err) {
        console.error('render: a draw hook failed', err);
      }
      ctx.restore();
    }
  }
  labels(p, size, k, field, !!map);
  if (field && group) warmNext(field);
}

/** The dates whose pictures the view on screen draws (see `imageFor`), its look's reference first. */
function neededGroups(field: Field): (Group | undefined)[] {
  const groups = S.groups;
  const ref = refGroup(groups, Math.min(S.ref, groups.length - 1));
  const g = groups[S.epoch];
  if (!g) return [];
  if (S.color) {
    const by = g.visit === null ? 'window' : 'visit';
    return [1, 2, 3, 4, 5, 6].flatMap((d) => {
      const gs = groupFrames(field, d, by);
      return [refGroup(gs, 0), gs.find((x) => x.window === g.window && x.visit === g.visit)];
    });
  }
  switch (S.mode) {
    case 'two':
    case 'swipe':
      return [ref, ...pair()].map((x) => x ?? undefined);
    case 'trail':
      return [ref, ...groups.slice(0, S.epoch + 1)];
    case 'stack':
      return [ref, ...groups];
    default:
      return [ref, g];
  }
}

let warmTimer = 0;
/**
 * Prepares the next two pictures while the page is idle, so the next step is a cache hit and
 * stays under 50 ms (SPEC 11.2) even on R Draconis's 119-pixel grids.
 */
function warmNext(field: Field): void {
  if (S.mode !== 'flip' && S.mode !== 'trail' && S.mode !== 'diff') return;
  cancelIdle(warmTimer);
  warmTimer = idle(() => {
    if (S.field !== field) return;
    const settings = pic();
    const steps = [1, -1, 2].map((d) => (S.epoch + d + S.groups.length) % S.groups.length);
    // Their pictures are made in the worker first; this runs again once they are.
    const next = steps.map((i) => S.groups[i]);
    if (S.mode !== 'diff' && !picturesReady(field, next, settings, () => warmNext(field))) return;
    const look = lookFor(field, S.groups, Math.min(S.ref, S.groups.length - 1), settings, S.det);
    for (const i of steps) {
      const g = S.groups[i];
      if (!g) continue;
      if (S.mode === 'diff') differenceImage(field, S.groups, i, look, settings);
      else flipImage(field, g, look, settings);
    }
  });
}

const idle = (fn: () => void): number =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout: 300 })
    : window.setTimeout(fn, 30);
const cancelIdle = (id: number): void =>
  typeof cancelIdleCallback === 'function' ? cancelIdleCallback(id) : clearTimeout(id);

interface Painted {
  data: ImageData;
  /** Swipe: the picture right of the divider. */
  right?: ImageData;
  values: Float32Array | null;
}

function imageFor(field: Field, group: Group, look: Look, p: PicSettings): Painted | null {
  if (S.color) return colourPainted(field, group, p);
  switch (S.mode) {
    case 'two': {
      const [a, b] = pair();
      if (!a || !b) return null;
      return { data: twoDatesImage(field, a, b, look, p), values: null };
    }
    case 'diff':
      return {
        data: differenceImage(field, S.groups, S.epoch, look, p),
        values: differencePicture(field, S.groups, S.epoch, p),
      };
    case 'swipe': {
      const [a, b] = pair();
      if (!a || !b) return null;
      return {
        data: flipImage(field, a, look, p),
        right: flipImage(field, b, look, p),
        values: groupPicture(field, b, p),
      };
    }
    case 'stack': {
      const st = stackNow();
      if (!st) return null;
      return { data: stackImage(field, st, look, p), values: st.pix };
    }
    case 'trail':
      return {
        data: trailImage(field, S.groups, S.epoch, look, p),
        values: groupPicture(field, group, p),
      };
    default:
      return { data: flipImage(field, group, look, p), values: groupPicture(field, group, p) };
  }
}

/** Color: each detector's picture of the same date, through its own look. */
function colourPainted(field: Field, group: Group, p: PicSettings): Painted {
  const by = group.visit === null ? 'window' : 'visit';
  const byDet = [1, 2, 3, 4, 5, 6].map((d) => {
    const gs = groupFrames(field, d, by);
    const g = gs.find((x) => x.window === group.window && x.visit === group.visit);
    if (!g) return null;
    return { group: g, look: lookFor(field, gs, 0, p, d) };
  });
  return { data: colourImage(field, byDet, p), values: null };
}

let scratch: OffscreenCanvas | null = null;
/** Draws a field's image; with `cut`, only the pixels some exposure covers. */
function blit(
  ctx: CanvasRenderingContext2D,
  img: ImageData,
  o: number,
  k: number,
  n: number,
  cut: OffscreenCanvas | null = null,
): void {
  if (!scratch || scratch.width !== img.width || scratch.height !== img.height) {
    scratch = new OffscreenCanvas(img.width, img.height);
  }
  const sc = scratch.getContext('2d');
  sc?.putImageData(img, 0, 0);
  if (sc && cut) {
    sc.globalCompositeOperation = 'destination-in';
    sc.drawImage(cut, 0, 0);
    sc.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(scratch, o, o, n * k, n * k);
}

const cuts = new WeakMap<Field, OffscreenCanvas>();
/** The covered pixels of a field as an alpha mask, kept per field. */
function maskCanvas(field: Field, mask: Uint8Array): OffscreenCanvas {
  let c = cuts.get(field);
  if (!c) {
    c = new OffscreenCanvas(field.n, field.n);
    const g = c.getContext('2d');
    if (g) {
      const img = g.createImageData(field.n, field.n);
      for (let i = 0; i < mask.length; i++) img.data[i * 4 + 3] = mask[i] ? 255 : 0;
      g.putImageData(img, 0, 0);
    }
    cuts.set(field, c);
  }
  return c;
}

const outlines = new WeakMap<Field, [number, number, number, number][]>();
function outlineOf(field: Field, mask: Uint8Array): [number, number, number, number][] {
  let o = outlines.get(field);
  if (!o) {
    o = maskOutline(mask, field.n);
    outlines.set(field, o);
  }
  return o;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';
}

/** The picture's own labels: date badge, the pass tint at the edge, scale bar and north/east. */
function labels(p: Parts, size: number, k: number, field: Field | null, map: boolean): void {
  const h = hud();
  const g = S.groups[S.epoch];
  p.badge.hidden = !h;
  if (h) {
    // No lettered tile: the date says which picture this is (redesign, "Date chips"); the pass
    // tint stays on the picture's edge.
    const tile = '';
    const warn = h.warn ? `<span class="pic-warn">${esc(h.warn)}</span>` : '';
    // Around the real exposures, the sky map: said on the badge that says what the picture is (H1).
    const around = map
      ? '<span class="pic-around"><b>Sky map (all dates averaged)</b> past the dashes</span>'
      : '';
    p.badge.innerHTML = `${warn}<span class="pic-title">${tile}<b>${esc(h.title)}</b></span>${h.lines
      .map((l) => `<span>${esc(l)}</span>`)
      .join('')}${h.note ? `<span class="pic-warn">${esc(h.note)}</span>` : ''}${around}`;
  }
  // The edge takes the tint of the pass on screen while the pictures flip (DESIGN "Data windows").
  const tinted = !!g && !S.color && (S.mode === 'flip' || S.mode === 'trail');
  p.edge.hidden = !tinted;
  if (tinted && g) p.edge.style.setProperty('--tint', `var(--p${(g.window % 4) + 1})`);

  p.divider.hidden = !(field && S.mode === 'swipe' && S.groups.length > 1);
  p.divider.style.left = `${S.swipe * 100}%`;
  p.divider.setAttribute('aria-valuenow', String(Math.round(S.swipe * 100)));

  p.scale.hidden = !field;
  if (field) {
    // A round length between about 40 and 120 px: 1′, 2′, 5′ or 10′ (or 30″ in a 3′ field).
    const perArcmin = (60 / field.scale) * k;
    const choices = [0.5, 1, 2, 5, 10];
    const len = choices.find((c) => c * perArcmin >= 40) ?? 10;
    const text = len < 1 ? '30 arcsec' : `${len} arcmin`;
    p.scale.innerHTML = `<span class="pic-bar" style="width:${Math.round(len * perArcmin)}px">${text}</span>
      <svg class="pic-ne" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="North is up, east is left">
        <path d="M26 30V9M26 30H6"/><text x="22.5" y="6">N</text><text x="-1" y="33">E</text></svg>`;
  }
}

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}

// ----- Pointer: pan, tap, wheel -----------------------------------------------------------------

/** Set by frame.ts: what a finished drag inside the picture does with the new centre. */
let panHandler: ((ra: number, dec: number) => void) | null = null;
let panPreview: ((ra: number, dec: number) => void) | null = null;
let wheelHandler: ((steps: number) => void) | null = null;

/** Lane D wiring: frame.ts hands the picture what pans and the wheel do. */
export function setPointerActions(a: {
  pan: (ra: number, dec: number) => void;
  preview: (ra: number, dec: number) => void;
  wheel: (steps: number) => void;
}): void {
  panHandler = a.pan;
  panPreview = a.preview;
  wheelHandler = a.wheel;
}

/** The sky position the picture centre would have after dragging by (dx, dy) CSS pixels. */
function centreAfter(dx: number, dy: number): { ra: number; dec: number } | null {
  const f = S.field;
  if (!f || !view) return null;
  const c = (f.n - 1) / 2;
  return wcsPix2Sky(f.wcs, c - dx / view.k, c - dy / view.k);
}

function watchPointer(canvas: HTMLCanvasElement): void {
  let down: { x: number; y: number; id: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    capture(canvas, e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (!panning && Math.hypot(dx, dy) <= 4) return;
    if (!S.field) return;
    panning = { dx, dy };
    canvas.classList.add('panning');
    canvas.style.translate = `${dx}px ${dy}px`;
    const c = centreAfter(dx, dy);
    if (c) panPreview?.(c.ra, c.dec);
  });
  const end = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const was = panning;
    down = null;
    panning = null;
    canvas.classList.remove('panning');
    canvas.style.translate = '';
    if (was) {
      const c = centreAfter(was.dx, was.dy);
      if (c && e.type === 'pointerup') panHandler?.(c.ra, c.dec);
      return;
    }
    if (e.type !== 'pointerup' || !view) return;
    const r = canvas.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const f = view.toField(cx, cy);
    const sky = view.picToSky(cx, cy);
    if (!sky) return;
    for (const fn of tapFns) fn({ x: f.x, y: f.y, ra: sky.ra, dec: sky.dec });
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // The wheel over the picture changes the field size, one step per notch; the sky stays still.
  // Small trackpad deltas add up to one notch (60 px) before a step, so a short swipe is one step.
  let lastAt = 0;
  let pending = 0;
  canvas.parentElement?.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      if (now - lastAt > 300) pending = 0; // a new gesture
      lastAt = now;
      pending += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(pending) < 60) return;
      wheelHandler?.(pending > 0 ? 1 : -1);
      pending = 0;
    },
    { passive: false },
  );
}

function watchDivider(divider: HTMLElement): void {
  const host = () => divider.parentElement?.getBoundingClientRect();
  divider.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    capture(divider, e.pointerId);
  });
  divider.addEventListener('pointermove', (e) => {
    const r = host();
    if (!r || !divider.hasPointerCapture(e.pointerId)) return;
    S.swipe = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    draw();
  });
  divider.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
    if (!d) return;
    e.preventDefault();
    S.swipe = Math.max(0, Math.min(1, S.swipe + d));
    draw();
  });
}

/** The next field size up or down from the one on screen (for the wheel and the buttons). */
export function nextFov(steps: number): (typeof FOVS)[number] {
  const i = FOVS.indexOf(S.fov) + steps;
  return FOVS[Math.max(0, Math.min(FOVS.length - 1, i))] ?? S.fov;
}

/** Captures the pointer when the browser allows it (a synthetic or ended pointer cannot be). */
function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    // Nothing to capture: the drag still works while the pointer stays over the element.
  }
}
