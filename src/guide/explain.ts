/**
 * "Explain the screen" (GDE-6): every part on screen gets a small label with its name, and
 * pointing at anything (or tabbing to it) says what it is in plain words. Clicks still reach the
 * page underneath. Escape or Done closes it (`#explain` has `data-escape` 50; Done is its
 * `data-close`). Owner: lane H.
 */
import { find } from './ring.ts';
import { placeNear } from './place.ts';

/** Parts by `data-guide` name: a short name and one plain sentence. Most specific first. */
const PARTS: readonly [string, string, string][] = [
  ['play', 'Play', 'Flips through the dates. Space does the same; the arrow keys step.'],
  ['dates', 'The date scale', 'When each picture was taken. Each letter is one visit, months apart.'],
  [
    'wavelength',
    'Infrared colour',
    'SPHEREx sees 102 colours of infrared light. Pick one here for both the frame and the sky map.',
  ],
  ['hint', 'Hint', 'A little more help each time you press it. The last one rings the answer.'],
  ['task', 'Your task', 'What to look for in these pictures, with hints if you want them.'],
  ['measure', 'Measure', 'Opens the numbers measured from the pixels, more views and the picture tools.'],
  ['views', 'Ways to view', 'Flip shows one date at a time. Two dates puts two in one picture. Difference shows only what changed.'],
  ['exif', 'Where the data comes from', 'Source, release, dates, number of exposures and detector of the picture on screen.'],
  ['picture', 'The pictures', 'Real pictures of the patch, one date at a time. Stars stay still; whatever moves or changes stands out.'],
  ['measure-panel', 'Measure panel', 'What was measured from these pixels, with a chart. Every dotted word explains itself.'],
  ['tools-panel', 'Picture tools', 'Adjust the picture, clean it up, search for changes, and add star catalogues on top.'],
  ['frame', 'The frame', 'Shows the patch of sky inside the magenta square. Drag its top to move it; size it from its corner.'],
  ['bar', 'The bar', 'Plays the pictures and picks the date and the infrared colour.'],
  ['search', 'Search', 'Find a star, a galaxy or any spot by name or coordinates. Press / to start typing.'],
  ['chips', 'Kinds of places', 'Shows famous places of one kind as dots on the sky.'],
  ['guide-button', 'Guide', 'Tours, this explanation, and things to try.'],
  ['places-button', 'Places', 'Starting points, the five test targets, practice, and places you saved.'],
  ['share-button', 'Share', 'A link to exactly this view, and code to put it in another page.'],
  ['about-button', 'About', 'What Sima is, how it works, its limits and its sources.'],
  ['rail', 'Sky map tools', 'Zoom the sky, choose another sky map, or draw a coordinate grid.'],
  ['sky-note', 'What the map is', 'The sky map averages a year of dates, so things that move are blurred there.'],
  ['coords', 'Where you point', 'The sky coordinates under the pointer.'],
  ['wordmark', 'Sima', 'سيما: Arabic for “a sign or a mark”.'],
  ['sky', 'The sky', 'NASA SPHEREx’s map of the whole sky. Drag to look around, scroll to zoom. The magenta square is what the frame shows.'],
];

/** Parts that get a name label when explaining starts. */
const LABELLED = [
  'frame',
  'picture',
  'views',
  'bar',
  'search',
  'chips',
  'actions',
  'rail',
  'sky-note',
  'measure-panel',
  'tools-panel',
];
const NAMES: Record<string, string> = { actions: 'Guide, Places, Share, About' };

let on = false;

/** Starts explaining the screen. */
export function explainScreen(): void {
  const root = document.getElementById('explain');
  if (!root) return;
  on = true;
  root.className = 'explain';
  root.innerHTML = `
    <div class="explain-bar card">
      <p><b>Explain the screen.</b> Point at anything to see what it is.</p>
      <button class="btn primary" data-close>Done</button>
    </div>
    <div class="explain-outline" hidden></div>
    <div class="explain-card card" role="status" aria-live="polite" hidden><p class="explain-name"></p><p class="explain-text"></p></div>`;
  root.querySelector('[data-close]')?.addEventListener('click', close);
  for (const name of LABELLED) {
    const el = find(name);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const tag = document.createElement('span');
    tag.className = 'explain-tag';
    tag.textContent = NAMES[name] ?? PARTS.find((p) => p[0] === name)?.[1] ?? name;
    // On the part's top edge, so it covers as little of the part as it can.
    tag.style.left = `${Math.round(r.left + 10)}px`;
    tag.style.top = `${Math.round(Math.max(2, r.top - 10))}px`;
    root.append(tag);
  }
  root.hidden = false;
  document.addEventListener('pointermove', onPoint);
  document.addEventListener('focusin', onFocus);
  root.querySelector<HTMLElement>('[data-close]')?.focus();
}

function close(): void {
  const root = document.getElementById('explain');
  if (root) root.hidden = true;
  on = false;
  document.removeEventListener('pointermove', onPoint);
  document.removeEventListener('focusin', onFocus);
}

function onPoint(e: PointerEvent): void {
  if (!on) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (el?.closest('#explain')) return;
  show(el);
}

function onFocus(e: FocusEvent): void {
  if (!on || !(e.target instanceof Element) || e.target.closest('#explain')) return;
  show(e.target);
}

/** The part under the pointer: the nearest `data-guide` ancestor that has words here. */
function partOf(el: Element | null): { el: HTMLElement; name: string; text: string } | null {
  for (let at = el; at; at = at.parentElement) {
    const g = at.closest<HTMLElement>('[data-guide]');
    if (!g) return null;
    const words = PARTS.find((p) => p[0] === g.dataset.guide);
    if (words) return { el: g, name: words[1], text: words[2] };
    at = g;
  }
  return null;
}

function show(el: Element | null): void {
  const root = document.getElementById('explain');
  const card = root?.querySelector<HTMLElement>('.explain-card');
  const outline = root?.querySelector<HTMLElement>('.explain-outline');
  if (!root || !card || !outline) return;
  const part = partOf(el);
  if (!part) {
    card.hidden = true;
    outline.hidden = true;
    return;
  }
  const r = part.el.getBoundingClientRect();
  Object.assign(outline.style, {
    left: `${r.left - 3}px`,
    top: `${r.top - 3}px`,
    width: `${r.width + 6}px`,
    height: `${r.height + 6}px`,
  });
  outline.hidden = false;
  card.querySelector('.explain-name')!.textContent = part.name;
  card.querySelector('.explain-text')!.textContent = part.text;
  card.hidden = false;
  const bar = root.querySelector('.explain-bar')?.getBoundingClientRect();
  const spot = placeNear(
    r,
    { width: card.offsetWidth, height: card.offsetHeight },
    { width: innerWidth, height: innerHeight },
    bar ? [bar] : [],
    { gap: 10, force: true },
  );
  const box = spot?.box ?? {
    left: Math.max(10, Math.min(innerWidth - card.offsetWidth - 10, r.left + 12)),
    top: Math.max(10, Math.min(innerHeight - card.offsetHeight - 10, r.top + 12)),
  };
  card.style.left = `${Math.round(box.left)}px`;
  card.style.top = `${Math.round(box.top)}px`;
}
