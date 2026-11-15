// GLS-8: the governor decides Glass or Solid once (src/shell/glass.ts, DESIGN-v2 sections 5 and 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideLevel, softwareRenderer, type GlassInputs } from '../src/shell/glass.ts';

const plain: GlassInputs = {
  forcedColors: false,
  contrastMore: false,
  choice: null,
  embed: false,
  supported: true,
  reducedTransparency: false,
  phone: false,
  renderer: 'ANGLE (Intel, Mesa Intel(R) Xe Graphics, OpenGL 4.6)',
};

test('a desktop with a GPU starts Glass', () => {
  assert.deepEqual(decideLevel(plain), { level: 'glass', reason: 'default' });
});

test('a software renderer starts Solid at once', () => {
  for (const r of ['Google SwiftShader', 'llvmpipe (LLVM 17.0.6, 256 bits)', 'Microsoft Basic Render Driver (Software)']) {
    assert.ok(softwareRenderer(r), r);
    assert.deepEqual(decideLevel({ ...plain, renderer: r }), { level: 'solid', reason: 'software' });
  }
  assert.equal(softwareRenderer(null), false);
});

test('phones, reduced transparency, no support and embed give Solid', () => {
  assert.equal(decideLevel({ ...plain, phone: true }).reason, 'phone');
  assert.equal(decideLevel({ ...plain, reducedTransparency: true }).reason, 'reduced-transparency');
  assert.equal(decideLevel({ ...plain, supported: false }).reason, 'unsupported');
  assert.equal(decideLevel({ ...plain, embed: true }).reason, 'embed');
  for (const k of ['phone', 'reducedTransparency'] as const) {
    assert.equal(decideLevel({ ...plain, [k]: true }).level, 'solid', k);
  }
});

test("the visitor's choice wins over the phone rule, the renderer and the governor", () => {
  const glass = { ...plain, choice: 'glass' as const };
  assert.deepEqual(decideLevel({ ...glass, phone: true, renderer: 'SwiftShader' }), {
    level: 'glass',
    reason: 'choice',
  });
  assert.equal(decideLevel({ ...plain, choice: 'solid' }).level, 'solid');
});

test('forced colours and more contrast beat even the visitor', () => {
  assert.equal(decideLevel({ ...plain, choice: 'glass', forcedColors: true }).level, 'solid');
  assert.equal(decideLevel({ ...plain, choice: 'glass', contrastMore: true }).level, 'solid');
});

test('GLS-1: backdrop-filter is written only in app.css, and no blur is over 32 px', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(css|ts)$/.test(e.name)) files.push(p);
    }
  };
  walk('src');
  // glass.ts only asks whether the browser supports it (CSS.supports); it styles nothing.
  const allowed = [join('styles', 'app.css'), join('shell', 'glass.ts')];
  // Comments may name the property; only code may use it.
  const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const offenders = files.filter(
    (f) => !allowed.some((a) => f.endsWith(a)) && /backdrop-filter|backdropFilter/.test(code(f)),
  );
  assert.deepEqual(offenders, []);
  const app = readFileSync('src/styles/app.css', 'utf8');
  const blurs = [...app.matchAll(/blur\((\d+(?:\.\d+)?)px\)/g)].map((m) => Number(m[1]));
  assert.ok(blurs.length >= 3, 'the three glass blurs are in app.css');
  assert.ok(blurs.every((b) => b <= 32), `every blur at most 32 px: ${blurs.join(', ')}`);
});
