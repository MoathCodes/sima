// Phones (BEGINNER-AND-MOBILE.md section 11): the layout rule (11.1) as a pure function of the
// visual viewport, the safe areas and the sheet, and the sheet's Back history (11.2, MOB-4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, PHONE } from '../src/shell/phone.ts';
import { SheetStack } from '../src/shell/sheet.ts';

// ----- The layout rule --------------------------------------------------------------------------

test('desktop sizes keep the desktop layout', () => {
  assert.deepEqual(decide({ w: 1366, h: 768 }), { kind: 'desktop', pic: 0, sheetH: 0 });
  assert.deepEqual(decide({ w: 1900, h: 1030 }), { kind: 'desktop', pic: 0, sheetH: 0 });
  assert.equal(decide({ w: 700, h: 500 }).kind, 'desktop');
  assert.equal(decide({ w: 1366, h: 768, expert: true }).kind, 'desktop');
});

test("the spec's examples (11.1): 390×750 and 360×650", () => {
  assert.deepEqual(decide({ w: 390, h: 750, height: 'peek' }), {
    kind: 'phone-fit',
    pic: 366,
    sheetH: 140,
  });
  // At half, with plenty of content, the picture stops at 240 and the sheet takes the rest.
  assert.deepEqual(decide({ w: 390, h: 750, height: 'half', content: 900 }), {
    kind: 'phone-fit',
    pic: 240,
    sheetH: 266,
  });
  assert.deepEqual(decide({ w: 360, h: 650, height: 'peek' }), {
    kind: 'phone-fit',
    pic: 286,
    sheetH: 120,
  });
  assert.deepEqual(decide({ w: 360, h: 650, height: 'half', content: 900 }), {
    kind: 'phone-fit',
    pic: 240,
    sheetH: 166,
  });
});

test('at half, short content leaves the picture larger', () => {
  const l = decide({ w: 390, h: 844, height: 'half', content: 300 });
  assert.equal(l.kind, 'phone-fit');
  assert.equal(l.pic, 844 - 244 - 300);
  assert.equal(l.sheetH, 300);
  // Narrow and tall: the width limits the picture, and the sheet takes the rest.
  assert.deepEqual(decide({ w: 390, h: 844, height: 'half', content: 200 }), {
    kind: 'phone-fit',
    pic: 366,
    sheetH: 234,
  });
  // Content under the peek height is laid out as peek.
  assert.deepEqual(
    decide({ w: 390, h: 844, height: 'half', content: 40 }),
    decide({ w: 390, h: 844, height: 'peek' }),
  );
});

test('the sheet never takes more than half the height unless the picture is at 240', () => {
  const l = decide({ w: 390, h: 844, height: 'half', content: 2000 });
  assert.equal(l.sheetH, 844 - 244 - l.pic);
  assert.ok(l.sheetH <= 844 / 2 + 1);
  assert.ok(l.pic >= PHONE.picMin);
});

test('an empty sheet is laid out as peek', () => {
  assert.deepEqual(
    decide({ w: 390, h: 844, height: null }),
    decide({ w: 390, h: 844, height: 'peek' }),
  );
});

test('rotated phones, short screens and 400% zoom use the scroll layout', () => {
  for (const [w, h] of [
    [844, 390],
    [568, 320],
    [320, 480],
    [320, 192], // 1280×768 at 400%
  ]) {
    const l = decide({ w, h, height: 'peek' });
    assert.equal(l.kind, 'phone-scroll', `${w}×${h}`);
    assert.equal(l.sheetH, 0);
    assert.ok(l.pic <= w - 24, `${w}×${h}: picture fits the width`);
  }
  // The column's picture: min(width − 24, height − 72), at least 240.
  assert.equal(decide({ w: 844, h: 390 }).pic, 390 - 72);
  assert.equal(decide({ w: 568, h: 320 }).pic, 248);
  assert.equal(decide({ w: 320, h: 192 }).pic, 240);
});

test('360×640 (a short phone) still fits, and the picture is at least 240 at both heights', () => {
  for (const height of ['peek', 'half'] as const) {
    const l = decide({ w: 360, h: 640, height, content: 600 });
    assert.equal(l.kind, 'phone-fit');
    assert.ok(l.pic >= 240);
    assert.equal(l.pic + l.sheetH + PHONE.fixed, 640);
  }
});

test('the picture is never covered: picture, fixed parts and sheet add up to the height', () => {
  for (let w = 300; w < 700; w += 37)
    for (let h = 300; h < 1000; h += 41)
      for (const height of ['peek', 'half'] as const) {
        const l = decide({ w, h, height, content: (w * h) % 700 });
        if (l.kind !== 'phone-fit') continue;
        assert.ok(l.pic >= PHONE.picMin, `${w}×${h} ${height}`);
        assert.ok(l.pic <= w - 24, `${w}×${h} ${height}`);
        assert.ok(l.sheetH >= PHONE.peek, `${w}×${h} ${height}: sheet at least peek`);
        assert.equal(l.pic + l.sheetH + PHONE.fixed, h, `${w}×${h} ${height}`);
      }
});

