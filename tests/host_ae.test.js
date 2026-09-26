// After Effects host script, run against the simulated AE DOM (tests/sim/ae.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeAE, Layer } = require('./sim/ae.js');

const js = (f) => path.join(__dirname, '..', 'AppleFX', 'js', f);
const Presets = require(js('presets.js'));
const Engine = require(js('engine.js'));
const Easing = require(js('easing.js'));

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
// Values created inside the simulated AE context are foreign-realm arrays.
const A = (v) => (Array.isArray(v) ? Array.from(v) : v);

function setup(n = 3, opts = {}) {
  const ae = makeAE(opts);
  for (let i = 1; i <= n; i++) {
    const L = new Layer(i, 'Layer ' + i, (i - 1) * 4, i * 4, opts.layer || {});
    ae.comp.layers.push(L);
  }
  ae.comp.selectedLayers = ae.comp.layers.slice();
  return ae;
}

function applyPreset(ae, p, settings) {
  const ctx = ae.call('getContext');
  assert.ok(ctx.ok, ctx.error);
  let clips;
  if (p.kind === 'transition') {
    clips = Engine.transitionRoles(ctx.clips).map((x) => ({ track: 0, index: x.clip.index, layer: x.clip.layer, ops: Engine.buildClip(p, settings, x.clip, ctx.fps, x.role) }));
  } else {
    clips = ctx.clips.map((c) => ({ track: 0, index: c.index, layer: c.layer, ops: Engine.buildClip(p, settings, c, ctx.fps) }));
  }
  return ae.call('applyPlan', { clips });
}

const T = (L) => L.property('ADBE Transform Group');

test('getContext lists selected layers sorted by in-point', () => {
  const ae = setup(3);
  ae.comp.selectedLayers = [ae.comp.layers[2], ae.comp.layers[0]];
  const ctx = ae.call('getContext');
  assert.equal(ctx.ok, true);
  assert.deepEqual(ctx.clips.map((c) => c.layer), [1, 3]);
  assert.deepEqual(ctx.clips.map((c) => c.index), [0, 1]);
  assert.equal(ctx.fps, 30);
});

test('no composition gives a clear error', () => {
  const ae = setup(1);
  ae.app.project.activeItem = null;
  const r = ae.call('getContext');
  assert.equal(r.ok, false);
  assert.match(r.error, /composition/i);
});

test('every preset applies to every layer without warnings (and balances undo)', () => {
  for (const p of Presets.PRESETS) {
    if (p.kind === 'ease') continue;
    const wheres = p.kind === 'anim' ? ['in', 'out', 'both'] : [undefined];
    for (const where of wheres) {
      for (const mb of [false, true]) {
        const ae = setup(3);
        const r = applyPreset(ae, p, { where, motionBlur: mb });
        assert.equal(r.ok, true, p.id + ': ' + r.error);
        assert.deepEqual(r.warnings, [], p.id + ' ' + where + ' mb=' + mb);
        assert.equal(r.clips, 3);
        assert.equal(ae.undoDepth(), 0);
      }
    }
  }
});

test('Fade Up: starts lower and transparent, lands exactly on the original values', () => {
  const ae = setup(1, { layer: { pos: [700, 400] } });
  const r = applyPreset(ae, Presets.byId['text-fade-up'], { where: 'in', duration: 0.8 });
  assert.equal(r.ok, true);
  const L = ae.comp.layers[0], pos = T(L).property('ADBE Position'), op = T(L).property('ADBE Opacity');
  assert.ok(near(pos.valueAtTime(0)[1], 400 + 0.05 * 1080));
  assert.ok(near(pos.valueAtTime(0)[0], 700));
  assert.deepEqual(A(pos.valueAtTime(0.8)), [700, 400]);
  assert.deepEqual(A(pos.valueAtTime(3)), [700, 400]);
  assert.equal(op.valueAtTime(0), 0);
  assert.equal(op.valueAtTime(0.8), 100);
  assert.ok(pos.keys.every((k) => k.inI === ae.KIT.LINEAR));
});

test('in + out keeps both halves and re-applying does not stack', () => {
  const ae = setup(1);
  const p = Presets.byId['text-blur-in'];
  applyPreset(ae, p, { where: 'both', duration: 0.8 });
  const L = ae.comp.layers[0];
  const blur = L.property('ADBE Effect Parade').property('ADBE Gaussian Blur 2').property('ADBE Gaussian Blur 2-0001');
  const before = blur.keys.length;
  assert.ok(blur.valueAtTime(0) > 10);
  assert.equal(blur.valueAtTime(2), 0);
  assert.ok(blur.valueAtTime(3.99) > 10);
  applyPreset(ae, p, { where: 'both', duration: 0.8 });
  assert.equal(blur.keys.length, before);
  assert.equal(L.property('ADBE Effect Parade').numProperties, 1, 'effect reused');
  assert.equal(T(L).property('ADBE Scale').valueAtTime(2)[0], 100);
});

