/**
 * The labelled practice simulation, part 2 of 3: what is in a simulated patch (stars, and a
 * mover or a pretend planet). Owner: lane B. Pure. Everything here is Simulated (H3) and never
 * mixes with real results.
 *
 * PHASE 0 STUB: the scenarios exist but contain no sources yet.
 */

/** One simulated source. */
export interface SimSource {
  /** Degrees at the first date. */
  ra: number;
  dec: number;
  /** mas/yr (east times cos dec, north). */
  pmra: number;
  pmdec: number;
  /** Brightness per detector, µJy; index 0 is D1. */
  flux: [number, number, number, number, number, number];
  kind: 'star' | 'mover' | 'planet';
}

/** A practice patch, opened by a starter in the Places menu. */
export interface Scenario {
  /** Key used with viewer/load.ts `loadTarget`. */
  key: string;
  /** What the Places menu calls it. */
  title: string;
  /** Its plain line there (after the Simulated label). */
  line: string;
  /** Where the simulated patch sits on the sky, degrees. Not a real place's pictures. */
  ra: number;
  dec: number;
  /** Field size, arcminutes: one of FOVS in viewer/state.ts. */
  fov: number;
  /** The same seed always gives the same patch. */
  seed: number;
}

/**
 * The practice patches. PHASE 0 STUB: positions are placeholders (0, 0) until lane B picks
 * empty-looking spots; lane H writes the wording.
 */
export const SCENARIOS: Readonly<Record<string, Scenario>> = Object.freeze({
  'warm-up': {
    key: 'warm-up',
    title: 'Warm-up',
    line: '20-second practice',
    ra: 0,
    dec: 0,
    fov: 6,
    seed: 1,
  },
  'planet-x': {
    key: 'planet-x',
    title: 'The hidden planet',
    line: 'Made up: it jumps',
    ra: 0,
    dec: 0,
    fov: 6,
    seed: 2,
  },
});

/**
 * The sources of a practice patch.
 * PHASE 0 STUB: none.
 */
export function simSources(scenario: Scenario): SimSource[] {
  return [];
}
