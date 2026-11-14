/**
 * Finding the object with the keyboard (GDE-1): while a "Tap it" task is on screen the picture
 * can take focus, the arrow keys move a crosshair over it one pixel at a time (Shift: five), and
 * Enter or Space picks what is under the crosshair with the same check as a tap. A screen reader
 * hears where the crosshair is, and after "Show me" where the ring is from it. Owner: lane H.
 *
 * While the picture has keyboard focus in a find task it owns Space and the arrows: it calls
 * `preventDefault()`, so the bar's page-wide keys (viewer/bar.ts) leave them alone. Focus given
 * by a mouse click shows no crosshair and leaves the keys to the bar.
 */
import { S } from '../viewer/state.ts';
import { currentView, draw, drawHooks, type PictureView } from '../viewer/render.ts';

/** What the picker asks the task. */
export interface KeyPickTask {
  /** True while the task on screen asks the user to tap something. */
  open(): boolean;
  /** Picks at a field pixel with the tap's own check: true when it was the object. */
  pick(p: { x: number; y: number; ra: number; dec: number }): boolean;
  /** The ring of "Show me", field pixels; null before Show me. */
  aim(): { x: number; y: number } | null;
  /** The picture took or lost keyboard focus (the task line says the keys). */
  focus(): void;
  /** What a found pick says, after "Found it:". */
  name(): string;
  /** What a missed pick says. */
  missed: string;
}

/** One press moves this many field pixels; with Shift, `BIG`. */
const BIG = 5;

let task: KeyPickTask | null = null;
let canvas: HTMLCanvasElement | null = null;
/** The crosshair, field pixels from the picture's centre. */
let at = { dx: 0, dy: 0 };
/** The patch the crosshair belongs to: a new patch starts it over. */
let patch = '';
/** The keys belong to the picture: focus came by keyboard, or by "Go to the picture". */
let keyed = false;
let sayTimer = 0;

/** Registers the picker. Called once by game.ts. */
export function startKeyPick(t: KeyPickTask): void {
  task = t;
  drawHooks.add(paint);
}

/** Moves keyboard focus to the picture with its crosshair on ("Go to the picture"). */
export function focusPicture(): void {
  sync();
  if (!canvas || canvas.tabIndex < 0) return;
  keyed = true;
  canvas.focus({ preventScroll: true });
  draw();
  say(where(), true);
}

/** True while the picture has focus with its crosshair showing. */
export function pickerOn(): boolean {
  return !!canvas && keyed && document.activeElement === canvas && !!task?.open();
}

/** Makes the picture focusable while a find task is open, and plain otherwise. */
export function sync(): void {
  const c = document.querySelector<HTMLCanvasElement>('#frame-pic canvas[data-picture]');
  if (c && c !== canvas) attach(c);
  if (!canvas) return;
  const open = !!task?.open();
  if (open === canvas.hasAttribute('data-keypick')) return;
  if (open) {
    canvas.dataset.keypick = '';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-roledescription', 'picture');
    canvas.setAttribute(
      'aria-label',
      'The picture. Arrow keys move a crosshair one pixel; with Shift, five. Enter or Space picks what is under it.',
    );
  } else {
    delete canvas.dataset.keypick;
    canvas.removeAttribute('tabindex');
    canvas.removeAttribute('role');
    canvas.removeAttribute('aria-roledescription');
    canvas.removeAttribute('aria-label');
    if (document.activeElement === canvas) keyed = false;
  }
}

function attach(c: HTMLCanvasElement): void {
  canvas = c;
  c.addEventListener('focus', () => {
    keyed = keyed || c.matches(':focus-visible');
    draw();
    task?.focus();
  });
  c.addEventListener('blur', () => {
    keyed = false;
    draw();
    task?.focus();
  });
  c.addEventListener('keydown', onKey);
}

function onKey(e: KeyboardEvent): void {
  if (!task?.open() || !keyed || e.altKey || e.ctrlKey || e.metaKey) return;
  const view = currentView();
  if (!view?.field) return;
  const step = e.shiftKey ? BIG : 1;
  const move: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const d = move[e.key];
  if (d) {
    e.preventDefault();
    const half = (view.n - 1) / 2;
    at = {
      dx: Math.max(-half, Math.min(half, at.dx + d[0])),
      dy: Math.max(-half, Math.min(half, at.dy + d[1])),
    };
    draw();
    say(where());
    return;
  }
  if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;
    const p = spot(view);
    const c = view.toPic(p.x, p.y);
    const sky = view.picToSky(c.x, c.y);
    if (!sky) return;
    const hit = task.pick({ x: p.x, y: p.y, ra: sky.ra, dec: sky.dec });
    say(hit ? `Found it: ${task.name()}.` : task.missed, true);
  }
}

/** The crosshair, field pixels; it starts a quarter of the way in from the top left. */
function spot(view: Readonly<PictureView>): { x: number; y: number } {
  const key = `${S.target ?? ''}|${S.source}|${view.n}`;
  if (key !== patch) {
    patch = key;
    const q = -Math.round(view.n / 4);
    at = { dx: q, dy: q };
  }
  const c = (view.n - 1) / 2;
  return { x: Math.round(c + at.dx), y: Math.round(c + at.dy) };
}

/** Where the crosshair is, in words, and where the ring is from it after "Show me". */
function where(): string {
  const view = currentView();
  if (!view?.field || !task) return '';
  const p = spot(view);
  const text = `Crosshair ${p.x + 1} across, ${p.y + 1} down, of ${view.n}.`;
  const aim = task.aim();
  if (!aim) return text;
  const dx = Math.round(aim.x) - p.x;
  const dy = Math.round(aim.y) - p.y;
  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return `${text} It is on the ring.`;
  const part = (n: number, plus: string, minus: string) =>
    n ? `${Math.abs(n)} ${n > 0 ? plus : minus}` : '';
  const way = [part(dx, 'right', 'left'), part(dy, 'down', 'up')].filter(Boolean).join(' and ');
  return `${text} The ring is ${way}.`;
}

/** Says it to a screen reader; moves are said once the keys rest. */
function say(text: string, now = false): void {
  if (!text) return;
  let live = document.getElementById('pick-live');
  if (!live) {
    live = document.createElement('p');
    live.id = 'pick-live';
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    document.body.append(live);
  }
  clearTimeout(sayTimer);
  const el = live;
  sayTimer = window.setTimeout(() => (el.textContent = text), now ? 0 : 350);
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';
}

/** The crosshair: a box on the pixel and four ticks, dark under light so it shows on any sky. */
function paint(ctx: CanvasRenderingContext2D, view: Readonly<PictureView>): void {
  sync();
  if (!pickerOn() || !view.field) return;
  const p = spot(view);
  const c = view.toPic(p.x, p.y);
  const half = Math.max(4, view.k / 2);
  const reach = half + Math.max(8, 1.5 * view.k);
  ctx.save();
  ctx.setLineDash([]);
  for (const [colour, width] of [
    ['rgba(0, 0, 0, 0.8)', 4],
    [token('--mark'), 2],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.strokeRect(c.x - half, c.y - half, 2 * half, 2 * half);
    ctx.beginPath();
    for (const [ux, uy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      ctx.moveTo(c.x + ux * (half + 3), c.y + uy * (half + 3));
      ctx.lineTo(c.x + ux * reach, c.y + uy * reach);
    }
    ctx.stroke();
  }
  ctx.restore();
}
