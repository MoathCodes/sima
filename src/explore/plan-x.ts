/** Simulated model edges within the sandbox limits. Pure; never supplies missing noise. */
import {
  answer,
  verdict,
  LIMITS,
  DEFAULT_PLANET,
  type DetectorNoise,
  type PretendPlanet,
} from '../core/sandbox.ts';

export interface PlanetEdges {
  distance: number | null;
  radius: number | null;
  reason: string;
}

/** Largest distance for Neptune size, and smallest radius at 500 AU, for one-picture visibility.
 * Null means no edge inside the limits. The caller must label all numbers Model.
 * Fixed 32 iterations bound the work and reach much less than a slider step.
 */
export function planetEdges(
  noises: readonly DetectorNoise[],
  planet: PretendPlanet = DEFAULT_PLANET,
): PlanetEdges {
  const at = (p: PretendPlanet) => verdict(answer(p, noises));
  if (at(planet).kind === 'unknown')
    return {
      distance: null,
      radius: null,
      reason: 'This patch has no measured noise to compare with.',
    };
  const search = (
    min: number,
    max: number,
    sees: (v: number) => boolean,
    increasing: boolean,
  ): number | null => {
    if (sees(min) === sees(max)) return null;
    for (let n = 0; n < 32; n++) {
      const mid = (min + max) / 2;
      if (sees(mid) === increasing) max = mid;
      else min = mid;
    }
    return increasing ? max : min;
  };
  const distance = search(
    LIMITS.distance.min,
    LIMITS.distance.max,
    (distance) => at({ ...planet, radius: DEFAULT_PLANET.radius, distance }).kind === 'one',
    false,
  );
  const radius = search(
    LIMITS.radius.min,
    LIMITS.radius.max,
    (radius) => at({ ...planet, distance: 500, radius }).kind === 'one',
    true,
  );
  return {
    distance,
    radius,
    reason:
      distance === null || radius === null ? 'A model edge lies outside the slider limits.' : '',
  };
}
