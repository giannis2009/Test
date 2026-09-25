// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const js = (f) => path.join(__dirname, '..', 'AppleFX', 'js', f);
const Easing = require(js('easing.js'));
const Presets = require(js('presets.js'));
const Engine = require(js('engine.js'));

const FPS = 30;
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

test('every curve starts at 0 and ends at 1', () => {
  for (const c of Easing.CURVES) {
    const f = Easing.make(c.id);
    assert.ok(near(f(0), 0), c.id + ' f(0)');
    assert.ok(near(f(1), 1), c.id + ' f(1)');
    const g = Easing.makeExit(c.id);
    assert.ok(near(g(0), 0) && near(g(1), 1), c.id + ' exit');
  }
});

test('bezier matches known CSS ease values', () => {
  const ease = Easing.cubicBezier(0.25, 0.1, 0.25, 1);
  assert.ok(near(ease(0.5), 0.8024, 2e-3));
  const linear = Easing.cubicBezier(0, 0, 1, 1);
  assert.ok(near(linear(0.3), 0.3));
});

test('springs: bouncy overshoots, smooth does not', () => {
  const bouncy = Easing.make('spring-bouncy');
  const smooth = Easing.make('spring-smooth');
  let maxB = 0, maxS = 0;
  for (let p = 0; p <= 1; p += 0.005) { maxB = Math.max(maxB, bouncy(p)); maxS = Math.max(maxS, smooth(p)); }
  assert.ok(maxB > 1.05, 'bouncy overshoot ' + maxB);
  assert.ok(maxS <= 1.0001, 'smooth no overshoot ' + maxS);
});

test('custom curves use the provided values', () => {
  const f = Easing.make('custom-bezier', [0, 0, 1, 1]);
  assert.ok(near(f(0.25), 0.25));
  const s = Easing.make('custom-spring', [0.4, 0.3]);
  let max = 0;
  for (let p = 0; p <= 1; p += 0.005) max = Math.max(max, s(p));
  assert.ok(max > 1.2);
});

test('library has 45+ presets across 6 categories with unique ids', () => {
  assert.ok(Presets.PRESETS.length >= 45, 'count ' + Presets.PRESETS.length);
  assert.equal(new Set(Presets.PRESETS.map((p) => p.id)).size, Presets.PRESETS.length);
  for (const cat of Presets.CATEGORIES) {
    assert.ok(Presets.PRESETS.some((p) => p.cat === cat.id), 'category ' + cat.id);
  }
});

test('every non-easing preset builds valid ops', () => {
  const clip = { dur: 4, index: 0 };
  for (const p of Presets.PRESETS) {
    if (p.kind === 'ease') continue;
    const wheres = p.kind === 'anim' ? ['in', 'out', 'both'] : [undefined];
    for (const where of wheres) {
      const ops = Engine.buildClip(p, where ? { where } : {}, clip, FPS, { in: true, out: true });
      assert.ok(ops.length > 0, p.id + ' produced no ops');
      for (const op of ops) {
        assert.ok(op.t, p.id);
        if (op.keys) {
          assert.ok(op.keys.length >= 2, p.id + ' ' + op.t + ' keys');
          for (const [t, v] of op.keys) {
            assert.ok(t >= 0 && t <= clip.dur, p.id + ' time ' + t);
            const vals = Array.isArray(v) ? v : [v];
            vals.forEach((x) => assert.ok(Number.isFinite(x), p.id + ' value'));
          }
          for (let i = 1; i < op.keys.length; i++) assert.ok(op.keys[i][0] > op.keys[i - 1][0], p.id + ' sorted');
        }
      }
      JSON.parse(JSON.stringify(ops));
    }
  }
});