test('separated position dimensions are animated per axis', () => {
  const ae = setup(1, { layer: { separated: true } });
  const r = applyPreset(ae, Presets.byId['text-slide-left'], { where: 'in' });
  assert.deepEqual(r.warnings, []);
  const X = T(ae.comp.layers[0]).property('ADBE Position_0');
  assert.ok(X.valueAtTime(0) < 960);
  assert.ok(near(X.valueAtTime(3), 960));
});

test('3D scale keeps its third dimension', () => {
  const ae = setup(1, { layer: { scale: [100, 100, 100] } });
  const r = applyPreset(ae, Presets.byId['text-scale-pop'], { where: 'in' });
  assert.deepEqual(r.warnings, []);
  assert.equal(T(ae.comp.layers[0]).property('ADBE Scale').valueAtTime(0).length, 3);
});

test('styles: PiP sets absolute scale/position, shadow opacity lands in 0..255 scale', () => {
  const ae = setup(1);
  applyPreset(ae, Presets.byId['st-pip-br'], {});
  applyPreset(ae, Presets.byId['st-pip-br'], {}); // re-apply must not compound
  const L = ae.comp.layers[0];
  assert.deepEqual(A(T(L).property('ADBE Scale').value), [30, 30]);
  const pos = T(L).property('ADBE Position').value;
  assert.ok(near(pos[0], 960 + 0.32 * 1920) && near(pos[1], 540 + 0.3 * 1080));
  const sh = L.property('ADBE Effect Parade').property('ADBE Drop Shadow');
  assert.ok(near(sh.property('ADBE Drop Shadow-0002').value, 55 * 2.55, 0.01));
});

test('crop presets drive a single named mask', () => {
  const ae = setup(1);
  applyPreset(ae, Presets.byId['text-wipe'], { where: 'in', duration: 1 });
  applyPreset(ae, Presets.byId['text-wipe'], { where: 'in', duration: 1 });
  const masks = ae.comp.layers[0].property('ADBE Mask Parade');
  assert.equal(masks.numProperties, 1);
  const shape = masks.property(1).property('ADBE Mask Shape');
  const v0 = shape.valueAtTime(0).vertices, v1 = shape.valueAtTime(1).vertices;
  assert.ok(near(v0[1][0], 0), 'fully hidden at start');
  assert.ok(near(v1[1][0], 1920), 'fully revealed at end');
});

test('glass card: blur, brightness, mask and feather', () => {
  const ae = setup(1);
  const r = applyPreset(ae, Presets.byId['glass-card'], {});
  assert.deepEqual(r.warnings, []);
  const L = ae.comp.layers[0], fx = L.property('ADBE Effect Parade');
  assert.equal(fx.property('ADBE Gaussian Blur 2').property('ADBE Gaussian Blur 2-0001').value, 60);
  assert.equal(fx.property('ADBE Gaussian Blur 2').property('ADBE Gaussian Blur 2-0003').value, 1);
  const m = L.property('ADBE Mask Parade').property(1);
  assert.deepEqual(A(m.property('ADBE Mask Feather').value), [2, 2]);
  assert.ok(near(m.property('ADBE Mask Shape').value.vertices[0][0], 0.22 * 1920));
});

test('transitions: outgoing exits, incoming enters, motion blur switches on', () => {
  const ae = setup(2);
  const r = applyPreset(ae, Presets.byId['tr-push-left'], { motionBlur: true, duration: 0.5 });
  assert.deepEqual(r.warnings, []);
  const [LA, LB] = ae.comp.layers;
  const pa = T(LA).property('ADBE Position'), pb = T(LB).property('ADBE Position');
  assert.ok(near(pa.valueAtTime(LA.outPoint - 1 / 30)[0], 960 - 1920, 0.05));
  assert.ok(near(pa.valueAtTime(1)[0], 960));
  assert.ok(near(pb.valueAtTime(LB.inPoint)[0], 960 + 1920, 0.05));
  assert.ok(near(pb.valueAtTime(LB.inPoint + 0.5)[0], 960, 0.05));
  assert.equal(LA.motionBlur, true);
  assert.equal(ae.comp.motionBlur, true);
});

// ------------------------------------------------------------ easing
function keyed(ae) {
  const L = ae.comp.layers[0], P = T(L).property('ADBE Position'), S = T(L).property('ADBE Scale'), O = T(L).property('ADBE Opacity');
  P.setValueAtTime(0, [200, 540]); P.setValueAtTime(1, [1600, 540]); P.setValueAtTime(2, [1600, 200]);
  S.setValueAtTime(0, [50, 50]); S.setValueAtTime(1, [100, 120]);
  O.setValueAtTime(0, 0); O.setValueAtTime(1, 100);
  ae.comp.selectedProperties = [T(L), P, S, O];
  return { P, S, O };
}

