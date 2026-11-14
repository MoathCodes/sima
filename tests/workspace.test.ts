// Tests for the workspace schema (src/workspace/schema.ts): the share link round trip, the
// migration from version 1, and refusing what cannot be read. Owner: integrator (workspace).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LINK_LIMIT,
  MAX_FRAMES,
  MIN_W,
  SCHEMA_VERSION,
  decodeWorkspace,
  emptyWorkspace,
  encodeWorkspace,
  migrate,
  workspaceInHash,
  type FrameState,
  type Workspace,
} from '../src/workspace/schema.ts';

function frame(id: string, extra: Partial<FrameState> = {}): FrameState {
  return {
    id,
    type: 'blink',
    anchor: { ra: 269.45213, dec: 4.69312 },
    fov: 6,
    mode: 'pinned',
    box: { x: 40, y: -120, w: 260, h: 320 },
    det: 2,
    mjd: 60800.1234,
    sameColour: true,
    link: 'g1',
    ...extra,
  };
}

function sample(): Workspace {
  return {
    ...emptyWorkspace('Barnard in two detectors'),
    camera: { ra: 269.45, dec: 4.69, fov: 1.9 },
    main: { ra: 269.4485, dec: 4.7394, fov: 6, target: 'barnard', det: 3, mode: 'flip', mjd: 60900.5, link: 'g1' },
    frames: [frame('f1'), frame('f2', { type: 'spectrum', det: 5, mode: 'docked', link: null })],
    links: [{ id: 'g1', time: true, position: false, detector: false }],
  };
}

test('a workspace survives the share link: encode then decode gives it back', async () => {
  const ws = sample();
  const text = await encodeWorkspace(ws);
  assert.match(text, /^[A-Za-z0-9_-]+$/, 'base64url only');
  const back = await decodeWorkspace(text);
  assert.equal(back.note, null);
  assert.deepEqual(back.ws, ws);
});

test('six frames fit well inside a link', async () => {
  const ws = { ...sample(), frames: Array.from({ length: MAX_FRAMES }, (_, i) => frame(`f${i + 1}`)) };
  const text = await encodeWorkspace(ws);
  assert.ok(text.length < LINK_LIMIT, `${text.length} characters`);
});

test('the link is found in the page address', () => {
  assert.equal(workspaceInHash('#w=abc_-9'), 'abc_-9');
  assert.equal(workspaceInHash('#x=1&w=abc'), 'abc');
  assert.equal(workspaceInHash('#welcome'), null);
  assert.equal(workspaceInHash(''), null);
});

test('a damaged link is refused with a plain note, never thrown', async () => {
  for (const bad of ['', 'not*base64', 'AAAA', btoa('{"v":2}')]) {
    const r = await decodeWorkspace(bad);
    assert.equal(r.ws, null, bad);
    assert.match(r.note ?? '', /damaged/);
  }
});

test('versions it cannot read are refused with a message', () => {
  assert.match(migrate(null).note ?? '', /not a Sima workspace/);
  assert.match(migrate({ frames: [] }).note ?? '', /no version/);
  assert.match(migrate({ v: SCHEMA_VERSION + 1 }).note ?? '', /newer Sima/);
  assert.match(migrate({ v: 0 }).note ?? '', /cannot read/);
  for (const r of [migrate(null), migrate({ v: 99 })]) assert.equal(r.ws, null);
});

test('version 1 (the draft spec) is migrated, and the note says what changed', () => {
  const v1 = {
    v: 1,
    name: 'Old',
    camera: { ra: 10, dec: 20, fov: 3 },
    layer: { survey: 'spherex-cube', channel: 40 },
    frames: [
      { id: 'a', type: 'blink', anchor: { ra: 10, dec: 20 }, size: 12, mode: 'docked', box: { x: 1, y: 2, w: 300, h: 300 }, det: 4, step: 3, sameColour: true, overlays: {}, link: 'L' },
      { id: 'b', type: 'two', anchor: { ra: 10, dec: 20 }, size: 3, mode: 'pinned', box: { x: 0, y: 0, w: 100, h: 100 }, det: 'colour', step: 0, sameColour: false, overlays: {} },
    ],
    links: [{ id: 'L', time: true, position: true, detector: false }],
    places: [{ id: 'p', name: 'x', ra: 1, dec: 2, fov: 1 }],
    playing: true,
    speed: 'normal',
  };
  const { ws, note } = migrate(v1);
  assert.ok(ws);
  assert.equal(ws.v, SCHEMA_VERSION);
  assert.equal(ws.main, null);
  const [a, b] = ws.frames;
  assert.equal(a?.det, 5, 'detector index 4 is D5');
  assert.equal(a?.fov, 12);
  assert.equal(a?.mjd, null);
  assert.equal(a?.link, 'L');
  assert.equal(b?.det, 3, 'colour opens in D3');
  assert.equal(b?.fov, 3);
  assert.equal(b?.box.w, MIN_W, 'sized up to the smallest frame');
  assert.deepEqual(ws.links, [{ id: 'L', time: true, position: true, detector: false }]);
  assert.match(note ?? '', /older workspace \(version 1\)/);
  assert.match(note ?? '', /colour frame/);
  assert.match(note ?? '', /saved places/);
});

test('damaged frames are left out and named; more than six are cut', () => {
  const frames = [
    ...Array.from({ length: MAX_FRAMES + 2 }, (_, i) => frame(`f${i + 1}`)),
    { id: 'x', type: 'hologram', anchor: { ra: 1, dec: 2 } },
    { id: 'y', type: 'blink', anchor: { ra: 1, dec: 200 } },
  ];
  const { ws, note } = migrate({ ...sample(), frames });
  assert.equal(ws?.frames.length, MAX_FRAMES);
  assert.match(note ?? '', /2 frames were damaged/);
  assert.match(note ?? '', /first 6 frames/);
});

test('links to groups that do not exist are dropped, and unused groups go', () => {
  const { ws } = migrate({
    ...sample(),
    frames: [frame('f1', { link: 'nope' })],
    main: null,
    links: [{ id: 'g1', time: true }],
  });
  assert.equal(ws?.frames[0]?.link, null);
  assert.deepEqual(ws?.links, []);
});

test('duplicate frame ids get new ones', () => {
  const { ws } = migrate({ ...sample(), frames: [frame('f1'), frame('f1')] });
  assert.deepEqual(ws?.frames.map((f) => f.id), ['f1', 'f2']);
});
