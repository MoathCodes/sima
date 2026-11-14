/**
 * The opening intro: about six seconds, once per browser (DESIGN.md "Intro").
 *
 * 1. Darkness. A black disc, the sky globe in shadow, with a thin ring of light round its edge,
 *    like an eclipse's corona. The ring's light is the real SPHEREx sky along the globe's edge,
 *    from the shipped all-sky images (public/sky-seed/allsky), one detector at a time, from
 *    0.91 to 4.92 µm, each in its detector's colour.
 * 2. A "diamond ring" flare at the point of the edge where the globe will land: Barnard's Star.
 * 3. The name inside the dark disc: سيما, Sima, and one line.
 * 4. The shadow slides off: the globe is the real SPHEREx sky (the shipped image of the channel
 *    the sky map shows), and it turns until Barnard's Star faces us.
 * 5. The globe grows until the sky fills the window; the sky map takes over and glides in to its
 *    own view, where the frame is already playing; the page's cards fade in.
 *
 * It never delays the page: every part starts under it as usual, and the picture is drawn in a
 * worker (render.ts, worker.ts). If the sky map is not in by step 4, the ring and name hold,
 * breathing, for up to 2 s more; then the shipped sky is shown anyway. Any key, click or tap
 * skips to the end. With reduced motion it is a still ring and name, then a fade.
 *
 * Owner: the intro (src/intro/, src/styles/intro.css). index.html carries a tiny script that
 * decides before the first paint whether the intro plays (wanted.ts, `html[data-intro]`).
 */
import { camera, introZoom, toScreen } from '../sky/sky.ts';
import { on } from '../shell/bus.ts';
import { CHANNEL_LAM, DEFAULT_LAM, channelFor, detectorOf } from '../sky/hips.ts';
import { targetByKey } from '../core/targets.ts';
import { INTRO_KEY } from './wanted.ts';
import { lookAt, nestPixel, radec, toSky, unit } from './sphere.ts';
import {
  T,
  flareDir,
  globeRadius,
  handFov,
  sceneAt,
  mapScale,
  type Landing,
  type Plan,
} from './scene.ts';
import { hex, startPainter, type PainterEvent, type PainterInit, type Rgb } from './render.ts';

const DEG = Math.PI / 180;
const BASE = import.meta.env.BASE_URL;
const nowAbs = () => performance.timeOrigin + performance.now();

function remember(): void {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Storage blocked: the intro just will not remember.
  }
}

/** Starts the intro if index.html's early check asked for it (`html[data-intro]`). */
export function startIntro(): void {
  if (document.documentElement.dataset.intro === undefined) return;
  remember();
  play(false);
}

/** Plays the intro again (About's "Play the intro"). */
export function playIntro(): void {
  if (running) return;
  play(true);
}

// ----- The run --------------------------------------------------------------------------------

interface Painter {
  plan(p: Plan): void;
  size(w: number, h: number, dpr: number): void;
  stop(): void;
}

interface Run {
  el: HTMLElement;
  /** When the intro starts: performance.timeOrigin + performance.now(), ms. */
  start: number;
  painter: Painter | null;
  /** Shipped pictures the painter has ready. */
  loaded: Set<number>;
  revealAt: number | null;
  handAt: number | null;
  /** The sky map has been moved to the landing's start (it must be put back on a skip). */
  moved: boolean;
  movedAt: number;
  /** The sky map's own width (degrees) before the intro moved it: where the landing ends. */
  finalFov: number | null;
  land: Landing | null;
  reduced: boolean;
  skyChannel: number;
  /** The frame's patch, and its name when it is a target: the flare names it if we land on it. */
  patch: { ra: number; dec: number; name: string } | null;
  sent: string;
  size: string;
  raf: number;
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
  const lead = replay ? 400 : 0;
  if (replay) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: lead, easing: 'ease-out' });

  const run: Run = {
    el,
    start: nowAbs() + lead,
    painter: null,
    loaded: new Set(),
    revealAt: null,
    handAt: null,
    moved: false,
    movedAt: 0,
    finalFov: null,
    land: null,
    reduced,
    skyChannel: channelFor(DEFAULT_LAM),
    patch: null,
    sent: '',
    size: '',
    raf: 0,
    off: [],
  };
  running = run;
  run.off.push(
    on(
      'shown',
      (s) => {
        if (s.lam !== null) run.skyChannel = channelFor(s.lam);
      },
      { replay: true },
    ),
    on(
      'patch',
      (p) => {
        run.patch = { ra: p.ra, dec: p.dec, name: (p.target && targetByKey(p.target)?.name) || '' };
      },
      { replay: true },
    ),
  );
  showWords(run, lead);

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
  run.off.push(() => removeEventListener('keydown', skip, { capture: true }));
  el.addEventListener('pointerdown', skip);
  el.addEventListener('click', swallow);
  el.addEventListener('wheel', swallow, { passive: false });
  // The painter starts in the next frame, not while the page's parts start: the first WebGL
  // context of a page can take a couple of hundred ms to make.
  run.raf = requestAnimationFrame(() => {
    if (running !== run) return;
    run.painter = paint(run, el.querySelector('canvas')!);
    run.raf = requestAnimationFrame(() => frame(run));
  });
}

