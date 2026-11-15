/**
 * Discover, the beginner view (BEGINNER-AND-MOBILE.md sections 4, 5, 10 and 13). Owner: lane K.
 *
 * One screen at a time on top of the sky: the welcome card, the home list, a mission card or its
 * success card. "Try another object" opens the target in the frame through the game's own flow and
 * leaves the list in place (no card of its own: SPEED cut). On desktop each is a panel in its own mount point
 * (`#discover-list`, `#mission`, `#mission-success`; the welcome card is made here); on phones
 * the same element goes in lane M's sheet (`shell/sheet.ts`). In Expert, all of them are closed and
 * a running mission waits where it was (leaving by the view switch keeps the step).
 *
 * No coach overlay in v2.0 (SPEED cut): the `#coach` mount stays empty.
 *
 * Escape (section 13): mission card, success and welcome 30. On the mission card
 * Escape asks "Leave the mission?" first. `H` asks for a hint only while focus is in the mission
 * card or the picture (A11Y-3).
 *
 * For lane C's mission beacons: `focusMission(id)` opens the home list and focuses that row.
 *
 * Phones (redesign): the globe comes first. At home the frame is closed and the sheet shows the
 * next mission at peek; the frame opens only for a mission, an object or a found place, and then
 * the sheet shows that thing's card (`object`: name, kind, what to try, ✕ back to the globe).
 * A place card opened from the sky goes in the sheet with Back (11.2).
 *
 * Desktop: a place card opened from the sky takes the left column's place (the list, mission or
 * success card steps aside until it closes), so it never covers them.
 */
import { MISSION_IDS, isMissionId, type MissionId } from '../explore/missions.ts';
import { openTarget } from '../explore/game.ts';
import { leaveMission, onProgress, progress } from '../explore/progress.ts';
import { getView, onView, setView } from '../shell/view.ts';
import { closable } from '../shell/escape.ts';
import { hideFrame, onFrameMove, openPlace } from '../shell/shell.ts';
import { back, onLayout, onSheet, openSheet, sheetContent } from '../shell/sheet.ts';
import { globeHome, onBeaconPress } from '../sky/globe.ts';
import { detail } from '../viewer/detail.ts';
import { S, watch } from '../viewer/state.ts';
import type { Link } from '../viewer/link.ts';
import { targetByKey } from '../core/targets.ts';
import { renderList, renderObject, renderWelcome } from './home.ts';
import { askLeave, hint, missionBody, openMission, render as renderMission, running, startMissions } from './mission.ts';
import { clearSuccess, showSuccess, successBody } from './success.ts';
import { dismiss, phone, present } from './ui.ts';
import { startField } from './field.ts';

type Screen = 'welcome' | 'home' | 'mission' | 'success';

let screen: Screen = 'home';
/** Move focus to the screen's title on the next sync (the visitor opened it). */
let focusNext = false;

const welcome = document.createElement('section');
const list = document.createElement('div');
/** On phones: the card for what the frame shows when no mission runs. */
const objectCard = document.createElement('div');
/** Its mount: none on desktop (the list stays there), so a detached stand-in. */
const objectStub = document.createElement('div');
/** The welcome card has no mount point of its own: on phones it goes in the sheet through this. */
const stub = document.createElement('div');

