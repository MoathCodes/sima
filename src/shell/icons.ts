/**
 * Line icons: 20 × 20, 1.6px strokes in the current text colour (DESIGN.md, "Icons").
 * Owner: lane F. Any lane may use them; ask lane F for a new one rather than drawing your own,
 * so every icon on the page shares one hand.
 *
 * Usage: `button.innerHTML = icon('search') + 'Search'`. The SVG has class `icon` and is hidden
 * from screen readers, so the button needs words or an aria-label.
 */

const PATHS = {
  search: '<circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2 17 17"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  minus: '<path d="M4 10h12"/>',
  close: '<path d="m5.5 5.5 9 9m0-9-9 9"/>',
  layers: '<path d="m10 3 7 3.8-7 3.8-7-3.8z"/><path d="m3 10.6 7 3.8 7-3.8"/>',
  globe:
    '<circle cx="10" cy="10" r="7"/><ellipse cx="10" cy="10" rx="3" ry="7"/><path d="M3 10h14"/>',
  compass: '<circle cx="10" cy="10" r="7"/><path d="m12.8 7.2-1.6 4-4 1.6 1.6-4z"/>',
  pin: '<path d="M10 17s5-4.4 5-8.5a5 5 0 0 0-10 0C5 12.6 10 17 10 17z"/><circle cx="10" cy="8.5" r="1.8"/>',
  share: '<path d="M10 3v10M6.5 6.5 10 3l3.5 3.5M5 10.5V16h10v-5.5"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6.4v.1"/>',
  play: '<path d="M7 4.8v10.4l8.4-5.2z" fill="currentColor"/>',
  pause:
    '<rect x="6" y="5" width="2.6" height="10" rx="0.8" fill="currentColor" stroke="none"/><rect x="11.4" y="5" width="2.6" height="10" rx="0.8" fill="currentColor" stroke="none"/>',
  prev: '<path d="M5.5 5v10"/><path d="M15 5.2v9.6L8 10z" fill="currentColor"/>',
  next: '<path d="M14.5 5v10"/><path d="M5 5.2v9.6l7-4.8z" fill="currentColor"/>',
  forward: '<path d="M4 10h11.5M12 6.5l3.5 3.5-3.5 3.5"/>',
  bounce: '<path d="M4 7.5h11.5M12.5 4.5l3 3-3 3M16 12.5H4.5M7.5 9.5l-3 3 3 3"/>',
  sliders:
    '<path d="M4 6.5h12M4 13.5h12"/><circle cx="8" cy="6.5" r="1.9" fill="var(--card)"/><circle cx="12.5" cy="13.5" r="1.9" fill="var(--card)"/>',
  chart: '<path d="M4 4v12h12"/><path d="m7 12.5 3-3.5 2.5 2 3.5-4.5"/>',
  bulb: '<path d="M7.4 13.2a5 5 0 1 1 5.2 0V15H7.4z"/><path d="M8 17.5h4"/>',
  flip: '<rect x="3.5" y="6.5" width="9" height="9.5" rx="1.5"/><path d="M7 6.5V5a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-3"/>',
  two: '<circle cx="7.8" cy="10" r="4.6"/><circle cx="12.2" cy="10" r="4.6"/>',
  diff: '<circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor"/>',
  swipe: '<rect x="3" y="4.5" width="14" height="11" rx="1.5"/><path d="M10 2.5v15"/>',
  stack: '<path d="m10 3 7 3.5-7 3.5-7-3.5z"/><path d="m3 10 7 3.5 7-3.5M3 13.5 10 17l7-3.5"/>',
  trail:
    '<circle cx="5" cy="15" r="1.3"/><circle cx="9.5" cy="10.5" r="1.6"/><circle cx="14.5" cy="5.5" r="2.1"/>',
  star: '<path d="m10 3 2.1 4.6 5 .5-3.8 3.4 1.1 4.9L10 13.9l-4.4 2.5 1.1-4.9L2.9 8.1l5-.5z"/>',
  'arrow-right': '<path d="M4 10h12M11 5l5 5-5 5"/>',
  check: '<path d="m4.5 10.5 3.5 3.5 7.5-8"/>',
  'chevron-down': '<path d="m6 8 4 4 4-4"/>',
  bookmark: '<path d="M6 3.5h8v13l-4-3-4 3z"/>',
  download: '<path d="M10 3.5v9M6.5 9 10 12.5 13.5 9M4.5 16h11"/>',
  galaxy:
    '<ellipse cx="10" cy="10" rx="7.6" ry="3.1" transform="rotate(-30 10 10)"/><circle cx="10" cy="10" r="1.7"/>',
  cluster:
    '<circle cx="10" cy="4.4" r="1.4"/><circle cx="4.6" cy="9.4" r="1.4"/><circle cx="15.4" cy="9.4" r="1.4"/><circle cx="7" cy="15.4" r="1.4"/><circle cx="13" cy="15.4" r="1.4"/><circle cx="10" cy="10.2" r="1"/>',
  nebula: '<path d="M5.6 15a3.1 3.1 0 0 1 .3-6.2 4.3 4.3 0 0 1 8.3 1.2A2.5 2.5 0 0 1 14.5 15z"/>',
  path: '<circle cx="4.6" cy="15.4" r="1.8"/><circle cx="15.4" cy="4.6" r="1.8"/><path d="M6.4 14.2c3.2-1.6.6-5.6 3.8-6.6 1.7-.5 2.6-1.3 3.5-1.8" stroke-dasharray="1.6 2.4"/>',
  dice: '<rect x="3.5" y="3.5" width="13" height="13" rx="2.6"/><circle cx="7.2" cy="7.2" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12.8" cy="12.8" r="1" fill="currentColor" stroke="none"/>',
  more: '<circle cx="4.6" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.4" cy="10" r="1.3" fill="currentColor" stroke="none"/>',
  chain:
    '<path d="M8.6 11.4a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1"/><path d="M11.4 8.6a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1"/>',
  'add-frame': '<rect x="3" y="5.5" width="10" height="10" rx="1.6"/><path d="M15.5 2.5v5.5M12.75 5.25h5.5"/>',
  compare: '<rect x="2.5" y="4.5" width="6.8" height="11" rx="1.3"/><rect x="10.7" y="4.5" width="6.8" height="11" rx="1.3"/>',
  wave: '<path d="M2.5 12.5c1.8-6 3.2-6 4.6 0s2.9 6 4.6 0 3.2-6 5.8-1"/>',
} as const;

/** The name of an icon. */
export type IconName = keyof typeof PATHS;

/**
 * An icon as SVG markup, ready for `innerHTML`.
 *
 * @param name Which icon.
 * @returns `<svg class="icon" aria-hidden="true">…</svg>`, 20 × 20 CSS pixels.
 */
export function icon(name: IconName): string {
  return `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