/** Starts the painter: in a worker where the browser can, else on the page. */
function paint(run: Run, canvas: HTMLCanvasElement): Painter {
  const css = getComputedStyle(document.documentElement);
  const colour = (name: string): Rgb => hex(css.getPropertyValue(name).trim() || '#ffffff');
  const init: Omit<PainterInit, 'canvas'> = {
    base: BASE,
    tints: ['--d1', '--d2', '--d3', '--d4', '--d5', '--d6'].map(colour),
    sky: colour('--sky'),
    start: run.start,
    plan: plan(run),
    width: innerWidth,
    height: innerHeight,
    dpr: Math.min(devicePixelRatio || 1, 2),
  };
  const tell = (e: PainterEvent) => {
    if (running !== run) return;
    if (e.type === 'loaded') run.loaded.add(e.ch);
    else {
      console.warn(`intro: ${e.why}; the page shows without it`);
      finish(run, 'fade');
    }
  };
  if ('transferControlToOffscreen' in canvas) {
    try {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      const off = canvas.transferControlToOffscreen();
      worker.onmessage = (e: MessageEvent<PainterEvent>) => tell(e.data);
      worker.onerror = (e) => {
        e.preventDefault();
        tell({ type: 'failed', why: `the intro's worker stopped (${e.message})` });
      };
      worker.postMessage({ type: 'init', init: { ...init, canvas: off } }, [off]);
      return {
        plan: (p) => worker.postMessage({ type: 'plan', plan: p }),
        size: (w, h, dpr) => worker.postMessage({ type: 'size', w, h, dpr }),
        stop: () => worker.postMessage({ type: 'stop' }),
      };
    } catch (err) {
      console.warn('intro: no worker, drawing on the page', err);
    }
  }
  return startPainter({ ...init, canvas }, tell);
}

/** The plan the painter draws from. */
function plan(run: Run): Plan {
  const w = innerWidth;
  const h = innerHeight;
  return {
    reduced: run.reduced,
    skyChannel: run.skyChannel,
    revealAt: run.revealAt,
    handAt: run.handAt,
    land: run.land ?? landing(w, h, run.finalFov ?? camera().fov),
  };
}

