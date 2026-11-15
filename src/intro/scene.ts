/**
 * The intro's timeline: what is on screen at each moment. Pure: no page, no WebGL. Used by the
 * painter (render.ts, usually in a worker) for the picture and by intro.ts for the words.
 * Owner: the intro (src/intro/).
 */
import { axisAngle, matrix, multiply, type Quat, type Vec3 } from './sphere.ts';
import { fovOf, globeScale, zoomOf } from '../sky/project.ts';

const DEG = Math.PI / 180;

/** One channel from the middle of each detector, shortest wavelength first: the ring's light. */
export const RING_CHANNELS = [8, 25, 42, 59, 76, 93];

/** Timing, seconds. */
export const T = {
  ringIn: [0.25, 1.5], // the ring comes up
  sweep: [0.35, 4.1], // the ring's light goes through the six detectors
  // سيما as a constellation (mark.ts): the pen draws the figure, the dots of ي light, the
  // letters condense out of it, and a glint crosses them.
  pen: [0.4, 1.7],
  sign: 1.85,
  ink: [2.1, 3.1],
  glint: [3.1, 3.9],
  la: [1.7, 2.3], // Sima, as the pen finishes
  line: [1.9, 2.5], // the line
  /** The reveal starts here when the sky map is in; else up to `hold` later. */
  reveal: 4.1,
  hold: 2.0,
  // Seconds from the reveal:
  flareLead: 0.55, // the flare swells this long before the reveal
  nameOut: [-0.25, 0.3],
  shadow: [0.0, 1.45],
  ringOut: [0.15, 1.25],
  turn: [0.3, 2.05],
  /** The globe hands over to the sky map here, which then glides in for `land`. */
  hand: 2.05,
  land: 1.3,
  /** The intro fades over the sky map in the first part of the landing. */
  crossfade: 0.4,
  cardsMs: 450,
  skipMs: 260,
  /** Reduced motion: the still ring and name stay this long, then fade. */
  still: 2.4,
  fadeMs: 600,
} as const;

/** The sky map's width (degrees) when it takes over from the globe, at most. */
export const HAND_FOV = 55;

export const smooth = (a: number, b: number, t: number): number => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
/** Ease in and out (cubic), gentler than smoothstep at both ends. */
export const ease = (a: number, b: number, t: number): number => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

/** Where the intro lands: the sky map's view, and the width the map glides in from. */
export interface Landing {
  /** The map's centre and orientation (sphere.ts `lookAt`), its width (degrees), its centre on
   * screen (CSS px). */
  q: Quat;
  fov: number;
  x: number;
  y: number;
  /** The width the map starts its glide from, and the globe's radius there (CSS px). */
  from: number;
  fromScale: number;
}

/** What intro.ts has decided; the painter draws from it. Times are seconds from the start. */
export interface Plan {
  reduced: boolean;
  /** The sky map's channel: the globe shows it. */
  skyChannel: number;
  revealAt: number | null;
  handAt: number | null;
  land: Landing;
}

/**
 * The globe's radius, CSS px, when the sky map is `fov` degrees wide. The map is the same globe
 * (orthographic, src/sky/project.ts), so the intro's globe and the map match at every size.
 */
export function mapScale(w: number, fov: number): number {
  return globeScale(w, fov);
}

/** The width (degrees) the map glides in from: 55° or less, once the globe fills the window. */
export function handFov(w: number, h: number, fov: number): number {
  const scale = Math.max(mapScale(w, HAND_FOV), Math.hypot(w, h) * 0.8);
  return Math.max(fov, Math.min(HAND_FOV, fovOf(w / 2 / scale)));
}

/** The globe's radius while it is in shadow, CSS pixels. */
export function globeRadius(w: number, h: number): number {
  return Math.min(w * 0.4, h * 0.3, 330);
}

/** Where the flare sits on the globe's edge: up and to the right (x right, y up). */
export function flareDir(w: number): [number, number] {
  const a = (w < 600 ? 62 : 48) * DEG;
  return [Math.cos(a), Math.sin(a)];
}

/**
 * The view turned by `theta` about the screen axis square to the flare's direction, so the point
 * at the view's centre sits `theta` from the centre, toward the flare.
 */
export function view(end: Quat, flare: [number, number], theta: number): Quat {
  // View space: x east (screen left), y north (up), z toward the centre.
  const dir: Vec3 = [-flare[0], flare[1], 0];
  const axis: Vec3 = [-dir[1], dir[0], 0]; // z × dir
  return multiply(end, axisAngle(axis, -theta));
}

/** One picture of the intro. Positions in CSS px from the window's top left. */
export interface Scene {
  cx: number;
  cy: number;
  /** The globe's radius, CSS px (the sky map's own scale once it takes over). */
  radius: number;
  rot: Float32Array;
  /** The globe's channel, or null while it is in shadow. */
  globe: number | null;
  /** The ring's two channels (index into RING_CHANNELS) and how far it is from the first. */
  ringA: number;
  ringB: number;
  mix: number;
  /** The ring's hue as a fractional detector index (0 = D1 … 5 = D6). */
  hue: number;
  ring: number;
  /** The shadow's centre from the globe's, in globe radii (y up). */
  shadow: [number, number];
  flare: [number, number];
  flareK: number;
  /** The channel the words at the bottom name, and their opacity. */
  sourceCh: number;
  source: number;
  /** The landing is over. */
  done: boolean;
}