test('safe areas come off the space first', () => {
  const safe = { top: 47, right: 0, bottom: 34, left: 0 };
  const l = decide({ w: 390, h: 844, safe, height: 'peek' });
  assert.equal(l.kind, 'phone-fit');
  assert.equal(l.pic + l.sheetH + PHONE.fixed, 844 - 47 - 34);
  // A landscape phone's side insets narrow it.
  assert.equal(
    decide({ w: 720, h: 700, safe: { top: 0, right: 30, bottom: 0, left: 30 } }).kind,
    'phone-fit',
  );
});

test('a measured frame replaces the spec’s 244 px', () => {
  const l = decide({ w: 390, h: 844, height: 'peek', fixed: 290 });
  assert.equal(l.pic + l.sheetH + 290, 844);
  // A tall frame pushes a phone into the scroll layout.
  assert.equal(decide({ w: 360, h: 640, height: 'peek', fixed: 300 }).kind, 'phone-scroll');
});

test('Expert on a phone is always the scroll layout (11.5)', () => {
  assert.equal(decide({ w: 390, h: 844, expert: true }).kind, 'phone-scroll');
  assert.equal(decide({ w: 390, h: 844, expert: true }).pic, 366);
});

// ----- The Back history -------------------------------------------------------------------------

const entry = (
  content: string,
  height: 'peek' | 'half' | 'page' = 'peek',
  opener: string | null = null,
) => ({
  content,
  height,
  label: content,
  opener,
});

test('opening without back replaces, and says what left', () => {
  const s = new SheetStack<string, string>();
  assert.deepEqual(s.open(entry('home', 'half'), false), []);
  const gone = s.open(entry('mission'), false);
  assert.deepEqual(
    gone.map((e) => e.content),
    ['home'],
  );
  assert.equal(s.top()?.content, 'mission');
  assert.equal(s.canGoBack(), false);
  assert.equal(s.back()?.content, 'mission');
  assert.equal(s.top(), undefined);
});

test('secondary content returns to the mission, its height and its opener (MOB-4)', () => {
  const s = new SheetStack<string, string>();
  s.open(entry('mission', 'peek'), false);
  s.toggle(); // the visitor opened the mission to half
  s.open(entry('place-card', 'half', 'sky-dot'), true);
  assert.equal(s.canGoBack(), true);
  assert.equal(s.top()?.content, 'place-card');
  const left = s.back();
  assert.equal(left?.opener, 'sky-dot', 'focus goes back to the control that opened it');
  assert.equal(s.top()?.content, 'mission');
  assert.equal(s.top()?.height, 'half', 'the height it had is kept');
  assert.equal(s.canGoBack(), false);
});

test('Back goes one step at a time', () => {
  const s = new SheetStack<string>();
  s.open(entry('mission'), false);
  s.open(entry('hint', 'half'), true);
  s.open(entry('place-card', 'half'), true);
  assert.equal(s.back()?.content, 'place-card');
  assert.equal(s.top()?.content, 'hint');
  assert.equal(s.back()?.content, 'hint');
  assert.equal(s.top()?.content, 'mission');
});

test('a page can always go back, even with nothing under it', () => {
  const s = new SheetStack<string>();
  s.open(entry('settings', 'page'), true);
  assert.equal(s.canGoBack(), true);
  assert.equal(s.toggle(), undefined, 'a page has no peek or half');
  s.back();
  assert.equal(s.top(), undefined);
});

test('a page over the sheet returns to the sheet', () => {
  const s = new SheetStack<string>();
  s.open(entry('mission', 'peek'), false);
  s.open(entry('about', 'page'), true);
  s.back();
  assert.equal(s.top()?.content, 'mission');
  assert.equal(s.top()?.height, 'peek');
});

test('the same content opened again moves to the top, not twice', () => {
  const s = new SheetStack<string>();
  s.open(entry('mission'), false);
  s.open(entry('hint'), true);
  s.open(entry('mission'), true);
  assert.deepEqual(
    s.all().map((e) => e.content),
    ['hint', 'mission'],
  );
  assert.deepEqual(
    s.open(entry('mission'), false).map((e) => e.content),
    ['hint'],
  );
  assert.equal(s.all().length, 1);
});

test('toggle switches peek and half', () => {
  const s = new SheetStack<string>();
  assert.equal(s.toggle(), undefined);
  s.open(entry('home', 'half'), false);
  assert.equal(s.toggle(), 'peek');
  assert.equal(s.toggle(), 'half');
  assert.deepEqual(
    s.clear().map((e) => e.content),
    ['home'],
  );
});
