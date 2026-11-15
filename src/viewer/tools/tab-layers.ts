/**
 * Layers tab: what is drawn over the picture (TLS-3, SPEC 4.8): Gaia DR3 circles, CatWISE2020
 * squares, the predicted path, pixel flags and names. Each says where its rows come from (H4),
 * or why there are none. Owner: lane E.
 */
import { S } from '../state.ts';
import { askVizier, catalogue } from './catalogue.ts';
import { current, setLayer, type Layers } from './settings.ts';
import { esc, setSwitch, term } from './dom.ts';

const ROWS: [keyof Layers, string, string][] = [
  ['gaia', 'Gaia DR3', 'lg-circle'],
  ['catwise', 'CatWISE2020', 'lg-square'],
  ['path', 'Predicted path', 'lg-path'],
  ['flags', 'Pixel flags', 'lg-flag'],
  ['names', 'Names', 'lg-name'],
];

export function buildLayers(root: HTMLElement): void {
  root.innerHTML = `
    <p class="group-label tl-group">Overlays</p>
    ${ROWS.map(
      ([key, title, sym]) => `<div class="tl-row">
        <span class="tl-tile" aria-hidden="true"><span class="lg-sym ${sym}"></span></span>
        <div class="tl-row-text"><span class="tl-row-name">${esc(title)}</span>
          <span class="tl-row-line" data-line="${key}"></span></div>
        <button type="button" class="switch" role="switch" aria-checked="false" data-switch="${key}" aria-label="${esc(title)}"></button>
      </div>`,
    ).join('')}
    <p class="tl-line" data-vizier-row hidden>The shipped pictures list only the sources near the target’s path.
      <button type="button" class="link" data-vizier>Look up the whole field (VizieR)</button></p>`;
  for (const [key] of ROWS) {
    root
      .querySelector(`[data-switch="${key}"]`)
      ?.addEventListener('click', () => setLayer(key, !current().layers[key]));
  }
  root.querySelector('[data-vizier]')?.addEventListener('click', () => void askVizier());
}

export function updateLayers(root: HTMLElement): void {
  const L = current().layers;
  const cat = catalogue();
  const target = S.field?.target;
  const lines: Record<keyof Layers, string> = {
    gaia: esc(cat.gaia.line),
    catwise: esc(cat.catwise.line),
    path: target
      ? `Where ${esc(target.name)} should be on each date, ${term('from the catalogue motion', `Worked out from the catalogue (${target.values}), not seen: amber and dashed.`)}`
      : 'Only for one of the five test targets: there is no catalogue motion here',
    flags: `Flagged or missing pixels of the picture on screen: ${term('saturated, cosmic ray, hot', 'The pipeline flags pixels it cannot trust: too bright to measure (saturated), hit by a particle (cosmic ray), or always too bright (hot). They stay visible (H6).')}`,
    names: 'The target’s name and the candidates’ numbers',
  };
  for (const [key] of ROWS) {
    setSwitch(root, key, L[key]);
    const line = root.querySelector(`[data-line="${key}"]`);
    if (line) line.innerHTML = lines[key];
  }
  const partial = (cat.gaia.partial || cat.catwise.partial) && S.set?.origin === 'shipped';
  root.querySelector<HTMLElement>('[data-vizier-row]')!.hidden = !partial;
}