/** Decides what happens next, once a frame; the painter draws on its own clock. */
function frame(run: Run): void {
  if (running !== run) return;
  run.raf = requestAnimationFrame(() => frame(run));
  const t = Math.max(0, (nowAbs() - run.start) / 1000);
  const w = innerWidth;
  const h = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const size = `${w} ${h} ${dpr}`;
  if (size !== run.size) {
    run.size = size;
    run.painter?.size(w, h, dpr);
  }
  const live = !!document.getElementById('sky')?.dataset.view;
  const globe = run.loaded.has(run.skyChannel);

  // The sky map waits at the landing's start, under the intro, from as soon as it exists: its
  // first wide view costs it a second or more of work, best done while the ring comes up. NASA's
  // sharp tiles for the landing's end are asked for meanwhile.
  if (live && !run.moved && !run.reduced) {
    run.finalFov = camera().fov;
    const land = landing(w, h, run.finalFov);
    introZoom(land.from, land.from, 0);
    run.moved = true;
    run.movedAt = t;
    prefetch(run.skyChannel, land, w, h);
  }
  // Where the globe lands: the sky map's view (its centre now, its own width).
  if (live && run.handAt === null) run.land = landing(w, h, run.finalFov ?? camera().fov);

  // The reveal: on time if the sky map (at the landing's start) and the shipped globe are in;
  // else the ring holds for up to `hold` more. The map's wide view comes from shipped tiles in
  // well under 1.5 s; its loading card also counts the sharp tiles asked for above, which may
  // take longer and must not hold the intro.
  const decideAt = T.reveal - T.flareLead;
  if (run.revealAt === null && !run.reduced && t >= decideAt) {
    if (globe && ((run.moved && (skyIsIn() || t - run.movedAt > 1.5)) || t >= decideAt + T.hold)) {
      run.revealAt = t + T.flareLead;
      showReveal(run, t);
    } else if (t >= decideAt + T.hold + 1.5) {
      finish(run, 'fade'); // even the shipped sky did not come: just show the page
      return;
    }
  }
  if (run.reduced && t >= T.still && (skyIsIn() || t >= T.still + T.hold)) {
    finish(run, 'fade');
    return;
  }
  // The hand-over: the sky map glides in from where the globe has grown to.
  const r = run.revealAt === null ? -Infinity : t - run.revealAt;
  if (run.handAt === null && r >= T.hand && run.land) {
    if (run.moved && (skyIsIn() || t - run.movedAt > 3)) {
      run.handAt = t;
      introZoom(run.land.from, run.land.fov, T.land * 1000);
      document.documentElement.dataset.intro = 'land';
      run.el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: T.crossfade * 1000,
        easing: 'ease-in-out',
        fill: 'forwards',
      });
    } else if (r >= T.hand + 3) {
      finish(run, 'fade');
      return;
    }
  }

  const p = plan(run);
  const key = JSON.stringify(p);
  if (key !== run.sent) {
    run.sent = key;
    run.painter?.plan(p);
  }
  const s = sceneAt(p, t, w, h, (ch) => run.loaded.has(ch));
  if (s.done) {
    finish(run, 'land');
    return;
  }
  setSource(run, run.loaded.size ? s.sourceCh : undefined, s.source);
  if (run.reduced) {
    const star = run.el.querySelector('.intro-star');
    const label = flareName(run, p.land);
    if (star && star.textContent !== label) star.textContent = label;
  }
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
  cancelAnimationFrame(run.raf);
  for (const fn of run.off) fn();
  if (run.moved && run.finalFov !== null && how !== 'land') {
    introZoom(run.finalFov, run.finalFov, 0);
  }
  const html = document.documentElement;
  const done = () => {
    run.painter?.stop();
    run.el.remove();
    delete html.dataset.intro;
  };
  const cards = (ms: number) => {
    for (const child of document.body.children) {
      if (child === run.el || child.id === 'sky' || !(child instanceof HTMLElement)) continue;
      child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' });
    }
  };
  if (how === 'land') {
    // The cards waited while the map glided in (html[data-intro='land']).
    done();
    cards(T.cardsMs);
    return;
  }
  // A skip during the landing: the cards are waiting, so they come in with the fade.
  if (html.dataset.intro === 'land') {
    html.dataset.intro = 'run';
    cards(T.skipMs);
  }
  const from = getComputedStyle(run.el).opacity;
  for (const a of run.el.getAnimations()) a.cancel();
  const fade = run.el.animate([{ opacity: from }, { opacity: 0 }], {
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

// ----- The words ------------------------------------------------------------------------------

/**
 * The name and its line fade in on the compositor (Web Animations), so they stay smooth while
 * the page's main thread is busy starting.
 */
function showWords(run: Run, lead: number): void {
  const name = run.el.querySelector<HTMLElement>('.intro-name');
  if (!name) return;
  name.style.setProperty('--r0', `${globeRadius(innerWidth, innerHeight)}px`);
  const parts = [...name.children] as HTMLElement[];
  const times = [T.ar, T.la, T.line];
  parts.forEach((el, i) => {
    const [a, b] = times[i] ?? T.line;
    el.animate(
      run.reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'none' },
          ],
      {
        delay: lead + (run.reduced ? 0 : a * 1000),
        duration: run.reduced ? 400 : (b - a) * 1000,
        easing: 'cubic-bezier(.45,0,.4,1)',
        fill: 'both',
      },
    );
  });
  if (run.reduced) showStar(run, [{ opacity: 0 }, { opacity: 1 }], 0, 400);
}

