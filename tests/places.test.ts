// Tests for places (PLC-4 to PLC-6) on the real catalogue. Owner: lane G.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PlacesCatalogue } from '../src/data/schema.ts';
import { TOURS } from '../src/data/tours.ts';
import { find, makeIndex, normalise, within } from '../src/shell/places/search.ts';
import { KIND_CHIPS } from '../src/shell/places/kinds.ts';
import { cellOf, orderFor } from '../src/shell/places/cutout.ts';
import {
  arabicOf,
  bestKnownFirst,
  distanceFact,
  facts,
  frameFov,
  hasCommonName,
  nameOf,
  noteSentence,
  otherNames,
  spherexNote,
  stopNote,
  tidy,
  twoFigures,
} from '../src/shell/objects.ts';

const cat = JSON.parse(
  readFileSync(new URL('../src/data/places.json', import.meta.url), 'utf8'),
) as PlacesCatalogue;
const byId = new Map(cat.places.map((p) => [p.id, p]));
const index = makeIndex(cat.places);
const top = (q: string) => find(index, q, 3)[0]?.place;

test('PLC-4: the four required searches find the right place first', () => {
  assert.equal(top('shepherd')?.names.common, 'Errai');
  assert.equal(top('الدبران')?.names.common, 'Aldebaran');
  assert.equal(top('m104')?.names.common, 'Sombrero Galaxy');
  assert.equal(top('سهيل')?.names.common, 'Canopus');
});

test('PLC-4: transliteration, catalogue forms, Greek letters and small typos', () => {
  assert.equal(top('ad-Dabaran')?.names.common, 'Aldebaran');
  assert.equal(top('M 104')?.names.common, 'Sombrero Galaxy');
  assert.equal(top('messier 104')?.names.common, 'Sombrero Galaxy');
  assert.equal(top('NGC4594')?.names.common, 'Sombrero Galaxy');
  assert.equal(top('alpha tau')?.names.common, 'Aldebaran');
  assert.equal(top('betelgeuze')?.names.common, 'Betelgeuse');
  assert.equal(top('aldebran')?.names.common, 'Aldebaran');
  assert.equal(top('sombr')?.names.common, 'Sombrero Galaxy');
  assert.equal(top('دبران')?.names.common, 'Aldebaran');
});

test('catalogue numbers never match a longer number', () => {
  const hits = find(index, 'm 1', 8).map((m) => m.place.names.common);
  assert.deepEqual(hits, ['Crab Nebula']);
});

test('normalise folds accents, Arabic marks and apostrophes', () => {
  assert.equal(normalise("Barnard's Star"), 'barnards star');
  assert.equal(normalise('ar-Rāʿī'), 'ar rai');
  assert.equal(normalise('رجل الجبّار'), normalise('رجل الجبار'));
  assert.equal(within('vega', 'vgea', 1), 1);
  assert.equal(within('vega', 'sirius', 1), 2);
});

test('PLC-5: Sombrero shows the middle of the listed distances and their spread', () => {
  const sombrero = top('m104');
  assert.ok(sombrero);
  const f = distanceFact(cat, sombrero);
  assert.equal(f?.value, 'About 37 million light-years');
  assert.match(f?.detail ?? '', /middle of 16 measurements listed in SIMBAD/);
  assert.match(f?.detail ?? '', /Studies disagree: from about 28 to 71 million light-years/);
});

test('H9: a missing fact is left out, never filled', () => {
  const wise = byId.get('wise-0855');
  assert.ok(wise);
  assert.equal(distanceFact(cat, wise), null);
  assert.ok(!facts(cat, wise).some((f) => f.label === 'How far'));
  for (const p of cat.places) {
    for (const f of facts(cat, p)) {
      assert.ok(!/NaN|undefined|null/.test(`${f.value} ${f.detail ?? ''}`), `${p.id}: ${f.value}`);
    }
  }
});

test('O-P3: catalogue-only names are told apart from common names', () => {
  assert.equal(hasCommonName(byId.get('simbad-1971559')!), true); // Sombrero Galaxy
  assert.equal(hasCommonName(byId.get('wise-0855')!), true); // a challenge target
  assert.equal(hasCommonName(byId.get('simbad-1005244')!), false); // 2M 0746+20 b
  assert.equal(hasCommonName(byId.get('simbad-1191721')!), false); // Lacaille 9352
});

test('names and text are tidied for reading', () => {
  assert.equal(nameOf(byId.get('simbad-122671')!), 'del Cep');
  assert.ok(!otherNames(byId.get('simbad-719377')!).some((n) => n.startsWith('*')));
  assert.equal(tidy('the Follower (of the Pleiades )'), 'the Follower (of the Pleiades)');
  assert.equal(tidy("Earth 's North Pole ."), "Earth's North Pole.");
  assert.equal(twoFigures(5.958), '6.0');
  assert.equal(twoFigures(36.757), '37');
  assert.equal(twoFigures(1543), '1,500');
});

