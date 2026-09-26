/*
 * AppleFX — animation engine.
 *
 * Turns a preset + user settings into a list of "ops" (keyframe tracks and
 * static values) that jsx/host.jsx writes into Premiere Pro. Premiere's
 * scripting API cannot set custom bezier handles, so curves and springs are
 * baked: the curve is sampled per frame and then simplified (Ramer–Douglas–
 * Peucker) so only the keyframes needed to reproduce it within a sub-pixel
 * tolerance are kept. The same functions drive the panel's live preview, so
 * what you see is what gets applied.
 */
(function (root) {
  'use strict';

  var Easing = (root.AFX && root.AFX.Easing) || require('./easing.js');
  var clamp = Easing.clamp;

  var CHANNELS = ['tx', 'ty', 's', 'r', 'o', 'blur', 'cl', 'ct', 'cr', 'cb', 'bright'];
  var IDENT = { tx: 0, ty: 0, s: 1, r: 0, o: 1, blur: 0, cl: 0, ct: 0, cr: 0, cb: 0, bright: 0 };
  var LIMITS = {
    o: [0, 1], blur: [0, 1000], s: [0, 100],
    cl: [0, 100], ct: [0, 100], cr: [0, 100], cb: [0, 100], bright: [-150, 150]
  };
  // Simplification tolerance per target (in the target's own units).
  var TOL = { position: 0.00015, scale: 0.0004, rotation: 0.02, opacity: 0.002, blur: 0.15, crop: 0.05, bright: 0.2, param: 0 };

  var fadeIn = Easing.cubicBezier(0, 0, 0.58, 1);
  var fadeOut = Easing.cubicBezier(0.42, 0, 1, 1);
  var rampEase = Easing.cubicBezier(0.4, 0, 0.6, 1);

  function copy(o) { var r = {}, k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }

  // Expand sugar ("crop": [l,t,r,b]) into channels.
  function expand(partial) {
    var out = {}, k;
    if (!partial) return out;
    for (k in partial) {
      if (k === 'crop') {
        out.cl = partial.crop[0]; out.ct = partial.crop[1]; out.cr = partial.crop[2]; out.cb = partial.crop[3];
      } else out[k] = partial[k];
    }
    return out;
  }

  function withDefaults(partial, base) {
    var st = copy(base || IDENT), k;
    for (k in partial) st[k] = partial[k];
    return st;
  }

  function limit(st) {
    for (var k in LIMITS) if (st[k] !== undefined) st[k] = clamp(st[k], LIMITS[k][0], LIMITS[k][1]);
    return st;
  }

  function settingsFor(preset, settings) {
    var s = copy(preset.defaults || {}), k;
    if (settings) for (k in settings) if (settings[k] !== undefined && settings[k] !== null) s[k] = settings[k];
    return s;
  }

  // Edited curve values (bezier handles or [response, damping]) from the panel.
  function curveValues(s) { return s.edit || null; }

  // Scale a "from" state's distance from rest by k (intensity); opacity and crop are left alone.
  function scaleState(st, rest, k, onlyBlur) {
    var out = copy(st), ch;
    for (ch in st) {
      if (ch === 'o' || ch === 'cl' || ch === 'ct' || ch === 'cr' || ch === 'cb') continue;
      if (onlyBlur && ch !== 'blur' && ch !== 'bright') continue;
      out[ch] = rest[ch] + (st[ch] - rest[ch]) * k;
    }
    return out;
  }

  /* Resolve a preset with settings into concrete states and curves. */
  function resolve(preset, settings) {
    var s = settingsFor(preset, settings);
    var k = (s.intensity === undefined ? 100 : s.intensity) / 100;
    var restPartial = expand(preset.rest);
    if (preset.cat === 'glass') {
      if (s.blur !== undefined) restPartial.blur = s.blur;
      if (s.tint !== undefined) restPartial.bright = s.tint;
    }
    var rest = withDefaults(restPartial);
    var r = {
      preset: preset, settings: s, rest: rest,
      curveIn: Easing.make(s.curve || 'apple-default', curveValues(s)),
      curveOut: Easing.makeExit(s.curve || 'apple-default', curveValues(s)),
      duration: Math.max(0.05, +s.duration || 0.8),
      shadow: null, bw: !!preset.bw, feather: preset.feather || 0
    };
    if (preset.kind === 'transition') {
      r.from = scaleState(withDefaults(expand(preset.enter), rest), rest, k, true);
      r.to = scaleState(withDefaults(expand(preset.exit), rest), rest, k, true);
    } else if (preset.from) {
      r.from = scaleState(withDefaults(expand(preset.from), rest), rest, k);
      r.to = preset.to ? scaleState(withDefaults(expand(preset.to), rest), rest, k) : r.from;
    }
    if (preset.shadow) {
      var f = (s.shadow === undefined ? 60 : s.shadow) / 60;
      if (f > 0) {
        r.shadow = copy(preset.shadow);
        r.shadow.opacity = clamp(preset.shadow.opacity * f, 0, 100);
        r.shadow.softness = preset.shadow.softness * Math.max(0.3, f);
      }
    }
    return r;
  }

  function lerpState(a, b, e, eo) {
    var st = {}, i, ch;
    for (i = 0; i < CHANNELS.length; i++) {
      ch = CHANNELS[i];
      var t = ch === 'o' ? eo : e;
      st[ch] = a[ch] + (b[ch] - a[ch]) * t;
    }
    return limit(st);
  }

  // Entrance: from -> rest.
  function stateIn(r, p) {
    p = clamp(p, 0, 1);
    return lerpState(r.from, r.rest, r.curveIn(p), fadeIn(clamp(p / 0.55, 0, 1)));
  }
  // Exit: rest -> to.
  function stateOut(r, p) {
    p = clamp(p, 0, 1);
    return lerpState(r.rest, r.to, r.curveOut(p), fadeOut(clamp((p - 0.45) / 0.55, 0, 1)));
  }

  // Smooth deterministic 1D value noise in [-1, 1].
  function hash(i, seed) {
    var x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }
  function noise(x, seed) {
    var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
  }
  function fbm(x, seed) { return (noise(x, seed) * 0.7 + noise(x * 2.3, seed + 17) * 0.3) / 1.0; }

  // Loop state at time t (seconds) for a clip of length dur.
  function stateLoop(r, t, dur, seed) {
    var st = copy(r.rest), lp = r.preset.loop || {}, ch;
    var k = (r.settings.intensity === undefined ? 100 : r.settings.intensity) / 100;
    var speed = Math.max(0.05, (r.settings.speed === undefined ? 100 : r.settings.speed) / 100);
    for (ch in lp) {
      var d = lp[ch], period = (d.period || 1) / speed, v = 0;
      if (d.type === 'sin') v = d.amp * k * Math.sin(2 * Math.PI * t / period + (d.phase || 0));
      else if (d.type === 'cos') v = d.amp * k * Math.cos(2 * Math.PI * t / period + (d.phase || 0));
      else if (d.type === 'noise') v = d.amp * k * fbm(t / period, (seed || 0) * 13 + CHANNELS.indexOf(ch) * 7 + 1);
      else if (d.type === 'pulse') v = -d.amp * k * (0.5 - 0.5 * Math.cos(2 * Math.PI * t / period));
      else if (d.type === 'ramp') {
        var id = IDENT[ch], a = id + (d.a - id) * k, b = id + (d.b - id) * k;
        v = a + (b - a) * rampEase(dur > 0 ? clamp(t / dur, 0, 1) : 0) - id;
      }
      st[ch] = st[ch] + v;
    }
    return limit(st);
  }

  // Sample fn(p) over n frame steps starting at t0.
  function sampleSegment(fn, t0, d, fps, step) {
    var frames = Math.max(1, Math.round(d * fps)), out = [], i;
    step = Math.max(1, step || 1);
    for (i = 0; i <= frames; i += step) out.push({ t: t0 + i / fps, st: fn(i / frames) });
    if ((frames % step) !== 0) out.push({ t: t0 + frames / fps, st: fn(1) });
    return out;
  }

  // Ramer–Douglas–Peucker for keyframes [[t, v]] where v is a number or an array.
  function simplify(keys, tol) {
    if (keys.length <= 2 || !(tol > 0)) return keys;
    function dist(a, b, c) {
      var u = (b[0] - a[0]) / (c[0] - a[0]), va = a[1], vb = b[1], vc = c[1];
      if (typeof va === 'number') return Math.abs(vb - (va + (vc - va) * u));
      var m = 0;
      for (var i = 0; i < va.length; i++) m = Math.max(m, Math.abs(vb[i] - (va[i] + (vc[i] - va[i]) * u)));
      return m;
    }
    var keep = new Array(keys.length), stack = [[0, keys.length - 1]];
    keep[0] = keep[keys.length - 1] = true;
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], c = seg[1], best = -1, bi = -1;
      for (var i = a + 1; i < c; i++) {
        var dd = dist(keys[a], keys[i], keys[c]);
        if (dd > best) { best = dd; bi = i; }
      }
      if (best > tol) { keep[bi] = true; stack.push([a, bi], [bi, c]); }
    }
    return keys.filter(function (k, i) { return keep[i]; });
  }

  function round(v, n) { var m = Math.pow(10, n); return Math.round(v * m) / m; }
  function rt(t) { return round(t, 6); }

  function varies(samples, ch) {
    var a = samples[0].st[ch], i;
    for (i = 1; i < samples.length; i++) if (Math.abs(samples[i].st[ch] - a) > 1e-6) return true;
    return false;
  }

  /*
   * Convert sampled states into host ops.
   * seg: { samples, clear:[t0,t1], base: t, ref: state the host's current value represents,
   *        via: 'motion'|'transform', smart: bool, staticMode: bool }
   */
  function opsFromSamples(seg) {
    var ops = [], S = seg.samples, ref = seg.ref, via = seg.via, smart = seg.smart !== false;
    function tol(name) { return smart ? TOL[name] : 0; }
    function track(fn) { return S.map(function (x) { return [rt(x.t), fn(x.st)]; }); }
    function active(chs) {
      for (var i = 0; i < chs.length; i++) {
        var ch = chs[i];
        if (varies(S, ch) || Math.abs(S[0].st[ch] - ref[ch]) > 1e-6) return true;
      }
      return false;
    }
    function add(op, keysFn, tolName) {
      if (seg.staticMode) { op.value = keysFn(S[S.length - 1].st); op.mode = 'ident'; }
      else { op.keys = simplify(track(keysFn), tol(tolName)); op.clear = seg.clear; op.base = rt(seg.base); }
      ops.push(op);
    }
    // Static mode writes absolute looks relative to identity, so re-applying never compounds.
    var R = seg.staticMode ? IDENT : ref;

    if (active(['tx', 'ty'])) add({ t: 'position', via: via, mode: 'offset' }, function (st) { return [round(st.tx - R.tx, 6), round(st.ty - R.ty, 6)]; }, 'position');
    if (active(['s'])) add({ t: 'scale', via: via, mode: 'mul' }, function (st) { return round(st.s / (R.s || 1), 6); }, 'scale');
    if (active(['r'])) add({ t: 'rotation', via: via, mode: 'add' }, function (st) { return round(st.r - R.r, 4); }, 'rotation');
    if (active(['o'])) add({ t: 'opacity', via: via, mode: 'mul' }, function (st) { return round(st.o / (R.o || 1), 5); }, 'opacity');
    // Effect channels are absolute values on effects AppleFX owns.
    // A constant non-zero value inside an animated segment is still written as keyframes,
    // so the "out" half of an in+out animation never wipes the "in" half's keys.
    [
      { fx: 'blur', p: 0, ch: 'blur', tol: 'blur', dp: 2 },
      { fx: 'crop', p: 0, ch: 'cl', tol: 'crop', dp: 3 },
      { fx: 'crop', p: 1, ch: 'ct', tol: 'crop', dp: 3 },
      { fx: 'crop', p: 2, ch: 'cr', tol: 'crop', dp: 3 },
      { fx: 'crop', p: 3, ch: 'cb', tol: 'crop', dp: 3 },
      { fx: 'bright', p: 0, ch: 'bright', tol: 'bright', dp: 2 }
    ].forEach(function (e) {
      if (!varies(S, e.ch) && Math.abs(S[0].st[e.ch]) < 1e-6) return;
      var op = { t: 'fx', fx: e.fx, p: e.p };
      if (seg.staticMode) op.value = round(S[S.length - 1].st[e.ch], e.dp);
      else { op.keys = simplify(track(function (st) { return round(st[e.ch], e.dp); }), tol(e.tol)); op.clear = seg.clear; }
      ops.push(op);
    });
    return ops;
  }

  // Order ops so effects get created in a sensible render order:
  // look (bw/bright) -> blur -> crop -> transform -> drop shadow.
  var ORDER = { bw: 0, bright: 1, blur: 2, crop: 3, transform: 4, shadow: 5 };
  function opRank(op) {
    if (op.t === 'fx') return ORDER[op.fx];
    if (op.t === 'fxadd') return ORDER[op.fx];
    if (op.t === 'shadow') return ORDER.shadow;
    if (op.t === 'shutter') return ORDER.transform;
    if (op.via === 'transform') return ORDER.transform;
    return -1; // Motion / Opacity are intrinsic, order does not matter
  }
  function sortOps(ops) {
    return ops.map(function (o, i) { return [opRank(o), i, o]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; })
      .map(function (x) { return x[2]; });
  }

  function extras(r, ops, via) {
    if (r.bw) ops.push({ t: 'fxadd', fx: 'bw' });
    if (r.feather) ops.push({ t: 'fx', fx: 'crop', p: 5, value: r.feather });
    if (r.shadow) ops.push({ t: 'shadow', opacity: round(r.shadow.opacity, 1), distance: r.shadow.distance, softness: round(r.shadow.softness, 1), direction: r.shadow.direction, color: [0, 0, 0] });
    var usesTransform = ops.some(function (o) { return o.via === 'transform'; });
    if (via === 'transform' && usesTransform) ops.push({ t: 'shutter', on: !!r.settings.motionBlur, angle: 180 });
  }

  function viaFor(r) {
    // Drop shadows render before Motion, so anything with a shadow is moved with the
    // Transform effect (placed above the shadow). Transform also gives real motion blur.
    return (r.shadow || r.settings.motionBlur) ? 'transform' : 'motion';
  }

  function frameTimes(clip, fps) {
    var frames = Math.max(1, Math.round(clip.dur * fps));
    return { frames: frames, last: (frames - 1) / fps };
  }

  /*
   * Build ops for one clip.
   * clip: { dur, index }  role (transitions only): { in: bool, out: bool }
   */
  function buildClip(preset, settings, clip, fps, role) {
    var r = resolve(preset, settings), s = r.settings, via = viaFor(r);
    var smart = s.density !== 'full', ops = [], ft = frameTimes(clip, fps);

    if (preset.kind === 'static') {
      ops = opsFromSamples({ samples: [{ t: 0, st: r.rest }], ref: IDENT, via: via, staticMode: true });
      extras(r, ops, via);
      return sortOps(ops);
    }

    if (preset.kind === 'loop') {
      var seed = (clip.index || 0) + 1;
      var samples = sampleSegment(function (p) { return stateLoop(r, p * ft.last, clip.dur, seed); }, 0, ft.last, fps, 1);
      ops = opsFromSamples({ samples: samples, clear: [0, ft.last], base: 0, ref: IDENT, via: via, smart: smart });
      extras(r, ops, via);
      return sortOps(ops);
    }

    // anim / transition
    var doIn, doOut;
    if (preset.kind === 'transition') { doIn = !!role.in; doOut = !!role.out; }
    else { var w = s.where || 'in'; doIn = w === 'in' || w === 'both'; doOut = w === 'out' || w === 'both'; }
    var d = r.duration, avail = ft.last;
    var need = (doIn ? d : 0) + (doOut ? d : 0);
    if (need > avail && need > 0) d = d * avail / need * 0.98;
    d = Math.max(1 / fps, Math.round(d * fps) / fps);

    if (doIn) {
      ops = ops.concat(opsFromSamples({
        samples: sampleSegment(function (p) { return stateIn(r, p); }, 0, d, fps, 1),
        clear: [0, d], base: d, ref: r.rest, via: via, smart: smart
      }));
    }
    if (doOut) {
      var t0 = Math.max(0, ft.last - d);
      ops = ops.concat(opsFromSamples({
        samples: sampleSegment(function (p) { return stateOut(r, p); }, t0, ft.last - t0, fps, 1),
        clear: [t0, ft.last], base: t0, ref: r.rest, via: via, smart: smart
      }));
    }
    extras(r, ops, via);
    return sortOps(ops);
  }

  /*
   * Bake an easing curve between existing keyframes.
   * params: [{ ci, pi, keys: [[t, v], ...] }] from the host.
   */
  function bakeExisting(params, settings, fps) {
    var s = settingsFor({ defaults: {} }, settings);
    var f = Easing.make(s.curve || 'apple-default', curveValues(s));
    var minGap = Math.max(1, s.minGap || 3), smart = s.density !== 'full', ops = [];
    params.forEach(function (prm) {
      var keys = prm.keys;
      for (var i = 0; i + 1 < keys.length; i++) {
        var t0 = keys[i][0], t1 = keys[i + 1][0], v0 = keys[i][1], v1 = keys[i + 1][1];
        if ((t1 - t0) * fps < minGap - 1e-6) continue;
        var isArr = typeof v0 !== 'number';
        if (!isArr && v0 === v1) continue;
        if (isArr && v0.every(function (x, j) { return x === v1[j]; })) continue;
        var smp = sampleSegment(function (p) {
          var e = f(p);
          return isArr ? v0.map(function (x, j) { return x + (v1[j] - x) * e; }) : v0 + (v1 - v0) * e;
        }, t0, t1 - t0, fps, 1);
        var span = isArr ? Math.max.apply(null, v0.map(function (x, j) { return Math.abs(v1[j] - x); })) : Math.abs(v1 - v0);
        var kk = smp.map(function (x) { return [rt(x.t), x.st]; });
        kk[0][1] = v0; kk[kk.length - 1][1] = v1;
        ops.push({ t: 'param', ci: prm.ci, pi: prm.pi, clear: [t0, t1], keys: smart ? simplify(kk, span * 0.0015) : kk });
      }
    });
    return ops;
  }

  /*
   * Work out transition roles for the selected clips.
   * clips: [{ track, index, ... }]  ->  [{ clip, role:{in,out} }]
   */
  function transitionRoles(clips) {
    var set = {};
    clips.forEach(function (c) { set[c.track + ':' + c.index] = true; });
    return clips.map(function (c) {
      var prev = set[c.track + ':' + (c.index - 1)], next = set[c.track + ':' + (c.index + 1)];
      if (!prev && !next) return { clip: c, role: { in: true, out: true } };
      return { clip: c, role: { in: !!prev, out: !!next } };
    });
  }

  /*
   * After Effects easing payload. Bezier curves that stay inside 0..1 become real
   * keyframe ease; springs and overshooting curves are sent as a sampled table
   * that host_ae.jsx turns into an expression.
   */
  function easePayload(curveId, edit, name) {
    var def = Easing.byId[curveId] || Easing.byId['apple-default'];
    var v = (edit && edit.length === def.v.length) ? edit : def.v;
    var f = Easing.make(def.id, edit), table = [], i;
    for (i = 0; i <= 200; i++) table.push(round(f(i / 200), 5));
    var native = def.type === 'bezier' && v[1] >= 0 && v[1] <= 1 && v[3] >= 0 && v[3] <= 1;
    return { name: name || def.name, native: native, bezier: def.type === 'bezier' ? v.slice() : null, table: table };
  }

  var api = {
    easePayload: easePayload,
    CHANNELS: CHANNELS, IDENT: IDENT,
    resolve: resolve, stateIn: stateIn, stateOut: stateOut, stateLoop: stateLoop,
    buildClip: buildClip, bakeExisting: bakeExisting, transitionRoles: transitionRoles,
    simplify: simplify, sampleSegment: sampleSegment, settingsFor: settingsFor, viaFor: viaFor
  };
  root.AFX = root.AFX || {};
  root.AFX.Engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
