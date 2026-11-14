/**
 * The labelled practice simulation, part 3 of 3: simulated exposures of a practice patch on the
 * viewer's grid, with SPHEREx-like pixels, noise and colours. Owner: lane B. Pure.
 *
 * The result is a Field with `simulated: true`; every frame's id starts with `SIMULATED` and its
 * release is `simulated` (H3, O-G11).
 *
 * PHASE 0 STUB: a simulated field with no frames.
 */
import type { Field } from './types.ts';
import { fieldGrid } from './real.ts';
import { PIXEL_ARCSEC } from './instrument.ts';
import type { Scenario } from './field.ts';

/**
 * A whole simulated patch, ready for the frame.
 * PHASE 0 STUB: no frames.
 *
 * @param scenario From core/field.ts SCENARIOS.
 */
export function simulate(scenario: Scenario): Field {
  const grid = fieldGrid(scenario.ra, scenario.dec, scenario.fov);
  return {
    ra: scenario.ra,
    dec: scenario.dec,
    fov: scenario.fov,
    n: grid.n,
    scale: PIXEL_ARCSEC,
    wcs: grid.wcs,
    simulated: true,
    frames: [],
    windows: 0,
    monthly: false,
    noise: [Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN],
    target: null,
    neighbours: [],
    releases: ['simulated'],
  };
}
