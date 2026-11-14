/**
 * The intro's painter: draws each picture of the intro (scene.ts) with WebGL 2, from the shipped
 * SPHEREx all-sky images (public/sky-seed/allsky). It keeps its own clock, so it runs the same in
 * a worker (worker.ts, on an OffscreenCanvas: the picture stays smooth while the page's main
 * thread is busy starting up) or, where that is not possible, on the page itself.
 * Owner: the intro (src/intro/).
 */
import { RING_CHANNELS, sceneAt, type Plan } from './scene.ts';

export type Rgb = [number, number, number];

export interface PainterInit {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** The app's base URL (import.meta.env.BASE_URL). */
  base: string;
  /** The six detector hues, D1 to D6, and the page's sky colour (0 to 1 RGB). */
  tints: Rgb[];
  sky: Rgb;
  /** When the intro starts: performance.timeOrigin + performance.now(), ms. */
  start: number;
  plan: Plan;
  width: number;
  height: number;
  dpr: number;
}

/** What the painter tells intro.ts: a shipped picture is ready, or nothing can be drawn. */
export type PainterEvent = { type: 'loaded'; ch: number } | { type: 'failed'; why: string };

const now = () => performance.timeOrigin + performance.now();
const frame: (fn: () => void) => void =
  typeof requestAnimationFrame === 'function'
    ? (fn) => requestAnimationFrame(fn)
    : (fn) => setTimeout(fn, 16);

interface Channel {
  tex: WebGLTexture;
  /** Display stretch of this channel's ring light: the sky's faint floor and bright end. */
  lo: number;
  hi: number;
}

