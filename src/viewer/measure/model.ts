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
import { t as tr } from '../../shell/i18n.ts';

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

const NM = tr('honest.notMeasured');

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
    valueTip: tr('hl.nmTip'),
    pill: { text: tr('ms.nm'), tone: '' },
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
    value: tr('hl.measuring'),
    valueTip: tr('hl.measuringTip'),
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
export function showDet(det: number, words = tr('hl.showDet', { det: `D${det}` })): string {
  return `<button type="button" class="link" data-do="det" data-det="${det}">${esc(words)}</button>`;
}

function motionHeadline(t: TargetInput): Headline {
  const f = t.fit;
  if (t.error) return notMeasured('path', t.error);
  if (!f) return measuring('path', tr('hl.measuringPositions'));
  if (!f.ok) return notMeasured('path', f.reason ?? tr('hl.noFit'));
  const cat = f.catalogue;
  const pill: Headline['pill'] =
    f.matches === true
      ? { text: tr('hl.matches'), tone: 'good' }
      : f.matches === false
        ? { text: tr('hl.differs'), tone: 'warn' }
        : { text: tr('hl.measured'), tone: '' };
  const pa = Number.isFinite(f.pa) ? `${tr('hl.toward')} ${term(tr('hl.pa', { deg: `${Math.round(f.pa)}°` }), tr('hl.paTip'))} ` : '';
  const stab = Number.isFinite(f.stability)
    ? ` ${f.stability > f.totalErr ? tr('hl.unstable') : tr('hl.stable')}: ${term(tr('hl.leaveOut', { visits: f.visits, by: `±${num(f.stability, 2)}″` }), tr('hl.leaveOutTip'))}.`
    : '';
  const plx = f.parallax ? (f.parallax.shown ? ` ${tr('hl.plx', { v: `${num(f.parallax.value, 0)} ± ${num(f.parallax.err, 0)} mas` })}` : ` ${tr('hl.plxHidden', { why: esc(f.parallax.why.replace(/\.+$/, '')) })}`) : '';
  return {
    value: `${num(f.total, 2)}″/yr`,
    valueTip: tr('hl.motionTip', { v: `${num(f.total, 2)} ± ${num(f.totalErr, 2)}` }),
    pill,
    sub: `${term(`±${num(f.totalErr, 2)}″`, tr('hl.errTip'))} · ${tr('hl.usedOf', { used: f.used, of: f.of })}${cat ? ` · ${tr('hl.catalogueV', { v: `${num(cat.total, 2)}″/yr` })}` : ''}`,
    chart: 'path',
    para:
      // The line above already gives the value, its error and the exposures used; say only what it does not.
      `${tr('hl.moving')} ${pa || tr('hl.acrossSky') + ' '}${tr('hl.dots')}` +
      (cat ? ` ${tr('hl.catFrom', { source: esc(cat.source) })}` : ` ${tr('hl.noCat')}`) +
      plx +
      stab +
      ` ${tr('hl.fitFrom')} ${term(tr('hl.fit'), tr('hl.fitTip'))}.`,
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
    return notMeasured('spectrum', tr('hl.fewColours', { n: good.length }));
  const peak = good.reduce((a, b) => (b.flux > a.flux ? b : a));
  return {
    value: tr('hl.brightestAt', { lam: `${num(peak.lam, 2)} µm` }),
    valueTip: tr('hl.brightestTip'),
    pill: { text: tr('hl.measured'), tone: '' },
    sub: `${tr('hl.nOf102', { n: good.length })} ${term(tr('hl.colours'), tr('hl.coloursTip'))} ${tr('hl.fromPixels')}`,
    chart: 'spectrum',
    para:
      `${tr('hl.specPara1')} ` +
      `${tr('hl.specPara2')} ${term(tr('hl.water'), tr('hl.waterTip'))} ${tr('hl.and')} ${term(tr('hl.methane'), tr('hl.methaneTip'))} ${tr('hl.specPara3')}`,
    det: null,
    best: null,
  };
}

function stackHeadline(t: TargetInput): Headline {
  if (t.error) return notMeasured('cutouts', t.error);
  if (!t.stacks) return measuring('cutouts', tr('hl.stacking'));
  const measured = t.stacks.filter((s) => Number.isFinite(s.along.snr));
  if (!measured.length)
    return notMeasured('cutouts', t.stacks[0]?.note || tr('hl.noStacks'));
  const best = measured.reduce((a, b) => (b.along.snr > a.along.snr ? b : a));
  const det = t.det ?? best.det;
  const per = measured.map((s) => `D${s.det} ${num(s.along.snr, 1)}σ`).join(', ');
  const stacked = `${term(tr('hl.stacked'), tr('hl.stackedTip'))} ${tr('hl.alongCat')}: ${esc(per)}`;
  const toBest = det !== best.det ? `. ${tr('hl.strongest', { det: `D${best.det}` })}: ${showDet(best.det)}` : '';
  const mine = measured.find((s) => s.det === det);
  if (!mine) {
    const why = t.stacks.find((s) => s.det === det)?.note || tr('hl.noExpSpot', { det: `D${det}` });
    return notMeasured('cutouts', `${tr('hl.nmIn', { det: `D${det}`, why: why.replace(/\.+$/, '') })} `, '', det, best.det, `${stacked}${toBest}`);
  }
  const seen = mine.along.snr >= 5;
  return {
    value: tr('hl.snrIn', { v: `${num(mine.along.snr, 1)}σ`, det: `D${det}` }),
    valueTip: tr('hl.snrTip'),
    pill: seen ? { text: tr('hl.seenStacked'), tone: 'good' } : { text: tr('hl.notSeen'), tone: '' },
    sub: `${stacked}${toBest}`,
    chart: 'cutouts',
    para:
      `${tr('hl.stackPara')} ` +
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
  if (!t.curves) return measuring('brightness', tr('hl.measuringBright'));
  const shown = t.curves.filter((c) => c.shown && c.visits.length >= 2);
  if (!shown.length) {
    const why = t.curves.find((c) => c.note)?.note ?? tr('hl.noTwoVisits');
    return notMeasured('brightness', why);
  }
  const amp = (c: DetectorCurve) => {
    const v = c.visits.map((x) => x.dmag).filter(Number.isFinite);
    return v.length ? Math.max(...v) - Math.min(...v) : Number.NaN;
  };
  const top = shown.reduce((a, b) => (amp(b) > amp(a) ? b : a));
  const det = t.det ?? top.det;
  const best = shown.find((c) => c.det === det);
  const toBest = det !== top.det ? ` ${tr('hl.biggest', { det: `D${top.det}`, v: `${num(amp(top), 2)} mag` })}: ${showDet(top.det)}` : '';
  if (!best) {
    const c = t.curves.find((x) => x.det === det);
    const why = c?.note ?? (c ? tr('hl.fewVisits') : tr('hl.noCleanDet'));
    return notMeasured('brightness', `${tr('hl.nmIn', { det: `D${det}`, why: why.replace(/\.+$/, '') })}`, '', det, top.det, toBest);
  }
  const verdict = verdictOf(best.test);
  return {
    value: `${num(amp(best), 2)} mag`,
    valueTip: tr('hl.ampTip'),
    pill:
      verdict === 'changed'
        ? { text: tr('hl.changed'), tone: '' }
        : verdict === 'steady'
          ? { text: tr('hl.steady'), tone: '' }
          : { text: tr('hl.untested'), tone: '' },
    sub: `${tr('hl.upTo', { v: `${num(amp(best), 2)} mag`, det: `D${best.det}` })} ${term(tr('hl.measured'), tr('hl.measuredGlowTip'))} ${tr('hl.betweenVisits', { n: best.visits.length })}${toBest}`,
    chart: 'brightness',
    para:
      // The chart shows the detector on screen; its own note (glow, widened errors, Folded) is
      // written under the chart (detail.ts).
      tr('hl.brightPara'),
    det: best.det,
    best: top.det,
  };
}

/** The headline for a fixed spot (a candidate, a catalogue source or a tapped spot). */
export function spotHeadline(points: SpotPoint[] | null, det: number, error: string | null, test: Chi2 | null, mean: { mean: number; err: number } | null): Headline {
  if (error) return notMeasured('brightness', error);
  if (!points || !mean) return measuring('brightness', tr('hl.measuringHere'));
  const mine = points.filter((p) => p.det === det);
  const ok = mine.filter((p) => !p.flagged && Number.isFinite(p.flux));
  if (!ok.length)
    return notMeasured('brightness', mine.length ? tr('hl.allFlagged', { n: mine.length, det: `D${det}` }) : tr('hl.noCover', { det: `D${det}` }), '', det, null);
  const verdict = verdictOf(test);
  return {
    value: `${sig(mean.mean, 3)} µJy`,
    valueTip: tr('hl.spotTip'),
    pill:
      verdict === 'changed'
        ? { text: tr('hl.changed'), tone: '' }
        : verdict === 'steady'
          ? { text: tr('hl.steady'), tone: '' }
          : { text: tr('hl.untested'), tone: '' },
    sub: `${tr('hl.spotSub', { err: `± ${sig(mean.err, 2)} µJy`, det: `D${det}`, ok: ok.length, of: mine.length })}${mine.length > ok.length ? ` ${tr('hl.leftOut', { n: mine.length - ok.length })}` : ''}`,
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
export function moverLine(c: Candidate, det: number, targetValues = ''): string {
  if (!c.motion) return 'Its motion was not measured.';
  const named = (targetValues.split('(')[0] ?? '').trim();
  const cat = c.known?.cat === 'gaia' ? 'Gaia DR3' : c.known?.cat === 'catwise' ? 'CatWISE2020' : c.known ? named || 'the target’s catalogue' : '';
  return (
    `<b>${term('Measured', 'Fitted from the positions Sima measured on the pixels of this detector: a weighted straight line, east and north, against time.')}: ${num(c.motion.total, 2)} ± ${num(c.motion.totalErr, 2)}″/yr</b>` +
    ` from ${c.path?.length ?? 0} position${c.path?.length === 1 ? '' : 's'} in D${det}, the solid line.` +
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
    { name: 'Catalogue values from', tip: t.values, value: from, from: 'catalogue' },
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
