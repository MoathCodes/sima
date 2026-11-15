/**
 * Reading the places catalogue (src/data/places.json, schema in src/data/schema.ts): names, the
 * kind in plain words, and every fact a card, a list row or a tour note shows, worded for a
 * newcomer. Owner: lane G.
 *
 * Pure functions: no page, no fetch. The tests run them on the real catalogue.
 *
 * Honesty (SPEC H4, H9): every fact here is read from the catalogue and says which source gave
 * it. A missing fact gives `null`, and the caller leaves its row out. Nothing is filled from
 * memory. The only words added are plain explanations of a value (what a magnitude means to the
 * eye, what a galaxy shape code stands for).
 */
import { PIXEL_ARCSEC } from '../core/instrument.ts';
import type { Place, PlaceKind, PlaceSource, PlacesCatalogue } from '../data/schema.ts';
import type { Say, TourStop } from '../data/tours.ts';

/** A fact's source key in `Place.sources`. */
export type FactKey = keyof Place['sources'];

/** One row of a card's facts table. */
export interface Fact {
  /** The row's label: "How far". */
  label: string;
  /** The value in plain words: "About 37 million light-years". */
  value: string;
  /** A smaller line under it: how it was worked out, and who says so. */
  detail?: string;
}

// ----- Names ----------------------------------------------------------------------------------

/** Catalogue prefixes that make a name a catalogue number, not a common name. */
const CATALOGUE_WORDS = new Set([
  'gliese',
  'ross',
  'wolf',
  'lacaille',
  'lalande',
  'groombridge',
  'struve',
  'stein',
  'kruger',
  'luyten',
  'messier',
  'barnard',
  'collinder',
  'melotte',
  'trumpler',
  'stock',
  'ruprecht',
  'sharpless',
  'abell',
]);

/** SIMBAD's own markers before a name: "* alf Tau", "NAME Barnard's star", "V* R Dra". */
const SIMBAD_PREFIX = /^(?:NAME|\*\*|\*|V\*|Cl|EM\*|PN|SNR|Ass|GIC)\s+/;

/** A catalogue name as people write it: SIMBAD's markers dropped, spacing tidied. */
export function cleanName(name: string): string {
  return name.replace(SIMBAD_PREFIX, '').replace(/\s+/g, ' ').trim();
}

/**
 * True when a place has a common name a person would say ("Sombrero Galaxy", "Errai",
 * "Barnard's Star"), false when every name is a catalogue number ("2M 0746+20 b",
 * "LDN 1689"). A name with a digit counts as a number unless it also has a proper word
 * ("61 Cygni" has one; "Wolf 359" does not, as Wolf is a catalogue).
 */
export function hasCommonName(p: Place): boolean {
  const n = p.names.common;
  if (!n) return false;
  if (TARGET_KEYS.has(p.id)) return true; // the five challenge targets go by their own names
  if (!/\d/.test(n)) return true;
  const words = n.match(/\p{Lu}\p{Ll}{3,}/gu) ?? [];
  return words.some((w) => !CATALOGUE_WORDS.has(w.toLowerCase()));
}

const TARGET_KEYS = new Set(['barnard', 'eps-indi-b', 'wise-0855', 'rw-aur', 'r-dra']);

/** SIMBAD's three-letter Bayer abbreviations and the Greek letters people write. */
const GREEK: Record<string, string> = {
  alf: 'α', bet: 'β', gam: 'γ', del: 'δ', eps: 'ε', zet: 'ζ', eta: 'η', tet: 'θ',
  iot: 'ι', kap: 'κ', lam: 'λ', mu: 'μ', nu: 'ν', ksi: 'ξ', omi: 'ο', pi: 'π',
  rho: 'ρ', sig: 'σ', tau: 'τ', ups: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', ome: 'ω',
};
const SUPER = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/**
 * A name as it is shown: SIMBAD's Bayer short form ("alf Mon", "alf02 Lib") in its Greek letter
 * ("α Mon", "α² Lib"), as star charts write it (UX audit #12). Search still reads both.
 */