test('entrance ends exactly at rest (identity offsets)', () => {
  const p = Presets.byId['text-keynote-rise'];
  const ops = Engine.buildClip(p, { where: 'in' }, { dur: 3 }, FPS);
  const pos = ops.find((o) => o.t === 'position');
  const op = ops.find((o) => o.t === 'opacity');
  const blur = ops.find((o) => o.t === 'fx' && o.fx === 'blur');
  assert.deepEqual(pos.keys.at(-1)[1], [0, 0]);
  assert.equal(op.keys.at(-1)[1], 1);
  assert.equal(op.keys[0][1], 0);
  assert.equal(blur.keys.at(-1)[1], 0);
  assert.equal(pos.base, pos.keys.at(-1)[0]);
});

test('smart density reduces keyframes but keeps the curve', () => {
  const p = Presets.byId['text-scale-pop'];
  const full = Engine.buildClip(p, { where: 'in', density: 'full', duration: 1 }, { dur: 3 }, FPS).find((o) => o.t === 'scale');
  const smart = Engine.buildClip(p, { where: 'in', duration: 1 }, { dur: 3 }, FPS).find((o) => o.t === 'scale');
  assert.equal(full.keys.length, 31);
  assert.ok(smart.keys.length < full.keys.length);
  // interpolated smart curve stays within tolerance of the full curve
  for (const [t, v] of full.keys) {
    const i = smart.keys.findIndex((k) => k[0] >= t - 1e-9);
    const b = smart.keys[i], a = smart.keys[Math.max(0, i - 1)];
    const u = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
    assert.ok(Math.abs(a[1] + (b[1] - a[1]) * u - v) < 0.001, 'at ' + t);
  }
});

test('in+out on a short clip never overlaps', () => {
  const p = Presets.byId['text-fade-up'];
  const ops = Engine.buildClip(p, { where: 'both', duration: 1 }, { dur: 1 }, FPS).filter((o) => o.t === 'position');
  assert.equal(ops.length, 2);
  assert.ok(ops[0].clear[1] <= ops[1].clear[0] + 1e-9);
});

test('styles are absolute so re-applying never compounds', () => {
  const ops = Engine.buildClip(Presets.byId['st-pip-br'], {}, { dur: 5 }, FPS);
  const pos = ops.find((o) => o.t === 'position');
  assert.equal(pos.mode, 'ident');
  assert.equal(pos.via, 'transform');
  assert.ok(ops.findIndex((o) => o.t === 'shadow') > ops.findIndex((o) => o.via === 'transform'), 'shadow after transform');
});

test('transition roles pair neighbours on the same track', () => {
  const roles = Engine.transitionRoles([
    { track: 0, index: 2 }, { track: 0, index: 3 }, { track: 0, index: 4 }, { track: 1, index: 0 }
  ]);
  assert.deepEqual(roles.map((r) => r.role), [
    { in: false, out: true }, { in: true, out: true }, { in: true, out: false }, { in: true, out: true }
  ]);
});

test('easing bake replaces segments between existing keys', () => {
  const ops = Engine.bakeExisting([
    { ci: 1, pi: 0, keys: [[0, [0.5, 0.5]], [1, [0.8, 0.5]], [1.02, [0.8, 0.5]]] },
    { ci: 1, pi: 1, keys: [[0, 100], [2, 150]] }
  ], { curve: 'keynote-smooth' }, FPS);
  assert.equal(ops.length, 2);
  assert.deepEqual(ops[0].keys[0][1], [0.5, 0.5]);
  assert.deepEqual(ops[0].keys.at(-1)[1], [0.8, 0.5]);
  assert.deepEqual(ops[0].clear, [0, 1]);
  const mid = ops[1].keys.find((k) => k[0] > 0.3);
  assert.ok(mid[1] > 125, 'ease-out front-loads motion');
});

test('loops cover the whole clip', () => {
  const ops = Engine.buildClip(Presets.byId['lp-handheld'], {}, { dur: 5, index: 0 }, FPS);
  const pos = ops.find((o) => o.t === 'position');
  assert.equal(pos.keys[0][0], 0);
  assert.ok(near(pos.keys.at(-1)[0], (5 * FPS - 1) / FPS, 1e-6));
  const sc = ops.find((o) => o.t === 'scale');
  assert.ok(sc.keys.every((k) => near(k[1], 1.03)));
});
