/** Success sentences, filled only from measured readings or explicitly labelled models. */
import type { MotionFit } from '../core/types.ts';
import type { StackResult } from '../core/stack.ts';
import type { PlanetEdges } from './plan-x.ts';

export function runawayLines(fit: MotionFit | null, reason = 'The measurement is not available.') {
  const measured = !!fit?.ok && Number.isFinite(fit.total) && Number.isFinite(fit.totalErr);
  return {
    heading: 'You caught a runaway star.',
    measured: measured
      ? `Sima measured it moving ${fit!.total.toFixed(2)} ± ${fit!.totalErr.toFixed(2)}″ a year, from ${fit!.used} of ${fit!.of} pictures.`
      : `Not measured: ${fit?.reason ?? reason}`,
    catalogue:
      fit?.catalogue && Number.isFinite(fit.catalogue.total)
        ? `${measured ? "Gaia's star catalogue" : 'Catalogue value (ESA Gaia DR3)'}: ${fit.catalogue.total.toFixed(2)}″ a year.`
        : 'Catalogue value: not available.',
    comparison:
      measured && fit?.matches !== null
        ? fit?.matches
          ? 'Matches within the error'
          : 'Differs from the catalogue'
        : '',
    explanation: '″ is an arcsecond: 1/3600 of a degree.',
    sources: 'Measured from SPHEREx pixels · Catalogue: ESA Gaia DR3',
  };
}

/** Only current-key results that passed the mission check belong here. Type is runtime SIMBAD. */
export function ghostLines(
  s: StackResult | null,
  wavelength: string,
  spectralType: string | null,
  reason = 'The stack is not available.',
  notDetectedBands: readonly string[] = [],
) {
  const measured = s && [s.along.snr, ...s.controls.map((c) => c.snr)].every(Number.isFinite);
  return {
    heading: measured
      ? 'You made a faint brown dwarf appear.'
      : 'You tried adding pictures along a path.',
    measured: measured
      ? `Added along its path, ${s.frames} pictures show it at ${s.along.snr.toFixed(1)}× the noise, in ${wavelength} µm light.`
      : `This time Sima could not make the stack: ${reason}`,
    controls: measured
      ? `Not shifted: ${s.controls[0].snr.toFixed(1)}×. Opposite motion: ${s.controls[1].snr.toFixed(1)}×. Only the right motion makes it this strong.`
      : '',
    notDetected: notDetectedBands.length
      ? `In ${notDetectedBands.join(', ')} it was not detected with this method.`
      : '',
    type: spectralType
      ? `SIMBAD lists it as a brown dwarf of type ${spectralType}.`
      : 'SIMBAD type: not available.',
    sources: 'Measured from SPHEREx pixels · Motion: Luhman & Esplin 2016 · Type: SIMBAD',
  };
}

export function planetLines(edges: PlanetEdges) {
  return {
    heading: 'Simulated: you tested a pretend Planet X.',
    distance:
      edges.distance === null
        ? `Simulated: not worked out. ${edges.reason}`
        : `Simulated · Model: by a simple model and this patch's measured noise, a Neptune-sized planet would show in one SPHEREx picture closer than about ${Math.round(edges.distance)} AU.`,
    radius:
      edges.radius === null
        ? ''
        : `Simulated · Model: at 500 AU it would need to be about ${edges.radius.toFixed(1)} times Earth's width.`,
    note: 'Nothing here was observed.',
    sources: "Model: Sima's sandbox · Noise: measured from SPHEREx pixels",
  };
}
