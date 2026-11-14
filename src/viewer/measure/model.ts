/**
 * What Measure says, worked out from lane B's results: the one headline number with its status
 * pill, the chart that fits it, the paragraph, and the stats column (MSR-1, MSR-3, MSR-4, H4,
 * H5). Pure: no page access, so the tests check the wording against made-up results.
 * Owner: lane E.
 *
 * Every number is labelled where it comes from: measured from pixels, a named catalogue, or a
 * model (H4). Anything that could not be measured says "Not measured" and why (H5); nothing is
 * ever filled in from the catalogue in its place.
 */
import type { MeasureTab } from '../state.ts';
import type { Target, MotionFit } from '../../core/types.ts';
import type { ChannelPoint, SpotPoint, Chi2 } from '../../core/stats.ts';
import type { DetectorCurve } from '../../core/fit.ts';
import type { StackResult } from '../../core/stack.ts';
import type { Candidate } from '../../core/detect.ts';
import { esc, num, sig, term } from '../tools/dom.ts';
import { chance, verdictOf } from './words.ts';

export type Tone = '' | 'good' | 'warn' | 'bad';

/** The calm view's headline (MSR-1). HTML strings are safe to insert. */
export interface Headline {
  /** The one big number, or "Not measured". */
  value: string;
  /** Plain explanation of the value, for its hover (MSR-4). */
  valueTip: string;
  pill: { text: string; tone: Tone };
  /** One line under it (HTML). */
  sub: string;
  /** The chart that fits the number. */
  chart: MeasureTab;
  /** The paragraph (HTML). */
  para: string;
}

/** One row of the stats column. `from` says whether it is measured, a catalogue's or a model. */
export interface StatRow {
  name: string;
  /** Plain explanation for the hover. */
  tip: string;
  value: string;
  from: 'measured' | 'catalogue' | 'model';
}

/** Results a target's Measure is built from; null where not computed yet. */
export interface TargetInput {
  target: Target;
  fit: MotionFit | null;
  curves: DetectorCurve[] | null;
  spectrum: ChannelPoint[] | null;
  stacks: StackResult[] | null;
  /** Exposures in the patch, all detectors. */
  exposures: number;
  /** Why the measurement failed, if it did. */
  error: string | null;
}

const NM = 'Not measured';

/** The headline for the patch's own target, by what it leads with (Target.lead). */
export function targetHeadline(t: TargetInput): Headline {
  switch (t.target.lead) {
    case 'motion':
      return motionHeadline(t);
    case 'spectrum':
      return spectrumHeadline(t);
    case 'stack':
      return stackHeadline(t);
    case 'brightness':
      return brightnessHeadline(t);
  }
}

function notMeasured(chart: MeasureTab, why: string, para = ''): Headline {
  return {
    value: NM,
    valueTip: 'Sima could not measure this from the pixels. It never shows a catalogue or model value in its place.',
    pill: { text: 'not measured', tone: '' },
    sub: esc(why),
    chart,
    para,
  };
}