/**
 * The intro at `t` seconds from its start.
 * @param has Whether a channel's shipped picture is ready to draw.
 * @param ringFrom When the ring's first picture was ready (seconds): the ring fades in from then,
 *   so a picture that comes late does not pop in half bright.
 */
export function sceneAt(
  plan: Plan,
  t: number,
  w: number,
  h: number,
  has: (ch: number) => boolean,
  ringFrom = 0,
): Scene {
  const { land, reduced } = plan;
  const R = plan.revealAt;
  const r = R === null ? -Infinity : t - R; // seconds since the reveal
  const u = plan.handAt === null ? 0 : Math.min(1, (t - plan.handAt) / T.land);

  // The globe's size: still, then growing to the landing's start (cubic ease-in, so its speed
  // there matches the sky map's glide, which starts fast and eases out).
  const r0 = globeRadius(w, h);
  let radius = r0;
  if (plan.handAt !== null) {
    // The sky map's glide (sky.ts `introZoom`): eased out, in the globe's size on screen.
    const z0 = Math.log(zoomOf(land.from));
    const z = Math.exp(z0 + (Math.log(zoomOf(land.fov)) - z0) * (1 - (1 - u) ** 3));
    radius = w / 2 / z;
  } else if (R !== null) {
    const d1 = Math.log(land.fromScale / r0);
    const d2 = Math.log(zoomOf(land.from) / zoomOf(land.fov));
    const grow = Math.max(0.3, Math.min(T.hand - 0.4, (T.land * d1) / Math.max(d2, 0.1)));
    const x = Math.max(0, Math.min(1, (r - (T.hand - grow)) / grow));
    radius = r0 * Math.exp(d1 * x * x * x);
  }
  // The globe's centre moves to the sky map's centre on screen once the globe's
  // edge has left the window. Landing on Discover's whole globe (smaller than the window), it
  // moves there while it turns, after the name has gone (DESIGN-v2 11).
  const onGlobe = land.fromScale < Math.hypot(w, h) / 2;
  const fill = onGlobe
    ? R === null
      ? 0
      : ease(T.turn[0], T.turn[1], r)
    : smooth(Math.hypot(w, h) / 2, land.fromScale * 0.98, radius);
  const cx = w / 2 + (land.x - w / 2) * fill;
  const cy = h / 2 + (land.y - h / 2) * fill;

  // The turn: one rotation, about the axis that brings the flare's point to the centre.
  const flare = flareDir(w);
  const before = reduced ? 0 : 7 * (1 - smooth(0, T.reveal, Math.min(t, T.reveal)));
  const turn = R === null ? 0 : ease(T.turn[0], T.turn[1], r);
  const q = view(land.q, flare, (90 + before) * (1 - turn) * DEG);

  // The shadow: covers the globe, then slides off away from the flare.
  const slide = R === null ? 0 : ease(T.shadow[0], T.shadow[1], r) * 2.3;

  // The ring: comes up, sweeps through the detectors, breathes while it waits, then fades.
  const decideAt = T.reveal - T.flareLead;
  const r0In = Math.max(T.ringIn[0], ringFrom);
  let ring = reduced
    ? smooth(ringFrom, ringFrom + 0.4, t)
    : smooth(r0In, r0In + T.ringIn[1] - T.ringIn[0], t);
  if (R === null && !reduced && t > decideAt) {
    ring *= 0.88 + 0.12 * Math.cos(((t - decideAt) / 2.4) * 2 * Math.PI);
  }
  if (R !== null) ring *= 1 - smooth(T.ringOut[0], T.ringOut[1], r);
  const sweep = reduced
    ? Math.max(0, RING_CHANNELS.indexOf(plan.skyChannel))
    : 5 * smooth(T.sweep[0], T.sweep[1], t);
  const k = Math.min(4, Math.floor(sweep));
  const f = sweep - k;
  // A channel not in yet: the nearest one before it that is (else any).
  const ready = (i: number) => {
    for (let j = i; j >= 0; j--) if (has(RING_CHANNELS[j]!)) return j;
    return RING_CHANNELS.findIndex(has);
  };
  const ringA = ready(k);
  const ringB = has(RING_CHANNELS[Math.min(5, k + 1)]!) ? Math.min(5, k + 1) : ringA;
  const mix = ringB === ringA ? 0 : smooth(0.55, 1, f);
  if (ringA < 0) ring = 0;

  // The diamond ring: swells as the shadow is about to leave, then fades into the light.
  let flareK = 0;
  if (reduced) flareK = 0.75 * smooth(0, 0.4, t);
  else if (R !== null) flareK = smooth(-T.flareLead, 0.1, r) * (1 - smooth(0.25, 1.1, r));

  const ringCh = RING_CHANNELS[Math.max(0, mix > 0.5 ? ringB : ringA)]!;
  return {
    cx,
    cy,
    radius,
    rot: matrix(q),
    globe: R === null || !has(plan.skyChannel) ? null : plan.skyChannel,
    ringA: Math.max(0, ringA),
    ringB: Math.max(0, ringB),
    mix,
    hue: reduced ? k : Math.min(5, k + smooth(0.3, 1, f)),
    ring,
    shadow: [-flare[0] * slide, -flare[1] * slide],
    flare: [cx + flare[0] * radius, cy - flare[1] * radius],
    flareK,
    sourceCh: R !== null && r > 0.4 ? plan.skyChannel : ringCh,
    source: R === null ? ring : 1 - smooth(T.hand - 0.6, T.hand, r),
    done: u >= 1,
  };
}