test('Arabic names say whether they are traditional names or Wikidata labels', () => {
  assert.equal(arabicOf(cat, byId.get('simbad-719377')!)?.label, 'Arabic name');
  assert.equal(arabicOf(cat, byId.get('simbad-1971559')!)?.label, 'Arabic label');
});

test('PLC-6: seven tours; every stop is found and its note says at least one sourced fact', () => {
  assert.equal(TOURS.length, 7);
  for (const tour of TOURS) {
    assert.ok(tour.stops.length >= 8, tour.id);
    for (const stop of tour.stops) {
      const p = byId.get(stop.place);
      assert.ok(p, `${tour.id}: ${stop.place} is not in the catalogue`);
      const note = stopNote(cat, p, stop);
      assert.ok(note.length >= 1, `${tour.id}: ${stop.place} says nothing`);
      for (const s of note) assert.match(s, /\([^)]+\)\.?$|classes it as/, `${stop.place}: ${s}`);
      // Every fact a stop asks for exists, so no note silently drops a fact.
      for (const say of stop.say) {
        assert.ok(noteSentence(cat, p, say), `${tour.id}: ${stop.place} has no ${say}`);
      }
    }
  }
});

test('lists: every chip and filter has places, best known first', () => {
  for (const chip of KIND_CHIPS) {
    const all = cat.places.filter((p) => chip.has(p)).sort(bestKnownFirst);
    assert.ok(all.length > 0, chip.id);
    for (const f of chip.filters) assert.ok(all.some(f.keep), `${chip.id}: ${f.name}`);
    for (let i = 1; i < all.length; i++) assert.ok(all[i - 1]!.tier <= all[i]!.tier);
  }
});

test('frame field sizes are one of the frame steps', () => {
  assert.equal(frameFov(byId.get('simbad-1971559')!), 12); // 8.4′ galaxy
  assert.equal(frameFov(byId.get('barnard')!), 6);
  assert.equal(frameFov(byId.get('simbad-1575544')!), 48); // Andromeda, larger than 48′
});

test('cutouts: HEALPix cells of bright stars match the tiles checked on 14 November 2026', () => {
  // Each lands on a saturated pixel of its order-3 SPHEREx tile (see cutout.ts inTile).
  assert.deepEqual(cellOf(88.79294, 7.40706, 3), { order: 3, npix: 368, col: 450, row: 341 });
  assert.deepEqual(cellOf(101.28716, -16.71612, 3), { order: 3, npix: 327, col: 138, row: 142 });
  assert.deepEqual(cellOf(37.95456, 89.26411, 3), { order: 3, npix: 63, col: 484, row: 474 });
  assert.equal(orderFor(0.5 / 112), 5);
  assert.equal(orderFor(4 / 112), 2);
});

test('H9: the "In SPHEREx" note is made for the place only from named facts', () => {
  const named = (q: string) => {
    const p = top(q);
    assert.ok(p, q);
    return spherexNote(cat, p);
  };
  // A cloud: the ice wavelengths, with the SPHEREx team's page as their source.
  const cloud = cat.places.find((p) => p.kind === 'dark-nebula' && !p.inSpherex);
  assert.ok(cloud);
  const ice = spherexNote(cat, cloud);
  assert.match(ice?.text ?? '', /3\.05 µm.*4\.27 µm/);
  assert.match(ice?.source?.url ?? '', /^https:\/\/spherex\.caltech\.edu\//);
  // A star: its SIMBAD motion in SPHEREx pixels (6.15″), no claim of a SPHEREx measurement.
  const star = cat.places.find(
    (p) => p.kind === 'star' && !p.inSpherex && p.properMotion && p.sources.properMotion,
  );
  assert.ok(star?.properMotion);
  const pm = Math.hypot(star.properMotion.ra, star.properMotion.dec) / 1000;
  const note = spherexNote(cat, star)?.text ?? '';
  assert.match(note, /^SIMBAD lists /);
  assert.ok(note.includes(`${pm.toFixed(pm < 0.1 ? 3 : 2)}″ a year`), note);
  assert.equal(note.includes('pixels a year'), pm / 6.15 >= 0.3);
  // Nothing sourced to add: the kind's general thing to try stays (Sombrero, a galaxy).
  assert.equal(
    named('m104')?.text,
    'Slide the wavelength from short to long and compare how it looks.',
  );
  // The catalogue's own note wins.
  const own = cat.places.find((p) => p.inSpherex);
  assert.ok(own);
  assert.equal(spherexNote(cat, own)?.fromCatalogue, true);
});
