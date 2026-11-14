/**
 * The intro's painter in a worker (render.ts), drawing on the page's canvas through an
 * OffscreenCanvas, so the intro stays smooth while the page's main thread is busy starting.
 * Started by intro.ts with `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`.
 * Owner: the intro (src/intro/).
 *
 * Messages in: `init` (PainterInit, with the canvas transferred), `plan`, `size`, `stop`.
 * Messages out: PainterEvent.
 */
import { startPainter, type PainterEvent, type PainterInit } from './render.ts';
import type { Plan } from './scene.ts';

type In =
  | { type: 'init'; init: PainterInit }
  | { type: 'plan'; plan: Plan }
  | { type: 'size'; w: number; h: number; dpr: number }
  | { type: 'stop' };

let painter: ReturnType<typeof startPainter> | null = null;

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === 'init') {
    painter = startPainter(m.init, (ev: PainterEvent) => self.postMessage(ev));
  } else if (m.type === 'plan') painter?.plan(m.plan);
  else if (m.type === 'size') painter?.size(m.w, m.h, m.dpr);
  else {
    painter?.stop();
    self.close();
  }
};
