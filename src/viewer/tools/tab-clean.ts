/**
 * Clean up tab: standard noise reduction, each step a switch (TLS-2, docs/tools.md "Clean up
 * tab"). Every step that is on is named on the picture (H8); "Original" shows the pixels as
 * recorded. Owner: lane E.
 */
import { S } from '../state.ts';
import { draw } from '../render.ts';
import { PIXEL_ARCSEC } from '../../core/instrument.ts';
import type { CombineHow, Smooth } from '../../core/picture.ts';
import { setPic } from './settings.ts';
import { pressSeg, seg, setSwitch, switchRow, term } from './dom.ts';

const SMOOTH_LINE: Record<string, string> = {
  '0': 'No smoothing',
  '0.5': 'A light blur of half a pixel; flagged pixels are left out, not blurred in',
  '1': 'A blur of one pixel: faint spread-out things easier to see; close pairs merge',
  '2': 'A blur of two pixels: only for faint, spread-out light; stars merge',
};

const COMBINE_LINE: Record<CombineHow, string> = {
  mean: 'The average of the exposures (default)',
  median: 'The middle value: one bad exposure cannot move it',
  clip: 'Values more than 3 robust standard deviations from the middle are dropped, then the average',
};

export function buildClean(root: HTMLElement): void {
  root.innerHTML = `
    <p class="tl-intro">Standard noise reduction. Each step changes the pixels, so the picture names it while it is on. <b>Original</b> on the picture (or the <span class="kbd">\\</span> key) shows the pixels as recorded.</p>
    <p class="tl-paused" data-paused hidden>Original is on: these steps are paused. <button type="button" class="link" data-original-off>Turn Original off</button></p>
    <div class="tl-steps" data-steps>
      ${switchRow('match', 'Match brightness', 'Scale each exposure so typical stars match the reference')}
      ${switchRow('background', 'Remove background', '')}
      ${switchRow(
        'median',
        'Median filter',
        `Each pixel becomes the middle value of its 3 × 3 block. Removes hot pixels, but SPHEREx stars are about one pixel wide, so it can also remove faint stars and movers`,
      )}
      <p class="group-label tl-group">Smooth</p>
      ${seg('smooth', 'Smooth', [
        ['0', 'Off'],
        ['0.5', '0.5 px'],
        ['1', '1 px'],
        ['2', '2 px'],
      ])}
      <p class="tl-line" data-smooth-line></p>
      ${switchRow(
        'combinePass',
        'Combine each pass',
        `Blink one cleaner picture per pass (stacking), ${term('cosmic-ray', 'A particle that hits the detector during one exposure and lights a pixel or two. It is not on the sky, so it is never on two exposures.')} hits left out`,
      )}
      <p class="group-label tl-group">Combine by</p>
      ${seg('combine', 'Combine by', [
        ['mean', 'Mean'],
        ['median', 'Median'],
        ['clip', 'Sigma clip'],
      ])}
      <p class="tl-line" data-combine-line></p>
      <p class="tl-line">Combine by applies to <b>Combine each pass</b> and to the <b>Stack</b> view.</p>
    </div>`;
  for (const name of ['match', 'background', 'median', 'combinePass'] as const) {
    root
      .querySelector(`[data-switch="${name}"]`)
      ?.addEventListener('click', () => setPic({ [name]: !S.pic[name] }));
  }
  root.querySelectorAll<HTMLElement>('[data-smooth]').forEach((b) =>
    b.addEventListener('click', () => setPic({ smooth: Number(b.dataset.smooth) as Smooth })),
  );
  root.querySelectorAll<HTMLElement>('[data-combine]').forEach((b) =>
    b.addEventListener('click', () => setPic({ combineBy: b.dataset.combine as CombineHow })),
  );
  root.querySelector('[data-original-off]')?.addEventListener('click', () => {
    S.original = false;
    draw();
  });
}

export function updateClean(root: HTMLElement): void {
  // The switches show the saved settings; while Original is on they are dimmed, not changed.
  const p = S.pic;
  for (const name of ['match', 'background', 'median', 'combinePass'] as const) {
    setSwitch(root, name, p[name]);
  }
  pressSeg(root, 'smooth', String(p.smooth));
  pressSeg(root, 'combine', p.combineBy);
  root.querySelector('[data-smooth-line]')!.textContent = SMOOTH_LINE[String(p.smooth)] ?? '';
  root.querySelector('[data-combine-line]')!.textContent = COMBINE_LINE[p.combineBy];
  const n = S.field?.n ?? 0;
  const box = Math.min(16, Math.max(4, Math.round(n / 3)));
  const bg = root.querySelector('[data-line="background"]');
  if (bg) {
    bg.textContent = `Take out the smooth sky level, in boxes about ${Math.round(box * PIXEL_ARCSEC)}″ across. A large galaxy or nebula is partly taken out with it`;
  }
  root.querySelector<HTMLElement>('[data-paused]')!.hidden = !S.original;
  root.querySelector<HTMLElement>('[data-steps]')!.classList.toggle('tl-dim', S.original);
}
