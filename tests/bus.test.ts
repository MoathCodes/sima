// Tests for the message bus (src/shell/bus.ts), the contract between the sky and frame halves.
// Owner: integrator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emit, off, on, type BusEvents } from '../src/shell/bus.ts';

const patch = (over: Partial<BusEvents['patch']> = {}): BusEvents['patch'] => ({
  ra: 269.44623,
  dec: 4.76867,
  fov: 6,
  source: 'real',
  label: "Barnard's Star",
  target: 'barnard',
  ...over,
});

// This test must run before anything emits `start` in this file.
test('replay does nothing when no message of that type was sent yet', () => {
  const got: unknown[] = [];
  const stop = on('start', (m) => got.push(m), { replay: true });
  assert.deepEqual(got, []);
  stop();
});

test('delivers each message to every listener, in subscription order, before emit returns', () => {
  const got: string[] = [];
  const a = (m: Readonly<BusEvents['band']>) => got.push(`a${m.det}`);
  const b = (m: Readonly<BusEvents['band']>) => got.push(`b${m.det}`);
  on('band', a);
  on('band', b);
  emit('band', { det: 2 });
  assert.deepEqual(got, ['a2', 'b2']);
  off('band', a);
  off('band', b);
});

test('messages of one type do not reach listeners of another', () => {
  const got: unknown[] = [];
  const stop = on('aim', (m) => got.push(m));
  emit('band', { det: 4 });
  emit('shown', { lam: 2, mjd: 61000, det: 3 });
  assert.deepEqual(got, []);
  stop();
});

test('the function on() returns and off() both stop listening', () => {
  let n = 0;
  const fn = () => {
    n += 1;
  };
  const stop = on('band', fn);
  emit('band', { det: 1 });
  stop();
  emit('band', { det: 1 });
  on('band', fn);
  off('band', fn);
  emit('band', { det: 1 });
  assert.equal(n, 1);
});

test('adding the same listener twice keeps one subscription', () => {
  let n = 0;
  const fn = () => {
    n += 1;
  };
  on('band', fn);
  on('band', fn);
  emit('band', { det: 5 });
  off('band', fn);
  assert.equal(n, 1);
});

test('listeners get a frozen copy, not the object the emitter sent', () => {
  let got: Readonly<BusEvents['patch']> | undefined;
  const stop = on('patch', (m) => {
    got = m;
  });
  const sent = patch();
  emit('patch', sent);
  sent.label = 'changed after sending';
  assert.ok(got);
  assert.equal(got.label, "Barnard's Star");
  assert.ok(Object.isFrozen(got));
  assert.throws(() => {
    (got as BusEvents['patch']).fov = 12;
  }, TypeError);
  stop();
});

test('a listener that throws is reported, and the others still run', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const got: number[] = [];
  const bad = () => {
    throw new Error('broken listener');
  };
  const good = (m: Readonly<BusEvents['band']>) => got.push(m.det);
  on('band', bad);
  on('band', good);
  emit('band', { det: 6 });
  off('band', bad);
  off('band', good);
  assert.deepEqual(got, [6]);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0]?.arguments[0]), /"band" listener failed/);
});

test('replay hands a late listener the last message of its type, once', () => {
  emit('shown', { lam: 1.5, mjd: 60900, det: 2 });
  emit('shown', { lam: 2.0, mjd: 61000, det: 3 });
  const got: Readonly<BusEvents['shown']>[] = [];
  const stop = on('shown', (m) => got.push(m), { replay: true });
  assert.deepEqual(got, [{ lam: 2.0, mjd: 61000, det: 3 }]);
  emit('shown', { lam: null, mjd: null, det: 3 });
  assert.equal(got.length, 2);
  stop();

  const plain: unknown[] = [];
  const stopPlain = on('shown', (m) => plain.push(m));
  assert.deepEqual(plain, [], 'without replay nothing arrives until the next message');
  stopPlain();
});

test('listeners added or removed during delivery do not change the current round', () => {
  const got: string[] = [];
  const late = () => got.push('late');
  const second = () => got.push('second');
  const first = () => {
    got.push('first');
    on('band', late);
    off('band', second);
  };
  on('band', first);
  on('band', second);
  emit('band', { det: 3 });
  assert.deepEqual(got, ['first', 'second']);
  emit('band', { det: 3 });
  assert.deepEqual(got, ['first', 'second', 'first', 'late']);
  off('band', first);
  off('band', late);
});

test('well-formed messages of all five kinds raise no error', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  emit('aim', { ra: 0, dec: -90 });
  emit('aim', { ra: 359.999, dec: 90, fov: 12, target: null });
  emit('patch', patch({ source: 'loading', target: null, label: '' }));
  emit('start', { starter: 'runaway' });
  emit('band', { det: 1 });
  emit('shown', { lam: 0.75, mjd: 61000.25, det: 1 });
  emit('shown', { lam: null, mjd: null, det: 6 });
  assert.equal(errors.mock.callCount(), 0);
});

test('values out of range (unit mix-ups) are reported, and still delivered', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const cases: [keyof BusEvents, unknown, RegExp][] = [
    ['aim', { ra: -1, dec: 0 }, /ra outside/],
    ['aim', { ra: 10, dec: 95 }, /dec outside/],
    ['aim', { ra: 10, dec: 20, fov: 0.1 }, /fov outside/], // degrees sent as arcminutes
    ['patch', patch({ ra: Number.NaN }), /ra outside/],
    ['patch', patch({ fov: 0.1 }), /fov outside/],
    ['patch', { ...patch(), source: 'cached' }, /unknown source/],
    ['start', { starter: '' }, /no starter/],
    ['band', { det: 7 }, /det outside/],
    ['band', { det: 2.5 }, /det outside/],
    ['shown', { lam: 2000, mjd: 61000, det: 3 }, /lam outside/], // nanometres
    ['shown', { lam: 2, mjd: 2461000.5, det: 3 }, /mjd outside/], // a Julian date
    ['shown', { lam: 2, mjd: 2026.5, det: 3 }, /mjd outside/], // a decimal year
  ];
  for (const [type, msg, why] of cases) {
    errors.mock.resetCalls();
    let delivered = false;
    const stop = on(type, () => {
      delivered = true;
    });
    emit(type, msg as never);
    stop();
    assert.equal(delivered, true, `${type} ${JSON.stringify(msg)} is still delivered`);
    assert.equal(errors.mock.callCount(), 1, `${type} ${JSON.stringify(msg)} is reported`);
    assert.match(String(errors.mock.calls[0]?.arguments[0]), why);
  }
});

// Never called: tsc checks that the bus's types reject these messages (npm run typecheck).
function wrongMessagesDoNotCompile(): void {
  // @ts-expect-error: det is a number, not a string
  emit('band', { det: '3' });
  // @ts-expect-error: a patch needs a source and a label
  emit('patch', { ra: 1, dec: 2, fov: 6, target: null });
  // @ts-expect-error: there is no such message
  emit('pan', { ra: 1, dec: 2 });
  // @ts-expect-error: the listener of `aim` gets an aim message, which has no det
  on('aim', (m) => m.det);
}

test('the types reject wrong messages (checked by npm run typecheck)', () => {
  assert.equal(typeof wrongMessagesDoNotCompile, 'function');
});
