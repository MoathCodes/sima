/**
 * The opening intro: about six seconds, once per browser (DESIGN.md "Intro").
 *
 * 1. Darkness. A black disc, the sky globe in shadow, with a thin ring of light round its edge,
 *    like an eclipse's corona. The ring's light is the real SPHEREx sky along the globe's edge,
 *    from the shipped all-sky images (public/sky-seed/allsky), one detector at a time, from
 *    0.91 to 4.92 µm, each in its detector's colour.
 * 2. A "diamond ring" flare at one point of the edge, where Barnard's Star is.
 * 3. The name inside the dark disc: سيما, Sima, and one line.
 * 4. The shadow slides off: the globe is the real SPHEREx sky (the shipped image of the channel
 *    the sky map opens on), and it turns until Barnard's Star faces us.
 * 5. The globe grows until the sky fills the window and lands on the sky map's own view, where
 *    the frame is already playing. The page's cards fade in; the intro fades out over the map.
 *
 * It never delays the page: every part starts under it as usual. If the sky map is not in by
 * step 4, the ring and name hold, breathing, for up to 2 s more, then the shipped sky is shown
 * anyway. Any key, click or tap skips to the end. With reduced motion it is a still ring and
 * name, then a fade. Never with `embed=1`.
 *
 * Owner: the intro (this folder and src/styles/intro.css). index.html carries a tiny script that
 * decides, before the first paint, whether the intro plays (`html[data-intro]`).
 */
import { camera, introZoom, toScreen } from '../sky/sky.ts';
import { on } from '../shell/bus.ts';
import { CHANNEL_LAM, DEFAULT_LAM, channelFor, detectorOf } from '../sky/hips.ts';
import { targetByKey } from '../core/targets.ts';
import { axisAngle, lookAt, matrix, multiply, type Quat, type Vec3 } from './sphere.ts';

/** Storage key: set once the intro has played in this browser. */
export const INTRO_KEY = 'sima-intro';
const DEG = Math.PI / 180;
const BASE = import.meta.env.BASE_URL;
/** One channel from the middle of each detector, shortest wavelength first: the ring's light. */
const RING_CHANNELS = [8, 25, 42, 59, 76, 93];

// ----- Timing (seconds) ----------------------------------------------------------------------

const T = {
  ringIn: [0.25, 1.5], // the ring comes up
  sweep: [0.35, 2.7], // the ring's light goes through the six detectors
  ar: [0.7, 1.4], // سيما
  la: [1.0, 1.7], // Sima
  line: [1.35, 2.05], // the line
  /** The reveal starts here when the sky map is in; else up to `hold` later. */
  reveal: 2.55,
  hold: 2.0,
  // Seconds from the reveal:
  flareLead: 0.55, // the flare swells this long before the reveal
  nameOut: [-0.25, 0.3],
  shadow: [0.0, 1.45],
  ringOut: [0.15, 1.25],
  turn: [0.3, 2.05],
  /** The globe hands over to the sky map here, which then glides in for `land`. */
  hand: 2.05,
  land: 1.45,
  /** The intro fades over the sky map in the first part of the landing. */
  crossfade: 0.4,
  cardsMs: 450,
  skipMs: 260,
  /** Reduced motion: the still ring and name stay this long, then fade. */
  still: 2.4,
  fadeMs: 600,
} as const;

/** The sky map's width (degrees) when it takes over from the globe, at most. */
const HAND_FOV = 55;


// ----- Deciding -------------------------------------------------------------------------------

/**
 * Whether the intro should play on this page: `?intro=1` forces it, `?intro=0` and `embed=1`
 * stop it, otherwise it plays until the browser remembers it. index.html repeats this rule
 * inline (it must decide before the first paint); tests/intro.test.ts checks the two agree.
 */
export function introWanted(search: string, seen: boolean | null): boolean {
  const q = new URLSearchParams(search);
  if (q.get('embed') === '1') return false;
  const flag = q.get('intro');
  if (flag === '1') return true;
  if (flag === '0') return false;
  return seen === false;
}

function remember(): void {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Storage blocked: the intro just will not remember.
  }
}

/** Starts the intro if index.html's early check asked for it (`html[data-intro]`). */
export function startIntro(): void {
  const html = document.documentElement;
  if (html.dataset.intro === undefined) return;
  remember();
  play(false);
}

