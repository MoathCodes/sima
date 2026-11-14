/**
 * Toasts: short messages above the bar ("Link copied", "Not understood in the link: …").
 * Owner: lane F. Any lane may call `toast`.
 *
 * A toast is ink-filled with card-coloured text (DESIGN.md). It fades in, stays for a while and
 * fades out; a long one has a close button. Toasts sit over cards (`data-overlay`), so they are
 * never counted as overlapping.
 */
import { icon } from './icons.ts';

/**
 * Shows a short message above the bar.
 *
 * @param text Plain text, one or two sentences.
 * @param opts `ms`: how long it stays (default 4 s; 0 keeps it until closed). `close`: show a
 *   close button (default true when it stays 8 s or more).
 * @returns Removes the toast at once.
 */
export function toast(text: string, opts: { ms?: number; close?: boolean } = {}): () => void {
  const box = document.getElementById('toasts');
  if (!box) return () => {};
  const ms = opts.ms ?? 4000;
  const el = document.createElement('div');
  el.className = 'toast appear';
  el.hidden = true;
  const words = document.createElement('p');
  words.textContent = text;
  el.append(words);
  let timer = 0;
  const remove = () => {
    clearTimeout(timer);
    el.hidden = true;
    setTimeout(() => el.remove(), 400);
  };
  if (opts.close ?? (ms === 0 || ms >= 8000)) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn sm';
    btn.setAttribute('aria-label', 'Close the message');
    btn.innerHTML = icon('close');
    btn.addEventListener('click', remove);
    el.append(btn);
  }
  box.append(el);
  requestAnimationFrame(() => (el.hidden = false));
  if (ms > 0) timer = window.setTimeout(remove, ms);
  return remove;
}