function motionHeadline(t: TargetInput): Headline {
  const f = t.fit;
  if (t.error) return notMeasured('path', t.error);
  if (!f) return notMeasured('path', 'Measuring the positions…');
  if (!f.ok) return notMeasured('path', f.reason ?? 'The positions could not be fitted.');
  const cat = f.catalogue;
  const pill: Headline['pill'] =
    f.matches === true
      ? { text: 'matches catalogue', tone: 'good' }
      : f.matches === false
        ? { text: 'differs from catalogue', tone: 'warn' }
        : { text: 'measured', tone: '' };
  const pa = Number.isFinite(f.pa) ? `toward ${term(`position angle ${Math.round(f.pa)}°`, 'The direction of motion on the sky, counted from north through east (0° is north, 90° east).')} ` : '';
  const stab = Number.isFinite(f.stability)
    ? ` It is ${f.stability > f.totalErr ? 'not ' : ''}stable: ${term(`leaving out one of the ${f.visits} visits moves it by ±${num(f.stability, 2)}″`, 'Each visit is left out in turn and the motion fitted again. A large change means one visit decides the answer.')}.`
    : '';
  const plx = f.parallax ? (f.parallax.shown ? ` Parallax measured ${num(f.parallax.value, 0)} ± ${num(f.parallax.err, 0)} mas.` : ` Parallax was fitted too but is not shown: ${esc(f.parallax.why.replace(/\.+$/, ''))}.`) : '';
  return {
    value: `${num(f.total, 2)}″/yr`,
    valueTip: `How far the star moves across the sky in a year, measured from the pixels: ${num(f.total, 2)} ± ${num(f.totalErr, 2)} arcseconds a year. An arcsecond is 1/3600 of a degree; one SPHEREx pixel is 6.15″.`,
    pill,
    sub: `${term(`Measured ±${num(f.totalErr, 2)}″`, 'The 1σ error: the true value is within this about two times in three.')} from the pixels of ${f.used} of ${f.of} real exposures${cat ? `, catalogue ${num(cat.total, 2)}″/yr` : ''}`,
    chart: 'path',
    para:
      `Measured <b>${num(f.total, 2)} ± ${num(f.totalErr, 2)}″/yr</b> ${pa}from the pixels of ${f.used} of ${f.of} real exposures (each dot is one exposure; colours are survey passes).` +
      (cat ? ` Catalogue: ${num(cat.total, 2)}″/yr (${esc(cat.source)}).` : ' There is no catalogue motion to compare with.') +
      plx +
      stab +
      ` The motion is from a ${term('straight-line fit', 'A weighted straight line through the positions against time, east and north. Points that scatter more than their errors widen the error.')}.`,
  };
}

/** Where water and methane absorb, µm: physics, shown as shaded bands, not data. */
export const ABSORPTION: { x0: number; x1: number; label: string }[] = [
  { x0: 1.3, x1: 1.5, label: 'water' },
  { x0: 1.75, x1: 2.05, label: 'water' },
  { x0: 2.15, x1: 2.45, label: 'methane' },
  { x0: 2.6, x1: 2.95, label: 'water' },
  { x0: 3.15, x1: 3.5, label: 'methane' },
];

function spectrumHeadline(t: TargetInput): Headline {
  if (t.error) return notMeasured('spectrum', t.error);
  if (!t.spectrum) return notMeasured('spectrum', 'Measuring the light at each colour…');
  const good = t.spectrum.filter((c) => Number.isFinite(c.flux) && !c.weak);
  if (good.length < 3)
    return notMeasured('spectrum', `Only ${good.length} of 102 colours have a clear measurement, too few for a spectrum.`);
  const peak = good.reduce((a, b) => (b.flux > a.flux ? b : a));
  return {
    value: `Brightest at ${num(peak.lam, 2)} µm`,
    valueTip: 'The colour (wavelength) where the most light was measured, from the pixels.',
    pill: { text: 'measured', tone: '' },
    sub: `${good.length} of 102 ${term('colours', 'SPHEREx splits light into 102 narrow colours (channels), 17 per detector, from 0.75 to 5.0 µm.')} measured from the pixels of real exposures`,
    chart: 'spectrum',
    para:
      'Each point is the light at one of SPHEREx’s 102 colours, and it builds up as the pictures play. ' +
      `Cold failed stars absorb light where ${term('water', 'Water vapour in a cool atmosphere absorbs near 1.4, 1.9 and 2.7 µm.')} and ${term('methane', 'Methane forms only below about 1,500 K and absorbs near 2.2 and 3.3 µm.')} do, so look for dips in the shaded bands. The bands mark where the molecules absorb, not a model of this star.`,
  };
}

