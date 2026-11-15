/**
 * The page's entry: imports the styles and starts each part. Owner: integrator.
 *
 * Each part starts on its own: one that throws is reported and the rest still start, so a
 * broken lane never blanks the page. `<html>` gets `data-started` once every part has been
 * started and `data-ready` once the first view has settled (the smoke test waits for it).
 */
import './styles/app.css';
import './styles/shell.css';
import './styles/sky.css';
import './styles/frame.css';
import './styles/tools.css';
import './styles/places.css';
import './styles/guide.css';
import './styles/intro.css';
import './styles/extras.css';
import './styles/workspace.css';

import { startShell } from './shell/shell.ts';
import { startPlaces } from './shell/places.ts';
import { startFinds } from './shell/finds.ts';
import { startSandbox } from './shell/sandbox.ts';
import { startSky } from './sky/sky.ts';
import { startSearch } from './viewer/omnibox.ts';
import { startFrame } from './viewer/frame.ts';
import { startBar } from './viewer/bar.ts';
import { startMeasure } from './viewer/detail.ts';
import { startTools } from './viewer/tools.ts';
import { startMotion } from './viewer/motion.ts';
import { readLink, startUrl } from './viewer/url.ts';
import { startGame } from './explore/game.ts';
import { startGuide } from './guide/index.ts';
import { startIntro } from './intro/intro.ts';
import { startWorkspace } from './workspace/index.ts';
import { startView } from './shell/view.ts';
import { startGlass } from './shell/glass.ts';
import { S } from './viewer/state.ts';
import * as bus from './shell/bus.ts';

const link = readLink(location.search);
if (link.embed) {
  document.documentElement.dataset.embed = '';
  // The page flow is the frame, the bar, then Measure (GEN-3); index.html has Measure first.
  const bar = document.getElementById('bar');
  if (bar) document.getElementById('measure')?.before(bar);
}

const running: Promise<unknown>[] = [];

/** Starts one part; a failure is reported with the part's name and does not stop the others. */
function start(name: string, fn: () => unknown): void {
  try {
    running.push(
      Promise.resolve(fn()).catch((err: unknown) =>
        console.error(`main: ${name} failed to start`, err),
      ),
    );
  } catch (err) {
    console.error(`main: ${name} failed to start`, err);
  }
}

// v2.0: Glass or Solid is decided once, before anything is drawn (DESIGN-v2 section 6).
start('glass', startGlass);
// The intro first: it covers the page while every part starts under it as usual.
if (!link.embed) start('intro', startIntro);
start('shell', startShell);
start('search', startSearch);
start('frame', startFrame);
start('bar', startBar);
start('measure', startMeasure);
start('tools', startTools);
start('motion', startMotion);
start('game', startGame);
// v2.0: Discover or Expert, after the game has restored the level (shell/view.ts).
start('view', () => startView(link, location.hash));
if (!link.embed) start('guide', startGuide);
// The sky, places and the link start in the next task: starting every part in one task blocked
// the page for over 100 ms (TLS-8).
await new Promise((go) => setTimeout(go, 0));
if (!link.embed) {
  const sky = document.getElementById('sky');
  if (sky) start('sky', () => startSky(sky));
  start('places', startPlaces);
  start('finds', startFinds);
  start('sandbox', startSandbox);
}
start('url', () => startUrl(link));
if (!link.embed) {
  const plain = !link.target && link.ra === null && !link.unknown.length && !link.view && !link.det && !link.date;
  start('workspace', () => startWorkspace(plain));
}
document.documentElement.dataset.started = '';

void Promise.allSettled(running).then(() => {
  document.documentElement.dataset.ready = '';
});

if (import.meta.env.DEV) {
  // For people and tests poking at the page in dev: `sima.S`, `sima.bus.emit(…)`.
  (window as unknown as { sima: unknown }).sima = { S, bus };
}