/** Starts painting; returns the controls. */
export function startPainter(
  init: PainterInit,
  tell: (e: PainterEvent) => void,
): { plan(p: Plan): void; size(w: number, h: number, dpr: number): void; stop(): void } {
  let plan = init.plan;
  let size = { w: init.width, h: init.height, dpr: init.dpr };
  let stopped = false;
  const gl = makeGl(init.canvas, init.sky);
  if (!gl) {
    tell({ type: 'failed', why: 'WebGL 2 is not available' });
    return { plan() {}, size() {}, stop() {} };
  }
  const loaded = new Map<number, Channel>();
  const has = (ch: number) => loaded.has(ch);

  // The shipped pictures: the first ring channel, the sky's channel, then the rest. One upload
  // a frame, so no task gets long.
  const wanted = [...new Set([RING_CHANNELS[0]!, plan.skyChannel, ...RING_CHANNELS.slice(1)])];
  const queue: { ch: number; bitmap: ImageBitmap }[] = [];
  let uploading = false;
  const upload = () => {
    const next = queue.shift();
    if (!next || stopped) {
      uploading = false;
      next?.bitmap.close();
      return;
    }
    const { lo, hi } = stretch(next.bitmap);
    const tex = gl.texture(next.bitmap);
    next.bitmap.close();
    if (tex) {
      loaded.set(next.ch, { tex, lo, hi });
      tell({ type: 'loaded', ch: next.ch });
    }
    frame(upload);
  };
  for (const ch of wanted) {
    void fetch(`${init.base}sky-seed/allsky/${ch}.webp`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
      .then((bitmap) => {
        if (stopped) return bitmap.close();
        queue.push({ ch, bitmap });
        queue.sort((a, b) => wanted.indexOf(a.ch) - wanted.indexOf(b.ch));
        if (!uploading) {
          uploading = true;
          frame(upload);
        }
      })
      .catch((err: unknown) => console.warn(`intro: the shipped sky ${ch} did not load`, err));
  }

  const tick = () => {
    if (stopped) return;
    frame(tick);
    if (gl.failed) {
      stopped = true;
      tell({ type: 'failed', why: 'the sky shader did not build' });
      return;
    }
    const t = Math.max(0, (now() - init.start) / 1000);
    const s = sceneAt(plan, t, size.w, size.h, has);
    const a = loaded.get(RING_CHANNELS[s.ringA]!) ?? null;
    const b = loaded.get(RING_CHANNELS[s.ringB]!) ?? a;
    const k = Math.max(0, Math.min(4, Math.floor(s.hue)));
    const f = s.hue - k;
    const ta = init.tints[k] ?? [1, 1, 1];
    const tb = init.tints[Math.min(5, k + 1)] ?? ta;
    gl.draw({
      width: size.w,
      height: size.h,
      dpr: size.dpr,
      cx: s.cx,
      cy: s.cy,
      radius: s.radius,
      rot: s.rot,
      globe: s.globe === null ? null : (loaded.get(s.globe)?.tex ?? null),
      ringA: a?.tex ?? null,
      ringB: b?.tex ?? null,
      ringLo: [a?.lo ?? 0, b?.lo ?? 0],
      ringHi: [a?.hi ?? 1, b?.hi ?? 1],
      mix: s.mix,
      tint: [ta[0] + (tb[0] - ta[0]) * f, ta[1] + (tb[1] - ta[1]) * f, ta[2] + (tb[2] - ta[2]) * f],
      ring: a ? s.ring : 0,
      shadow: s.shadow,
      flare: s.flare,
      flareK: s.flareK,
    });
  };
  frame(tick);

  return {
    plan(p) {
      plan = p;
    },
    size(w, h, dpr) {
      size = { w, h, dpr };
    },
    stop() {
      stopped = true;
      gl.dispose();
    },
  };
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

export function hex(s: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s);
  if (!m) return [1, 1, 1];
  return [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255];
}

// ----- WebGL ----------------------------------------------------------------------------------

interface DrawArgs {
  width: number;
  height: number;
  /** Device pixels per CSS pixel (at most 2). */
  dpr: number;
  cx: number;
  cy: number;
  radius: number;
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
  /** The shader did not build: nothing will be drawn. */
  readonly failed: boolean;
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

  // The globe: the real sky, where the shadow has left it. Orthographic, as the sky map is, so
  // the two match when the map takes over.
  if (r < 1.0 + 2.0 * px && uHasGlobe > 0.5) {
    float theta = asin(min(r, 1.0));
    vec2 dir = r > 1e-6 ? p / r : vec2(0.0);
    vec3 v = vec3(-dir.x * sin(theta), dir.y * sin(theta), cos(theta));
    vec3 d = uRot * v;
    // Texture detail: Allsky pixels (~0.002 rad) per screen pixel, more toward the globe's edge.
    float stretchOut = 1.0 / max(cos(theta), 0.08);
    float lod = clamp(log2(500.0 / (uR * uDpr)) + log2(max(stretchOut, 0.01)) * 0.5, 0.0, 6.0);
    float g = sky(uGlobe, d, lod);
    float lit = smoothstep(0.99, 1.01, length(p - uShadow));
    float inside = 1.0 - smoothstep(1.0 - px, 1.0 + px, r);
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

function makeGl(canvas: HTMLCanvasElement | OffscreenCanvas, skyRgb: Rgb): Gl | null {
  const gl = (canvas as OffscreenCanvas).getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;
  // The shaders compile in the background where the browser can (KHR_parallel_shader_compile):
  // asking for the result at once would block the page for a few hundred ms while it starts.
  const parallel = gl.getExtension('KHR_parallel_shader_compile') as {
    COMPLETION_STATUS_KHR: number;
  } | null;
  const shader = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const vs = shader(gl.VERTEX_SHADER, VERTEX);
  const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  const empty = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, empty);
  // A 1×1 black picture for slots with nothing loaded yet.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  let U: Record<string, WebGLUniformLocation | null> | null = null;
  let failed = false;

  /** The program's uniforms once it is linked; null while it compiles or if it failed. */
  const ready = (): typeof U => {
    if (U || failed) return U;
    if (parallel && !gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR)) return null;
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      failed = true;
      console.warn(
        'intro: the sky shader did not build',
        gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(prog),
      );
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
    U = {
      res: u('uRes'),
      centre: u('uCentre'),
      r: u('uR'),
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
    gl.uniform1i(U.globe!, 0);
    gl.uniform1i(U.ringA!, 1);
    gl.uniform1i(U.ringB!, 2);
    gl.uniform3f(U.sky!, ...skyRgb);
    return U;
  };
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
    get failed() {
      return failed;
    },
    draw(a) {
      const U = ready();
      if (!U) return;
      const dpr = a.dpr;
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
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
