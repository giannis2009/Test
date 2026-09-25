/*
 * AppleFX - After Effects host script (ExtendScript, ES3).
 *
 * Same public API as host.jsx (Premiere Pro), plus applyEase():
 *   - bezier curves inside 0..1 become real keyframe ease (Graph Editor)
 *   - springs / overshoot / anticipate become an expression on the property
 * Presets are baked into keyframes on the layer's Transform, effects and a
 * crop mask. Every call is one undo step.
 *
 * All public functions return a JSON string: { ok: true, ... } or { ok: false, error }.
 */

var AppleFX = (function () {
  var REF_W = 1920;

  // ------------------------------------------------------------ JSON out
  function quote(s) {
    return '"' + String(s).replace(/[\\"\u0000-\u001f\u2028\u2029]/g, function (c) {
      var m = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
      if (m[c]) return m[c];
      return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    }) + '"';
  }
  function str(v) {
    var t = typeof v, i, out, k;
    if (v === null || v === undefined) return 'null';
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return quote(v);
    if (t === 'object' && typeof v.length === 'number' && !(v instanceof String)) {
      out = [];
      for (i = 0; i < v.length; i++) out.push(str(v[i]));
      return '[' + out.join(',') + ']';
    }
    if (t === 'object') {
      out = [];
      for (k in v) if (v.hasOwnProperty(k) && typeof v[k] !== 'function') out.push(quote(k) + ':' + str(v[k]));
      return '{' + out.join(',') + '}';
    }
    return 'null';
  }
  function ok(data) { data = data || {}; data.ok = true; return str(data); }
  function fail(e) {
    var msg = (e && e.message) ? e.message : String(e);
    if (e && e.line) msg += ' (line ' + e.line + ')';
    return str({ ok: false, error: msg });
  }

  // ------------------------------------------------------------ comp / layers
  function activeComp() {
    var c = app.project ? app.project.activeItem : null;
    if (!c || !(c instanceof CompItem)) throw new Error('Open a composition first.');
    return c;
  }
  function selectedLayers(c) {
    var src = c.selectedLayers, out = [], i;
    for (i = 0; i < src.length; i++) out.push(src[i]);
    out.sort(function (a, b) { return (a.inPoint - b.inPoint) || (a.index - b.index); });
    return out;
  }
  function transform(L) { return L.property('ADBE Transform Group'); }

  // ------------------------------------------------------------ keyframe helpers
  function removeRange(prop, a, b) {
    for (var k = prop.numKeys; k >= 1; k--) {
      var t = prop.keyTime(k);
      if (t >= a && t <= b) prop.removeKey(k);
    }
  }
  function removeAll(prop) { while (prop.numKeys > 0) prop.removeKey(prop.numKeys); }

  function linearize(prop, times) {
    var L = KeyframeInterpolationType.LINEAR, i, k, z = null;
    if (prop.isSpatial) {
      var v = prop.keyValue(1);
      z = [];
      for (i = 0; i < v.length; i++) z.push(0);
    }
    for (i = 0; i < times.length; i++) {
      try {
        k = prop.nearestKeyIndex(times[i]);
        prop.setInterpolationTypeAtKey(k, L, L);
        if (z) { prop.setSpatialTangentsAtKey(k, z, z); prop.setRovingAtKey(k, false); }
      } catch (e) {}
    }
  }

  // Write op.keys (or op.value) through conv().
  function writeProp(ctx, prop, op, conv) {
    if (!prop) throw new Error('Property not found.');
    if (op.keys) {
      var half = 0.5 / ctx.fps, times = [], vals = [], i;
      if (op.clear) removeRange(prop, ctx.t0 + op.clear[0] - half, ctx.t0 + op.clear[1] + half);
      for (i = 0; i < op.keys.length; i++) {
        times.push(ctx.t0 + op.keys[i][0]);
        vals.push(conv(op.keys[i][1]));
      }
      prop.setValuesAtTimes(times, vals);
      linearize(prop, times);
    } else {
      removeAll(prop);
      prop.setValue(conv(op.value));
    }
  }

  function baseValue(ctx, prop, op) {
    if (!op.keys) return prop.valueAtTime(ctx.t0, true);
    return prop.valueAtTime(ctx.t0 + (op.base || 0), true);
  }

  // ------------------------------------------------------------ transform ops
  function runTransformOp(ctx, op) {
    var T = transform(ctx.layer), W = ctx.comp.width, H = ctx.comp.height;
    if (!T) throw new Error('Layer has no Transform.');
    if (op.t === 'position') {
      var P = T.property('ADBE Position');
      if (P.dimensionsSeparated) {
        var PX = T.property('ADBE Position_0'), PY = T.property('ADBE Position_1');
        var bx = op.mode === 'ident' ? W / 2 : baseValue(ctx, PX, op);
        var by = op.mode === 'ident' ? H / 2 : baseValue(ctx, PY, op);
        writeProp(ctx, PX, op, function (d) { return bx + d[0] * W; });
        writeProp(ctx, PY, op, function (d) { return by + d[1] * H; });
        return;
      }
      var b = baseValue(ctx, P, op);
      var o = op.mode === 'ident' ? [W / 2, H / 2] : [b[0], b[1]];
      writeProp(ctx, P, op, function (d) {
        var v = [o[0] + d[0] * W, o[1] + d[1] * H];
        if (b.length > 2) v.push(b[2]);
        return v;
      });
      return;
    }
    if (op.t === 'scale') {
      var S = T.property('ADBE Scale'), bs = baseValue(ctx, S, op);
      writeProp(ctx, S, op, function (m) {
        var v = [], i;
        for (i = 0; i < bs.length; i++) v.push((op.mode === 'ident' ? 100 : bs[i]) * m);
        return v;
      });
      return;
    }
    if (op.t === 'rotation') {
      var R = T.property('ADBE Rotate Z'), br = op.mode === 'ident' ? 0 : baseValue(ctx, R, op);
      writeProp(ctx, R, op, function (d) { return br + d; });
      return;
    }
    var O = T.property('ADBE Opacity'), bo = op.mode === 'ident' ? 100 : baseValue(ctx, O, op);
    writeProp(ctx, O, op, function (m) { return bo * m; });
  }

  // ------------------------------------------------------------ effects
  var FX = {
    blur: 'ADBE Gaussian Blur 2',
    bright: 'ADBE Brightness & Contrast 2',
    shadow: 'ADBE Drop Shadow',
    bw: 'ADBE Black&White'
  };
  function ensureFx(ctx, key) {
    var parade = ctx.layer.property('ADBE Effect Parade'), match = FX[key], i;
    if (!parade) throw new Error('This layer cannot have effects.');
    for (i = 1; i <= parade.numProperties; i++) {
      if (parade.property(i).matchName === match) return parade.property(i);
    }
    if (!parade.canAddProperty(match)) throw new Error('Effect ' + match + ' is not available.');
    var fx = parade.addProperty(match);
    if (key === 'blur') { try { fx.property('ADBE Gaussian Blur 2-0003').setValue(1); } catch (e) {} }
    return fx;
  }

  function runFxOp(ctx, op) {
    if (op.fx === 'blur') {
      var k = ctx.k;
      return writeProp(ctx, ensureFx(ctx, 'blur').property('ADBE Gaussian Blur 2-0001'), op, function (v) { return v * k; });
    }
    if (op.fx === 'bright') {
      return writeProp(ctx, ensureFx(ctx, 'bright').property('ADBE Brightness & Contrast 2-0001'), op, function (v) { return v; });
    }
    throw new Error('Unknown effect ' + op.fx);
  }

  function runShadow(ctx, op) {
    var fx = ensureFx(ctx, 'shadow'), k = ctx.k;
    try { fx.property('ADBE Drop Shadow-0001').setValue([op.color[0] / 255, op.color[1] / 255, op.color[2] / 255, 1]); } catch (e) {}
    var opa = fx.property('ADBE Drop Shadow-0002');
    // Drop Shadow opacity is stored 0..255 in AE; detect from the current value.
    var scale = opa.value > 100 ? 2.55 : 1;
    removeAll(opa); opa.setValue(op.opacity * scale);
    var dir = fx.property('ADBE Drop Shadow-0003'); removeAll(dir); dir.setValue(op.direction);
    var dis = fx.property('ADBE Drop Shadow-0004'); removeAll(dis); dis.setValue(op.distance * k);
    var sof = fx.property('ADBE Drop Shadow-0005'); removeAll(sof); sof.setValue(op.softness * k);
  }

  // ------------------------------------------------------------ crop (mask)
  function interp(op, t) {
    if (!op) return 0;
    if (!op.keys) return op.value;
    var ks = op.keys, i;
    if (t <= ks[0][0]) return ks[0][1];
    for (i = 1; i < ks.length; i++) {
      if (t <= ks[i][0]) {
        var a = ks[i - 1], b = ks[i], u = (t - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * u;
      }
    }
    return ks[ks.length - 1][1];
  }

  function cropMask(ctx) {
    var masks = ctx.layer.property('ADBE Mask Parade'), i;
    if (!masks) throw new Error('This layer cannot have masks.');
    for (i = 1; i <= masks.numProperties; i++) if (masks.property(i).name === 'AppleFX Crop') return masks.property(i);
    var m = masks.addProperty('ADBE Mask Atom');
    m.name = 'AppleFX Crop';
    try { m.maskMode = MaskMode.ADD; } catch (e) {}
    return m;
  }

  // Crop ops arrive per edge (p0..p3 = left, top, right, bottom in %, p5 = feather px).
  function runCrop(ctx, ops) {
    var edge = [null, null, null, null], feather = null, i, j, times = {}, list = [], animated = false, lo = 1e9, hi = -1e9;
    for (i = 0; i < ops.length; i++) {
      if (ops[i].p === 5) { feather = ops[i]; continue; }
      edge[ops[i].p] = ops[i];
      if (ops[i].keys) {
        animated = true;
        for (j = 0; j < ops[i].keys.length; j++) times[ops[i].keys[j][0]] = true;
        if (ops[i].clear) { lo = Math.min(lo, ops[i].clear[0]); hi = Math.max(hi, ops[i].clear[1]); }
      }
    }
    var mask = cropMask(ctx), shapeProp = mask.property('ADBE Mask Shape');
    var r = ctx.layer.sourceRectAtTime(ctx.layer.inPoint, false);
    function shapeAt(t) {
      var l = r.left + r.width * interp(edge[0], t) / 100, tp = r.top + r.height * interp(edge[1], t) / 100;
      var rt = r.left + r.width * (1 - interp(edge[2], t) / 100), bt = r.top + r.height * (1 - interp(edge[3], t) / 100);
      if (rt < l) rt = l;
      if (bt < tp) bt = tp;
      var s = new Shape();
      s.vertices = [[l, tp], [rt, tp], [rt, bt], [l, bt]];
      s.closed = true;
      return s;
    }
    if (animated) {
      for (var key in times) if (times.hasOwnProperty(key)) list.push(Number(key));
      list.sort(function (a, b) { return a - b; });
      var half = 0.5 / ctx.fps, tt = [], vv = [];
      if (lo <= hi) removeRange(shapeProp, ctx.t0 + lo - half, ctx.t0 + hi + half);
      for (i = 0; i < list.length; i++) { tt.push(ctx.t0 + list[i]); vv.push(shapeAt(list[i])); }
      shapeProp.setValuesAtTimes(tt, vv);
      linearize(shapeProp, tt);
    } else if (edge[0] || edge[1] || edge[2] || edge[3]) {
      removeAll(shapeProp);
      shapeProp.setValue(shapeAt(0));
    }
    if (feather) {
      var f = (feather.value || 0) * ctx.k;
      mask.property('ADBE Mask Feather').setValue([f, f]);
    }
  }

  // ------------------------------------------------------------ plan
  function runOps(ctx, ops, warnings) {
    var crops = [], keys = 0, i, op;
    for (i = 0; i < ops.length; i++) {
      op = ops[i];
      try {
        if (op.keys) keys += op.keys.length;
        if (op.t === 'fx' && op.fx === 'crop') { crops.push(op); continue; }
        switch (op.t) {
          case 'position': case 'scale': case 'rotation': case 'opacity': runTransformOp(ctx, op); break;
          case 'fx': runFxOp(ctx, op); break;
          case 'fxadd': ensureFx(ctx, op.fx); break;
          case 'shadow': runShadow(ctx, op); break;
          case 'shutter':
            ctx.layer.motionBlur = !!op.on;
            if (op.on) ctx.comp.motionBlur = true;
            break;
          default: throw new Error('Unknown op ' + op.t);
        }
      } catch (e) { warnings.push(ctx.layer.name + ': ' + (e.message || e)); }
    }
    if (crops.length) {
      try { runCrop(ctx, crops); } catch (e2) { warnings.push(ctx.layer.name + ': ' + (e2.message || e2)); }
    }
    return keys;
  }

  // ------------------------------------------------------------ public API
  function ping() { return ok({ version: '1.2.0', app: 'aftereffects ' + app.version }); }

  function getContext() {
    try {
      var c = activeComp(), ls = selectedLayers(c), clips = [], i, L;
      for (i = 0; i < ls.length; i++) {
        L = ls[i];
        clips.push({ track: 0, index: i, layer: L.index, name: L.name, start: L.inPoint, end: L.outPoint, dur: L.outPoint - L.inPoint });
      }
      return ok({ sequence: c.name, fps: c.frameRate, width: c.width, height: c.height, clips: clips, host: 'AEFT' });
    } catch (e) { return fail(e); }
  }

  function applyPlan(plan) {
    app.beginUndoGroup('AppleFX');
    try {
      var c = activeComp(), done = 0, keys = 0, warnings = [], i;
      for (i = 0; i < plan.clips.length; i++) {
        var pc = plan.clips[i], L = null;
        try { L = c.layer(pc.layer); } catch (e) { L = null; }
        if (!L) { warnings.push('Layer #' + pc.layer + ' not found.'); continue; }
        var ctx = { comp: c, layer: L, t0: L.inPoint, fps: c.frameRate, k: c.width / REF_W };
        keys += runOps(ctx, pc.ops, warnings);
        done++;
      }
      return ok({ clips: done, keys: keys, warnings: warnings });
    } catch (e2) {
      return fail(e2);
    } finally {
      app.endUndoGroup();
    }
  }

  // ------------------------------------------------------------ easing
  function easeable(prop) {
    if (!prop || prop.propertyType !== PropertyType.PROPERTY || prop.numKeys < 2) return false;
    var t = prop.propertyValueType, V = PropertyValueType;
    return t === V.OneD || t === V.TwoD || t === V.ThreeD || t === V.TwoD_SPATIAL || t === V.ThreeD_SPATIAL;
  }

  function targetProps(c) {
    var out = [], sel = c.selectedProperties, i, j;
    for (i = 0; i < sel.length; i++) if (easeable(sel[i])) out.push(sel[i]);
    if (out.length) return out;
    // Nothing selected in the timeline: fall back to keyframed Transform properties of the selected layers.
    var ls = c.selectedLayers;
    for (i = 0; i < ls.length; i++) {
      var T = transform(ls[i]);
      if (!T) continue;
      for (j = 1; j <= T.numProperties; j++) if (easeable(T.property(j))) out.push(T.property(j));
    }
    return out;
  }

  function clampInfl(v) { return Math.max(0.1, Math.min(100, v)); }

  function easeSegment(prop, a, b, bz) {
    if (prop.keyOutInterpolationType(a) === KeyframeInterpolationType.HOLD) return false;
    var dt = prop.keyTime(b) - prop.keyTime(a);
    if (dt <= 0) return false;
    var v0 = prop.keyValue(a), v1 = prop.keyValue(b), deltas = [], i;
    if (prop.isSpatial) {
      var s = 0;
      for (i = 0; i < v0.length; i++) s += (v1[i] - v0[i]) * (v1[i] - v0[i]);
      deltas.push(Math.sqrt(s));
    } else if (typeof v0 === 'number') deltas.push(v1 - v0);
    else for (i = 0; i < v0.length; i++) deltas.push(v1[i] - v0[i]);

    var x1 = Math.max(bz[0], 0.001), y1 = bz[1], x2 = Math.min(bz[2], 0.999), y2 = bz[3];
    var outE = [], inE = [];
    for (i = 0; i < deltas.length; i++) {
      var rate = deltas[i] / dt;
      outE.push(new KeyframeEase(y1 / x1 * rate, clampInfl(x1 * 100)));
      inE.push(new KeyframeEase((1 - y2) / (1 - x2) * rate, clampInfl((1 - x2) * 100)));
    }
    var B = KeyframeInterpolationType.BEZIER;
    prop.setInterpolationTypeAtKey(a, prop.keyInInterpolationType(a), B);
    prop.setInterpolationTypeAtKey(b, B, prop.keyOutInterpolationType(b));
    prop.setTemporalEaseAtKey(a, prop.keyInTemporalEase(a), outE);
    prop.setTemporalEaseAtKey(b, inE, prop.keyOutTemporalEase(b));
    return true;
  }

  function expressionFor(name, table) {
    return [
      '// AppleFX: ' + name,
      'var T = [' + table.join(',') + '];',
      'function ease(p) { if (p <= 0) return 0; if (p >= 1) return 1; var i = p * (T.length - 1), a = Math.floor(i); return T[a] + (T[a + 1] - T[a]) * (i - a); }',
      'var out = value;',
      'if (numKeys > 1) {',
      '  var k = 0;',
      '  for (var i = 1; i <= numKeys; i++) if (key(i).time <= time) k = i;',
      '  if (k > 0 && k < numKeys) {',
      '    var t0 = key(k).time, t1 = key(k + 1).time;',
      '    out = add(key(k).value, mul(sub(key(k + 1).value, key(k).value), ease((time - t0) / (t1 - t0))));',
      '  }',
      '}',
      'out;'
    ].join('\n');
  }

  // payload: { name, native, bezier: [x1,y1,x2,y2] | null, table: [..] }
  function applyEase(payload) {
    app.beginUndoGroup('AppleFX Ease');
    try {
      var c = activeComp(), props = targetProps(c), segs = 0, n = 0, i, j;
      if (!props.length) throw new Error('Select keyframes (or a keyframed property) in the timeline first.');
      for (i = 0; i < props.length; i++) {
        var prop = props[i];
        if (payload.native) {
          var ks = prop.selectedKeys, list = [];
          if (!ks || ks.length < 2) { for (j = 1; j <= prop.numKeys; j++) list.push(j); } else list = ks.slice(0);
          list.sort(function (a, b) { return a - b; });
          for (j = 0; j + 1 < list.length; j++) {
            if (list[j + 1] === list[j] + 1 && easeSegment(prop, list[j], list[j + 1], payload.bezier)) segs++;
          }
          // An old AppleFX expression would override the new ease.
          if (prop.expression && prop.expression.indexOf('// AppleFX') === 0) prop.expression = '';
        } else {
          if (!prop.canSetExpression) continue;
          prop.expression = expressionFor(payload.name, payload.table);
          prop.expressionEnabled = true;
        }
        n++;
      }
      return ok({ props: n, segments: segs, mode: payload.native ? 'ease' : 'expression' });
    } catch (e) {
      return fail(e);
    } finally {
      app.endUndoGroup();
    }
  }

  function getKeyframes() { return fail('getKeyframes is Premiere-only; use applyEase in After Effects.'); }

  // Remove keyframes (and AppleFX expressions) from the Transform of the selected layers.
  function resetAnimation() {
    app.beginUndoGroup('AppleFX Clear');
    try {
      var c = activeComp(), ls = selectedLayers(c), n = 0, i, j;
      var names = ['ADBE Position', 'ADBE Position_0', 'ADBE Position_1', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity'];
      for (i = 0; i < ls.length; i++) {
        var L = ls[i], T = transform(L), mid = (L.inPoint + L.outPoint) / 2;
        if (!T) continue;
        for (j = 0; j < names.length; j++) {
          var p = T.property(names[j]);
          if (!p) continue;
          try {
            if (p.expression && p.expression.indexOf('// AppleFX') === 0) { p.expression = ''; n++; }
            if (p.numKeys > 0) {
              var v = names[j] === 'ADBE Opacity' ? 100 : p.valueAtTime(mid, true);
              removeAll(p);
              p.setValue(v);
              n++;
            }
          } catch (e) {}
        }
      }
      return ok({ clips: ls.length, params: n });
    } catch (e2) {
      return fail(e2);
    } finally {
      app.endUndoGroup();
    }
  }

  return {
    ping: ping,
    getContext: getContext,
    applyPlan: applyPlan,
    applyEase: applyEase,
    getKeyframes: getKeyframes,
    resetAnimation: resetAnimation
  };
})();
