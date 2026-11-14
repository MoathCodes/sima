/**
 * The intro's sphere maths: where a sky position falls in a HiPS Allsky image, and the camera
 * that turns the globe. Pure: no page. The intro's shader (intro.ts) repeats `allskyPixel` in
 * GLSL; tests/intro.test.ts checks this copy against healpy's values.
 *
 * HEALPix (Górski et al. 2005), nested scheme. A HiPS Allsky image holds the 768 order-3 tiles,
 * 27 to a row, 64 pixels each (src/sky/hips.ts). Inside a base face, image rows follow the
 * HEALPix x index and columns the y index, at every order (hips.ts `subTilePosition`).
 */
import { ALLSKY_COLUMNS, ALLSKY_TILE } from '../sky/hips.ts';

const DEG = Math.PI / 180;

/** A HEALPix base face and the position inside it, each 0 to 1 (x along rows, y along columns). */
export interface FacePoint {
  face: number;
  x: number;
  y: number;
}

/**
 * Which base face holds a direction, and where in it (HEALPix `loc2xyf` with continuous indices).
 * @param z sin(dec).
 * @param phi Right ascension, radians.
 */
export function facePoint(z: number, phi: number): FacePoint {
  const za = Math.abs(z);
  let tt = ((phi / (Math.PI / 2)) % 4 + 4) % 4; // 0 to 4
  if (za <= 2 / 3) {
    const t1 = 0.5 + tt;
    const t2 = z * 0.75;
    const jp = t1 - t2; // ascending edge line
    const jm = t1 + t2; // descending edge line
    const ifp = Math.floor(jp);
    const ifm = Math.floor(jm);
    const face = ifp === ifm ? (ifp % 4) + 4 : ifp < ifm ? ifp : ifm + 8;
    return { face, x: jm - ifm, y: 1 - (jp - ifp) };
  }
  const ntt = Math.min(3, Math.floor(tt));
  const tp = tt - ntt;
  const tmp = Math.sqrt(3 * (1 - za));
  const jp = Math.min(tp * tmp, 1 - 1e-12);
  const jm = Math.min((1 - tp) * tmp, 1 - 1e-12);
  return z >= 0 ? { face: ntt, x: 1 - jm, y: 1 - jp } : { face: ntt + 8, x: jp, y: jm };
}

/** Spreads the bits of v to the even bits: 0b11 → 0b0101. */
function spread(v: number): number {
  let out = 0;
  for (let bit = 0; v > 0; bit++, v >>= 1) out += (v & 1) * 4 ** bit;
  return out;
}

/**
 * The nested HEALPix pixel holding a sky position.
 * @param nside A power of two.
 * @param ra Degrees. @param dec Degrees.
 */
export function nestPixel(nside: number, ra: number, dec: number): number {
  const p = facePoint(Math.sin(dec * DEG), ra * DEG);
  const ix = Math.min(nside - 1, Math.floor(p.x * nside));
  const iy = Math.min(nside - 1, Math.floor(p.y * nside));
  return p.face * nside * nside + spread(ix) + 2 * spread(iy);
}

/**
 * Where a sky position falls in a HiPS Allsky image (order-3 tiles of 64 pixels, 27 to a row).
 * @returns Pixel coordinates from the image's top left (fractional; the pixel's centre is +0.5).
 */
export function allskyPixel(ra: number, dec: number): { x: number; y: number; tile: number } {
  const p = facePoint(Math.sin(dec * DEG), ra * DEG);
  const tx = Math.min(7, Math.floor(p.x * 8));
  const ty = Math.min(7, Math.floor(p.y * 8));
  const tile = p.face * 64 + spread(tx) + 2 * spread(ty);
  const edge = ALLSKY_TILE - 1e-9;
  const row = Math.min(edge, (p.x * 8 - tx) * ALLSKY_TILE);
  const col = Math.min(edge, (p.y * 8 - ty) * ALLSKY_TILE);
  return {
    tile,
    x: (tile % ALLSKY_COLUMNS) * ALLSKY_TILE + col,
    y: Math.floor(tile / ALLSKY_COLUMNS) * ALLSKY_TILE + row,
  };
}

// ----- The camera ----------------------------------------------------------------------------

export type Vec3 = [number, number, number];
/** A rotation as a unit quaternion [w, x, y, z]. */
export type Quat = [number, number, number, number];

/** The unit vector of a sky position (x toward RA 0, z toward the north pole). */
export function unit(ra: number, dec: number): Vec3 {
  const a = ra * DEG;
  const d = dec * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

/** RA and dec (degrees) of a direction. */
export function radec(v: Vec3): { ra: number; dec: number } {
  const ra = Math.atan2(v[1], v[0]) / DEG;
  return { ra: (ra + 360) % 360, dec: Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG };
}

/**
 * The view looking at (ra, dec): its axes are east, north and the centre, a right-handed set.
 * A sky map shows east to the LEFT, so screen right is −x in this view space (`toSky`).
 */
export function lookAt(ra: number, dec: number): Quat {
  const a = ra * DEG;
  const d = dec * DEG;
  const east: Vec3 = [-Math.sin(a), Math.cos(a), 0];
  const north: Vec3 = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  return fromBasis(east, north, unit(ra, dec));
}

/** The quaternion of the rotation whose matrix has these columns. */
export function fromBasis(r: Vec3, u: Vec3, f: Vec3): Quat {
  // m[row][col]: columns are r, u, f.
  const m00 = r[0], m01 = u[0], m02 = f[0];
  const m10 = r[1], m11 = u[1], m12 = f[1];
  const m20 = r[2], m21 = u[2], m22 = f[2];
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [s / 4, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [(m21 - m12) / s, s / 4, (m01 + m10) / s, (m02 + m20) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m02 - m20) / s, (m01 + m10) / s, s / 4, (m12 + m21) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, s / 4];
  }
  const n = Math.hypot(...q);
  return q.map((v) => v / n) as Quat;
}

/** The rotation matrix of a quaternion, column-major (for WebGL `uniformMatrix3fv`). */
export function matrix(q: Quat): Float32Array {
  const [w, x, y, z] = q;
  return new Float32Array([
    1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y),
    2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x),
    2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y),
  ]);
}

/** a then b: the rotation b ∘ a. */
export function multiply(b: Quat, a: Quat): Quat {
  const [bw, bx, by, bz] = b;
  const [aw, ax, ay, az] = a;
  return [
    bw * aw - bx * ax - by * ay - bz * az,
    bw * ax + bx * aw + by * az - bz * ay,
    bw * ay - bx * az + by * aw + bz * ax,
    bw * az + bx * ay - by * ax + bz * aw,
  ];
}

/** A rotation by `angle` radians about a unit axis. */
export function axisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

/** Spherical interpolation, the short way round. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (dot < 0) {
    dot = -dot;
    bb = b.map((v) => -v) as Quat;
  }
  if (dot > 0.9995) {
    const q = a.map((v, i) => v + (bb[i]! - v) * t) as Quat;
    const n = Math.hypot(...q);
    return q.map((v) => v / n) as Quat;
  }
  const th = Math.acos(dot);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i]! * wb) as Quat;
}

/** A direction in view space (x east, y north, z toward the centre) turned into the sky. */
export function toSky(q: Quat, v: Vec3): Vec3 {
  const m = matrix(q);
  return [
    m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2],
    m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2],
    m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2],
  ];
}