/** At the reveal's decision: the name leaves, and the flare's name comes and goes with it. */
function showReveal(run: Run, t: number): void {
  const R = run.revealAt!;
  const name = run.el.querySelector<HTMLElement>('.intro-name');
  name?.animate([{ opacity: 1 }, { opacity: 0 }], {
    delay: Math.max(0, (R + T.nameOut[0] - t) * 1000),
    duration: (T.nameOut[1] - T.nameOut[0]) * 1000,
    easing: 'ease-in-out',
    fill: 'forwards',
  });
  const span = (T.flareLead + 1.1) * 1000;
  showStar(
    run,
    [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.3 },
      { opacity: 1, offset: 0.5 },
      { opacity: 0, offset: 1 },
    ],
    Math.max(0, (R - T.flareLead - t) * 1000),
    span,
  );
}

function showStar(run: Run, frames: Keyframe[], delay: number, duration: number): void {
  const star = run.el.querySelector<HTMLElement>('.intro-star');
  if (!star) return;
  const w = innerWidth;
  const h = innerHeight;
  const flare = flareDir(w);
  const gap = globeRadius(w, h) + 26;
  star.textContent = flareName(run, run.land ?? landing(w, h, run.finalFov ?? camera().fov));
  star.style.transform = `translate(${(w / 2 + flare[0] * gap).toFixed(1)}px, ${(h / 2 - flare[1] * gap).toFixed(1)}px) translate(0, -50%)`;
  star.animate(frames, { delay, duration, easing: 'ease-in-out', fill: 'both' });
}

/** The name of what the globe lands on: the frame's target, when its patch is at the centre. */
function flareName(run: Run, land: Landing): string {
  const p = run.patch;
  if (!p?.name) return '';
  const a = unit(p.ra, p.dec);
  const b = toSky(land.q, [0, 0, 1]);
  const sep = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) / DEG;
  return sep < land.fov * 0.25 ? p.name : '';
}

let lastSource = '';
/** What the light is (H2): source, release, date and wavelength. */
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
  el.style.opacity = o.toFixed(2);
}

// ----- The landing ----------------------------------------------------------------------------

/**
 * The sky map's view, where the intro lands (its centre now and its own width, `ownFov`), and
 * the width the map glides in from.
 */
function landing(w: number, h: number, ownFov: number): Landing {
  const c = camera();
  const p = toScreen(c.ra, c.dec);
  const from = handFov(w, h, ownFov);
  return {
    q: lookAt(c.ra, c.dec),
    fov: Math.min(ownFov, from),
    x: p?.x ?? w / 2,
    y: p?.y ?? h / 2,
    from,
    fromScale: mapScale(w, from),
  };
}

/**
 * Asks the sky's service worker for NASA's sharp tiles (order 5, the cube's deepest) of the
 * landing's last stretch while the map waits at the landing's start: the worker keeps them, so
 * the map lands sharp instead of fetching them as it arrives. Nearest the centre first.
 */
function prefetch(channel: number, land: Landing, w: number, h: number): void {
  if (!navigator.serviceWorker?.controller) return;
  const fov = Math.max(land.fov * 2.5, 4); // the landing's slow, last part
  const scale = mapScale(w, fov);
  const tiles = new Map<number, number>();
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const dx = (i / steps - 0.5) * w;
      const dy = (j / steps - 0.5) * h;
      // Orthographic, as the map: a point rho globe radii from the centre is asin(rho) away.
      const rho = Math.min(1, Math.hypot(dx, dy) / scale);
      const th = Math.asin(rho);
      // View space: x east (screen left), y north (screen up).
      const p = radec(toSky(land.q, [-dx / scale, -dy / scale, Math.cos(th)]));
      const n = nestPixel(32, p.ra, p.dec);
      tiles.set(n, Math.min(tiles.get(n) ?? Infinity, Math.hypot(dx, dy)));
    }
  }
  for (const [n] of [...tiles].sort((a, b) => a[1] - b[1])) {
    const dir = Math.floor(n / 10000) * 10000;
    void fetch(`${BASE}sky-hips/spherex/${channel}/0/Norder5/Dir${dir}/Npix${n}.png`, {
      priority: 'low',
    } as RequestInit).catch(() => undefined);
  }
}
