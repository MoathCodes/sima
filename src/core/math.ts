/**
 * Seeded random numbers, for the labelled practice simulation and for tests. Owner: lane B. Pure.
 * The same seed always gives the same numbers, so a simulation looks the same on every visit.
 *
 * PHASE 0 STUB: fixed fake values.
 */

/** A source of random numbers in [0, 1). */
export type Rand = () => number;

/**
 * A seeded generator of numbers in [0, 1) (for example mulberry32).
 * PHASE 0 STUB: the generator always returns 0.5.
 *
 * @param seed Any integer.
 */
export function rng(seed: number): Rand {
  return () => 0.5;
}

/**
 * A normally distributed number, mean 0 and standard deviation 1, drawn with `rand`.
 * PHASE 0 STUB: always 0.
 */
export function gauss(rand: Rand): number {
  return 0;
}

/**
 * A Poisson-distributed count with the given mean, drawn with `rand` (photon noise).
 * PHASE 0 STUB: returns the mean rounded.
 */
export function poisson(rand: Rand, mean: number): number {
  return Math.round(mean);
}