export function shownName(name: string): string {
  return cleanName(name).replace(
    /^(alf|bet|gam|del|eps|zet|eta|tet|iot|kap|lam|mu\.?|nu\.?|ksi|omi|pi\.?|rho|sig|tau|ups|phi|chi|psi|ome)(0?\d)?(?= )/,
    (_, g: string, n?: string) =>
      GREEK[g.replace('.', '')]! + (n ? [...String(Number(n))].map((d) => SUPER[Number(d)]).join('') : ''),
  );
}

/** The name a place goes by: its common name, else its first catalogue name, tidied. */
export function nameOf(p: Place): string {
  return shownName(p.names.common ?? p.names.catalogue[0] ?? p.simbad);
}

/** Other names worth showing ("Also called"): catalogue names, tidied, without repeats. */
export function otherNames(p: Place, max = 6): string[] {
  const own = squash(nameOf(p));
  const seen = new Set([own]);
  const out: string[] = [];
  for (const raw of p.names.catalogue) {
    const n = shownName(raw);
    const key = squash(n);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[\s'’]+/g, '');
}

/** Tidies text from the catalogue: no space before punctuation ("Pleiades )" → "Pleiades)"). */
export function tidy(text: string): string {
  return text
    .replace(/\s+([.,;:!?)\]])/g, '$1')
    .replace(/\s+(['’]s)\b/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// ----- Kinds ----------------------------------------------------------------------------------

/** The kind in plain words, as the catalogue names it ("Spiral galaxy"). */
export function kindOf(cat: PlacesCatalogue, p: Place): string {
  return cat.kinds[p.kind];
}

/** The line a list row or search hit shows under the name: kind, then how far. */
export function rowLine(cat: PlacesCatalogue, p: Place): string {
  const far = p.distance ? shortDistance(p.distance.ly) : null;
  return [kindOf(cat, p), far].filter(Boolean).join(' · ');
}

// ----- Sources --------------------------------------------------------------------------------

/** The sources behind one fact, resolved from the catalogue's dictionary. */
export function sourcesOf(cat: PlacesCatalogue, p: Place, key: FactKey): PlaceSource[] {
  return (p.sources[key] ?? [])
    .map((i) => cat.sources[i])
    .filter((s): s is PlaceSource => s !== undefined);
}

/** A source's short name, without its licence: "OpenNGC (CC BY-SA 4.0)" → "OpenNGC". */
export function shortSource(s: PlaceSource): string {
  return s.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** "SIMBAD and OpenNGC": the short names of a fact's sources. */
export function sourceWords(cat: PlacesCatalogue, p: Place, key: FactKey): string {
  const names = [...new Set(sourcesOf(cat, p, key).map(shortSource))];
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** Every source a card names at its foot, each once, in a stable order. */
export function allSources(cat: PlacesCatalogue, p: Place): PlaceSource[] {
  const seen = new Set<number>();
  const out: PlaceSource[] = [];
  for (const list of Object.values(p.sources)) {
    for (const i of list ?? []) {
      const s = cat.sources[i];
      if (s && !seen.has(i)) {
        seen.add(i);
        out.push(s);
      }
    }
  }
  return out;
}

// ----- Numbers in words ----------------------------------------------------------------------

/** Two significant figures, with thousands separators: 36757823 → "37", scale "million". */
function scaled(ly: number): { n: number; unit: '' | ' million' | ' billion' } {
  if (ly >= 1e9) return { n: ly / 1e9, unit: ' billion' };
  if (ly >= 1e6) return { n: ly / 1e6, unit: ' million' };
  return { n: ly, unit: '' };
}

/** A number to two significant figures, in words people read: 5.958 → "6.0", 36.7 → "37". */
export function twoFigures(n: number): string {
  if (n === 0) return '0';
  const digits = Math.max(0, 1 - Math.floor(Math.log10(Math.abs(n))));
  const rounded = Number(n.toPrecision(2));
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(digits, 1),
    maximumFractionDigits: Math.min(digits, 1),
  });
}

/** "37 million light-years", "6.0 light-years", "1,500 light-years". */
export function shortDistance(ly: number): string {
  const { n, unit } = scaled(ly);
  return `${twoFigures(n)}${unit} light-years`;
}

/** The distance row (PLC-5): the middle of the listed measurements, and their spread. */
export function distanceFact(cat: PlacesCatalogue, p: Place): Fact | null {
  const d = p.distance;
  if (!d) return null;
  const who = sourceWords(cat, p, 'distance') || 'the catalogue';
  const { unit } = scaled(d.ly);
  const div = unit === ' billion' ? 1e9 : unit === ' million' ? 1e6 : 1;
  const range = `${twoFigures(d.low / div)} to ${twoFigures(d.high / div)}${unit} light-years`;
  let detail: string;
  if (d.measurements <= 1) {
    detail = `One measurement, listed in ${who}.`;
  } else if (d.disagree) {
    detail = `The middle of ${d.measurements} measurements listed in ${who}. Studies disagree: from about ${range}.`;
  } else {
    detail = `The middle of ${d.measurements} measurements listed in ${who}, from about ${range}.`;
  }
  return { label: 'How far', value: `About ${shortDistance(d.ly)}`, detail };
}

/** A magnitude to one decimal, with a true minus sign. */
export function magnitude(v: number): string {
  return v.toFixed(1).replace('-', '−');
}

/** The brightness row: the magnitude, its band, and what it means to the eye (V band only). */
export function brightnessFact(cat: PlacesCatalogue, p: Place): Fact | null {
  const m = p.magnitude;
  if (!m) return null;
  const who = sourceWords(cat, p, 'magnitude');
  const value = `Magnitude ${magnitude(m.value)}`;
  if (m.band === 'K') {
    return {
      label: 'Brightness',
      value,
      detail: `In near-infrared light (K band, 2.2 µm)${who ? `, from ${who}` : ''}. Smaller numbers are brighter.`,
    };
  }
  const eye =
    m.value <= 4
      ? 'easy to see by eye'
      : m.value <= 6
        ? 'seen by eye from a dark place'
        : m.value <= 9
          ? 'needs binoculars or a small telescope'
          : 'needs a telescope';
  return {
    label: 'Brightness',
    value: `${value}: ${eye}`,
    detail: `In visible light (V band)${who ? `, from ${who}` : ''}. Smaller numbers are brighter.`,
  };
}

/** The size row: how big it looks on the sky, in arcminutes. */
export function sizeFact(cat: PlacesCatalogue, p: Place): Fact | null {
  const s = p.size;
  if (!s) return null;
  const who = sourceWords(cat, p, 'size');
  const fmt = (x: number) => (x >= 10 ? x.toFixed(0) : x.toFixed(1));
  const value =
    s.minor !== undefined && Math.abs(s.minor - s.major) / s.major > 0.1
      ? `${fmt(s.major)}′ by ${fmt(s.minor)}′`
      : `${fmt(s.major)}′ across`;
  return {
    label: 'Size on the sky',
    value,
    detail: `${who ? `From ${who}. ` : ''}The full Moon is about 30′ across.`,
  };
}

/** Galaxy shape codes (Hubble classes, as OpenNGC writes them) in plain words. */
export function shapeWords(code: string): string | null {
  const c = code.trim();
  if (/^E\d?/.test(c)) return 'elliptical: a smooth oval with no arms';
  if (/^S0|^SB0|^SA0/.test(c)) return 'lens-shaped: a disc with no clear arms';
  if (/^SB/.test(c)) return 'barred spiral: arms start from a bar through the middle';
  if (/^S(A|AB)?[abcdm]/.test(c)) {
    const t = c.replace(/^S(A|AB)?/, '')[0];
    if (t === 'a') return 'spiral with tightly wound arms and a big bright middle';
    if (t === 'b') return 'spiral with fairly open arms';
    if (t === 'c' || t === 'd') return 'spiral with loose, open arms and a small middle';
    if (t === 'm') return 'loose spiral, close to irregular';
  }
  if (/^I/.test(c)) return 'irregular: no clear shape';
  return null;
}

/** The shape row, for galaxies with an OpenNGC class. */
export function shapeFact(cat: PlacesCatalogue, p: Place): Fact | null {
  if (!p.morphology) return null;
  const words = shapeWords(p.morphology);
  const who = sourceWords(cat, p, 'morphology');
  return {
    label: 'Shape',
    value: words ? `${p.morphology}: ${words}` : p.morphology,
    detail: who ? `Class from ${who}.` : undefined,
  };
}

/** Total motion across the sky, arcseconds a year, or null. */
export function motionPerYear(p: Place): number | null {
  const pm = p.properMotion;
  return pm ? Math.hypot(pm.ra, pm.dec) / 1000 : null;
}

/** The motion row: only when it is big enough to mean something (over 0.1″ a year). */
export function motionFact(cat: PlacesCatalogue, p: Place): Fact | null {
  const v = motionPerYear(p);
  if (v === null || v < 0.1) return null;
  const who = sourceWords(cat, p, 'properMotion');
  const px = v / 6.15; // SPHEREx pixels are 6.15″ (SPEC 7.1 rule 10)
  return {
    label: 'Moves across the sky',
    value: `${v.toFixed(2)}″ a year`,
    detail: `${who ? `From ${who}. ` : ''}That is ${px >= 0.1 ? px.toFixed(1) : 'under 0.1'} SPHEREx pixels a year.`,
  };
}

/** The "Also called" row. */
export function namesFact(p: Place): Fact | null {
  const names = otherNames(p);
  return names.length ? { label: 'Also called', value: names.join(', ') } : null;
}

/** Every row of a card's facts table, in order, leaving out what the catalogue lacks (H9). */
export function facts(cat: PlacesCatalogue, p: Place): Fact[] {
  return [
    distanceFact(cat, p),
    brightnessFact(cat, p),
    sizeFact(cat, p),
    shapeFact(cat, p),
    motionFact(cat, p),
    namesFact(p),
  ].filter((f): f is Fact => f !== null);
}

/** The Arabic name line: the name, its transliteration and meaning, and whether it is a label. */
export interface ArabicName {
  /** "Arabic name" for a traditional star name, "Arabic label" for a Wikidata label. */
  label: string;
  arabic: string;
  /** "ad-Dabarān, “the Follower (of the Pleiades)”". */
  gloss?: string;
  source: string;
}

export function arabicOf(cat: PlacesCatalogue, p: Place): ArabicName | null {
  const ar = p.names.arabic;
  if (!ar) return null;
  const source = sourceWords(cat, p, 'arabic');
  const traditional = !/wikidata/i.test(source);
  const parts = [
    p.names.transliteration && tidy(p.names.transliteration),
    p.names.meaning && `“${tidy(p.names.meaning)}”`,
  ].filter(Boolean);
  return {
    label: traditional ? 'Arabic name' : 'Arabic label',
    arabic: ar,
    gloss: parts.length ? parts.join(', ') : undefined,
    source,
  };
}

// ----- What to look for -----------------------------------------------------------------------

/** What to try in the frame, by kind. Instructions only: no claim about the object (H9). */
const TRY: Partial<Record<PlaceKind, string>> = {
  'variable-star':
    'Its catalogue class is a changing star. Play the dates and compare how bright it looks.',
  'brown-dwarf': 'Try the longer wavelengths on the bar, then play the dates and compare.',
  'fast-star': 'Play the dates and watch whether it shifts against the stars around it.',
  'nearby-star': 'Play the dates and watch whether it shifts against the stars around it.',
  'spiral-galaxy': 'Slide the wavelength from short to long and compare how it looks.',
  'elliptical-galaxy': 'Slide the wavelength from short to long and compare how it looks.',
  galaxy: 'Slide the wavelength from short to long and compare how it looks.',
  'emission-nebula': 'Slide the wavelength and compare how the cloud looks at each one.',
  'reflection-nebula': 'Slide the wavelength and compare how the cloud looks at each one.',
  'dark-nebula': 'Slide the wavelength: compare the dark patch at short and long wavelengths.',
  'planetary-nebula': 'Slide the wavelength and compare how the shell looks at each one.',
  'supernova-remnant': 'Slide the wavelength and compare how it looks at each one.',
  'open-cluster': 'Slide the wavelength and compare which stars stand out.',
  'globular-cluster': 'Slide the wavelength and compare which stars stand out.',
  star: 'Slide the wavelength and compare how bright it looks.',
};

/** Where the ice wavelengths below come from (H9): the SPHEREx team's page on ices. */
export const ICE_SOURCE: PlaceSource = {
  name: 'SPHEREx mission, Caltech',
  url: 'https://spherex.caltech.edu/page/the-origin-of-water-in-planetary-systems',
};
/** Clouds, where the SPHEREx team looks for ices. */
const ICE_KINDS: ReadonlySet<PlaceKind> = new Set([
  'dark-nebula',
  'emission-nebula',
  'reflection-nebula',
]);
/** Kinds whose catalogue motion is the star's own. */
const STAR_KINDS: ReadonlySet<PlaceKind> = new Set([
  'star',
  'variable-star',
  'brown-dwarf',
  'fast-star',
  'nearby-star',
]);

/** A "what to try" note, and the source of any fact it states that the card does not list. */
export interface SpherexNote {
  text: string;
  fromCatalogue: boolean;
  source?: PlaceSource;
}

/**
 * The "In SPHEREx" note: the catalogue's own note when it has one (it says where it comes from
 * and that it is not a SPHEREx measurement); else a thing to try, made for this place only from
 * named facts: its catalogue motion in SPHEREx pixels (stars), or the wavelengths where the
 * SPHEREx team looks for ices (clouds). Otherwise the kind's general thing to try.
 */
export function spherexNote(cat: PlacesCatalogue, p: Place): SpherexNote | null {
  if (p.inSpherex) return { text: tidy(p.inSpherex), fromCatalogue: true };
  const t = TRY[p.kind];
  if (ICE_KINDS.has(p.kind)) {
    return {
      text:
        'The SPHEREx team looks for ices in clouds of gas and dust by how they absorb the light of stars behind them: water ice near 3.05 µm, carbon dioxide ice near 4.27 µm. ' +
        'Set the wavelength to each and compare the stars seen through the cloud with those around it.',
      fromCatalogue: false,
      source: ICE_SOURCE,
    };
  }
  if (p.properMotion && STAR_KINDS.has(p.kind)) {
    const motion = Math.hypot(p.properMotion.ra, p.properMotion.dec) / 1000; // arcsec a year
    const px = motion / PIXEL_ARCSEC;
    const lead = `${sourceWords(cat, p, 'properMotion') || 'The catalogue'} lists ${motion.toFixed(motion < 0.1 ? 3 : 2)}″ a year of motion`;
    const text =
      px >= 0.3
        ? `${lead}: about ${px.toFixed(1)} SPHEREx pixels a year. Play the dates and watch it shift against the stars around it.`
        : `${lead}: under a third of a SPHEREx pixel (${PIXEL_ARCSEC}″) a year, so it should look still when you play the dates.${t ? ` ${t}` : ''}`;
    return { text, fromCatalogue: false };
  }
  return t ? { text: t, fromCatalogue: false } : null;
}

// ----- Picking places -------------------------------------------------------------------------

/** "Best known first": tier, then a common name, then brighter, then by name. */
export function bestKnownFirst(a: Place, b: Place): number {
  return (
    a.tier - b.tier ||
    Number(hasCommonName(b)) - Number(hasCommonName(a)) ||
    (a.magnitude?.value ?? 99) - (b.magnitude?.value ?? 99) ||
    nameOf(a).localeCompare(nameOf(b))
  );
}

/**
 * A good field size for the frame, arcminutes (one of 3, 6, 12, 24, 48): the smallest that
 * holds the place with room around it. Points (stars) get 6′.
 */
export function frameFov(p: Place): number {
  const want = p.size ? p.size.major * 1.3 : 6;
  return [3, 6, 12, 24, 48].find((f) => f >= want) ?? 48;
}

/** A good sky width for "Zoom to it", degrees: three times the place, at least half a degree. */
export function zoomFov(p: Place): number {
  return Math.min(60, Math.max(0.5, p.size ? (p.size.major * 3) / 60 : 0.5));
}

// ----- Tour notes -----------------------------------------------------------------------------

/** The first sentence of a text, tidied. */
export function firstSentence(text: string): string {
  const t = tidy(text);
  const m = /^.+?[.!?](?=\s+\p{Lu}|$)/u.exec(t);
  return m ? m[0] : t;
}

const ranks = new WeakMap<
  PlacesCatalogue,
  { fastest: Place | null; nearest: Place | null; n: number }
>();

function rankOf(cat: PlacesCatalogue) {
  let r = ranks.get(cat);
  if (!r) {
    let fastest: Place | null = null;
    let nearest: Place | null = null;
    for (const p of cat.places) {
      if ((motionPerYear(p) ?? 0) > (fastest ? (motionPerYear(fastest) ?? 0) : 0)) fastest = p;
      if (p.distance && (!nearest?.distance || p.distance.ly < nearest.distance.ly)) nearest = p;
    }
    r = { fastest, nearest, n: cat.places.length };
    ranks.set(cat, r);
  }
  return r;
}

/** One sentence of a tour note, or null when the catalogue lacks that fact (it is left out). */
export function noteSentence(cat: PlacesCatalogue, p: Place, say: Say): string | null {
  const from = (key: FactKey) => {
    const w = sourceWords(cat, p, key);
    return w ? ` (${w})` : '';
  };
  switch (say) {
    case 'kind': {
      const who = sourceWords(cat, p, 'kind') || 'The catalogue';
      const k = kindOf(cat, p).toLowerCase();
      return `${who} classes it as ${/^[aeiou]/.test(k) ? 'an' : 'a'} ${k}.`;
    }
    case 'distance': {
      const d = p.distance;
      if (!d) return null;
      const spread = d.disagree ? ', though studies disagree' : '';
      return `About ${shortDistance(d.ly)} away${spread}${from('distance')}.`;
    }
    case 'motion': {
      const v = motionPerYear(p);
      return v !== null && v >= 0.1
        ? `Moves ${v.toFixed(2)}″ a year across the sky${from('properMotion')}.`
        : null;
    }
    case 'arabic': {
      const a = arabicOf(cat, p);
      if (!a) return null;
      return `${a.label} ${a.arabic}${a.gloss ? `: ${a.gloss}` : ''}${a.source ? ` (${a.source})` : ''}.`;
    }
    case 'size': {
      const f = sizeFact(cat, p);
      return f ? `${f.value.replace(/ across$/, '')} across on the sky${from('size')}.` : null;
    }
    case 'brightness': {
      const m = p.magnitude;
      if (!m) return null;
      const band = m.band === 'K' ? 'near-infrared light, K band,' : 'visible light, V band,';
      return `Magnitude ${magnitude(m.value)} in ${band.slice(0, -1)}${from('magnitude')}.`;
    }
    case 'text':
      return p.text ? `${firstSentence(p.text)}${from('text')}` : null;
    case 'fastest': {
      const r = rankOf(cat);
      return r.fastest?.id === p.id
        ? `The fastest-moving of the ${r.n.toLocaleString('en-US')} places in Sima's catalogue${from('properMotion')}.`
        : null;
    }
    case 'nearest': {
      const r = rankOf(cat);
      return r.nearest?.id === p.id
        ? `The nearest of the places in Sima's catalogue with a listed distance${from('distance')}.`
        : null;
    }
  }
}

/** A tour stop's note: its sentences, then what to do in the frame. */
export function stopNote(cat: PlacesCatalogue, p: Place, stop: TourStop): string[] {
  const out = stop.say.map((s) => noteSentence(cat, p, s)).filter((s): s is string => !!s);
  return out;
}