/** Plays the intro again (About's "Play the intro"). */
export function playIntro(): void {
  if (running) return;
  document.documentElement.dataset.intro = 'run';
  play(true);
}

// ----- The run --------------------------------------------------------------------------------

interface Run {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  gl: Gl | null;
  start: number;
  /** Seconds from start at which the reveal starts; null until decided. */
  revealAt: number | null;
  /** Seconds from start at which the sky map took over; null until then. */
  handAt: number | null;
  /** The sky map's view to land on, and the width it starts the landing from. */
  land: Landing | null;
  /** The sky map has been moved to the landing's start (it must be put back on a skip). */
  moved: boolean;
  ending: boolean;
  raf: number;
  reduced: boolean;
  skyChannel: number;
  off: (() => void)[];
}
let running: Run | null = null;

function play(replay: boolean): void {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div');
  el.id = 'intro';
  el.className = 'intro';
  el.dataset.overlay = 'intro';
  el.dataset.guide = 'intro';
  el.innerHTML = `
    <canvas class="intro-sky" role="img" aria-label="NASA SPHEREx's infrared sky as a globe"></canvas>
    <div class="intro-name">
      <span class="intro-ar" lang="ar" dir="rtl">سيما</span>
      <span class="intro-la">Sima</span>
      <p class="intro-line">The infrared sky, as NASA's SPHEREx sees it.</p>
    </div>
    <span class="intro-star" aria-hidden="true"></span>
    <p class="intro-source" aria-hidden="true"></p>
    <button class="intro-skip" type="button" data-guide="intro-skip">Skip</button>`;
  document.body.append(el);
  document.documentElement.dataset.intro = 'run';
  if (replay) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });

  const canvas = el.querySelector('canvas')!;
  const off: (() => void)[] = [];
  const run: Run = {
    el,
    canvas,
    gl: makeGl(canvas),
    start: performance.now() + (replay ? 400 : 0),
    revealAt: null,
    handAt: null,
    land: null,
    moved: false,
    ending: false,
    raf: 0,
    reduced,
    skyChannel: channelFor(DEFAULT_LAM),
    off,
  };
  running = run;
  off.push(
    on(
      'shown',
      (s) => {
        if (s.lam !== null) run.skyChannel = channelFor(s.lam);
      },
      { replay: true },
    ),
    // The flare marks where the globe lands: the frame's patch. Named when it is a target.
    on(
      'patch',
      (p) => {
        const name = (p.target && targetByKey(p.target)?.name) || '';
        const star = el.querySelector('.intro-star');
        if (star && star.textContent !== name) star.textContent = name;
      },
      { replay: true },
    ),
  );
  if (!run.gl) {
    // No WebGL 2 (the sky map needs it too): nothing to draw, so the page simply shows.
    finish(run, 'skip');
    return;
  }
  load(run);

  const skip = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    finish(run, 'skip');
  };
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  // Every key goes to the intro while it plays, so Space does not also start the frame.
  addEventListener('keydown', skip, { capture: true });
  off.push(() => removeEventListener('keydown', skip, { capture: true }));
  el.addEventListener('pointerdown', skip);
  el.addEventListener('click', swallow);
  el.addEventListener('wheel', swallow, { passive: false });
  run.raf = requestAnimationFrame((now) => frame(run, now));
}

/**
 * Ends the run.
 * - `land`: the sky map has finished its glide; the page's cards fade in over it.
 * - `fade`: the intro fades out over the page (reduced motion, or no sky map to land on).
 * - `skip`: the same, quickly, with the sky map put straight back on its own view.
 */
function finish(run: Run, how: 'land' | 'fade' | 'skip'): void {
  if (running !== run) return;
  running = null;
  run.ending = true;
  cancelAnimationFrame(run.raf);
  for (const fn of run.off) fn();
  if (run.moved && run.land && how !== 'land') introZoom(run.land.fov, run.land.fov, 0);
  const html = document.documentElement;
  const done = () => {
    run.gl?.dispose();
    run.el.remove();
    delete html.dataset.intro;
  };
  if (how === 'land') {
    // The cards were held back while the map glided in (html[data-intro='land']).
    done();
    for (const child of document.body.children) {
      if (child.id === 'sky' || !(child instanceof HTMLElement)) continue;
      child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.cardsMs, easing: 'ease-out' });
    }
    return;
  }
  // A skip during the landing: the cards are held back, so bring them in with the fade.
  if (html.dataset.intro === 'land') {
    html.dataset.intro = 'run';
    for (const child of document.body.children) {
      if (child === run.el || child.id === 'sky' || !(child instanceof HTMLElement)) continue;
      child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.skipMs, easing: 'ease-out' });
    }
  }
  const fade = run.el.animate([{ opacity: getComputedStyle(run.el).opacity }, { opacity: 0 }], {
    duration: how === 'skip' ? T.skipMs : T.fadeMs,
    easing: 'ease-in-out',
    fill: 'forwards',
  });
  fade.onfinish = done;
}

