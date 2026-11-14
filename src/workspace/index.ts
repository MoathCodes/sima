/**
 * The workspace (SPEC 10 O-V1 to O-V4): several frames at once, frame types as tools, linking,
 * and workspaces that can be saved and shared. Owner: integrator (workspace).
 *
 * The main frame is unchanged; this part adds up to six extra frames beside it. Files:
 * - schema.ts: the workspace as data, its versions, the share link's encoding (pure, tested).
 * - patches.ts: real exposures for an extra frame, through the main frame's paths.
 * - frames.ts: the frames' state, link groups, and the rules between frames.
 * - card.ts: drawing one frame. menu.ts: its menus. place.ts: where it sits.
 * - tray.ts: the tool tray on the rail. store.ts: autosave, named workspaces, files, links.
 *
 * Not started in embed mode (`embed=1` shows only the main frame, the bar and Measure).
 */
import { hooks, startFrames } from './frames.ts';
import { headFrame, makeCard, paintFrame } from './card.ts';
import { askWhichToClose } from './menu.ts';
import { place, startPlace, wireCard } from './place.ts';
import { startTray } from './tray.ts';
import { startStore } from './store.ts';
import { shareWorkspace } from '../viewer/share.ts';
import { frames } from './frames.ts';
import { exportFile, workspaceHash } from './store.ts';

/**
 * Starts the workspace. Called once by main.ts, after the link has been read.
 *
 * @param plain True when the address asks for nothing, so the autosaved frames come back.
 */
export async function startWorkspace(plain: boolean): Promise<void> {
  hooks.make = (f) => {
    makeCard(f);
    wireCard(f);
    place(true);
  };
  hooks.paint = paintFrame;
  hooks.head = headFrame;
  hooks.full = askWhichToClose;
  startFrames();
  startPlace();
  startTray();
  shareWorkspace({ count: () => frames().length, hash: workspaceHash, download: exportFile });
  await startStore(plain);
}

if (import.meta.env.DEV) {
  // For people and tests poking at the page in dev: `__ws.frames()`.
  void import('./frames.ts').then((m) => ((window as unknown as { __ws: unknown }).__ws = m));
}
