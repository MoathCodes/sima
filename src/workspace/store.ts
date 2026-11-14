/**
 * Keeping workspaces (SPEC 10 O-V4; SPEC-v1 F8): autosave in the browser, named workspaces (save,
 * rename, open, delete), JSON files (export, import) and the share link (`#w=`). Owner:
 * integrator (workspace).
 *
 * - Autosave (`sima-workspace`): the extra frames and their links come back on the next plain
 *   visit. The main frame and the sky do not: a first view stays the same for everyone, and a
 *   link's own `?ra=…` or `target=` decides the main frame.
 * - A share link is the simple link (url.ts, for the main frame) plus `#w=` for everything else.
 *   A damaged or unreadable one opens the default view with a plain message.
 * - Named workspaces (`sima-workspaces`) and files restore the main frame and the sky too.
 *
 * Every read and write of browser storage is wrapped: storage can be blocked.
 */
import { S, VIEWS } from '../viewer/state.ts';
import { pause, setEpoch } from '../viewer/playback.ts';
import { emit, on } from '../shell/bus.ts';
import { toast } from '../shell/toast.ts';
import { setLevel } from '../explore/game.ts';
import { camera, flyTo } from '../sky/sky.ts';
import { decodeWorkspace, encodeWorkspace, LINK_LIMIT, migrate, workspaceInHash, type Workspace } from './schema.ts';
import { frames, onChange, restoreFrames, snapshot } from './frames.ts';

const CURRENT = 'sima-workspace';
const NAMED = 'sima-workspaces';

/** A workspace saved under a name. */
export interface Named {
  name: string;
  /** When it was saved, ISO 8601. */
  saved: string;
  ws: Workspace;
}

let name = 'My workspace';
let restoring = false;
const listFns = new Set<() => void>();

/** The workspace's name now. */
export function workspaceName(): string {
  return name;
}

/** Hears changes to the named list or the current name (the tray redraws). */
export function onNamed(fn: () => void): () => void {
  listFns.add(fn);
  return () => listFns.delete(fn);
}

