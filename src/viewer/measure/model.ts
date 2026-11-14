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
  /** The detector the number is about; null when it uses every detector (motion, spectrum). */
  det: number | null;
  /** The detector where the number is strongest: Measure opens there (MSR-1). Null as `det`. */
  best: number | null;
  /** Still being worked out: no verdict yet, so no "Not measured" either. */
  pending?: boolean;
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
  /** The detector on screen. A brightness or stack headline is about this detector, so it
   *  always agrees with the chart under it; left out, the strongest detector. */
  det?: number;
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

function notMeasured(chart: MeasureTab, why: string, para = '', det: number | null = null, best: number | null = null, subHtml = ''): Headline {
  return {
    value: NM,
    valueTip: 'Sima could not measure this from the pixels. It never shows a catalogue or model value in its place.',
    pill: { text: 'not measured', tone: '' },
    sub: esc(why) + subHtml,
    chart,
    para,
    det,
    best,
  };
}

/** Still working: "Measuring…", never "Not measured" before an attempt has finished. */
function measuring(chart: MeasureTab, what: string): Headline {
  return {
    value: 'Measuring…',
    valueTip: 'Sima is working this out from the pixels now, in the background.',
    pill: { text: '', tone: '' },
    sub: esc(what),
    chart,
    para: '',
    det: null,
    best: null,
    pending: true,
  };
}

/** A one-click move to the detector a headline is strongest in (HTML). */
export function showDet(det: number, words = `Show D${det}`): string {
  return `<button type="button" class="link" data-do="det" data-det="${det}">${esc(words)}</button>`;
}

function motionHeadline(t: TargetInput): Headline {
  const f = t.fit;
  if (t.error) return notMeasured('path', t.error);
  if (!f) return measuring('path', 'Measuring the positions on every exposure…');
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
  const plx = f.parallax ? (f.parallax.shown ? ` Parallax measured ${num(f.parallax.value, 0)} ± ${num(f.parallax.err, 0)} mas.` : ` Parallax is not shown: ${esc(f.parallax.why.replace(/\.+$/, ''))}.`) : '';
  return {
    value: `${num(f.total, 2)}″/yr`,
    valueTip: `How far the star moves across the sky in a year, measured from the pixels: ${num(f.total, 2)} ± ${num(f.totalErr, 2)} arcseconds a year. An arcsecond is 1/3600 of a degree; one SPHEREx pixel is 6.15″.`,
    pill,
    sub: `${term(`Measured ±${num(f.totalErr, 2)}″`, 'The 1σ error: the true value is within this about two times in three.')} from the pixels of ${f.used} of ${f.of} real exposures${cat ? `, catalogue ${num(cat.total, 2)}″/yr` : ''}`,
    chart: 'path',
    para:
      // The line above already gives the value, its error and the exposures used; say only what it does not.
      `Moving ${pa || 'across the sky '}(each dot is one exposure; colours are survey passes).` +
      (cat ? ` The catalogue value is from ${esc(cat.source)}.` : ' There is no catalogue motion to compare with.') +
      plx +
      stab +
      ` The motion is from a ${term('straight-line fit', 'A weighted straight line through the positions against time, east and north. Points that scatter more than their errors widen the error.')}.`,
    det: null,
    best: null,
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
  if (!t.spectrum) return measuring('spectrum', 'Measuring the light at each colour…');
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
      'Each point is the light at one of SPHEREx’s 102 colours, building up as the pictures play. ' +
      `Cold failed stars absorb light where ${term('water', 'Water vapour in a cool atmosphere absorbs near 1.4, 1.9 and 2.7 µm.')} and ${term('methane', 'Methane forms only below about 1,500 K and absorbs near 2.2 and 3.3 µm.')} do: look for dips in the shaded bands (where they absorb, not a model of this star).`,
    det: null,
    best: null,
  };
}

