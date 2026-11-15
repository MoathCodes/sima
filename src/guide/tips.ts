/**
 * One-time tips (GDE-8, O-G7): one at a time, chosen by the kind of target on screen, each
 * shown once. A tip is a card (`#tip`, `data-card`): it sits beside the control it points at,
 * never over that control and never over another card. If there is no such spot it waits
 * (the "tour lives here" tip says it in a toast instead, O-G10). Escape closes it (`data-escape`
 * 50 in index.html presses its `data-close` button). Owner: lane H.
 */
import { S, type Mode } from '../viewer/state.ts';
import { onFrameMove, toast } from '../shell/shell.ts';
import { TASKS } from '../explore/copy.ts';
import { find } from './ring.ts';
import { placeBeside, type Box, type Side } from './place.ts';
import { readStore, saveStore } from './store.ts';
import { touring } from './tour.ts';
import { getView } from '../shell/view.ts';

interface Tip {
  id: string;
  title: string;
  text: string;
  /** The part it points at, by `data-guide` name. */
  at: string;
  /** True while the tip fits what is on screen. */
  when(): boolean;
  /** True once the user did what it suggests: it is then not needed. */
  heeded?(): boolean;
  /** Said in a toast when no spot beside its part is free. */
  fallback?: string;
}

const kind = () => (S.target && S.field && S.groups.length ? TASKS[S.target]?.kind : undefined);
const explore = () => S.level === 'explore';
const mode = (m: Mode) => () => S.mode === m;

const TIPS: readonly Tip[] = [
  {
    id: 'measure-words',
    title: 'Dotted words explain themselves',
    text: 'Point at one.',
    at: 'measure-panel',
    when: () => S.level === 'measure' && !!S.field,
  },
  {
    id: 'mover',
    title: 'A star that moves',
    text: 'Try Difference: a moving star shows as a white dot beside a dark one.',
    at: 'view-diff',
    when: () => explore() && (kind() === 'mover' || kind() === 'spectrum'),
    heeded: mode('diff'),
  },
  {
    id: 'variable',
    title: 'A star that changes brightness',
    text: 'Try Two dates: a star that brightened or faded looks red or cyan instead of white.',
    at: 'view-two',
    when: () => explore() && kind() === 'variable',
    heeded: mode('two'),
  },
  {
    id: 'faint',
    title: 'Too faint for one picture',
    text: 'Stack adds pictures along a path. Compare it with both checks.',
    at: 'view-stack',
    when: () => explore() && kind() === 'faint',
    heeded: mode('stack'),
  },
];

/** The tip that says where the tour can be taken again, after a tour ends. */
const TOUR_HOME: Tip = {
  id: 'tour-home',
  title: 'The tour lives here',
  text: 'Take it again any time from Guide.',
  at: 'guide-button',
  when: () => true,
  fallback: 'The tour lives under Guide, at the top right. Take it again any time.',
};

let shown: Tip | null = null;
let candidate: { tip: Tip; since: number } | null = null;
let extra: Tip | null = null;
/** When the user last pressed or typed something. */
let lastInput = 0;

/** Starts watching for tips. Called once by guide/index.ts. */
export function startTips(): void {
  const el = document.getElementById('tip');
  if (!el) return;
  el.className = 'tip-card glass-raised';
  el.setAttribute('role', 'note');
  window.setInterval(check, 400);
  for (const type of ['pointerdown', 'keydown', 'wheel'])
    addEventListener(type, () => (lastInput = performance.now()), { capture: true, passive: true });
  // The frame moves (Measure opens, a drag, a new size): the tip moves with it at once, so it
  // never sits over the frame even for a moment.
  onFrameMove(() => shown && placeTip(shown));
  addEventListener('resize', () => shown && placeTip(shown));
}

/** Shows "The tour lives here" once, after the first tour ends (O-G10). */
export function tourHomeTip(): void {
  if (readStore().tips.includes(TOUR_HOME.id)) return;
  extra = TOUR_HOME;
}

function seen(id: string): boolean {
  return readStore().tips.includes(id);
}

function markSeen(id: string): void {
  if (!seen(id)) saveStore((s) => s.tips.push(id));
}

/** Nothing else is asking for attention: no tour, no welcome card, no open menu or dialog. */
function quiet(): boolean {
  if (touring()) return false;
  if (!document.getElementById('welcome')?.hidden) return false;
  if (document.querySelector('[popover]:popover-open:not(#tooltip), dialog[open]')) return false;
  if (!document.getElementById('explain')?.hidden) return false;
  // A list, a place card, the sky's click card or the picture tools are open: the user is busy
  // there, and a tip would take the Escape meant for it.
  if (
    document.querySelector(
      '#places-list:not([hidden]), #place-card:not([hidden]), #sky-click:not([hidden]), #tools:not([hidden])',
    )
  ) {
    return false;
  }
  return S.source !== 'loading';
}