function tell(): void {
  for (const fn of listFns) fn();
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function now(): Workspace {
  const c = camera();
  return snapshot(name, { ra: c.ra, dec: c.dec, fov: c.fov });
}

/**
 * Starts saving, and opens what the page was given: a `#w=` link first, else (on a plain visit)
 * the autosaved frames. Called once by index.ts, after the main frame has started loading.
 *
 * @param plain True when the address asks for nothing (no `?ra=`, `target=`…).
 */
export async function startStore(plain: boolean): Promise<void> {
  let timer = 0;
  onChange((what) => {
    if (what !== 'state' || restoring) return;
    clearTimeout(timer);
    timer = window.setTimeout(save, 400);
  });
  // The main frame's date and detector are part of the autosave too. A new picture every 600 ms
  // during playback must not keep postponing a save that is already waiting.
  on('shown', () => {
    if (!frames().length || restoring || timer) return;
    timer = window.setTimeout(save, 1500);
  });
  function save(): void {
    timer = 0;
    write(CURRENT, now());
  }

  const hash = workspaceInHash(location.hash);
  if (hash !== null) {
    const { ws, note } = await decodeWorkspace(hash);
    // The link has been read: later reloads show the user's own changes, not the link again.
    history.replaceState(null, '', location.pathname + location.search);
    if (!ws) {
      toast(`${note ?? 'The workspace link could not be read.'} The usual view opened instead.`, { ms: 12000 });
      return;
    }
    name = ws.name;
    apply(ws, { main: false, camera: true });
    if (note) toast(note, { ms: 10000 });
    return;
  }
  if (!plain) return;
  const saved = read<unknown>(CURRENT);
  if (!saved) return;
  const { ws } = migrate(saved);
  if (!ws || !ws.frames.length) return;
  name = ws.name;
  apply(ws, { main: false, camera: false });
}

/**
 * Opens a workspace: its frames and links, and if asked the main frame (spot, detector, view,
 * date) and the sky's view.
 */
export function apply(ws: Workspace, opts: { main: boolean; camera: boolean }): void {
  restoring = true;
  try {
    restoreFrames(ws);
  } finally {
    restoring = false;
  }
  if (opts.camera && ws.camera) flyTo(ws.camera, { animate: false });
  const m = ws.main;
  if (opts.main && m) {
    const stop = on('patch', (p) => {
      if (p.source === 'loading') return;
      stop();
      setTimeout(() => {
        if (!VIEWS[S.level].includes(m.mode)) setLevel('measure');
        S.mode = m.mode;
        if (m.det !== S.det) emit('band', { det: m.det });
        if (m.mjd !== null) {
          let best = -1;
          let gap = Infinity;
          S.groups.forEach((g, i) => {
            const d = Math.abs(g.mjd - m.mjd!);
            if (d < gap) [best, gap] = [i, d];
          });
          if (best >= 0) {
            pause();
            setEpoch(best);
          }
        }
      }, 0);
    });
    emit('aim', { ra: m.ra, dec: m.dec, fov: m.fov, target: m.target });
  }
  write(CURRENT, now());
  tell();
}

// ----- Named workspaces -----------------------------------------------------------------------

/** The saved workspaces, newest first. */
export function named(): Named[] {
  const list = read<Named[]>(NAMED);
  return Array.isArray(list) ? list.filter((n) => n && typeof n.name === 'string' && n.ws) : [];
}

/** Saves the workspace now under a name (replacing one of the same name). */
export function saveAs(newName: string): boolean {
  const n = newName.trim().slice(0, 60) || 'My workspace';
  name = n;
  const list = named().filter((x) => x.name !== n);
  list.unshift({ name: n, saved: new Date().toISOString(), ws: now() });
  const ok = write(NAMED, list);
  write(CURRENT, now());
  tell();
  toast(ok ? `Saved “${n}” in this browser.` : 'This browser does not allow saving here, so it was not saved. Export it as a file instead.');
  return ok;
}

/** Opens a saved workspace: frames, main frame and sky. */
export function openNamed(n: string): void {
  const item = named().find((x) => x.name === n);
  if (!item) return;
  const { ws, note } = migrate(item.ws);
  if (!ws) {
    toast(note ?? `“${n}” could not be read.`);
    return;
  }
  name = item.name;
  apply(ws, { main: true, camera: true });
  if (note) toast(note, { ms: 10000 });
}

export function rename(from: string, to: string): void {
  const n = to.trim().slice(0, 60);
  if (!n || n === from) return;
  const list = named().filter((x) => x.name !== n);
  for (const x of list) if (x.name === from) x.name = x.ws.name = n;
  write(NAMED, list);
  if (name === from) name = n;
  tell();
}

export function remove(n: string): void {
  write(NAMED, named().filter((x) => x.name !== n));
  tell();
}

// ----- Files and links ------------------------------------------------------------------------

/** Downloads the workspace now as a JSON file. */
export function exportFile(): void {
  const ws = now();
  const blob = new Blob([JSON.stringify(ws, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${ws.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}.sima.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Opens a workspace file chosen by the user. */
export async function importFile(file: File): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    toast(`“${file.name}” is not a workspace file (it is not JSON).`);
    return;
  }
  const { ws, note } = migrate(raw);
  if (!ws) {
    toast(note ?? `“${file.name}” could not be read.`);
    return;
  }
  name = ws.name;
  apply(ws, { main: true, camera: true });
  toast(note ?? `Opened “${ws.name}”.`, { ms: note ? 10000 : 4000 });
}

/**
 * The share link's workspace part for what is on screen: `#w=…`, or null when it would make the
 * link longer than LINK_LIMIT (offer the file instead).
 *
 * @param base The simple link it is added to.
 */
export async function workspaceHash(base: string): Promise<{ hash: string | null; length: number }> {
  const hash = `#w=${await encodeWorkspace(now())}`;
  const length = base.length + hash.length;
  return { hash: length > LINK_LIMIT ? null : hash, length };
}
