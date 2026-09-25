// Premiere Pro host script, run against the simulated Premiere DOM (tests/sim/ppro.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makePPro, Clip, T } = require('./sim/ppro.js');

const js = (f) => path.join(__dirname, '..', 'AppleFX', 'js', f);
const Presets = require(js('presets.js'));
const Engine = require(js('engine.js'));

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const A = (v) => (Array.isArray(v) ? Array.from(v) : v);

function setup() {
  // V1: two neighbouring clips (the second trimmed: in-point 10s), V2: a title
  return makePPro({
    tracks: [
      [new Clip('A.mov', 0, 4, 0), new Clip('B.mov', 4, 8, 10)],
      [new Clip('Title', 1, 5, 0)]
    ]
  });
}
const comp = (clip, name) => clip.components.find((c) => c.displayName === name);

function applyPreset(pp, p, settings) {
  const ctx = pp.call('getContext');
  assert.ok(ctx.ok, ctx.error);
  let clips;
  if (p.kind === 'transition') {
    clips = Engine.transitionRoles(ctx.clips).map((x) => ({ track: x.clip.track, index: x.clip.index, ops: Engine.buildClip(p, settings, x.clip, ctx.fps, x.role) }));
  } else {
    clips = ctx.clips.map((c) => ({ track: c.track, index: c.index, ops: Engine.buildClip(p, settings, c, ctx.fps) }));
  }
  return pp.call('applyPlan', { clips });
}

test('getContext reports selected clips and frame rate', () => {
  const pp = setup();
  const ctx = pp.call('getContext');
  assert.equal(ctx.ok, true);
  assert.equal(ctx.clips.length, 3);
  assert.ok(near(ctx.fps, 30));
  assert.equal(ctx.width, 1920);
});

test('every preset applies to every clip without warnings', () => {
  for (const p of Presets.PRESETS) {
    if (p.kind === 'ease') continue;
    const wheres = p.kind === 'anim' ? ['in', 'out', 'both'] : [undefined];
    for (const where of wheres) {
      for (const mb of [false, true]) {
        const pp = setup();
        const r = applyPreset(pp, p, { where, motionBlur: mb });
        assert.equal(r.ok, true, p.id + ': ' + r.error);
        assert.deepEqual(A(r.warnings), [], p.id + ' ' + where + ' mb=' + mb);
        assert.equal(r.clips, 3);
      }
    }
  }
});

test('keyframes land in media time (in-point offset) and end on the original values', () => {
  const pp = setup();
  applyPreset(pp, Presets.byId['text-fade-up'], { where: 'in', duration: 0.8 });
  const B = pp.tracks[0].clips[1];
  const pos = comp(B, 'Motion').properties[0], op = comp(B, 'Opacity').properties[0];
  const keys = pos.getKeys();
  assert.ok(near(keys[0].seconds, 10), 'first key at the in-point (10s media time)');
  assert.ok(near(keys[keys.length - 1].seconds, 10.8, 1e-6));
  assert.ok(near(A(pos.getValueAtTime(T(10)))[1], 0.5 + 0.05));
  assert.deepEqual(A(pos.getValueAtTime(T(10.8))), [0.5, 0.5]);
  assert.equal(op.getValueAtTime(T(10)), 0);
  assert.equal(op.getValueAtTime(T(11)), 100);
});

test('transition with motion blur uses the Transform effect with a shutter angle', () => {
  const pp = setup();
  pp.tracks[1].clips[0].selected = false;
  const r = applyPreset(pp, Presets.byId['tr-push-left'], { motionBlur: true, duration: 0.5 });
  assert.deepEqual(A(r.warnings), []);
  const [a, b] = pp.tracks[0].clips;
  const ta = comp(a, 'Transform'), tb = comp(b, 'Transform');
  assert.ok(ta && tb);
  assert.equal(ta.properties[9].getValue(), false);
  assert.equal(ta.properties[10].getValue(), 180);
  assert.ok(near(A(ta.properties[1].getValueAtTime(T(4 - 1 / 30)))[0], 0.5 - 1, 0.01));
  assert.ok(near(A(tb.properties[1].getValueAtTime(T(10)))[0], 0.5 + 1, 0.01));
  assert.equal(comp(a, 'Motion').properties[0].isTimeVarying(), false, 'Motion left alone');
});

test('effects are reused on re-apply and styles do not compound', () => {
  const pp = setup();
  applyPreset(pp, Presets.byId['st-pip-tr'], {});
  applyPreset(pp, Presets.byId['st-pip-tr'], {});
  const a = pp.tracks[0].clips[0];
  assert.equal(a.components.filter((c) => c.displayName === 'Transform').length, 1);
  assert.equal(a.components.filter((c) => c.displayName === 'Drop Shadow').length, 1);
  const t = comp(a, 'Transform');
  assert.equal(t.properties[3].getValue(), 30);
  assert.ok(near(A(t.properties[1].getValue())[0], 0.5 + 0.32));
  assert.ok(near(comp(a, 'Drop Shadow').properties[1].getValue(), 55 * 2.55, 0.01));
  assert.ok(a.components.indexOf(comp(a, 'Transform')) < a.components.indexOf(comp(a, 'Drop Shadow')), 'Transform renders before the shadow');
});

test('easing: existing keyframes are re-timed with the curve', () => {
  const pp = setup();
  const a = pp.tracks[0].clips[0], scale = comp(a, 'Motion').properties[1];
  scale.setTimeVarying(true);
  scale.addKey(T(0)); scale.setValueAtKey(T(0), 50);
  scale.addKey(T(1)); scale.setValueAtKey(T(1), 100);
  const kf = pp.call('getKeyframes');
  assert.equal(kf.ok, true);
  const mine = kf.clips.find((c) => c.track === 0 && c.index === 0);
  assert.equal(mine.params.length, 1);
  const clips = [{ track: 0, index: 0, ops: Engine.bakeExisting(mine.params, { curve: 'apple-default' }, kf.fps) }];
  const r = pp.call('applyPlan', { clips });
  assert.deepEqual(A(r.warnings), []);
  assert.equal(scale.getValueAtTime(T(0)), 50);
  assert.equal(scale.getValueAtTime(T(1)), 100);
  // cubic-bezier(0.4, 0, 0.2, 1) at 50% time is ~77% of the way
  assert.ok(scale.getValueAtTime(T(0.5)) > 85, String(scale.getValueAtTime(T(0.5))));
  assert.ok(scale.getKeys().length > 2);
});

test('clear removes Motion/Opacity keyframes', () => {
  const pp = setup();
  applyPreset(pp, Presets.byId['text-fade-up'], { where: 'in' });
  const r = pp.call('resetAnimation');
  assert.equal(r.ok, true);
  const a = pp.tracks[0].clips[0];
  assert.equal(comp(a, 'Motion').properties[0].isTimeVarying(), false);
  assert.equal(comp(a, 'Opacity').properties[0].getValue(), 100);
});

test('no sequence gives a clear error', () => {
  const pp = setup();
  pp.app.project.activeSequence = null;
  const r = pp.call('getContext');
  assert.equal(r.ok, false);
  assert.match(r.error, /sequence/i);
});