/** The sky map has drawn its map for the view it shows (lane C's loading card is done). */
function skyIsIn(): boolean {
  const sky = document.getElementById('sky');
  const card = document.getElementById('sky-loading');
  return !!sky?.dataset.view && !!card?.hidden;
}


// ----- Pictures -------------------------------------------------------------------------------

interface Channel {
  ch: number;
  tex: WebGLTexture;
  /** Display stretch of this channel's ring light: the sky's faint floor and bright end. */
  lo: number;
  hi: number;
}
const loaded = new Map<number, Channel>();

/** Fetches the shipped Allsky images: the first ring channel, the sky's channel, then the rest. */
function load(run: Run): void {
  const order = [RING_CHANNELS[0]!, run.skyChannel, ...RING_CHANNELS.slice(1)];
  const wanted = [...new Set(order)];
  const queue: { ch: number; bitmap: ImageBitmap }[] = [];
  let uploading = false;
  // One upload a frame, so no task gets long.
  const upload = () => {
    const next = queue.shift();
    if (!next || running !== run || !run.gl) {
      uploading = false;
      next?.bitmap.close();
      return;
    }
    const { lo, hi } = stretch(next.bitmap);
    const tex = run.gl.texture(next.bitmap);
    next.bitmap.close();
    if (tex) loaded.set(next.ch, { ch: next.ch, tex, lo, hi });
    requestAnimationFrame(upload);
  };
  for (const ch of wanted) {
    if (loaded.has(ch)) continue;
    void fetch(`${BASE}sky-seed/allsky/${ch}.webp`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) =>
        createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }),
      )
      .then((bitmap) => {
        queue.push({ ch, bitmap });
        queue.sort((a, b) => wanted.indexOf(a.ch) - wanted.indexOf(b.ch));
        if (!uploading) {
          uploading = true;
          requestAnimationFrame(upload);
        }
      })
      .catch((err: unknown) => console.warn(`intro: the shipped sky ${ch} did not load`, err));
  }
}

/** The faint floor and the bright end of a channel (2nd and 99.7th percentiles, on a thumbnail). */
function stretch(bitmap: ImageBitmap): { lo: number; hi: number } {
  const w = 216;
  const h = 232;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { lo: 0.05, hi: 0.8 };
  ctx.drawImage(bitmap, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const v = px[i]!;
    if (v === 0) continue; // the unused tiles at the end of the image
    hist[v]!++;
    n++;
  }
  const at = (q: number) => {
    let sum = 0;
    for (let v = 0; v < 256; v++) {
      sum += hist[v]!;
      if (sum >= q * n) return v / 255;
    }
    return 1;
  };
  const lo = at(0.02);
  return { lo, hi: Math.max(lo + 0.05, at(0.997)) };
}

// ----- Each frame -----------------------------------------------------------------------------