test('bezier easing becomes real keyframe ease with the right speed/influence', () => {
  const ae = setup(1);
  const { P, S, O } = keyed(ae);
  const payload = Engine.easePayload('apple-default', null, 'Apple Standard');
  assert.equal(payload.native, true);
  const r = ae.call('applyEase', payload);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.mode, 'ease');
  assert.equal(r.props, 3);
  assert.equal(r.segments, 4);
  // Apple Standard = cubic-bezier(0.4, 0, 0.2, 1): out influence 40%, speed 0; in influence 80%, speed 0
  const out = O.keyOutTemporalEase(1)[0], inn = O.keyInTemporalEase(2)[0];
  assert.ok(near(out.influence, 40) && near(out.speed, 0));
  assert.ok(near(inn.influence, 80) && near(inn.speed, 0));
  assert.equal(P.keyOutTemporalEase(1).length, 1, 'spatial = 1 ease');
  assert.equal(S.keyOutTemporalEase(1).length, 2, 'scale = 1 ease per dimension');
  assert.equal(O.keyOutInterpolationType(1), ae.KIT.BEZIER);
  assert.equal(ae.undoDepth(), 0);
});

test('bezier with non-zero start speed maps y1/x1 onto speed', () => {
  const ae = setup(1);
  const { O } = keyed(ae);
  ae.comp.selectedProperties = [O];
  ae.call('applyEase', Engine.easePayload('ios-sheet', null));
  const out = O.keyOutTemporalEase(1)[0];
  // ios-sheet (0.32, 0.72, 0, 1): speed = 0.72/0.32 * 100/1
  assert.ok(near(out.speed, 0.72 / 0.32 * 100, 1e-6));
  assert.ok(near(out.influence, 32));
});

test('only selected keys are eased when keys are selected', () => {
  const ae = setup(1);
  const { P } = keyed(ae);
  ae.comp.selectedProperties = [P];
  P.selectedKeys = [2, 3];
  const r = ae.call('applyEase', Engine.easePayload('apple-default'));
  assert.equal(r.segments, 1);
  assert.equal(P.keys[0].outE, null);
  assert.ok(P.keys[1].outE);
});

test('springs and overshoot curves apply a working expression', () => {
  for (const id of ['spring-bouncy', 'overshoot', 'anticipate']) {
    const ae = setup(1);
    const { O, P } = keyed(ae);
    const payload = Engine.easePayload(id, null, Easing.byId[id].name);
    assert.equal(payload.native, false, id);
    const r = ae.call('applyEase', payload);
    assert.equal(r.ok, true);
    assert.equal(r.mode, 'expression');
    assert.match(O.expression, /^\/\/ AppleFX: /);
    // Evaluate the expression like AE would (JavaScript engine, add/sub/mul helpers).
    const f = Easing.make(id);
    for (const prop of [O, P]) {
      for (const t of [0, 0.1, 0.25, 0.5, 0.9, 1, 1.5, 2.5]) {
        const got = evalExpression(prop, t);
        let want;
        if (t >= prop.keyTime(prop.numKeys) || t < prop.keyTime(1)) want = prop.valueAtTime(t);
        else {
          let k = 1; for (let i = 1; i <= prop.numKeys; i++) if (prop.keyTime(i) <= t) k = i;
          const t0 = prop.keyTime(k), t1 = prop.keyTime(k + 1), e = f((t - t0) / (t1 - t0));
          const a = prop.keyValue(k), b = prop.keyValue(k + 1);
          want = typeof a === 'number' ? a + (b - a) * e : a.map((x, i) => x + (b[i] - x) * e);
        }
        const g = [].concat(got), w = [].concat(want);
        g.forEach((x, i) => assert.ok(near(x, w[i], Math.abs(w[i]) * 2e-3 + 0.05), id + ' t=' + t + ' got ' + x + ' want ' + w[i]));
      }
    }
  }
});

test('native ease clears an old AppleFX expression; Clear removes keys and expressions', () => {
  const ae = setup(1);
  const { O } = keyed(ae);
  ae.comp.selectedProperties = [O];
  ae.call('applyEase', Engine.easePayload('spring-bouncy'));
  assert.ok(O.expression);
  ae.call('applyEase', Engine.easePayload('apple-default'));
  assert.equal(O.expression, '');
  ae.call('applyEase', Engine.easePayload('spring-bouncy'));
  const r = ae.call('resetAnimation');
  assert.equal(r.ok, true);
  assert.equal(O.expression, '');
  assert.equal(O.numKeys, 0);
  assert.equal(O.value, 100);
});

test('easing with nothing keyframed explains what to select', () => {
  const ae = setup(1);
  const r = ae.call('applyEase', Engine.easePayload('apple-default'));
  assert.equal(r.ok, false);
  assert.match(r.error, /Select keyframes/);
  assert.equal(ae.undoDepth(), 0);
});

function evalExpression(prop, time) {
  const helpers = {
    add: (a, b) => (typeof a === 'number' ? a + b : a.map((x, i) => x + b[i])),
    sub: (a, b) => (typeof a === 'number' ? a - b : a.map((x, i) => x - b[i])),
    mul: (a, s) => (typeof a === 'number' ? a * s : a.map((x) => x * s))
  };
  const env = {
    ...helpers, time, value: prop.valueAtTime(time), numKeys: prop.numKeys,
    key: (i) => ({ time: prop.keyTime(i), value: prop.keyValue(i) })
  };
  const body = prop.expression.replace(/out;\s*$/, 'return out;');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(env), body)(...Object.values(env));
}