function mount(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Starts Discover. Called once by main.ts, after the view has been chosen. */
export function startDiscover(link: Link): void {
  const listMount = mount('discover-list');
  const missionMount = mount('mission');
  const successMount = mount('mission-success');
  if (!listMount || !missionMount || !successMount) return;
  // Lane C's beacons on the globe start the same mission or object as the list's rows.
  onBeaconPress((b) => {
    if (getView() !== 'discover') return false;
    if (b.kind === 'mission' && isMissionId(b.id)) {
      if (screen === 'success') clearSuccess();
      openMission(b.id);
      go('mission');
      return true;
    }
    if (b.kind === 'object') {
      openObject(b.target);
      return true;
    }
    return false;
  });

  listMount.dataset.card = 'discover-list';
  listMount.dataset.guide = 'discover-list';
  listMount.setAttribute('aria-label', 'Missions');
  missionMount.dataset.card = 'mission';
  missionMount.dataset.guide = 'mission';
  successMount.dataset.card = 'mission-success';
  successMount.dataset.guide = 'mission-success';
  welcome.id = 'dsc-welcome';
  welcome.dataset.card = 'dsc-welcome';
  welcome.dataset.guide = 'discover-welcome';
  welcome.setAttribute('aria-label', 'Welcome');
  welcome.hidden = true;
  // Focus order (section 10): the top row, then the card that says what to do, then the picture.
  // The mount points are last in index.html; they are moved in front of the frame.
  const frame = document.getElementById('frame');
  if (frame?.parentElement === document.body) frame.before(welcome, listMount, missionMount, successMount);
  else document.body.append(welcome);
  renderWelcome(welcome);

  startMissions({
    onFinish: (id, data) => {
      showSuccess({ id, ...data });
      go('success');
    },
    onLeave: () => {
      leaveMission();
      hideFrame(true);
      go('home');
    },
  });

  closable(missionMount, 30, () => (screen === 'mission' ? askLeave() : go('home', true)));
  closable(successMount, 30, () => go('home', true));
  closable(welcome, 30, lookAround);

  for (const el of [welcome, listMount, missionMount, successMount, list, successBody(), objectCard])
    el.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);

  onView(sync);
  onProgress(() => {
    if (screen === 'home') renderList(list, phone());
  });
  let wasPhone = phone();
  onLayout(() => {
    if (phone() === wasPhone) return;
    wasPhone = phone();
    renderList(list, wasPhone);
    renderMission();
    sync();
  });
  // Phones: the frame opening or closing changes what the sheet shows (home or the object card).
  const frameEl = document.getElementById('frame');
  if (frameEl) new MutationObserver(sync).observe(frameEl, { attributes: true, attributeFilter: ['hidden'] });
  watch(['target', 'label'], () => {
    if (objectCard.isConnected) renderObject(objectCard);
  });
  startPlaceCard();
  startField();
  onFrameMove(place);
  addEventListener('resize', place);
  // The intro covers the page: Discover's cards wait for it to land (html[data-intro]).
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-intro'] });
  // v1's welcome card (lane H) is Expert's; in Discover this view's own welcome replaces it.
  const old = document.getElementById('welcome');
  if (old) new MutationObserver(hideOldWelcome).observe(old, { attributes: true, attributeFilter: ['hidden'] });

  const p = progress();
  const fresh = MISSION_IDS.every((id) => Object.keys(p.steps[id]).length === 0);
  if (link.mission && isMissionId(link.mission)) {
    openMission(link.mission);
    screen = 'mission';
  } else screen = fresh ? 'welcome' : 'home';
  // Phones open on the globe: the frame waits for a mission or an object, unless the link named
  // a place to look at.
  if (phone() && screen !== 'mission' && !link.target && link.ra === null) hideFrame(true);
  renderList(list, phone());
  sync();
}

/**
 * A place card opened from the sky (lane G's `#place-card`). On a phone it goes in the sheet at
 * half, with Back to what was there; its own ✕ or Back closes it. On desktop Discover the CSS
 * gives it the left column (discover.css).
 */
function startPlaceCard(): void {
  const card = document.getElementById('place-card');
  if (!card) return;
  let inSheet = false;
  new MutationObserver(() => {
    const open = !card.hidden;
    if (open && phone() && !inSheet && getView() === 'discover') {
      inSheet = true;
      openSheet(card, { height: 'half', label: 'Place', back: true });
    } else if (!open && inSheet && sheetContent() === card) back();
  }).observe(card, { attributes: true, attributeFilter: ['hidden'] });
  onSheet(() => {
    if (!inSheet || card.closest('#sheet')) return;
    // Left the sheet (Back, or replaced): the card closes, so it does not float on the page.
    inSheet = false;
    if (!card.hidden) card.querySelector<HTMLElement>('[data-close]')?.click();
    if (!card.hidden) card.hidden = true;
  });
}

/** v1's welcome card (lane H's `#welcome`) belongs to Expert; Discover has its own. */
function hideOldWelcome(): void {
  const old = document.getElementById('welcome');
  if (old && !old.hidden && getView() === 'discover') old.hidden = true;
}