function stackHeadline(t: TargetInput): Headline {
  if (t.error) return notMeasured('cutouts', t.error);
  if (!t.stacks) return notMeasured('cutouts', 'Stacking the pictures along the catalogue motion…');
  const measured = t.stacks.filter((s) => Number.isFinite(s.along.snr));
  if (!measured.length)
    return notMeasured('cutouts', t.stacks[0]?.note || 'The stacks could not be measured.');
  const best = measured.reduce((a, b) => (b.along.snr > a.along.snr ? b : a));
  const seen = best.along.snr >= 5;
  const per = measured.map((s) => `D${s.det} ${num(s.along.snr, 1)}σ`).join(', ');
  return {
    value: `${num(best.along.snr, 1)}σ in D${best.det}`,
    valueTip: 'Signal-to-noise of the stacked picture at the target: how many times the noise its light stands out. 5σ or more is a clear detection.',
    pill: seen ? { text: 'seen only when stacked', tone: 'good' } : { text: 'not seen', tone: '' },
    sub: `${term('Stacked', 'Each exposure is shifted so the moving target stays put, then all are added. Something too faint for any one picture adds up.')} along the catalogue motion: ${esc(per)}`,
    chart: 'cutouts',
    para:
      'Too faint for any single picture, so every exposure of a detector is shifted along the catalogue motion and added. ' +
      'The two controls beside it are the same exposures not shifted, and shifted the opposite way: the target should show only in the first. ' +
      esc(best.note),
  };
}

function brightnessHeadline(t: TargetInput): Headline {
  if (t.error) return notMeasured('brightness', t.error);
  if (!t.curves) return notMeasured('brightness', 'Measuring the brightness on every exposure…');
  const shown = t.curves.filter((c) => c.shown && c.visits.length >= 2);
  if (!shown.length) {
    const why = t.curves.find((c) => c.note)?.note ?? 'No detector has two visits with a clean measurement.';
    return notMeasured('brightness', why);
  }
  const amp = (c: DetectorCurve) => {
    const v = c.visits.map((x) => x.dmag).filter(Number.isFinite);
    return v.length ? Math.max(...v) - Math.min(...v) : Number.NaN;
  };
  const best = shown.reduce((a, b) => (amp(b) > amp(a) ? b : a));
  const verdict = verdictOf(best.test);
  return {
    value: `${num(amp(best), 2)} mag`,
    valueTip: 'The biggest change in brightness between visit averages, in magnitudes: 1 mag is a factor of 2.5 in light, 0.1 mag about 10%. Each detector is compared only with itself.',
    pill:
      verdict === 'changed'
        ? { text: 'changed beyond noise', tone: '' }
        : verdict === 'steady'
          ? { text: 'steady within noise', tone: '' }
          : { text: 'not tested', tone: '' },
    sub: `Up to ${num(amp(best), 2)} mag change in D${best.det}, ${term('measured', 'From the pixels: the light in a fixed circle, or the outer glow when the star’s centre is saturated.')} between ${best.visits.length} visits`,
    chart: 'brightness',
    para:
      'Each point is one exposure, compared only with the same detector’s own average, with the star’s colour taken out. Squares are visit averages. ' +
      (best.note ? `${esc(best.note)} ` : '') +
      (t.target.period ? 'This star has a catalogue period: see its cycle under Folded.' : ''),
  };
}

/** The headline for a fixed spot (a candidate, a catalogue source or a tapped spot). */
export function spotHeadline(points: SpotPoint[] | null, det: number, error: string | null, test: Chi2 | null, mean: { mean: number; err: number } | null): Headline {
  if (error) return notMeasured('brightness', error);
  if (!points || !mean) return notMeasured('brightness', 'Measuring the light here on every exposure…');
  const mine = points.filter((p) => p.det === det);
  const ok = mine.filter((p) => !p.flagged && Number.isFinite(p.flux));
  if (!ok.length)
    return notMeasured('brightness', mine.length ? `All ${mine.length} exposures of D${det} have a flagged pixel in the circle here.` : `No exposure of D${det} covers this spot.`);
  const verdict = verdictOf(test);
  return {
    value: `${sig(mean.mean, 3)} µJy`,
    valueTip: 'The light in a fixed 25″ circle, averaged over the exposures (weighted by their errors), in microjanskys: a unit of brightness used for faint infrared light.',
    pill:
      verdict === 'changed'
        ? { text: 'changed beyond noise', tone: '' }
        : verdict === 'steady'
          ? { text: 'steady within noise', tone: '' }
          : { text: 'not tested', tone: '' },
    sub: `± ${sig(mean.err, 2)} µJy in D${det}, from ${ok.length} of ${mine.length} exposures${mine.length > ok.length ? ` (${mine.length - ok.length} left out: a flagged pixel in the circle)` : ''}`,
    chart: 'brightness',
    para: `The light in a fixed circle 2 pixels (12″) in radius, with the sky taken from a ring 6 to 12 pixels out, on every original exposure${test && Number.isFinite(test.p) ? `; noise alone would scatter it this much ${esc(chance(test.p))} times` : ''}. A moving source walks out of a fixed circle.`,
  };
}