function stackHeadline(t: TargetInput): Headline {
  if (t.error) return notMeasured('cutouts', t.error);
  if (!t.stacks) return measuring('cutouts', 'Stacking the pictures along the catalogue motion…');
  const measured = t.stacks.filter((s) => Number.isFinite(s.along.snr));
  if (!measured.length)
    return notMeasured('cutouts', t.stacks[0]?.note || 'The stacks could not be measured.');
  const best = measured.reduce((a, b) => (b.along.snr > a.along.snr ? b : a));
  const det = t.det ?? best.det;
  const per = measured.map((s) => `D${s.det} ${num(s.along.snr, 1)}σ`).join(', ');
  const stacked = `${term('Stacked', 'Each exposure is shifted so the moving target stays put, then all are added. Something too faint for any one picture adds up.')} along the catalogue motion: ${esc(per)}`;
  const toBest = det !== best.det ? `. Strongest in D${best.det}: ${showDet(best.det)}` : '';
  const mine = measured.find((s) => s.det === det);
  if (!mine) {
    const why = t.stacks.find((s) => s.det === det)?.note || `D${det} has no exposures of this spot.`;
    return notMeasured('cutouts', `Not measured in D${det}: ${why.replace(/\.+$/, '')}. `, '', det, best.det, `${stacked}${toBest}`);
  }
  const seen = mine.along.snr >= 5;
  return {
    value: `${num(mine.along.snr, 1)}σ in D${det}`,
    valueTip: 'Signal-to-noise of the stacked picture at the target: how many times the noise its light stands out. 5σ or more is a clear detection.',
    pill: seen ? { text: 'seen only when stacked', tone: 'good' } : { text: 'not seen', tone: '' },
    sub: `${stacked}${toBest}`,
    chart: 'cutouts',
    para:
      'Too faint for any single picture, so every exposure of a detector is shifted along the catalogue motion and added. ' +
      'Two controls, the same exposures not shifted and shifted the opposite way, should not show it. ' +
      neighbours(mine.note),
    det,
    best: best.det,
  };
}

/** A stack note with its list of neighbour names folded into a tooltip, so the paragraph stays short. */
export function neighbours(note: string): string {
  const m = /^(.*?)Listed neighbours fitted alongside, so their light is not counted: (.+?)\.?$/s.exec(note);
  if (!m) return esc(note);
  const names = m[2]!.split(', ');
  return `${esc(m[1]!)}${term(`${names.length} listed neighbour${names.length === 1 ? '' : 's'}`, names.join(', '))} fitted alongside, so their light is not counted.`;
}

function brightnessHeadline(t: TargetInput): Headline {
  if (t.error) return notMeasured('brightness', t.error);
  if (!t.curves) return measuring('brightness', 'Measuring the brightness on every exposure…');
  const shown = t.curves.filter((c) => c.shown && c.visits.length >= 2);
  if (!shown.length) {
    const why = t.curves.find((c) => c.note)?.note ?? 'No detector has two visits with a clean measurement.';
    return notMeasured('brightness', why);
  }
  const amp = (c: DetectorCurve) => {
    const v = c.visits.map((x) => x.dmag).filter(Number.isFinite);
    return v.length ? Math.max(...v) - Math.min(...v) : Number.NaN;
  };
  const top = shown.reduce((a, b) => (amp(b) > amp(a) ? b : a));
  const det = t.det ?? top.det;
  const best = shown.find((c) => c.det === det);
  const toBest = det !== top.det ? ` Biggest in D${top.det}, ${num(amp(top), 2)} mag: ${showDet(top.det)}` : '';
  if (!best) {
    const c = t.curves.find((x) => x.det === det);
    const why = c?.note ?? (c ? 'it has fewer than two visits with a clean measurement' : 'no exposure of this detector has a clean measurement');
    return notMeasured('brightness', `Not measured in D${det}: ${why.replace(/\.+$/, '')}.`, '', det, top.det, toBest);
  }
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
    sub: `Up to ${num(amp(best), 2)} mag change in D${best.det}, ${term('measured', 'From the pixels: the light in a fixed circle, or the outer glow when the star’s centre is saturated.')} between ${best.visits.length} visits.${toBest}`,
    chart: 'brightness',
    para:
      // The chart shows the detector on screen; its own note (glow, widened errors, Folded) is
      // written under the chart (detail.ts).
      'Each point is one exposure, compared only with the same detector’s own average, with the star’s colour taken out. Squares are visit averages.',
    det: best.det,
    best: top.det,
  };
}

/** The headline for a fixed spot (a candidate, a catalogue source or a tapped spot). */
export function spotHeadline(points: SpotPoint[] | null, det: number, error: string | null, test: Chi2 | null, mean: { mean: number; err: number } | null): Headline {
  if (error) return notMeasured('brightness', error);
  if (!points || !mean) return measuring('brightness', 'Measuring the light here on every exposure…');
  const mine = points.filter((p) => p.det === det);
  const ok = mine.filter((p) => !p.flagged && Number.isFinite(p.flux));
  if (!ok.length)
    return notMeasured('brightness', mine.length ? `All ${mine.length} exposures of D${det} have a flagged pixel in the circle here.` : `No exposure of D${det} covers this spot.`, '', det, null);
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
    det,
    best: null,
  };
}

/**
 * The line under Path for the target (MSR-3): the fitted total motion with its error, labelled
 * measured, next to the catalogue's, named (H4). Not measured says why (H5). HTML.
 */
