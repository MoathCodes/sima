/**
 * Discover, the beginner view (BEGINNER-AND-MOBILE.md sections 4, 5, 10 and 13). Owner: lane K.
 *
 * One screen at a time on top of the sky: the welcome card, the home list, a mission card, its
 * success card, or an object card. On desktop each is a panel in its own mount point
 * (`#discover-list`, `#mission`, `#mission-success`; the welcome card is made here); on phones
 * the same element goes in lane M's sheet (`shell/sheet.ts`). In Expert, all of them are closed and
 * a running mission waits where it was (leaving by the view switch keeps the step).
 *
 * Escape (section 13): coach 50; mission card, success, object and welcome 30. On the mission card
 * Escape asks "Leave the mission?" first. `H` asks for a hint only while focus is in the mission
 * card or the picture (A11Y-3).
 *
 * For lane C's mission beacons: `focusMission(id)` opens the home list and focuses that row.
 */
import { MISSION_IDS, isMissionId, type MissionId } from '../explore/missions.ts';
import { leaveMission, onProgress, progress } from '../explore/progress.ts';
import { getView, onView, setView } from '../shell/view.ts';
import { closable } from '../shell/escape.ts';
import { hideFrame, onFrameMove, openPlace } from '../shell/shell.ts';
import { onLayout } from '../shell/sheet.ts';
import { selectTab, detail } from '../viewer/detail.ts';
import { S, watch } from '../viewer/state.ts';
import type { Link } from '../viewer/link.ts';
import { targetByKey } from '../core/targets.ts';
import { OBJECTS } from './copy.ts';
import { renderList, renderObject, renderWelcome } from './home.ts';
import { askLeave, hint, missionBody, openMission, running, startMissions } from './mission.ts';
import { clearSuccess, showSuccess, successBody } from './success.ts';
import { closeCoach, coachExpert } from './coach.ts';
import { dismiss, phone, present } from './ui.ts';

type Screen = 'welcome' | 'home' | 'mission' | 'success' | 'object';

let screen: Screen = 'home';
let objectKey: string | null = null;
/** Move focus to the screen's title on the next sync (the visitor opened it). */
let focusNext = false;

const welcome = document.createElement('section');
const list = document.createElement('div');
const objectCard = document.createElement('div');
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
  const coach = mount('coach');
  if (!listMount || !missionMount || !successMount) return;

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
  if (coach) closable(coach, 50, () => closeCoach(coach));

  for (const el of [welcome, listMount, missionMount, successMount, list, objectCard, successBody()])
    el.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);

  onView((v) => {
    if (v === 'expert' && coach && document.documentElement.dataset.intro === undefined) coachExpert(coach);
    if (v === 'discover' && coach) closeCoach(coach);
    sync();
  });
  onProgress(() => {
    if (screen === 'home') renderList(list, phone());
  });
  onLayout(() => {
    renderList(list, phone());
    sync();
  });
  onFrameMove(place);
  addEventListener('resize', place);
  watch(['target', 'field', 'source', 'det'], () => {
    if (screen === 'object' && objectKey) renderObject(objectCard, objectKey);
  });
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
  renderList(list, phone());
  sync();
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
  if (next === 'home' && (screen === 'object' || screen === 'success')) hideFrame(true);
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
  const want = on ? screen : null;
  if (want !== 'welcome') {
    dismiss(stub, welcome);
    welcome.hidden = true;
  }
  if (want !== 'home') dismiss(listMount, list);
  if (want !== 'mission') dismiss(missionMount, missionBody());
  if (want !== 'object') dismiss(missionMount, objectCard);
  if (want !== 'success') dismiss(successMount, successBody());
  if (!want) return;
  let shown: HTMLElement;
  if (want === 'welcome') {
    // On a phone the welcome sits in the sheet at half, under the globe (11.6).
    welcome.hidden = false;
    if (phone()) present(stub, welcome, { height: 'half', label: 'Welcome' });
    else {
      dismiss(stub, welcome);
      if (welcome.parentElement !== document.body) (listMount.parentElement ?? document.body).insertBefore(welcome, listMount);
    }
    shown = welcome;
  } else if (want === 'home') {
    present(listMount, list, { height: 'half', label: 'Missions' });
    shown = list;
  } else if (want === 'mission') {
    present(missionMount, missionBody(), { height: 'peek', label: `Mission: ${running() ?? ''}` });
    shown = missionBody();
  } else if (want === 'object') {
    present(missionMount, objectCard, { height: 'half', label: 'Try another object' });
    shown = objectCard;
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
  for (const id of ['mission', 'mission-success']) {
    const m = mount(id);
    if (!m) continue;
    const r = frame && !frame.hidden ? frame.getBoundingClientRect() : null;
    if (phone() || innerWidth <= 1500 || !r?.width) {
      m.style.removeProperty('--dsc-x');
      continue;
    }
    const w = m.offsetWidth || (id === 'mission' ? 380 : 420);
    m.style.setProperty('--dsc-x', `${Math.max(16, Math.round(r.left - 16 - w))}px`);
  }
}

// ----- Actions ---------------------------------------------------------------------------------

function lookAround(): void {
  go('home');
}

function openObject(key: string): void {
  const t = targetByKey(key);
  if (!t) return;
  objectKey = key;
  if (S.target !== key || !S.field) openPlace({ name: t.name, ra: t.ra, dec: t.dec, target: key, fov: 6 });
  else hideFrame(false);
  if (S.mode !== 'flip') S.mode = 'flip';
  renderObject(objectCard, key);
  go('object');
}

function toExpert(tab: 'brightness' | 'path' | 'spectrum' | null): void {
  setView('expert');
  if (S.target) {
    detail({ kind: 'target' });
    if (tab) selectTab(tab);
  }
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
      toExpert(null);
      return;
    }
    case 'object-expert':
      toExpert(OBJECTS.find((o) => o.key === objectKey)?.tab ?? null);
      return;
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