/** Opens the home list and focuses a mission's row (lane C's beacons). */
export function focusMission(id: MissionId): void {
  if (getView() !== 'discover') return;
  if (screen !== 'mission') go('home');
  else return;
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-mission="${id}"]`)?.focus());
}

function go(next: Screen, byVisitor = true): void {
  if (next !== 'success') clearSuccessIfLeaving(next);
  if (next === 'home' && screen === 'success') {
    hideFrame(true);
    globeHome({ animate: true });
  }
  screen = next;
  focusNext = byVisitor;
  if (next === 'home') renderList(list, phone());
  sync();
}

function clearSuccessIfLeaving(next: Screen): void {
  if (screen === 'success' && next !== 'success') clearSuccess();
}

/** Shows the screen now (or nothing in Expert and while the intro plays). */
function sync(): void {
  const listMount = mount('discover-list');
  const missionMount = mount('mission');
  const successMount = mount('mission-success');
  if (!listMount || !missionMount || !successMount) return;
  const on = getView() === 'discover' && document.documentElement.dataset.intro === undefined;
  hideOldWelcome();
  const frameOpen = !!document.getElementById('frame')?.checkVisibility();
  let want: Screen | 'object' | null = on ? screen : null;
  if (want === 'home' && phone() && frameOpen) want = 'object';
  if (want !== 'object') dismiss(objectStub, objectCard);
  if (want !== 'welcome') {
    dismiss(stub, welcome);
    welcome.hidden = true;
  }
  if (want !== 'home') dismiss(listMount, list);
  if (want !== 'mission') dismiss(missionMount, missionBody());
  if (want !== 'success') dismiss(successMount, successBody());
  if (!want) return;
  let shown: HTMLElement;
  if (want === 'welcome') {
    // On a phone the welcome sits in the sheet at half, under the globe (11.6).
    welcome.hidden = false;
    // In the sheet, the sheet is the card (its content scrolls inside it).
    if (phone()) delete welcome.dataset.card;
    else welcome.dataset.card = 'dsc-welcome';
    if (phone()) present(stub, welcome, { height: 'half', label: 'Welcome' });
    else {
      dismiss(stub, welcome);
      if (welcome.parentElement !== document.body) (listMount.parentElement ?? document.body).insertBefore(welcome, listMount);
    }
    shown = welcome;
  } else if (want === 'home') {
    // Phones: the globe first; the sheet peeks with Find and the next mission (redesign).
    present(listMount, list, { height: 'peek', label: 'Missions' });
    shown = list;
  } else if (want === 'object') {
    renderObject(objectCard);
    present(objectStub, objectCard, { height: 'peek', label: S.label || 'Pictures' });
    shown = objectCard;
  } else if (want === 'mission') {
    present(missionMount, missionBody(), { height: 'peek', label: `Mission: ${running() ?? ''}` });
    shown = missionBody();
  } else {
    present(successMount, successBody(), { height: 'half', label: 'Mission complete' });
    shown = successBody();
  }
  place();
  if (focusNext) {
    focusNext = false;
    shown.querySelector<HTMLElement>('.dsc-title, .dsc-h')?.focus({ preventScroll: true });
  }
}

/**
 * Desktop: wider than 1500 px, the mission and success cards sit directly left of the frame with
 * a 16 px gap (5.3); narrower, at the left edge (the stylesheet's place).
 */
function place(): void {
  const frame = document.getElementById('frame');
  // Keep clear of the rail while it shows (lane F hides it in Discover: then the gutter is 16 px).
  const rail = document.getElementById('rail');
  const rr = rail?.checkVisibility() ? rail.getBoundingClientRect() : null;
  const left = rr?.width && !phone() ? Math.round(rr.right + 12) : 16;
  // The place card takes the left column's place in Discover (discover.css).
  document.documentElement.style.setProperty('--dsc-left', `${left}px`);
  for (const id of ['discover-list', 'mission', 'mission-success']) {
    const m = mount(id);
    if (!m) continue;
    m.style.setProperty('--dsc-left', `${left}px`);
    if (id === 'discover-list') continue;
    const r = frame && !frame.hidden ? frame.getBoundingClientRect() : null;
    if (phone() || innerWidth <= 1500 || !r?.width) {
      m.style.removeProperty('--dsc-x');
      continue;
    }
    const w = m.offsetWidth || (id === 'mission' ? 380 : 420);
    m.style.setProperty('--dsc-x', `${Math.max(left, Math.round(r.left - 16 - w))}px`);
  }
}

// ----- Actions ---------------------------------------------------------------------------------

function lookAround(): void {
  go('home');
}

/** "Try another object": the list stays; the game opens the target in the frame (ungraded). */
function openObject(key: string): void {
  go('home', false);
  openTarget(key);
  hideFrame(false);
}

function toExpert(): void {
  setView('expert');
  if (S.target) detail({ kind: 'target' });
}

function onClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-k], [data-mission], [data-object]');
  if (!el) return;
  const mission = el.dataset.mission;
  if (mission && isMissionId(mission)) {
    if (screen === 'success') clearSuccess();
    openMission(mission);
    go('mission');
    return;
  }
  const object = el.dataset.object;
  if (object) {
    openObject(object);
    return;
  }
  switch (el.dataset.k) {
    case 'start':
      openMission('runaway');
      go('mission');
      return;
    case 'look':
      return lookAround();
    case 'expert': {
      // "Show me every number": Expert on Barnard's Star at the Measure level (5.1).
      if (screen === 'welcome') {
        const t = targetByKey('barnard');
        if (t && S.target !== 'barnard') openPlace({ name: t.name, ra: t.ra, dec: t.dec, target: 'barnard' });
        screen = 'home';
      }
      toExpert();
      return;
    }
    case 'next': {
      const id = el.dataset.next;
      if (id && isMissionId(id)) {
        clearSuccess();
        openMission(id);
        go('mission');
      }
      return;
    }
    case 'close':
      go('home');
      return;
    case 'close-frame':
      // Phones: back to the globe from an object or a found place.
      hideFrame(true);
      globeHome({ animate: true });
      focusNext = true;
      return;
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'h' && e.key !== 'H') return;
  if (e.ctrlKey || e.metaKey || e.altKey || screen !== 'mission' || getView() !== 'discover') return;
  // `H` works only with focus on the picture (the card handles its own keys): WCAG 2.1.4.
  const a = document.activeElement;
  if (a instanceof HTMLCanvasElement && a.closest('#frame-pic')) {
    e.preventDefault();
    hint();
  }
}