export function pathLine(t: Target, fit: MotionFit | null): string {
  const named = fit?.catalogue?.source ?? ((t.values.split('(')[0] ?? t.values).trim() || 'the catalogue');
  const catTotal = fit?.catalogue?.total ?? Math.hypot(t.pmra, t.pmdec) / 1000;
  const cat = Number.isFinite(catTotal) && catTotal > 0 ? ` ${term('Catalogue', `From ${t.values}.`)}: ${num(catTotal, 2)}″/yr (${esc(named)}), the dashed amber line.` : '';
  if (!fit) return `Measuring the positions on every exposure…${cat}`;
  if (!fit.ok) return `Motion not measured: ${esc((fit.reason ?? 'the positions could not be fitted').replace(/\.+$/, ''))}.${cat}`;
  return (
    `<b>${term('Measured', 'Fitted from the positions Sima measured on the pixels: a weighted straight line, east and north, against time.')}: ${num(fit.total, 2)} ± ${num(fit.totalErr, 2)}″/yr</b>` +
    ` from ${fit.used} of ${fit.of} exposures, the solid line.${cat}`
  );
}

/** A mover from the change search, under its Path chart: measured total, and the catalogue's if known. HTML. */
export function moverLine(c: Candidate, det: number): string {
  if (!c.motion) return 'Its motion was not measured.';
  const cat = c.known?.cat === 'gaia' ? 'Gaia DR3' : c.known?.cat === 'catwise' ? 'CatWISE2020' : c.known ? 'the target’s catalogue' : '';
  return (
    `<b>${term('Measured', 'Fitted from the positions Sima measured on the pixels of this detector: a weighted straight line, east and north, against time.')}: ${num(c.motion.total, 2)} ± ${num(c.motion.totalErr, 2)}″/yr</b>` +
    ` from ${c.path?.length ?? 0} positions in D${det}, the solid line.` +
    (c.known?.pmTotal != null ? ` ${term('Catalogue', `${cat}: ${c.known.id}.`)}: ${num(c.known.pmTotal, 2)}″/yr (${esc(cat)}).` : c.known ? ` ${esc(cat)} gives no motion for it.` : ' No Gaia DR3 or CatWISE2020 source here, so nothing to compare with.')
  );
}

/** A candidate's own lines, added above the spot's paragraph. */
export function candidateLines(c: Candidate): string {
  return `Found by the change search: ${esc(c.why)} It is a candidate to check, not a discovery.`;
}

/** The stats column for a target (MSR-3, H4): measured and catalogue values side by side. */
export function targetStats(t: Target, fit: MotionFit | null, visits: number, coords: (ra: number, dec: number) => [string, string]): StatRow[] {
  const ok = fit?.ok ? fit : null;
  const [ra, dec] = ok ? coords(ok.ra, ok.dec) : coords(t.ra, t.dec);
  // A source given as a SPEC rule is not a catalogue a reader knows; the tip keeps the full text.
  const named = (t.values.split('(')[0] ?? t.values).trim();
  const from = named.startsWith('SPEC') ? 'published values' : named;
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
    { name: 'Motion (measured)', tip: 'Total motion across the sky, measured from the pixels: the straight-line fit of the positions, with its 1σ error.', value: ok ? `${num(ok.total, 2)} ± ${num(ok.totalErr, 2)}″/yr` : NM, from: 'measured' },
    { name: 'Motion RA (measured)', tip: 'Motion east, measured from the pixels, arcseconds a year (times cos Dec, as catalogues give it).', value: ok ? `${num(ok.pmra / 1000, 2)} ± ${num(ok.pmraErr / 1000, 2)}″/yr` : NM, from: 'measured' },
    { name: 'Motion Dec (measured)', tip: 'Motion north, measured from the pixels, arcseconds a year.', value: ok ? `${num(ok.pmdec / 1000, 2)} ± ${num(ok.pmdecErr / 1000, 2)}″/yr` : NM, from: 'measured' },
    { name: 'Motion (catalogue)', tip: `Total motion across the sky from ${t.values}.`, value: `${num(Math.hypot(t.pmra, t.pmdec) / 1000, 2)}″/yr`, from: 'catalogue' },
    { name: 'Motion RA (catalogue)', tip: `Motion east from ${t.values}.`, value: `${num(t.pmra / 1000, 2)}″/yr`, from: 'catalogue' },
    { name: 'Motion Dec (catalogue)', tip: `Motion north from ${t.values}.`, value: `${num(t.pmdec / 1000, 2)}″/yr`, from: 'catalogue' },
  );
  return rows;
}