function check(): void {
  // Discover's mission card already guides each step; the one-time tips are for Expert.
  if (getView() === 'discover') {
    if (shown) hide();
    candidate = null;
    return;
  }
  if (shown) {
    if (shown.heeded?.()) {
      markSeen(shown.id);
      hide();
    } else if (!shown.when() || !quiet()) hide();
    else placeTip(shown);
    return;
  }
  if (!quiet()) {
    candidate = null;
    return;
  }
  const next = extra ?? TIPS.find((t) => !seen(t.id) && t.when() && !t.heeded?.()) ?? null;
  if (!next) {
    candidate = null;
    return;
  }
  // The tip waits until the page has been calm for a moment.
  if (candidate?.tip !== next) {
    candidate = { tip: next, since: performance.now() };
    return;
  }
  // …and the user has not pressed or typed anything for a moment either.
  if (performance.now() - Math.max(candidate.since, lastInput) < 2500) return;
  if (show(next)) return;
  if (next.fallback && performance.now() - candidate.since > 6000) {
    toast(next.fallback);
    markSeen(next.id);
    if (extra === next) extra = null;
    candidate = null;
  }
}

function show(tip: Tip): boolean {
  const el = document.getElementById('tip');
  if (!el) return false;
  el.innerHTML = `<p class="tip-title"></p><p class="tip-text"></p>
    <div class="tip-foot"><button class="btn primary sm" data-close>Got it</button></div>
    <span class="tip-pointer" aria-hidden="true"></span>`;
  el.querySelector('.tip-title')!.textContent = tip.title;
  el.querySelector('.tip-text')!.textContent = tip.text;
  el.querySelector('[data-close]')?.addEventListener('click', () => {
    markSeen(tip.id);
    if (extra === tip) extra = null;
    hide();
  });
  el.style.visibility = 'hidden';
  el.hidden = false;
  if (!placeTip(tip)) {
    el.hidden = true;
    el.style.visibility = '';
    return false;
  }
  el.style.visibility = '';
  shown = tip;
  candidate = null;
  return true;
}

function hide(): void {
  const el = document.getElementById('tip');
  if (el) el.hidden = true;
  shown = null;
}

/** Puts the tip beside its part, off every card; false when there is no such spot. */
function placeTip(tip: Tip): boolean {
  const el = document.getElementById('tip');
  const part = find(tip.at);
  if (!el || !part) {
    if (el && shown) hide();
    return false;
  }
  const t = part.getBoundingClientRect();
  const avoid: Box[] = [...document.querySelectorAll<HTMLElement>('[data-card]')]
    .filter((c) => c !== el && c.checkVisibility() && !c.contains(part))
    .map((c) => c.getBoundingClientRect());
  // The tip is a card too: it stays off the card that holds its part.
  const holder = part.closest<HTMLElement>('[data-card]');
  const held = holder && holder !== el ? holder.getBoundingClientRect() : null;
  if (held) avoid.push(held);
  const tour = document.querySelector<HTMLElement>('#tour .tour-card');
  if (tour && !tour.hidden) avoid.push(tour.getBoundingClientRect());
  const size = { width: el.offsetWidth, height: el.offsetHeight };
  const spot = placeBeside(t, held, size, { width: innerWidth, height: innerHeight }, avoid, {
    gap: 12,
    margin: 10,
  });
  if (!spot) {
    if (shown) hide();
    return false;
  }
  el.style.left = `${Math.round(spot.box.left)}px`;
  el.style.top = `${Math.round(spot.box.top)}px`;
  pointer(el, spot.side, spot.box, t);
  return true;
}

/** The little pointer on the side of the tip that faces its part. */
function pointer(el: HTMLElement, side: Side, box: Box, t: DOMRect): void {
  el.dataset.side = side;
  const p = el.querySelector<HTMLElement>('.tip-pointer');
  if (!p) return;
  if (side === 'below' || side === 'above') {
    const x = Math.max(14, Math.min(box.width - 14, t.left + t.width / 2 - box.left));
    p.style.left = `${Math.round(x)}px`;
    p.style.top = '';
  } else {
    const y = Math.max(14, Math.min(box.height - 14, t.top + t.height / 2 - box.top));
    p.style.top = `${Math.round(y)}px`;
    p.style.left = '';
  }
}
