/**
 * Seeded random numbers, for the labelled practice simulation and for tests. Owner: lane B. Pure.
 * The same seed always gives the same numbers, so a simulation looks the same on every visit.
 */

/** A source of random numbers in [0, 1). */
export type Rand = () => number;

/**
 * A seeded generator of numbers in [0, 1): mulberry32 (Tommy Ettinger, public domain), a 32-bit
 * generator that is fast and good enough for pictures and tests (not for cryptography).
 *
 * @param seed Any integer.
 */
export function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A normally distributed number, mean 0 and standard deviation 1, drawn with `rand`
 * (Box–Muller; one of the pair is used).
 */
export function gauss(rand: Rand): number {
  let u = 0;
  while (u <= 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * A Poisson-distributed count with the given mean, drawn with `rand` (photon noise). Knuth's
 * product method up to a mean of 30; above that a normal approximation, rounded and kept ≥ 0.
 */
export function poisson(rand: Rand, mean: number): number {
  if (!(mean > 0)) return 0;
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gauss(rand)));
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rand();
  while (p > limit) {
    k++;
    p *= rand();
  }
  return k;
}
