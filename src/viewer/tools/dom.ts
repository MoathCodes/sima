/**
 * Small helpers for lane E's panels: escaping, numbers in the app's style, self-explaining terms
 * (MSR-4) and the shared components of app.css. Owner: lane E.
 */

/** Text → safe HTML. */
export function esc(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/** A number with the true minus sign and fixed decimals; "—" when not finite. */
export function num(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(digits);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

/** A number to a few significant figures, for values that span decades. */
export function sig(v: number, figures = 3): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const digits = Math.max(0, figures - 1 - Math.floor(Math.log10(Math.abs(v))));
  return num(v, Math.min(digits, 4));
}

/**
 * A term that explains itself on hover or focus (MSR-4): dotted underline, focusable, with its
 * plain explanation in the page's one tooltip (lane F's `data-tip`).
 */
export function term(text: string, tip: string): string {
  return `<span class="term" tabindex="0" data-tip="${esc(tip)}">${esc(text)}</span>`;
}

/** A status label: always words, coloured only by what it means (DESIGN.md "Honesty Rule"). */
export function pill(text: string, tone: '' | 'good' | 'warn' | 'bad' = ''): string {
  return `<span class="pill${tone ? ` ${tone}` : ''}">${esc(text)}</span>`;
}

/** A segmented control. Each button carries `data-<name>="<value>"`. */
export function seg(name: string, label: string, options: readonly [string, string][]): string {
  return `<div class="seg ms-seg" role="group" aria-label="${esc(label)}">${options
    .map(([v, t]) => `<button type="button" data-${name}="${esc(v)}" aria-pressed="false">${esc(t)}</button>`)
    .join('')}</div>`;
}

/** A switch row: a name, one plain line, and the switch. */
export function switchRow(name: string, title: string, line: string, extra = ''): string {
  return `<div class="tl-row">
    <div class="tl-row-text"><span class="tl-row-name">${esc(title)}</span>
      <span class="tl-row-line" data-line="${esc(name)}">${line}</span>${extra}</div>
    <button type="button" class="switch" role="switch" aria-checked="false" data-switch="${esc(name)}" aria-label="${esc(title)}"></button>
  </div>`;
}

/** Sets aria-pressed on a segmented control's buttons. */
export function pressSeg(root: ParentNode, name: string, value: string): void {
  root.querySelectorAll<HTMLElement>(`[data-${name}]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset[camel(name)] === value));
  });
}

/** Sets a switch on or off. */
export function setSwitch(root: ParentNode, name: string, on: boolean): void {
  root.querySelector(`[data-switch="${name}"]`)?.setAttribute('aria-checked', String(on));
}

function camel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Saves text as a file (CSV downloads). */
export function download(name: string, text: string, type = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name from words: "barnard-D3-candidates.csv". */
export function fileName(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('-')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-');
}

/** A canvas sized for crisp drawing at the screen's pixel ratio, in CSS pixels. */
export function sizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return null;
  const dpr = globalThis.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx?.clearRect(0, 0, w, h);
  return ctx;
}

/**
 * Reads a colour token from app.css (canvases cannot use var()). Kept once read: reading the
 * computed style forces the page's style and layout, and charts read tokens on every paint
 * (TLS-8). Dropped when the colour scheme changes, as the tokens may.
 */
const tokens = new Map<string, string>();
let schemeWatched = false;

export function token(name: string, fallback = '#888'): string {
  if (!schemeWatched && typeof matchMedia === 'function') {
    schemeWatched = true;
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => tokens.clear());
  }
  let v = tokens.get(name);
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) tokens.set(name, v);
  }
  return v || fallback;
}

/**
 * Hangs a native popover (`popover="auto"`, opened by its button's `popovertarget`) from its
 * button (a getter: the button may be redrawn while the popover stays). Call it once per popover: below it, or above when the room below is short; aligned with the button's right edge
 * (`end`) or left edge (`start`). The popover's `.appear` motion settles toward the button. The
 * browser closes it on Escape and on a click outside.
 */
export function hangPopover(
  button: () => HTMLElement | null,
  pop: HTMLElement,
  align: 'start' | 'end' = 'end',
  room = 240,
): void {
  pop.addEventListener('beforetoggle', (e) => {
    const btn = button();
    if (!btn) return;
    const open = (e as ToggleEvent).newState === 'open';
    btn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const r = btn.getBoundingClientRect();
    const below = innerHeight - r.bottom >= room || r.top < room;
    pop.style.top = below ? `${Math.round(r.bottom + 6)}px` : 'auto';
    pop.style.bottom = below ? 'auto' : `${Math.round(innerHeight - r.top + 6)}px`;
    pop.style.left = align === 'start' ? `${Math.round(Math.max(8, r.left))}px` : 'auto';
    pop.style.right = align === 'end' ? `${Math.round(Math.max(8, innerWidth - r.right))}px` : 'auto';
    pop.style.setProperty('--settle-y', below ? '-6px' : '6px');
  });
}