const smooth = (a: number, b: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
/** Ease in and out, gentler than smoothstep at both ends. */
const ease = (a: number, b: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

function frame(run: Run, now: number): void {
  if (running !== run) return;
  run.raf = requestAnimationFrame((n) => frame(run, n));
  const t = Math.max(0, (now - run.start) / 1000);
  const gl = run.gl!;
  const w = innerWidth;
  const h = innerHeight;
  const globe = loaded.get(run.skyChannel) ?? null;
  const live = !!document.getElementById('sky')?.dataset.view;

  // Decide the reveal: on time if the sky map and the shipped globe are in; else hold.
  const decideAt = T.reveal - T.flareLead;
  if (run.revealAt === null && !run.reduced && t >= decideAt) {
    if ((globe && skyIsIn()) || (globe && t >= decideAt + T.hold)) {
      run.revealAt = t + T.flareLead;
    } else if (t >= decideAt + T.hold + 1.5) {
      finish(run, 'fade'); // even the shipped sky did not come: just show the page
      return;
    }
  }
  if (run.reduced && t >= T.still && (skyIsIn() || t >= T.still + T.hold)) {
    finish(run, 'fade');
    return;
  }
  const R = run.revealAt;
  const r = R === null ? -Infinity : t - R; // seconds since the reveal

  // Where the globe lands: the sky map's own view, as it is until the intro moves the map.
  if (!run.moved) run.land = live ? landing(w, h) : null;
  const land = run.land ?? landing(w, h);
  // The sky map waits at the landing's start, under the intro, so its tiles are in by then.
  if (R !== null && !run.moved && run.land && live) {
    introZoom(land.from, land.from, 0);
    run.moved = true;
  }
  // Hand over: once the globe is at the landing's start and the map is in there.
  if (run.handAt === null && R !== null && r >= T.hand) {
    if (run.moved && skyIsIn()) {
      run.handAt = t;
      introZoom(land.from, land.fov, T.land * 1000);
      document.documentElement.dataset.intro = 'land';
    } else if (r >= T.hand + 3) {
      finish(run, 'fade');
      return;
    }
  }
  const u = run.handAt === null ? 0 : (t - run.handAt) / T.land;
  document.documentElement.dataset.introDbg = `${t.toFixed(2)} R=${R?.toFixed(2)} hand=${run.handAt?.toFixed(2)} u=${u.toFixed(2)} moved=${run.moved} in=${skyIsIn()} cam=${camera().fov.toFixed(2)}`;
  if (u >= 1) {
    finish(run, 'land');
    return;
  }

  // The globe's size: still, then growing to the landing's start (cubic ease-in, so its speed
  // there matches the sky map's glide, which starts fast and eases out).
  const r0 = globeRadius(w, h);
  const halfDiag = Math.hypot(w, h) / 2;
  let scale = r0;
  if (run.handAt !== null) {
    const fov = Math.exp(Math.log(land.from) + Math.log(land.fov / land.from) * (1 - (1 - u) ** 3));
    scale = stgScale(w, fov);
  } else if (R !== null) {
    const d1 = Math.log(land.fromScale / r0);
    const d2 = Math.log(land.from / land.fov);
    const grow = Math.min(T.hand - 0.4, (T.land * d1) / d2);
    const x = Math.max(0, Math.min(1, (r - (T.hand - grow)) / grow));
    scale = r0 * Math.exp(d1 * x * x * x);
  }
  // From the globe (orthographic) to the sky map's projection (stereographic) once the globe's
  // edge has left the window.
  const proj = smooth(halfDiag, land.fromScale * 0.98, scale);
  const cx = w / 2 + (land.x - w / 2) * proj;
  const cy = h / 2 + (land.y - h / 2) * proj;

  // The turn: one rotation, about the axis that brings the flare's point to the centre.
  const flare = flareDir(w);
  const before = run.reduced ? 0 : 7 * (1 - smooth(0, T.reveal, Math.min(t, T.reveal)));
  const turn = R === null ? 0 : ease(T.turn[0], T.turn[1], r);
  const q = view(land.q, flare, (90 + before) * (1 - turn) * DEG);

  // The shadow: covers the globe, then slides off away from the flare.
  const slide = R === null ? 0 : ease(T.shadow[0], T.shadow[1], r) * 2.3;

  // The ring: comes up, sweeps through the detectors, breathes while it waits, then fades.
  let ring = run.reduced ? smooth(0, 0.4, t) : smooth(T.ringIn[0], T.ringIn[1], t);
  if (R === null && !run.reduced && t > decideAt) {
    ring *= 0.88 + 0.12 * Math.cos(((t - decideAt) / 2.4) * 2 * Math.PI);
  }
  if (R !== null) ring *= 1 - smooth(T.ringOut[0], T.ringOut[1], r);
  const sweep = run.reduced
    ? Math.max(0, RING_CHANNELS.indexOf(run.skyChannel))
    : 5 * smooth(T.sweep[0], T.sweep[1], t);
  const k = Math.min(4, Math.floor(sweep));
  const f = sweep - k;
  const a = loaded.get(RING_CHANNELS[k]!) ?? firstLoaded(k, -1);
  const b = loaded.get(RING_CHANNELS[Math.min(5, k + 1)]!) ?? a;
  const mix = b === a ? 0 : smooth(0.55, 1, f);
  const tint = detectorTint(Math.min(5, k + smooth(0.3, 1, f)));
  if (!a) ring = 0;

  // The diamond ring: swells as the shadow is about to leave, then fades into the light.
  let flareK = 0;
  if (run.reduced) flareK = 0.75 * smooth(0, 0.4, t);
  else if (R !== null) flareK = smooth(-T.flareLead, 0.1, r) * (1 - smooth(0.25, 1.1, r));

  gl.draw({
    width: w,
    height: h,
    cx,
    cy,
    radius: scale,
    proj,
    rot: matrix(q),
    globe: R === null ? null : (globe?.tex ?? null),
    ringA: a?.tex ?? null,
    ringB: b?.tex ?? null,
    ringLo: [a?.lo ?? 0, b?.lo ?? 0],
    ringHi: [a?.hi ?? 1, b?.hi ?? 1],
    mix,
    tint,
    ring,
    shadow: [-flare[0] * slide, -flare[1] * slide],
    flare: [cx + flare[0] * scale, cy - flare[1] * scale],
    flareK,
  });
  // The intro fades over the sky map as the map takes over.
  run.el.style.opacity = run.handAt === null ? '' : (1 - smooth(0, T.crossfade / T.land, u)).toFixed(3);

  // The words.
  const shown = R === null ? 1 : 1 - smooth(T.nameOut[0], T.nameOut[1], r);
  const words = run.reduced
    ? [1, 1, 1].map(() => smooth(0, 0.4, t))
    : [T.ar, T.la, T.line].map(([s0, s1]) => smooth(s0, s1, t) * shown);
  setWords(run, r0, words, flare, cx, cy, scale, flareK);
  const ch = R !== null && r > 0.4 ? run.skyChannel : (mix > 0.5 ? b : a)?.ch;
  setSource(run, ch, R === null ? ring : 1 - smooth(T.hand - 0.6, T.hand, r));
}

/** CSS px per radian at the centre of the sky map, `fov` degrees wide (stereographic). */
function stgScale(w: number, fov: number): number {
  return w / 2 / (2 * Math.tan((fov * DEG) / 4));
}

interface Landing {
  /** The sky map's view: centre, orientation, width (degrees) and centre on screen. */
  q: Quat;
  fov: number;
  x: number;
  y: number;
  /** The width the map starts its glide from, and its scale there (CSS px per radian). */
  from: number;
  fromScale: number;
}

/**
 * The sky map's view, where the intro lands, and the width the map glides in from: 55° or less,
 * so the globe has filled the window before the map takes over.
 */
function landing(w: number, h: number): Landing {
  const c = camera();
  const p = toScreen(c.ra, c.dec);
  const fov = Math.min(c.fov, HAND_FOV);
  const fromScale = Math.max(stgScale(w, HAND_FOV), Math.hypot(w, h) * 0.8);
  const from = Math.max(fov, Math.min(HAND_FOV, (4 * Math.atan(w / 4 / fromScale)) / DEG));
  return {
    q: lookAt(c.ra, c.dec),
    fov,
    x: p?.x ?? w / 2,
    y: p?.y ?? h / 2,
    from,
    fromScale: stgScale(w, from),
  };
}

function firstLoaded(from: number, step: number): Channel | null {
  for (let i = from; i >= 0 && i < RING_CHANNELS.length; i += step) {
    const c = loaded.get(RING_CHANNELS[i]!);
    if (c) return c;
  }
  for (const c of RING_CHANNELS) if (loaded.has(c)) return loaded.get(c)!;
  return null;
}

/** The globe's radius while it is in shadow, CSS pixels. */
function globeRadius(w: number, h: number): number {
  return Math.min(w * 0.4, h * 0.3, 330);
}

/** Where the flare sits on the globe's edge: up and to the right (x right, y up). */
function flareDir(w: number): [number, number] {
  const a = (w < 600 ? 62 : 48) * DEG;
  return [Math.cos(a), Math.sin(a)];
}

/**
 * The view turned by `theta` about the screen axis square to the flare's direction, so the point
 * at the view's centre sits `theta` from the centre, toward the flare.
 */
function view(end: Quat, flare: [number, number], theta: number): Quat {
  // View space: x east (screen left), y north (up), z toward the centre.
  const dir: Vec3 = [-flare[0], flare[1], 0];
  const axis: Vec3 = [-dir[1], dir[0], 0]; // z × dir
  return multiply(end, axisAngle(axis, -theta));
}

const DETECTOR_VARS = ['--d1', '--d2', '--d3', '--d4', '--d5', '--d6'];
let detectorRgb: [number, number, number][] | null = null;

/** The detector hue at a fractional detector index (0 = D1 … 5 = D6), as 0 to 1 RGB. */
function detectorTint(i: number): [number, number, number] {
  if (!detectorRgb) {
    const css = getComputedStyle(document.documentElement);
    detectorRgb = DETECTOR_VARS.map((v) => hex(css.getPropertyValue(v).trim() || '#ffffff'));
  }
  const k = Math.max(0, Math.min(4, Math.floor(i)));
  const f = Math.max(0, Math.min(1, i - k));
  const a = detectorRgb[k]!;
  const b = detectorRgb[k + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function hex(s: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s);
  if (!m) return [1, 1, 1];
  return [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255];
}

function setWords(
  run: Run,
  r0: number,
  words: number[],
  flare: [number, number],
  cx: number,
  cy: number,
  radius: number,
  flareK: number,
): void {
  const name = run.el.querySelector<HTMLElement>('.intro-name');
  if (name) {
    name.style.setProperty('--r0', `${r0}px`);
    const parts = name.children;
    for (let i = 0; i < parts.length; i++) {
      const el = parts[i] as HTMLElement;
      const o = words[i] ?? 0;
      el.style.opacity = o.toFixed(3);
      el.style.transform = run.reduced ? '' : `translateY(${((1 - o) * 8).toFixed(2)}px)`;
    }
    name.style.visibility = words.some((o) => o > 0.001) ? '' : 'hidden';
  }
  const star = run.el.querySelector<HTMLElement>('.intro-star');
  if (star) {
    const o = flareK > 0 ? Math.min(1, flareK * 1.4) : 0;
    star.style.opacity = o.toFixed(3);
    star.style.visibility = o > 0.001 ? '' : 'hidden';
    const gap = 26;
    const x = cx + flare[0] * (radius + gap);
    const y = cy - flare[1] * (radius + gap);
    star.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(0, -50%)`;
  }
}

let lastSource = '';
function setSource(run: Run, ch: number | undefined, o: number): void {
  const el = run.el.querySelector<HTMLElement>('.intro-source');
  if (!el) return;
  const text =
    ch === undefined
      ? ''
      : `SPHEREx all-sky map, NASA IRSA (DR1) · average of all dates · ${(CHANNEL_LAM[ch] ?? 0).toFixed(2)} µm, detector D${detectorOf(ch)}`;
  if (text !== lastSource) {
    el.textContent = text;
    lastSource = text;
  }
  el.style.opacity = (o * 0.999).toFixed(3);
}

// ----- WebGL ----------------------------------------------------------------------------------

interface DrawArgs {
  width: number;
  height: number;
  cx: number;
  cy: number;
  radius: number;
  /** 0: a globe (orthographic); 1: the sky map's stereographic projection. */
  proj: number;
  rot: Float32Array;
  globe: WebGLTexture | null;
  ringA: WebGLTexture | null;
  ringB: WebGLTexture | null;
  ringLo: [number, number];
  ringHi: [number, number];
  mix: number;
  tint: [number, number, number];
  ring: number;
  shadow: [number, number];
  flare: [number, number];
  flareK: number;
}

interface Gl {
  texture(img: ImageBitmap): WebGLTexture | null;
  draw(a: DrawArgs): void;
  dispose(): void;
}

const VERTEX = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

/* The sky in a HiPS Allsky image (sphere.ts allskyPixel, in GLSL), the globe, the ring and the
   flare. Colours: the map's grey, lifted by the page's blue-black as the sky map's screen-blend
   layer does (DESIGN.md Grey Map Rule); the ring in the detector's hue. */
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uCentre;
uniform float uR;
uniform float uProj;
uniform float uDpr;
uniform mat3 uRot;
uniform sampler2D uGlobe;
uniform sampler2D uRingA;
uniform sampler2D uRingB;
uniform float uHasGlobe;
uniform vec2 uLo;
uniform vec2 uHi;
uniform float uMix;
uniform vec3 uTint;
uniform float uRing;
uniform vec2 uShadow;
uniform vec2 uFlare;
uniform float uFlareK;
uniform vec3 uSky;
out vec4 outColour;

const float PI = 3.14159265358979;

int spread3(int v) { return (v & 1) | ((v & 2) << 1) | ((v & 4) << 2); }

vec2 allsky(vec3 d, float lod) {
  float z = clamp(d.z, -1.0, 1.0);
  float phi = atan(d.y, d.x);
  float za = abs(z);
  float tt = mod(phi / (0.5 * PI), 4.0);
  int face;
  float fx;
  float fy;
  if (za <= 2.0 / 3.0) {
    float t1 = 0.5 + tt;
    float t2 = 0.75 * z;
    float jp = t1 - t2;
    float jm = t1 + t2;
    float ifp = floor(jp);
    float ifm = floor(jm);
    if (ifp == ifm) face = int(mod(ifp, 4.0)) + 4;
    else if (ifp < ifm) face = int(ifp);
    else face = int(ifm) + 8;
    fx = jm - ifm;
    fy = 1.0 - (jp - ifp);
  } else {
    float ntt = min(3.0, floor(tt));
    float tp = tt - ntt;
    float tmp = sqrt(3.0 * (1.0 - za));
    float jp = min(tp * tmp, 0.999999);
    float jm = min((1.0 - tp) * tmp, 0.999999);
    if (z >= 0.0) { face = int(ntt); fx = 1.0 - jm; fy = 1.0 - jp; }
    else { face = int(ntt) + 8; fx = jp; fy = jm; }
  }
  float px = fx * 8.0;
  float py = fy * 8.0;
  int tx = min(7, int(floor(px)));
  int ty = min(7, int(floor(py)));
  int tile = face * 64 + spread3(tx) + 2 * spread3(ty);
  float m = 0.5 * exp2(lod);
  float row = clamp((px - float(tx)) * 64.0, m, 64.0 - m);
  float col = clamp((py - float(ty)) * 64.0, m, 64.0 - m);
  float X = float(tile % 27) * 64.0 + col;
  float Y = float(tile / 27) * 64.0 + row;
  return vec2(X / 1728.0, Y / 1856.0);
}

float sky(sampler2D t, vec3 d, float lod) {
  return textureLod(t, allsky(d, lod), lod).r;
}

float ringLight(vec3 d, float lod) {
  float a = clamp((sky(uRingA, d, lod) - uLo.x) / (uHi.x - uLo.x), 0.0, 1.0);
  float b = clamp((sky(uRingB, d, lod) - uLo.y) / (uHi.y - uLo.y), 0.0, 1.0);
  return mix(a, b, uMix);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr; // CSS px, y down
  vec2 p = (frag - uCentre) / uR;
  p.y = -p.y; // y up
  float r = length(p);
  float px = 1.0 / uR; // one CSS pixel, in globe radii
  vec3 col = vec3(0.0);

  // The globe: the real sky, where the shadow has left it. Orthographic while it is a globe,
  // stereographic (as the sky map) once it fills the window.
  if ((r < 1.0 + 2.0 * px || uProj > 0.0) && uHasGlobe > 0.5) {
    float ts = asin(min(r, 1.0));
    float theta = mix(ts, 2.0 * atan(0.5 * r), uProj);
    vec2 dir = r > 1e-6 ? p / r : vec2(0.0);
    vec3 v = vec3(-dir.x * sin(theta), dir.y * sin(theta), cos(theta));
    vec3 d = uRot * v;
    // Texture detail: Allsky pixels (~0.002 rad) per screen pixel, more toward the globe's edge.
    float stretchOut = mix(1.0 / max(cos(ts), 0.08), 1.0 / (1.0 + 0.25 * r * r), uProj);
    float lod = clamp(log2(500.0 / (uR * uDpr)) + log2(max(stretchOut, 0.01)) * 0.5, 0.0, 6.0);
    float g = sky(uGlobe, d, lod);
    float lit = smoothstep(0.99, 1.01, length(p - uShadow));
    float inside = uProj > 0.0 ? 1.0 : 1.0 - smoothstep(1.0 - px, 1.0 + px, r);
    col = vec3(g) * lit * inside;
  }

  // The ring: the sky along the globe's edge, in the detector's hue.
  if (uRing > 0.001) {
    vec2 q = p / max(r, 1e-5);
    vec3 edge = uRot * vec3(-q.x, q.y, 0.0);
    float broad = pow(ringLight(edge, 4.0), 0.6);
    float fine = pow(ringLight(edge, 2.0), 0.6);
    float h = r - 1.0;
    float outside = smoothstep(-px, px, h);
    // Streamers: brighter sky along the edge reaches further out, as a corona's streamers do.
    float reach = 0.018 + 0.16 * broad * broad + 0.03 * fine;
    float corona = exp(-max(h, 0.0) / reach) * (0.12 + 0.88 * broad) * outside;
    float rim = exp(-abs(h) / (1.4 * px + 0.003)) * (0.45 + 0.9 * fine);
    vec3 light = uTint * (0.85 * corona + 0.9 * rim) + vec3(1.0) * 0.3 * rim * fine * fine;
    col += light * uRing;
  }

  // The diamond ring.
  if (uFlareK > 0.001) {
    vec2 f = (frag - uFlare);
    float d = length(f);
    float core = exp(-d * d / 18.0);
    float glow = exp(-d / (uR * 0.07)) * 0.55 + exp(-d / (uR * 0.22)) * 0.18;
    float spikes = (exp(-abs(f.y) / 1.1) + exp(-abs(f.x) / 1.1)) * exp(-d / (uR * 0.16)) * 0.3;
    col += mix(vec3(1.0), uTint, 0.25) * (core * 1.4 + glow + spikes) * uFlareK;
  }

  col = 1.0 - (1.0 - min(col, vec3(1.0))) * (1.0 - uSky);
  outColour = vec4(col, 1.0);
}`;

function makeGl(canvas: HTMLCanvasElement): Gl | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('intro: shader', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = shader(gl.VERTEX_SHADER, VERTEX);
  const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('intro: program', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const U = {
    res: u('uRes'),
    centre: u('uCentre'),
    r: u('uR'),
    proj: u('uProj'),
    dpr: u('uDpr'),
    rot: u('uRot'),
    globe: u('uGlobe'),
    ringA: u('uRingA'),
    ringB: u('uRingB'),
    hasGlobe: u('uHasGlobe'),
    lo: u('uLo'),
    hi: u('uHi'),
    mix: u('uMix'),
    tint: u('uTint'),
    ring: u('uRing'),
    shadow: u('uShadow'),
    flare: u('uFlare'),
    flareK: u('uFlareK'),
    sky: u('uSky'),
  };
  gl.uniform1i(U.globe, 0);
  gl.uniform1i(U.ringA, 1);
  gl.uniform1i(U.ringB, 2);
  const sky = hex(getComputedStyle(document.documentElement).getPropertyValue('--sky').trim());
  gl.uniform3f(U.sky, ...sky);
  // A 1×1 black picture for slots with nothing loaded yet.
  const empty = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, empty);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  const textures: WebGLTexture[] = [];

  return {
    texture(img) {
      const tex = gl.createTexture();
      if (!tex) return null;
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      textures.push(tex);
      return tex;
    },
    draw(a) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(a.width * dpr);
      const h = Math.round(a.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.res, w, h);
      gl.uniform2f(U.centre, a.cx, a.cy);
      gl.uniform1f(U.r, a.radius);
      gl.uniform1f(U.proj, a.proj);
      gl.uniform1f(U.dpr, dpr);
      gl.uniformMatrix3fv(U.rot, false, a.rot);
      gl.uniform1f(U.hasGlobe, a.globe ? 1 : 0);
      gl.uniform2f(U.lo, ...a.ringLo);
      gl.uniform2f(U.hi, ...a.ringHi);
      gl.uniform1f(U.mix, a.mix);
      gl.uniform3f(U.tint, ...a.tint);
      gl.uniform1f(U.ring, a.ring);
      gl.uniform2f(U.shadow, ...a.shadow);
      gl.uniform2f(U.flare, ...a.flare);
      gl.uniform1f(U.flareK, a.flareK);
      const bind = (unit: number, t: WebGLTexture | null) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t ?? empty);
      };
      bind(0, a.globe);
      bind(1, a.ringA);
      bind(2, a.ringB);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      for (const t of textures) gl.deleteTexture(t);
      textures.length = 0;
      loaded.clear();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