/** A candidate's own lines, added above the spot's paragraph. */
export function candidateLines(c: Candidate): string {
  return `Found by the change search: ${esc(c.why)} It is a candidate to check, not a discovery.`;
}

/** The stats column for a target (MSR-3, H4): measured and catalogue values side by side. */
export function targetStats(t: Target, fit: MotionFit | null, visits: number, coords: (ra: number, dec: number) => [string, string]): StatRow[] {
  const ok = fit?.ok ? fit : null;
  const [ra, dec] = ok ? coords(ok.ra, ok.dec) : coords(t.ra, t.dec);
  const from = (t.values.split('(')[0] ?? t.values).trim();
  const rows: StatRow[] = [
    { name: 'RA', tip: ok ? `Right ascension, measured from the pixels (fitted position at ${num(ok.ep, 1)}): the sky’s longitude.` : `Right ascension from the catalogue at ${t.ep}: the sky’s longitude.`, value: ra, from: ok ? 'measured' : 'catalogue' },
    { name: 'Dec', tip: 'Declination: the sky’s latitude, from −90° to +90°.', value: dec, from: ok ? 'measured' : 'catalogue' },
    { name: 'Visits', tip: 'Survey passes with pictures of this spot. SPHEREx sees each spot a few times within days (a visit), about every six months.', value: String(visits), from: 'measured' },
    { name: 'Catalogue values from', tip: t.values, value: from.length > 22 ? `${from.slice(0, 21)}…` : from, from: 'catalogue' },
  ];
  if (t.plx !== null) {
    rows.push({ name: 'Parallax (catalogue)', tip: 'How much the star shifts as Earth goes round the Sun. Bigger is closer. SPHEREx’s few passes cannot measure it, so this is the catalogue’s.', value: `${num(t.plx, 0)} mas`, from: 'catalogue' });
    rows.push({ name: 'Distance (catalogue)', tip: 'One parsec is 3.26 light-years: 1000 divided by the catalogue parallax in mas.', value: `${num(1000 / t.plx, t.plx > 100 ? 2 : 0)} pc`, from: 'catalogue' });
  }
  rows.push(
    { name: 'Motion RA (measured)', tip: 'Motion east, measured from the pixels, arcseconds a year (times cos Dec, as catalogues give it).', value: ok ? `${num(ok.pmra / 1000, 2)} ± ${num(ok.pmraErr / 1000, 2)}″/yr` : NM, from: 'measured' },
    { name: 'Motion Dec (measured)', tip: 'Motion north, measured from the pixels, arcseconds a year.', value: ok ? `${num(ok.pmdec / 1000, 2)} ± ${num(ok.pmdecErr / 1000, 2)}″/yr` : NM, from: 'measured' },
    { name: 'Motion RA (catalogue)', tip: `Motion east from ${t.values}.`, value: `${num(t.pmra / 1000, 2)}″/yr`, from: 'catalogue' },
    { name: 'Motion Dec (catalogue)', tip: `Motion north from ${t.values}.`, value: `${num(t.pmdec / 1000, 2)}″/yr`, from: 'catalogue' },
  );
  return rows;
}
